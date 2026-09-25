-- =====================================================================
-- pgTAP · F-AC-01 demo cut — sections and subjects
-- (20260925300203_sections_and_subjects.sql, D-102)
--
-- Isolation, escalation, the composite (tenant-bound) foreign keys, the
-- natural-key uniqueness, class-teacher eligibility and one-per-year,
-- read-only mode and created_by immutability.
-- =====================================================================
begin;
select plan(28);

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


select tests.mkuser('f1020000-0000-0000-0000-000000000001', 'd102.owner@test.local',   'Owner A');
select tests.mkuser('f1020000-0000-0000-0000-000000000002', 'd102.teacher@test.local', 'Teacher A');
select tests.mkuser('f1020000-0000-0000-0000-000000000003', 'd102.parent@test.local',  'Parent A');
select tests.mkuser('f1020000-0000-0000-0000-000000000004', 'd102.staff@test.local',   'Staff A');
select tests.mkuser('f1020000-0000-0000-0000-000000000005', 'd102.ownerb@test.local',  'Owner B');
select tests.mkuser('f1020000-0000-0000-0000-000000000006', 'd102.teacher2@test.local','Teacher A2');

create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

select tests.login('f1020000-0000-0000-0000-000000000001');
insert into ids select 'a', (public.create_school_workspace(
  tests.school_input('a1020000-0000-4000-8000-000000000001', '{"eiin": null, "name": "School A"}')) ->> 'workspace_id')::uuid;
select tests.logout();
select tests.login('f1020000-0000-0000-0000-000000000005');
insert into ids select 'b', (public.create_school_workspace(
  tests.school_input('a1020000-0000-4000-8000-000000000002', '{"eiin": null, "name": "School B"}')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status) values
  ((select id from ids where label = 'a'), 'f1020000-0000-0000-0000-000000000002', 'teacher', 'active'),
  ((select id from ids where label = 'a'), 'f1020000-0000-0000-0000-000000000003', 'parent',  'active'),
  ((select id from ids where label = 'a'), 'f1020000-0000-0000-0000-000000000004', 'staff',   'active'),
  ((select id from ids where label = 'a'), 'f1020000-0000-0000-0000-000000000006', 'teacher', 'removed');

insert into ids
select 'a_year', id from public.academic_years where workspace_id = (select id from ids where label = 'a')
union all
select 'a_c6', id from public.grade_levels where workspace_id = (select id from ids where label = 'a') and name = 'Class 6'
union all
select 'b_year', id from public.academic_years where workspace_id = (select id from ids where label = 'b')
union all
select 'b_c6', id from public.grade_levels where workspace_id = (select id from ids where label = 'b') and name = 'Class 6'
union all
select 'teacher_m', id from public.workspace_members where workspace_id = (select id from ids where label = 'a') and user_id = 'f1020000-0000-0000-0000-000000000002'
union all
select 'parent_m', id from public.workspace_members where workspace_id = (select id from ids where label = 'a') and user_id = 'f1020000-0000-0000-0000-000000000003'
union all
select 'removed_m', id from public.workspace_members where workspace_id = (select id from ids where label = 'a') and user_id = 'f1020000-0000-0000-0000-000000000006';

-- =====================================================================
-- Sections
-- =====================================================================
select tests.login('f1020000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id, room, capacity, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            (select id from ids where label = 'a_c6'), 'A', (select id from ids where label = 'teacher_m'),
            'Room 204', 40, 'f1020000-0000-0000-0000-000000000001')$$,
  'the owner creates Class 6 – A with a class teacher and a room');
select throws_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            (select id from ids where label = 'a_c6'), 'a', 'f1020000-0000-0000-0000-000000000001')$$,
  '23505', 'duplicate key value violates unique constraint "sections_year_grade_name_key"',
  'section names are unique per year and grade, ignoring case');
select throws_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            (select id from ids where label = 'a_c6'), 'B', (select id from ids where label = 'teacher_m'),
            'f1020000-0000-0000-0000-000000000001')$$,
  '23505', 'duplicate key value violates unique constraint "sections_one_class_teacher_per_year"',
  'a member is class teacher of at most one section per year');
select throws_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            (select id from ids where label = 'a_c6'), 'C', (select id from ids where label = 'parent_m'),
            'f1020000-0000-0000-0000-000000000001')$$,
  '22023', 'MEMBER_NOT_ELIGIBLE', 'a parent member cannot be a class teacher');
select throws_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            (select id from ids where label = 'a_c6'), 'D', (select id from ids where label = 'removed_m'),
            'f1020000-0000-0000-0000-000000000001')$$,
  '22023', 'MEMBER_NOT_ELIGIBLE', 'a removed member cannot be a class teacher');
update public.sections set archived_at = now()
 where workspace_id = (select id from ids where label = 'a') and name = 'A';
select lives_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            (select id from ids where label = 'a_c6'), 'B', (select id from ids where label = 'teacher_m'),
            'f1020000-0000-0000-0000-000000000001')$$,
  'an archived section no longer holds its class teacher');
select throws_ok(
  $$update public.sections set created_by = 'f1020000-0000-0000-0000-000000000005'
     where workspace_id = (select id from ids where label = 'a') and name = 'B'$$,
  '42501', 'created_by is immutable', 'created_by on a section cannot be rewritten');
select tests.logout();

