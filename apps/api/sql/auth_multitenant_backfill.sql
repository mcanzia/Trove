-- Backfill existing rows to the owner, then enforce NOT NULL on user_id.
--
-- Run AFTER auth_multitenant_schema.sql, and AFTER the owner has an auth.users
-- row (sign in once via magic link, or create the user in the dashboard).
-- Idempotent — re-running backfills only still-NULL rows; SET NOT NULL is a no-op
-- once satisfied. Pass the owner's login email:
--
-- Pass owner_email UNQUOTED — the SQL uses :'owner_email', which quotes it for you:
--   psql "postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres?sslmode=require" \
--        -v owner_email=you@example.com -f apps/api/sql/auth_multitenant_backfill.sql

\set ON_ERROR_STOP on

-- Guard: the owner auth user must exist before we can backfill.
select count(*)::int as owner_exists from auth.users where email = :'owner_email';
\gset
\if :owner_exists
\echo 'Owner found — backfilling…'
\else
\echo '!!! No auth.users row for the given owner_email. Create it first (magic-link sign-in or dashboard), then re-run.'
select 1 / 0;  -- abort (ON_ERROR_STOP) with a non-zero exit
\endif

-- Backfill every per-user table's existing rows to the owner.
update public.posts                 set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.post_categories       set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.analysis_items        set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.analysis_metadata     set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.recipe_cards          set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.bgg_links             set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.hardcover_links       set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.igdb_links            set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.mal_links             set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.tmdb_links            set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.instagram_storefronts set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;
update public.travel_locations      set user_id = (select id from auth.users where email = :'owner_email') where user_id is null;

-- Now that every row has an owner, enforce NOT NULL.
alter table public.posts                 alter column user_id set not null;
alter table public.post_categories       alter column user_id set not null;
alter table public.analysis_items        alter column user_id set not null;
alter table public.analysis_metadata     alter column user_id set not null;
alter table public.recipe_cards          alter column user_id set not null;
alter table public.bgg_links             alter column user_id set not null;
alter table public.hardcover_links       alter column user_id set not null;
alter table public.igdb_links            alter column user_id set not null;
alter table public.mal_links             alter column user_id set not null;
alter table public.tmdb_links            alter column user_id set not null;
alter table public.instagram_storefronts alter column user_id set not null;
alter table public.travel_locations      alter column user_id set not null;

\echo 'Backfill + NOT NULL complete.'
