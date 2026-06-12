# Trove UI v2 — Design Specification ("The Vault")

This document is the single source of truth for the Trove UI overhaul. Implementation
agents: follow it exactly. Where this spec is silent, match the existing code's
conventions. **Never modify data-fetching logic, mutation logic, enrichment sync
logic, or URL/search-param semantics — this is a visual/structural redesign only.**

## 0. Concept

Trove is a personal treasure vault of saved knowledge. The design language is a
**refined personal library**: warm paper neutrals, an antique-gold accent, an
editorial serif for titles, calm and dense-but-breathable data displays.
Quality bar: Linear/Notion-level polish.

- Light mode = warm paper & ink. Dark mode = candlelit study (deep warm charcoal, never pure black).
- Gold is the *accent*, used sparingly: focus rings, active states, small highlights, the wordmark gem. Buttons stay ink/espresso.
- Serif display font (Fraunces) for page titles and the wordmark only. Everything else stays Geist.

## 1. Foundation (tokens — `apps/web/src/index.css`)

Replace the `:root` and `.dark` variable blocks with the values below. Keep the
existing `@theme inline` mapping structure; ADD the new tokens to it
(`--color-gold`, `--color-gold-soft`, `--font-display`).

```css
@import "@fontsource-variable/fraunces";  /* add alongside geist import */

@theme inline {
  /* ...keep existing mappings, plus: */
  --font-display: 'Fraunces Variable', Georgia, serif;
  --color-gold: var(--gold);
  --color-gold-soft: var(--gold-soft);
}

:root {
  --background: oklch(0.977 0.004 85);
  --foreground: oklch(0.235 0.012 50);
  --card: oklch(0.998 0.002 90);
  --card-foreground: oklch(0.235 0.012 50);
  --popover: oklch(0.998 0.002 90);
  --popover-foreground: oklch(0.235 0.012 50);
  --primary: oklch(0.30 0.025 55);            /* espresso ink */
  --primary-foreground: oklch(0.98 0.005 85);
  --secondary: oklch(0.945 0.008 80);
  --secondary-foreground: oklch(0.30 0.025 55);
  --muted: oklch(0.945 0.006 85);
  --muted-foreground: oklch(0.50 0.014 60);
  --accent: oklch(0.93 0.018 80);             /* warm hover tint */
  --accent-foreground: oklch(0.235 0.012 50);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.906 0.009 80);
  --input: oklch(0.906 0.009 80);
  --ring: oklch(0.72 0.115 75);               /* gold focus */
  --gold: oklch(0.66 0.115 70);
  --gold-soft: oklch(0.95 0.035 85);
  --radius: 0.625rem;
  --sidebar: oklch(0.962 0.006 85);
  --sidebar-foreground: oklch(0.235 0.012 50);
  --sidebar-primary: oklch(0.30 0.025 55);
  --sidebar-primary-foreground: oklch(0.98 0.005 85);
  --sidebar-accent: oklch(0.925 0.012 80);
  --sidebar-border: oklch(0.906 0.009 80);
  --sidebar-ring: oklch(0.72 0.115 75);
  --sidebar-accent-foreground: oklch(0.235 0.012 50);
  /* keep chart-1..5 as-is */
}

.dark {
  --background: oklch(0.168 0.008 60);
  --foreground: oklch(0.93 0.008 85);
  --card: oklch(0.205 0.010 60);
  --card-foreground: oklch(0.93 0.008 85);
  --popover: oklch(0.205 0.010 60);
  --popover-foreground: oklch(0.93 0.008 85);
  --primary: oklch(0.90 0.018 85);
  --primary-foreground: oklch(0.205 0.010 60);
  --secondary: oklch(0.26 0.012 60);
  --secondary-foreground: oklch(0.93 0.008 85);
  --muted: oklch(0.245 0.010 60);
  --muted-foreground: oklch(0.665 0.012 75);
  --accent: oklch(0.27 0.015 70);
  --accent-foreground: oklch(0.93 0.008 85);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(0.95 0.01 85 / 12%);
  --input: oklch(0.95 0.01 85 / 16%);
  --ring: oklch(0.80 0.105 80);
  --gold: oklch(0.80 0.105 80);
  --gold-soft: oklch(0.30 0.045 80);
  --sidebar: oklch(0.148 0.008 60);
  --sidebar-foreground: oklch(0.93 0.008 85);
  --sidebar-primary: oklch(0.90 0.018 85);
  --sidebar-primary-foreground: oklch(0.205 0.010 60);
  --sidebar-accent: oklch(0.24 0.012 65);
  --sidebar-border: oklch(0.95 0.01 85 / 10%);
  --sidebar-ring: oklch(0.80 0.105 80);
  --sidebar-accent-foreground: oklch(0.93 0.008 85);
}
```

