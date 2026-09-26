-- =====================================================================
-- pgTAP · F-ID-11 Part 2b — late sync of an offline roll call (D-310,
-- 20260926214810_attendance_late_sync.sql, spec §5.3)
--
-- A teacher's replay outside the edit window is accepted only when no
-- session exists for that section and date, captured_at is inside
-- [start of the session date, server now()], inside the edit window for
-- that date, and it arrives within 7 days of captured_at. Accepted →
-- synced_late, captured_at kept, an attendance.synced_late audit
-- event. Any replay's audit row carries queued_offline (AC-2).
-- =====================================================================
begin;
select plan(20);

create schema if not exists tests;
grant usage on schema tests to authenticated;

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
  perform set_config('app.correlation_id', '', true);
end;
$fn$;

create or replace function tests.school_input(p_key uuid, p_name text)
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'name', p_name, 'eiin', null, 'board', 'dhaka', 'medium', 'bangla',
    'timezone', 'Asia/Dhaka',
    'working_days', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
    'academic_year', jsonb_build_object(
      'name', 'Test year',
      'starts_on', (current_date - 200)::text,
      'ends_on', (current_date + 150)::text),
    'grade_levels', jsonb_build_array(
      jsonb_build_object('name', 'Class 6', 'name_bn', 'ষষ্ঠ শ্রেণি', 'level_number', 6, 'stage', 'secondary')),
    'idempotency_key', p_key);
$fn$;

create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

create or replace function tests.id(p_label text) returns uuid language sql as $fn$
  select id from ids where label = p_label
$fn$;

create or replace function tests.today() returns date language sql as $fn$
  select app.school_today(tests.id('a'))
$fn$;

-- 10:00 in Dhaka on the given school date.
create or replace function tests.at10(p_date date) returns timestamptz language sql as $fn$
  select (p_date::timestamp + interval '10 hours') at time zone 'Asia/Dhaka'
$fn$;

create or replace function tests.save(p_key uuid, p_date date, p_patch jsonb default '{}')
returns jsonb language sql as $fn$
  select public.save_attendance(tests.id('a'), jsonb_build_object(
    'idempotency_key', p_key, 'section_id', tests.id('ka'), 'date', p_date,
    'records', (select jsonb_agg(jsonb_build_object('student_id', tests.id('s' || i), 'status', 'present'))
                  from generate_series(1, 2) i)) || p_patch)
$fn$;

create or replace function tests.session(p_date date) returns public.attendance_sessions
language sql as $fn$
  select * from public.attendance_sessions
   where section_id = tests.id('ka') and date = p_date
$fn$;

-- Robust to a tests schema left behind with other default privileges.
grant execute on all functions in schema tests to authenticated;

select tests.mkuser('f3100000-0000-0000-0000-000000000001', 'd310.owner@test.local',   'Owner A');
select tests.mkuser('f3100000-0000-0000-0000-000000000002', 'd310.teacher@test.local', 'Teacher A');

