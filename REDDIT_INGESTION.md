# Multi-user ingestion (Reddit + Instagram) — setup

Lets any signed-in user connect their **own** Reddit and Instagram accounts by
pasting a browser credential, sync their saved posts, and watch progress — all
scoped to their `user_id` (existing RLS already isolates content per user).
**No platform API app is required** (Reddit gated self-serve app creation behind
manual approval in 2026); the user pastes the same kind of credential the
single-tenant pipeline uses — a cookie for Reddit, a `sessionid` for Instagram.
See the Instagram section at the bottom for its specifics.

## Architecture
```
Web /connections (paste cookie) → API POST /api/connections/reddit/credential
  → API verifies the cookie (one live saved-posts fetch), then AES-GCM encrypts
    it into connection_secrets (service role; RLS deny-all)
Web → POST /api/sync-jobs (status=pending, RLS owner-insert)
  → API fires a GitHub repository_dispatch (sync-requested)
  → WORKER claims the job (claim_sync_job) → runs the per-user pipeline
    (isolated /tmp dir, every read/upsert/prune scoped to the user) → updates phase/counts
  → Web SyncProgress (Supabase Realtime + polling) shows live progress
```

**The worker is free GitHub Actions by default** (`.github/workflows/sync-worker.yml`,
`run_worker.py --drain`): the API's dispatch wakes it on demand, and a 6h cron
backstops anything missed. The same `run_worker.py` runs in serve-mode on the
optional paid Render worker (`render.yaml`) if you ever outgrow Actions' free
minutes. The queue/scoping/pipeline are host-agnostic — only the thing calling
`claim_sync_job()` changes.

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
credential route writes via the service role). To make syncs start instantly
(instead of waiting for the worker's cron), also set:
- `GH_DISPATCH_TOKEN` — a GitHub token with **Actions: write** on the SavedPosts repo
- `GH_DISPATCH_REPO` — e.g. `mcanzia/saved-posts-claude`

### 4. Worker — GitHub Actions (free, default)
No service to create. `.github/workflows/sync-worker.yml` drains the queue on
Actions (`run_worker.py --drain`). Add these **GitHub Actions secrets** to the
SavedPosts repo (Settings → Secrets and variables → Actions):
- `SUPABASE_URL`, `SUPABASE_KEY` (**service role**)
- `REDDIT_TOKEN_ENC_KEY` (same value as the API)
- LLM keys: `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`,
  `SAMBANOVA_API_KEY`, `OPENROUTER_API_KEY`, `MODELS_TOKEN`

It runs on `repository_dispatch` (the API's instant trigger), a 6h cron backstop,
and the manual "Run workflow" button. ffmpeg is installed in-workflow, so IG video
works. **Cost:** idle is ~free (sparse cron); you only spend minutes on real syncs.

**Recurring auto-sync:** `.github/workflows/auto-sync.yml` runs daily (07:00 UTC) —
`worker/enqueue_due.py` queues a sync for every **connected + approved**
user/platform, then drains. So connecting an account subscribes it to a daily
refresh (revoked/expired cookies are skipped). Users can still "Sync now" any time
between runs. Same secrets as the drainer; cost scales with user count (IG vision
is the heavy one), so widen the cadence in that workflow's `cron` if it grows.

#### Optional: paid always-on worker (Render)
Only if you outgrow Actions' free minutes. Create a Blueprint from
`SavedPosts/render.yaml` (`trove-sync-worker`, `plan: starter`, ~$7/mo) and set the
same env as the Actions secrets above (minus `MODELS_TOKEN`). It runs the identical
`run_worker.py` in serve-mode (polls forever, ~5s latency).

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

## Instagram

Same architecture, reusing the entire stack (connection_secrets, sync_jobs queue,
worker, per-user scoping, progress UI). The credential is the **full instagram.com
cookie** (it must include `sessionid` **and** `csrftoken` — the GraphQL fetch 403s
without csrftoken); the worker sets all cookies + the `X-CSRFToken` header and
builds an instaloader session from them.

**One-time DB delta:** run `SavedPosts/db/migrate_instagram_ingestion.sql` in the
Supabase SQL editor (prod + staging). *(Already applied during implementation.)*
It just widens the `connections.platform` CHECK to allow `'instagram'` — every
other table/column is already platform-agnostic.

**Pipeline** (per IG sync, in the isolated dir): pull(scoped) → `sync_instagram`
(sessionid → session) → `transcribe_instagram_videos` → `analyze_instagram_images`
→ `analyze_instagram --classify-only` → `--analyze-only` → `sync_to_supabase
--instagram-only`. Progress phases: fetch → transcribe → read images → classify →
analyze → save → done.

**How a user connects:** `/connections` → Instagram → instagram.com (logged in) →
DevTools → Network → first instagram.com request → copy the entire `cookie:`
request-header value (includes sessionid + csrftoken) → paste with the username →
Connect & sync.

**Caveats (it's flagged "experimental" in the UI):**
- Instagram aggressively invalidates sessions used from a new IP, so a `sessionid`
  pasted from a home browser may expire within a day or two once the worker (a
  datacenter IP) uses it — the user just re-pastes. A logged-out session mid-sync
  marks the connection `revoked`.
- **Video transcription needs `ffmpeg`** on the worker (fetched as a static binary
  in `render.yaml`'s build). Image/carousel posts (the bulk of IG saves) use vision
  OCR and need no ffmpeg. Both the transcribe and image-vision steps are
  **best-effort** — a failure falls back to caption/hashtag text instead of failing
  the whole sync.
- IG vision/transcription can be a lot of LLM calls on a cold backlog; the
  free-first cascade + OpenRouter daily budget guard bound the cost.
- The server-side verify is lenient (IG blocks datacenter IPs unpredictably): it
  rejects only an explicit logged-out signal, otherwise saves and lets the worker
  be the real validator.
