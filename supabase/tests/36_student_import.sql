-- =====================================================================
-- pgTAP · F-AC-02 §4.7 bulk student import, demo cut
-- (20260925300316_student_import_batches.sql, D-106)
--
-- student_import_batches: owner/admin only (isolation and escalation per
-- role), insert-only for the app, no direct update/delete, the report
-- redacted in the audit trail, read-only mode. public.import_student_batch:
-- admits valid rows through admit_student, records each outcome, refuses
-- nothing silently, chunks, is idempotent on a retry, and correlates every
-- audit row with the batch.
-- =====================================================================
begin;
select plan(41);

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

create or replace function tests.school_input(p_key uuid, p_name text)
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'name', p_name,
    'eiin', null,
    'board', 'dhaka',
    'medium', 'bangla',
    'timezone', 'Asia/Dhaka',
    'working_days', jsonb_build_array(6, 7, 1, 2, 3, 4),
    'academic_year', jsonb_build_object('name', '2026', 'starts_on', '2026-01-01', 'ends_on', '2026-12-31'),
    'grade_levels', jsonb_build_array(
      jsonb_build_object('name', 'Class 6', 'name_bn', 'ষষ্ঠ শ্রেণি', 'level_number', 6, 'stage', 'secondary')),
    'idempotency_key', p_key);
$fn$;

-- A valid report row; roll null means "next free".
create or replace function tests.valid_row(p_line int, p_first text, p_section uuid, p_roll int default null)
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'line', p_line, 'status', 'valid', 'errors', '[]'::jsonb,
    'input', jsonb_build_object(
      'first_name', p_first, 'last_name', 'Import', 'full_name_bn', null,
      'gender', 'male', 'date_of_birth', '2014-03-09', 'section_id', p_section,
      'roll_number', p_roll,
      'guardian', jsonb_build_object('relation', 'father', 'full_name', 'Karim Uddin',
                                     'full_name_bn', null, 'phone', '+8801000000001')));
$fn$;

create or replace function tests.error_row(p_line int)
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'line', p_line, 'status', 'error',
    'errors', jsonb_build_array(jsonb_build_object('column', 'date_of_birth', 'code', 'invalid_date')),
    'raw', jsonb_build_object('date_of_birth', '31/02/2014'));
$fn$;

create or replace function tests.new_batch(p_ws uuid, p_rows jsonb, p_user uuid)
returns uuid language sql as $fn$
  insert into public.student_import_batches
    (workspace_id, filename, total_rows, valid_rows, error_rows, report, created_by)
  select p_ws, 'register.xlsx', jsonb_array_length(p_rows),
         (select count(*) from jsonb_array_elements(p_rows) r where r ->> 'status' = 'valid'),
         (select count(*) from jsonb_array_elements(p_rows) r where r ->> 'status' = 'error'),
         jsonb_build_object('rows', p_rows, 'ignoredColumns', '[]'::jsonb), p_user
  returning id;
$fn$;

select tests.mkuser('f1060000-0000-0000-0000-000000000001', 'd106.owner@test.local',   'Owner A');
select tests.mkuser('f1060000-0000-0000-0000-000000000002', 'd106.teacher@test.local', 'Teacher A');
select tests.mkuser('f1060000-0000-0000-0000-000000000003', 'd106.staff@test.local',   'Staff A');
select tests.mkuser('f1060000-0000-0000-0000-000000000004', 'd106.admin@test.local',   'Admin A');
select tests.mkuser('f1060000-0000-0000-0000-000000000005', 'd106.ownerb@test.local',  'Owner B');

create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

select tests.login('f1060000-0000-0000-0000-000000000001');
insert into ids select 'a', (public.create_school_workspace(
  tests.school_input('a1060000-0000-4000-8000-000000000001', 'School A')) ->> 'workspace_id')::uuid;