select tests.login('f3100000-0000-0000-0000-000000000001');
insert into ids select 'a', (public.create_school_workspace(
  tests.school_input('a3100000-0000-4000-8000-000000000001', 'School A')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status) values
  (tests.id('a'), 'f3100000-0000-0000-0000-000000000002', 'teacher', 'active');

insert into ids
select 'year', id from public.academic_years where workspace_id = tests.id('a')
union all select 'c6', id from public.grade_levels where workspace_id = tests.id('a');

insert into public.sections (workspace_id, academic_year_id, grade_level_id, name) values
  (tests.id('a'), tests.id('year'), tests.id('c6'), 'ক');
insert into ids select 'ka', id from public.sections where workspace_id = tests.id('a');

select tests.login('f3100000-0000-0000-0000-000000000001');
do $$
declare i int;
begin
  for i in 1..2 loop
    insert into ids select 's' || i, (public.admit_student(tests.id('a'), jsonb_build_object(
      'idempotency_key', md5('d310-student-' || i)::uuid,
      'first_name', 'Student', 'last_name', 'No' || i, 'gender', 'male',
      'date_of_birth', '2014-01-01',
      'section_id', tests.id('ka'),
      'enrolled_on', (current_date - 200)::text,
      'guardian', jsonb_build_object('relation', 'father', 'full_name', 'G', 'phone', '+8801000000001')))
      ->> 'student_id')::uuid;
  end loop;
end
$$;
-- A register the owner saved late (admins may), before any teacher replay.
select tests.save('c3100000-0000-4000-8000-000000000001', tests.today() - 5);
select tests.logout();

-- The edit window is the default 2 days throughout.

-- =====================================================================
-- Accepted: no session, captured in the window, arrived within 7 days
-- =====================================================================
select tests.login('f3100000-0000-0000-0000-000000000002');
select lives_ok(
  $$select tests.save('c3100000-0000-4000-8000-000000000010', tests.today() - 4,
      jsonb_build_object('captured_at', tests.at10(tests.today() - 4)))$$,
  'a roll taken offline 4 days ago in its window lands late (§5.3)');
select is((tests.save('c3100000-0000-4000-8000-000000000010', tests.today() - 4,
      jsonb_build_object('captured_at', tests.at10(tests.today() - 4))) ->> 'replayed')::boolean, true,
  'replaying the late save returns the stored result');
select tests.logout();

select ok((tests.session(tests.today() - 4)).synced_late, 'it is stamped synced_late');
select is((tests.session(tests.today() - 4)).captured_at, tests.at10(tests.today() - 4),
  'captured_at is kept');
select is((select count(*)::int from public.audit_events
            where action = 'attendance.synced_late'
              and row_id = (tests.session(tests.today() - 4)).id
              and (after ->> 'captured_at')::timestamptz = tests.at10(tests.today() - 4)
              and after ? 'arrived_at'), 1,
  'one attendance.synced_late audit event with captured and arrival time');
select is((select (a -> 'session' ->> 'synced_late')::boolean
             from jsonb_array_elements(public.attendance_day(tests.id('a'), tests.today() - 4) -> 'sections') a),
  true, 'the admin overview shows it synced late');

-- =====================================================================
-- Refused: the late path never edits, and its bounds hold
-- =====================================================================
select tests.login('f3100000-0000-0000-0000-000000000002');
select throws_ok(
  $$select tests.save('c3100000-0000-4000-8000-000000000011', tests.today() - 5,
      jsonb_build_object('captured_at', tests.at10(tests.today() - 5),
                         'expected_updated_at', (tests.session(tests.today() - 5)).updated_at))$$,
  '42501', 'OUTSIDE_EDIT_WINDOW', 'a session already exists: not through the late path');
select throws_ok(
  $$select tests.save('c3100000-0000-4000-8000-000000000012', tests.today() - 3,
      jsonb_build_object('captured_at', tests.at10(tests.today() - 3) - interval '11 hours'))$$,
  '42501', 'OUTSIDE_EDIT_WINDOW', 'captured before the session date: refused');
select throws_ok(
  $$select tests.save('c3100000-0000-4000-8000-000000000013', tests.today() - 3,
      jsonb_build_object('captured_at', now() + interval '1 hour'))$$,
  '42501', 'OUTSIDE_EDIT_WINDOW', 'captured in the future: refused');
select throws_ok(
  $$select tests.save('c3100000-0000-4000-8000-000000000014', tests.today() - 6,
      jsonb_build_object('captured_at', tests.at10(tests.today() - 3)))$$,
  '42501', 'OUTSIDE_EDIT_WINDOW', 'captured after the date''s own window closed: refused');
select throws_ok(
  $$select tests.save('c3100000-0000-4000-8000-000000000015', tests.today() - 8,
      jsonb_build_object('captured_at', tests.at10(tests.today() - 8)))$$,
  '42501', 'OUTSIDE_EDIT_WINDOW', 'arrived more than 7 days after capture: refused');
select throws_ok(
  $$select tests.save('c3100000-0000-4000-8000-000000000016', tests.today() - 3)$$,
  '42501', 'OUTSIDE_EDIT_WINDOW', 'no captured_at: the window binds as before');
select throws_ok(
  $$select tests.save('c3100000-0000-4000-8000-000000000017', tests.today() - 3,
      jsonb_build_object('captured_at', 'yesterday-ish'))$$,
  '22023', 'VALIDATION', 'a malformed captured_at is VALIDATION');
select tests.logout();

select is((select count(*)::int from public.attendance_sessions
            where section_id = tests.id('ka') and date in (tests.today() - 3, tests.today() - 6, tests.today() - 8)),
  0, 'nothing was written by a refused late replay');
select ok(not (tests.session(tests.today() - 5)).synced_late,
  'the existing session is untouched');

-- =====================================================================
-- In the window: no late stamp; queued_offline in the audit row (AC-2)
-- =====================================================================
select tests.login('f3100000-0000-0000-0000-000000000002');
select tests.save('c3100000-0000-4000-8000-000000000020', tests.today() - 1,
  jsonb_build_object('captured_at', now() - interval '1 minute'));
select tests.save('c3100000-0000-4000-8000-000000000021', tests.today());
select tests.logout();

select ok(not (tests.session(tests.today() - 1)).synced_late,
  'a replay inside the window is not synced late');
select is((select (after ->> 'queued_offline')::boolean from public.audit_events
            where action = 'attendance_sessions.insert'
              and row_id = (tests.session(tests.today() - 1)).id), true,
  'a replay''s audit row carries queued_offline: true');
select ok((select after ? 'captured_at' and after ->> 'captured_at' is not null from public.audit_events
            where action = 'attendance_sessions.insert'
              and row_id = (tests.session(tests.today() - 1)).id),
  '... and when it was captured');
select is((select (after ->> 'queued_offline')::boolean from public.audit_events
            where action = 'attendance_sessions.insert'
              and row_id = (tests.session(tests.today())).id), false,
  'an online save''s audit row carries queued_offline: false');
select ok((tests.session(tests.today())).captured_at is null,
  'an online save has no captured_at');

select * from finish();
rollback;
