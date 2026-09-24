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
-- Two invariants, checked directly against Postgres catalogs (no RLS/session
-- fixtures needed — this is grant introspection, run as `postgres`):
--
--   A. Every SECURITY DEFINER function in `public`/`app` — anon and
--      authenticated get EXECUTE ONLY on an explicit allowlist. `app` is
--      never on anon's allowlist (anon has no USAGE on `app` at all —
--      02_tenant_isolation.sql — but the ACL bit itself must still be
--      absent, not merely unreachable). The `authenticated` allowlist is
--      scoped to `public` only: every function in `app` is deliberately
--      granted to `authenticated` en masse by the do-block loop in
--      20260917010000_extensions_and_app_schema.sql §9 (D-50 — `app` is the
--      server-internal SECURITY DEFINER layer, not itself the security
--      boundary; PostgREST cannot reach it because only `public` is
--      exposed), so an allowlist over `app` would fail every function in
--      that schema by design and would test nothing real.
--   B. The default itself, for functions created after
--      20260924030000: anon/authenticated no longer inherit EXECUTE;
--      service_role still does.
-- =====================================================================
begin;
select plan(7);

-- ---------------------------------------------------------------------
-- A1. anon — allowed ONLY for the pre-session throttle/auth surface, plus
--     the platform-owned `rls_auto_enable` if this Postgres happens to have
--     it (it is created by the Supabase platform, not by us, and does not
--     exist on a plain postgres:17 container — tolerated, not asserted).
-- ---------------------------------------------------------------------
with allowed as (
  select sig::regprocedure::oid as oid
  from (values
    ('public.throttle_status(text)'),
    ('public.throttle_record_failure(text, text)'),
    ('public.throttle_reset(text)'),
    ('public.log_auth_event(text, jsonb)')
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
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and p.oid not in (select oid from allowed)
)
select is(
  (select coalesce(array_agg(sig order by sig), array[]::text[]) from violations),
  array[]::text[],
  'anon has EXECUTE on no SECURITY DEFINER function in public/app outside the throttle/auth allowlist');

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
    ('public.log_tenancy_context_rejected(uuid)')
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
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
    and p.oid not in (select oid from allowed)
)
select is(
  (select coalesce(array_agg(sig order by sig), array[]::text[]) from violations),
  array[]::text[],
  'authenticated has EXECUTE on no public SECURITY DEFINER function outside its explicit allowlist');

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

select * from finish();
rollback;