select tests.logout();
select tests.login('f1060000-0000-0000-0000-000000000005');
insert into ids select 'b', (public.create_school_workspace(
  tests.school_input('a1060000-0000-4000-8000-000000000002', 'School B')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status) values
  ((select id from ids where label = 'a'), 'f1060000-0000-0000-0000-000000000002', 'teacher', 'active'),
  ((select id from ids where label = 'a'), 'f1060000-0000-0000-0000-000000000003', 'staff',   'active'),
  ((select id from ids where label = 'a'), 'f1060000-0000-0000-0000-000000000004', 'admin',   'active');

insert into public.sections (workspace_id, academic_year_id, grade_level_id, name)
select w.id, y.id, g.id, 'ক'
  from ids w
  join public.academic_years y on y.workspace_id = w.id
  join public.grade_levels g on g.workspace_id = w.id
 where w.label = 'a';
insert into ids select 'ka', id from public.sections where workspace_id = (select id from ids where label = 'a');

-- =====================================================================
-- The happy path: two valid rows (the second's roll is taken by the
-- first at import time), one error row
-- =====================================================================
select tests.login('f1060000-0000-0000-0000-000000000001');
insert into ids select 'batch1', tests.new_batch((select id from ids where label = 'a'),
  jsonb_build_array(
    tests.valid_row(2, 'Rahim', (select id from ids where label = 'ka'), 1),
    tests.error_row(3),
    tests.valid_row(4, 'Nusrat', (select id from ids where label = 'ka'), 1)),
  'f1060000-0000-0000-0000-000000000001');
select is((select status::text from public.student_import_batches where id = (select id from ids where label = 'batch1')),
  'preview', 'an owner stores a batch as a preview');
select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  0, 'a preview admits nobody');

create temp table r1 as
select public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch1')) as r;
select is((select r ->> 'status' from r1), 'completed', 'one call imports a small batch');
select is((select (r ->> 'created_count')::int from r1), 1, 'one row was admitted');
select is((select (r ->> 'remaining')::int from r1), 0, 'nothing is left');

select is(
  (select jsonb_agg(jsonb_build_object('line', e ->> 'line', 'status', e ->> 'status') order by (e ->> 'line')::int)
     from public.student_import_batches b, jsonb_array_elements(b.report -> 'rows') e
    where b.id = (select id from ids where label = 'batch1')),
  '[{"line": "2", "status": "created"}, {"line": "3", "status": "error"}, {"line": "4", "status": "failed"}]'::jsonb,
  'each row''s outcome is written back into the report');
select ok(
  (select e ->> 'student_code' from public.student_import_batches b, jsonb_array_elements(b.report -> 'rows') e
    where b.id = (select id from ids where label = 'batch1') and e ->> 'line' = '2') ~ '^STU-[0-9]{4}-00001$',
  'an admitted row carries its sequential student code');
select is(
  (select e -> 'errors' from public.student_import_batches b, jsonb_array_elements(b.report -> 'rows') e
    where b.id = (select id from ids where label = 'batch1') and e ->> 'line' = '4'),
  '[{"code": "ROLL_TAKEN", "column": null}]'::jsonb,
  'a row the database refuses is reported with admit_student''s named error, not dropped');
select is(
  (select (created_count, finished_at is not null)::text from public.student_import_batches
    where id = (select id from ids where label = 'batch1')),
  '(1,t)', 'the batch records its count and finish time');

