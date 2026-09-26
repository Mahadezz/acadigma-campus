-- =====================================================================
-- pgTAP · F-AC-01 Part 5 demo cut — section_subjects
-- (20260926021923_section_subjects.sql, D-107)
--
--   A. public.set_section_subjects adds, re-teachers and removes rows.
--   B. Constraints: one row per (section, subject); an eligible teacher;
--      composite FKs block another school's subject or teacher.
--   C. RLS isolation + escalation (another school, teacher, parent, anon).
--   D. create_exam defaults each paper's teacher from section_subjects.
--   E. A removed member stops teaching; read-only; audit; created_by;
--      an archived subject cannot be added; removing a teacher from a
--      READ-ONLY school still works and releases their assignments.
-- =====================================================================
begin;
select plan(31);

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

-- Users: a1 owner A, a2 teacher A, a3 parent A, a4 owner B, a5 teacher A2
select tests.mkuser('37000000-0000-4000-a000-000000000001', 'ss-owner-a@test.local',   'Owner A');
select tests.mkuser('37000000-0000-4000-a000-000000000002', 'ss-teacher-a@test.local', 'Teacher A');
select tests.mkuser('37000000-0000-4000-a000-000000000003', 'ss-parent-a@test.local',  'Parent A');
select tests.mkuser('37000000-0000-4000-a000-000000000004', 'ss-owner-b@test.local',   'Owner B');
select tests.mkuser('37000000-0000-4000-a000-000000000005', 'ss-teacher-a2@test.local','Teacher A2');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('37000000-0000-4000-b000-000000000001', 'school', 'SS School A', 'ss-school-a-37',
   '37000000-0000-4000-a000-000000000001', '37000000-0000-4000-a000-000000000001', 'active'),
  ('37000000-0000-4000-b000-000000000002', 'school', 'SS School B', 'ss-school-b-37',
   '37000000-0000-4000-a000-000000000004', '37000000-0000-4000-a000-000000000004', 'active');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values
  ('37000000-0000-4000-d000-000000000002', '37000000-0000-4000-b000-000000000001', '37000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('37000000-0000-4000-d000-000000000003', '37000000-0000-4000-b000-000000000001', '37000000-0000-4000-a000-000000000003', 'parent',  'active', now()),
  ('37000000-0000-4000-d000-000000000005', '37000000-0000-4000-b000-000000000001', '37000000-0000-4000-a000-000000000005', 'teacher', 'active', now());

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on)
values
  ('37000000-0000-4000-c000-000000000001', '37000000-0000-4000-b000-000000000001', '2026', '2026-01-01', '2026-12-31'),
  ('37000000-0000-4000-c000-000000000002', '37000000-0000-4000-b000-000000000002', '2026', '2026-01-01', '2026-12-31');

insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values
  ('37000000-0000-4000-c000-000000000011', '37000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ শ্রেণি', 6),
  ('37000000-0000-4000-c000-000000000012', '37000000-0000-4000-b000-000000000002', 'Class 6', 'ষষ্ঠ শ্রেণি', 6);

insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name, archived_at)
values
  ('37000000-0000-4000-c000-000000000021', '37000000-0000-4000-b000-000000000001',
   '37000000-0000-4000-c000-000000000001', '37000000-0000-4000-c000-000000000011', 'A', null),
  ('37000000-0000-4000-c000-000000000022', '37000000-0000-4000-b000-000000000001',
   '37000000-0000-4000-c000-000000000001', '37000000-0000-4000-c000-000000000011', 'Old', now()),
  ('37000000-0000-4000-c000-000000000023', '37000000-0000-4000-b000-000000000002',
   '37000000-0000-4000-c000-000000000002', '37000000-0000-4000-c000-000000000012', 'A', null);

insert into public.subjects (id, workspace_id, name)
values
  ('37000000-0000-4000-c000-000000000031', '37000000-0000-4000-b000-000000000001', 'Mathematics 37'),
  ('37000000-0000-4000-c000-000000000032', '37000000-0000-4000-b000-000000000001', 'English 37'),
  ('37000000-0000-4000-c000-000000000033', '37000000-0000-4000-b000-000000000001', 'Science 37'),
  ('37000000-0000-4000-c000-000000000034', '37000000-0000-4000-b000-000000000002', 'Mathematics 37');

