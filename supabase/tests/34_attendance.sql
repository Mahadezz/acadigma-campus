-- =====================================================================
-- pgTAP · F-AC-03 demo cut — daily roll call
-- (20260925300309_attendance.sql, D-104)
--
-- save_attendance: who may mark (class teacher, owner/admin), the edit
-- window, future dates, non-school days, exactly the enrolled students,
-- "Mark all present" stamping, idempotency, no silent overwrite, audit
-- only on change; isolation and escalation; one session per section per
-- day; the attendance percentage; the Today overview; read-only mode.
--
-- Dates are relative to the school's today, and the fixture school works
-- all seven days, so the file passes on any day of the week.
-- =====================================================================
begin;
select plan(47);

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

-- A save of section p_section on p_date; p_patch overrides top-level keys.
create or replace function tests.save(p_key uuid, p_section uuid, p_date date, p_records jsonb, p_patch jsonb default '{}')
returns jsonb language sql as $fn$
  select public.save_attendance(tests.id('a'), jsonb_build_object(
    'idempotency_key', p_key, 'section_id', p_section, 'date', p_date, 'records', p_records) || p_patch)
$fn$;

create or replace function tests.recs(p_statuses text[])
returns jsonb language sql as $fn$
  select jsonb_agg(jsonb_build_object('student_id', tests.id('s' || i), 'status', p_statuses[i]))
    from generate_subscripts(p_statuses, 1) as i
$fn$;

select tests.mkuser('f1040000-0000-0000-0000-000000000001', 'd104.owner@test.local',   'Owner A');
select tests.mkuser('f1040000-0000-0000-0000-000000000002', 'd104.classt@test.local',  'Class Teacher A');
select tests.mkuser('f1040000-0000-0000-0000-000000000003', 'd104.teacher@test.local', 'Other Teacher A');
select tests.mkuser('f1040000-0000-0000-0000-000000000004', 'd104.staff@test.local',   'Staff A');
select tests.mkuser('f1040000-0000-0000-0000-000000000005', 'd104.parent@test.local',  'Parent A');
select tests.mkuser('f1040000-0000-0000-0000-000000000006', 'd104.ownerb@test.local',  'Owner B');

select tests.login('f1040000-0000-0000-0000-000000000001');
insert into ids select 'a', (public.create_school_workspace(
  tests.school_input('a1040000-0000-4000-8000-000000000001', 'School A')) ->> 'workspace_id')::uuid;
select tests.logout();
select tests.login('f1040000-0000-0000-0000-000000000006');
insert into ids select 'b', (public.create_school_workspace(
  tests.school_input('a1040000-0000-4000-8000-000000000002', 'School B')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status) values
  (tests.id('a'), 'f1040000-0000-0000-0000-000000000002', 'teacher', 'active'),
  (tests.id('a'), 'f1040000-0000-0000-0000-000000000003', 'teacher', 'active'),
  (tests.id('a'), 'f1040000-0000-0000-0000-000000000004', 'staff',   'active'),
  (tests.id('a'), 'f1040000-0000-0000-0000-000000000005', 'parent',  'active');

insert into ids
select 'year', id from public.academic_years where workspace_id = tests.id('a')
union all select 'c6', id from public.grade_levels where workspace_id = tests.id('a')
union all select 'b_year', id from public.academic_years where workspace_id = tests.id('b')
union all select 'b_c6', id from public.grade_levels where workspace_id = tests.id('b')
union all select 'classt_m', id from public.workspace_members
  where workspace_id = tests.id('a') and user_id = 'f1040000-0000-0000-0000-000000000002';

insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  (tests.id('a'), tests.id('year'), tests.id('c6'), 'ক', tests.id('classt_m')),
  (tests.id('a'), tests.id('year'), tests.id('c6'), 'খ', null),
  (tests.id('b'), tests.id('b_year'), tests.id('b_c6'), 'ক', null);
insert into ids
select 'ka', id from public.sections where workspace_id = tests.id('a') and name = 'ক'
union all select 'kha', id from public.sections where workspace_id = tests.id('a') and name = 'খ'
union all select 'b_ka', id from public.sections where workspace_id = tests.id('b');

-- Three students in ক, one in খ, all enrolled from the year's first day.
select tests.login('f1040000-0000-0000-0000-000000000001');
do $$
declare i int;
begin
  for i in 1..4 loop
    insert into ids select 's' || i, (public.admit_student(tests.id('a'), jsonb_build_object(
      'idempotency_key', md5('d104-student-' || i)::uuid,
      'first_name', 'Student', 'last_name', 'No' || i, 'gender', 'male',
      'date_of_birth', '2014-01-01',
      'section_id', case when i = 4 then tests.id('kha') else tests.id('ka') end,
      'enrolled_on', (current_date - 200)::text,
      'guardian', jsonb_build_object('relation', 'father', 'full_name', 'G', 'phone', '+8801000000001')))
      ->> 'student_id')::uuid;
  end loop;
end
$$;
select tests.logout();

-- =====================================================================
-- The 60-second path: the class teacher marks all present, flips, saves
-- =====================================================================
select tests.login('f1040000-0000-0000-0000-000000000002');
create temp table first_save as
select tests.save('c1040000-0000-4000-8000-000000000001', tests.id('ka'), tests.today(),
  tests.recs(array['present', 'absent', 'late']), '{"bulk_marked": true}') as r;
select is((select (r ->> 'present')::int * 100 + (r ->> 'absent')::int * 10 + (r ->> 'late')::int from first_save),
  111, 'the class teacher saves today: 1 present, 1 absent, 1 late');
select is((select (r ->> 'expected')::int from first_save), 3, 'the session expects the 3 enrolled students');
select tests.logout();
insert into ids select 'sess', (r ->> 'session_id')::uuid from first_save;

select ok((select bulk_marked_by = tests.id('classt_m') and bulk_marked_at is not null
             and taken_by = tests.id('classt_m') and not edited_after_window
             from public.attendance_sessions where id = tests.id('sess')),
  '"Mark all present" is stamped with who and when (D-22)');
select is((select count(*)::int from public.attendance_records where session_id = tests.id('sess')), 3,
  'one record per student');

select tests.login('f1040000-0000-0000-0000-000000000002');
select is((tests.save('c1040000-0000-4000-8000-000000000001', tests.id('ka'), tests.today(),
            tests.recs(array['present', 'absent', 'late']), '{"bulk_marked": true}') ->> 'session_id')::uuid,
  tests.id('sess'), 'a replayed save returns the stored session');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000002', tests.id('ka'), tests.today(),
      tests.recs(array['present', 'present', 'late']))$$,
  '40001', 'CONFLICT', 'a second save that does not name the version it loaded is refused (no silent overwrite)');