Base layer additions:
- `h1` page titles use `font-display` via utility class (`font-display`), NOT globally.
- Keep `* { @apply border-border outline-ring/50 }`.
- Add: `::selection { background: color-mix(in oklch, var(--gold) 30%, transparent); }`
- Custom scrollbars (webkit): thin, `var(--border)` thumb, transparent track.

Typography scale:
- Page title: `font-display text-3xl md:text-4xl font-semibold tracking-tight` (Fraunces, weight ~560 via font-semibold).
- Section heading: Geist `text-sm font-semibold`.
- Table header: `text-xs font-medium uppercase tracking-wider text-muted-foreground`.
- Body/cell: `text-sm`.

Motion rules: durations 150–200ms, ease-out. Hover lifts: `hover:-translate-y-0.5 hover:shadow-md`. Use `motion-safe:` for anything that moves position. Page content mounts with `animate-in fade-in slide-in-from-bottom-2 duration-300` (tw-animate-css is installed).

Dependency to add (web app): `pnpm --filter @trove/web add @fontsource-variable/fraunces`

## 2. App Shell (`apps/web/src/components/shell/`)

New layout wraps `/`, `/category/:slug`, `/category/:slug/recipe/:postId` via a
React Router layout route (`<Route element={<AppShell/>}>` + `<Outlet/>`).
`/mal-callback` stays outside the shell.

### 2.1 Sidebar (desktop ≥lg; off-canvas drawer below lg)
- Width 264px, `bg-sidebar border-r border-sidebar-border`, full height, own scroll area, sticky.
- Header: `Gem` (lucide) icon in a gold-soft rounded-lg tile + wordmark **Trove** in `font-display text-lg font-semibold`. Links to `/`.
- Below header: a search button styled like an input — `Search` icon + "Search…" + `⌘K` kbd chip — opens the command palette.
- Nav: categories grouped per §6 (`lib/categoryGroups.ts`). Each group: an uppercase `text-[11px] tracking-wider text-muted-foreground` label, then items. Item row: category icon (from `getCategoryTheme`, 15px, in its `iconClass` color), name (truncate), right-aligned count badge (`text-[10px] tabular-nums text-muted-foreground`, from `useStats`). Active item: `bg-sidebar-accent text-sidebar-accent-foreground font-medium` + a 2px gold left indicator bar. Hover: `bg-sidebar-accent/60`.
- Footer (pinned): theme toggle (Sun/Moon icon button, cycles light/dark) + total item count line ("1,464 items saved" — `text-[11px] text-muted-foreground`).
- Mobile: hamburger in topbar opens it as a drawer with overlay (`bg-black/40 backdrop-blur-sm`), slide-in animation, ESC/overlay-click closes.

### 2.2 Topbar
- Sticky, `h-14`, `bg-background/80 backdrop-blur-md border-b border-border`, z-40.
- Left: (mobile) hamburger; breadcrumb — "Trove / {Category}" or "Trove / Food & Cooking / Recipe". Crumbs are links, `text-sm text-muted-foreground`, current crumb `text-foreground font-medium`.
- Right: search icon button (mobile, opens palette) + theme toggle (mobile; desktop has it in sidebar footer — desktop topbar right side can be empty or hold the theme toggle too if simpler; pick ONE home for it per breakpoint, never two visible at once).

### 2.3 ThemeProvider (`components/shell/ThemeProvider.tsx`)
- Context with `theme: 'light' | 'dark' | 'system'`, persisted to `localStorage('trove-theme')`, applies/removes `.dark` on `<html>`, listens to `prefers-color-scheme` when `system`. Toggle button cycles light↔dark (long-form system option not needed). Add an inline `<script>` in `index.html` to set the class pre-hydration (no flash).

