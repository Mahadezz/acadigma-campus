-- =====================================================================
-- pgTAP · F-AC-06 Part 3 (demo cut) — marks entry, and Part 4's publish
-- gate (20260925300312_marks.sql, D-304)
--
--   A. save_marks: entry opens only in marks_entry; per-row rejection
--      (MARK_OUT_OF_RANGE) while valid rows save; the paper moves to
--      entering; idempotent replay; a reused key with another payload; one
--      paper-level marks.entered audit event per save.
--   B. Version check per row: a stale row is CONFLICT, a fresh one saves;
--      the overwritten value is kept in the audit trail.
--   C. Who: the paper's teacher, the class teacher, owner/admin enter;
--      another subject's teacher neither enters nor reads (AC14); staff
--      read; parents and another school read nothing; no direct writes.
--   D. Guards: STUDENT_NOT_ENROLLED, VALIDATION, SUBJECT_LOCKED, composite
--      FKs, read_only (PLAN_READ_ONLY).
--   E. Publish is refused until every enrolled student in every paper has
--      a mark or is absent/exempt (MARKS_INCOMPLETE).
-- =====================================================================
begin;
select plan(40);

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

create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

create or replace function tests.id(p_label text) returns uuid language sql as $fn$
  select id from ids where label = p_label
$fn$;

-- A save of paper p_paper in school A. p_entries is a jsonb array.
create or replace function tests.save(p_key uuid, p_paper uuid, p_entries jsonb)
returns jsonb language sql as $fn$
  select public.save_marks('54000000-0000-4000-b000-000000000001', jsonb_build_object(
    'idempotency_key', p_key, 'exam_subject_id', p_paper, 'entries', p_entries))
$fn$;

create or replace function tests.entry(p_student text, p_status text, p_obtained numeric default null,
                                       p_version timestamptz default null)
returns jsonb language sql as $fn$
  select jsonb_build_object('student_id', tests.id(p_student), 'status', p_status,
                            'obtained', p_obtained, 'expected_updated_at', p_version)
$fn$;

create or replace function tests.version(p_paper text, p_student text)
returns timestamptz language sql as $fn$
  select updated_at from public.marks
   where exam_subject_id = tests.id(p_paper) and student_id = tests.id(p_student)
$fn$;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner, the Maths teacher, the class
-- teacher, the Science teacher, staff, a parent; Class 6 A with three
-- students, one more student in no section; an exam with a Maths and a
-- Science paper out of 50. School B: an owner.
-- ---------------------------------------------------------------------
select tests.mkuser('54000000-0000-4000-a000-000000000001', 'mk-owner-a@test.local', 'Owner A');
select tests.mkuser('54000000-0000-4000-a000-000000000002', 'mk-maths@test.local', 'Maths Teacher');
select tests.mkuser('54000000-0000-4000-a000-000000000003', 'mk-classt@test.local', 'Class Teacher');
select tests.mkuser('54000000-0000-4000-a000-000000000004', 'mk-science@test.local', 'Science Teacher');
select tests.mkuser('54000000-0000-4000-a000-000000000005', 'mk-staff@test.local', 'Staff A');
select tests.mkuser('54000000-0000-4000-a000-000000000006', 'mk-parent@test.local', 'Parent A');
select tests.mkuser('54000000-0000-4000-a000-000000000007', 'mk-owner-b@test.local', 'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('54000000-0000-4000-b000-000000000001', 'school', 'Marks School A', 'marks-school-a-54',
   '54000000-0000-4000-a000-000000000001', '54000000-0000-4000-a000-000000000001', 'active'),
  ('54000000-0000-4000-b000-000000000002', 'school', 'Marks School B', 'marks-school-b-54',
   '54000000-0000-4000-a000-000000000007', '54000000-0000-4000-a000-000000000007', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('54000000-0000-4000-b000-000000000001', '54000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('54000000-0000-4000-b000-000000000001', '54000000-0000-4000-a000-000000000003', 'teacher', 'active', now()),
  ('54000000-0000-4000-b000-000000000001', '54000000-0000-4000-a000-000000000004', 'teacher', 'active', now()),
  ('54000000-0000-4000-b000-000000000001', '54000000-0000-4000-a000-000000000005', 'staff',   'active', now()),
  ('54000000-0000-4000-b000-000000000001', '54000000-0000-4000-a000-000000000006', 'parent',  'active', now());

insert into ids
select case m.user_id
         when '54000000-0000-4000-a000-000000000002' then 'maths_m'
         when '54000000-0000-4000-a000-000000000003' then 'classt_m'
         when '54000000-0000-4000-a000-000000000004' then 'science_m'
         else 'owner_b_m' end, m.id
  from public.workspace_members m
 where (m.workspace_id = '54000000-0000-4000-b000-000000000001'
        and m.user_id in ('54000000-0000-4000-a000-000000000002', '54000000-0000-4000-a000-000000000003',
                          '54000000-0000-4000-a000-000000000004'))
    or (m.workspace_id = '54000000-0000-4000-b000-000000000002'
        and m.user_id = '54000000-0000-4000-a000-000000000007');

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on)
values ('54000000-0000-4000-c000-000000000001', '54000000-0000-4000-b000-000000000001', '2026', '2026-01-01', '2026-12-31');
insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values ('54000000-0000-4000-c000-000000000011', '54000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ শ্রেণি', 6);
insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name, class_teacher_id)
values ('54000000-0000-4000-c000-000000000021', '54000000-0000-4000-b000-000000000001',
        '54000000-0000-4000-c000-000000000001', '54000000-0000-4000-c000-000000000011', 'A', tests.id('classt_m'));
