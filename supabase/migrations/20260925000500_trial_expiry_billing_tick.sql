-- =====================================================================
-- 0010 · public.expire_pro_trials() — F-CM-06 Part 4 (D-62)
-- ---------------------------------------------------------------------
-- ROADMAP M1 1.10 / F-CM-06 §8 Part 4: the daily billing tick's trial-expiry
-- half. §8 Part 4 as originally written also covers T-3 nudges, scheduled-
-- downgrade application and a one-email-per-day dunning guard — none of
-- those exist yet (no email adapter, no `changePlan`/downgrade-scheduling
-- flow; Parts 5-8 are unbuilt), so this migration ships only the transition
-- the current schema has real state for: a Pro trial past `trial_ends_at`
-- moves the workspace into `access_mode = 'read_only'` (D-29). D-62 records
-- the "read-only, not a plan downgrade" framing below.
--
-- §5.1/§5.6 of the spec describe the expired trial "falling back to Free".
-- That target no longer exists: the `free` school plan row was retired
-- (D-42/OQ-22, seed in 20260917010300_plans_and_notifications.sql §2.4) in
-- favour of one 30-day Pro trial with no lower self-serve tier under it.
-- There is nothing left to downgrade an expired trial ONTO. D-62: the
-- workspace instead stays on `plan_id = pro` (so its limits are unchanged —
-- `pro`'s `max_teachers`/`max_students` are NULL/unlimited in the current
-- seed) and is put into `access_mode = 'read_only'` — the same mechanism
-- Part 3 already built for over-limit enforcement (§5.6, `requireWritable`
-- in packages/db/repositories/usage.ts). A read-only workspace can read,
-- export, update and delete exactly as an over-limit one can; it can only
-- not CREATE — which is the correct trial-expired behaviour without
-- inventing a second enforcement path for one that already exists.
--
-- Design notes:
--   1. `app.*` is server-internal (D-50) and not in Postgres's exposed
--      schema list (`supabase/config.toml`: `schemas = ["public",
--      "graphql_public"]`) — supabase-js's `.rpc()` always goes through
--      PostgREST, so even a service-role client cannot reach `app.*`
--      directly. This function lives in `public` for exactly that reason:
--      it is the one thing the cron route calls, and D-50 says a
--      client-callable RPC belongs in `public`.
--   2. It reuses `app.set_access_mode()` (0004, permission-checked by
--      20260917020100_plans_limits_engine.sql §6) rather than updating
--      `workspaces.access_mode` itself — that function's own
--      `app.log_audit_event('workspace.access_mode_read_only', ...)` call is
--      what satisfies HANDBOOK rule 9 ("audit rows are written by database
--      triggers/functions, never application code"), and the action is
--      already in the catalogue (packages/domain/src/audit/catalog.ts —
--      "Written by app.set_access_mode() (F-CM-06 plans/limits engine)"),
--      so `scripts/check-audit-catalog-parity.mjs` needs no change here.
--   3. Idempotent by construction, not by a separate flag: the WHERE clause
--      only ever matches `status = 'trialing'`, and the UPDATE inside the
--      loop is the thing that flips a row's status to 'expired' — so a
--      second run in the same day (or the same minute) finds nothing left
--      to do and returns 0. A subscription that is 'active'/'past_due' (a
--      paying school) never matches this WHERE clause at all, at any time —
--      that is the "never touch a paying school" guarantee, enforced by the
--      query shape rather than by an extra check.
--   4. Callable by `service_role` only — narrower than `app.set_access_mode`'s
--      own bar (`is_privileged_context() or is_platform_admin()`), on purpose:
--      the task this Part actually specifies is "the job ... uses
--      withServiceRole(reason) only" (no platform-staff manual-trigger UI
--      exists yet — that is Part 8's `/platform/workspaces/[id]/billing`,
--      unbuilt). Scoping both the grant AND the internal check to
--      `is_privileged_context()` alone means this function needs no entry in
--      `supabase/tests/12_function_grants_invariant.sql`'s `authenticated`
--      allowlist — it is never reachable as `authenticated` at all, which is
--      the smaller, easier-to-audit surface for a function that can put any
--      school into read-only mode.
-- =====================================================================

create or replace function public.expire_pro_trials()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  if not app.is_privileged_context() then
    raise exception 'only a privileged (service-role) caller may run the trial-expiry job'
      using errcode = '42501';
  end if;

  for v_row in
    update public.subscriptions
       set status = 'expired'
     where status = 'trialing'
       and trial_ends_at is not null
       and trial_ends_at <= now()
    returning id as subscription_id, workspace_id
  loop
    perform app.set_access_mode(
      v_row.workspace_id, 'read_only', 'Your Pro trial has ended.');

    insert into public.subscription_events
      (subscription_id, workspace_id, type, from_status, to_status)
    values
      (v_row.subscription_id, v_row.workspace_id, 'trial_expired', 'trialing', 'expired');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_pro_trials() is
  'F-CM-06 Part 4 (D-62): the trial-expiry half of the daily billing tick '
  '(`POST/GET /api/cron/billing/tick`). Every `trialing` subscription whose '
  '`trial_ends_at` has passed is marked `expired`, its workspace is put into '
  '`access_mode = read_only` via app.set_access_mode() (which writes the '
  '`workspace.access_mode_read_only` audit row itself), and a `trial_expired` '
  'subscription_events row is appended. Returns the number of subscriptions '
  'it expired, for the route''s `{trialsExpired}` response. Naturally '
  'idempotent: a row leaves the `trialing` status the first time it is '
  'processed, so a re-run — same day or any day after — matches nothing for '
  'it. A subscription in `active`/`past_due` (a paying school) never matches '
  'the WHERE clause, at any time.';

revoke all on function public.expire_pro_trials() from public;
grant execute on function public.expire_pro_trials() to service_role;
-- D-54: an explicit grant, scoped to the one role that ever calls this —
-- neither `anon` nor `authenticated` get EXECUTE, so the internal
-- is_privileged_context() check is defence in depth, not the only gate.
