-- =====================================================================
-- pgTAP · F-AC-03 follow-ups (20260925300311_attendance_any_teacher.sql,
-- D-105)
--
-- Any active teacher of the school marks any section (substitutes cover);
-- staff, parents, non-members and other schools' teachers still cannot;
-- the edit window still binds the substitute. "Enrolled on that date" is
-- enrolled_on..ended_on, not the enrolment's current status.
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

select tests.mkuser('f1050000-0000-0000-0000-000000000001', 'd105.owner@test.local',    'Owner A');
select tests.mkuser('f1050000-0000-0000-0000-000000000002', 'd105.classt@test.local',   'Class Teacher A');
select tests.mkuser('f1050000-0000-0000-0000-000000000003', 'd105.sub@test.local',      'Substitute A');
select tests.mkuser('f1050000-0000-0000-0000-000000000004', 'd105.staff@test.local',    'Staff A');
select tests.mkuser('f1050000-0000-0000-0000-000000000005', 'd105.parent@test.local',   'Parent A');
select tests.mkuser('f1050000-0000-0000-0000-000000000006', 'd105.ownerb@test.local',   'Owner B');
select tests.mkuser('f1050000-0000-0000-0000-000000000007', 'd105.teacherb@test.local', 'Teacher B');
select tests.mkuser('f1050000-0000-0000-0000-000000000008', 'd105.nobody@test.local',   'Not a member');

select tests.login('f1050000-0000-0000-0000-000000000001');
insert into ids select 'a', (public.create_school_workspace(
  tests.school_input('a1050000-0000-4000-8000-000000000001', 'School A')) ->> 'workspace_id')::uuid;
