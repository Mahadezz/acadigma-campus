-- =====================================================================
-- pgTAP · F-AC-06 Part 5 (demo cut) — results and rank in SQL
-- (20260925300314_results.sql, D-305)
--
--   A. Guards: MARKS_NOT_LOCKED, MARKS_INCOMPLETE (the publish gate's
--      count), FORBIDDEN for teachers, staff and another school.
--   B. The golden fixture: 10 students x 6 papers in Class 6 A, every
--      result asserted row by row against hand-computed values. The rows
--      between the `-- parity:golden_*` markers are read verbatim by
--      packages/domain/src/grading/results.test.ts, so SQL and TS are held
--      to the same numbers.
--   C. Recompute is idempotent: identical rows, one audit event per run.
--   D. RLS: owner/admin/staff and the class teacher read; another class's
--      teacher, parents and another school read nothing; nobody writes.
--   E. read_only (PLAN_READ_ONLY); going back to marks_entry clears the
--      results; composite FKs.
-- =====================================================================
begin;
select plan(35);

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

create or replace function tests.compute() returns jsonb language sql as $fn$
  select public.compute_results('55000000-0000-4000-b000-000000000001', tests.id('exam'))
$fn$;

-- ---------------------------------------------------------------------
-- The golden fixture. Papers P1-P5 are out of 100, P6 out of 50 (pass
-- marks 33 and 16.50). 'A' = absent, 'E' = exempt.
-- ---------------------------------------------------------------------
create temp table golden_marks (code text, p1 text, p2 text, p3 text, p4 text, p5 text, p6 text);
insert into golden_marks values
-- parity:golden_marks
  ('S01', '85', '90', '80', '95', '88', '45'),
  ('S02', '75', '72', '80', '85', '90', '40'),
  ('S03', '70', '80', '75', '85', '90', '40'),
  ('S04', '80', '70', '85', '75', '90', '40'),
  ('S05', '79.5', '60', '60', '60', '60', '30'),
  ('S06', '65', '65', '65', '65', 'E', '25'),
  ('S07', '90', '90', 'A', '90', '90', '45'),
  ('S08', '60', '32.5', '60', '60', '60', '30'),
  ('S09', '33', '33', '33', '33', '33', '16.5'),
  ('S10', '50', '50', '50', '50', '50', '16.49')
-- /parity:golden_marks
;

-- Hand-computed (docs/test-reports/2026-09-26-F-AC-06-p5.md shows the
-- working): code, total obtained, total full, percentage, GPA, letter,
-- status, failed papers, section rank.
create temp table golden_expected (
  code text, total_obtained numeric, total_full numeric, percentage numeric, gpa numeric,
  letter text, status text, failed int, rank int);
insert into golden_expected values
-- parity:golden_expected
  ('S01', 483.00, 550.00, 87.82, 5.00, 'A+', 'pass', 0, 1),
  ('S02', 442.00, 550.00, 80.36, 4.67, 'A', 'pass', 0, 2),
  ('S03', 440.00, 550.00, 80.00, 4.67, 'A', 'pass', 0, 3),
  ('S04', 440.00, 550.00, 80.00, 4.67, 'A', 'pass', 0, 3),
  ('S05', 349.50, 550.00, 63.55, 3.58, 'A-', 'pass', 0, 5),
  ('S06', 285.00, 450.00, 63.33, 3.40, 'B', 'pass', 0, 6),
  ('S07', 405.00, 550.00, 73.64, 0.00, 'F', 'fail', 1, 8),
  ('S08', 302.50, 550.00, 55.00, 0.00, 'F', 'fail', 1, 9),
  ('S09', 181.50, 550.00, 33.00, 1.00, 'D', 'pass', 0, 7),
  ('S10', 266.49, 550.00, 48.45, 0.00, 'F', 'fail', 1, 10)
