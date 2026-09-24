-- =====================================================================
-- pgTAP · F-ID-05 Part 4 — public.create_school_workspace + grade_levels
-- + academic_years (20260925100100_create_school_workspace.sql, D-100)
--
--   1. Happy path: every row §4.3 "On submit" lists exists, the caller is
--      owner at once, grade levels come back in order with Bangla names
--      (AC9), and every audit row shares one correlation id (AC7).
--   2. Idempotency: a replay returns the same school; the same key with a
--      different body, or from another user, is refused.
--   3. Named errors: EIIN_TAKEN (from the unique index alone — the path a
--      losing concurrent submission takes), INVALID_TIMEZONE,
--      INVALID_ACADEMIC_YEAR, VALIDATION, RATE_LIMITED, anon/unauthenticated.
--   4. All-or-nothing (AC8): a failure injected at each write leaves no
--      school behind, and a retry with the same key then creates exactly one.
--   5. grade_levels / academic_years isolation and escalation (T2).
-- =====================================================================
begin;
select plan(56);

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

-- A valid input; p_patch overrides top-level keys.
create or replace function tests.school_input(p_key uuid, p_patch jsonb default '{}')
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'name', 'Ideal School & College',
    'eiin', '108263',
    'board', 'dhaka',
    'medium', 'bangla',
    'timezone', 'Asia/Dhaka',
    'working_days', jsonb_build_array(6, 7, 1, 2, 3, 4),
    'academic_year', jsonb_build_object('name', '2026', 'starts_on', '2026-01-01', 'ends_on', '2026-12-31'),
    'grade_levels', jsonb_build_array(
      jsonb_build_object('name', 'Class 10', 'name_bn', 'দশম শ্রেণি', 'level_number', 10, 'stage', 'secondary'),
      jsonb_build_object('name', 'Class 6',  'name_bn', 'ষষ্ঠ শ্রেণি', 'level_number', 6,  'stage', 'secondary'),
      jsonb_build_object('name', 'Class 7',  'name_bn', 'সপ্তম শ্রেণি', 'level_number', 7,  'stage', 'secondary'),
      jsonb_build_object('name', 'Class 8',  'name_bn', 'অষ্টম শ্রেণি', 'level_number', 8,  'stage', 'secondary'),
      jsonb_build_object('name', 'Class 9',  'name_bn', 'নবম শ্রেণি',   'level_number', 9,  'stage', 'secondary')),
    'idempotency_key', p_key
  ) || p_patch;
$fn$;

select tests.mkuser('f1050401-0000-0000-0000-000000000001', 'p4.owner@test.local',    'Principal');
select tests.mkuser('f1050401-0000-0000-0000-000000000002', 'p4.other@test.local',    'Other Owner');
select tests.mkuser('f1050401-0000-0000-0000-000000000003', 'p4.teacher@test.local',  'Teacher');
select tests.mkuser('f1050401-0000-0000-0000-000000000004', 'p4.parent@test.local',   'Parent');
select tests.mkuser('f1050401-0000-0000-0000-000000000005', 'p4.atomic@test.local',   'Atomic');
select tests.mkuser('f1050401-0000-0000-0000-000000000006', 'p4.limited@test.local',  'Limited');

create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

-- =====================================================================
-- 1. Happy path
-- =====================================================================
select tests.login('f1050401-0000-0000-0000-000000000001');
create temp table first_call as
  select public.create_school_workspace(
    tests.school_input('a0000000-0000-4000-8000-000000000001')) as r;
select tests.logout();
insert into ids select 'ideal', (r ->> 'workspace_id')::uuid from first_call;

select is((select r ->> 'replayed' from first_call), 'false', 'a first call is not a replay');

select results_eq(
  $$select type::text, name, owner_id, created_by from public.workspaces
     where id = (select id from ids where label = 'ideal')$$,
  $$values ('school', 'Ideal School & College',
            'f1050401-0000-0000-0000-000000000001'::uuid,
            'f1050401-0000-0000-0000-000000000001'::uuid)$$,
  'the workspace is a school owned and created by the caller');