### 2.4 Command Palette (`components/shell/CommandPalette.tsx`)
- Global `⌘K` / `Ctrl+K` opens; ESC closes. Custom implementation (no new deps): fixed overlay (`bg-black/40 backdrop-blur-sm`), centered panel `max-w-lg w-full rounded-xl border bg-popover shadow-2xl`, top-aligned ~20vh.
- Input (autofocus) filters all 36 categories by substring (case-insensitive). Results list: icon (themed) + name + group label right-aligned; ArrowUp/Down to move selection, Enter navigates to `/category/{toSlug(name)}`, click works too. Selected row `bg-accent`.
- First section when query empty: "Recent" — last 5 visited categories from `localStorage('trove-recent')` (CategoryPage writes to it; the palette just reads; write logic lives in a tiny `lib/recents.ts` helper called from CategoryPage — Phase 3 wires the write, palette tolerates empty).
- Footer strip: kbd hints (↑↓ navigate · ↵ open · esc close).

### 2.5 Stats (`GET /api/stats` + `useStats`)
- New Hono route `apps/api/src/routes/stats.ts`, registered exactly like existing routes (see how `categories`/`recipes` are mounted in the api app entry; keep Hono RPC typing chain intact so `api.api.stats.$get()` typechecks in the web client).
- Implementation: `supabase.from('analysis_items').select('category_name')` (≈1.5k tiny rows), aggregate counts server-side, return `{ total: number, perCategory: Record<string, number> }`. Set `Cache-Control: max-age=300`.
- Web hook `hooks/useStats.ts`: `useQuery(['stats'])`, `staleTime: 5 * 60_000`.

### 2.6 Shared primitives (`components/ui/`)
- `skeleton.tsx`: `bg-muted animate-pulse rounded-md` div with className passthrough.
- `EmptyState.tsx`: centered block — icon in muted circle, title (`text-sm font-medium`), description (`text-sm text-muted-foreground`), optional action slot. Used for empty tables/searches.
- `Kbd.tsx`: `<kbd>` chip — `rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground`.

## 3. Dashboard (`pages/HomePage.tsx` rebuild)

- Header block: "Trove" in `font-display text-4xl`, subtitle "Your saved posts, organised and searchable." Below: three stat chips in a row (Items saved · Categories · note: derive from `useStats` + categories list) — each `rounded-xl border bg-card px-4 py-3`, number in `font-display text-2xl tabular-nums`, label `text-xs text-muted-foreground`. Skeletons while loading.
- Inline filter input (`Search categories…`) with a `⌘K` Kbd hint on the right; filters the grid live by category name (this is NOT the command palette, just a filter).
- Category grid **grouped by the §6 groups**: each group renders its label as a section heading (uppercase tracking-wider, with a thin rule extending right), then a responsive grid `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`.
- Card v2: `rounded-xl border bg-card p-4`, themed icon tile (existing `iconBgClass`/`iconClass`), name `font-medium text-sm`, count line `text-xs text-muted-foreground` ("42 items"). Hover: `motion-safe:hover:-translate-y-0.5 hover:shadow-md hover:border-ring/40` + existing per-category `cardBgClass`. Keep the top accent border (`border-t-2` + `accentClass`) — it's a nice category fingerprint. Drop the extraction_goal paragraph (it's pipeline prose, not user copy); the card is icon + name + count.
- Empty filter result: EmptyState ("No categories match…").
- Mount animation: stagger groups with `animate-in fade-in slide-in-from-bottom-2`.

## 4. Category Page (`pages/CategoryPage.tsx` chrome + `components/DataTable.tsx`)

**DO NOT touch:** all hooks, mutations, sync effects (`runMALSync`, `runIGDBSync`,
`runTMDBSync`), `getShopLink`, column accessor/cell logic, modal handler wiring,
URL param semantics (`platform`, `view`, `group`), `SavedPostsSection` props,
`TravelMap` props. Restyle only the surrounding markup/classNames; column cell
JSX may get className-level polish ONLY (no logic edits).

