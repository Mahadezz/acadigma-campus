-- =====================================================================
-- pgTAP · F-AC-06 Part 2 (demo cut) — exams and papers (D-303)
--
--   A. public.create_exam: exam + sections + one paper per section x
--      subject, pass marks from the snapshotted pass mark (33 of 100).
--   B. The grading snapshot is taken at creation, cannot be edited, and
--      does not follow a later edit of the scale.
--   C. Status follows §5.12: one step forward; the two reversals need a
--      reason; anything else is INVALID_TRANSITION.
--   D. Guards: NO_GRADE_SCALE, SECTION_WRONG_YEAR, pass > full.
--   E. RLS isolation + escalation; composite FKs block cross-school rows.
--   F. read_only refuses create_exam (PLAN_READ_ONLY).
-- =====================================================================
begin;
select plan(30);

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

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner, teacher, parent; a 2026 year
-- with two Class 6 sections, a 2025 year with one section, two subjects,
-- the BD scale. School B: owner, a year, no grade scale.
-- ---------------------------------------------------------------------
select tests.mkuser('53000000-0000-4000-a000-000000000001', 'ex-owner-a@test.local', 'Owner A');
select tests.mkuser('53000000-0000-4000-a000-000000000002', 'ex-teacher-a@test.local', 'Teacher A');
select tests.mkuser('53000000-0000-4000-a000-000000000003', 'ex-parent-a@test.local', 'Parent A');
select tests.mkuser('53000000-0000-4000-a000-000000000004', 'ex-owner-b@test.local', 'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('53000000-0000-4000-b000-000000000001', 'school', 'Exam School A', 'exam-school-a-53',
   '53000000-0000-4000-a000-000000000001', '53000000-0000-4000-a000-000000000001', 'active'),
  ('53000000-0000-4000-b000-000000000002', 'school', 'Exam School B', 'exam-school-b-53',
   '53000000-0000-4000-a000-000000000004', '53000000-0000-4000-a000-000000000004', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('53000000-0000-4000-b000-000000000001', '53000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('53000000-0000-4000-b000-000000000001', '53000000-0000-4000-a000-000000000003', 'parent',  'active', now());

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on)
values
  ('53000000-0000-4000-c000-000000000001', '53000000-0000-4000-b000-000000000001', '2026', '2026-01-01', '2026-12-31'),
  ('53000000-0000-4000-c000-000000000002', '53000000-0000-4000-b000-000000000001', '2025', '2025-01-01', '2025-12-31'),
  ('53000000-0000-4000-c000-000000000003', '53000000-0000-4000-b000-000000000002', '2026', '2026-01-01', '2026-12-31');

insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values ('53000000-0000-4000-c000-000000000011', '53000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ শ্রেণি', 6);

insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name)
values
  ('53000000-0000-4000-c000-000000000021', '53000000-0000-4000-b000-000000000001',
   '53000000-0000-4000-c000-000000000001', '53000000-0000-4000-c000-000000000011', 'A'),
  ('53000000-0000-4000-c000-000000000022', '53000000-0000-4000-b000-000000000001',
   '53000000-0000-4000-c000-000000000001', '53000000-0000-4000-c000-000000000011', 'B'),
  ('53000000-0000-4000-c000-000000000023', '53000000-0000-4000-b000-000000000001',
   '53000000-0000-4000-c000-000000000002', '53000000-0000-4000-c000-000000000011', 'A');

insert into public.subjects (id, workspace_id, name)
values
  ('53000000-0000-4000-c000-000000000031', '53000000-0000-4000-b000-000000000001', 'Mathematics 53'),
  ('53000000-0000-4000-c000-000000000032', '53000000-0000-4000-b000-000000000001', 'English 53');

select tests.login('53000000-0000-4000-a000-000000000001');
select public.seed_bd_grade_scale('53000000-0000-4000-b000-000000000001');
select tests.logout();

-- ---------------------------------------------------------------------
-- A. create_exam (owner A)
-- ---------------------------------------------------------------------
select tests.login('53000000-0000-4000-a000-000000000001');

