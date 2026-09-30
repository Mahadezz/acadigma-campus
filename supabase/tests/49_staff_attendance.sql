-- =====================================================================
-- pgTAP · F-AC-04 Part 1 (D-214) — staff_attendance and the self check-in
-- RPCs (staff_check_in / staff_check_out / staff_attendance_today).
--
-- Proves: isolation (another school, another staff member), escalation (a
-- parent, a removed member, anon, a direct INSERT/UPDATE/DELETE), the
-- idempotent second tap, the never-overwrite check-out, the non-school-day
-- refusal, the status rule's boundaries, and that the client cannot supply a
-- time (the functions take the workspace id and nothing else).
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
  perform set_config('role', 'postgres', true);
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

grant usage on schema tests to authenticated, anon;
grant execute on function tests.login(uuid), tests.logout() to authenticated, anon;

-- ---------------------------------------------------------------------
-- fixtures: School A (owner, admin, teacher, staff, parent, removed
-- teacher), School B (owner, teacher).
-- ---------------------------------------------------------------------
select tests.mkuser('49000000-0000-4000-a000-000000000001', 'owner.a@sta.test',   'Owner A');
select tests.mkuser('49000000-0000-4000-a000-000000000002', 'admin.a@sta.test',   'Admin A');
select tests.mkuser('49000000-0000-4000-a000-000000000003', 'teacher.a@sta.test', 'Teacher A');
select tests.mkuser('49000000-0000-4000-a000-000000000004', 'parent.a@sta.test',  'Parent A');
select tests.mkuser('49000000-0000-4000-a000-000000000005', 'staff.a@sta.test',   'Staff A');
select tests.mkuser('49000000-0000-4000-a000-000000000006', 'gone.a@sta.test',    'Removed A');
select tests.mkuser('49000000-0000-4000-a000-000000000009', 'owner.b@sta.test',   'Owner B');
select tests.mkuser('49000000-0000-4000-a000-00000000000a', 'teacher.b@sta.test', 'Teacher B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('49000000-0000-4000-b000-00000000000a', 'school', 'Staff Att School A', 'sta-school-a',
        '49000000-0000-4000-a000-000000000001', '49000000-0000-4000-a000-000000000001'),
       ('49000000-0000-4000-b000-00000000000b', 'school', 'Staff Att School B', 'sta-school-b',
        '49000000-0000-4000-a000-000000000009', '49000000-0000-4000-a000-000000000009');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('49000000-0000-4000-b000-00000000000a', '49000000-0000-4000-a000-000000000002', 'admin',   'active',  now()),
       ('49000000-0000-4000-b000-00000000000a', '49000000-0000-4000-a000-000000000003', 'teacher', 'active',  now()),
       ('49000000-0000-4000-b000-00000000000a', '49000000-0000-4000-a000-000000000004', 'parent',  'active',  now()),
       ('49000000-0000-4000-b000-00000000000a', '49000000-0000-4000-a000-000000000005', 'staff',   'active',  now()),
       ('49000000-0000-4000-b000-00000000000a', '49000000-0000-4000-a000-000000000006', 'teacher', 'removed', now()),
       ('49000000-0000-4000-b000-00000000000b', '49000000-0000-4000-a000-00000000000a', 'teacher', 'active',  now());

-- Today must be a school day in A whatever weekday CI runs on, and a closed
-- day in B (the NOT_SCHOOL_DAY case). Overrides beat the weekly pattern.
insert into public.working_day_overrides (workspace_id, date, is_working, reason)
values ('49000000-0000-4000-b000-00000000000a',
        app.school_today('49000000-0000-4000-b000-00000000000a'), true,  'pgTAP: force open'),
       ('49000000-0000-4000-b000-00000000000b',
        app.school_today('49000000-0000-4000-b000-00000000000b'), false, 'pgTAP: force closed');

