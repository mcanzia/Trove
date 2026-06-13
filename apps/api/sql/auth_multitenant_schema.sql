-- Multi-tenant schema + RLS: add user_id to every per-user table and lock each
-- table to its owner via row-level security (user_id = auth.uid()).
--
-- Idempotent — safe to re-run. Needs NO owner id (that's the backfill step in
-- auth_multitenant_backfill.sql). Run order: this file → backfill file.
--
--   psql "postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres?sslmode=require" \
--        -f apps/api/sql/auth_multitenant_schema.sql
--
-- After this, the anon key can no longer read user data — the app must send a
-- logged-in user's JWT (RLS resolves auth.uid()). Writes still go through the
-- service-role key (which bypasses RLS) in @trove/api and the Python pipeline,
-- both of which now set user_id explicitly. `categories` stays global reference
-- data (shared taxonomy), readable by any authenticated user.

\set ON_ERROR_STOP on

-- ── 1. Add user_id (+ index) to every per-user table ──────────────────────────
do $$
declare
  tbl text;
  user_tables text[] := array[
    'posts','post_categories','analysis_items','analysis_metadata',
    'recipe_cards','bgg_links','hardcover_links','igdb_links','mal_links',
    'tmdb_links','instagram_storefronts','travel_locations'
  ];
begin
  foreach tbl in array user_tables loop
    execute format(
      'alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade',
      tbl);
    execute format(
      'create index if not exists %I on public.%I(user_id)', tbl || '_user_id_idx', tbl);
  end loop;
end $$;

-- ── 2. Per-user RLS on every per-user table ───────────────────────────────────
-- One "for all" policy per table: a row is visible/writable only to its owner.
-- (Service-role bypasses RLS, so the API/pipeline writes are unaffected.)
do $$
declare
  tbl text;
  pol record;
  user_tables text[] := array[
    'posts','post_categories','analysis_items','analysis_metadata',
    'recipe_cards','bgg_links','hardcover_links','igdb_links','mal_links',
    'tmdb_links','instagram_storefronts','travel_locations'
  ];
begin
  foreach tbl in array user_tables loop
    -- Drop any pre-existing policies (e.g. the old anon `using (true)` reads).
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy %I on public.%I', pol.policyname, tbl);
    end loop;

    execute format('alter table public.%I enable row level security', tbl);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (user_id = auth.uid()) with check (user_id = auth.uid())',
      tbl || '_owner_rw', tbl);
  end loop;
end $$;

-- ── 3. categories: global reference data, readable by any authenticated user ──
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'categories'
  loop
    execute format('drop policy %I on public.categories', pol.policyname);
  end loop;
  alter table public.categories enable row level security;
  create policy categories_authenticated_read on public.categories
    for select to authenticated using (true);
end $$;

-- Verify (optional):
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname='public' order by tablename;
