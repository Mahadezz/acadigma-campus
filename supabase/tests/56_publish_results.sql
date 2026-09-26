-- =====================================================================
-- pgTAP · F-AC-06 Part 7 (demo cut) — publishing results, the freeze and
-- the parent read (20260925300321_publish_results.sql, D-306)
--
--   A. Guards: FORBIDDEN (teacher, staff, parent, another school),
--      MARKS_NOT_LOCKED, MARKS_INCOMPLETE, NOT_COMPUTED, INCOMPLETE_PRESENT,
--      VALIDATION, PLAN_READ_ONLY. Before publishing a parent reads nothing.
--   B. Publish with one student withheld: every result stamped and frozen,
--      the withheld one frozen as `withheld`, one audit event.
--   C. The freeze: renaming the subject and the section after publishing
--      does not change the frozen card; results cannot be recomputed.
--   D. Parent RLS: a parent reads only their own linked child's published,
--      non-withheld result — not another family's child in the same
--      section, not a withheld one, not through a revoked link or a removed
--      membership, not another school's. guardian_users isolation.
--   E. Unpublish (with a reason, audited) hides it again and keeps the
--      frozen payload; republishing shows it again.
-- =====================================================================
begin;
select plan(43);

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

create or replace function tests.publish(p_withhold jsonb default '[]') returns jsonb language sql as $fn$
  select public.publish_results('56000000-0000-4000-b000-000000000001', tests.id('exam'), p_withhold)
$fn$;

create or replace function tests.card(p_code text) returns jsonb language sql as $fn$
  select r.frozen_payload from public.results r
    join public.students st on st.id = r.student_id
   where st.student_code = p_code
$fn$;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner, class teacher, staff, parents
-- P1 (of S1), P2 (of S2), P3 (of S3, link revoked). School B: an owner and
-- parent PB of their own child.
-- ---------------------------------------------------------------------
select tests.mkuser('56000000-0000-4000-a000-000000000001', 'pr-owner-a@test.local', 'Owner A');
select tests.mkuser('56000000-0000-4000-a000-000000000002', 'pr-teacher-a@test.local', 'Teacher A');
select tests.mkuser('56000000-0000-4000-a000-000000000003', 'pr-staff-a@test.local', 'Staff A');
select tests.mkuser('56000000-0000-4000-a000-000000000004', 'pr-parent-1@test.local', 'Parent One');
select tests.mkuser('56000000-0000-4000-a000-000000000005', 'pr-parent-2@test.local', 'Parent Two');
select tests.mkuser('56000000-0000-4000-a000-000000000006', 'pr-parent-3@test.local', 'Parent Three');
select tests.mkuser('56000000-0000-4000-a000-000000000007', 'pr-owner-b@test.local', 'Owner B');
select tests.mkuser('56000000-0000-4000-a000-000000000008', 'pr-parent-b@test.local', 'Parent B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('56000000-0000-4000-b000-000000000001', 'school', 'Publish School A', 'publish-school-a-56',
   '56000000-0000-4000-a000-000000000001', '56000000-0000-4000-a000-000000000001', 'active'),
  ('56000000-0000-4000-b000-000000000002', 'school', 'Publish School B', 'publish-school-b-56',
   '56000000-0000-4000-a000-000000000007', '56000000-0000-4000-a000-000000000007', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('56000000-0000-4000-b000-000000000001', '56000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('56000000-0000-4000-b000-000000000001', '56000000-0000-4000-a000-000000000003', 'staff',   'active', now()),
  ('56000000-0000-4000-b000-000000000001', '56000000-0000-4000-a000-000000000004', 'parent',  'active', now()),
  ('56000000-0000-4000-b000-000000000001', '56000000-0000-4000-a000-000000000005', 'parent',  'active', now()),
  ('56000000-0000-4000-b000-000000000001', '56000000-0000-4000-a000-000000000006', 'parent',  'active', now()),
  ('56000000-0000-4000-b000-000000000002', '56000000-0000-4000-a000-000000000008', 'parent',  'active', now());

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on)
values
  ('56000000-0000-4000-c000-000000000001', '56000000-0000-4000-b000-000000000001', '2026', '2026-01-01', '2026-12-31'),
  ('56000000-0000-4000-c000-000000000002', '56000000-0000-4000-b000-000000000002', '2026', '2026-01-01', '2026-12-31');
insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values
  ('56000000-0000-4000-c000-000000000011', '56000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ শ্রেণি', 6),
  ('56000000-0000-4000-c000-000000000012', '56000000-0000-4000-b000-000000000002', 'Class 6', 'ষষ্ঠ শ্রেণি', 6);
insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name, class_teacher_id)
values
  ('56000000-0000-4000-c000-000000000021', '56000000-0000-4000-b000-000000000001',
   '56000000-0000-4000-c000-000000000001', '56000000-0000-4000-c000-000000000011', 'A',
   (select m.id from public.workspace_members m where m.user_id = '56000000-0000-4000-a000-000000000002')),
  ('56000000-0000-4000-c000-000000000022', '56000000-0000-4000-b000-000000000002',
   '56000000-0000-4000-c000-000000000002', '56000000-0000-4000-c000-000000000012', 'A', null);