select results_eq(
  $$select eiin, board, medium, timezone, working_days from public.school_profiles
     where workspace_id = (select id from ids where label = 'ideal')$$,
  $$values ('108263', 'dhaka', 'bangla', 'Asia/Dhaka', '{1,2,3,4,6,7}'::smallint[])$$,
  'the school profile carries the wizard''s identity and calendar fields');

select is(
  (select count(*)::int from public.workspace_members
    where workspace_id = (select id from ids where label = 'ideal')
      and user_id = 'f1050401-0000-0000-0000-000000000001'
      and role = 'owner' and status = 'active'),
  1, 'the caller has exactly one active owner membership');

select results_eq(
  $$select name, starts_on, ends_on, is_current from public.academic_years
     where workspace_id = (select id from ids where label = 'ideal')$$,
  $$values ('2026', '2026-01-01'::date, '2026-12-31'::date, true)$$,
  'exactly one academic year, marked current');

select results_eq(
  $$select name, name_bn from public.grade_levels
     where workspace_id = (select id from ids where label = 'ideal')
     order by level_number$$,
  $$values ('Class 6', 'ষষ্ঠ শ্রেণি'), ('Class 7', 'সপ্তম শ্রেণি'), ('Class 8', 'অষ্টম শ্রেণি'),
           ('Class 9', 'নবম শ্রেণি'), ('Class 10', 'দশম শ্রেণি')$$,
  'AC9: five grade levels ordered Class 6 .. Class 10 with Bangla names');

select ok(
  (select invite_code is not null from public.workspaces where id = (select id from ids where label = 'ideal')),
  'the school has an active join (invite) code');

select results_eq(
  $$select s.status::text, p.code, s.trial_ends_at::date
      from public.subscriptions s join public.plans p on p.id = s.plan_id
     where s.workspace_id = (select id from ids where label = 'ideal')$$,
  $$values ('trialing', 'pro', (now() + make_interval(days => (select trial_days from public.plans where code = 'pro')))::date)$$,
  'a Pro trial subscription exists, as long as the plan catalogue says (PRODUCT-DECISIONS §5.2)');

select ok(
  (select onboarding_completed_at is not null
          and last_active_workspace_id = (select id from ids where label = 'ideal')
     from public.profiles where id = 'f1050401-0000-0000-0000-000000000001'),
  'onboarding is complete and the new school is the last active workspace');

select ok(
  (select completed_at is not null and draft is null and path = 'create_school'
     from public.onboarding_progress where user_id = 'f1050401-0000-0000-0000-000000000001'),
  'the wizard draft is cleared and marked complete');

select is(
  (select count(distinct correlation_id)::int from public.audit_events
    where workspace_id = (select id from ids where label = 'ideal')),
  1, 'AC7: every audit row for the new school shares one correlation id');

select ok(
  (select bool_and(correlation_id is not null) from public.audit_events
    where workspace_id = (select id from ids where label = 'ideal')),
  'that correlation id is never null (minted when no header set one)');

select ok(
  (select array_agg(distinct action) from public.audit_events
    where workspace_id = (select id from ids where label = 'ideal'))
  @> array['workspaces.insert', 'workspace_members.insert', 'school_profiles.update',
           'subscriptions.insert', 'academic_years.insert', 'grade_levels.insert'],
  'the audit group covers workspace, membership, profile, subscription, year and grade levels');

select tests.login('f1050401-0000-0000-0000-000000000001');
select ok(app.has_role((select id from ids where label = 'ideal'), array['owner']),
  'the new owner satisfies app.has_role(ws, owner) immediately');
select tests.logout();

-- =====================================================================
-- 2. Idempotency
-- =====================================================================
select tests.login('f1050401-0000-0000-0000-000000000001');
select is(
  (select public.create_school_workspace(
     tests.school_input('a0000000-0000-4000-8000-000000000001'))),
  (select r || '{"replayed": true}' from first_call),
  'a replay with the same key and body returns the original workspace');

select throws_ok(
  $$select public.create_school_workspace(
      tests.school_input('a0000000-0000-4000-8000-000000000001', '{"name": "Different School"}'))$$,
  '22023', 'IDEMPOTENCY_KEY_REUSED',
  'the same key with a different body is refused');
select tests.logout();

