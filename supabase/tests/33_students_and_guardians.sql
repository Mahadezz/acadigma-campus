-- =====================================================================
-- pgTAP · F-AC-02 demo cut — students, private details, guardians,
-- enrolments and public.admit_student
-- (20260925300306_students_and_guardians.sql, D-103)
--
-- The admission transaction and its named errors, idempotency, the
-- one-active-enrolment and roll-number rules, tenant-bound foreign keys,
-- isolation and escalation per role, the sensitivity split (only
-- owner/admin and the class teacher read date of birth and guardians),
-- soft delete, read-only mode, created_by immutability and the audit trail
-- (guardian phone masked, one correlation id per admission).
-- =====================================================================
begin;
select plan(52);

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
  perform set_config('app.correlation_id', '', true);
end;
$fn$;

create or replace function tests.school_input(p_key uuid, p_patch jsonb default '{}')
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'name', 'Ideal School & College',
    'eiin', null,
    'board', 'dhaka',
    'medium', 'bangla',
    'timezone', 'Asia/Dhaka',
    'working_days', jsonb_build_array(6, 7, 1, 2, 3, 4),
    'academic_year', jsonb_build_object('name', '2026', 'starts_on', '2026-01-01', 'ends_on', '2026-12-31'),
    'grade_levels', jsonb_build_array(
      jsonb_build_object('name', 'Class 6', 'name_bn', 'ষষ্ঠ শ্রেণি', 'level_number', 6, 'stage', 'secondary')),
    'idempotency_key', p_key
  ) || p_patch;
$fn$;

-- A valid admission; p_patch overrides top-level keys.
create or replace function tests.admission(p_key uuid, p_section uuid, p_patch jsonb default '{}')
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'idempotency_key', p_key,
    'first_name', 'Rahim',
    'last_name', 'Uddin',
    'full_name_bn', 'রহিম উদ্দিন',
    'gender', 'male',
    'date_of_birth', '2014-03-09',
    'section_id', p_section,
    'guardian', jsonb_build_object(
      'relation', 'father', 'full_name', 'Karim Uddin', 'phone', '+8801712345678')
  ) || p_patch;
$fn$;

select tests.mkuser('f1030000-0000-0000-0000-000000000001', 'd103.owner@test.local',    'Owner A');
select tests.mkuser('f1030000-0000-0000-0000-000000000002', 'd103.classt@test.local',   'Class Teacher A');
select tests.mkuser('f1030000-0000-0000-0000-000000000003', 'd103.teacher@test.local',  'Subject Teacher A');
select tests.mkuser('f1030000-0000-0000-0000-000000000004', 'd103.staff@test.local',    'Staff A');
select tests.mkuser('f1030000-0000-0000-0000-000000000005', 'd103.parent@test.local',   'Parent A');
select tests.mkuser('f1030000-0000-0000-0000-000000000006', 'd103.ownerb@test.local',   'Owner B');

create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

select tests.login('f1030000-0000-0000-0000-000000000001');
insert into ids select 'a', (public.create_school_workspace(
  tests.school_input('a1030000-0000-4000-8000-000000000001', '{"name": "School A"}')) ->> 'workspace_id')::uuid;
select tests.logout();
select tests.login('f1030000-0000-0000-0000-000000000006');
insert into ids select 'b', (public.create_school_workspace(
  tests.school_input('a1030000-0000-4000-8000-000000000002', '{"name": "School B"}')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status) values
  ((select id from ids where label = 'a'), 'f1030000-0000-0000-0000-000000000002', 'teacher', 'active'),
  ((select id from ids where label = 'a'), 'f1030000-0000-0000-0000-000000000003', 'teacher', 'active'),
  ((select id from ids where label = 'a'), 'f1030000-0000-0000-0000-000000000004', 'staff',   'active'),
  ((select id from ids where label = 'a'), 'f1030000-0000-0000-0000-000000000005', 'parent',  'active');

insert into ids
select 'a_year', id from public.academic_years where workspace_id = (select id from ids where label = 'a')
union all
select 'a_c6', id from public.grade_levels where workspace_id = (select id from ids where label = 'a')
union all
select 'b_year', id from public.academic_years where workspace_id = (select id from ids where label = 'b')
union all
select 'b_c6', id from public.grade_levels where workspace_id = (select id from ids where label = 'b')
union all
select 'classt_m', id from public.workspace_members
 where workspace_id = (select id from ids where label = 'a') and user_id = 'f1030000-0000-0000-0000-000000000002';

-- Class 6 – ক (class teacher: Class Teacher A), Class 6 – খ, an archived
-- Class 6 – গ, a section in a closed year, and Class 6 – ক in School B.
insert into public.academic_years (workspace_id, name, starts_on, ends_on, is_current)
values ((select id from ids where label = 'a'), '2025', '2025-01-01', '2025-12-31', false);
insert into ids select 'a_old_year', id from public.academic_years
 where workspace_id = (select id from ids where label = 'a') and name = '2025';

insert into public.sections (workspace_id, academic_year_id, grade_level_id, name, class_teacher_id) values
  ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'), (select id from ids where label = 'a_c6'), 'ক',
   (select id from ids where label = 'classt_m')),
  ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'), (select id from ids where label = 'a_c6'), 'খ', null),
  ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'), (select id from ids where label = 'a_c6'), 'গ', null),
  ((select id from ids where label = 'a'), (select id from ids where label = 'a_old_year'), (select id from ids where label = 'a_c6'), 'ক', null),
  ((select id from ids where label = 'b'), (select id from ids where label = 'b_year'), (select id from ids where label = 'b_c6'), 'ক', null);