insert into public.subjects (id, workspace_id, name)
values
  ('56000000-0000-4000-c000-000000000031', '56000000-0000-4000-b000-000000000001', 'Science 56'),
  ('56000000-0000-4000-c000-000000000032', '56000000-0000-4000-b000-000000000001', 'Maths 56');

insert into public.students (workspace_id, student_code, first_name, last_name, gender)
values
  ('56000000-0000-4000-b000-000000000001', 'S1', 'Student', 'One', 'female'),
  ('56000000-0000-4000-b000-000000000001', 'S2', 'Student', 'Two', 'male'),
  ('56000000-0000-4000-b000-000000000001', 'S3', 'Student', 'Three', 'male'),
  ('56000000-0000-4000-b000-000000000002', 'SB', 'Student', 'Bee', 'female');
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number)
select st.workspace_id, st.id,
       case when st.student_code = 'SB' then '56000000-0000-4000-c000-000000000002'
            else '56000000-0000-4000-c000-000000000001' end::uuid,
       case when st.student_code = 'SB' then '56000000-0000-4000-c000-000000000022'
            else '56000000-0000-4000-c000-000000000021' end::uuid,
       right(st.student_code, 1)::int
  from public.students st
 where st.workspace_id in ('56000000-0000-4000-b000-000000000001', '56000000-0000-4000-b000-000000000002')
   and st.student_code <> 'SB';
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number)
select st.workspace_id, st.id, '56000000-0000-4000-c000-000000000002', '56000000-0000-4000-c000-000000000022', 1
  from public.students st where st.student_code = 'SB';

insert into public.guardians (workspace_id, student_id, relation, full_name, phone, is_primary)
select st.workspace_id, st.id, 'father', 'Guardian ' || st.student_code,
       '+88010000056' || lpad(row_number() over (order by st.student_code)::text, 2, '0'), true
  from public.students st where st.student_code in ('S1', 'S2', 'S3', 'SB')
   and st.workspace_id in ('56000000-0000-4000-b000-000000000001', '56000000-0000-4000-b000-000000000002');

insert into public.guardian_users (workspace_id, guardian_id, student_id, user_id, status, accepted_at, revoked_at)
select g.workspace_id, g.id, g.student_id, x.user_id, x.status::public.guardian_link_status,
       now(), case when x.status = 'revoked' then now() end
  from (values ('S1', '56000000-0000-4000-a000-000000000004'::uuid, 'active'),
               ('S2', '56000000-0000-4000-a000-000000000005'::uuid, 'active'),
               ('S3', '56000000-0000-4000-a000-000000000006'::uuid, 'revoked'),
               ('SB', '56000000-0000-4000-a000-000000000008'::uuid, 'active')) as x(code, user_id, status)
  join public.students st on st.student_code = x.code
   and st.workspace_id in ('56000000-0000-4000-b000-000000000001', '56000000-0000-4000-b000-000000000002')
  join public.guardians g on g.student_id = st.id;

