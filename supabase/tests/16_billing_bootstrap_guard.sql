-- =====================================================================
-- pgTAP · D-59 — app.tg_workspace_billing_bootstrap() no longer trips
--                app.tg_workspaces_guard()
--
-- Confirmed pre-existing bug (PR #19 reviews; tracked as Known issue #3 in
-- docs/test-reports/2026-09-24-F-ID-05-p1.md and
-- 15_personal_workspace_registration.sql test 7's comment): the billing
-- bootstrap's nested UPDATE of workspaces.plan_id/trial_ends_at tripped the
-- tenant guard's plan/trial check for ANY workspace INSERT made as
-- `authenticated`, because app.is_privileged_context() reads the `role` GUC
-- (unaffected by SECURITY DEFINER nesting) rather than `current_user`. Fixed
-- in 20260925000200_billing_bootstrap_vs_workspace_guard.sql (D-59) by
-- moving plan_id/trial_ends_at onto a BEFORE INSERT trigger that sets NEW
-- directly — no second UPDATE statement, so the guard (BEFORE UPDATE only)
-- never runs for it.
--
-- Covers:
--   1. a school workspace inserted as `authenticated` (owner_id = created_by
--      = auth.uid(), type='school' — the one shape the workspaces_insert
--      policy allows) now succeeds END TO END: owner membership, plan_id
--      and trial_ends_at all set by the bootstrap chain, subscriptions +
--      subscription_events rows created — where 15_personal_workspace_
--      registration.sql test 7 could previously only prove the RLS policy
--      itself passed the row, because everything after that raised 42501.
--   2. a client's own DIRECT UPDATE of plan_id / trial_ends_at / access_mode
--      on their own workspace is refused exactly as before — same errcode,
--      same message — proving the guard itself was not loosened, only the
--      platform's own nested UPDATE was removed.
--   3. the personal-workspace signup path (auth.users insert ->
--      app.handle_new_user() -> app.tg_workspace_bootstrap() /
--      app.tg_workspace_billing_defaults()) still produces exactly one
--      personal workspace with plan_id set to personal_free, unaffected by
--      the split.
-- =====================================================================
begin;
select plan(13);

create schema if not exists tests;

create or replace function tests.mkuser(p_id uuid, p_email text, p_name text)
returns uuid language plpgsql as $fn$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    lower(p_email), '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name), now(), now());
  return p_id;
end;
$fn$;

create or replace function tests.login(p_id uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub',   p_id::text,
      'role',  'authenticated',
      'email', (select u.email from auth.users u where u.id = p_id)
    )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$fn$;

create or replace function tests.logout()
returns void language plpgsql as $fn$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$fn$;

-- =====================================================================
-- 1. a school workspace inserted as `authenticated` now succeeds end to
--    end, not just past the RLS policy.
-- =====================================================================
select tests.mkuser('16000001-0000-0000-0000-000000000001', 'd59.owner@test.local', 'D59 Owner');
select tests.login('16000001-0000-0000-0000-000000000001');

select lives_ok(
  $$insert into public.workspaces (id, type, name, slug, owner_id, created_by)
    values ('16000001-0000-0000-0000-0000000000aa', 'school', 'D59 School',
            'd59-school', '16000001-0000-0000-0000-000000000001',
            '16000001-0000-0000-0000-000000000001')$$,
  'an authenticated owner can insert their own school workspace, end to end, with no 42501 from the bootstrap/guard interaction');

select is(
  (select p.code from public.workspaces w
     join public.plans p on p.id = w.plan_id
    where w.id = '16000001-0000-0000-0000-0000000000aa'),
  'pro',
  'the bootstrap trigger set plan_id to the Pro plan, via NEW in the BEFORE INSERT trigger');

select ok(
  (select w.trial_ends_at > now()
     from public.workspaces w where w.id = '16000001-0000-0000-0000-0000000000aa'),
  'trial_ends_at was set (in the future) by the BEFORE INSERT bootstrap trigger');

select is(
  (select m.role::text from public.workspace_members m
    where m.workspace_id = '16000001-0000-0000-0000-0000000000aa'
      and m.user_id = '16000001-0000-0000-0000-000000000001'),
  'owner',
  'the owner membership was still created by app.tg_workspace_bootstrap() (untouched by D-59)');

select is(
  (select m.status::text from public.workspace_members m
    where m.workspace_id = '16000001-0000-0000-0000-0000000000aa'
      and m.user_id = '16000001-0000-0000-0000-000000000001'),
  'active',
  'the owner membership is active immediately');

select is(
  (select s.status::text from public.subscriptions s
    where s.workspace_id = '16000001-0000-0000-0000-0000000000aa'),
  'trialing',
  'a trialing subscription row was created by app.tg_workspace_billing_bootstrap(), now AFTER-INSERT-only and reading NEW.plan_id');

select is(
  (select count(*)::int from public.subscription_events se
    join public.subscriptions s on s.id = se.subscription_id
    where s.workspace_id = '16000001-0000-0000-0000-0000000000aa'
      and se.type = 'trial_started'),
  1,
  'a trial_started subscription_events row was created');

select tests.logout();

-- =====================================================================
-- 2. a client's DIRECT update of plan_id / trial_ends_at / access_mode is
--    still refused, exactly as before D-59 — the guard itself is untouched.
-- =====================================================================
select tests.login('16000001-0000-0000-0000-000000000001');

select throws_ok(
  $$update public.workspaces set plan_id = (select id from public.plans where code = 'personal_free')
     where id = '16000001-0000-0000-0000-0000000000aa'$$,
  '42501',
  'plan, trial, workspace status and access mode are set by billing and platform staff',
  'a direct client UPDATE of plan_id on the owner''s own workspace is still refused, same message as before D-59');

select throws_ok(
  $$update public.workspaces set trial_ends_at = now() + interval '1 day'
     where id = '16000001-0000-0000-0000-0000000000aa'$$,
  '42501',
  'plan, trial, workspace status and access mode are set by billing and platform staff',
  'a direct client UPDATE of trial_ends_at on the owner''s own workspace is still refused');

select throws_ok(
  $$update public.workspaces set access_mode = 'read_only'
     where id = '16000001-0000-0000-0000-0000000000aa'$$,
  '42501',
  'plan, trial, workspace status and access mode are set by billing and platform staff',
  'a direct client UPDATE of access_mode on the owner''s own workspace is still refused');

select is(
  (select p.code from public.workspaces w
     join public.plans p on p.id = w.plan_id
    where w.id = '16000001-0000-0000-0000-0000000000aa'),
  'pro',
  'the three blocked UPDATE attempts left plan_id exactly as the bootstrap set it');

select tests.logout();

-- =====================================================================
-- 3. the personal-workspace signup path still works, unaffected by the
--    split (app.tg_workspace_billing_defaults() now sets plan_id for the
--    personal branch too).
-- =====================================================================
select tests.mkuser('16000002-0000-0000-0000-000000000002', 'd59.personal@test.local', 'D59 Personal');

select is(
  (select count(*)::int from public.workspaces
    where created_by = '16000002-0000-0000-0000-000000000002' and type = 'personal'),
  1,
  'registration still creates exactly one personal workspace for the new user');

select is(
  (select p.code from public.workspaces w
     join public.plans p on p.id = w.plan_id
    where w.created_by = '16000002-0000-0000-0000-000000000002' and w.type = 'personal'),
  'personal_free',
  'the personal workspace''s plan_id is set to personal_free by app.tg_workspace_billing_defaults()');

select * from finish();
rollback;