select lives_ok(
  format($$select tests.save('c1040000-0000-4000-8000-000000000003', tests.id('ka'), tests.today(),
      tests.recs(array['present', 'present', 'late']), jsonb_build_object('expected_updated_at', %L))$$,
    (select updated_at from public.attendance_sessions where id = tests.id('sess'))),
  'a re-save naming the loaded version updates the day');
select tests.logout();

select is((select present_count * 100 + absent_count * 10 + late_count from public.attendance_sessions where id = tests.id('sess')),
  201, 'the counts follow the re-save');
select is((select count(*)::int from public.attendance_sessions where section_id = tests.id('ka')), 1,
  'still exactly one session for the day');
select is((select count(*)::int from public.audit_events where action = 'attendance_records.update'
            and (after ->> 'session_id')::uuid = tests.id('sess')), 1,
  'only the one changed record is audited');
select is((select count(*)::int from public.audit_events where action = 'attendance_records.insert'), 0,
  'the first save does not write one audit row per student');
select is((select count(*)::int from public.audit_events where action = 'attendance_sessions.insert'
            and row_id = tests.id('sess')), 1, 'the first save is audited on the session');

-- =====================================================================
-- Refusals
-- =====================================================================
select tests.login('f1040000-0000-0000-0000-000000000002');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000010', tests.id('ka'), tests.today() - 1,
      tests.recs(array['present', 'absent']))$$,
  '22023', 'UNMARKED_STUDENTS', 'every enrolled student needs an explicit status (nothing presumed present)');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000011', tests.id('ka'), tests.today() - 1,
      tests.recs(array['present', 'absent', 'late', 'present']))$$,
  '22023', 'STUDENT_NOT_ENROLLED', 'a student of another section is refused');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000012', tests.id('ka'), tests.today() - 1,
      tests.recs(array['present', 'absent', 'asleep']))$$,
  '22023', 'VALIDATION', 'an unknown status is refused');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000013', tests.id('ka'), tests.today() + 1,
      tests.recs(array['present', 'absent', 'late']))$$,
  '22023', 'FUTURE_DATE', 'tomorrow cannot be marked');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000014', tests.id('ka'), tests.today() - 5,
      tests.recs(array['present', 'absent', 'late']))$$,
  '42501', 'OUTSIDE_EDIT_WINDOW', 'a teacher cannot mark a day beyond the 2-day window');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000015', tests.id('kha'), tests.today(),
      '[]'::jsonb)$$,
  '42501', 'NOT_ASSIGNED', 'a class teacher cannot mark another section');
select tests.logout();

