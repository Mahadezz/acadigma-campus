-- =====================================================================
-- pgTAP · F-AC-06 Part 4, non-offline half (demo cut) — submit, lock,
-- unlock and the entry window (20260926063128_marks_submit_lock.sql, D-307)
--
--   A. submit_exam_subject: only the paper's teacher or owner/admin (not
--      the class teacher, another subject's teacher, staff or another
--      school); missing students come back as a warning and nothing
--      changes until confirmed; then `submitted`, audited once.
--   B. lock_exam_subject: owner/admin only, a submitted paper only; a
--      locked paper refuses save_marks (teacher and owner); the chain
--      refuses a reversal without a reason and any jump.
--   C. unlock_exam_subject: owner/admin, a reason required; on a
--      marks_locked exam it goes back to marks_entry and the results are
--      wiped with a results.cleared audit; the reason is audited.
--   D. The entry window: outside it a teacher is refused, an owner/admin
--      needs a reason and the row is stamped edited_after_window; inside
--      it a teacher saves unstamped; closes before opens is refused.
--   E. Another school: FORBIDDEN on A's workspace, PAPER_NOT_FOUND on its
--      own.
-- =====================================================================
begin;
select plan(53);

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

-- One save of one student's mark on paper p_paper in school A.
create or replace function tests.save(p_paper text, p_student text, p_obtained numeric,
                                      p_late_reason text default null)
returns jsonb language sql as $fn$
  select public.save_marks('57000000-0000-4000-b000-000000000001', jsonb_build_object(
    'idempotency_key', gen_random_uuid(), 'exam_subject_id', tests.id(p_paper),
    'late_reason', p_late_reason,
    'entries', jsonb_build_array(jsonb_build_object(
      'student_id', tests.id(p_student), 'status', 'entered', 'obtained', p_obtained,
      'expected_updated_at', (select updated_at from public.marks
                               where exam_subject_id = tests.id(p_paper)
                                 and student_id = tests.id(p_student))))))
$fn$;

create or replace function tests.submit(p_paper text, p_confirm boolean default false)
returns jsonb language sql as $fn$
  select public.submit_exam_subject('57000000-0000-4000-b000-000000000001', tests.id(p_paper), p_confirm)
$fn$;

create or replace function tests.paper_status(p_paper text) returns text language sql as $fn$
  select status::text from public.exam_subjects where id = tests.id(p_paper)
