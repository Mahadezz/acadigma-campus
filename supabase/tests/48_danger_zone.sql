-- =====================================================================
-- pgTAP · F-OP-07 Part 6 (D-211) — the danger zone
-- (20260929213326_danger_zone.sql).
--
-- Proves, in the database and not the UI:
--   * every action is owner-only (an admin, a teacher and another school's
--     owner are refused), including plain UPDATEs of the new columns;
--   * the typed school name is checked server-side (NAME_MISMATCH);
--   * a paid subscription / unpaid balance blocks archive and deletion;
--   * an archived school refuses every write, keeps its data, and the
--     owner (only) can still switch into it and unarchive within 12 months;
--   * a scheduled deletion destroys nothing before its date, is cancellable
--     until then, and only service_role can purge;
--   * the purge removes every row of that school from every tenant table,
--     leaves the other school untouched, writes no row-by-row copy of the
--     school into audit_events, and writes one platform-level record;
--   * the export reads only through the caller's RLS, owner only, 3 a day.
-- =====================================================================
begin;
select plan(56);

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

-- Rows of one school in every tenant table (the export's own table list),
-- except the FK-free evidence tables that outlive a school by design.
create or replace function tests.rows_by_table(p_ws uuid)
returns table (table_name text, n bigint) language plpgsql as $fn$
declare
  t text;
begin
  for t in select * from public.workspace_export_tables()
            where workspace_export_tables not in
                  ('audit_events', 'file_access_log', 'consent_records', 'legal_acceptances')
  loop
    table_name := t;
    execute format('select count(*) from public.%I where %I = $1', t,
                   case when t = 'workspaces' then 'id' else 'workspace_id' end)
      into n using p_ws;
    return next;
  end loop;
end;
$fn$;

-- Owner A, admin A, teacher A, owner B.
select tests.mkuser('f2110000-0000-0000-0000-000000000001', 'd211.ownera@test.local',   'Owner A');
select tests.mkuser('f2110000-0000-0000-0000-000000000002', 'd211.admina@test.local',   'Admin A');
select tests.mkuser('f2110000-0000-0000-0000-000000000003', 'd211.teachera@test.local', 'Teacher A');
select tests.mkuser('f2110000-0000-0000-0000-000000000004', 'd211.ownerb@test.local',   'Owner B');

create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

select tests.login('f2110000-0000-0000-0000-000000000001');
insert into ids select 'a', (public.create_school_workspace(
  tests.school_input('a2110000-0000-4000-8000-000000000001', 'Danger  School A'), '2026-09-30-interim') ->> 'workspace_id')::uuid;
select tests.logout();
select tests.login('f2110000-0000-0000-0000-000000000004');
insert into ids select 'b', (public.create_school_workspace(
  tests.school_input('a2110000-0000-4000-8000-000000000002', 'Danger School B'), '2026-09-30-interim') ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status) values
  ((select id from ids where label = 'a'), 'f2110000-0000-0000-0000-000000000002', 'admin',   'active'),
  ((select id from ids where label = 'a'), 'f2110000-0000-0000-0000-000000000003', 'teacher', 'active');

-- Fill School A across many tables so the purge's cascade is exercised for
-- real: a section, a student (with private details, guardian, enrolment), a
-- grade scale, a label, a notification, a message.
insert into public.sections (workspace_id, academic_year_id, grade_level_id, name)
select (select id from ids where label = 'a'), y.id, g.id, 'ক'
  from public.academic_years y, public.grade_levels g
 where y.workspace_id = (select id from ids where label = 'a')
   and g.workspace_id = (select id from ids where label = 'a');
insert into ids select 'a_ka', id from public.sections where workspace_id = (select id from ids where label = 'a');

select tests.login('f2110000-0000-0000-0000-000000000001');
select public.seed_bd_grade_scale((select id from ids where label = 'a'));
select public.admit_student((select id from ids where label = 'a'), jsonb_build_object(
  'idempotency_key', 'b2110000-0000-4000-8000-000000000001',
  'first_name', 'Rahim', 'last_name', 'Uddin', 'full_name_bn', 'রহিম উদ্দিন', 'gender', 'male',
  'date_of_birth', '2014-03-09', 'section_id', (select id from ids where label = 'a_ka'),
  'guardian', jsonb_build_object('relation', 'father', 'full_name', 'Karim Uddin', 'phone', '+8801712345678')));
select tests.logout();

insert into public.custom_labels (workspace_id, base_role, name, created_by)
values ((select id from ids where label = 'a'), 'teacher', 'Head of Maths', 'f2110000-0000-0000-0000-000000000001');

-- School B's footprint, to prove the purge never touches it.
create temp table b_before as select * from tests.rows_by_table((select id from ids where label = 'b'));

-- =====================================================================
-- 1. Owner-only, in the database
-- =====================================================================
select tests.login('f2110000-0000-0000-0000-000000000002');   -- admin A
select throws_ok($$select public.archive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  '42501', 'FORBIDDEN', 'an admin cannot archive the school');
select throws_ok($$select public.schedule_workspace_deletion((select id from ids where label = 'a'), 'Danger School A')$$,
  '42501', 'FORBIDDEN', 'an admin cannot schedule its deletion');
select throws_ok($$select public.cancel_workspace_deletion((select id from ids where label = 'a'))$$,
  '42501', 'FORBIDDEN', 'an admin cannot cancel a deletion');
select throws_ok($$select public.unarchive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  '42501', 'FORBIDDEN', 'an admin cannot unarchive');
select throws_ok($$select public.log_workspace_export((select id from ids where label = 'a'))$$,
  '42501', 'FORBIDDEN', 'an admin cannot export all data');
select throws_ok($$select public.export_workspace_table((select id from ids where label = 'a'), 'students')$$,
  '42501', 'FORBIDDEN', 'an admin cannot read a table through the export');
select throws_ok($$update public.workspaces set deletion_scheduled_at = now()
                    where id = (select id from ids where label = 'a')$$,
  '42501', null, 'an admin cannot set deletion_scheduled_at with a plain UPDATE');
select throws_ok($$update public.workspaces set status = 'archived'
                    where id = (select id from ids where label = 'a')$$,
  '42501', null, 'an admin cannot archive with a plain UPDATE');
select tests.logout();

select tests.login('f2110000-0000-0000-0000-000000000003');   -- teacher A
select throws_ok($$select public.schedule_workspace_deletion((select id from ids where label = 'a'), 'Danger School A')$$,
  '42501', 'FORBIDDEN', 'a teacher cannot schedule the deletion');
select tests.logout();

select tests.login('f2110000-0000-0000-0000-000000000004');   -- owner B
select throws_ok($$select public.schedule_workspace_deletion((select id from ids where label = 'a'), 'Danger School A')$$,
  '42501', 'FORBIDDEN', 'another school''s owner cannot schedule this school''s deletion');
select throws_ok($$select public.archive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  '42501', 'FORBIDDEN', 'another school''s owner cannot archive it');
select throws_ok($$select public.export_workspace_table((select id from ids where label = 'a'), 'students')$$,
  '42501', 'FORBIDDEN', 'another school''s owner cannot export it');
select tests.logout();

select tests.login('f2110000-0000-0000-0000-000000000001');   -- owner A
select throws_ok($$update public.workspaces set deletion_scheduled_at = now()
                    where id = (select id from ids where label = 'a')$$,
  '42501', null, 'even the owner cannot set deletion_scheduled_at with a plain UPDATE');
select throws_ok($$update public.workspaces set archived_at = now()
                    where id = (select id from ids where label = 'a')$$,
  '42501', null, 'even the owner cannot set archived_at with a plain UPDATE');
select throws_ok($$select public.purge_due_workspace((select id from ids where label = 'a'))$$,
  '42501', null, 'authenticated cannot execute the purge at all');

-- =====================================================================
-- 2. The typed name, and the billing blockers
-- =====================================================================
select throws_ok($$select public.schedule_workspace_deletion((select id from ids where label = 'a'), 'Danger School')$$,
  '22023', 'NAME_MISMATCH', 'a wrong name is refused');
select throws_ok($$select public.archive_workspace((select id from ids where label = 'a'), '')$$,
  '22023', 'NAME_MISMATCH', 'an empty name is refused');
select tests.logout();

update public.subscriptions set status = 'active'
 where workspace_id = (select id from ids where label = 'a');
select tests.login('f2110000-0000-0000-0000-000000000001');
select throws_ok($$select public.schedule_workspace_deletion((select id from ids where label = 'a'), 'Danger School A')$$,
  '55000', 'ACTIVE_SUBSCRIPTION', 'deletion is refused while a paid subscription is active');
select throws_ok($$select public.archive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  '55000', 'ACTIVE_SUBSCRIPTION', 'archiving is refused while a paid subscription is active');
select tests.logout();
update public.subscriptions set status = 'past_due'
 where workspace_id = (select id from ids where label = 'a');
select tests.login('f2110000-0000-0000-0000-000000000001');
select throws_ok($$select public.schedule_workspace_deletion((select id from ids where label = 'a'), 'Danger School A')$$,
  '55000', 'UNPAID_BALANCE', 'deletion is refused while a balance is unpaid');
select tests.logout();
update public.subscriptions set status = 'trialing'
 where workspace_id = (select id from ids where label = 'a');

-- =====================================================================
-- 3. Schedule, nothing destroyed, cancel
-- =====================================================================
-- A read-only (lapsed trial) school may still schedule its own deletion.
update public.workspaces set access_mode = 'read_only', access_mode_reason = 'Trial ended'
 where id = (select id from ids where label = 'a');
select tests.login('f2110000-0000-0000-0000-000000000001');
select lives_ok($$select public.schedule_workspace_deletion((select id from ids where label = 'a'), '  danger school a ')$$,
  'the owner schedules deletion (name matched ignoring case and spacing), even on a read-only plan');
select throws_ok($$select public.schedule_workspace_deletion((select id from ids where label = 'a'), 'Danger School A')$$,
  '55000', 'ALREADY_SCHEDULED', 'a second schedule is refused');
select tests.logout();
update public.workspaces set access_mode = 'normal', access_mode_reason = null
 where id = (select id from ids where label = 'a');

select ok(
  (select deletion_scheduled_at between now() + interval '30 days' - interval '1 minute'
                                    and now() + interval '30 days' + interval '1 minute'
     from public.workspaces where id = (select id from ids where label = 'a')),
  'the deletion is scheduled 30 days out');
select is(
  (select count(*)::int from public.audit_events
    where workspace_id = (select id from ids where label = 'a') and action = 'workspace.deletion_scheduled'),
  1, 'scheduling is audited');

select throws_ok($$select public.purge_due_workspace((select id from ids where label = 'a'))$$,
  '55000', 'NOT_DUE', 'the purge refuses a school whose grace has not ended');
select is(
  (select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  1, 'nothing is destroyed before the date');

select tests.login('f2110000-0000-0000-0000-000000000001');
select lives_ok($$select public.cancel_workspace_deletion((select id from ids where label = 'a'))$$,
  'the owner cancels the deletion');
select throws_ok($$select public.cancel_workspace_deletion((select id from ids where label = 'a'))$$,
  '55000', 'NOT_SCHEDULED', 'cancelling twice is refused');
select tests.logout();
select is(
  (select deletion_scheduled_at from public.workspaces where id = (select id from ids where label = 'a')),
  null::timestamptz, 'the schedule is cleared');

-- =====================================================================
-- 4. Archive: read-only, owner-only way back, 12-month window
-- =====================================================================
select tests.login('f2110000-0000-0000-0000-000000000001');
select lives_ok($$select public.archive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  'the owner archives the school');
select throws_ok($$select public.archive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  '55000', 'ALREADY_ARCHIVED', 'archiving twice is refused');
select throws_ok($$insert into public.custom_labels (workspace_id, base_role, name, created_by)
                    values ((select id from ids where label = 'a'), 'teacher', 'Exam Controller',
                            'f2110000-0000-0000-0000-000000000001')$$,
  '42501', 'PLAN_READ_ONLY', 'an archived school refuses writes, even the owner''s');
select is(
  (select count(*)::int from public.students where workspace_id = (select id from ids where label = 'a')),
  1, 'an archived school''s data is intact and readable');
select lives_ok($$select * from public.switch_workspace((select id from ids where label = 'a'))$$,
  'the owner can still switch into the archived school');
select tests.logout();

select tests.login('f2110000-0000-0000-0000-000000000003');
select throws_ok($$select * from public.switch_workspace((select id from ids where label = 'a'))$$,
  '42501', 'WORKSPACE_UNAVAILABLE', 'a teacher cannot switch into an archived school');
select tests.logout();

update public.workspaces set archived_at = now() - interval '13 months'
 where id = (select id from ids where label = 'a');
select tests.login('f2110000-0000-0000-0000-000000000001');
select throws_ok($$select public.unarchive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  '55000', 'ARCHIVE_EXPIRED', 'an archive older than 12 months cannot be restored by the owner');
select tests.logout();
update public.workspaces set archived_at = now() - interval '11 months'
 where id = (select id from ids where label = 'a');
select tests.login('f2110000-0000-0000-0000-000000000001');
select lives_ok($$select public.unarchive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  'the owner unarchives within 12 months');
select lives_ok($$insert into public.custom_labels (workspace_id, base_role, name, created_by)
                    values ((select id from ids where label = 'a'), 'teacher', 'Exam Controller',
                            'f2110000-0000-0000-0000-000000000001')$$,
  'writes work again after unarchiving');
select throws_ok($$select public.unarchive_workspace((select id from ids where label = 'a'), 'Danger School A')$$,
  '55000', 'NOT_ARCHIVED', 'unarchiving an active school is refused');
select tests.logout();

-- =====================================================================
-- 5. Export: the caller's own RLS, owner only, three a day
-- =====================================================================
select tests.login('f2110000-0000-0000-0000-000000000001');
select throws_ok($$select public.export_workspace_table((select id from ids where label = 'a'), 'students')$$,
  '42501', 'EXPORT_NOT_STARTED', 'no table is readable through the export before an audited export is opened');
select lives_ok($$select public.log_workspace_export((select id from ids where label = 'a'))$$,
  'the owner opens an export (audited)');
select is(
  jsonb_array_length(public.export_workspace_table((select id from ids where label = 'a'), 'students')),
  1, 'the owner exports the school''s students');
select is(
  (public.export_workspace_table((select id from ids where label = 'a'), 'workspaces') -> 0 ->> 'id')::uuid,
  (select id from ids where label = 'a'), 'the workspace row itself is exported');
select throws_ok($$select public.export_workspace_table((select id from ids where label = 'a'), 'pg_authid')$$,
  '22023', 'VALIDATION', 'only a tenant table can be exported');
select lives_ok($$select public.log_workspace_export((select id from ids where label = 'a'))
                    from generate_series(1, 2)$$,
  'three exports in a day are allowed');
select throws_ok($$select public.log_workspace_export((select id from ids where label = 'a'))$$,
  '54000', 'RATE_LIMITED', 'a fourth export in 24 hours is refused');
select tests.logout();

-- =====================================================================
-- 6. The purge
-- =====================================================================
select tests.login('f2110000-0000-0000-0000-000000000001');
select public.schedule_workspace_deletion((select id from ids where label = 'a'), 'Danger School A');
select tests.logout();
-- The grace period ends (as postgres: a privileged context may set it).
update public.workspaces set deletion_scheduled_at = now() - interval '1 second'
 where id = (select id from ids where label = 'a');

select tests.login('f2110000-0000-0000-0000-000000000001');
select throws_ok($$select public.cancel_workspace_deletion((select id from ids where label = 'a'))$$,
  '55000', 'DELETION_DUE', 'a deletion whose date has passed can no longer be cancelled');
select tests.logout();

-- A suspended school (platform hold) is not deleted: its owner cannot cancel.
update public.workspaces set status = 'suspended'
 where id = (select id from ids where label = 'a');
select throws_ok($$select public.purge_due_workspace((select id from ids where label = 'a'))$$,
  '55000', 'SUSPENDED', 'the purge refuses a suspended school');
update public.workspaces set status = 'active'
 where id = (select id from ids where label = 'a');

-- A school that started paying during its grace is not deleted.
update public.subscriptions set status = 'active'
 where workspace_id = (select id from ids where label = 'a');
select throws_ok($$select public.purge_due_workspace((select id from ids where label = 'a'))$$,
  '55000', 'ACTIVE_SUBSCRIPTION', 'the purge refuses a school with a paid subscription');
update public.subscriptions set status = 'trialing'
 where workspace_id = (select id from ids where label = 'a');

create temp table audit_before as
select count(*)::int as n from public.audit_events where workspace_id = (select id from ids where label = 'a');

select lives_ok($$select public.purge_due_workspace((select id from ids where label = 'a'))$$,
  'the privileged purge deletes a school whose grace has ended');

select is(
  (select coalesce(array_agg(table_name order by table_name), '{}')
     from tests.rows_by_table((select id from ids where label = 'a')) where n > 0),
  '{}'::text[], 'no tenant table keeps a single row of the deleted school');
select is(
  (select count(*)::int from public.audit_events where workspace_id = (select id from ids where label = 'a')),
  (select n from audit_before),
  'the cascade wrote no row-by-row copy of the school into audit_events');
select is(
  (select count(*)::int from public.audit_events
    where action = 'workspace.deleted' and workspace_id is null
      and row_id = (select id from ids where label = 'a')),
  1, 'one platform-level audit record names the deleted school');
select set_eq(
  $$select * from tests.rows_by_table((select id from ids where label = 'b'))$$,
  $$select * from b_before$$,
  'the other school is untouched, table by table');
select is(
  (select count(*)::int from public.profiles
    where id in ('f2110000-0000-0000-0000-000000000001', 'f2110000-0000-0000-0000-000000000002',
                 'f2110000-0000-0000-0000-000000000003')),
  3, 'the people keep their accounts');
select is(
  (select count(*)::int from public.workspace_members
    where user_id = 'f2110000-0000-0000-0000-000000000004'
      and workspace_id = (select id from ids where label = 'b')),
  1, 'owner B keeps their own membership');

select * from finish();
rollback;
