-- ⚠️ DEPRECATED — DO NOT RUN. Superseded by auth_multitenant_schema.sql.
--
-- This file belonged to the OLD single-tenant model, where the browser read
-- enrichment data directly with the anon key. It set each enrichment table to:
--
--     for select to anon, authenticated using (true)   -- i.e. GLOBAL read
--
-- After the multi-tenant migration (auth_multitenant_schema.sql), those same
-- tables are owner-scoped:
--
--     for all to authenticated using (user_id = auth.uid())
--
-- Re-running the old policy would REOPEN cross-tenant reads: any holder of the
-- public anon key could read every user's recipe_cards / travel_locations /
-- *_links rows. So this file is intentionally inert — it raises instead of
-- altering any policy. Kept (not deleted) only as a historical pointer.
--
-- To (re)apply the correct enrichment-table RLS, run auth_multitenant_schema.sql.

do $$
begin
  raise exception
    'lockdown_enrichment_rls.sql is deprecated and unsafe to run. '
    'Enrichment tables are owner-scoped by auth_multitenant_schema.sql — run that instead.';
end $$;
