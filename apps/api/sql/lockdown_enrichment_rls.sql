-- Lock the enrichment tables to anon-read-only.
--
-- After this, the browser (anon key) can SELECT but cannot INSERT/UPDATE/DELETE.
-- All writes go through @trove/api using the service-role key, which bypasses
-- RLS. The Python sync pipeline also uses the service-role key, so it is
-- unaffected.
--
-- Run this in the Supabase SQL editor. Idempotent: it drops any existing
-- policies on each table, re-enables RLS, and creates a single read policy.

do $$
declare
  tbl text;
  pol record;
  tables text[] := array[
    'bgg_links',
    'tmdb_links',
    'igdb_links',
    'mal_links',
    'hardcover_links',
    'recipe_cards',
    'instagram_storefronts',
    'travel_locations'
  ];
begin
  foreach tbl in array tables loop
    -- Drop every existing policy on the table.
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = tbl
    loop
      execute format('drop policy %I on public.%I', pol.policyname, tbl);
    end loop;

    -- Enable RLS and grant anon/authenticated read-only access.
    execute format('alter table public.%I enable row level security', tbl);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      tbl || '_anon_read', tbl
    );
  end loop;
end $$;

-- Verify (optional): should list one "<table>_anon_read" SELECT policy per table.
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in (
--     'bgg_links','tmdb_links','igdb_links','mal_links','hardcover_links',
--     'recipe_cards','instagram_storefronts','travel_locations'
--   )
-- order by tablename;