-- ---------------------------------------------------------------------
-- A. set_section_subjects (owner A)
-- ---------------------------------------------------------------------
select tests.login('37000000-0000-4000-a000-000000000001');
select is(
  public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', jsonb_build_array(
    jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000031',
                       'teacher_id', '37000000-0000-4000-d000-000000000002'),
    jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000032', 'teacher_id', null))),
  2, 'the owner gives Class 6 – A two subjects');
select is(
  public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', jsonb_build_array(
    jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000031', 'teacher_id', null),
    jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000033',
                       'teacher_id', '37000000-0000-4000-d000-000000000002'))),
  2, 'saving again replaces the list: English off, Science on');
select tests.logout();

select is(
  (select array_agg(subject_id::text || ':' || coalesce(teacher_id::text, '-') order by subject_id)
     from public.section_subjects where section_id = '37000000-0000-4000-c000-000000000021'),
  array['37000000-0000-4000-c000-000000000031:-',
        '37000000-0000-4000-c000-000000000033:37000000-0000-4000-d000-000000000002'],
  'Mathematics lost its teacher, English is gone, Science has Teacher A');

select tests.login('37000000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000022', '[]'::jsonb)$$,
  'P0002', 'SECTION_NOT_FOUND', 'an archived section''s subjects cannot be set');

-- ---------------------------------------------------------------------
-- B. Constraints
-- ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.section_subjects (workspace_id, section_id, subject_id, created_by)
    values ('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021',
            '37000000-0000-4000-c000-000000000031', '37000000-0000-4000-a000-000000000001')$$,
  '23505', 'duplicate key value violates unique constraint "section_subjects_section_subject_key"',
  'a subject appears once per section');
select throws_ok(
  $$select public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', jsonb_build_array(
      jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000032',
                         'teacher_id', '37000000-0000-4000-d000-000000000003')))$$,
  '22023', 'MEMBER_NOT_ELIGIBLE', 'a parent member cannot teach a subject');
select throws_ok(
  $$select public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', jsonb_build_array(
      jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000034', 'teacher_id', null)))$$,
  '23503', 'insert or update on table "section_subjects" violates foreign key constraint "section_subjects_subject_fkey"',
  'a section cannot take another school''s subject');
select throws_ok(
  $$update public.section_subjects set created_by = '37000000-0000-4000-a000-000000000004'
     where section_id = '37000000-0000-4000-c000-000000000021'$$,
  '42501', 'created_by is immutable', 'created_by cannot be rewritten');
select tests.logout();

-- ---------------------------------------------------------------------
-- C. RLS isolation + escalation
-- ---------------------------------------------------------------------
select tests.login('37000000-0000-4000-a000-000000000004');
select is(
  (select count(*)::int from public.section_subjects
    where workspace_id = '37000000-0000-4000-b000-000000000001'),
  0, 'isolation: another school''s owner sees none of these rows');
select throws_ok(
  $$select public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', '[]'::jsonb)$$,
  'P0002', 'SECTION_NOT_FOUND', 'isolation: another school''s owner cannot find the section');
select throws_ok(
  $$insert into public.section_subjects (workspace_id, section_id, subject_id, teacher_id, created_by)
    values ('37000000-0000-4000-b000-000000000002', '37000000-0000-4000-c000-000000000023',
            '37000000-0000-4000-c000-000000000034', '37000000-0000-4000-d000-000000000002',
            '37000000-0000-4000-a000-000000000004')$$,
  '22023', 'MEMBER_NOT_ELIGIBLE',
  'a row cannot name another school''s member as teacher (refused before the FK, no probing)');
select throws_ok(
  $$insert into public.section_subjects (workspace_id, section_id, subject_id, created_by)
    values ('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021',
            '37000000-0000-4000-c000-000000000032', '37000000-0000-4000-a000-000000000004')$$,
  '42501', 'new row violates row-level security policy for table "section_subjects"',
  'isolation: another school''s owner cannot add a row here');