-- /parity:golden_expected
;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner, the class teacher of 6 A, the
-- class teacher of 6 B, staff, a parent. School B: an owner.
-- ---------------------------------------------------------------------
select tests.mkuser('55000000-0000-4000-a000-000000000001', 'rs-owner-a@test.local', 'Owner A');
select tests.mkuser('55000000-0000-4000-a000-000000000002', 'rs-classt-a@test.local', 'Class Teacher A');
select tests.mkuser('55000000-0000-4000-a000-000000000003', 'rs-classt-b@test.local', 'Class Teacher B');
select tests.mkuser('55000000-0000-4000-a000-000000000004', 'rs-staff@test.local', 'Staff A');
select tests.mkuser('55000000-0000-4000-a000-000000000005', 'rs-parent@test.local', 'Parent A');
select tests.mkuser('55000000-0000-4000-a000-000000000006', 'rs-owner-b@test.local', 'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('55000000-0000-4000-b000-000000000001', 'school', 'Results School A', 'results-school-a-55',
   '55000000-0000-4000-a000-000000000001', '55000000-0000-4000-a000-000000000001', 'active'),
  ('55000000-0000-4000-b000-000000000002', 'school', 'Results School B', 'results-school-b-55',
   '55000000-0000-4000-a000-000000000006', '55000000-0000-4000-a000-000000000006', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('55000000-0000-4000-b000-000000000001', '55000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('55000000-0000-4000-b000-000000000001', '55000000-0000-4000-a000-000000000003', 'teacher', 'active', now()),
  ('55000000-0000-4000-b000-000000000001', '55000000-0000-4000-a000-000000000004', 'staff',   'active', now()),
  ('55000000-0000-4000-b000-000000000001', '55000000-0000-4000-a000-000000000005', 'parent',  'active', now());

insert into ids
select case m.user_id
         when '55000000-0000-4000-a000-000000000002' then 'classt_a_m'
         else 'classt_b_m' end, m.id
  from public.workspace_members m
 where m.workspace_id = '55000000-0000-4000-b000-000000000001'
   and m.user_id in ('55000000-0000-4000-a000-000000000002', '55000000-0000-4000-a000-000000000003');

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on)
values ('55000000-0000-4000-c000-000000000001', '55000000-0000-4000-b000-000000000001', '2026', '2026-01-01', '2026-12-31');
insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values ('55000000-0000-4000-c000-000000000011', '55000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ শ্রেণি', 6);
insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name, class_teacher_id)
values
  ('55000000-0000-4000-c000-000000000021', '55000000-0000-4000-b000-000000000001',
   '55000000-0000-4000-c000-000000000001', '55000000-0000-4000-c000-000000000011', 'A', tests.id('classt_a_m')),
  ('55000000-0000-4000-c000-000000000022', '55000000-0000-4000-b000-000000000001',
   '55000000-0000-4000-c000-000000000001', '55000000-0000-4000-c000-000000000011', 'B', tests.id('classt_b_m'));
insert into public.subjects (id, workspace_id, name)
select ('55000000-0000-4000-c000-00000000003' || n)::uuid, '55000000-0000-4000-b000-000000000001', 'Paper ' || n || ' 55'
  from generate_series(1, 6) as n;

-- Ten students in 6 A (the golden fixture), two in 6 B.
insert into public.students (workspace_id, student_code, first_name, last_name, gender)
select '55000000-0000-4000-b000-000000000001'::uuid, g.code, 'Student', g.code, 'female'::public.student_gender from golden_marks g
union all
select '55000000-0000-4000-b000-000000000001'::uuid, t, 'Student', t, 'male'::public.student_gender from unnest(array['T1', 'T2']) as t;
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number)
select st.workspace_id, st.id, '55000000-0000-4000-c000-000000000001',
       case when st.student_code like 'S%' then '55000000-0000-4000-c000-000000000021'
            else '55000000-0000-4000-c000-000000000022' end::uuid,
       (row_number() over (partition by left(st.student_code, 1) order by st.student_code))::int
  from public.students st where st.workspace_id = '55000000-0000-4000-b000-000000000001';

select tests.login('55000000-0000-4000-a000-000000000001');
select public.seed_bd_grade_scale('55000000-0000-4000-b000-000000000001');
insert into ids select 'exam', public.create_exam(jsonb_build_object(
  'workspace_id', '55000000-0000-4000-b000-000000000001',
  'academic_year_id', '55000000-0000-4000-c000-000000000001',
  'name', 'Half-Yearly 2026', 'exam_type', 'term_final', 'full_marks', 100,
  'section_ids', jsonb_build_array('55000000-0000-4000-c000-000000000021', '55000000-0000-4000-c000-000000000022'),
  'subject_ids', (select jsonb_agg(('55000000-0000-4000-c000-00000000003' || n)) from generate_series(1, 6) as n)));
update public.exam_subjects set full_marks = 50, pass_marks = 16.50
 where exam_id = tests.id('exam') and subject_id = '55000000-0000-4000-c000-000000000036';
update public.exams set status = 'scheduled' where id = tests.id('exam');
update public.exams set status = 'in_progress' where id = tests.id('exam');
update public.exams set status = 'marks_entry' where id = tests.id('exam');
select tests.logout();

