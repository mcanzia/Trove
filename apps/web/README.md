# Trove

A web UI for browsing and searching the analysed content from the [SavedPosts](../SavedPosts) pipeline — Reddit and Instagram saved posts, classified into categories and surfaced in one place.

---

## Tech stack

| Tool | Purpose |
|------|---------|
| React + TypeScript | UI framework |
| Vite + `@tailwindcss/vite` | Build tooling + Tailwind v4 |
| shadcn/ui | Component library |
| TanStack Query | Data fetching & caching |
| React Router | Client-side routing |
| Supabase JS | Database client |

---

## Project structure

```
src/
├── components/
│   └── ui/           shadcn components (button, card, …)
├── hooks/
│   ├── useCategories.ts       Fetch all categories
│   └── useAnalysisItems.ts    Fetch items for a category
├── lib/
│   ├── supabase.ts   Supabase client
│   └── utils.ts      cn() helper (shadcn)
├── pages/
│   ├── HomePage.tsx       Category grid
│   └── CategoryPage.tsx   Items table with platform filter
├── types/
│   └── index.ts      TypeScript types matching the DB schema
├── App.tsx           Route definitions
└── main.tsx          Providers (QueryClient, BrowserRouter)
```

---

## Local setup

```bash
npm install
cp .env.local .env.local   # already exists — fill in values
npm run dev
```

### Environment variables (`.env.local`)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

Both values are available in the Supabase dashboard under **Project Settings → API**.

---

## Pages

- **`/`** — grid of all categories, click through to browse items
- **`/category/:name`** — table of analysis items for that category, filterable by platform (Reddit / Instagram)
