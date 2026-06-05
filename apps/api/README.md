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

```bash
npm install
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_ANON_KEY (same project as Trove)
npm run dev            # http://localhost:8787
```

## Scripts

| Script              | Description                          |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Watch-mode dev server (tsx)          |
| `npm run build`     | Type-check + emit to `dist/`         |
| `npm run start`     | Run the built server                 |
| `npm run typecheck` | Type-check only, no emit             |

## Endpoints

| Method | Path                     | Description                                                              |
| ------ | ------------------------ | ------------------------------------------------------------------------ |
| GET    | `/health`                | Liveness probe.                                                          |
| GET    | `/api/recipes/:postId`   | Food & Cooking item + its structured recipe card, by `source_post_id`.   |

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
