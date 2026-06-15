# Multi-user Reddit ingestion — setup

Lets any signed-in user connect their **own** Reddit account by pasting their
browser cookie, sync their saved posts, and watch progress — all scoped to their
`user_id` (existing RLS already isolates content per user). **No Reddit API app
is required** (Reddit gated self-serve app creation behind manual approval in
2026); the user pastes the same kind of cookie the single-tenant pipeline uses.
Instagram works the same way and is a fast follow.

## Architecture
```
Web /connections (paste cookie) → API POST /api/connections/reddit/credential
  → API verifies the cookie (one live saved-posts fetch), then AES-GCM encrypts
    it into connection_secrets (service role; RLS deny-all)
Web → POST /api/sync-jobs (status=pending, RLS owner-insert)
  → Render WORKER polls sync_jobs (claim_sync_job) → runs the per-user pipeline
    (isolated /tmp dir, every read/upsert/prune scoped to the user) → updates phase/counts
  → Web SyncProgress (Supabase Realtime + polling) shows live progress
```

Spans both repos: **SavedPosts** (schema, per-user pipeline, worker) and **Trove**
(API credential + sync-jobs routes, web UI).

## Security model
- The credential is a live browser session cookie = full account access. It is
  **AES-GCM encrypted at rest** in `connection_secrets`, whose RLS is **enabled
  with zero policies** → only the worker's service role can read it. It never
  goes back to the client.
- This is each user accessing **their own** saved data with **their own**
  session (self-extracted cookie) — no password storage, no automated login.
- Cross-user safety: the worker runs `sync_to_supabase --reddit-only`, which
  scopes every prune-candidate read + delete to `TROVE_USER_ID` and runs in an
  isolated `/tmp/trove/<user_id>` data dir.
- A cookie is more sensitive and more fragile than an OAuth grant: it expires
  and may be invalidated when used from a new IP. Fine for a small, trusted user
  base; **not** something to open to the public.

## Manual setup (one-time)

### 1. Database
Run `SavedPosts/db/migrate_reddit_ingestion.sql` in the Supabase SQL editor
(prod + staging). *(Already applied during implementation.)* Creates
`connections`, `connection_secrets` (RLS deny-all), `sync_jobs`, and the
`claim_sync_job()` RPC. The `connection_secrets.refresh_token_enc` column is
reused as a generic encrypted-credential blob (it holds the cookie now).

### 2. Shared encryption key
```
openssl rand -base64 32
```
Use this **same value** for `REDDIT_TOKEN_ENC_KEY` on **both** the API and the
worker (API encrypts the cookie, worker decrypts it).

### 3. API env (Render — `trove-api`)
Set `REDDIT_TOKEN_ENC_KEY`. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set (the
credential route writes via the service role). *(No Reddit client id/secret or
redirect URI — those are gone with OAuth.)*

### 4. Worker (Render — new service)
Create a Blueprint service from `SavedPosts/render.yaml` (`trove-sync-worker`,
`plan: starter`). Set its `sync:false` env:
- `SUPABASE_URL`, `SUPABASE_KEY` (**service role**)
- `REDDIT_TOKEN_ENC_KEY` (same value as the API)
- LLM keys: `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`,
  `SAMBANOVA_API_KEY`, `OPENROUTER_API_KEY`

## How a user connects (in-app)
1. Open `/connections` → **Reddit** → expand "How do I get my Reddit cookie?".
2. On reddit.com (logged in), DevTools → Network → copy the `cookie:` request
   header value → paste it with your username → **Connect & sync**.
3. The API verifies the cookie with one live fetch before saving; a sync starts.

## Verify end-to-end
1. As a **second (non-owner)** account, paste a valid Reddit cookie → it
   verifies, `connections` row appears, a sync starts.
2. `SyncProgress` advances fetch → comments → classify → analyze → save → done.
3. That account now sees **its own** Reddit content; the owner's content is
   unchanged (compare owner row counts before/after — no cross-user prune).
4. `connection_secrets` is unreadable by a user JWT (only the worker's service
   role can read it); worker logs contain no cookie.
5. Paste a bad/expired cookie → the API rejects it at save time; an expired
   cookie discovered mid-sync marks the connection `revoked` with a re-paste prompt.
