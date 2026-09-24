-- =====================================================================
-- 0010 · public.expire_pro_trials() — F-CM-06 Part 4 (D-62)
-- ---------------------------------------------------------------------
-- ROADMAP M1 1.10 / F-CM-06 §8 Part 4, trial-expiry half only (T-3 nudges,
-- downgrade scheduling and dunning need Parts 5-8, unbuilt).
--
-- D-62: the spec's "falls back to Free" no longer applies — the `free`
-- school plan was retired (D-42). `plan_id` stays `pro`; only
-- `access_mode` moves to `read_only`, via the existing `app.set_access_mode()`
-- (§5.6's read-only-over-limit mechanism, Part 3).
--
-- Notes:
--   - Lives in `public`, not `app`: `app.*` is unreachable from a Supabase
--     client at all (`config.toml` exposes only `public`), and D-50 puts
--     client-callable RPCs in `public`.
--   - Reuses `app.set_access_mode()` rather than updating `workspaces`
--     directly — its own `app.log_audit_event()` call is the audit write
--     (rule 9), under an action already in the catalogue.
--   - Idempotent by construction: the WHERE clause only matches
--     `status = 'trialing'`, so a processed row can never match again.
--     `active`/`past_due` (paying) never matches at all.
--   - `service_role` only, narrower than `app.set_access_mode`'s own bar —
--     no manual-trigger caller exists yet (Part 8).
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
  '(`GET /api/cron/billing/tick`). Every `trialing` subscription whose '
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