select tests.login('f1050401-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.create_school_workspace(
      tests.school_input('a0000000-0000-4000-8000-000000000001'))$$,
  '22023', 'IDEMPOTENCY_KEY_REUSED',
  'another user replaying someone else''s key gets nothing back');
select tests.logout();

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050401-0000-0000-0000-000000000001' and type = 'school'),
  1, 'the replays created no second school');

-- =====================================================================
-- 3. Named errors
-- =====================================================================
select tests.login('f1050401-0000-0000-0000-000000000002');

select throws_ok(
  $$select public.create_school_workspace(
      tests.school_input('b0000000-0000-4000-8000-000000000001', '{"name": "Copycat"}'))$$,
  '23505', 'EIIN_TAKEN',
  'an EIIN already registered to another school raises EIIN_TAKEN (unique index is the only check)');

select throws_ok(
  $$select public.create_school_workspace(
      tests.school_input('b0000000-0000-4000-8000-000000000002', '{"eiin": null, "timezone": "Mars/Olympus"}'))$$,
  '22023', 'INVALID_TIMEZONE', 'an unknown timezone raises INVALID_TIMEZONE');

select throws_ok(
  $$select public.create_school_workspace(tests.school_input(
      'b0000000-0000-4000-8000-000000000003',
      '{"eiin": null, "academic_year": {"name": "2026", "starts_on": "2026-12-31", "ends_on": "2026-01-01"}}'))$$,
  '22023', 'INVALID_ACADEMIC_YEAR', 'an academic year that ends before it starts is refused');

select throws_ok(
  $$select public.create_school_workspace(tests.school_input(
      'b0000000-0000-4000-8000-000000000004',
      '{"eiin": null, "academic_year": {"name": "2026", "starts_on": "2026-01-01", "ends_on": "2028-06-01"}}'))$$,
  '22023', 'INVALID_ACADEMIC_YEAR', 'an academic year longer than 730 days is refused');

select throws_ok(
  $$select public.create_school_workspace(tests.school_input(
      'b0000000-0000-4000-8000-000000000005', '{"eiin": null, "grade_levels": []}'))$$,
  '22023', 'VALIDATION', 'at least one grade level is required');

select throws_ok(
  $$select public.create_school_workspace(tests.school_input(
      'b0000000-0000-4000-8000-000000000006',
      '{"eiin": null, "grade_levels": [{"name": "Class 6", "level_number": 6}, {"name": "class 6", "level_number": 7}]}'))$$,
  '22023', 'VALIDATION', 'two grade levels with the same name are refused');

select throws_ok(
  $$select public.create_school_workspace(tests.school_input(
      'b0000000-0000-4000-8000-000000000007', '{"eiin": null, "working_days": []}'))$$,
  '22023', 'VALIDATION', 'an empty working week is refused');

select throws_ok(
  $$select public.create_school_workspace(tests.school_input(
      'b0000000-0000-4000-8000-000000000008', '{"eiin": null, "board": "narnia"}'))$$,
  '22023', 'VALIDATION', 'an unknown board is refused');

select throws_ok(
  $$select public.create_school_workspace(tests.school_input(
      'b0000000-0000-4000-8000-000000000009', '{"eiin": "12ab56"}'))$$,
  '22023', 'VALIDATION', 'a malformed EIIN is refused');

select throws_ok(
  $$select public.create_school_workspace(tests.school_input('b0000000-0000-4000-8000-000000000001') - 'idempotency_key')$$,
  '22023', 'VALIDATION', 'an idempotency key is required');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050401-0000-0000-0000-000000000002' and type = 'school'),
  0, 'none of the refused calls left a school behind');
select tests.logout();

-- RATE_LIMITED: 3 schools per user per day (AC16).
select tests.login('f1050401-0000-0000-0000-000000000006');
select public.create_school_workspace(tests.school_input('c0000000-0000-4000-8000-000000000001', '{"eiin": null}'));
select public.create_school_workspace(tests.school_input('c0000000-0000-4000-8000-000000000002', '{"eiin": null}'));
select public.create_school_workspace(tests.school_input('c0000000-0000-4000-8000-000000000003', '{"eiin": null}'));
select throws_ok(
  $$select public.create_school_workspace(tests.school_input('c0000000-0000-4000-8000-000000000004', '{"eiin": null}'))$$,
  'P0001', 'RATE_LIMITED', 'a fourth school in one day raises RATE_LIMITED');