update public.sections set archived_at = now()
 where workspace_id = (select id from ids where label = 'a') and name = 'গ';

insert into ids
select 'ka', id from public.sections where workspace_id = (select id from ids where label = 'a')
   and name = 'ক' and academic_year_id = (select id from ids where label = 'a_year')
union all
select 'kha', id from public.sections where workspace_id = (select id from ids where label = 'a') and name = 'খ'
union all
select 'ga', id from public.sections where workspace_id = (select id from ids where label = 'a') and name = 'গ'
union all
select 'old_ka', id from public.sections where workspace_id = (select id from ids where label = 'a')
   and academic_year_id = (select id from ids where label = 'a_old_year')
union all
select 'b_ka', id from public.sections where workspace_id = (select id from ids where label = 'b');

-- =====================================================================
-- admit_student — the happy path, roll numbers, idempotency
-- =====================================================================
select tests.login('f1030000-0000-0000-0000-000000000001');
create temp table r1 as
select public.admit_student((select id from ids where label = 'a'),
  tests.admission('b1030000-0000-4000-8000-000000000001', (select id from ids where label = 'ka'))) as r;
select ok((select r ->> 'student_code' from r1) ~ '^STU-[0-9]{4}-00001$',
  'the first admission gets the first sequential student code');
select is((select (r ->> 'roll_number')::int from r1), 1, 'and roll number 1 in the section');
select is((select (r ->> 'replayed')::boolean from r1), false, 'a first admission is not a replay');
insert into ids select 's1', (r ->> 'student_id')::uuid from r1;

create temp table r2 as
select public.admit_student((select id from ids where label = 'a'),
  tests.admission('b1030000-0000-4000-8000-000000000002', (select id from ids where label = 'ka'),
    '{"first_name": "Nusrat", "last_name": "Jahan", "full_name_bn": "নুসরাত জাহান", "gender": "female",
      "guardian": {"relation": "mother", "full_name": "Salma Begum", "phone": "+8801811111111"}}')) as r;
select ok((select r ->> 'student_code' from r2) ~ '^STU-[0-9]{4}-00002$', 'codes are sequential');
select is((select (r ->> 'roll_number')::int from r2), 2, 'the next roll number is assigned automatically');
insert into ids select 's2', (r ->> 'student_id')::uuid from r2;

select is(
  (public.admit_student((select id from ids where label = 'a'),
    tests.admission('b1030000-0000-4000-8000-000000000001', (select id from ids where label = 'ka'))) ->> 'student_id')::uuid,
  (select id from ids where label = 's1'),
  'a replayed idempotency key returns the first admission');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000001', (select id from ids where label = 'kha')))$$,
  '22023', 'IDEMPOTENCY_KEY_REUSED', 'the same key with a different body is refused');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000003', (select id from ids where label = 'ka'), '{"roll_number": 2}'))$$,
  '23505', 'ROLL_TAKEN', 'a roll number is unique among a section''s active enrolments');
select lives_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000004', (select id from ids where label = 'kha'), '{"roll_number": 2}'))$$,
  'the same roll number is fine in another section');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000005', (select id from ids where label = 'ga')))$$,
  '22023', 'SECTION_ARCHIVED', 'no admission into an archived section');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000006', (select id from ids where label = 'old_ka')))$$,
  '22023', 'YEAR_CLOSED', 'no admission into a section of a past year');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000007', (select id from ids where label = 'b_ka')))$$,
  '22023', 'SECTION_NOT_FOUND', 'another school''s section is not found');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000008', (select id from ids where label = 'ka'), '{"date_of_birth": "2099-01-01"}'))$$,
  '22023', 'VALIDATION', 'a date of birth in the future is refused');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000009', (select id from ids where label = 'ka'),
        '{"guardian": {"relation": "father", "full_name": "X", "phone": "01712345678"}}'))$$,
  '22023', 'VALIDATION', 'a guardian phone must be E.164');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-00000000000a', (select id from ids where label = 'ka'), '{"gender": "robot"}'))$$,
  '22023', 'VALIDATION', 'an unknown gender is refused');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-00000000000b', (select id from ids where label = 'ka'), '{"last_name": null}'))$$,
  '22023', 'VALIDATION', 'a last name is required');
