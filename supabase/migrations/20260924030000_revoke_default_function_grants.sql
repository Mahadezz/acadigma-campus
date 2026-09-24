-- =====================================================================
-- Security fix (D-54): close the gap Supabase's platform default left open.
--
-- Supabase provisions every project with
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres, supabase_admin
--     IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
--     TO anon, authenticated, service_role;
-- so every function `postgres` (the migration role, on this project and on
-- CI once `supabase/ci/bootstrap.sql` reproduces it) creates in `public` is
-- EXECUTE-able by anon/authenticated the instant `CREATE FUNCTION` runs —
-- before this repo's own grants section for that function ever executes.
--
-- `revoke all on function ... from public` (used throughout
-- 20260917020000_identity_auth.sql and 20260917020300_tenancy_hardening.sql)
-- revokes the PUBLIC pseudo-role's grant. It does NOT touch the explicit
-- per-role grants the default privilege handed to anon/authenticated/
-- service_role at creation time — those survive untouched. Verified live
-- against project `kekfmibwjejdhxjkmezo` on 2026-09-24:
-- `has_function_privilege('anon', 'public.switch_workspace(uuid)', 'execute')`
-- is TRUE despite switch_workspace's own grants section saying
-- `grant execute on function public.switch_workspace(uuid) to authenticated;`
-- and nothing to anon.
--
-- This migration:
--   1. Revokes the mis-granted EXECUTE from the four affected functions,
--      leaving exactly the grants each function's own migration intended.
--   2. Flips the default itself for every function created after this
--      point: anon/authenticated no longer inherit EXECUTE by default,
--      service_role still does (server-side code and webhooks are
--      trusted). Every future `public` function must grant EXECUTE
--      explicitly — deny-by-default, matching D-50's "every client-callable
--      RPC gets a thin, explicitly-granted `public` wrapper" model instead
--      of silently trusting the platform default to agree with it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1a. log_auth_event_service — service_role ONLY
--     (20260917020000_identity_auth.sql §5a/§6). A caller-supplied
--     row_id/ip/user_agent is only safe from a credential that never
--     reaches a browser; anon holding this today means anyone with the
--     publishable key can forge an `account.registered` audit row naming
--     an arbitrary user id, ip and user agent.
-- ---------------------------------------------------------------------
revoke execute on function public.log_auth_event_service(text, uuid, jsonb, inet, text)
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- 1b. switch_workspace / list_my_workspaces / log_tenancy_context_rejected
--     — authenticated ONLY (20260917020300_tenancy_hardening.sql §5): F-ID-03
--     has no pre-session use case for any of the three, unlike F-ID-01's
--     throttle functions.
--
--     switch_workspace and list_my_workspaces both raise on `auth.uid() is
--     null`, so an anon caller got an error either way — but the grant
--     itself was still wrong and would have been a live hole the moment
--     either function's null-check was ever loosened.
--
--     log_tenancy_context_rejected has NO such check today (it happily
--     writes `app.log_audit_event` with `auth.uid()` = null and an
--     attacker-supplied `attempted_workspace_id`) — this is a real,
--     currently-exploitable hole: anon can write an audit row into any
--     workspace's `audit_events` right now. The grant fix here closes the
--     PostgREST path; the null-check itself is intentionally NOT added in
--     this migration — PR #12 (branch fix/tenancy-review-followups) is
--     already replacing this function's body in
--     20260924020000_tenancy_tripwire_membership_status.sql, and touching
--     it here would conflict. See this PR's description for the follow-up.
-- ---------------------------------------------------------------------
revoke execute on function public.switch_workspace(uuid) from anon;
revoke execute on function public.list_my_workspaces() from anon;
revoke execute on function public.log_tenancy_context_rejected(uuid) from anon;

-- ---------------------------------------------------------------------
-- 2. Deny by default for every `public` function created from here on.
--    service_role keeps the platform default; anon/authenticated do not.
--    A migration that adds a function and forgets its grants section now
--    fails supabase/tests/12_function_grants_invariant.sql (and simply
--    cannot be called by anon/authenticated at all) instead of silently
--    inheriting EXECUTE the way `log_tenancy_context_rejected` did.
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