select set_config('tests.exam', public.create_exam(jsonb_build_object(
  'workspace_id', '53000000-0000-4000-b000-000000000001',
  'academic_year_id', '53000000-0000-4000-c000-000000000001',
  'name', 'Half-Yearly 2026', 'exam_type', 'term_final',
  'starts_on', '2026-06-01', 'ends_on', '2026-06-14',
  'section_ids', jsonb_build_array('53000000-0000-4000-c000-000000000021',
                                   '53000000-0000-4000-c000-000000000022'),
  'subject_ids', jsonb_build_array('53000000-0000-4000-c000-000000000031',
                                   '53000000-0000-4000-c000-000000000032')))::text, true);

select tests.logout();

select is(
  (select count(*)::int from public.exam_subjects where exam_id = current_setting('tests.exam')::uuid),
  4, 'create_exam: 2 sections x 2 subjects = 4 papers');

select is(
  (select count(*)::int from public.exam_subjects
    where exam_id = current_setting('tests.exam')::uuid and full_marks = 100 and pass_marks = 33),
  4, 'every paper defaults to 100 full marks and 33 pass marks (the snapshotted 33 %)');

select is(
  (select status::text from public.exams where id = current_setting('tests.exam')::uuid),
  'draft', 'a new exam is a draft');

select is(
  (select grading_snapshot ->> 'grade_scale_code' || ' '
          || jsonb_array_length(grading_snapshot -> 'bands')::text || ' '
          || (grading_snapshot ->> 'pass_mark_percent') || ' '
          || (grading_snapshot ->> 'fail_any_subject_zero_gpa')
     from public.exams where id = current_setting('tests.exam')::uuid),
  'BD_GPA5 7 33 true', 'the grading policy is snapshotted at creation');

select is(
  (select created_by from public.exams where id = current_setting('tests.exam')::uuid),
  '53000000-0000-4000-a000-000000000001'::uuid, 'created_by is the caller');

-- ---------------------------------------------------------------------
-- B. Snapshot is immutable and does not follow the scale
-- ---------------------------------------------------------------------
select tests.login('53000000-0000-4000-a000-000000000001');

select throws_ok(
  format($$update public.exams set grading_snapshot = '{}'::jsonb where id = %L$$,
         current_setting('tests.exam')),
  '42501', 'GRADING_SNAPSHOT_IMMUTABLE', 'the owner cannot rewrite the snapshot');

select lives_ok(
  format($$select public.save_grade_scale('53000000-0000-4000-b000-000000000001',
    (select id from public.grade_scales
      where workspace_id = '53000000-0000-4000-b000-000000000001' and code = 'BD_GPA5'),
    'Pass / fail', '[
      {"letter":"P","min_percent":40,"max_percent":100,"grade_point":1,"sort_order":1},
      {"letter":"F","min_percent":0,"max_percent":39.99,"grade_point":0,"is_fail":true,"sort_order":2}]')$$),
  'the school later changes its scale');

select is(
  (select jsonb_array_length(grading_snapshot -> 'bands') from public.exams
    where id = current_setting('tests.exam')::uuid),
  7, '...and the existing exam still holds the 7 BD bands it was created with');

-- ---------------------------------------------------------------------
-- C. Status (§5.12)
-- ---------------------------------------------------------------------
select lives_ok(
  format($$update public.exams set status = 'scheduled' where id = %L$$, current_setting('tests.exam')),
  'draft -> scheduled');

select throws_ok(
  format($$update public.exams set status = 'draft' where id = %L$$, current_setting('tests.exam')),
  '22023', 'INVALID_TRANSITION', 'no going back to draft (no cycling)');

select throws_ok(
  format($$update public.exams set status = 'marks_entry' where id = %L$$, current_setting('tests.exam')),
  '22023', 'INVALID_TRANSITION', 'no skipping steps');

select lives_ok(
  format($$update public.exams set status = 'in_progress' where id = %L$$, current_setting('tests.exam')),
  'scheduled -> in_progress');
select lives_ok(
  format($$update public.exams set status = 'marks_entry' where id = %L$$, current_setting('tests.exam')),
  'in_progress -> marks_entry');
select lives_ok(
  format($$update public.exams set status = 'marks_locked' where id = %L$$, current_setting('tests.exam')),
  'marks_entry -> marks_locked');

select throws_ok(
  format($$update public.exams set status = 'marks_entry' where id = %L$$, current_setting('tests.exam')),
  '22023', 'REASON_REQUIRED', 'unlocking without a reason is refused');

select lives_ok(
  format($$update public.exams set status = 'marks_entry', status_reason = 'Science marks were wrong'
           where id = %L$$, current_setting('tests.exam')),
  'unlocking with a reason is allowed (admin reversal)');

select lives_ok(
  format($$update public.exams set status = 'marks_locked' where id = %L$$, current_setting('tests.exam')),
  're-lock');

select is(
  (select status_reason from public.exams where id = current_setting('tests.exam')::uuid),
  null, 'a forward step clears the reversal reason');

-- ---------------------------------------------------------------------
-- D. Guards
-- ---------------------------------------------------------------------
select throws_ok(
  format($$insert into public.exam_sections (workspace_id, exam_id, section_id)
           values ('53000000-0000-4000-b000-000000000001', %L,
                   '53000000-0000-4000-c000-000000000023')$$, current_setting('tests.exam')),
  '22023', 'SECTION_WRONG_YEAR', 'a 2025 section cannot sit a 2026 exam');

select throws_ok(
  format($$update public.exam_subjects set pass_marks = 150 where exam_id = %L$$,
         current_setting('tests.exam')),
  '23514', null, 'pass marks above full marks are refused');

select tests.logout();
select tests.login('53000000-0000-4000-a000-000000000004');   -- owner B, no grade scale

select throws_ok(
  $$select public.create_exam(jsonb_build_object(
      'workspace_id', '53000000-0000-4000-b000-000000000002',
      'academic_year_id', '53000000-0000-4000-c000-000000000003',
      'name', 'Midterm', 'exam_type', 'midterm',
      'section_ids', '[]'::jsonb, 'subject_ids', '[]'::jsonb))$$,
  '22023', 'NO_GRADE_SCALE', 'a school without a grade scale cannot create an exam');

-- ---------------------------------------------------------------------
-- E. RLS
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.exams where id = current_setting('tests.exam')::uuid),
  0, 'another school sees none of school A''s exams');