select tests.logout();

select tests.login('37000000-0000-4000-a000-000000000002');
select is(
  (select count(*)::int from public.section_subjects
    where workspace_id = '37000000-0000-4000-b000-000000000001'),
  2, 'a teacher reads the school''s section subjects');
select throws_ok(
  $$select public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', jsonb_build_array(
      jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000032',
                         'teacher_id', '37000000-0000-4000-d000-000000000002')))$$,
  '42501', 'new row violates row-level security policy for table "section_subjects"',
  'escalation: a teacher cannot assign subjects');
delete from public.section_subjects where workspace_id = '37000000-0000-4000-b000-000000000001';
update public.section_subjects set teacher_id = '37000000-0000-4000-d000-000000000002'
 where workspace_id = '37000000-0000-4000-b000-000000000001';
select tests.logout();
select is(
  (select array_agg(subject_id::text || ':' || coalesce(teacher_id::text, '-') order by subject_id)
     from public.section_subjects where section_id = '37000000-0000-4000-c000-000000000021'),
  array['37000000-0000-4000-c000-000000000031:-',
        '37000000-0000-4000-c000-000000000033:37000000-0000-4000-d000-000000000002'],
  'escalation: a teacher''s delete and update touch no rows');

select tests.login('37000000-0000-4000-a000-000000000003');
select is(
  (select count(*)::int from public.section_subjects
    where workspace_id = '37000000-0000-4000-b000-000000000001'),
  0, 'a parent member reads no section subjects (T2)');
select tests.logout();

select ok(not has_table_privilege('anon', 'public.section_subjects', 'select')
          and not has_function_privilege('anon', 'public.set_section_subjects(uuid, uuid, jsonb)', 'execute'),
  'anon has no privilege on section_subjects or set_section_subjects');

-- ---------------------------------------------------------------------
-- D. create_exam defaults the paper's teacher
-- ---------------------------------------------------------------------
select tests.login('37000000-0000-4000-a000-000000000001');
select public.seed_bd_grade_scale('37000000-0000-4000-b000-000000000001');
select set_config('tests.exam', public.create_exam(jsonb_build_object(
  'workspace_id', '37000000-0000-4000-b000-000000000001',
  'academic_year_id', '37000000-0000-4000-c000-000000000001',
  'name', 'Half-Yearly 2026', 'exam_type', 'term_final',
  'starts_on', '2026-06-01', 'ends_on', '2026-06-14',
  'section_ids', jsonb_build_array('37000000-0000-4000-c000-000000000021'),
  'subject_ids', jsonb_build_array('37000000-0000-4000-c000-000000000031',
                                   '37000000-0000-4000-c000-000000000032',
                                   '37000000-0000-4000-c000-000000000033')))::text, true);
select tests.logout();

select is(
  (select teacher_id from public.exam_subjects
    where exam_id = current_setting('tests.exam')::uuid
      and subject_id = '37000000-0000-4000-c000-000000000033'),
  '37000000-0000-4000-d000-000000000002'::uuid,
  'create_exam: Science''s paper gets the section''s Science teacher');
select is(
  (select count(*)::int from public.exam_subjects
    where exam_id = current_setting('tests.exam')::uuid and teacher_id is null),
  2, 'create_exam: a subject with no teacher (Maths) or no row (English) keeps a null teacher');

-- ---------------------------------------------------------------------
-- E. Releasing a teacher, read-only, audit
-- ---------------------------------------------------------------------
update public.workspace_members set status = 'removed' where id = '37000000-0000-4000-d000-000000000002';
select is(
  (select count(*)::int from public.section_subjects
    where section_id = '37000000-0000-4000-c000-000000000021' and teacher_id is not null),
  0, 'a removed member stops teaching their subjects');
select is(
  (select teacher_id from public.exam_subjects
    where exam_id = current_setting('tests.exam')::uuid
      and subject_id = '37000000-0000-4000-c000-000000000033'),
  '37000000-0000-4000-d000-000000000002'::uuid,
  'an existing paper keeps its teacher (history is not rewritten)');

