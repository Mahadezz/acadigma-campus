-- =====================================================================
-- pgTAP · F-OP-03 Part 6 review (D-208 BLOCKER fix) —
-- `public.attendance_register` (20260926072044_report_register_marksheet_kinds.sql).
--
-- Proves the two things the review flagged:
--   1. No PostgREST `max_rows` cap (supabase/config.toml, 1000): a
--      40-student x (28-31 day) month is 1,120+ attendance_records, all
--      returned in one jsonb value, and the count matches the real table
--      exactly (the earlier direct-select version silently dropped rows
--      past 1,000 with no error).
--   2. The roster is every enrolment whose window overlaps the month, not
--      only `students.status = 'active'` — a student who withdrew or
--      joined mid-month still appears; one who left before the month
--      started, or has not joined yet, does not.
-- Plus SECURITY INVOKER cross-school isolation (RLS on the underlying
-- tables, no isolation logic of its own): a School F member gets a null
-- `section` for School E's ids, workspace/section mismatches included.
--
-- The fixture school works all seven days (same trick 34_attendance.sql
-- uses) so every day of the test month is a school day regardless of which
-- weekday it falls on, and dates stay relative to `current_date` so the
-- file passes on any run date.
-- =====================================================================
begin;
select plan(11);

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
  perform set_config('role', 'postgres', true);
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

create or replace function tests.school_input(p_key uuid, p_name text)
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'name', p_name, 'eiin', null, 'board', 'dhaka', 'medium', 'bangla',
    'timezone', 'Asia/Dhaka',
    -- All seven days a working day: no calendar edge case can make a day in
    -- the test month a non-school day.
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

-- A month fully inside the fixture's academic year and safely in the past:
-- two months before the current one, whatever that is.
create or replace function tests.month_start() returns date language sql as $fn$
  select date_trunc('month', current_date - interval '2 months')::date
$fn$;
create or replace function tests.month_end() returns date language sql as $fn$
  select (tests.month_start() + interval '1 month - 1 day')::date
$fn$;

create or replace function tests.roster_ids(p_result jsonb) returns uuid[] language sql as $fn$
  select coalesce(array_agg((elem ->> 'student_id')::uuid), array[]::uuid[])
    from jsonb_array_elements(p_result -> 'roster') elem
$fn$;

-- ---------------------------------------------------------------------
-- fixtures: School E (with the register) and School F (isolation).
-- ---------------------------------------------------------------------
select tests.mkuser('d2080000-0000-0000-0000-000000000001', 'd208.owner.e@test.local', 'Owner E');
select tests.mkuser('d2080000-0000-0000-0000-000000000002', 'd208.owner.f@test.local', 'Owner F');

select tests.login('d2080000-0000-0000-0000-000000000001');
insert into ids select 'e', (public.create_school_workspace(
  tests.school_input('d2080000-0000-4000-8000-000000000001', 'School E')) ->> 'workspace_id')::uuid;
select tests.logout();

select tests.login('d2080000-0000-0000-0000-000000000002');
insert into ids select 'f', (public.create_school_workspace(
  tests.school_input('d2080000-0000-4000-8000-000000000002', 'School F')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into ids
select 'year', id from public.academic_years where workspace_id = tests.id('e')
union all select 'c6', id from public.grade_levels where workspace_id = tests.id('e');

insert into public.sections (workspace_id, academic_year_id, grade_level_id, name)
values (tests.id('e'), tests.id('year'), tests.id('c6'), 'ক');
insert into ids select 'ka', id from public.sections where workspace_id = tests.id('e');

-- 40 students present every school day of the month, enrolled well before
-- it (the "no PostgREST cap" fixture) — direct inserts as postgres, same
-- as every other fixture in this suite: attendance/enrolment tables have
-- no client INSERT grant at all (34_attendance.sql's own proof).
insert into public.students (workspace_id, student_code, first_name, last_name, gender, status)
select tests.id('e'), 'D208-S' || n, 'Student', 'No' || n, 'male'::public.student_gender, 'active'::public.student_status
  from generate_series(1, 40) as n;
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number, status, enrolled_on)
select st.workspace_id, st.id, tests.id('year'), tests.id('ka'), n, 'active'::public.enrollment_status,
       tests.month_start() - 200
  from public.students st
  join generate_series(1, 40) as n on st.student_code = 'D208-S' || n
 where st.workspace_id = tests.id('e');

-- s41: withdrew well before the month started — must NOT be on the register.
insert into public.students (workspace_id, student_code, first_name, last_name, gender, status)
values (tests.id('e'), 'D208-S41', 'Student', 'No41', 'male', 'inactive');
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number, status, enrolled_on, ended_on)
select tests.id('e'), id, tests.id('year'), tests.id('ka'), 41, 'withdrawn', tests.month_start() - 200, tests.month_start() - 10
  from public.students where workspace_id = tests.id('e') and student_code = 'D208-S41';
insert into ids select 's41', id from public.students where workspace_id = tests.id('e') and student_code = 'D208-S41';

-- s42: has not joined yet — enrolled_on is after the month ends. Must NOT
-- be on the register.
insert into public.students (workspace_id, student_code, first_name, last_name, gender, status)
values (tests.id('e'), 'D208-S42', 'Student', 'No42', 'male', 'active');
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number, status, enrolled_on)
select tests.id('e'), id, tests.id('year'), tests.id('ka'), 42, 'active', tests.month_end() + 10
  from public.students where workspace_id = tests.id('e') and student_code = 'D208-S42';
insert into ids select 's42', id from public.students where workspace_id = tests.id('e') and student_code = 'D208-S42';