-- Marks as postgres (save_marks is covered by 54_marks.sql). 6 B: T1 all 60,
-- T2 all 70 % — but T2's P6 (35 of 50) is left missing for the completeness guard.
insert into public.marks (workspace_id, exam_subject_id, student_id, enrollment_id, status, obtained)
select e.workspace_id, es.id, e.student_id, e.id,
       case x.v when 'A' then 'absent' when 'E' then 'exempt' else 'entered' end::public.mark_status,
       case when x.v in ('A', 'E') then null else x.v::numeric end
  from (select code, p1, p2, p3, p4, p5, p6 from golden_marks
        union all select 'T1', '60', '60', '60', '60', '60', '30'
        union all select 'T2', '70', '70', '70', '70', '70', null) g
 cross join lateral (values (1, g.p1), (2, g.p2), (3, g.p3), (4, g.p4), (5, g.p5), (6, g.p6)) as x(n, v)
  join public.students st
    on st.student_code = g.code and st.workspace_id = '55000000-0000-4000-b000-000000000001'
  join public.enrollments e on e.student_id = st.id
  join public.exam_subjects es
    on es.section_id = e.section_id and es.exam_id = tests.id('exam')
   and es.subject_id = ('55000000-0000-4000-c000-00000000003' || x.n)::uuid
 where x.v is not null;

-- =====================================================================
-- A. Guards
-- =====================================================================
select tests.login('55000000-0000-4000-a000-000000000001');
select throws_ok('select tests.compute()', '22023', 'MARKS_NOT_LOCKED',
  'results are not computed while marks entry is open');
update public.exams set status = 'marks_locked' where id = tests.id('exam');
select throws_ok('select tests.compute()', '22023', 'MARKS_INCOMPLETE',
  'nor while an enrolled student has no mark on a paper (the publish gate''s count)');
select is((select count(*)::int from public.results), 0, 'a refused compute writes nothing');
select tests.logout();

insert into public.marks (workspace_id, exam_subject_id, student_id, enrollment_id, status, obtained)
select e.workspace_id, es.id, e.student_id, e.id, 'entered', 35
  from public.students st
  join public.enrollments e on e.student_id = st.id
  join public.exam_subjects es
    on es.section_id = e.section_id and es.exam_id = tests.id('exam')
   and es.subject_id = '55000000-0000-4000-c000-000000000036'
 where st.student_code = 'T2' and st.workspace_id = '55000000-0000-4000-b000-000000000001';

select tests.login('55000000-0000-4000-a000-000000000002');
select throws_ok('select tests.compute()', '42501', 'FORBIDDEN', 'the class teacher cannot compute results');
select tests.logout();
select tests.login('55000000-0000-4000-a000-000000000004');
select throws_ok('select tests.compute()', '42501', 'FORBIDDEN', 'nor can staff');
select tests.logout();
select tests.login('55000000-0000-4000-a000-000000000006');
select throws_ok('select tests.compute()', '42501', 'FORBIDDEN', 'nor another school''s owner');
select tests.logout();

-- =====================================================================
-- B. The golden fixture
-- =====================================================================
select tests.login('55000000-0000-4000-a000-000000000001');
select is(tests.compute(), '{"computed": 12, "passed": 9, "failed": 3}'::jsonb,
  'the owner computes: 12 results, 9 pass, 3 fail');
select tests.logout();

select results_eq(
  $$select st.student_code, r.total_obtained, r.total_full, r.percentage, r.gpa, r.letter,
           r.result_status::text, r.failed_subjects::int, r.section_rank
      from public.results r join public.students st on st.id = r.student_id
     where r.section_id = '55000000-0000-4000-c000-000000000021'
     order by st.student_code$$,
  $$select code, total_obtained, total_full, percentage, gpa, letter, status, failed, rank
      from golden_expected order by code$$,
  'every 6 A result matches the hand-computed golden fixture');

create or replace function tests.line(p_code text, p_paper int) returns text language sql as $fn$
  select concat_ws('|', l.status, l.obtained, l.percentage, l.letter, l.grade_point, l.passed)
    from public.result_subject_lines l
    join public.results r on r.id = l.result_id
    join public.students st on st.id = r.student_id
   where st.student_code = p_code
     and l.subject_id = ('55000000-0000-4000-c000-00000000003' || p_paper)::uuid
$fn$;

select is(tests.line('S05', 1), 'entered|79.50|79.50|A|4.00|true', '79.5 % is an A: no rounding before banding');
select is(tests.line('S08', 2), 'entered|32.50|32.50|F|0.00|false', '32.5 % is an F and a failed paper');
select is(tests.line('S09', 6), 'entered|16.50|33.00|D|1.00|true', '16.50 of 50 is exactly the pass mark: D, passed');
select is(tests.line('S10', 6), 'entered|16.49|32.98|F|0.00|false', '16.49 of 50 is one hundredth short: F, failed');
select is(tests.line('S07', 3), 'absent|0.00|F|0.00|false', 'absent scores 0 % and fails the paper');
select is(tests.line('S06', 5), 'exempt', 'exempt has no mark, percentage, grade or pass flag');
select is((select count(*)::int from public.result_subject_lines), 72, 'one line per student per paper');
select is(
  (select string_agg(st.student_code || '=' || r.section_rank || '/' || r.gpa, ',' order by st.student_code)
     from public.results r join public.students st on st.id = r.student_id
    where r.section_id = '55000000-0000-4000-c000-000000000022'),
  'T1=2/3.50,T2=1/4.00', '6 B is ranked on its own (rank partitions by section)');