select tests.logout();

select throws_ok(
  $$select public.create_school_workspace(tests.school_input('c0000000-0000-4000-8000-000000000005'))$$,
  '42501', 'authentication required', 'a call with no signed-in user is refused');

select ok(has_function_privilege('authenticated', 'public.create_school_workspace(jsonb)', 'execute'),
  'authenticated may execute create_school_workspace');
select ok(not has_function_privilege('anon', 'public.create_school_workspace(jsonb)', 'execute'),
  'anon may not execute create_school_workspace');

-- =====================================================================
-- 4. All-or-nothing (AC8): inject a failure at each write in turn.
-- =====================================================================
create or replace function tests.injected_failure()
returns trigger language plpgsql as $fn$
begin
  raise exception 'INJECTED' using errcode = 'P0001';
end;
$fn$;

create or replace function tests.create_with_failure_on(p_table text, p_event text)
returns void language plpgsql as $fn$
begin
  execute format('create trigger zz_injected after %s on %s for each row execute function tests.injected_failure()',
                 p_event, p_table);
  begin
    perform tests.login('f1050401-0000-0000-0000-000000000005');
    perform public.create_school_workspace(
      tests.school_input('d0000000-0000-4000-8000-000000000001', '{"eiin": "555555"}'));
  exception when others then
    perform tests.logout();
    execute format('drop trigger zz_injected on %s', p_table);
    raise;
  end;
end;
$fn$;

select throws_ok($$select tests.create_with_failure_on('public.workspaces', 'insert')$$,
  'P0001', 'INJECTED', 'failure at the workspace insert propagates');
select throws_ok($$select tests.create_with_failure_on('public.workspace_members', 'insert')$$,
  'P0001', 'INJECTED', 'failure at the owner membership propagates');
select throws_ok($$select tests.create_with_failure_on('public.subscriptions', 'insert')$$,
  'P0001', 'INJECTED', 'failure at the trial subscription propagates');
select throws_ok($$select tests.create_with_failure_on('public.school_profiles', 'update')$$,
  'P0001', 'INJECTED', 'failure at the school profile propagates');
select throws_ok($$select tests.create_with_failure_on('public.academic_years', 'insert')$$,
  'P0001', 'INJECTED', 'failure at the academic year propagates');
select throws_ok($$select tests.create_with_failure_on('public.grade_levels', 'insert')$$,
  'P0001', 'INJECTED', 'failure at the grade levels propagates');
select throws_ok($$select tests.create_with_failure_on('public.profiles', 'update')$$,
  'P0001', 'INJECTED', 'failure at the onboarding flag propagates');
select throws_ok($$select tests.create_with_failure_on('public.onboarding_progress', 'insert')$$,
  'P0001', 'INJECTED', 'failure at the onboarding progress propagates');
select throws_ok($$select tests.create_with_failure_on('app.idempotency_keys', 'insert')$$,
  'P0001', 'INJECTED', 'failure at the idempotency record propagates');

select is(
  (select count(*)::int from public.workspaces where created_by = 'f1050401-0000-0000-0000-000000000005' and type = 'school')
  + (select count(*)::int from public.school_profiles where eiin = '555555')
  + (select count(*)::int from app.idempotency_keys where key = 'd0000000-0000-4000-8000-000000000001')
  + (select count(*)::int from public.onboarding_progress where user_id = 'f1050401-0000-0000-0000-000000000005'),
  0, 'no partial school, profile, idempotency record or progress row survived any injected failure');

select tests.login('f1050401-0000-0000-0000-000000000005');
select public.create_school_workspace(tests.school_input('d0000000-0000-4000-8000-000000000001', '{"eiin": "555555"}'));
select public.create_school_workspace(tests.school_input('d0000000-0000-4000-8000-000000000001', '{"eiin": "555555"}'));
select tests.logout();
select is(
  (select count(*)::int from public.workspaces where created_by = 'f1050401-0000-0000-0000-000000000005' and type = 'school'),
  1, 'AC8: after the failures, the same key creates exactly one school (and a retry replays it)');