$fn$;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner, the Maths teacher, the class
-- teacher, the Science teacher, staff; Class 6 A with three students; an
-- exam with Maths, Science and English papers out of 50. School B: an owner.
-- ---------------------------------------------------------------------
select tests.mkuser('57000000-0000-4000-a000-000000000001', 'sl-owner-a@test.local', 'Owner A');
select tests.mkuser('57000000-0000-4000-a000-000000000002', 'sl-maths@test.local', 'Maths Teacher');
select tests.mkuser('57000000-0000-4000-a000-000000000003', 'sl-classt@test.local', 'Class Teacher');
select tests.mkuser('57000000-0000-4000-a000-000000000004', 'sl-science@test.local', 'Science Teacher');
select tests.mkuser('57000000-0000-4000-a000-000000000005', 'sl-staff@test.local', 'Staff A');
select tests.mkuser('57000000-0000-4000-a000-000000000007', 'sl-owner-b@test.local', 'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('57000000-0000-4000-b000-000000000001', 'school', 'Lock School A', 'lock-school-a-57',
   '57000000-0000-4000-a000-000000000001', '57000000-0000-4000-a000-000000000001', 'active'),
  ('57000000-0000-4000-b000-000000000002', 'school', 'Lock School B', 'lock-school-b-57',
   '57000000-0000-4000-a000-000000000007', '57000000-0000-4000-a000-000000000007', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('57000000-0000-4000-b000-000000000001', '57000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('57000000-0000-4000-b000-000000000001', '57000000-0000-4000-a000-000000000003', 'teacher', 'active', now()),
  ('57000000-0000-4000-b000-000000000001', '57000000-0000-4000-a000-000000000004', 'teacher', 'active', now()),
  ('57000000-0000-4000-b000-000000000001', '57000000-0000-4000-a000-000000000005', 'staff',   'active', now());

insert into ids
select case m.user_id
         when '57000000-0000-4000-a000-000000000002' then 'maths_m'
         when '57000000-0000-4000-a000-000000000003' then 'classt_m'
         else 'science_m' end, m.id
  from public.workspace_members m
 where m.workspace_id = '57000000-0000-4000-b000-000000000001'
   and m.user_id in ('57000000-0000-4000-a000-000000000002', '57000000-0000-4000-a000-000000000003',
                     '57000000-0000-4000-a000-000000000004');

insert into public.academic_years (id, workspace_id, name, starts_on, ends_on)
values ('57000000-0000-4000-c000-000000000001', '57000000-0000-4000-b000-000000000001', '2026', '2026-01-01', '2026-12-31');
insert into public.grade_levels (id, workspace_id, name, name_bn, level_number)
values ('57000000-0000-4000-c000-000000000011', '57000000-0000-4000-b000-000000000001', 'Class 6', 'ষষ্ঠ শ্রেণি', 6);
insert into public.sections (id, workspace_id, academic_year_id, grade_level_id, name, class_teacher_id)
values ('57000000-0000-4000-c000-000000000021', '57000000-0000-4000-b000-000000000001',
        '57000000-0000-4000-c000-000000000001', '57000000-0000-4000-c000-000000000011', 'A', tests.id('classt_m'));
insert into public.subjects (id, workspace_id, name)
values
  ('57000000-0000-4000-c000-000000000031', '57000000-0000-4000-b000-000000000001', 'Mathematics 57'),
  ('57000000-0000-4000-c000-000000000032', '57000000-0000-4000-b000-000000000001', 'Science 57'),
  ('57000000-0000-4000-c000-000000000033', '57000000-0000-4000-b000-000000000001', 'English 57');

insert into public.students (id, workspace_id, student_code, first_name, last_name, gender)
select ('57000000-0000-4000-d000-00000000000' || i)::uuid, '57000000-0000-4000-b000-000000000001',
       'SL-57-' || i, 'Student', 'No' || i, 'male'
  from generate_series(1, 3) as i;
insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id, roll_number)
select '57000000-0000-4000-b000-000000000001', ('57000000-0000-4000-d000-00000000000' || i)::uuid,
       '57000000-0000-4000-c000-000000000001', '57000000-0000-4000-c000-000000000021', i
  from generate_series(1, 3) as i;
insert into ids
select 's' || i, ('57000000-0000-4000-d000-00000000000' || i)::uuid from generate_series(1, 3) as i;

select tests.login('57000000-0000-4000-a000-000000000001');
select public.seed_bd_grade_scale('57000000-0000-4000-b000-000000000001');
insert into ids select 'exam', public.create_exam(jsonb_build_object(
  'workspace_id', '57000000-0000-4000-b000-000000000001',
  'academic_year_id', '57000000-0000-4000-c000-000000000001',
  'name', 'Half-Yearly 2026', 'exam_type', 'term_final', 'full_marks', 50,
  'section_ids', jsonb_build_array('57000000-0000-4000-c000-000000000021'),
  'subject_ids', jsonb_build_array('57000000-0000-4000-c000-000000000031',
                                   '57000000-0000-4000-c000-000000000032',
                                   '57000000-0000-4000-c000-000000000033')));
select tests.logout();

insert into ids
select 'maths', id from public.exam_subjects where subject_id = '57000000-0000-4000-c000-000000000031'
union all select 'science', id from public.exam_subjects where subject_id = '57000000-0000-4000-c000-000000000032'
union all select 'english', id from public.exam_subjects where subject_id = '57000000-0000-4000-c000-000000000033';
update public.exam_subjects set teacher_id = tests.id('maths_m') where id = tests.id('maths');
update public.exam_subjects set teacher_id = tests.id('science_m') where id = tests.id('science');
update public.exams set status = 'scheduled' where id = tests.id('exam');
update public.exams set status = 'in_progress' where id = tests.id('exam');
update public.exams set status = 'marks_entry' where id = tests.id('exam');

-- =====================================================================
-- A. Submit
-- =====================================================================
select tests.login('57000000-0000-4000-a000-000000000002');   -- the Maths teacher
select is(
  (select jsonb_build_object('submitted', r -> 'submitted', 'missing', jsonb_array_length(r -> 'missing'))
     from tests.submit('maths') r),
  '{"submitted": false, "missing": 3}'::jsonb,
  'with no marks, submit returns the three missing students and changes nothing');
select is(tests.paper_status('maths'), 'pending', 'the paper is still pending');

select lives_ok($$select tests.save('maths', 's1', 40)$$, 'the teacher enters one mark');
select lives_ok($$select tests.save('maths', 's2', 35)$$, 'and another');
select is(
  (select r from tests.submit('maths') r),
  jsonb_build_object('submitted', false, 'missing', jsonb_build_array(jsonb_build_object(
    'student_id', tests.id('s3'), 'full_name', 'Student No3', 'full_name_bn', null, 'roll_number', 3))),
  'the warning names the one student still missing, with roll and name');
select is(tests.paper_status('maths'), 'entering', 'an unconfirmed submit does not submit');
select is((select (r ->> 'submitted')::boolean from tests.submit('maths', true) r), true,
  'confirmed, the incomplete paper is submitted anyway (a warning, not a block)');
select is(tests.paper_status('maths'), 'submitted', 'the paper is submitted');
select is((select (r ->> 'submitted')::boolean from tests.submit('maths', true) r), true,
  'submitting again is a no-op');
select tests.logout();
select is(
  (select string_agg((after ->> 'missing') || '@' || (row_id = tests.id('maths'))::text, ',')
     from public.audit_events where action = 'marks.submitted'),
  '1@true', 'one marks.submitted event, with the missing count');

select tests.login('57000000-0000-4000-a000-000000000003');   -- the class teacher
select throws_ok($$select tests.submit('science', true)$$, '42501', 'NOT_ASSIGNED',
  'the class teacher may enter marks but not submit another teacher''s paper');
select tests.logout();
select tests.login('57000000-0000-4000-a000-000000000004');   -- the Science teacher
select throws_ok($$select tests.submit('maths', true)$$, '42501', 'NOT_ASSIGNED',
  'another subject''s teacher cannot submit the Maths paper');
select tests.logout();
select tests.login('57000000-0000-4000-a000-000000000005');   -- staff
select throws_ok($$select tests.submit('science', true)$$, '42501', 'FORBIDDEN', 'staff cannot submit');
select tests.logout();

select tests.login('57000000-0000-4000-a000-000000000001');   -- the owner
select is((select (r ->> 'submitted')::boolean from tests.submit('science', true) r), true,
  'an owner submits a pending paper (through entering)');
select is(tests.paper_status('science'), 'submitted', 'the Science paper is submitted');

-- =====================================================================
-- B. Lock
-- =====================================================================
select throws_ok(format($$select public.lock_exam_subject(%L, %L)$$,
  '57000000-0000-4000-b000-000000000001', tests.id('english')),
  '22023', 'NOT_SUBMITTED', 'a paper that is not submitted cannot be locked');
select lives_ok(format($$select public.lock_exam_subject(%L, %L)$$,
  '57000000-0000-4000-b000-000000000001', tests.id('maths')), 'the owner locks the Maths paper');
select is(tests.paper_status('maths'), 'locked', 'the paper is locked');
select throws_ok(format($$select public.lock_exam_subject(%L, %L)$$,
  '57000000-0000-4000-b000-000000000001', tests.id('maths')),
  '22023', 'ALREADY_LOCKED', 'locking twice is refused');
select throws_ok($$select tests.save('maths', 's3', 20)$$, '42501', 'SUBJECT_LOCKED',
  'a locked paper refuses save_marks, even from the owner');
select throws_ok(format($$update public.exam_subjects set status = 'submitted' where id = %L$$, tests.id('maths')),
  '42501', 'UNLOCK_VIA_RPC_ONLY', 'a direct update cannot unlock a paper');
select throws_ok(format($$update public.exam_subjects set status = 'submitted', status_reason = 'direct' where id = %L$$,
  tests.id('maths')),
  '42501', 'UNLOCK_VIA_RPC_ONLY', 'not even with a reason: only unlock_exam_subject unlocks (LOW-1)');
select throws_ok(format($$update public.exam_subjects set status = 'locked' where id = %L$$, tests.id('english')),
  '22023', 'INVALID_TRANSITION', 'and a jump from pending to locked');
select tests.logout();
select is((select count(*)::int from public.audit_events
            where action = 'marks.locked' and row_id = tests.id('maths')), 1, 'locking is audited');

select tests.login('57000000-0000-4000-a000-000000000002');   -- the Maths teacher
select throws_ok($$select tests.save('maths', 's3', 20)$$, '42501', 'SUBJECT_LOCKED',
  'the paper''s teacher cannot save a locked paper');
select throws_ok(format($$select public.lock_exam_subject(%L, %L)$$,
  '57000000-0000-4000-b000-000000000001', tests.id('science')),
  '42501', 'FORBIDDEN', 'a teacher cannot lock');
select throws_ok(format($$select public.unlock_exam_subject(%L, %L, 'please')$$,
  '57000000-0000-4000-b000-000000000001', tests.id('maths')),
  '42501', 'FORBIDDEN', 'a teacher cannot unlock');
select tests.logout();

-- =====================================================================
-- C. Unlock clears the results
-- =====================================================================
select tests.login('57000000-0000-4000-a000-000000000001');
update public.exams set status = 'marks_locked' where id = tests.id('exam');
select lives_ok(format($$select public.compute_results(%L, %L)$$,
  '57000000-0000-4000-b000-000000000001', tests.id('exam')), 'results are computed on the locked exam');
select tests.logout();
select is((select count(*)::int from public.results where exam_id = tests.id('exam')), 3, 'three results exist');

select tests.login('57000000-0000-4000-a000-000000000001');
select throws_ok(format($$select public.unlock_exam_subject(%L, %L, '   ')$$,
  '57000000-0000-4000-b000-000000000001', tests.id('maths')),
  '22023', 'REASON_REQUIRED', 'unlocking needs a reason (blank is none)');
select throws_ok(format($$select public.unlock_exam_subject(%L, %L, 'fix')$$,
  '57000000-0000-4000-b000-000000000001', tests.id('english')),
  '22023', 'NOT_LOCKED', 'a paper that is not locked cannot be unlocked');
select lives_ok(format($$select public.unlock_exam_subject(%L, %L, 'Roll 3 was marked on the wrong paper')$$,
  '57000000-0000-4000-b000-000000000001', tests.id('maths')), 'the owner unlocks with a reason');
select tests.logout();
select is(
  (select status::text || ' / ' || status_reason from public.exam_subjects where id = tests.id('maths')),
  'submitted / Roll 3 was marked on the wrong paper', 'the paper is back to submitted, with the reason');
select is((select status::text from public.exams where id = tests.id('exam')), 'marks_entry',
  'the marks_locked exam goes back to marks entry');
select is((select count(*)::int from public.results where exam_id = tests.id('exam')), 0,
  'the stale results are wiped');
select is(
  (select string_agg(after ->> 'cleared', ',') from public.audit_events
    where action = 'results.cleared' and row_id = tests.id('exam')),
  '3', 'the wipe is audited as results.cleared with the count');
select is(
  (select string_agg(after ->> 'reason', ',') from public.audit_events
    where action = 'marks.unlocked' and row_id = tests.id('maths')),
  'Roll 3 was marked on the wrong paper', 'the unlock is audited with its reason (AC13)');

-- =====================================================================
-- D. The entry window
-- =====================================================================
update public.exam_subjects
   set exam_date = app.school_today('57000000-0000-4000-b000-000000000001') - 10
 where id = tests.id('maths');   -- window: 10 to 3 days ago (the exam has no ends_on)
select is(
  (select w.closes_on from public.exam_subjects es, app.marks_entry_window(es, app.school_today(es.workspace_id) - 2) w
    where es.id = tests.id('maths')),
  app.school_today('57000000-0000-4000-b000-000000000001') + 5,
  'by default a paper closes 7 days after the later of its date and the exam''s end');

select tests.login('57000000-0000-4000-a000-000000000002');   -- the Maths teacher
select throws_ok($$select tests.save('maths', 's3', 20)$$, '42501', 'OUTSIDE_ENTRY_WINDOW',
  'after the window closes the teacher is refused');
select tests.logout();
select tests.login('57000000-0000-4000-a000-000000000003');   -- the class teacher
select throws_ok($$select tests.save('maths', 's3', 20)$$, '42501', 'OUTSIDE_ENTRY_WINDOW',
  'and so is the class teacher');
select tests.logout();

select tests.login('57000000-0000-4000-a000-000000000001');   -- the owner
select throws_ok($$select tests.save('maths', 's3', 20)$$, '22023', 'REASON_REQUIRED',
  'the owner may write after the window, but only with a reason');
select is((select (r ->> 'saved')::int from tests.save('maths', 's3', 20, 'Script found late') r), 1,
  'with a reason the owner''s late mark saves');
select tests.logout();
select is(
  (select edited_after_window from public.marks where exam_subject_id = tests.id('maths') and student_id = tests.id('s3')),
  true, 'the late mark is stamped edited_after_window');
select is(
  (select after ->> 'late_reason' from public.audit_events
    where action = 'marks.entered' and row_id = tests.id('maths') and after ? 'late_reason'),
  'Script found late', 'the late save''s audit event carries the reason');

update public.exam_subjects
   set entry_closes_on = app.school_today('57000000-0000-4000-b000-000000000001')
 where id = tests.id('maths');   -- the admin extends the window to today
select tests.login('57000000-0000-4000-a000-000000000002');
select is((select (r ->> 'saved')::int from tests.save('maths', 's3', 25) r), 1,
  'inside the extended window the teacher saves again');
select tests.logout();
select is(
  (select edited_after_window from public.marks where exam_subject_id = tests.id('maths') and student_id = tests.id('s3')),
  true, 'the late stamp is sticky: an in-window rewrite does not clear it');
select tests.login('57000000-0000-4000-a000-000000000002');
select is((select (r ->> 'saved')::int from tests.save('maths', 's2', 30) r), 1,
  'the teacher changes another mark inside the window');
select tests.logout();
select is(
  (select edited_after_window from public.marks where exam_subject_id = tests.id('maths') and student_id = tests.id('s2')),
  false, 'a mark written inside the window is not stamped');

update public.exam_subjects
   set entry_opens_on = app.school_today('57000000-0000-4000-b000-000000000001') + 1,
       entry_closes_on = app.school_today('57000000-0000-4000-b000-000000000001') + 5
 where id = tests.id('science');
select tests.login('57000000-0000-4000-a000-000000000004');   -- the Science teacher
select throws_ok($$select tests.save('science', 's1', 30)$$, '42501', 'OUTSIDE_ENTRY_WINDOW',
  'before the window opens the teacher is refused');
select tests.logout();
select throws_ok(format($$update public.exam_subjects set entry_opens_on = '2026-05-10', entry_closes_on = '2026-05-01' where id = %L$$,
  tests.id('science')), '23514', null, 'a window cannot close before it opens');

-- =====================================================================
-- E. Another school
-- =====================================================================
select tests.login('57000000-0000-4000-a000-000000000007');   -- Owner B
select throws_ok(format($$select public.lock_exam_subject(%L, %L)$$,
  '57000000-0000-4000-b000-000000000001', tests.id('science')),
  '42501', 'FORBIDDEN', 'another school''s owner cannot lock A''s paper');
select throws_ok(format($$select public.unlock_exam_subject(%L, %L, 'x')$$,
  '57000000-0000-4000-b000-000000000002', tests.id('maths')),
  '22023', 'PAPER_NOT_FOUND', 'nor reach it through their own school');
select throws_ok(format($$select public.submit_exam_subject(%L, %L, true)$$,
  '57000000-0000-4000-b000-000000000002', tests.id('science')),
  '22023', 'PAPER_NOT_FOUND', 'nor submit it');
select tests.logout();

select * from finish();
rollback;