select tests.login('f1020000-0000-0000-0000-000000000005');
select throws_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, created_by)
    values ((select id from ids where label = 'b'), (select id from ids where label = 'b_year'),
            (select id from ids where label = 'a_c6'), 'X', 'f1020000-0000-0000-0000-000000000005')$$,
  '23503', 'insert or update on table "sections" violates foreign key constraint "sections_grade_level_fkey"',
  'a section cannot reference another school''s grade level');
select throws_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id, created_by)
    values ((select id from ids where label = 'b'), (select id from ids where label = 'b_year'),
            (select id from ids where label = 'b_c6'), 'X', (select id from ids where label = 'teacher_m'),
            'f1020000-0000-0000-0000-000000000005')$$,
  '23503', 'insert or update on table "sections" violates foreign key constraint "sections_class_teacher_fkey"',
  'a section cannot name another school''s member as class teacher');
select is(
  (select count(*)::int from public.sections where workspace_id = (select id from ids where label = 'a')),
  0, 'isolation: another school''s owner sees none of this school''s sections');
select throws_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            (select id from ids where label = 'a_c6'), 'Z', 'f1020000-0000-0000-0000-000000000005')$$,
  '42501', 'new row violates row-level security policy for table "sections"',
  'isolation: another school''s owner cannot add a section here');
select tests.logout();

select tests.login('f1020000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.sections where workspace_id = (select id from ids where label = 'a')),
  2, 'a teacher reads the school''s sections, archived included');
select throws_ok(
  $$insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            (select id from ids where label = 'a_c6'), 'T', 'f1020000-0000-0000-0000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "sections"',
  'escalation: a teacher cannot add a section');
update public.sections set room = 'Hacked' where workspace_id = (select id from ids where label = 'a');
select tests.logout();
select is(
  (select count(*)::int from public.sections where room = 'Hacked'),
  0, 'escalation: a teacher''s update of a section touches no rows');

select tests.login('f1020000-0000-0000-0000-000000000004');
select is(
  (select count(*)::int from public.sections where workspace_id = (select id from ids where label = 'a')),
  2, 'staff read sections');
select tests.logout();

-- =====================================================================
-- Subjects
-- =====================================================================
select tests.login('f1020000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into public.subjects (workspace_id, name, name_bn, code, category, subject_kind, created_by)
    values ((select id from ids where label = 'a'), 'Higher Mathematics', 'উচ্চতর গণিত', 'HMATH',
            'optional', 'optional_fourth', 'f1020000-0000-0000-0000-000000000001')$$,
  'the owner adds a subject');
select throws_ok(
  $$insert into public.subjects (workspace_id, name, created_by)
    values ((select id from ids where label = 'a'), 'higher mathematics', 'f1020000-0000-0000-0000-000000000001')$$,
  '23505', 'duplicate key value violates unique constraint "subjects_workspace_name_key"',
  'subject names are unique per school, ignoring case');
select throws_ok(
  $$insert into public.subjects (workspace_id, name, code, created_by)
    values ((select id from ids where label = 'a'), 'Physics', 'HMATH', 'f1020000-0000-0000-0000-000000000001')$$,
  '23505', 'duplicate key value violates unique constraint "subjects_workspace_code_key"',
  'subject codes are unique per school');
select throws_ok(
  $$insert into public.subjects (workspace_id, name, code, created_by)
    values ((select id from ids where label = 'a'), 'Chemistry', 'chem!', 'f1020000-0000-0000-0000-000000000001')$$,
  '23514', 'new row for relation "subjects" violates check constraint "subjects_code_check"',
  'a subject code is upper-case letters, digits and dashes');
select tests.logout();

select tests.login('f1020000-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.sections where workspace_id = (select id from ids where label = 'a'))
  + (select count(*)::int from public.subjects where workspace_id = (select id from ids where label = 'a')),
  0, 'a parent member reads no sections or subjects (T2)');
select tests.logout();

select tests.login('f1020000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.subjects where workspace_id = (select id from ids where label = 'a')),
  1, 'a teacher reads the subject catalogue');
select throws_ok(
  $$insert into public.subjects (workspace_id, name, created_by)
    values ((select id from ids where label = 'a'), 'Art', 'f1020000-0000-0000-0000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "subjects"',
  'escalation: a teacher cannot add a subject');
select tests.logout();

select tests.login('f1020000-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.subjects where workspace_id = (select id from ids where label = 'a')),
  0, 'isolation: another school''s owner sees none of this school''s subjects');
select lives_ok(
  $$insert into public.subjects (workspace_id, name, created_by)
    values ((select id from ids where label = 'b'), 'Higher Mathematics', 'f1020000-0000-0000-0000-000000000005')$$,
  'the same subject name is fine in another school');
select tests.logout();

-- =====================================================================
-- Read-only mode, anon, audit
-- =====================================================================
update public.workspaces set access_mode = 'read_only' where id = (select id from ids where label = 'a');
select tests.login('f1020000-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into public.subjects (workspace_id, name, created_by)
    values ((select id from ids where label = 'a'), 'Art', 'f1020000-0000-0000-0000-000000000001')$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot add a subject');
select throws_ok(
  $$update public.sections set room = 'Room 1' where workspace_id = (select id from ids where label = 'a')$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot edit a section');
select tests.logout();

select ok(not has_table_privilege('anon', 'public.sections', 'select')
          and not has_table_privilege('anon', 'public.subjects', 'select'),
  'anon has no privilege on sections or subjects');
select is(
  (select count(*)::int from public.audit_events
    where workspace_id = (select id from ids where label = 'a') and action = 'sections.insert'),
  2, 'each section insert wrote a generic audit row');

select * from finish();
rollback;
