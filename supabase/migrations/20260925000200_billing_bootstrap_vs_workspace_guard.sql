-- =====================================================================
-- 0009 · app.tg_workspace_billing_bootstrap() vs. app.tg_workspaces_guard()
--        (D-59)
-- ---------------------------------------------------------------------
-- Confirmed pre-existing bug, found by PR #19's reviews and recorded as
-- Known issue #3 in docs/test-reports/2026-09-24-F-ID-05-p1.md and as
-- 15_personal_workspace_registration.sql test 7's comment:
-- app.tg_workspace_billing_bootstrap() (20260917010300_plans_and_notifications.sql,
-- an AFTER INSERT trigger, SECURITY DEFINER) set workspaces.plan_id /
-- .trial_ends_at with a NESTED `UPDATE public.workspaces ... WHERE id =
-- new.id` against the row it had just inserted. That UPDATE fires
-- app.tg_workspaces_guard() (BEFORE UPDATE), which since
-- 20260917020100_plans_limits_engine.sql §5b reads the `role` GUC via
-- app.is_privileged_context() rather than `current_user` — a deliberate fix
-- for a DIFFERENT false positive (a SECURITY DEFINER function's `current_user`
-- becomes its owner, not the real caller, at every nesting depth). PostgREST
-- issues `SET ROLE authenticated` once per request; nothing about entering a
-- SECURITY DEFINER function changes that GUC. So `role` correctly reports
-- 'authenticated' for the nested UPDATE too — is_privileged_context() cannot
-- tell "the platform's own bootstrap trigger, running inside the same INSERT
-- statement that just created this row" from "an ordinary authenticated
-- client UPDATE", and the guard's plan/trial check (added for exactly the
-- latter) raises 42501 for both. Consequence: ANY workspace INSERT made as
-- `authenticated` fails in the bootstrap chain — a school created from the
-- app would fail outright, and F-ID-05 Part 4's planned
-- app.create_school_workspace() would hit this on day one.
--
-- Fix (option b of D-59, the narrowest one that changes zero semantics for a
-- client): stop doing a second UPDATE statement at all. Postgres evaluates a
-- table's column DEFAULT expressions, and lets BEFORE INSERT triggers modify
-- NEW, before the row is ever written — so plan_id/trial_ends_at can be set
-- directly on NEW in a BEFORE INSERT trigger instead of via a nested UPDATE
-- after the fact. app.tg_workspaces_guard() is `before update` only (it reads
-- OLD, which does not exist for an INSERT) — a BEFORE INSERT trigger never
-- reaches it, so there is nothing left for the guard to see or misclassify.
-- This is strictly narrower than teaching the guard a pg_trigger_depth()
-- exception (D-52's data_requests cascade pattern, option a): it removes the
-- collision instead of teaching the guard to tolerate it, and a client's own
-- direct UPDATE of plan_id/trial_ends_at is exactly as refused as before —
-- unchanged code path, unchanged message, unchanged errcode (proven by
-- 16_billing_bootstrap_guard.sql test 2). Option c (a transaction-local
-- set_config flag) was rejected: PostgREST lets `authenticated` reach
-- app.* only through the SECURITY DEFINER surface D-50 already defines, not
-- arbitrary SQL, so it likely could not be forged today — but "likely" is
-- not a security boundary, and it would still need SOMETHING to distinguish
-- caller from callee, which is precisely what removing the second statement
-- makes unnecessary.
--
-- Split app.tg_workspace_billing_bootstrap() into two functions:
--   1. app.tg_workspace_billing_defaults() — NEW, BEFORE INSERT — sets
--      NEW.plan_id (personal -> personal_free, school -> pro) and, for
--      schools, NEW.trial_ends_at. No DML against public.workspaces at all.
--   2. app.tg_workspace_billing_bootstrap() — CREATE OR REPLACE on the same
--      signature (forward-only fix for a function, HANDBOOK §1 rule 5),
--      kept AFTER INSERT — now reads new.plan_id / new.trial_ends_at
--      (already set by #1) to insert the school's public.subscriptions /
--      public.subscription_events rows. Those two inserts reference new.id
--      as a foreign key and so MUST stay in an AFTER trigger: the workspaces
--      row does not exist for a referencing INSERT to check against until
--      the outer INSERT statement itself completes, and immediate (not
--      deferred) FK constraints are checked at the end of the inner
--      statement, not at transaction commit.
--
-- Net behaviour for a personal or school workspace insert, as `authenticated`
-- through the workspaces_insert / school-only RLS policy
-- (20260925000100_personal_workspace_uniqueness.sql): unchanged end state
-- (same plan_id, same trial_ends_at, same subscriptions/subscription_events
-- rows as before), now reached without ever tripping the guard. Nothing here
-- widens what a CLIENT may do — app.tg_workspaces_guard() itself is
-- untouched by this migration; see 16_billing_bootstrap_guard.sql test 2 for
-- the direct-UPDATE-still-refused proof.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. app.tg_workspace_billing_defaults() — BEFORE INSERT. Sets NEW.plan_id
--    (and, for schools, NEW.trial_ends_at) with no UPDATE statement, so
--    app.tg_workspaces_guard() (BEFORE UPDATE only) never runs for this.
--    SECURITY DEFINER to read public.plans / public.plan_prices regardless
--    of the caller's own RLS visibility into those tables (mirrors the
--    now-narrowed app.tg_workspace_billing_bootstrap() below).
-- ---------------------------------------------------------------------
create or replace function app.tg_workspace_billing_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
begin
  -- Hardening (Opus review, PR #23): the workspaces_insert WITH CHECK does
  -- not constrain plan_id/trial_ends_at at all, so a client's INSERT
  -- statement could set either column to anything (a paid plan, a decade-
  -- long trial). Clear both FIRST, unconditionally, before any catalogue
  -- lookup — so if the expected plan row were ever missing, a client-chosen
  -- value could never survive into the row, or into the AFTER trigger's
  -- subscription (which would otherwise create a trialing subscription on
  -- whatever plan_id the client supplied).
  new.plan_id := null;
  new.trial_ends_at := null;

  if new.type <> 'school' then
    -- A personal workspace is entitled through workspaces.plan_id alone.
    -- It gets NO subscriptions row: there is nothing to bill, and an empty
    -- "subscription" would show up in every billing report and MRR figure.
    select * into v_plan from public.plans p where p.code = 'personal_free';
    if not found then
      -- A missing seed row is a bootstrap misconfiguration, not a client
      -- error — it must fail loudly (abort the signup) rather than silently
      -- leave plan_id null or, worse, let a client-supplied value through.
      -- Same errcode/rationale as app.log_audit_event()'s uncatalogued-
      -- action check (20260924000100_audit_substrate.sql).
      raise exception 'billing bootstrap misconfigured: no personal_free plan row'
        using errcode = '22023';
    end if;
    new.plan_id := v_plan.id;
    return new;
  end if;

  select * into v_plan from public.plans p where p.code = 'pro';
  if not found then
    raise exception 'billing bootstrap misconfigured: no pro plan row'
      using errcode = '22023';
  end if;

  new.plan_id := v_plan.id;
  new.trial_ends_at := now() + make_interval(days => v_plan.trial_days);

  return new;
end;
$$;

comment on function app.tg_workspace_billing_defaults() is
  'D-59: BEFORE INSERT counterpart to app.tg_workspace_billing_bootstrap() '
  '(AFTER INSERT). Clears NEW.plan_id / NEW.trial_ends_at unconditionally '
  'first (workspaces_insert''s WITH CHECK does not constrain either column, '
  'so a client INSERT could otherwise supply its own), then sets them from '
  'the catalogue — with no second UPDATE statement against '
  'public.workspaces, so app.tg_workspaces_guard() (BEFORE UPDATE only) '
  'never sees this and never has to tell a client statement apart from the '
  'platform''s own bootstrap. Raises 22023 if the expected plan row is '
  'missing (PR #23 review): a bootstrap misconfiguration fails loudly '
  'instead of silently leaving plan_id null or a client-chosen value in '
  'place.';

drop trigger if exists workspace_billing_defaults on public.workspaces;
create trigger workspace_billing_defaults
  before insert on public.workspaces
  for each row execute function app.tg_workspace_billing_defaults();

-- ---------------------------------------------------------------------
-- 2. app.tg_workspace_billing_bootstrap() — narrowed to the one thing that
--    genuinely needs the row to already exist: the school subscription /
--    subscription_events rows (FK to workspaces.id, checked immediately at
--    the end of their own INSERT statement — the outer workspaces INSERT
--    has already completed by the time an AFTER trigger runs, so this is
--    the only place those inserts can legally happen). No more nested
--    UPDATE of public.workspaces anywhere in this function.
-- ---------------------------------------------------------------------
create or replace function app.tg_workspace_billing_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan  public.plans;
  v_price public.plan_prices;
  v_sub   uuid;
begin
  if new.type <> 'school' or new.plan_id is null then
    return new;
  end if;

  select * into v_plan from public.plans p where p.id = new.plan_id;
  if not found then
    return new;
  end if;

  select * into v_price
    from public.plan_prices pp
   where pp.plan_id = v_plan.id
     and pp.student_min <= 0
     and (pp.student_max is null or pp.student_max >= 0)
   limit 1;

  insert into public.subscriptions
    (workspace_id, plan_id, plan_price_id, status, billing_interval, currency,
     amount_paisa, student_band_snapshot, student_count_snapshot,
     trial_ends_at, current_period_start, current_period_end, created_by)
  values
    (new.id, v_plan.id, v_price.id, 'trialing', 'monthly', v_plan.currency,
     0,
     int4range(coalesce(v_price.student_min, 0),
               coalesce(v_price.student_max, 2147483646), '[]'),
     0,
     new.trial_ends_at,
     (now() at time zone 'Asia/Dhaka')::date,
     ((now() at time zone 'Asia/Dhaka') + make_interval(days => v_plan.trial_days))::date,
     new.owner_id)
  returning id into v_sub;

  insert into public.subscription_events
    (subscription_id, workspace_id, type, to_status, actor_id)
  values (v_sub, new.id, 'trial_started', 'trialing', new.owner_id);

  return new;
end;
$$;

comment on function app.tg_workspace_billing_bootstrap() is
  'D-59: AFTER INSERT. Reads new.plan_id / new.trial_ends_at, already set by '
  'the BEFORE INSERT app.tg_workspace_billing_defaults(), to create the '
  'school''s public.subscriptions / public.subscription_events rows — the '
  'only part of billing bootstrap that genuinely needs the workspaces row to '
  'already exist (an FK reference). No longer performs any UPDATE against '
  'public.workspaces; previously did, which tripped '
  'app.tg_workspaces_guard() for any INSERT made as `authenticated` (fixed '
  'here, not in the guard — see this migration''s header).';

drop trigger if exists workspace_billing_bootstrap on public.workspaces;
create trigger workspace_billing_bootstrap
  after insert on public.workspaces
  for each row execute function app.tg_workspace_billing_bootstrap();
