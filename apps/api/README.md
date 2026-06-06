# Trove-Backend

API / service layer for [Trove](../Trove), built with [Hono](https://hono.dev) on
Node. Sits between the React frontend and Supabase so query/service logic lives
server-side instead of in the browser.

## Stack

- **Hono** — fast, TypeScript-first web framework (RPC-ready; exports `AppType`).
- **@hono/node-server** — Node runtime adapter.
- **@supabase/supabase-js** — DB access (anon key, RLS-protected reads).
- **zod** — env validation.
- **tsx** — dev runner with watch/hot-reload.

## Setup

From the monorepo root (`pnpm install` once), then:

```bash
cp apps/api/.env.example apps/api/.env   # fill in SUPABASE_URL + both keys
pnpm dev:api                             # http://localhost:8787
```

`SUPABASE_SERVICE_ROLE_KEY` is **required for the write endpoints** (enrichment
upsert/delete/score). Reads work with just the anon key; writes return `500`
("service-role not configured") until it's set.

## Endpoints

### Reads (anon key)

| Method | Path                                       | Description                                              |
| ------ | ------------------------------------------ | ------------------------------------------------------- |
| GET    | `/health`                                  | Liveness probe.                                         |
| GET    | `/api/categories`                          | All categories (JSON fields normalized).                |
| GET    | `/api/analysis-items?category=&platform=`  | Items for a category, newest first, posts joined.       |
| GET    | `/api/recipes`                             | All recipe cards (map keyed by `source_post_id`).       |
| GET    | `/api/recipes/:postId`                     | Food item + its recipe card, by `source_post_id`.       |
| GET    | `/api/enrichments/bgg`                     | BoardGameGeek links.                                    |
| GET    | `/api/enrichments/tmdb`                    | TMDB links.                                             |
| GET    | `/api/enrichments/igdb`                    | IGDB links.                                             |
| GET    | `/api/enrichments/mal`                     | MyAnimeList links.                                      |
| GET    | `/api/enrichments/hardcover`               | Hardcover links.                                        |
| GET    | `/api/enrichments/instagram-storefronts`   | Amazon storefront URLs by IG owner.                     |
| GET    | `/api/enrichments/travel-locations`        | Travel pins.                                            |

### Writes (service-role key; RLS blocks anon writes)

| Method | Path                                              | Description                 |
| ------ | ------------------------------------------------- | --------------------------- |
| DELETE | `/api/enrichments/bgg/:analysisItemId`            | Delete a BGG link.          |
| PUT    | `/api/enrichments/tmdb/:analysisItemId`           | Upsert a TMDB link.         |
| DELETE | `/api/enrichments/tmdb/:analysisItemId`           | Delete a TMDB link.         |
| PATCH  | `/api/enrichments/tmdb/:analysisItemId/score`     | Set TMDB personal score.    |
| PUT    | `/api/enrichments/igdb/:analysisItemId`           | Upsert an IGDB link.        |
| DELETE | `/api/enrichments/igdb/:analysisItemId`           | Delete an IGDB link.        |
| PATCH  | `/api/enrichments/igdb/:analysisItemId/score`     | Set IGDB personal score.    |
| PUT    | `/api/enrichments/mal/:analysisItemId`            | Upsert a MAL link.          |
| DELETE | `/api/enrichments/mal/:analysisItemId`            | Delete a MAL link.          |
| PUT    | `/api/enrichments/hardcover/:analysisItemId`      | Upsert a Hardcover link.    |
| DELETE | `/api/enrichments/hardcover/:analysisItemId`      | Delete a Hardcover link.    |

To enforce the read/write split at the database, run
[`sql/lockdown_enrichment_rls.sql`](./sql/lockdown_enrichment_rls.sql) in the
Supabase SQL editor (anon → read-only; service-role bypasses RLS).

> ⚠️ The write endpoints are currently **unauthenticated** — any client that can
> reach the API can call them. Fine for local/personal use; add real auth before
> exposing the API publicly.

### `GET /api/recipes/:postId`

### `GET /api/recipes/:postId`

```jsonc
{
  "item": { "id": 123, "category_name": "Food & Cooking", "item_data": { ... }, "posts": { ... } },
  "card": {
    "ingredients": ["..."],
    "steps": ["..."],
    "prepTime": "10 min",
    "cookTime": null,
    "totalTime": null,
    "servings": "4",
    "notes": null,
    "sourceExcerpt": "...",
    "enrichedBy": "llm"
  }
}
```

`card` is `null` when the post hasn't been recipe-enriched. `404` if no Food &
Cooking item exists for that `source_post_id`.

## Architecture notes

- **Why a backend:** centralizes Supabase queries/business logic that previously
  lived in Trove's React hooks, hides service-role operations, and gives one
  place to add caching / rate-limiting / auth.
- **RPC upgrade path:** `app.ts` exports `AppType`. Once backend + frontend share
  types (npm workspace or a published `@trove/api-types` package), Trove can swap
  its `fetch` calls for Hono's typed client:
  `const client = hc<AppType>(import.meta.env.VITE_API_URL)`.
- **Keys:** reads use the anon key (matches the frontend; RLS enforced). Only
  introduce the service-role key for write/admin endpoints, and never expose it
  to the browser.