select tests.logout();
select tests.login('f1050000-0000-0000-0000-000000000006');
insert into ids select 'b', (public.create_school_workspace(
  tests.school_input('a1050000-0000-4000-8000-000000000002', 'School B')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status) values
  (tests.id('a'), 'f1050000-0000-0000-0000-000000000002', 'teacher', 'active'),
  (tests.id('a'), 'f1050000-0000-0000-0000-000000000003', 'teacher', 'active'),
  (tests.id('a'), 'f1050000-0000-0000-0000-000000000004', 'staff',   'active'),
  (tests.id('a'), 'f1050000-0000-0000-0000-000000000005', 'parent',  'active'),
  (tests.id('b'), 'f1050000-0000-0000-0000-000000000007', 'teacher', 'active');

insert into ids
select 'year', id from public.academic_years where workspace_id = tests.id('a')
union all select 'c6', id from public.grade_levels where workspace_id = tests.id('a')
union all select 'classt_m', id from public.workspace_members
  where workspace_id = tests.id('a') and user_id = 'f1050000-0000-0000-0000-000000000002'
union all select 'sub_m', id from public.workspace_members
  where workspace_id = tests.id('a') and user_id = 'f1050000-0000-0000-0000-000000000003';

insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  (tests.id('a'), tests.id('year'), tests.id('c6'), 'ক', tests.id('classt_m')),
  (tests.id('a'), tests.id('year'), tests.id('c6'), 'খ', null);
insert into ids
select 'ka', id from public.sections where workspace_id = tests.id('a') and name = 'ক'
union all select 'kha', id from public.sections where workspace_id = tests.id('a') and name = 'খ';

-- Three students in ক, one in খ, all enrolled from the year's first day.
select tests.login('f1050000-0000-0000-0000-000000000001');
do $$
declare i int;
begin
  for i in 1..4 loop
    insert into ids select 's' || i, (public.admit_student(tests.id('a'), jsonb_build_object(
      'idempotency_key', md5('d105-student-' || i)::uuid,
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
-- A substitute covers: any active teacher marks any section
-- =====================================================================
select tests.login('f1050000-0000-0000-0000-000000000003');
select lives_ok(
  $$select tests.save('c1050000-0000-4000-8000-000000000001', tests.id('ka'), tests.today() - 1,
      tests.recs(array['present', 'absent', 'late']))$$,
  'a teacher who is not the class teacher can save the roll call (D-105)');
select tests.logout();
select ok((select s.taken_by = tests.id('sub_m')
             and (select bool_and(r.marked_by = 'f1050000-0000-0000-0000-000000000003')
                    from public.attendance_records r where r.session_id = s.id)
             from public.attendance_sessions s
            where s.section_id = tests.id('ka') and s.date = tests.today() - 1),
  'the session and its records name the substitute who saved');

select tests.login('f1050000-0000-0000-0000-000000000002');
select lives_ok(
  $$select tests.save('c1050000-0000-4000-8000-000000000002', tests.id('kha'), tests.today(),
      jsonb_build_array(jsonb_build_object('student_id', tests.id('s4'), 'status', 'present')))$$,
  'a class teacher can mark another section');
select tests.logout();

select tests.login('f1050000-0000-0000-0000-000000000003');
select throws_ok(
  $$select tests.save('c1050000-0000-4000-8000-000000000003', tests.id('ka'), tests.today() - 5,
      tests.recs(array['present', 'absent', 'late']))$$,
  '42501', 'OUTSIDE_EDIT_WINDOW', 'the edit window still binds a substitute');
select tests.logout();

-- =====================================================================
-- Still refused: staff, parents, non-members, other schools
-- =====================================================================
select tests.login('f1050000-0000-0000-0000-000000000004');
select throws_ok(
  $$select tests.save('c1050000-0000-4000-8000-000000000010', tests.id('ka'), tests.today(),
      tests.recs(array['present', 'absent', 'late']))$$,
  '42501', 'FORBIDDEN', 'escalation: staff cannot mark');
select tests.logout();
select tests.login('f1050000-0000-0000-0000-000000000005');
select throws_ok(
  $$select tests.save('c1050000-0000-4000-8000-000000000011', tests.id('ka'), tests.today(),
      tests.recs(array['present', 'absent', 'late']))$$,
  '42501', 'FORBIDDEN', 'escalation: a parent member cannot mark');
select tests.logout();
select tests.login('f1050000-0000-0000-0000-000000000008');
select throws_ok(
  $$select tests.save('c1050000-0000-4000-8000-000000000012', tests.id('ka'), tests.today(),
      tests.recs(array['present', 'absent', 'late']))$$,
  '42501', 'FORBIDDEN', 'isolation: a signed-in non-member cannot mark');
select tests.logout();
select tests.login('f1050000-0000-0000-0000-000000000007');
select throws_ok(
  $$select tests.save('c1050000-0000-4000-8000-000000000013', tests.id('ka'), tests.today(),
      tests.recs(array['present', 'absent', 'late']))$$,
  '42501', 'FORBIDDEN', 'isolation: another school''s teacher cannot mark here');
select throws_ok(
  $$select public.save_attendance(tests.id('b'), jsonb_build_object(
      'idempotency_key', 'c1050000-0000-4000-8000-000000000014', 'section_id', tests.id('ka'),
      'date', app.school_today(tests.id('b')), 'records', tests.recs(array['present', 'absent', 'late'])))$$,
  '22023', 'SECTION_NOT_FOUND', 'isolation: nor through their own school');
select tests.logout();

-- =====================================================================
-- §5.3: enrolled on the date by enrolled_on/ended_on, not current status
-- =====================================================================
update public.enrollments set status = 'transferred', ended_on = tests.today() - 1
 where student_id = tests.id('s3');

select tests.login('f1050000-0000-0000-0000-000000000003');
select is((tests.save('c1050000-0000-4000-8000-000000000020', tests.id('ka'), tests.today(),
            tests.recs(array['present', 'present'])) ->> 'expected')::int, 2,
  'a student whose enrolment ended yesterday is not on today''s register');
select is((tests.save('c1050000-0000-4000-8000-000000000021', tests.id('ka'), tests.today() - 2,
            tests.recs(array['present', 'present', 'absent'])) ->> 'expected')::int, 3,
  '... but is on the register of a day they were enrolled, though transferred now');
select is((select (s ->> 'enrolled')::int
             from jsonb_array_elements(public.attendance_day(tests.id('a'), tests.today() - 1) -> 'sections') s
            where s ->> 'section_name' = 'ক'), 3,
  'Today counts the transferred student on a day they were enrolled');
select is((select (s ->> 'enrolled')::int
             from jsonb_array_elements(public.attendance_day(tests.id('a')) -> 'sections') s
            where s ->> 'section_name' = 'ক'), 2,
  '... and not after their enrolment ended');
select tests.logout();

select * from finish();
rollback;