select throws_ok(
  $$insert into public.students (workspace_id, student_code, first_name, last_name, gender)
    values ((select id from ids where label = 'a'), 'STU-X', 'A', 'B', 'male')$$,
  '42501', 'permission denied for table students',
  'even an owner creates students only through admit_student');
select throws_ok(
  $$update public.students set created_by = 'f1030000-0000-0000-0000-000000000006'
     where id = (select id from ids where label = 's1')$$,
  '42501', 'created_by is immutable', 'created_by on a student cannot be rewritten');
select tests.logout();

select is(
  (select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  3, 'three students exist: the replay and every refused admission wrote nothing');
select is(
  (select count(*)::int from public.guardians where workspace_id = (select id from ids where label = 'a') and is_primary),
  3, 'every admitted student has a primary guardian');

-- =====================================================================
-- Database rules the RPC cannot bypass
-- =====================================================================
select throws_ok(
  $$insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id)
    values ((select id from ids where label = 'a'), (select id from ids where label = 's1'),
            (select id from ids where label = 'a_year'), (select id from ids where label = 'kha'))$$,
  '23505', 'duplicate key value violates unique constraint "enrollments_one_active_per_year"',
  'a student has one active enrolment per academic year');
select throws_ok(
  $$insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id)
    values ((select id from ids where label = 'a'), (select id from ids where label = 's1'),
            (select id from ids where label = 'a_old_year'), (select id from ids where label = 'kha'))$$,
  '23503', 'insert or update on table "enrollments" violates foreign key constraint "enrollments_section_fkey"',
  'an enrolment''s year must be its section''s year');
select throws_ok(
  $$insert into public.enrollments (workspace_id, student_id, academic_year_id, section_id)
    values ((select id from ids where label = 'b'), (select id from ids where label = 's1'),
            (select id from ids where label = 'b_year'), (select id from ids where label = 'b_ka'))$$,
  '23503', 'insert or update on table "enrollments" violates foreign key constraint "enrollments_student_fkey"',
  'an enrolment cannot point at another school''s student');
select throws_ok(
  $$update public.student_private_details set workspace_id = (select id from ids where label = 'b')
     where student_id = (select id from ids where label = 's1')$$,
  '42501', 'workspace_id is immutable',
  'private details cannot move to another school');
select throws_ok(
  $$insert into public.guardians (workspace_id, student_id, relation, full_name, phone, is_primary)
    values ((select id from ids where label = 'a'), (select id from ids where label = 's1'), 'mother', 'Second', '+8801911111111', true)$$,
  '23505', 'duplicate key value violates unique constraint "guardians_one_primary"',
  'a student has exactly one primary guardian');

-- =====================================================================
-- Who reads what
-- =====================================================================
select tests.login('f1030000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  3, 'the class teacher reads the whole roster');
select is((select count(*)::int from public.student_private_details where workspace_id = (select id from ids where label = 'a')),
  2, 'the class teacher reads dates of birth of their own section only');
select is((select count(*)::int from public.guardians where workspace_id = (select id from ids where label = 'a')),
  2, 'the class teacher reads guardians of their own section only');
select tests.logout();

select tests.login('f1030000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  3, 'a subject teacher reads the roster');
select is((select count(*)::int from public.enrollments where workspace_id = (select id from ids where label = 'a')),
  3, 'a subject teacher reads enrolments (class and roll)');
select is((select count(*)::int from public.student_private_details where workspace_id = (select id from ids where label = 'a'))
        + (select count(*)::int from public.guardians where workspace_id = (select id from ids where label = 'a')),
  0, 'a subject teacher reads no date of birth and no guardian');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000010', (select id from ids where label = 'ka')))$$,
  '42501', 'FORBIDDEN', 'escalation: a teacher cannot admit a student');
select throws_ok(
  $$insert into public.guardians (workspace_id, student_id, relation, full_name, phone, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 's1'), 'uncle', 'U', '+8801911111111',
            'f1030000-0000-0000-0000-000000000003')$$,
  '42501', 'new row violates row-level security policy for table "guardians"',
  'escalation: a teacher cannot add a guardian');
update public.students set first_name = 'Hacked' where workspace_id = (select id from ids where label = 'a');
update public.enrollments set roll_number = 99 where workspace_id = (select id from ids where label = 'a');
select tests.logout();
select is(
  (select count(*)::int from public.students where first_name = 'Hacked')
  + (select count(*)::int from public.enrollments where roll_number = 99),
  0, 'escalation: a teacher''s updates of students and enrolments touch no rows');

