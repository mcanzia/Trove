# Trove — monorepo

pnpm workspace containing the Trove web app, its API, and shared types.

```
.
├── apps/
│   ├── web/        # @trove/web   — Vite + React frontend
│   └── api/        # @trove/api   — Hono backend (Supabase) + RPC types
└── packages/
    └── shared/     # @trove/shared — domain types shared by web + api
```

(The Python ingestion pipeline lives in the separate `SavedPosts` repo and
writes to the same Supabase project. It is intentionally not part of this
workspace.)

## Prerequisites

- Node ≥ 20
- pnpm (via Corepack): `corepack enable pnpm`

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # Supabase + VITE_API_URL
cp apps/api/.env.example apps/api/.env          # Supabase + PORT + CORS_ORIGINS
```

## Develop

```bash
pnpm dev          # web + api together (parallel)
pnpm dev:web      # frontend only        → http://localhost:5173
pnpm dev:api      # backend only         → http://localhost:8787
```

## Other scripts

| Script             | What it does                                               |
| ------------------ | --------------------------------------------------------- |
| `pnpm build`       | Build every package in dependency order (shared→api→web).  |
| `pnpm typecheck`   | Type-check all packages.                                   |
| `pnpm lint`        | Lint the web app.                                          |

## How the type-safe API boundary works (Hono RPC)

`@trove/api` exports `AppType` (the inferred type of all its routes). The web
app creates a typed client from it:

```ts
import { hc } from 'hono/client'
import type { AppType } from '@trove/api'

const client = hc<AppType>(import.meta.env.VITE_API_URL)
const res = await client.api.recipes[':postId'].$get({ param: { postId } })
const data = await res.json() // typed as RecipeResponse — no cast
```

Because `apps/web` references `apps/api` as a TypeScript **project reference**,
the web build compiles against api's emitted declarations (`apps/api/dist`), not
its source — so server-only code (node, Hono server adapter) never leaks into
the browser bundle. The `import type` is erased at build time.

Shared domain types (`AnalysisItem`, `RecipeCard`, `RecipeResponse`, …) live in
`@trove/shared` and are imported by both sides — one source of truth.
