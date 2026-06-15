# Deploying Trove

## Live deployment (current)

| Piece | URL | Host |
|-------|-----|------|
| Web (SPA) | https://trovefeed.vercel.app | Vercel (Hobby) |
| API | https://trove-api-ncuc.onrender.com | Render (free tier — flip to `starter` for always-on/mobile) |
| DB / Auth | Supabase (managed) | — |

Wiring in effect: web `VITE_API_URL` → the Render API; API `CORS_ORIGINS=https://trovefeed.vercel.app`;
Supabase auth redirect URLs include the Vercel origin; Mapbox uses a URL-restricted
public token. Both hosts auto-deploy from `main`.

---

Architecture: **one always-on Node API serves all clients**; the web SPA is a
static front-end on a CDN. Supabase is already managed.

```
            ┌──────────────┐
browsers →  │ Vercel (web) │ ── static SPA (apps/web)
            └──────┬───────┘
                   │  VITE_API_URL
                   ▼
            ┌──────────────────┐        ┌──────────┐
clients  →  │ Render (api)     │ ─────→ │ Supabase │  (+ OpenRouter, Cloudflare,
mobile   →  │ apps/api, Node   │        └──────────┘   Gemini Cloud Monitoring)
            └──────────────────┘
```

Why this split: the **API is the backbone** (it holds the provider secrets and
serves web **and** future mobile). The web host is just a CDN and never touches
mobile, so the two evolve independently. Keep the API a plain Node service (not
serverless) so it stays warm and portable.

---

## 0. Do this first — a stable API domain

Put the API behind your **own domain** (e.g. `api.yourdomain.com`) from day one.
Then flipping the API to always-on, migrating hosts, or pointing a mobile app at
it never requires a client change. (Set it up in the Render dashboard → Settings
→ Custom Domains, and add the DNS CNAME it shows you.)

---

## 1. API → Render

1. **Render Dashboard → New → Blueprint**, connect this repo. It reads
   [`render.yaml`](./render.yaml) and creates the `trove-api` service.
2. Set every secret marked `sync: false` (below). `PORT` is injected by Render.
3. (Recommended) add the custom domain `api.yourdomain.com`.
4. Deploy. Smoke-test: `curl https://api.yourdomain.com/health` → `{"ok":true,...}`.

**API secrets to set in the Render dashboard:**

| Var | Value |
|-----|-------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key |
| `CORS_ORIGINS` | the web origin(s), comma-separated — fill in after step 2 |
| `OPENROUTER_API_KEY` | OpenRouter key |
| `CLOUDFLARE_ACCOUNT_ID` | `f193b755bf1471d74775383d73b17498` (Workers AI account) |
| `CLOUDFLARE_API_TOKEN` | token with **Account Analytics: Read** |
| `GEMINI_MONITORING_SA_JSON` | inline contents of `apps/api/gcp-monitoring-sa.json` |

Already defaulted in `render.yaml` (no action): `OPENROUTER_DAILY_BUDGET_USD=2`,
`GEMINI_MONITORING_PROJECT_ID`, `GEMINI_MONITORING_QUOTA_PROJECT`, `NODE_VERSION`.

> Get the SA JSON as one line:
> `python3 -c "import json;print(json.dumps(json.load(open('apps/api/gcp-monitoring-sa.json'))))" | pbcopy`

---

## 2. Web → Vercel

1. **Vercel → Add New → Project**, import this repo. **Leave Root Directory at the
   repo root** — [`vercel.json`](./vercel.json) handles the pnpm-workspace build
   (`pnpm --filter @trove/web... build` → `apps/web/dist`) and the SPA rewrite.
   Do *not* set Root Directory to `apps/web` (it breaks workspace install).
2. Set the build-time env vars (below).
3. Deploy, then note the URL (e.g. `https://trove.vercel.app` or your custom
   domain) and **go back to Render and set `CORS_ORIGINS` to it**.

**Web env vars (Vercel → Settings → Environment Variables):**

| Var | Value |
|-----|-------|
| `VITE_API_URL` | `https://api.yourdomain.com` (the Render API) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_MAPBOX_TOKEN` | Mapbox token |
| `VITE_MAL_CLIENT_ID` | MyAnimeList client id |
| `VITE_MAL_REDIRECT_URI` | `https://<web-url>/mal-callback` |

---

## 3. Supabase Auth config

Supabase → **Authentication → URL Configuration**: set **Site URL** to the web
URL and add it (and `https://<web-url>/auth/callback`) to **Redirect URLs**, or
magic-link / OAuth sign-in will reject the redirect in production.

---

## 4. Going always-on for mobile (later)

When the mobile app ships, remove API cold starts:

- **Render:** change `plan: free` → `plan: starter` in `render.yaml` (or in the
  dashboard) — ~$7/mo, always-on.
- **Or migrate** the API to DigitalOcean App Platform (~$5/mo, always-on) — same
  Node service, no code change.

Because the API is on a custom domain, **no client needs to change**. Mobile is
native, so CORS doesn't apply to it — `CORS_ORIGINS` stays web-only. Mobile uses
the same Supabase JWT auth the API already enforces.

For the mobile app itself: **Expo (React Native)** reuses the TypeScript types in
`packages/shared` and hits the same API + Supabase.

---

## Preview deploys (note)

Vercel preview deployments get changing subdomains, which won't be in
`CORS_ORIGINS`, so their API calls will be blocked by CORS. That's fine for
UI-only previews; if you need a working API in previews, add the preview origin
to `CORS_ORIGINS` or point previews at a separate preview API.
