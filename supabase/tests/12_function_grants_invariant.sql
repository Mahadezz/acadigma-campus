-- =====================================================================
-- pgTAP · Supabase default-privilege parity (D-54)
--
-- Supabase provisions every project with `ALTER DEFAULT PRIVILEGES FOR ROLE
-- postgres, supabase_admin IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated, service_role`. `revoke all on function ... from
-- public` (the pattern every migration in this repo used) does NOT undo
-- that default: it revokes the PUBLIC pseudo-role's grant, not the explicit
-- per-role grant the default handed to anon/authenticated/service_role at
-- CREATE FUNCTION time. `supabase/ci/bootstrap.sql` now reproduces the
-- platform default for role `postgres` (the migration role here and on the
-- real project) so this file is false on a plain `postgres:17` container in
-- exactly the way it was false on the live project before
-- 20260924030000_revoke_default_function_grants.sql — see that migration
-- and DECISION-LOG D-54.
--
-- Four invariants, checked directly against Postgres catalogs (no RLS/session
-- fixtures needed — this is grant introspection, run as `postgres`):
--
--   A. Every function in `public`/`app` — SECURITY DEFINER or INVOKER alike
--      (Opus review: an allowlist that only looked at `prosecdef` functions
--      would miss a future plain SQL/PLpgSQL invoker function granted too
--      broadly; today every function in both schemas happens to be DEFINER
--      except `app`'s trigger/utility helpers, and those are never anon- or
--      authenticated-allowlisted either, so dropping the `prosecdef` filter
--      costs nothing and closes a real gap) — anon and authenticated get
--      EXECUTE ONLY on an explicit allowlist. `app` is never on anon's
--      allowlist (anon has no USAGE on `app` at all — 02_tenant_isolation.sql
--      — but the ACL bit itself must still be absent, not merely
--      unreachable). The `authenticated` allowlist is scoped to `public`
--      only: every function in `app` is deliberately granted to
--      `authenticated` en masse by the do-block loop in
--      20260917010000_extensions_and_app_schema.sql §9 (D-50 — `app` is the
--      server-internal SECURITY DEFINER layer, not itself the security
--      boundary; PostgREST cannot reach it because only `public` is
--      exposed), so an allowlist over `app` would fail every function in
--      that schema by design and would test nothing real.
--   B. `log_auth_event_service` — service_role only.
--   C. The default itself, for functions created after
--      20260924030000: anon/authenticated no longer inherit EXECUTE
--      (neither the `public`-schema-scoped default nor the role-wide one —
--      D-54's Opus-review fix); service_role still does, schema-scoped.
--   D. A LIVE probe (Opus review): C only inspects `pg_default_acl`, which
--      proves the catalog entry is *recorded* correctly but not that it
--      actually governs a newly created function. This section creates a
--      throwaway, ungranted function inside this test's own transaction and
--      asserts its actual privileges — a probe that genuinely exercises the
--      default rather than re-describing it, and one that WOULD have failed
--      before 20260924030000_revoke_default_function_grants.sql's role-wide
--      revoke (2b) existed, because the role-wide "grant EXECUTE to PUBLIC"
--      built-in default would have made it anon-executable.
-- =====================================================================
begin;
select plan(10);

-- ---------------------------------------------------------------------
-- A1. anon — allowed ONLY for the pre-session throttle/auth surface, plus
--     `app.pre_request()` (D-51, 20260924000100_audit_substrate.sql §9):
--     PostgREST's `db-pre-request` hook runs this on EVERY request,
--     including anonymous ones, BEFORE RLS — it is wired via `alter role
--     authenticator set pgrst.db_pre_request = 'app.pre_request'`, so it has
--     to be anon-executable for an anonymous request to work at all. Its
--     body only ever copies a regex-validated `x-correlation-id` header into
--     a transaction-local GUC (`set_config`); it reads and writes nothing.
--     Plus the platform-owned `rls_auto_enable` if this Postgres happens to
--     have it (it is created by the Supabase platform, not by us, and does
--     not exist on a plain postgres:17 container — tolerated, not asserted).
-- ---------------------------------------------------------------------
with allowed as (
  select sig::regprocedure::oid as oid
  from (values
    ('public.throttle_status(text)'),
    ('public.throttle_record_failure(text, text)'),
    ('public.throttle_reset(text)'),
    ('public.log_auth_event(text, jsonb)'),
    ('app.pre_request()'),
    ('public.pre_request()')  -- D-65: the hook's public wrapper
  ) as a(sig)
  union all
  select p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rls_auto_enable'
),
violations as (
  select format('%I.%I(%s)', n.nspname, p.proname,
                 pg_get_function_identity_arguments(p.oid)) as sig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app')
    and has_function_privilege('anon', p.oid, 'execute')
    and p.oid not in (select oid from allowed)
)
select is(
  (select coalesce(array_agg(sig order by sig), array[]::text[]) from violations),
  array[]::text[],
  'anon has EXECUTE on no function (definer or invoker) in public/app outside the throttle/auth allowlist');

-- ---------------------------------------------------------------------
-- A2. authenticated — allowed ONLY on the explicit public-schema allowlist
--     (the throttle/auth functions above, plus the F-ID-03 tenancy RPCs).
--     Scoped to `public`, not `app` — see the header note.
-- ---------------------------------------------------------------------
with allowed as (
  select sig::regprocedure::oid as oid
  from (values
    ('public.throttle_status(text)'),
    ('public.throttle_record_failure(text, text)'),
    ('public.throttle_reset(text)'),
    ('public.log_auth_event(text, jsonb)'),
    ('public.switch_workspace(uuid)'),
    ('public.list_my_workspaces()'),
    ('public.log_tenancy_context_rejected(uuid)'),
    ('public.pre_request()'),  -- D-65: the hook's public wrapper
    ('public.check_eiin_available(text)'),  -- F-ID-05 Part 3, D-66
    ('public.create_school_workspace(jsonb)'),  -- F-ID-05 Part 4, D-100
    ('public.seed_bd_grade_scale(uuid)'),  -- F-AC-06 Part 1, D-302
    ('public.save_grade_scale(uuid, uuid, text, jsonb)'),  -- F-AC-06 Part 1, D-302
    ('public.create_exam(jsonb)'),  -- F-AC-06 Part 2, D-303
    ('public.admit_student(uuid, jsonb)'),  -- F-AC-02 demo cut, D-103
    ('public.save_attendance(uuid, jsonb)'),  -- F-AC-03 demo cut, D-104
    ('public.attendance_day(uuid, date)'),  -- F-AC-03 demo cut, D-104
    ('public.save_marks(uuid, jsonb)')  -- F-AC-06 Part 3, D-304
  ) as a(sig)
  union all
  select p.oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'rls_auto_enable'
),
violations as (
  select format('%I.%I(%s)', n.nspname, p.proname,
                 pg_get_function_identity_arguments(p.oid)) as sig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.oid not in (select oid from allowed)
)
select is(
  (select coalesce(array_agg(sig order by sig), array[]::text[]) from violations),
  array[]::text[],
  'authenticated has EXECUTE on no public function (definer or invoker) outside its explicit allowlist');

-- ---------------------------------------------------------------------
-- B. log_auth_event_service — service_role ONLY. A caller-supplied
--    row_id/ip/user_agent (security review N1, identity_auth.sql §5a) is
--    only safe from a credential that never reaches a browser.
-- ---------------------------------------------------------------------
select ok(
  has_function_privilege('service_role',
    'public.log_auth_event_service(text, uuid, jsonb, inet, text)', 'execute'),
  'service_role may execute log_auth_event_service');

select ok(
  not has_function_privilege('anon',
    'public.log_auth_event_service(text, uuid, jsonb, inet, text)', 'execute'),
  'anon may not execute log_auth_event_service');

select ok(
  not has_function_privilege('authenticated',
    'public.log_auth_event_service(text, uuid, jsonb, inet, text)', 'execute'),
  'authenticated may not execute log_auth_event_service');

-- ---------------------------------------------------------------------
-- C. The default itself, for functions created after this migration:
--    anon/authenticated get nothing; service_role is untouched.
-- ---------------------------------------------------------------------
with dacl as (
  select da.defaclacl
  from pg_default_acl da
  join pg_roles r on r.oid = da.defaclrole
  join pg_namespace n on n.oid = da.defaclnamespace
  where r.rolname = 'postgres' and n.nspname = 'public' and da.defaclobjtype = 'f'
),
exploded as (
  select x.grantee, x.privilege_type
  from dacl
  cross join lateral aclexplode(dacl.defaclacl) as x(grantor, grantee, privilege_type, is_grantable)
)
select is(
  (select count(*)::int from exploded e
     join pg_roles r on r.oid = e.grantee
    where r.rolname in ('anon', 'authenticated') and e.privilege_type = 'EXECUTE'),
  0,
  'default privileges (role postgres, schema public, functions) grant EXECUTE to neither anon nor authenticated');

with dacl as (
  select da.defaclacl
  from pg_default_acl da
  join pg_roles r on r.oid = da.defaclrole
  join pg_namespace n on n.oid = da.defaclnamespace
  where r.rolname = 'postgres' and n.nspname = 'public' and da.defaclobjtype = 'f'
),
exploded as (
  select x.grantee, x.privilege_type
  from dacl
  cross join lateral aclexplode(dacl.defaclacl) as x(grantor, grantee, privilege_type, is_grantable)
)
select ok(
  exists (
    select 1 from exploded e
    join pg_roles r on r.oid = e.grantee
    where r.rolname = 'service_role' and e.privilege_type = 'EXECUTE'
  ),
  'default privileges (role postgres, schema public, functions) still grant EXECUTE to service_role');

-- ---------------------------------------------------------------------
-- D. Live probe (Opus review): create a throwaway function with NO grants
--    section at all, inside this test's own transaction (rolled back at the
--    end, so it never persists), and check what it can actually be executed
--    by. This is the assertion that would have FAILED before
--    20260924030000's role-wide revoke (2b) existed: without it, a brand
--    new function in `public` still inherits EXECUTE via Postgres's built-in
--    role-wide "grant to PUBLIC" default (anon is a member of PUBLIC), even
--    though the schema-scoped revoke (2a) looks like it should have been
--    enough. Section C above only reads the recorded pg_default_acl catalog
--    entry; this section proves that entry actually governs a new object.
-- ---------------------------------------------------------------------
create function public.zz_probe_default_acl() returns int
  language sql as 'select 1';

select ok(
  not has_function_privilege('anon', 'public.zz_probe_default_acl()', 'execute'),
  'a brand-new, ungranted public function is NOT anon-executable by default');

select ok(
  not has_function_privilege('authenticated', 'public.zz_probe_default_acl()', 'execute'),
  'a brand-new, ungranted public function is NOT authenticated-executable by default');

select ok(
  has_function_privilege('service_role', 'public.zz_probe_default_acl()', 'execute'),
  'a brand-new, ungranted public function IS service_role-executable by default (platform parity, D-54)');

select * from finish();
rollback;
