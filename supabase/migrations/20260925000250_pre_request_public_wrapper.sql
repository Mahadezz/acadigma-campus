-- =====================================================================
-- HOTFIX (D-65): every anonymous PostgREST request on the live project fails
-- with 42501 "permission denied for schema app".
--
-- 20260924000100_audit_substrate.sql set `pgrst.db_pre_request = app.pre_request`
-- on the authenticator role. PostgREST runs that hook as the REQUEST role, and
-- `anon` has no USAGE on schema `app` by design (D-50, asserted by
-- 13_rls_grants_invariants.sql). So the hook itself failed for anon, which broke
-- every pre-session call: the login/register/reset throttle RPCs (the app then
-- fails closed, "Too many attempts"), i.e. nobody could sign in.
-- CI could not see it: its Postgres has no PostgREST, and the DO block below is
-- a no-op there. The db.yml push job now smoke-tests an anon call after deploy.
--
-- Fix (D-50 pattern): a thin SECURITY DEFINER wrapper in `public`, executable by
-- the API roles, that calls app.pre_request(). anon still gets no USAGE on `app`.
-- =====================================================================
create or replace function public.pre_request()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select app.pre_request();
$$;

comment on function public.pre_request() is
  'PostgREST db-pre-request hook (D-65): public wrapper around app.pre_request() '
  'so the hook runs for anon, which has no USAGE on schema app (D-50).';

revoke all on function public.pre_request() from public;
grant execute on function public.pre_request() to anon, authenticated, service_role;

do $$
begin
  execute 'alter role authenticator set pgrst.db_pre_request = ''public.pre_request''';
  notify pgrst, 'reload config';
exception
  when insufficient_privilege or undefined_object then
    raise notice 'authenticator role not present (plain Postgres CI); db_pre_request not set';
end
$$;