insert into public.subjects (id, workspace_id, name)
values
  ('54000000-0000-4000-c000-000000000031', '54000000-0000-4000-b000-000000000001', 'Mathematics 54'),
  ('54000000-0000-4000-c000-000000000032', '54000000-0000-4000-b000-000000000001', 'Science 54');

insert into public.students (id, workspace_id, student_code, first_name, last_name, gender)
select ('54000000-0000-4000-d000-00000000000' || i)::uuid, '54000000-0000-4000-b000-000000000001',
       'MK-54-' || i, 'Student', 'No' || i, 'male'
  from generate_series(1, 4) as i;
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number)
select '54000000-0000-4000-b000-000000000001', ('54000000-0000-4000-d000-00000000000' || i)::uuid,
       '54000000-0000-4000-c000-000000000001', '54000000-0000-4000-c000-000000000021', i
  from generate_series(1, 3) as i;
insert into ids
select 's' || i, ('54000000-0000-4000-d000-00000000000' || i)::uuid from generate_series(1, 4) as i;

select tests.login('54000000-0000-4000-a000-000000000001');
select public.seed_bd_grade_scale('54000000-0000-4000-b000-000000000001');
insert into ids select 'exam', public.create_exam(jsonb_build_object(
  'workspace_id', '54000000-0000-4000-b000-000000000001',
  'academic_year_id', '54000000-0000-4000-c000-000000000001',
  'name', 'Half-Yearly 2026', 'exam_type', 'term_final', 'full_marks', 50,
  'section_ids', jsonb_build_array('54000000-0000-4000-c000-000000000021'),
  'subject_ids', jsonb_build_array('54000000-0000-4000-c000-000000000031',
                                   '54000000-0000-4000-c000-000000000032')));
select tests.logout();

insert into ids
select 'maths', id from public.exam_subjects where subject_id = '54000000-0000-4000-c000-000000000031'
union all select 'science', id from public.exam_subjects where subject_id = '54000000-0000-4000-c000-000000000032';

-- =====================================================================
-- A. Entry opens with marks_entry; per-row rejection; idempotency
-- =====================================================================
select tests.login('54000000-0000-4000-a000-000000000001');

