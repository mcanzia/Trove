# Multi-user Reddit ingestion — setup

Lets any signed-in user connect their **own** Reddit account, sync their saved
posts, and watch progress — all scoped to their `user_id` (existing RLS already
isolates content per user). Instagram is deferred (no API for saved posts).

## Architecture
```
Web /connections → API POST /api/connections/reddit/start → Reddit OAuth
  → API GET /auth/reddit/callback (service role): store encrypted refresh token
Web (on return) → POST /api/sync-jobs (status=pending, RLS owner-insert)
  → Render WORKER polls sync_jobs (claim_sync_job) → runs the per-user pipeline
    (isolated /tmp dir, every read/upsert/prune scoped to the user) → updates phase/counts
  → Web SyncProgress (Supabase Realtime + polling) shows live progress
```

Spans both repos: **SavedPosts** (schema, per-user pipeline, worker) and **Trove**
(API OAuth + sync-jobs routes, web UI).

## Manual setup (one-time)

### 1. Database
Run `SavedPosts/db/migrate_reddit_ingestion.sql` in the Supabase SQL editor
(prod + staging). *(Already applied during implementation.)* Creates
`connections`, `connection_secrets` (RLS deny-all), `sync_jobs`, and the
`claim_sync_job()` RPC.

### 2. Reddit app
At <https://www.reddit.com/prefs/apps> → **create app → type: web app**:
- Redirect URI: `https://<your-api-domain>/auth/reddit/callback`
- Note the **client id** (under the app name) and **secret**.

### 3. Shared encryption key
```
openssl rand -base64 32
```
Use this **same value** for `REDDIT_TOKEN_ENC_KEY` on **both** the API and the
worker (API encrypts the refresh token, worker decrypts it).

### 4. API env (Render — `trove-api`)
Set: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`,
`REDDIT_REDIRECT_URI=https://<api>/auth/reddit/callback`, `REDDIT_TOKEN_ENC_KEY`,
`WEB_ORIGIN=https://<web>` (e.g. `https://trovefeed.vercel.app`). Ensure
`SUPABASE_SERVICE_ROLE_KEY` is set (the callback writes via the service role).

### 5. Worker (Render — new service)
Create a Blueprint service from `SavedPosts/render.yaml` (`trove-sync-worker`,
`plan: starter`). Set its `sync:false` env:
- `SUPABASE_URL`, `SUPABASE_KEY` (**service role**)
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_TOKEN_ENC_KEY` (same as API)
- LLM keys: `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`,
  `SAMBANOVA_API_KEY`, `OPENROUTER_API_KEY`

## Verify end-to-end
1. As a **second (non-owner)** account, open `/connections` → **Connect Reddit** →
   approve → you're redirected back and a sync starts.
2. `SyncProgress` advances fetch → comments → classify → analyze → save → done.
3. That account now sees **its own** Reddit content; the owner's content is
   unchanged (compare owner row counts before/after — no cross-user prune).
4. `connection_secrets` is unreadable by a user JWT (only the worker's service
   role can read it); worker logs contain no tokens.

## Security
- Refresh token: `connection_secrets` has RLS enabled with **zero policies**
  (service-role only) + AES-GCM at rest. Never sent to the client.
- OAuth CSRF: signed-state JWT bound to the user; the callback trusts only the
  signed state, never query params.
- Cross-user safety: the worker runs `sync_to_supabase --reddit-only`, which
  scopes every prune-candidate read + delete to `TROVE_USER_ID` and runs in an
  isolated `/tmp/trove/<user_id>` data dir.
