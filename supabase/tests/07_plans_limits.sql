-- =====================================================================
-- pgTAP · F-CM-06 Parts 1-3 — plans, subscriptions, the limits engine
-- Proves: subscriptions are not client-writable (Base44 finding — plan was
-- a free-text field); plan_limits/usage_counters are readable by any
-- member; only platform staff edit the catalogue; access_mode is set and
-- cleared only by a privileged caller (20260917020100 added that check);
-- the seeded `ai_actions_per_month` key (D-39) and the `fees` module
-- (D-31) are present where they should be; app.workspace_plan /
-- app.within_limit answer correctly, including the "no limit row =
-- unlimited" default-open case AND that both refuse a caller who is not a
-- member of the workspace they are asked about; platform_settings is not
-- writable by a tenant; and the seeded price grid still matches D-41 /
-- MARKET-STRATEGY §c (base, included band, overage, yearly = 11x monthly).
--
-- See supabase/tests/README.md for the zero-rows-affected pattern this
-- file uses for UPDATE/DELETE denials, and throws_ok for INSERT/function
-- denials that Postgres genuinely raises.
-- =====================================================================
begin;
select plan(49);

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
    json_build_object('sub', p_id::text, 'role', 'authenticated',
                      'email', (select u.email from auth.users u where u.id = p_id))::text, true);
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

-- ---------------------------------------------------------------------
-- fixtures: one school (owner + teacher), one platform-staff account
-- ---------------------------------------------------------------------
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000001', 'owner2@test.local',   'Owner');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000002', 'teacher2@test.local', 'Teacher');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000003', 'staff2@test.local',   'PlatformStaff');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('22222222-2222-2222-2222-222222222222', 'school', 'School B', 'school-b',
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
-- fires tg_workspace_billing_bootstrap: a Pro trial subscription now exists
-- for this workspace, per F-CM-06 §4.1.

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('eeee0002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-0000-0000-0000-000000000002', 'teacher', 'active', now());

-- A SECOND school nobody in School B belongs to. Its only job is to be the
-- workspace id an outsider passes to the definer lookup functions: a definer
-- bypasses RLS, so "does it re-impose the tenancy check" cannot be tested
-- without a tenant to be outside of.
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000004', 'owner3@test.local', 'OtherOwner');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('33333333-3333-3333-3333-333333333333', 'school', 'School C', 'school-c',
        'bbbbbbbb-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000004');

insert into public.usage_counters (workspace_id, key, period, value)
values ('33333333-3333-3333-3333-333333333333', 'max_students', 'all', 412);

update public.profiles set is_platform_admin = true
 where id = 'bbbbbbbb-0000-0000-0000-000000000003';

insert into public.usage_counters (workspace_id, key, period, value)
values ('22222222-2222-2222-2222-222222222222', 'max_teachers', 'all', 75);

-- The debate synthesis made teacher caps NULL (unlimited) on every plan in the
-- current seed, so a deterministic boundary is forced here, scoped to this
-- transaction (rolled back at the end) — the within_limit tests below must not
-- depend on whatever the seed's placeholder numbers happen to be today.
insert into public.plan_limits (plan_id, key, value_int)
values ((select id from public.plans where code = 'pro'), 'max_teachers', 75)
on conflict (plan_id, key) do update set value_int = excluded.value_int;

-- =====================================================================
-- a teacher cannot change a subscription (F-CM-06 §3.10 / Base44 finding)
-- =====================================================================
select tests.login('bbbbbbbb-0000-0000-0000-000000000002');

select throws_ok(
  $$insert into public.subscriptions (workspace_id, plan_id, status)
    values ('22222222-2222-2222-2222-222222222222',
            (select id from public.plans where code = 'starter'), 'active')$$,
  '42501', null,
  'a teacher cannot insert a subscription');