select lives_ok(
  format($$update public.exam_subjects set teacher_id = %L where id = %L$$, tests.id('maths_m'), tests.id('maths')),
  'the owner names the Maths paper''s teacher');
select lives_ok(
  format($$update public.exam_subjects set teacher_id = %L where id = %L$$, tests.id('science_m'), tests.id('science')),
  'and the Science paper''s teacher');
select throws_ok(
  format($$update public.exam_subjects set teacher_id = %L where id = %L$$, tests.id('owner_b_m'), tests.id('maths')),
  '23503', null, 'a paper''s teacher cannot be another school''s member (composite FK)');

select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000001', %L, jsonb_build_array(tests.entry('s1', 'entered', 40)))$$,
         tests.id('maths')),
  '22023', 'ENTRY_CLOSED', 'marks cannot be entered before the exam reaches marks_entry');

update public.exams set status = 'scheduled' where id = tests.id('exam');
update public.exams set status = 'in_progress' where id = tests.id('exam');
update public.exams set status = 'marks_entry' where id = tests.id('exam');
select tests.logout();

select tests.login('54000000-0000-4000-a000-000000000002');   -- the Maths teacher
select is(
  (select tests.save('54000000-0000-4000-e000-000000000002', tests.id('maths'), jsonb_build_array(
     tests.entry('s1', 'entered', 40), tests.entry('s2', 'absent'), tests.entry('s3', 'entered', 60)))
     - 'marks'),
  jsonb_build_object('saved', 2, 'entered', 2, 'enrolled', 3, 'replayed', false,
    'rejected', jsonb_build_array(jsonb_build_object('student_id', tests.id('s3'), 'issue', 'MARK_OUT_OF_RANGE'))),
  'the paper''s teacher saves: 60 of 50 is rejected for that row, the other two save');
select is(
  (select tests.save('54000000-0000-4000-e000-000000000002', tests.id('maths'), jsonb_build_array(
     tests.entry('s1', 'entered', 40), tests.entry('s2', 'absent'), tests.entry('s3', 'entered', 60)))
     ->> 'replayed'),
  'true', 'a replay with the same key returns the stored answer');
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000002', %L, jsonb_build_array(tests.entry('s1', 'entered', 41)))$$,
         tests.id('maths')),
  '22023', 'IDEMPOTENCY_KEY_REUSED', 'the same key with another payload is refused');
select tests.logout();

select is(
  (select string_agg(st.student_code || ':' || m.status || ':' || coalesce(m.obtained::text, '-'), ' ' order by st.student_code)
     from public.marks m join public.students st on st.id = m.student_id
    where m.exam_subject_id = tests.id('maths')),
  'MK-54-1:entered:40.00 MK-54-2:absent:-', 'exactly the two valid rows are stored, once');
select is((select status::text from public.exam_subjects where id = tests.id('maths')), 'entering',
  'the first save moves the paper from pending to entering');
select is((select entered_by from public.marks where exam_subject_id = tests.id('maths') and student_id = tests.id('s1')),
  '54000000-0000-4000-a000-000000000002'::uuid, 'entered_by is the caller');
select is((select count(*)::int from public.audit_events where action = 'marks.insert'), 0,
  'a first entry does not write one audit row per student');
select is(
  (select string_agg((after ->> 'written') || '@' || (row_id = tests.id('maths'))::text, ',')
     from public.audit_events where action = 'marks.entered'),
  '2@true', 'the save (not its replay) logs one paper-level marks.entered event with the count');

-- =====================================================================
-- B. Version check per row; the overwritten value stays in the audit
-- =====================================================================
select tests.login('54000000-0000-4000-a000-000000000003');   -- the class teacher
select is(
  (select tests.save('54000000-0000-4000-e000-000000000003', tests.id('maths'), jsonb_build_array(
     tests.entry('s1', 'entered', 45), tests.entry('s3', 'entered', 30))) -> 'rejected'),
  jsonb_build_array(jsonb_build_object('student_id', tests.id('s1'), 'issue', 'CONFLICT')),
  'a row saved by someone else since it was loaded is CONFLICT; the new row still saves');