-- =====================================================================
-- 1. The status rule, directly (a test run cannot move now()).
-- =====================================================================
select results_eq(
  $$select status::text, minutes_late from app.staff_check_in_status('07:30', '08:00', 10)$$,
  $$values ('present', null::int)$$,
  'before the on-time time: present, no minutes late');
select results_eq(
  $$select status::text, minutes_late from app.staff_check_in_status('08:10:59', '08:00', 10)$$,
  $$values ('present', null::int)$$,
  'inside the grace (10 min 59 s): still present');
select results_eq(
  $$select status::text, minutes_late from app.staff_check_in_status('08:11', '08:00', 10)$$,
  $$values ('late', 11)$$,
  'one minute past the grace: late, counted from the on-time time');
select results_eq(
  $$select status::text, minutes_late from app.staff_check_in_status('09:00', '08:00', 10)$$,
  $$values ('late', 60)$$,
  'an hour after: late by 60');

-- =====================================================================
-- 2. Shape of the boundary: no client-supplied time, no table writes.
-- =====================================================================
select is((select pronargs from pg_proc where oid = 'public.staff_check_in(uuid)'::regprocedure), 1::smallint,
  'staff_check_in takes the workspace id and nothing else (no client time)');
select is((select pronargs from pg_proc where oid = 'public.staff_check_out(uuid)'::regprocedure), 1::smallint,
  'staff_check_out takes the workspace id and nothing else');
select ok(not has_function_privilege('anon', 'public.staff_check_in(uuid)', 'execute'),
  'anon cannot execute staff_check_in');
select ok(has_function_privilege('authenticated', 'public.staff_check_in(uuid)', 'execute'),
  'authenticated can execute staff_check_in');
select ok(not has_table_privilege('authenticated', 'public.staff_attendance', 'insert')
      and not has_table_privilege('authenticated', 'public.staff_attendance', 'update')
      and not has_table_privilege('authenticated', 'public.staff_attendance', 'delete'),
  'authenticated holds no write grant on staff_attendance');

-- =====================================================================
-- 3. A teacher checks in: one row, the second tap changes nothing.
-- =====================================================================
select tests.login('49000000-0000-4000-a000-000000000003');
select lives_ok(
  $$select public.staff_check_in('49000000-0000-4000-b000-00000000000a')$$,
  'a teacher checks in');
select tests.logout();
select is((select count(*)::int from public.staff_attendance
            where workspace_id = '49000000-0000-4000-b000-00000000000a'
              and source = 'self'
              and status in ('present', 'late')
              and check_in_at is not null and check_out_at is null), 1,
  'one self row, present or late, no check-out yet');

select tests.login('49000000-0000-4000-a000-000000000003');
select lives_ok(
  $$select public.staff_check_in('49000000-0000-4000-b000-00000000000a')$$,
  'a second tap is not an error');
select tests.logout();
select is((select count(*)::int from public.staff_attendance
            where workspace_id = '49000000-0000-4000-b000-00000000000a'), 1,
  'the second tap created no second row');

-- check-out records the time and leaves the status alone
create temp table before_out on commit drop as
  select status, minutes_late from public.staff_attendance
   where workspace_id = '49000000-0000-4000-b000-00000000000a';
grant select on before_out to authenticated;

select tests.login('49000000-0000-4000-a000-000000000003');
select lives_ok(
  $$select public.staff_check_out('49000000-0000-4000-b000-00000000000a')$$,
  'the teacher checks out');
select tests.logout();
select is((select count(*)::int
             from public.staff_attendance a, before_out b
            where a.workspace_id = '49000000-0000-4000-b000-00000000000a'
              and a.check_out_at is not null
              and a.status = b.status
              and a.minutes_late is not distinct from b.minutes_late), 1,
  'check-out set check_out_at and overwrote no status');

create temp table first_out on commit drop as
  select check_out_at from public.staff_attendance
   where workspace_id = '49000000-0000-4000-b000-00000000000a';