-- =====================================================================
-- 5. grade_levels / academic_years: isolation and escalation (T2)
-- =====================================================================
-- Other Owner gets a school of their own; Teacher and Parent join Ideal.
select tests.login('f1050401-0000-0000-0000-000000000002');
insert into ids select 'other', (public.create_school_workspace(
  tests.school_input('e0000000-0000-4000-8000-000000000001', '{"eiin": null, "name": "Other School"}')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status)
values ((select id from ids where label = 'ideal'), 'f1050401-0000-0000-0000-000000000003', 'teacher', 'active'),
       ((select id from ids where label = 'ideal'), 'f1050401-0000-0000-0000-000000000004', 'parent',  'active');

select tests.login('f1050401-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.grade_levels where workspace_id = (select id from ids where label = 'ideal'))
  + (select count(*)::int from public.academic_years where workspace_id = (select id from ids where label = 'ideal')),
  0, 'isolation: another school''s owner sees none of this school''s grade levels or years');
select throws_ok(
  $$insert into public.grade_levels (workspace_id, name, name_bn, level_number, created_by)
    values ((select id from ids where label = 'ideal'), 'Class 11', 'একাদশ শ্রেণি', 11,
            'f1050401-0000-0000-0000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "grade_levels"',
  'isolation: another school''s owner cannot add a grade level here');
select throws_ok(
  $$update public.grade_levels set workspace_id = (select id from ids where label = 'ideal')
     where workspace_id = (select id from ids where label = 'other')$$,
  '42501', 'workspace_id is immutable',
  'isolation: a grade level cannot be moved into a school the caller does not administer');
select tests.logout();

select tests.login('f1050401-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.grade_levels where workspace_id = (select id from ids where label = 'ideal')),
  5, 'a teacher of the school reads its grade levels');
select is(
  (select count(*)::int from public.academic_years where workspace_id = (select id from ids where label = 'ideal')),
  1, 'a teacher of the school reads its academic year');
select throws_ok(
  $$insert into public.grade_levels (workspace_id, name, name_bn, level_number, created_by)
    values ((select id from ids where label = 'ideal'), 'Class 11', 'একাদশ শ্রেণি', 11,
            'f1050401-0000-0000-0000-000000000003')$$,
  '42501', 'new row violates row-level security policy for table "grade_levels"',
  'escalation: a teacher cannot add a grade level');
select throws_ok(
  $$insert into public.academic_years (workspace_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'ideal'), '2027', '2027-01-01', '2027-12-31',
            'f1050401-0000-0000-0000-000000000003')$$,
  '42501', 'new row violates row-level security policy for table "academic_years"',
  'escalation: a teacher cannot add an academic year');
update public.grade_levels set name = 'Hacked'
 where workspace_id = (select id from ids where label = 'ideal');
select tests.logout();
select is(
  (select count(*)::int from public.grade_levels where name = 'Hacked'),
  0, 'escalation: a teacher''s update of a grade level touches no rows');

select tests.login('f1050401-0000-0000-0000-000000000004');
select is(
  (select count(*)::int from public.grade_levels where workspace_id = (select id from ids where label = 'ideal')),
  0, 'a parent member does not read grade levels (T2 excludes parent)');
select tests.logout();

select tests.login('f1050401-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into public.grade_levels (workspace_id, name, name_bn, level_number, created_by)
    values ((select id from ids where label = 'ideal'), 'Class 11', 'একাদশ শ্রেণি', 11,
            'f1050401-0000-0000-0000-000000000001')$$,
  'the owner can add a grade level');
select throws_ok(
  $$insert into public.academic_years (workspace_id, name, starts_on, ends_on, is_current, created_by)
    values ((select id from ids where label = 'ideal'), '2027', '2027-01-01', '2027-12-31', true,
            'f1050401-0000-0000-0000-000000000001')$$,
  '23505', 'duplicate key value violates unique constraint "academic_years_one_current"',
  'a second current academic year is refused');
select tests.logout();

select ok(not has_table_privilege('anon', 'public.grade_levels', 'select')
          and not has_table_privilege('anon', 'public.academic_years', 'select'),
  'anon has no privilege on grade_levels or academic_years');

select * from finish();
rollback;