### 4.1 Page header
- Breadcrumb is in the topbar now; remove the inline "← All categories" link.
- Hero row: large themed icon tile (`h-12 w-12 rounded-2xl` + `iconBgClass`/`iconClass`), category name in `font-display text-3xl`, and a meta line under it: `{N} items` · platform mix ("312 Reddit · 41 Instagram" when both exist — compute from loaded `items` client-side, cheap `useMemo`). Drop the extraction_goal paragraph.
- Write the visited category into recents (`lib/recents.ts: pushRecent(name)`) in a `useEffect`.

### 4.2 Toolbar
One sticky row (`sticky top-14 z-30 bg-background/80 backdrop-blur-md py-3 border-b border-border/60 -mx-* px-*` as needed):
- Platform filter → segmented control (one container `rounded-lg border bg-muted/50 p-0.5`, options All/Reddit/Instagram as `rounded-md px-3 py-1 text-sm`, active = `bg-card shadow-sm font-medium`, inactive = `text-muted-foreground`).
- Group-by select: restyled trigger — `rounded-lg border bg-card pl-3 pr-8 py-1.5 text-sm` with chevron (keep native `<select>` for reliability; keep flag labels).
- Search input: `Search` icon inside on the left, `rounded-lg`, width `w-64`, right-aligned (`ml-auto`); pressing `/` anywhere on the page focuses it (ignore when typing in inputs).
- Map/Table toggle → same segmented control style with icons.
- Books status filter row: keep behavior, restyle pills to the segmented/pill language (filled tints when active, consistent with tokens — replace ad-hoc gray/blue/yellow/green Tailwind classes with the same hues but consistent structure: `rounded-full border px-3 py-1 text-xs font-medium`).

### 4.3 MAL banner → integration card
`rounded-xl border bg-card px-4 py-3` with the MAL wordmark substituted by a small violet tile + "MyAnimeList" `text-sm font-medium`; connected state shows a green dot + "Synced"; keep confirm-to-disconnect flow. Connect button: `bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-medium`.

### 4.4 DataTable v2
- Container: `rounded-xl border bg-card overflow-hidden shadow-xs`; horizontal scroll wrapper `overflow-x-auto`.
- Header: `bg-muted/40`, cells `text-xs font-medium uppercase tracking-wider text-muted-foreground h-10`; sort affordance uses lucide `ArrowUpDown`/`ArrowUp`/`ArrowDown` (12px) instead of unicode arrows; sorted column header gets `text-foreground`.
- Rows: `hover:bg-accent/40 transition-colors`, cell padding `px-3 py-2.5`, divider `border-b border-border/60` (no zebra). First dynamic (content) column cell: `font-medium text-foreground` (DataTable can't know which — leave cells as-is; instead Phase 3 sets the first dynamic column's cell to `font-medium` inside `buildColumns`, a className-only change).
- Empty state: render `EmptyState` inside (icon `SearchX`, "No results", "Try a different search or filter.").
- Loading: page shows a skeleton table (header bar + 8 rows of `Skeleton` blocks) instead of "Loading…" text.
- Pagination bar: left "1–50 of 271" (`tabular-nums`), right: icon buttons (`ChevronLeft`/`ChevronRight`, `h-8 w-8 rounded-lg border hover:bg-muted disabled:opacity-40`) + restyled page-size select matching the group-by select.
- Platform pill cells, genre chips inside cells: keep colors, normalize to `rounded-full px-2 py-0.5 text-[10px] font-medium`.

### 4.5 City tables (Travel)
Section heading: `MapPin` in gold + city name `text-base font-semibold` + count in muted; add a hairline rule filling the remaining row width.

## 5. Recipe Page + Books + Modals + SavedPosts (polish pass)

### 5.1 RecipePage
- Title in `font-display text-3xl md:text-4xl`. Keep chips/badges but align to token language (`rounded-full`, `text-[11px] font-medium`).
- Layout: on `md+`, two columns — ingredients in a `rounded-xl border bg-card p-5` panel that is `md:sticky md:top-20 self-start`; steps flow on the right.
- Ingredients become checkable: each `<li>` is a `<label>` with a custom checkbox (`rounded border-2`, checked = gold fill + white check via lucide `Check` 12px); checked text gets `line-through text-muted-foreground`. Local `useState<Set<number>>` only.
- Steps: number badge `h-6 w-6 rounded-full bg-gold-soft text-gold` (dark-mode aware via tokens) — `font-semibold tabular-nums`; generous `space-y-4 leading-relaxed`.
- Notes box: `rounded-xl border-l-2 border-l-gold bg-gold-soft/50 px-4 py-3`.
- Source link → button-style: `inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted` with `ExternalLink` icon.
- Loading: skeleton header + two skeleton panels.