with attempted as (
  update public.exam_subjects set full_marks = 50
   where exam_id = current_setting('tests.exam')::uuid returning 1)
select is((select count(*)::int from attempted), 0, 'another school''s paper update affects zero rows');

select throws_ok(
  format($$insert into public.exam_sections (workspace_id, exam_id, section_id)
           values ('53000000-0000-4000-b000-000000000002', %L,
                   '53000000-0000-4000-c000-000000000021')$$, current_setting('tests.exam')),
  '23503', null, 'a row cannot point at another school''s exam (composite FK)');

select tests.logout();
select tests.login('53000000-0000-4000-a000-000000000002');   -- teacher A

select is(
  (select count(*)::int from public.exam_subjects where exam_id = current_setting('tests.exam')::uuid),
  4, 'a teacher reads the papers');

select throws_ok(
  $$insert into public.exams (workspace_id, academic_year_id, name, exam_type, created_by)
    values ('53000000-0000-4000-b000-000000000001', '53000000-0000-4000-c000-000000000001',
            'Teacher exam', 'class_test', '53000000-0000-4000-a000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "exams"',
  'a teacher cannot create an exam');

with attempted as (
  update public.exam_subjects set full_marks = 50
   where exam_id = current_setting('tests.exam')::uuid returning 1)
select is((select count(*)::int from attempted), 0, 'a teacher''s paper update affects zero rows');

select tests.logout();
select tests.login('53000000-0000-4000-a000-000000000003');   -- parent A

select is(
  (select count(*)::int from public.exams where workspace_id = '53000000-0000-4000-b000-000000000001'),
  0, 'a parent reads no exam rows directly (published view is Part 7)');

select tests.logout();

-- ---------------------------------------------------------------------
-- F. read_only
-- ---------------------------------------------------------------------
select app.set_access_mode('53000000-0000-4000-b000-000000000001', 'read_only', 'Trial ended.');
select tests.login('53000000-0000-4000-a000-000000000001');

select throws_ok(
  $$select public.create_exam(jsonb_build_object(
      'workspace_id', '53000000-0000-4000-b000-000000000001',
      'academic_year_id', '53000000-0000-4000-c000-000000000001',
      'name', 'Annual 2026', 'exam_type', 'annual',
      'section_ids', '[]'::jsonb, 'subject_ids', '[]'::jsonb))$$,
  '42501', 'PLAN_READ_ONLY', 'read_only: the owner cannot create an exam');

select tests.logout();

select is(
  (select count(*)::int from public.exams where workspace_id = '53000000-0000-4000-b000-000000000001'),
  1, 'row count as postgres: exactly the one exam exists');

select * from finish();
rollback;
