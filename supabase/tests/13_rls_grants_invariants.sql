-- =====================================================================
-- pgTAP · RLS + schema-grant invariants (M0 wrap-up, D-56)
--
-- Two whole-catalog invariants that no single feature's test file is
-- responsible for, so nothing narrower ever proves them exhaustively:
--
--   A. Every TABLE in schema `public` has row level security enabled.
--      Existing tests spot-check RLS on individual tables as they are built
--      (e.g. `06_auth.sql`'s `auth_throttle` check); this asserts it for
--      every table in the schema at once, so a new migration that forgets
--      `enable row level security` fails CI immediately rather than only
--      being caught if someone happens to write a table-specific test for
--      it. CLAUDE.md rule 1: "the database and the server are the security
--      boundary" — this is that rule, checked against the catalog directly.
--   B. `anon` has no USAGE on schema `app`. Already the subject of a
--      narrative test in `02_tenant_isolation.sql` (`app` is the
--      server-internal SECURITY DEFINER layer, D-50); restated here as a
--      standing invariant, not a scenario, so it survives even if that
--      file's narrative test is ever renamed or restructured.
--
-- Deliberately NOT duplicated here (D-56): the "every public function
-- EXECUTE-able by anon/authenticated is on an explicit allowlist" invariant
-- already has its own dedicated, actively-maintained file —
-- `12_function_grants_invariant.sql` — with a live probe and per-role
-- allowlists. Re-asserting the same allowlist here would just be a second
-- copy to keep in sync every time a function's grants change; this file
-- covers tables/schemas only.
-- =====================================================================
begin;
select plan(2);

-- ---------------------------------------------------------------------
-- A. Every table in `public` has RLS enabled. `pg_tables.rowsecurity` is
--    false for a table that never called `enable row level security` at
--    all, so this also fails closed on a table pgTAP itself cannot see
--    the policies of.
-- ---------------------------------------------------------------------
select is(
  (select coalesce(array_agg(tablename order by tablename), array[]::text[])
     from pg_tables
    where schemaname = 'public'
      and rowsecurity is not true),
  array[]::text[],
  'every table in schema public has row level security enabled');

-- ---------------------------------------------------------------------
-- B. anon has no USAGE on schema app (D-50: app is never exposed to
--    PostgREST; every client-callable function has a public.* wrapper).
-- ---------------------------------------------------------------------
select ok(
  not has_schema_privilege('anon', 'app', 'usage'),
  'anon has no USAGE on schema app');

select * from finish();
rollback;
