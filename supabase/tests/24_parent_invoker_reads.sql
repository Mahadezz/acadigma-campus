-- =====================================================================
-- pgTAP · Security audit Part 1 (D-75) — what a parent login gets from
-- the SECURITY INVOKER readers (the D-203 lesson: an invoker function is
-- only as right as the RLS under it, so prove it for the parent role).
--
-- #76 LOW: public.attendance_register returns {"section": null} to a
-- parent, even for their own linked child's section (parents read neither
-- sections nor attendance). The same holds for the other invoker readers
-- a parent can call over PostgREST: attendance_day lists no sections,
-- exam_marks_progress no papers, student_import_existing no students.
-- =====================================================================
begin;
select plan(6);

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

-- ---------------------------------------------------------------------
-- Fixture (as postgres): one school, one section, one student with a
-- taken register today and an exam paper; P is that student's linked
-- parent (active parent membership, active guardian link).
-- ---------------------------------------------------------------------
select tests.mkuser('24000000-0000-4000-a000-000000000001', 'owner@pi24.local', 'Owner');
select tests.mkuser('24000000-0000-4000-a000-000000000002', 'parent@pi24.local', 'Parent');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values ('24000000-0000-4000-b000-000000000001', 'school', 'Parent Reads School', 'parent-reads-24',
        '24000000-0000-4000-a000-000000000001', '24000000-0000-4000-a000-000000000001', 'active');
insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('24000000-0000-4000-b000-000000000001', '24000000-0000-4000-a000-000000000002',
        'parent', 'active', now());

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on, is_current)
values ('24000000-0000-4000-c000-000000000001', '24000000-0000-4000-b000-000000000001', 'This year',
        current_date - 200, current_date + 150, true);
insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values ('24000000-0000-4000-c000-000000000002', '24000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ', 6);
insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name)
values ('24000000-0000-4000-c000-000000000003', '24000000-0000-4000-b000-000000000001',
        '24000000-0000-4000-c000-000000000001', '24000000-0000-4000-c000-000000000002', 'A');
insert into public.students (id, workspace_id, student_code, first_name, last_name, gender)
values ('24000000-0000-4000-d000-000000000001', '24000000-0000-4000-b000-000000000001',
        'PI1', 'Parent', 'Child', 'female');
insert into public.student_private_details (student_id, workspace_id, date_of_birth)
values ('24000000-0000-4000-d000-000000000001', '24000000-0000-4000-b000-000000000001', '2014-01-01');
insert into public.enrollments (id, workspace_id, student_id, academic_year_id, section_id, roll_number, enrolled_on)
values ('24000000-0000-4000-d000-000000000002', '24000000-0000-4000-b000-000000000001',
        '24000000-0000-4000-d000-000000000001', '24000000-0000-4000-c000-000000000001',
        '24000000-0000-4000-c000-000000000003', 1, current_date - 100);
insert into public.guardians (id, workspace_id, student_id, relation, full_name, phone, is_primary)
values ('24000000-0000-4000-d000-000000000003', '24000000-0000-4000-b000-000000000001',
        '24000000-0000-4000-d000-000000000001', 'mother', 'Parent', '+8801700000024', true);
insert into public.guardian_users (workspace_id, guardian_id, student_id, user_id, status, accepted_at)
values ('24000000-0000-4000-b000-000000000001', '24000000-0000-4000-d000-000000000003',
        '24000000-0000-4000-d000-000000000001', '24000000-0000-4000-a000-000000000002', 'active', now());

insert into public.attendance_sessions (id, workspace_id, section_id, academic_year_id, date, expected_count)
values ('24000000-0000-4000-e000-000000000001', '24000000-0000-4000-b000-000000000001',
        '24000000-0000-4000-c000-000000000003', '24000000-0000-4000-c000-000000000001', current_date, 1);
insert into public.attendance_records (workspace_id, session_id, student_id, enrollment_id, status)
values ('24000000-0000-4000-b000-000000000001', '24000000-0000-4000-e000-000000000001',
        '24000000-0000-4000-d000-000000000001', '24000000-0000-4000-d000-000000000002', 'present');

-- Sanity: the parent really is linked (so a null below is RLS, not a bad fixture).
select tests.login('24000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.students), 1,
  'the parent reads their linked child');

select is(
  public.attendance_register('24000000-0000-4000-b000-000000000001',
    '24000000-0000-4000-c000-000000000003', current_date),
  '{"section": null}'::jsonb,
  '#76: attendance_register gives a parent {"section": null}, even for their child''s section');

select is(
  public.attendance_day('24000000-0000-4000-b000-000000000001', current_date) -> 'sections',
  '[]'::jsonb,
  'attendance_day lists no sections to a parent');

select is(
  public.student_import_existing('24000000-0000-4000-b000-000000000001'),
  '[]'::jsonb,
  'student_import_existing returns no students (or dates of birth) to a parent');

select is(
  public.exam_marks_progress('24000000-0000-4000-b000-000000000001', gen_random_uuid()),
  '{}'::jsonb,
  'exam_marks_progress returns nothing to a parent');
select tests.logout();

-- The same register as the owner is not null (so the parent's null above
-- is the policy, not an empty month).
select tests.login('24000000-0000-4000-a000-000000000001');
select is(
  jsonb_array_length(public.attendance_register('24000000-0000-4000-b000-000000000001',
    '24000000-0000-4000-c000-000000000003', current_date) -> 'records'),
  1,
  'the owner reads the same month''s record');
select tests.logout();

select * from finish();
rollback;