with attempted as (
  update public.subscriptions set status = 'active'
   where workspace_id = '22222222-2222-2222-2222-222222222222'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a teacher activating their own school''s subscription affects ZERO rows...');

-- subscriptions_select (F-CM-06 §3.10) is owner/admin + platform staff
-- ONLY — a teacher genuinely cannot SELECT this row, so reading it back
-- as the teacher would return NULL / zero rows regardless of whether the
-- write was blocked, making the assertion pass or fail for the wrong
-- reason. Borrow School B's owner, who the RLS select policy does admit,
-- for the read-back only (mirrors 03_role_escalation.sql's admin-actor
-- pattern for the same check); the write attempts stay attributed to the
-- teacher. tests.login() is invoker-rights (not security definer) so it
-- can only read auth.users while running as postgres — logout() first,
-- same as every other actor switch in this suite.
select tests.logout();
select tests.login('bbbbbbbb-0000-0000-0000-000000000001');

select is(
  (select status::text from public.subscriptions
    where workspace_id = '22222222-2222-2222-2222-222222222222'),
  'trialing',
  '...and it is still on trial');

select tests.logout();
select tests.login('bbbbbbbb-0000-0000-0000-000000000002');

-- The mirror of the UPDATE case: `authenticated` also holds DELETE on
-- subscriptions, guarded only by subscriptions_write_platform's USING. A
-- dropped USING clause would delete a school's billing row silently.
with attempted as (
  delete from public.subscriptions
   where workspace_id = '22222222-2222-2222-2222-222222222222'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a teacher deleting their school''s subscription affects ZERO rows...');

select tests.logout();
select tests.login('bbbbbbbb-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.subscriptions
    where workspace_id = '22222222-2222-2222-2222-222222222222'),
  1,
  '...and the subscription row survives');

select tests.logout();
select tests.login('bbbbbbbb-0000-0000-0000-000000000002');

-- =====================================================================
-- limits and usage are readable by an ordinary member
-- =====================================================================
select ok(
  (select count(*)::int from public.plan_limits
    where plan_id = (select id from public.plans where code = 'pro')) > 0,
  'a teacher can read the Pro plan''s limit rows (world-read catalogue)');

select is(
  (select value from public.usage_counters
    where workspace_id = '22222222-2222-2222-2222-222222222222'
      and key = 'max_teachers' and period = 'all'),
  75::bigint,
  'a teacher can read their own workspace''s usage_counters');

-- =====================================================================
-- plans are edited only by platform staff
-- =====================================================================
-- `authenticated` HOLDS the UPDATE/DELETE grants on the catalogue
-- (20260917010300 §8); plans_write_platform's USING clause merely filters the
-- row, so Postgres reports zero rows affected and raises NOTHING. throws_ok
-- here would be a test that can never pass — README "two things that trip
-- people up", item 1. Assert the row count, then re-select to prove the row
-- is untouched.
with attempted as (
  update public.plans set tagline = 'Hijacked' where code = 'pro'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a teacher editing the plan catalogue affects ZERO rows...');

select is(
  (select tagline from public.plans where code = 'pro'),
  'The full operations suite',
  '...and the Pro tagline is untouched');

with attempted as (
  delete from public.plans where code = 'pro'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a teacher deleting a plan affects ZERO rows...');

select ok(
  exists(select 1 from public.plans where code = 'pro'),
  '...and the Pro plan row still exists');

-- =====================================================================
-- access_mode: only a privileged caller may set or clear it
-- (20260917020100 added this check; 0004 had none)
-- =====================================================================
select throws_ok(
  $$select app.set_access_mode('22222222-2222-2222-2222-222222222222', 'read_only', 'over limit')$$,
  '42501', null,
  'an ordinary member cannot flip their own workspace''s access_mode');

select tests.logout();

select tests.login('bbbbbbbb-0000-0000-0000-000000000003');

select lives_ok(
  $$select app.set_access_mode('22222222-2222-2222-2222-222222222222', 'read_only', 'over the Free student limit')$$,
  'platform staff CAN set read-only over-limit mode');

select is(
  (select access_mode::text from public.workspaces where id = '22222222-2222-2222-2222-222222222222'),
  'read_only',
  'the workspace is now read_only');

select is(
  (select access_mode_reason from public.workspaces where id = '22222222-2222-2222-2222-222222222222'),
  'over the Free student limit',
  'the reason is recorded for the banner text');

select lives_ok(
  $$select app.set_access_mode('22222222-2222-2222-2222-222222222222', 'normal', null)$$,
  'platform staff CAN clear read-only mode (e.g. on upgrade payment)');

select is(
  (select access_mode::text from public.workspaces where id = '22222222-2222-2222-2222-222222222222'),
  'normal',
  'the workspace is back to normal access');

select is(
  (select access_mode_reason from public.workspaces where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'the reason is cleared along with the mode');

select tests.logout();

-- =====================================================================
-- D-39: the AI limit key is per-month, not per-day
-- =====================================================================
select ok(
  (select value_int from public.plan_limits
    where plan_id = (select id from public.plans where code = 'pro')
      and key = 'ai_actions_per_month') is not null,
  'pro has an ai_actions_per_month limit row');

select is(
  (select count(*)::int from public.plan_limits where key = 'ai_credits_per_day'),
  0,
  'the old per-day key no longer exists anywhere in the catalogue');

-- =====================================================================
-- D-31: `fees` is Starter and above, not personal_free
-- (the standalone Free tier was folded into the 30-day Pro trial —
-- coordination update — so personal_free is the remaining no-fees plan)
-- =====================================================================
select ok(
  exists(
    select 1 from public.plan_modules
     where plan_id = (select id from public.plans where code = 'starter')
       and module = 'fees'),
  'Starter has the fees module');

select ok(
  not exists(
    select 1 from public.plan_modules
     where plan_id = (select id from public.plans where code = 'personal_free')
       and module = 'fees'),
  'personal_free does not have the fees module');

-- =====================================================================
-- platform_settings — a new table, created with RLS but with
-- `grant insert, update, delete ... to authenticated`. The comment on that
-- grant says "RLS: platform only"; these assertions are what makes that
-- true rather than merely claimed. ai_topup_price_paisa is a number Part 4
-- charges a card against, so a tenant must not be able to move it.
-- =====================================================================
select tests.login('bbbbbbbb-0000-0000-0000-000000000002');

with attempted as (
  update public.platform_settings set ai_topup_price_paisa = 1
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a teacher repricing the AI top-up affects ZERO rows...');

select is(
  (select ai_topup_price_paisa from public.platform_settings),
  120000::bigint,
  '...and the top-up price is still Tk 1,200 (D-39)');

with attempted as (
  delete from public.platform_settings
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a teacher deleting the settings singleton affects ZERO rows');

-- `id` is `true` deliberately: `values (false)` would trip the singleton
-- CHECK constraint (23514) in ExecConstraints before RLS ever ran, and the
-- test would pass for the wrong reason. With a valid row, the RLS WITH CHECK
-- is the first thing that refuses it — which is what we are asserting.
select throws_ok(
  $$insert into public.platform_settings (id) values (true)$$,
  '42501', null,
  'a teacher cannot insert into platform_settings at all');

select is(
  (select count(*)::int from public.platform_settings),
  1,
  'platform_settings is still the single row it is meant to be');

-- =====================================================================
-- app.workspace_plan / app.within_limit
--
-- Run as an ACTIVE MEMBER of School B, not as postgres: both functions are
-- SECURITY DEFINER, so running them as a superuser proves only that the SQL
-- parses. The member path and the outsider path are what matter.
-- =====================================================================
select is(
  (select code from app.workspace_plan('22222222-2222-2222-2222-222222222222')),
  'pro',
  'app.workspace_plan resolves the workspace''s current plan for a member');

select is(
  app.within_limit('22222222-2222-2222-2222-222222222222', 'max_teachers', 1),
  false,
  'within_limit refuses one more teacher when already AT the limit (75/75)');

select is(
  app.within_limit('22222222-2222-2222-2222-222222222222', 'max_teachers', 0),
  true,
  'within_limit allows a zero-delta check at exactly the limit');

select is(
  app.within_limit('22222222-2222-2222-2222-222222222222', 'max_sections', 999999),
  true,
  'a key with no plan_limits row defaults OPEN (unlimited), matching plan_limits'' own NULL convention');

-- A definer bypasses RLS by design; these two assertions are the only thing
-- standing between that and a cross-tenant read. School C's usage_counters
-- carry 412 students; without the caller check an outsider could recover that
-- number by binary-searching p_delta against a boolean return value.
select throws_ok(
  $$select app.within_limit('33333333-3333-3333-3333-333333333333', 'max_students', 1)$$,
  '42501', null,
  'app.within_limit refuses a caller who is not a member of the workspace asked about');

select throws_ok(
  $$select app.workspace_plan('33333333-3333-3333-3333-333333333333')$$,
  '42501', null,
  'app.workspace_plan refuses a caller who is not a member of the workspace asked about');

select tests.logout();

-- =====================================================================
-- The seeded price grid is D-41 / MARKET-STRATEGY section c, verbatim.
--
-- F-CM-06 5.2 requires exactly this test: "a seed test asserts the
-- relationship and will fail loudly if the owner changes it". The ratio is
-- 11x, not 10x — annual prepay is one month free (8.3%), not two.
-- =====================================================================
select is(
  (select pp.monthly_paisa from public.plan_prices pp
     join public.plans p on p.id = pp.plan_id where p.code = 'starter'),
  220000::bigint,
  'Starter base is Tk 2,200/month');

select is(
  (select pp.student_max from public.plan_prices pp
     join public.plans p on p.id = pp.plan_id where p.code = 'starter'),
  150,
  'Starter includes 150 students');

select is(
  (select pp.overage_per_student_paisa from public.plan_prices pp
     join public.plans p on p.id = pp.plan_id where p.code = 'starter'),
  900::bigint,
  'Starter overage is +Tk 9 per student above the band');

select is(
  (select pp.monthly_paisa from public.plan_prices pp
     join public.plans p on p.id = pp.plan_id where p.code = 'pro'),
  490000::bigint,
  'Pro base is Tk 4,900/month');

select is(
  (select pp.student_max from public.plan_prices pp
     join public.plans p on p.id = pp.plan_id where p.code = 'pro'),
  300,
  'Pro includes 300 students');

select is(
  (select pp.overage_per_student_paisa from public.plan_prices pp
     join public.plans p on p.id = pp.plan_id where p.code = 'pro'),
  1100::bigint,
  'Pro overage is +Tk 11 per student above the band');

select is(
  (select pp.monthly_paisa from public.plan_prices pp
     join public.plans p on p.id = pp.plan_id where p.code = 'enterprise'),
  1800000::bigint,
  'Enterprise starts at Tk 18,000/month');

select is(
  (select count(*)::int from public.plan_prices pp
    where pp.monthly_paisa > 0
      and pp.yearly_paisa <> pp.monthly_paisa * 11),
  0,
  'every priced plan is yearly = 11 x monthly — one month free, not two (D-41)');

select is(
  (select count(*)::int from public.plan_prices pp
    where pp.monthly_paisa % 100 <> 0 or pp.yearly_paisa % 100 <> 0),
  0,
  'every seeded price is a whole number of taka (5.2)');

-- =====================================================================
-- The rest of the post-debate plan matrix
-- =====================================================================
select is(
  (select count(*)::int from public.plans where code = 'free'),
  0,
  'the Free school plan row is gone (D-42)');

select ok(
  exists(select 1 from public.plans where code = 'personal_free'),
  'personal_free — the free teacher workspace — is NOT the abolished plan and survives');

select is(
  (select trial_days from public.plans where code = 'pro'),
  30::smallint,
  'the self-serve trial is 30 days of Pro (D-28 resolution)');

select is(
  (select value_int from public.plan_limits l
     join public.plans p on p.id = l.plan_id
    where p.code = 'pro' and l.key = 'trial_ai_actions_lifetime'),
  100,
  'the trial carries 100 lifetime AI actions, not a monthly allowance');

select is(
  (select value_int from public.plan_limits l
     join public.plans p on p.id = l.plan_id
    where p.code = 'starter' and l.key = 'ai_actions_per_month'),
  200,
  'Starter allows 200 AI actions per month (D-39 completion)');

select is(
  (select value_int from public.plan_limits l
     join public.plans p on p.id = l.plan_id
    where p.code = 'pro' and l.key = 'ai_actions_per_month'),
  600,
  'Pro allows 600 AI actions per month (D-39 completion)');

select is(
  (select count(*)::int from public.plan_limits l
     join public.plans p on p.id = l.plan_id
    where p.code in ('starter', 'pro', 'enterprise')
      and l.key = 'max_teachers' and l.value_int is not null),
  0,
  'no school plan caps teachers — pricing is on students only (D-27 amendment, P-05)');

select * from finish();
rollback;