-- s43: withdrew MID-MONTH — `students.status` is 'inactive', which the old
-- buggy query filtered out entirely (the review's nit fix). MUST be on the
-- register: enrolled_on/ended_on still overlap the month.
insert into public.students (workspace_id, student_code, first_name, last_name, gender, status)
values (tests.id('e'), 'D208-S43', 'Student', 'No43', 'female', 'inactive');
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number, status, enrolled_on, ended_on)
select tests.id('e'), id, tests.id('year'), tests.id('ka'), 43, 'withdrawn', tests.month_start() - 200,
       tests.month_start() + 10
  from public.students where workspace_id = tests.id('e') and student_code = 'D208-S43';
insert into ids select 's43', id from public.students where workspace_id = tests.id('e') and student_code = 'D208-S43';

-- s44: joined MID-MONTH, still active. MUST be on the register.
insert into public.students (workspace_id, student_code, first_name, last_name, gender, status)
values (tests.id('e'), 'D208-S44', 'Student', 'No44', 'female', 'active');
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number, status, enrolled_on)
select tests.id('e'), id, tests.id('year'), tests.id('ka'), 44, 'active', tests.month_start() + 15
  from public.students where workspace_id = tests.id('e') and student_code = 'D208-S44';
insert into ids select 's44', id from public.students where workspace_id = tests.id('e') and student_code = 'D208-S44';

-- One session per day of the month, and one 'present' record for each of
-- the 40 always-enrolled students — 28-31 days x 40 = 1,120+ records,
-- comfortably past PostgREST's 1,000-row `max_rows`.
insert into public.attendance_sessions (workspace_id, section_id, academic_year_id, date, expected_count, present_count)
select tests.id('e'), tests.id('ka'), tests.id('year'), d::date, 40, 40
  from generate_series(tests.month_start(), tests.month_end(), interval '1 day') as d;

insert into public.attendance_records (workspace_id, session_id, student_id, enrollment_id, status)
select tests.id('e'), sess.id, e.student_id, e.id, 'present'
  from public.attendance_sessions sess
  join public.enrollments e
    on e.section_id = sess.section_id and e.workspace_id = sess.workspace_id
 where sess.workspace_id = tests.id('e') and sess.section_id = tests.id('ka')
   and e.roll_number between 1 and 40;

-- =====================================================================
-- 1-2. no PostgREST cap: the RPC returns exactly as many records as the
--      table really has, well past 1,000.
-- =====================================================================
select tests.login('d2080000-0000-0000-0000-000000000001');
create temp table register_e as
select public.attendance_register(tests.id('e'), tests.id('ka'), tests.month_start()) as result;
select tests.logout();

select is(
  (select jsonb_array_length(result -> 'records') from register_e),
  (select count(*)::int from public.attendance_records r
     join public.attendance_sessions s on s.id = r.session_id
    where s.workspace_id = tests.id('e') and s.section_id = tests.id('ka')),
  'every attendance record for the month comes back — no PostgREST max_rows truncation'
);
select ok(
  (select jsonb_array_length(result -> 'records') from register_e) >= 1100,
  'the fixture genuinely exceeds PostgREST''s 1,000-row max_rows (supabase/config.toml)'
);

-- =====================================================================
-- 3. exactly the 42 students whose enrolment window overlaps the month
--    (40 always-enrolled + the mid-month join/withdrawal, s41/s42 excluded)
-- =====================================================================
select is(
  (select jsonb_array_length(result -> 'roster') from register_e),
  42,
  'the roster is every enrolment overlapping the month, not a fixed 40'
);

-- =====================================================================
-- 4-7. the roster nit fix: `students.status` is never the filter, only the
--      enrolment window (enrolled_on/ended_on) is.
-- =====================================================================
select ok(
  tests.id('s43') = any(tests.roster_ids((select result from register_e))),
  'a student who withdrew MID-MONTH (status inactive/withdrawn) is still on the register'
);
select ok(
  tests.id('s44') = any(tests.roster_ids((select result from register_e))),
  'a student who joined MID-MONTH is on the register'
);
select ok(
  not (tests.id('s41') = any(tests.roster_ids((select result from register_e)))),
  'a student who left before the month started is NOT on the register'
);
select ok(
  not (tests.id('s42') = any(tests.roster_ids((select result from register_e)))),
  'a student who has not joined yet is NOT on the register'
);

-- =====================================================================
-- 8-9. the calendar/session wiring: every day of the fixture's
--      all-seven-days-working month is a school day with a session taken.
-- =====================================================================
select is(
  (select count(*)::int from register_e, jsonb_array_elements(result -> 'days') d
    where (d ->> 'is_school_day')::boolean),
  (tests.month_end() - tests.month_start() + 1)::int,
  'every calendar day of the month is a school day for this fixture'
);
select is(
  (select count(*)::int from register_e, jsonb_array_elements(result -> 'days') d
    where not (d ->> 'session_taken')::boolean),
  0,
  'every day has a session taken'
);

-- =====================================================================
-- 10-11. SECURITY INVOKER cross-school isolation: the function adds no
--        row-scoping of its own, so a School F member reading School E's
--        real ids (or a mismatched workspace/section pair) gets a null
--        section from the underlying tables' own RLS.
-- =====================================================================
select tests.login('d2080000-0000-0000-0000-000000000002');
select is(
  public.attendance_register(tests.id('e'), tests.id('ka'), tests.month_start()) -> 'section',
  'null'::jsonb,
  'a School F member reading School E''s real section gets a null section (RLS isolation)'
);
select is(
  public.attendance_register(tests.id('f'), tests.id('ka'), tests.month_start()) -> 'section',
  'null'::jsonb,
  'School F''s own workspace_id with School E''s section_id also resolves to no section'
);
select tests.logout();

select * from finish();
rollback;