select tests.login('49000000-0000-4000-a000-000000000003');
select public.staff_check_out('49000000-0000-4000-b000-00000000000a');
select tests.logout();
select is((select count(*)::int from public.staff_attendance a, first_out f
            where a.workspace_id = '49000000-0000-4000-b000-00000000000a'
              and a.check_out_at = f.check_out_at), 1,
  'a second check-out leaves the first check-out time standing');

-- =====================================================================
-- 4. Escalation and refusals.
-- =====================================================================
select tests.login('49000000-0000-4000-a000-000000000005');
select throws_ok(
  $$select public.staff_check_out('49000000-0000-4000-b000-00000000000a')$$,
  '22023', 'NOT_CHECKED_IN',
  'check-out before any check-in is refused');
select lives_ok(
  $$select public.staff_check_in('49000000-0000-4000-b000-00000000000a')$$,
  'office staff can check in');

select tests.login('49000000-0000-4000-a000-000000000004');
select throws_ok(
  $$select public.staff_check_in('49000000-0000-4000-b000-00000000000a')$$,
  '42501', 'FORBIDDEN',
  'a parent cannot check in');
select throws_ok(
  $$select public.staff_attendance_today('49000000-0000-4000-b000-00000000000a')$$,
  '42501', 'FORBIDDEN',
  'a parent cannot read the check-in state');

select tests.login('49000000-0000-4000-a000-000000000006');
select throws_ok(
  $$select public.staff_check_in('49000000-0000-4000-b000-00000000000a')$$,
  '42501', 'FORBIDDEN',
  'a removed member cannot check in');

select tests.login('49000000-0000-4000-a000-00000000000a');
select throws_ok(
  $$select public.staff_check_in('49000000-0000-4000-b000-00000000000a')$$,
  '42501', 'FORBIDDEN',
  'School B''s teacher cannot check in to School A');
select throws_ok(
  $$select public.staff_check_in('49000000-0000-4000-b000-00000000000b')$$,
  '22023', 'NOT_SCHOOL_DAY',
  'on a closed day the check-in is refused');


select tests.login('49000000-0000-4000-a000-000000000003');
select throws_ok(
  $$insert into public.staff_attendance (workspace_id, member_id, date, status)
    select workspace_id, id, current_date, 'present' from public.workspace_members
     where user_id = '49000000-0000-4000-a000-000000000003'$$,
  '42501', 'permission denied for table staff_attendance',
  'a direct INSERT is refused (time and status cannot be supplied)');
select throws_ok(
  $$update public.staff_attendance set status = 'present'$$,
  '42501', 'permission denied for table staff_attendance',
  'a direct UPDATE is refused');

-- =====================================================================
-- 5. Reads: own rows for a member, everything for owner/admin, nothing
--    across schools; the state RPC reports a school day with the record.
-- =====================================================================
select is((select count(*)::int from public.staff_attendance), 1,
  'a teacher reads only their own row (office staff''s row is hidden)');
select is((public.staff_attendance_today('49000000-0000-4000-b000-00000000000a') ->> 'is_school_day')::boolean, true,
  'the state RPC reports today as a school day');

select tests.login('49000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.staff_attendance), 2,
  'an admin reads every row in the school');

select tests.login('49000000-0000-4000-a000-000000000009');
select is((select count(*)::int from public.staff_attendance), 0,
  'School B''s owner reads none of School A''s rows');

select tests.logout();
update public.workspaces set access_mode = 'read_only'
 where id = '49000000-0000-4000-b000-00000000000a';
select tests.login('49000000-0000-4000-a000-000000000002');
select throws_ok(
  $select public.staff_check_in('49000000-0000-4000-b000-00000000000a')$,
  '42501', 'PLAN_READ_ONLY',
  'a read-only school refuses a check-in (app.tg_require_writable still fires)');
select tests.logout();
select is((select count(*)::int from public.audit_events
            where workspace_id = '49000000-0000-4000-b000-00000000000a'
              and action = 'staff_attendance.insert'), 2,
  'each check-in wrote an audit row from the trigger');

select * from finish();
rollback;