select is(
  (select count(*)::int from public.audit_events
    where action = 'results.computed' and row_id = tests.id('exam')),
  1, 'one results.computed audit event for the exam');

-- =====================================================================
-- C. Recompute is idempotent
-- =====================================================================
create temp table before_rerun as
select r.student_id, r.total_obtained, r.percentage, r.gpa, r.letter, r.result_status,
       r.failed_subjects, r.section_rank from public.results r;

select tests.login('55000000-0000-4000-a000-000000000001');
select is(tests.compute(), '{"computed": 12, "passed": 9, "failed": 3}'::jsonb, 'computing again returns the same summary');
select tests.logout();
select results_eq(
  $$select r.student_id, r.total_obtained, r.percentage, r.gpa, r.letter, r.result_status,
           r.failed_subjects, r.section_rank from public.results r order by r.student_id$$,
  $$select * from before_rerun order by student_id$$,
  'and replaces the rows with identical ones');
select is((select count(*)::int from public.result_subject_lines), 72, 'with no duplicate lines');
select is(
  (select count(*)::int from public.audit_events
    where action = 'results.computed' and row_id = tests.id('exam')),
  2, 'each run is audited once');

-- =====================================================================
-- D. RLS
-- =====================================================================
select tests.login('55000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.results), 10, 'the class teacher of 6 A reads 6 A''s results');
select is((select count(*)::int from public.result_subject_lines), 60, 'and their lines');
select tests.logout();
select tests.login('55000000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.results), 2, 'the class teacher of 6 B reads only 6 B''s');
select tests.logout();
select tests.login('55000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.results), 12, 'staff read every result');
select tests.logout();
select tests.login('55000000-0000-4000-a000-000000000005');
select is((select count(*)::int from public.results), 0, 'a parent reads no results before publishing (Part 7)');
select is((select count(*)::int from public.result_subject_lines), 0, 'nor any line');
select tests.logout();
select tests.login('55000000-0000-4000-a000-000000000006');
select is((select count(*)::int from public.results), 0, 'another school''s owner reads nothing (isolation)');
select tests.logout();

select tests.login('55000000-0000-4000-a000-000000000001');
select throws_ok(
  $$insert into public.results (workspace_id, exam_id, section_id, student_id, enrollment_id,
      total_obtained, total_full, result_status, failed_subjects)
    select workspace_id, exam_id, section_id, student_id, enrollment_id, 1, 1, 'pass', 0
      from public.results limit 1$$,
  '42501', null, 'even the owner cannot insert a result directly');
select throws_ok($$update public.results set gpa = 5$$, '42501', null, 'or change one');
select throws_ok($$delete from public.result_subject_lines$$, '42501', null, 'or delete a line');
select tests.logout();

-- =====================================================================
-- E. read_only, unlock, composite FKs
-- =====================================================================
select app.set_access_mode('55000000-0000-4000-b000-000000000001', 'read_only', 'Trial ended.');
select tests.login('55000000-0000-4000-a000-000000000001');
select throws_ok('select tests.compute()', '42501', 'PLAN_READ_ONLY', 'read_only: results cannot be computed');
select tests.logout();
select app.set_access_mode('55000000-0000-4000-b000-000000000001', 'normal', 'Upgraded.');

select throws_ok(
  $$insert into public.results (workspace_id, exam_id, section_id, student_id, enrollment_id,
      total_obtained, total_full, result_status, failed_subjects)
    select '55000000-0000-4000-b000-000000000002', exam_id, section_id, student_id, enrollment_id, 1, 1, 'pass', 0
      from public.results limit 1$$,
  '23503', null, 'a result cannot pair another school with school A''s exam (composite FK)');

select tests.login('55000000-0000-4000-a000-000000000001');
update public.exams set status = 'marks_entry', status_reason = 'A mark was wrong'
 where id = tests.id('exam');
select tests.logout();
select is((select count(*)::int from public.results), 0, 'going back to marks entry clears the stale results');
select is((select count(*)::int from public.result_subject_lines), 0, 'and their lines');

select * from finish();
rollback;