select tests.login('56000000-0000-4000-a000-000000000001');
select public.seed_bd_grade_scale('56000000-0000-4000-b000-000000000001');
insert into ids select 'exam', public.create_exam(jsonb_build_object(
  'workspace_id', '56000000-0000-4000-b000-000000000001',
  'academic_year_id', '56000000-0000-4000-c000-000000000001',
  'name', 'Half-Yearly 2026', 'exam_type', 'term_final', 'full_marks', 100,
  'section_ids', jsonb_build_array('56000000-0000-4000-c000-000000000021'),
  'subject_ids', jsonb_build_array('56000000-0000-4000-c000-000000000031', '56000000-0000-4000-c000-000000000032')));
update public.exams set status = 'scheduled' where id = tests.id('exam');
update public.exams set status = 'in_progress' where id = tests.id('exam');
update public.exams set status = 'marks_entry' where id = tests.id('exam');
select tests.logout();

-- Marks as postgres. S1 80/90 (GPA 5.00), S2 70/60 (3.75), S3 50/— (Maths
-- missing at first; later 40, GPA 2.50).
create or replace function tests.mark(p_code text, p_subject uuid, p_obtained numeric) returns void
language sql as $fn$
  insert into public.marks (workspace_id, exam_subject_id, student_id, enrollment_id, status, obtained)
  select e.workspace_id, es.id, e.student_id, e.id, 'entered', p_obtained
    from public.students st
    join public.enrollments e on e.student_id = st.id
    join public.exam_subjects es on es.section_id = e.section_id and es.exam_id = tests.id('exam')
   where st.student_code = p_code and st.workspace_id = '56000000-0000-4000-b000-000000000001'
     and es.subject_id = p_subject
$fn$;
select tests.mark('S1', '56000000-0000-4000-c000-000000000031', 80);
select tests.mark('S1', '56000000-0000-4000-c000-000000000032', 90);
select tests.mark('S2', '56000000-0000-4000-c000-000000000031', 70);
select tests.mark('S2', '56000000-0000-4000-c000-000000000032', 60);
select tests.mark('S3', '56000000-0000-4000-c000-000000000031', 50);

-- =====================================================================
-- A. Guards
-- =====================================================================
select tests.login('56000000-0000-4000-a000-000000000002');
select throws_ok('select tests.publish()', '42501', 'FORBIDDEN', 'the class teacher cannot publish');
select tests.logout();
select tests.login('56000000-0000-4000-a000-000000000003');
select throws_ok('select tests.publish()', '42501', 'FORBIDDEN', 'nor can staff');
select tests.logout();
select tests.login('56000000-0000-4000-a000-000000000004');
select throws_ok('select tests.publish()', '42501', 'FORBIDDEN', 'nor a parent');
select tests.logout();
select tests.login('56000000-0000-4000-a000-000000000007');
select throws_ok('select tests.publish()', '42501', 'FORBIDDEN', 'nor another school''s owner');
select tests.logout();

select tests.login('56000000-0000-4000-a000-000000000001');
select throws_ok('select tests.publish()', '22023', 'MARKS_NOT_LOCKED', 'nothing is published while marks entry is open');
update public.exams set status = 'marks_locked' where id = tests.id('exam');
select throws_ok('select tests.publish()', '22023', 'MARKS_INCOMPLETE', 'nor while a mark is missing (D-304 gate)');
select tests.logout();

select tests.mark('S3', '56000000-0000-4000-c000-000000000032', 40);
select tests.login('56000000-0000-4000-a000-000000000001');
select throws_ok('select tests.publish()', '22023', 'NOT_COMPUTED', 'nor before results are computed');
select tests.logout();

-- Results computed while S3's mark was missing are stale: S3 is incomplete.
delete from public.marks where student_id = (select id from public.students where student_code = 'S3'
  and workspace_id = '56000000-0000-4000-b000-000000000001')
  and exam_subject_id in (select id from public.exam_subjects where subject_id = '56000000-0000-4000-c000-000000000032');
select tests.login('56000000-0000-4000-a000-000000000001');
select public.compute_results('56000000-0000-4000-b000-000000000001', tests.id('exam'));
select tests.logout();
select tests.mark('S3', '56000000-0000-4000-c000-000000000032', 40);
select tests.login('56000000-0000-4000-a000-000000000001');
select throws_ok('select tests.publish()', '22023', 'INCOMPLETE_PRESENT', 'nor while any result is incomplete');
select public.compute_results('56000000-0000-4000-b000-000000000001', tests.id('exam'));
select throws_ok($$select tests.publish('[{"student_id": "56000000-0000-4000-a000-000000000001", "reason": "Fees"}]')$$,
  '22023', 'VALIDATION', 'a withheld student must have a result in the exam');