select tests.login('f1040000-0000-0000-0000-000000000003');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000016', tests.id('ka'), tests.today() - 1,
      tests.recs(array['present', 'absent', 'late']))$$,
  '42501', 'NOT_ASSIGNED', 'escalation: a teacher who is not the class teacher cannot mark');
select tests.logout();

select tests.login('f1040000-0000-0000-0000-000000000004');
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000017', tests.id('ka'), tests.today() - 1,
      tests.recs(array['present', 'absent', 'late']))$$,
  '42501', 'FORBIDDEN', 'escalation: staff cannot mark');
select tests.logout();

select tests.login('f1040000-0000-0000-0000-000000000001');
select lives_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000018', tests.id('ka'), tests.today() - 5,
      tests.recs(array['present', 'present', 'absent']))$$,
  'an owner may mark beyond the window');
select ok((select edited_after_window and bulk_marked_by is null from public.attendance_sessions
            where section_id = tests.id('ka') and date = tests.today() - 5),
  'a late save is stamped edited_after_window; no bulk stamp without the bulk action');
select lives_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000019', tests.id('kha'), tests.today(),
      jsonb_build_array(jsonb_build_object('student_id', tests.id('s4'), 'status', 'present')))$$,
  'an owner may mark any section');
insert into public.holidays (workspace_id, name, starts_on, ends_on)
values (tests.id('a'), 'Test holiday', tests.today() - 1, tests.today() - 1);
select throws_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000020', tests.id('ka'), tests.today() - 1,
      tests.recs(array['present', 'absent', 'late']))$$,
  '22023', 'NOT_SCHOOL_DAY', 'a holiday is refused by default');
select lives_ok(
  $$select tests.save('c1040000-0000-4000-8000-000000000021', tests.id('ka'), tests.today() - 1,
      tests.recs(array['present', 'absent', 'late']), '{"allow_non_school_day": true}')$$,
  '... and allowed when the teacher confirms "take attendance anyway"');
select throws_ok(
  $$insert into public.attendance_sessions (workspace_id, section_id, academic_year_id, date, expected_count)
    values (tests.id('a'), tests.id('ka'), tests.id('year'), tests.today() - 2, 3)$$,
  '42501', 'permission denied for table attendance_sessions',
  'even an owner writes attendance only through save_attendance');
select throws_ok(
  $$update public.attendance_records set status = 'present' where session_id = tests.id('sess')$$,
  '42501', 'permission denied for table attendance_records',
  'records cannot be edited directly');
select tests.logout();

-- =====================================================================
-- Database rules the function cannot bypass
-- =====================================================================
select throws_ok(
  $$insert into public.attendance_sessions (workspace_id, section_id, academic_year_id, date, expected_count)
    values (tests.id('a'), tests.id('ka'), tests.id('year'), tests.today(), 3)$$,
  '23505', 'duplicate key value violates unique constraint "attendance_sessions_section_date_key"',
  'one session per section per day');
select throws_ok(
  $$insert into public.attendance_records (workspace_id, session_id, student_id, enrollment_id, status)
    values (tests.id('a'), tests.id('sess'), tests.id('s4'),
            (select id from public.enrollments where student_id = tests.id('s4')), 'present'),
           (tests.id('a'), tests.id('sess'), tests.id('s4'),
            (select id from public.enrollments where student_id = tests.id('s4')), 'absent')$$,
  '23505', 'duplicate key value violates unique constraint "attendance_records_session_student_key"',
  'one record per student per session');
select throws_ok(
  $$insert into public.attendance_sessions (workspace_id, section_id, academic_year_id, date, expected_count)
    values (tests.id('b'), tests.id('ka'), tests.id('year'), tests.today() - 3, 3)$$,
  '23503', 'insert or update on table "attendance_sessions" violates foreign key constraint "attendance_sessions_section_fkey"',
  'a session cannot point at another school''s section');
select throws_ok(
  $$insert into public.attendance_records (workspace_id, session_id, student_id, enrollment_id, status)
    values (tests.id('b'), tests.id('sess'), tests.id('s4'),
            (select id from public.enrollments where student_id = tests.id('s4')), 'present')$$,
  '23503', 'insert or update on table "attendance_records" violates foreign key constraint "attendance_records_session_fkey"',
  'a record cannot be filed under another school');

-- =====================================================================
-- Who reads what
-- =====================================================================
select tests.login('f1040000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.attendance_sessions where workspace_id = tests.id('a')), 4,
  'any teacher reads the school''s sessions (they substitute)');
select tests.logout();
select tests.login('f1040000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.attendance_records where workspace_id = tests.id('a')), 10,
  'staff read records');
select tests.logout();
select tests.login('f1040000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.attendance_sessions where workspace_id = tests.id('a'))
        + (select count(*)::int from public.attendance_records where workspace_id = tests.id('a')), 0,
  'a parent member reads nothing yet (their portal is F-AC-10)');
