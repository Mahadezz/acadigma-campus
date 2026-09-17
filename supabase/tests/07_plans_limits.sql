-- =====================================================================
-- pgTAP · F-CM-06 Parts 1-3 — plans, subscriptions, the limits engine
-- Proves: subscriptions are not client-writable (Base44 finding — plan was
-- a free-text field); plan_limits/usage_counters are readable by any
-- member; only platform staff edit the catalogue; access_mode is set and
-- cleared only by a privileged caller (20260917020100 added that check);
-- the seeded `ai_actions_per_month` key (D-39) and the `fees` module
-- (D-31) are present where they should be; app.workspace_plan /
-- app.within_limit answer correctly, including the "no limit row =
-- unlimited" default-open case.
--
-- See supabase/tests/README.md for the zero-rows-affected pattern this
-- file uses for UPDATE/DELETE denials, and throws_ok for INSERT/function
-- denials that Postgres genuinely raises.
-- =====================================================================
begin;
select plan(21);

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

select is(
  (select status::text from public.subscriptions
    where workspace_id = '22222222-2222-2222-2222-222222222222'),
  'trialing',
  '...and it is still on trial');

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
select throws_ok(
  $$update public.plans set tagline = 'Hijacked' where code = 'pro'$$,
  '42501', null,
  'a teacher cannot edit the plan catalogue');

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
-- app.workspace_plan / app.within_limit
-- =====================================================================
select is(
  (select code from app.workspace_plan('22222222-2222-2222-2222-222222222222')),
  'pro',
  'app.workspace_plan resolves the workspace''s current plan');

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

select * from finish();
rollback;