select tests.login('f1030000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  3, 'staff read the roster');
select is((select count(*)::int from public.student_private_details where workspace_id = (select id from ids where label = 'a'))
        + (select count(*)::int from public.guardians where workspace_id = (select id from ids where label = 'a')),
  0, 'staff read no date of birth and no guardian');
select tests.logout();

select tests.login('f1030000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a'))
        + (select count(*)::int from public.enrollments where workspace_id = (select id from ids where label = 'a'))
        + (select count(*)::int from public.guardians where workspace_id = (select id from ids where label = 'a')),
  0, 'a parent member reads no students yet (their portal is F-AC-10)');
select tests.logout();

select tests.login('f1030000-0000-0000-0000-000000000006');
select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a'))
        + (select count(*)::int from public.student_private_details where workspace_id = (select id from ids where label = 'a'))
        + (select count(*)::int from public.guardians where workspace_id = (select id from ids where label = 'a'))
        + (select count(*)::int from public.enrollments where workspace_id = (select id from ids where label = 'a')),
  0, 'isolation: another school''s owner reads nothing of this school');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000011', (select id from ids where label = 'ka')))$$,
  '42501', 'FORBIDDEN', 'isolation: another school''s owner cannot admit here');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'b'),
      tests.admission('b1030000-0000-4000-8000-000000000012', (select id from ids where label = 'ka')))$$,
  '22023', 'SECTION_NOT_FOUND', 'isolation: nor into this school''s section from their own');
select throws_ok(
  $$insert into public.guardians (workspace_id, student_id, relation, full_name, phone, created_by)
    values ((select id from ids where label = 'b'), (select id from ids where label = 's1'), 'uncle', 'U', '+8801911111111',
            'f1030000-0000-0000-0000-000000000006')$$,
  '23503', 'insert or update on table "guardians" violates foreign key constraint "guardians_student_fkey"',
  'isolation: a guardian cannot be attached to another school''s student');
select tests.logout();

-- =====================================================================
-- Soft delete, class-teacher change, read-only, anon, audit
-- =====================================================================
update public.students set deleted_at = now() where id = (select id from ids where label = 's2');
select tests.login('f1030000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  2, 'a soft-deleted student is hidden from teachers');
select tests.logout();
select tests.login('f1030000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  3, 'the owner still sees a soft-deleted student (the Removed filter)');
select is((select count(*)::int from public.student_private_details where workspace_id = (select id from ids where label = 'a')),
  3, 'the owner reads every date of birth');
select tests.logout();

update public.sections set class_teacher_id = null where id = (select id from ids where label = 'ka');
select tests.login('f1030000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.guardians where workspace_id = (select id from ids where label = 'a')),
  0, 'a teacher who is no longer class teacher loses guardian access at once');
select tests.logout();

update public.workspaces set access_mode = 'read_only' where id = (select id from ids where label = 'a');
select tests.login('f1030000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.admit_student((select id from ids where label = 'a'),
      tests.admission('b1030000-0000-4000-8000-000000000013', (select id from ids where label = 'ka')))$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot admit');
select throws_ok(
  $$update public.guardians set full_name = 'Changed' where student_id = (select id from ids where label = 's1')$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot edit a guardian');
select tests.logout();

select ok(not has_table_privilege('anon', 'public.students', 'select')
          and not has_table_privilege('anon', 'public.student_private_details', 'select')
          and not has_table_privilege('anon', 'public.guardians', 'select')
          and not has_table_privilege('anon', 'public.enrollments', 'select'),
  'anon has no privilege on students, private details, guardians or enrolments');
select ok(not has_function_privilege('anon', 'public.admit_student(uuid, jsonb)', 'execute'),
  'anon cannot call admit_student');
select is(
  (select count(*)::int from public.audit_events
    where workspace_id = (select id from ids where label = 'a') and action = 'students.insert'),
  3, 'each admission wrote one students.insert audit row');
select is(
  (select after ->> 'phone' from public.audit_events
    where action = 'guardians.insert' and row_id = (select id from public.guardians where student_id = (select id from ids where label = 's1'))),
  '+8801*****678', 'the guardian''s phone is masked in the audit trail');
select is(
  (select count(distinct correlation_id)::int from public.audit_events
    where workspace_id = (select id from ids where label = 'a')
      and action in ('students.insert', 'student_private_details.insert', 'guardians.insert', 'enrollments.insert')
      and (row_id = (select id from ids where label = 's1')
           or (after ->> 'student_id')::uuid = (select id from ids where label = 's1'))),
  1, 'one correlation id covers every row of an admission');

select * from finish();
rollback;