select throws_ok(format($$select tests.publish('[{"student_id": "%s", "reason": " "}]')$$,
    (select id from public.students where student_code = 'S2' and workspace_id = '56000000-0000-4000-b000-000000000001')),
  '22023', 'VALIDATION', 'and a reason');
select tests.logout();

select app.set_access_mode('56000000-0000-4000-b000-000000000001', 'read_only', 'Trial ended.');
select tests.login('56000000-0000-4000-a000-000000000001');
select throws_ok('select tests.publish()', '42501', 'PLAN_READ_ONLY', 'read_only: results cannot be published');
select tests.logout();
select app.set_access_mode('56000000-0000-4000-b000-000000000001', 'normal', 'Upgraded.');

select tests.login('56000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.results), 0, 'before publishing, a linked parent reads nothing');
select tests.logout();

-- =====================================================================
-- B. Publish, withholding S2
-- =====================================================================
insert into ids select 'S2', id from public.students
 where student_code = 'S2' and workspace_id = '56000000-0000-4000-b000-000000000001';
select tests.login('56000000-0000-4000-a000-000000000001');
select is(tests.publish(format('[{"student_id": "%s", "reason": "Fees due"}]', tests.id('S2'))::jsonb),
  '{"published": 2, "withheld": 1}'::jsonb, 'publishing returns the published and withheld counts');
select tests.logout();

select is((select status::text from public.exams where id = tests.id('exam')), 'published', 'the exam is published');
select is((select count(*)::int from public.results where published and published_at is not null
            and published_by = '56000000-0000-4000-a000-000000000001' and frozen_payload is not null),
  3, 'every result is stamped published, by whom, with a frozen payload');
select is((select withheld_reason from public.results where student_id = tests.id('S2')), 'Fees due',
  'the withheld student keeps the reason');
select is(tests.card('S2') ->> 'result', 'withheld', 'and is frozen as withheld');
select ok(tests.card('S2') -> 'gpa' = 'null'::jsonb and tests.card('S2') -> 'rank' = 'null'::jsonb
          and tests.card('S2') -> 'overallLetter' = 'null'::jsonb,
  'with no GPA, grade or rank on the card');
select is(
  jsonb_build_object('name', tests.card('S1') ->> 'studentNameEn', 'result', tests.card('S1') ->> 'result',
    'gpa', (tests.card('S1') ->> 'gpa')::numeric, 'letter', tests.card('S1') ->> 'overallLetter',
    'rank', tests.card('S1') -> 'rank', 'tied', tests.card('S1') -> 'rankTied', 'of', tests.card('S1') -> 'rankOf',
    'section', tests.card('S1') ->> 'sectionName', 'class', tests.card('S1') ->> 'className'),
  '{"name": "Student One", "result": "pass", "gpa": 5.00, "letter": "A+", "rank": 1, "tied": false, "of": 3,
    "section": "A", "class": "Class 6"}'::jsonb,
  'S1''s card is frozen with the computed GPA, grade and rank');
select is(tests.card('S1') -> 'subjects',
  '[{"subjectNameEn": "Maths 56", "subjectNameBn": "Maths 56", "subjectKind": "compulsory", "status": "entered",
     "marksObtained": 90.00, "fullMarks": 100.00, "letter": "A+", "gradePoint": 5.00},
    {"subjectNameEn": "Science 56", "subjectNameBn": "Science 56", "subjectKind": "compulsory", "status": "entered",
     "marksObtained": 80.00, "fullMarks": 100.00, "letter": "A+", "gradePoint": 5.00}]'::jsonb,
  'with one line per paper');
select is(tests.card('S1') -> 'attendance',
  '{"presentDays": 0, "totalDays": 0, "percent": null, "belowMinimum": false}'::jsonb,
  'and attendance as of publishing (none taken: no percentage, no warning)');
select is(
  (select after from public.audit_events where action = 'results.published' and row_id = tests.id('exam')),
  jsonb_build_object('published', 2, 'withheld', 1, 'withheld_student_ids', jsonb_build_array(tests.id('S2'))),
  'publishing is audited once, with the withheld list');