select is(
  (select tests.save('54000000-0000-4000-e000-000000000004', tests.id('maths'), jsonb_build_array(
     tests.entry('s1', 'entered', 45, tests.version('maths', 's1')))) ->> 'saved'),
  '1', 'naming the version it loaded, the class teacher corrects the mark');
select tests.logout();

select is((select obtained from public.marks where exam_subject_id = tests.id('maths') and student_id = tests.id('s1')),
  45.00::numeric, 'the corrected mark is stored');
select is(
  (select (before ->> 'obtained') || ' -> ' || (after ->> 'obtained') from public.audit_events
    where action = 'marks.update' and row_id = (select id from public.marks
      where exam_subject_id = tests.id('maths') and student_id = tests.id('s1'))),
  '40.00 -> 45.00', 'the overwritten value is kept in the audit trail');

-- =====================================================================
-- C. Who may enter and read
-- =====================================================================
select tests.login('54000000-0000-4000-a000-000000000004');   -- the Science teacher
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000005', %L, jsonb_build_array(tests.entry('s1', 'entered', 1)))$$,
         tests.id('maths')),
  '42501', 'NOT_ASSIGNED', 'another subject''s teacher cannot enter Maths marks');
select is((select count(*)::int from public.marks where exam_subject_id = tests.id('maths')), 0,
  'and cannot read them (AC14)');
select tests.logout();

select tests.login('54000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.marks where exam_subject_id = tests.id('maths')), 3,
  'the paper''s teacher reads the paper''s marks');
select is((select count(*)::int from public.marks where exam_subject_id = tests.id('science')), 0,
  'but not another paper''s');
select tests.logout();

select tests.login('54000000-0000-4000-a000-000000000005');
select is((select count(*)::int from public.marks), 3, 'staff read marks');
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000006', %L, jsonb_build_array(tests.entry('s1', 'entered', 1)))$$,
         tests.id('maths')),
  '42501', 'FORBIDDEN', 'staff cannot enter marks');
select tests.logout();

select tests.login('54000000-0000-4000-a000-000000000006');
select is((select count(*)::int from public.marks), 0, 'a parent reads no marks');
select tests.logout();

select tests.login('54000000-0000-4000-a000-000000000007');
select is((select count(*)::int from public.marks), 0, 'another school''s owner reads no marks (isolation)');
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000007', %L, jsonb_build_array(tests.entry('s1', 'entered', 1)))$$,
         tests.id('maths')),
  '42501', 'FORBIDDEN', 'another school''s owner cannot save into school A');
select throws_ok(
  format($$select public.save_marks('54000000-0000-4000-b000-000000000002', jsonb_build_object(
      'idempotency_key', '54000000-0000-4000-e000-000000000008', 'exam_subject_id', %L,
      'entries', jsonb_build_array(tests.entry('s1', 'entered', 1))))$$, tests.id('maths')),
  '22023', 'PAPER_NOT_FOUND', 'nor reach school A''s paper through their own school');
select tests.logout();

select tests.login('54000000-0000-4000-a000-000000000001');
select throws_ok(
  format($$insert into public.marks (workspace_id, exam_subject_id, student_id, enrollment_id, status, obtained)
           select workspace_id, exam_subject_id, %L, enrollment_id, 'entered', 50 from public.marks limit 1$$, tests.id('s3')),
  '42501', null, 'even the owner cannot insert marks directly');
select throws_ok(
  $$update public.marks set obtained = 50 where status = 'entered'$$,
  '42501', null, 'or update them directly');

-- =====================================================================
-- D. Guards
-- =====================================================================
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000009', %L, jsonb_build_array(tests.entry('s4', 'entered', 10)))$$,
         tests.id('maths')),
  '22023', 'STUDENT_NOT_ENROLLED', 'a student outside the paper''s section is refused');
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000010', %L, jsonb_build_array(tests.entry('s3', 'entered')))$$,
         tests.id('maths')),
  '22023', 'VALIDATION', 'entered without a number is refused');
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000011', %L, jsonb_build_array(tests.entry('s3', 'absent', 10)))$$,
         tests.id('maths')),
  '22023', 'VALIDATION', 'absent with a number is refused');