select is(
  (select count(*)::int from public.audit_events
    where workspace_id = '37000000-0000-4000-b000-000000000001'
      and action in ('section_subjects.insert', 'section_subjects.update', 'section_subjects.delete')),
  6, 'every insert, teacher change and removal wrote an audit row (3 + 2 + 1)');

-- An archived subject cannot be (re)assigned.
update public.subjects set archived_at = now() where id = '37000000-0000-4000-c000-000000000032';
select tests.login('37000000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', jsonb_build_array(
      jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000032', 'teacher_id', null)))$$,
  '22023', 'SUBJECT_ARCHIVED', 'an archived subject cannot be newly given to a section');
select tests.logout();
update public.subjects set archived_at = null where id = '37000000-0000-4000-c000-000000000032';
-- Maths was assigned before it was archived: it may stay in the list.
update public.subjects set archived_at = now() where id = '37000000-0000-4000-c000-000000000031';
select tests.login('37000000-0000-4000-a000-000000000001');
select is(
  public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', jsonb_build_array(
    jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000031', 'teacher_id', null),
    jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000033', 'teacher_id', null))),
  2, 'a subject archived after it was assigned may stay in the saved list');
select tests.logout();
update public.subjects set archived_at = null where id = '37000000-0000-4000-c000-000000000031';

-- Teacher A2 becomes class teacher of Class 6 – A and teaches its Maths.
update public.sections set class_teacher_id = '37000000-0000-4000-d000-000000000005'
 where id = '37000000-0000-4000-c000-000000000021';
update public.section_subjects set teacher_id = '37000000-0000-4000-d000-000000000005'
 where section_id = '37000000-0000-4000-c000-000000000021'
   and subject_id = '37000000-0000-4000-c000-000000000031';

update public.workspaces set access_mode = 'read_only' where id = '37000000-0000-4000-b000-000000000001';
select tests.login('37000000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.set_section_subjects('37000000-0000-4000-b000-000000000001', '37000000-0000-4000-c000-000000000021', jsonb_build_array(
      jsonb_build_object('subject_id', '37000000-0000-4000-c000-000000000032',
                         'teacher_id', '37000000-0000-4000-d000-000000000005')))$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot change its section subjects');
select tests.logout();
select is(
  (select count(*)::int from public.section_subjects where section_id = '37000000-0000-4000-c000-000000000021'),
  2, 'the refused save changed nothing');

-- D-300: removing a member always works, even when it releases teaching
-- assignments in a read-only school (review of PR #73).
select tests.login('37000000-0000-4000-a000-000000000001');
select lives_ok(
  $$update public.workspace_members set status = 'removed'
     where id = '37000000-0000-4000-d000-000000000005'$$,
  'a read-only school can still remove a teacher who teaches');
select tests.logout();
select is(
  (select class_teacher_id from public.sections where id = '37000000-0000-4000-c000-000000000021'),
  null, 'read-only removal: they stop being the class teacher');
select is(
  (select count(*)::int from public.section_subjects
    where teacher_id = '37000000-0000-4000-d000-000000000005'),
  0, 'read-only removal: they stop teaching their subjects');

-- The exemption is only for an update that clears the teacher and nothing else.
select tests.login('37000000-0000-4000-a000-000000000001');
select throws_ok(
  $$update public.section_subjects
       set teacher_id = null, subject_id = '37000000-0000-4000-c000-000000000032'
     where section_id = '37000000-0000-4000-c000-000000000021'
       and subject_id = '37000000-0000-4000-c000-000000000031'$$,
  '42501', 'PLAN_READ_ONLY',
  'read-only: clearing a subject''s teacher while changing another column is refused');
select throws_ok(
  $$update public.sections set class_teacher_id = null, room = 'X'
     where id = '37000000-0000-4000-c000-000000000021'$$,
  '42501', 'PLAN_READ_ONLY',
  'read-only: clearing a class teacher while changing another column is refused');
select tests.logout();

select * from finish();
rollback;