-- =====================================================================
-- C. The freeze
-- =====================================================================
update public.subjects set name = 'General Science 56' where id = '56000000-0000-4000-c000-000000000031';
update public.sections set name = 'Alpha' where id = '56000000-0000-4000-c000-000000000021';
select is(tests.card('S1') -> 'subjects' -> 1 ->> 'subjectNameEn', 'Science 56',
  'renaming the subject after publishing does not change the issued card');
select is(tests.card('S1') ->> 'sectionName', 'A', 'nor does renaming the section');
select tests.login('56000000-0000-4000-a000-000000000001');
select throws_ok($$select public.compute_results('56000000-0000-4000-b000-000000000001', tests.id('exam'))$$,
  '22023', 'MARKS_NOT_LOCKED', 'a published result cannot be recomputed');
select tests.logout();

-- =====================================================================
-- D. Parent RLS
-- =====================================================================
select tests.login('56000000-0000-4000-a000-000000000004');
select is((select string_agg(st.student_code, ',') from public.results r
             join public.students st on st.id = r.student_id),
  null, 'a parent cannot read the students table (the card carries the names)');
select is((select count(*)::int from public.results), 1, 'a parent reads exactly one published result');
select is((select r.frozen_payload ->> 'studentCode' from public.results r), 'S1', 'their own child''s');
select is((select count(*)::int from public.result_subject_lines), 2, 'and its lines');
select is((select count(*)::int from public.guardian_users), 1, 'and only their own guardian link');
select throws_ok(
  $$insert into public.guardian_users (workspace_id, guardian_id, student_id, user_id, status)
    select workspace_id, guardian_id, student_id, user_id, 'active' from public.guardian_users$$,
  '42501', null, 'a parent cannot create a guardian link');
select tests.logout();

select tests.login('56000000-0000-4000-a000-000000000005');
select is((select count(*)::int from public.results), 0, 'the parent of a withheld child reads nothing');
select tests.logout();
select tests.login('56000000-0000-4000-a000-000000000006');
select is((select count(*)::int from public.results), 0, 'a revoked link reads nothing');
select tests.logout();
select tests.login('56000000-0000-4000-a000-000000000008');
select is((select count(*)::int from public.results) + (select count(*)::int from public.result_subject_lines),
  0, 'another school''s parent reads no results or lines');
select tests.logout();
select tests.login('56000000-0000-4000-a000-000000000007');
select is((select count(*)::int from public.guardian_users), 1, 'another school''s owner reads only their own school''s links');
select tests.logout();
select tests.login('56000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.guardian_users), 3, 'the owner reads the school''s links');
select throws_ok($$update public.guardian_users set status = 'active'$$, '42501', null,
  'but no one writes them from the client (the invite flow is F-AC-02 Part 4)');
select tests.logout();

update public.workspace_members set status = 'removed'
 where user_id = '56000000-0000-4000-a000-000000000004';
select tests.login('56000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.results), 0, 'a parent removed from the school reads nothing');
select tests.logout();
update public.workspace_members set status = 'active'
 where user_id = '56000000-0000-4000-a000-000000000004';

-- =====================================================================
-- E. Unpublish and republish
-- =====================================================================
select tests.login('56000000-0000-4000-a000-000000000001');
update public.exams set status = 'marks_locked', status_reason = 'A mark was wrong' where id = tests.id('exam');
select tests.logout();
select is((select count(*)::int from public.results where published), 0, 'unpublishing hides every result');
select is((select count(*)::int from public.results where frozen_payload is not null), 3, 'and keeps the frozen payloads');
select is(
  (select after from public.audit_events where action = 'results.unpublished' and row_id = tests.id('exam')),
  '{"unpublished": 3, "reason": "A mark was wrong"}'::jsonb, 'unpublishing is audited with the reason');
select tests.login('56000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.results), 0, 'the parent reads nothing once unpublished');
select tests.logout();

select tests.login('56000000-0000-4000-a000-000000000001');
update public.exams set status = 'published' where id = tests.id('exam');
select tests.logout();
select tests.login('56000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.results), 1, 'republishing shows it again');
select tests.logout();

select * from finish();
rollback;