### 5.2 BookCard (`components/BookCard.tsx`)
Keep all props/behavior. Restyle: `rounded-xl border bg-card overflow-hidden` with cover area `aspect-[2/3]` if currently different — match existing structure, improve: hover lift, status select restyled, star rating gold (`text-gold fill-gold` when active).

### 5.3 Search modals (Hardcover/MAL/IGDB/TMDB — 4 files)
Common treatment, keep all props/handlers: overlay `bg-black/40 backdrop-blur-sm animate-in fade-in duration-150`; panel `rounded-2xl border bg-popover shadow-2xl animate-in zoom-in-95 fade-in duration-150 max-w-lg w-full`; header with title `text-sm font-semibold` + X icon button; search input with icon; result rows `rounded-lg hover:bg-accent px-3 py-2` with cover thumb, title `text-sm font-medium`, meta `text-xs text-muted-foreground`; searching state = 3 skeleton rows; empty = EmptyState (small).

### 5.4 SavedPostsSection (`components/SavedPostsSection.tsx`)
Keep query/props. Restyle as a collapsible section: heading row (chevron rotates, count badge), link-out cards `rounded-xl border bg-card p-3 hover:border-ring/40 hover:shadow-sm` with platform-colored dot + truncated title + owner/sub `text-xs muted` + `ExternalLink` 12px.

## 6. Category groups (`apps/web/src/lib/categoryGroups.ts` — Phase 1 creates)

```ts
export const CATEGORY_GROUPS: { label: string; categories: string[] }[] = [
  { label: 'Watch & Play', categories: ['Anime & Manga','Board Games','D&D Character Builds','Magic: The Gathering','Movies & Film Recommendations','TV Series Recommendations','Video Game Recommendations','Viral Videos & Entertainment'] },
  { label: 'Read & Learn', categories: ['Books Worth Reading','ChatGPT & AI Tools','Interesting Facts & Science','Language & Learning','News & Current Events','Pixel Art & Animation','Web Development & Programming'] },
  { label: 'Food & Home', categories: ['Food & Cooking','Food Science & Nutrition','Home & Kitchen Products','DIY & Crafts','Plants & Gardening'] },
  { label: 'Health & Wellness', categories: ["Crohn's Disease & IBD Support",'Fitness & Weight Gain','Self-Improvement & Wellness','Skincare & Acne Treatment','Fashion & Beauty','Pets & Animal Care','Life Hacks & Productivity'] },
  { label: 'Work & Tech', categories: ['Career & Job Search','Investing & Finance','Salesforce Tips & Career','Tech & Gadgets'] },
  { label: 'Life & Leisure', categories: ['Travel & Destinations','Sports Highlights & Memorable Moments','Tottenham Hotspur Fandom','Memes & Humor','Weird & WTF Content'] },
]
```

Helper `groupCategories(categories: Category[])` returns the groups in order with
resolved Category objects, plus a trailing `{ label: 'More', … }` group for any
category name not listed (future-proof — never drop a category).

## 7. Hard constraints (all phases)

- `noUnusedLocals`/`noUnusedParameters` are strict — `pnpm --filter @trove/web typecheck` must pass before you finish. Run it.
- Do not add dependencies beyond `@fontsource-variable/fraunces`.
- Do not edit anything under `apps/api` except adding the stats route (Phase 1).
- Do not rename routes or change URL/search-param behavior.
- Keep all existing functionality: sorting, pagination, filters, modals, MAL/IGDB/TMDB/Hardcover flows, map fly-to, recipe links, shop links, saved-posts section.
- Dark mode must look correct for every change (use tokens, never raw `white`/`black`/`gray-*` for surfaces; per-category tints keep their existing `dark:` variants).
- Accessibility: focus-visible rings on all interactive elements; `aria-label` on icon-only buttons; palette/drawer trap ESC; respect `motion-safe:`.
