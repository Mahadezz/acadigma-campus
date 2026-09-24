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
--
--      Opus review of this PR: step 2 above, on its own, is NOT actually
--      deny-by-default. `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public
--      REVOKE ...` only removes what the SCHEMA-scoped default was granting
--      in `public`; it does not touch Postgres's own ROLE-WIDE built-in
--      default for functions, which is "grant EXECUTE to PUBLIC" — and every
--      role, `anon` included, is a member of PUBLIC. A schema-scoped default
--      is additive on top of the role-wide one, never a replacement for it,
--      so a future function created in ANY schema this repo did not
--      explicitly re-grant in (or even in `public`, once the schema-scoped
--      revoke above is somehow bypassed) would still be PUBLIC-executable —
--      i.e. anon-executable — through the untouched role-wide default. Step
--      2b below closes that: it revokes EXECUTE from PUBLIC at the role-wide
--      level too, so there is no longer an implicit grant left for the
--      schema-scoped revoke to merely shadow.
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
--     log_tenancy_context_rejected had NO such check when this migration
--     was written (it happily writes `app.log_audit_event` with `auth.uid()`
--     = null and an attacker-supplied `attempted_workspace_id`) — this was a
--     real, currently-exploitable hole: anon could write an audit row into
--     any workspace's `audit_events`. The grant fix here closes the
--     PostgREST path; the null-check itself was intentionally NOT added in
--     this migration — PR #12 (`fix/tenancy-review-followups`, merged as
--     D-52) was already replacing this function's body in
--     20260924020000_tenancy_tripwire_membership_status.sql, and touching it
--     here would have conflicted. That migration's own header confirms
--     "Signature and grants are unchanged" — it still has no null check —
--     so this revoke still targets the live signature and the gap (now
--     closed only at the grant layer) is unchanged; a small follow-up to add
--     the check belongs to a separate PR.
-- ---------------------------------------------------------------------
revoke execute on function public.switch_workspace(uuid) from anon;
revoke execute on function public.list_my_workspaces() from anon;
revoke execute on function public.log_tenancy_context_rejected(uuid) from anon;

-- ---------------------------------------------------------------------
-- 2a. Deny by default, schema-scoped: every `public` function created from
--     here on. service_role keeps the platform default; anon/authenticated
--     do not. A migration that adds a function and forgets its grants
--     section now fails supabase/tests/12_function_grants_invariant.sql
--     (and simply cannot be called by anon/authenticated at all) instead of
--     silently inheriting EXECUTE the way `log_tenancy_context_rejected` did.
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2b. Deny by default, role-wide (Opus review — see the header note above).
--     A schema-scoped default only adds to the role-wide one; it never
--     replaces Postgres's built-in "grant EXECUTE on functions to PUBLIC".
--     Without this, any function created in a schema that does not repeat
--     2a's schema-scoped revoke (or a hypothetical future schema this repo
--     adds) would still be PUBLIC-executable — anon is a member of PUBLIC —
--     through the untouched role-wide default alone. This is what makes the
--     policy actually deny-by-default rather than "deny-by-default in
--     `public`, wide open everywhere else by accident."
--
--     Knock-on for test infrastructure only (never shipped to the real
--     project): pgTAP's `tests.*` helper functions relied on that same
--     implicit PUBLIC grant to be callable by `authenticated` after
--     `SET ROLE authenticated`. `supabase/ci/bootstrap.sql` restores it,
--     scoped to the `tests` schema alone, via its own schema-scoped default
--     for that schema — additive on top of this role-wide revoke, the same
--     way 2a's `public`-scoped grant to `service_role` is additive on top
--     of it.
-- ---------------------------------------------------------------------
alter default privileges for role postgres
  revoke execute on functions from public;