select tests.logout();

-- A locked paper takes no marks.
update public.exam_subjects set status = 'locked' where id = tests.id('science');
select tests.login('54000000-0000-4000-a000-000000000004');
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000012', %L, jsonb_build_array(tests.entry('s1', 'entered', 1)))$$,
         tests.id('science')),
  '42501', 'SUBJECT_LOCKED', 'a locked paper refuses marks');
select tests.logout();
update public.exam_subjects set status = 'pending' where id = tests.id('science');

select throws_ok(
  format($$insert into public.marks (workspace_id, exam_subject_id, student_id, enrollment_id, status)
           select '54000000-0000-4000-b000-000000000002', exam_subject_id, %L, enrollment_id, 'absent'
             from public.marks where exam_subject_id = %L limit 1$$, tests.id('s4'), tests.id('maths')),
  '23503', null, 'a mark cannot pair another school with school A''s paper (composite FK)');

select app.set_access_mode('54000000-0000-4000-b000-000000000001', 'read_only', 'Trial ended.');
select tests.login('54000000-0000-4000-a000-000000000004');
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000013', %L, jsonb_build_array(tests.entry('s1', 'entered', 1)))$$,
         tests.id('science')),
  '42501', 'PLAN_READ_ONLY', 'read_only: marks cannot be entered');
select tests.logout();
select app.set_access_mode('54000000-0000-4000-b000-000000000001', 'normal', 'Upgraded.');

-- =====================================================================
-- E. Publish waits for every enrolled student in every paper
-- =====================================================================
select tests.login('54000000-0000-4000-a000-000000000001');
update public.exams set status = 'marks_locked' where id = tests.id('exam');
select throws_ok(
  format($$select tests.save('54000000-0000-4000-e000-000000000014', %L, jsonb_build_array(tests.entry('s1', 'entered', 1)))$$,
         tests.id('science')),
  '22023', 'ENTRY_CLOSED', 'once marks are locked, entry is closed');
select throws_ok(
  format($$update public.exams set status = 'published' where id = %L$$, tests.id('exam')),
  '22023', 'MARKS_INCOMPLETE', 'publish is refused while Science has no marks');
update public.exams set status = 'marks_entry', status_reason = 'Science marks missing' where id = tests.id('exam');
select tests.logout();

select tests.login('54000000-0000-4000-a000-000000000004');
select is(
  (select tests.save('54000000-0000-4000-e000-000000000015', tests.id('science'), jsonb_build_array(
     tests.entry('s1', 'entered', 33.5), tests.entry('s2', 'exempt'), tests.entry('s3', 'absent'))) ->> 'entered'),
  '3', 'the Science teacher completes the paper with a mark, exempt and absent');
select tests.logout();

select tests.login('54000000-0000-4000-a000-000000000001');
update public.exams set status = 'marks_locked' where id = tests.id('exam');
-- Publishing also needs computed results (D-306, 56_publish_results.sql).
select public.compute_results('54000000-0000-4000-b000-000000000001', tests.id('exam'));
select lives_ok(
  format($$update public.exams set status = 'published' where id = %L$$, tests.id('exam')),
  'with every student marked, absent or exempt, the exam publishes');
select tests.logout();

select is((select status::text from public.exams where id = tests.id('exam')), 'published', 'the exam is published');

select tests.login('54000000-0000-4000-a000-000000000001');
select is(
  public.exam_marks_progress('54000000-0000-4000-b000-000000000001', tests.id('exam')) -> tests.id('maths')::text,
  '{"enrolled": 3, "marked": 3}'::jsonb,
  'exam_marks_progress counts the enrolled students and their marks per paper');
select tests.logout();

select * from finish();
rollback;