select tests.logout();
select tests.login('f1040000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.attendance_sessions where workspace_id = tests.id('a'))
        + (select count(*)::int from public.attendance_records where workspace_id = tests.id('a')), 0,
  'isolation: another school''s owner reads nothing');
select throws_ok(
  $$select public.save_attendance(tests.id('a'), jsonb_build_object('idempotency_key', 'c1040000-0000-4000-8000-000000000030',
      'section_id', tests.id('ka'), 'date', app.school_today(tests.id('a')), 'records', '[]'::jsonb))$$,
  '42501', 'FORBIDDEN', 'isolation: another school''s owner cannot mark here');
select throws_ok(
  $$select public.save_attendance(tests.id('b'), jsonb_build_object('idempotency_key', 'c1040000-0000-4000-8000-000000000031',
      'section_id', tests.id('ka'), 'date', app.school_today(tests.id('b')), 'records', '[]'::jsonb))$$,
  '22023', 'SECTION_NOT_FOUND', 'isolation: nor through their own school');
select is((public.attendance_day(tests.id('a')) -> 'sections')::text, '[]',
  'isolation: the Today overview of another school is empty');
select tests.logout();

-- =====================================================================
-- The Today overview
-- =====================================================================
select tests.login('f1040000-0000-0000-0000-000000000002');
create temp table day as select public.attendance_day(tests.id('a')) as d;
select is((select jsonb_array_length(d -> 'sections') from day), 2, 'Today lists both live sections');
select is((select (s ->> 'is_mine')::boolean from day, jsonb_array_elements(d -> 'sections') s
            where s ->> 'section_name' = 'ক'), true, 'the class teacher''s own section is marked as theirs');
select is((select (s -> 'session' ->> 'present')::int from day, jsonb_array_elements(d -> 'sections') s
            where s ->> 'section_name' = 'ক'), 2, 'with today''s session counts');
select is((select (s ->> 'enrolled')::int from day, jsonb_array_elements(d -> 'sections') s
            where s ->> 'section_name' = 'খ'), 1, 'and each section''s enrolled count');
select tests.logout();

-- =====================================================================
-- §5.4 the percentage (AC5): 18 present, 1 late, 1 half day, 2 absent
-- =====================================================================
insert into public.attendance_sessions (workspace_id, section_id, academic_year_id, date, expected_count)
select tests.id('a'), tests.id('kha'), tests.id('year'), tests.today() - 30 - i, 1
  from generate_series(1, 22) i;
insert into public.attendance_records (workspace_id, session_id, student_id, enrollment_id, status)
select tests.id('a'), s.id, tests.id('s4'), (select id from public.enrollments where student_id = tests.id('s4')),
       (case when rn <= 18 then 'present' when rn = 19 then 'late' when rn = 20 then 'half_day' else 'absent' end)::public.attendance_status
  from (select id, row_number() over (order by date) rn from public.attendance_sessions
         where section_id = tests.id('kha') and date < tests.today() - 30) s;
select is(app.attendance_pct(tests.id('a'), tests.id('s4'), tests.today() - 60, tests.today() - 31), 90.91::numeric,
  'AC5: (18 + 1 + 1) / 22 = 90.91 with late and half day counting present');
update public.school_profiles set attendance_policy = attendance_policy || '{"half_day_counts_present": false}'
 where workspace_id = tests.id('a');
select is(app.attendance_pct(tests.id('a'), tests.id('s4'), tests.today() - 60, tests.today() - 31), 86.36::numeric,
  'when half day does not count: 19 / 22 = 86.36');
select is(app.attendance_pct(tests.id('a'), tests.id('s4'), tests.today() - 400, tests.today() - 300), 0::numeric,
  'no records is 0, never a division by zero');

-- =====================================================================
-- Read-only, anon
-- =====================================================================
update public.workspaces set access_mode = 'read_only' where id = tests.id('a');
select tests.login('f1040000-0000-0000-0000-000000000002');
select throws_ok(
  format($$select tests.save('c1040000-0000-4000-8000-000000000040', tests.id('ka'), tests.today(),
      tests.recs(array['absent', 'absent', 'absent']), jsonb_build_object('expected_updated_at', %L))$$,
    (select updated_at from public.attendance_sessions where id = tests.id('sess'))),
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot save attendance');
select tests.logout();

select ok(not has_table_privilege('anon', 'public.attendance_sessions', 'select')
          and not has_table_privilege('anon', 'public.attendance_records', 'select')
          and not has_function_privilege('anon', 'public.save_attendance(uuid, jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.attendance_day(uuid, date)', 'execute'),
  'anon has no privilege on attendance');

select * from finish();
rollback;