-- A retry (double tap, reload) changes nothing.
select is(
  (public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch1')) ->> 'created_count')::int,
  1, 'importing a completed batch again is a no-op');
select tests.logout();

select is((select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  1, 'exactly one student exists after two calls');
select is(
  (select count(*)::int from public.students st
     join public.guardians g on g.student_id = st.id and g.is_primary
     join public.enrollments e on e.student_id = st.id and e.status = 'active' and e.roll_number = 1
    where st.workspace_id = (select id from ids where label = 'a')),
  1, 'the imported student has a primary guardian and an active enrolment, like a quick admission');
select is(
  (select count(*)::int from public.audit_events
    where action = 'students.insert' and correlation_id = (select id from ids where label = 'batch1')),
  1, 'the student''s audit row carries the batch id as its correlation id');
select is(
  (select after -> 'report' from public.audit_events
    where action = 'student_import_batches.insert' and row_id = (select id from ids where label = 'batch1')),
  'null'::jsonb, 'the report (dates of birth, phones) never reaches the audit trail');
select ok(
  (select 'report' = any (changed_fields) from public.audit_events
    where action = 'student_import_batches.update' and row_id = (select id from ids where label = 'batch1')
    limit 1),
  'the audit row still names the report as changed');

-- The per-row key is admit_student's own idempotency: replaying row 2's
-- admission with its derived key returns the same student.
select tests.login('f1060000-0000-0000-0000-000000000001');
select is(
  (public.admit_student((select id from ids where label = 'a'),
     (tests.valid_row(2, 'Rahim', (select id from ids where label = 'ka'), 1) -> 'input')
     || jsonb_build_object('idempotency_key',
          md5((select id from ids where label = 'batch1')::text || ':2')::uuid)) ->> 'replayed')::boolean,
  true, 'each row is admitted under a key derived from (batch, line)');

-- =====================================================================
-- Chunks: three valid rows, two per call
-- =====================================================================
insert into ids select 'batch2', tests.new_batch((select id from ids where label = 'a'),
  jsonb_build_array(
    tests.valid_row(2, 'Tanvir', (select id from ids where label = 'ka')),
    tests.valid_row(3, 'Arif',   (select id from ids where label = 'ka')),
    tests.valid_row(4, 'Sakib',  (select id from ids where label = 'ka'))),
  'f1060000-0000-0000-0000-000000000001');
select is(
  public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch2'), 2)
    - 'created_count',
  '{"status": "importing", "remaining": 1}'::jsonb, 'a chunk admits p_limit rows and says how many are left');
select is(
  public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch2'), 2),
  '{"status": "completed", "remaining": 0, "created_count": 3}'::jsonb, 'the next call finishes the batch');
select throws_ok(
  $$select public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch2'), 0)$$,
  '22023', 'VALIDATION', 'a chunk size outside 1..500 is refused');

-- =====================================================================
-- The table is insert-only for the app
-- =====================================================================
select throws_ok(
  $$update public.student_import_batches set status = 'completed' where id = (select id from ids where label = 'batch1')$$,
  '42501', 'permission denied for table student_import_batches',
  'even an owner cannot edit a batch directly');
select throws_ok(
  $$delete from public.student_import_batches where id = (select id from ids where label = 'batch1')$$,
  '42501', 'permission denied for table student_import_batches',
  'even an owner cannot delete a batch');
select throws_ok(
  $$insert into public.student_import_batches (workspace_id, filename, status, total_rows, valid_rows, error_rows, report, created_by)
    values ((select id from ids where label = 'a'), 'x.csv', 'completed', 0, 0, 0, '{"rows": []}',
            'f1060000-0000-0000-0000-000000000001')$$,
  '42501', 'new row violates row-level security policy for table "student_import_batches"',
  'a batch cannot be inserted as already completed');
select throws_ok(
  $$insert into public.student_import_batches (workspace_id, filename, total_rows, valid_rows, error_rows, report, created_by)
    values ((select id from ids where label = 'a'), 'x.csv', 2, 2, 0, '{"rows": []}',
            'f1060000-0000-0000-0000-000000000001')$$,
  '23514', 'new row for relation "student_import_batches" violates check constraint "student_import_batches_report_check"',
  'the report must have exactly total_rows rows');
select throws_ok(
  $$insert into public.student_import_batches (workspace_id, filename, total_rows, valid_rows, error_rows, report, created_by)
    values ((select id from ids where label = 'a'), 'x.csv', 0, 0, 0, '{"rows": []}',
            'f1060000-0000-0000-0000-000000000004')$$,
  '42501', 'new row violates row-level security policy for table "student_import_batches"',
  'a batch is created in the caller''s own name');
select tests.logout();

-- An admin may import too.
select tests.login('f1060000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.student_import_batches where workspace_id = (select id from ids where label = 'a')),
  2, 'an admin reads the school''s imports');
select lives_ok(
  $$select tests.new_batch((select id from ids where label = 'a'), '[]'::jsonb, 'f1060000-0000-0000-0000-000000000004')$$,
  'an admin can store a batch');
select tests.logout();

-- =====================================================================
-- Escalation: teacher and staff
-- =====================================================================
select tests.login('f1060000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.student_import_batches), 0, 'escalation: a teacher reads no import');
select throws_ok(
  $$select tests.new_batch((select id from ids where label = 'a'), '[]'::jsonb, 'f1060000-0000-0000-0000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "student_import_batches"',
  'escalation: a teacher cannot store a batch');
select throws_ok(
  $$select public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch2'))$$,
  '42501', 'FORBIDDEN', 'escalation: a teacher cannot run an import');
select tests.logout();

select tests.login('f1060000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.student_import_batches), 0, 'escalation: staff read no import');
select throws_ok(
  $$select public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch2'))$$,
  '42501', 'FORBIDDEN', 'escalation: staff cannot run an import');
select tests.logout();

-- =====================================================================
-- Isolation: another school's owner
-- =====================================================================
select tests.login('f1060000-0000-0000-0000-000000000005');
select is((select count(*)::int from public.student_import_batches where workspace_id = (select id from ids where label = 'a')),
  0, 'isolation: another school''s owner reads no import of this school');
select throws_ok(
  $$select public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch2'))$$,
  '42501', 'FORBIDDEN', 'isolation: nor runs one here');
select throws_ok(
  $$select public.import_student_batch((select id from ids where label = 'b'), (select id from ids where label = 'batch2'))$$,
  '22023', 'BATCH_NOT_FOUND', 'isolation: nor reaches this school''s batch from their own school');
select throws_ok(
  $$select tests.new_batch((select id from ids where label = 'a'), '[]'::jsonb, 'f1060000-0000-0000-0000-000000000005')$$,
  '42501', 'new row violates row-level security policy for table "student_import_batches"',
  'isolation: nor stores a batch in this school');
select tests.logout();

-- =====================================================================
-- Expiry, read-only, anon
-- =====================================================================
select tests.login('f1060000-0000-0000-0000-000000000001');
insert into ids select 'batch3', tests.new_batch((select id from ids where label = 'a'),
  jsonb_build_array(tests.valid_row(2, 'Fahim', (select id from ids where label = 'ka'))),
  'f1060000-0000-0000-0000-000000000001');
select tests.logout();
update public.student_import_batches set created_at = now() - interval '25 hours'
 where id = (select id from ids where label = 'batch3');
select tests.login('f1060000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch3'))$$,
  '22023', 'BATCH_EXPIRED', 'a preview older than a day must be uploaded again');
select tests.logout();

update public.student_import_batches set created_at = now()
 where id = (select id from ids where label = 'batch3');
update public.workspaces set access_mode = 'read_only' where id = (select id from ids where label = 'a');
select tests.login('f1060000-0000-0000-0000-000000000001');
select throws_ok(
  $$select tests.new_batch((select id from ids where label = 'a'), '[]'::jsonb, 'f1060000-0000-0000-0000-000000000001')$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot store a batch');
select throws_ok(
  $$select public.import_student_batch((select id from ids where label = 'a'), (select id from ids where label = 'batch3'))$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot import');
select tests.logout();
select is((select count(*)::int from public.students where first_name = 'Fahim'),
  0, 'and the refused import admitted nobody');

select ok(not has_table_privilege('anon', 'public.student_import_batches', 'select')
          and not has_table_privilege('anon', 'public.student_import_batches', 'insert'),
  'anon has no privilege on student_import_batches');
select ok(not has_function_privilege('anon', 'public.import_student_batch(uuid, uuid, integer)', 'execute'),
  'anon cannot call import_student_batch');

select * from finish();
rollback;
