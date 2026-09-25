-- =====================================================================
-- pgTAP · F-AC-11 Part 1 (D-202) — holidays, working_day_overrides and
-- app.is_school_day / app.school_days / app.school_day_count.
--
-- Proves: tenant isolation and role escalation on both tables (a teacher
-- can read but never declare a holiday or an override; a parent reads
-- nothing), the range/reason checks, workspace_id immutability, the
-- read-only guard, the audit row, and the §5.1 precedence table
-- (override > weekly pattern > holiday) including the Part 1 demo: a 3-day
-- holiday drops April's school-day count by exactly three.
--
-- April 2026: the 1st is a Wednesday; Fridays are the 3rd, 10th, 17th, 24th.
-- With the Sat-Thu default week, April has 30 - 4 = 26 school days.
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

-- Rows touched by a statement run as the current role (RLS-filtered
-- UPDATE/DELETE silently affect zero rows rather than raising).
create or replace function tests.affected(p_sql text)
returns integer language plpgsql as $fn$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$fn$;
grant usage on schema tests to authenticated;
grant execute on function tests.affected(text) to authenticated;

-- ---------------------------------------------------------------------
-- fixtures: School A (owner, admin, teacher, parent), School B (owner).
-- ---------------------------------------------------------------------
select tests.mkuser('41000000-0000-4000-a000-000000000001', 'owner.a@cal.test',   'Owner A');
select tests.mkuser('41000000-0000-4000-a000-000000000002', 'admin.a@cal.test',   'Admin A');
select tests.mkuser('41000000-0000-4000-a000-000000000003', 'teacher.a@cal.test', 'Teacher A');
select tests.mkuser('41000000-0000-4000-a000-000000000004', 'parent.a@cal.test',  'Parent A');
select tests.mkuser('41000000-0000-4000-a000-000000000009', 'owner.b@cal.test',   'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('41000000-0000-4000-b000-00000000000a', 'school', 'Calendar School A', 'cal-school-a',
        '41000000-0000-4000-a000-000000000001', '41000000-0000-4000-a000-000000000001'),
       ('41000000-0000-4000-b000-00000000000b', 'school', 'Calendar School B', 'cal-school-b',
        '41000000-0000-4000-a000-000000000009', '41000000-0000-4000-a000-000000000009');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('41000000-0000-4000-b000-00000000000a', '41000000-0000-4000-a000-000000000002', 'admin',   'active', now()),
       ('41000000-0000-4000-b000-00000000000a', '41000000-0000-4000-a000-000000000003', 'teacher', 'active', now()),
       ('41000000-0000-4000-b000-00000000000a', '41000000-0000-4000-a000-000000000004', 'parent',  'active', now());

-- =====================================================================
-- 1. The weekly pattern alone (no holidays, no overrides yet).
-- =====================================================================
select is(app.is_school_day('41000000-0000-4000-b000-00000000000a', '2026-04-03'), false,
  'Sat-Thu default: a Friday is not a school day');
select is(app.is_school_day('41000000-0000-4000-b000-00000000000a', '2026-04-01'), true,
  'Sat-Thu default: a Wednesday is a school day');
select is(app.is_school_day('41000000-0000-4000-b000-00000000000a', '2026-04-04'), true,
  'Sat-Thu default: a Saturday is a school day');
select is(app.school_day_count('41000000-0000-4000-b000-00000000000a', '2026-04-01', '2026-04-30'), 26,
  'April 2026 has 26 school days before any holiday');

-- School B runs Mon-Fri: the pattern is read from school_profiles, not hardcoded.
update public.school_profiles set working_days = '{1,2,3,4,5}'
 where workspace_id = '41000000-0000-4000-b000-00000000000b';
select is(app.is_school_day('41000000-0000-4000-b000-00000000000b', '2026-04-04'), false,
  'a Mon-Fri school: Saturday is not a school day');
select is(app.is_school_day('41000000-0000-4000-b000-00000000000b', '2026-04-03'), true,
  'a Mon-Fri school: Friday is a school day');

-- =====================================================================
-- 2. Escalation: a teacher reads but cannot declare; the admin can.
-- =====================================================================
select tests.login('41000000-0000-4000-a000-000000000003');
select throws_ok(
  $$insert into public.holidays (workspace_id, name, starts_on, ends_on)
    values ('41000000-0000-4000-b000-00000000000a', 'Teacher day off', '2026-04-20', '2026-04-20')$$,
  '42501', 'new row violates row-level security policy for table "holidays"',
  'a teacher cannot declare a holiday');
select throws_ok(
  $$insert into public.working_day_overrides (workspace_id, date, is_working, reason)
    values ('41000000-0000-4000-b000-00000000000a', '2026-04-10', true, 'make-up')$$,
  '42501', 'new row violates row-level security policy for table "working_day_overrides"',
  'a teacher cannot create a working-day override');

select tests.login('41000000-0000-4000-a000-000000000002');
select lives_ok(
  $$insert into public.holidays (id, workspace_id, name, kind, starts_on, ends_on)
    values ('41000000-0000-4000-c000-000000000001', '41000000-0000-4000-b000-00000000000a',
            'Pohela Boishakh break', 'national', '2026-04-13', '2026-04-15')$$,
  'an admin declares a 3-day holiday (13-15 April)');
select throws_ok(
  $$insert into public.holidays (workspace_id, name, starts_on, ends_on)
    values ('41000000-0000-4000-b000-00000000000a', 'Backwards', '2026-04-10', '2026-04-09')$$,
  '23514', 'new row for relation "holidays" violates check constraint "holidays_range_valid"',
  'a holiday cannot end before it starts');
select throws_ok(
  $$insert into public.working_day_overrides (workspace_id, date, is_working, reason)
    values ('41000000-0000-4000-b000-00000000000a', '2026-04-10', true, '   ')$$,
  '23514', 'new row for relation "working_day_overrides" violates check constraint "working_day_overrides_reason_check"',
  'an override without a reason is refused (AC13)');
select throws_ok(
  $$update public.holidays set workspace_id = '41000000-0000-4000-b000-00000000000b'
     where id = '41000000-0000-4000-c000-000000000001'$$,
  '42501', 'workspace_id is immutable',
  'a holiday cannot move to another workspace');

select tests.login('41000000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.holidays
            where workspace_id = '41000000-0000-4000-b000-00000000000a'), 1,
  'a teacher can read the school''s holidays');
select is(tests.affected($$delete from public.holidays
                            where id = '41000000-0000-4000-c000-000000000001'$$), 0,
  'a teacher''s DELETE of a holiday affects zero rows');

select tests.login('41000000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.holidays
            where workspace_id = '41000000-0000-4000-b000-00000000000a'), 0,
  'a parent has no direct read of holidays');

-- =====================================================================
-- 3. Isolation: School B's owner sees and touches nothing of School A.
-- =====================================================================
select tests.login('41000000-0000-4000-a000-000000000009');
select is((select count(*)::int from public.holidays
            where workspace_id = '41000000-0000-4000-b000-00000000000a'), 0,
  'School B cannot read School A''s holidays');
select is(tests.affected($$update public.holidays set name = 'hijacked'
                            where id = '41000000-0000-4000-c000-000000000001'$$), 0,
  'School B''s UPDATE of School A''s holiday affects zero rows');
select is(tests.affected($$delete from public.holidays
                            where id = '41000000-0000-4000-c000-000000000001'$$), 0,
  'School B''s DELETE of School A''s holiday affects zero rows');
select throws_ok(
  $$insert into public.holidays (workspace_id, name, starts_on, ends_on)
    values ('41000000-0000-4000-b000-00000000000a', 'Foreign', '2026-05-01', '2026-05-01')$$,
  '42501', 'new row violates row-level security policy for table "holidays"',
  'School B cannot insert a holiday into School A');

-- =====================================================================
-- 4. Precedence (§5.1), counted as postgres.
-- =====================================================================
select tests.logout();
select is(app.is_school_day('41000000-0000-4000-b000-00000000000a', '2026-04-14'), false,
  'a holiday closes a normal Tuesday');
select is(app.school_day_count('41000000-0000-4000-b000-00000000000a', '2026-04-01', '2026-04-30'), 23,
  'the 3-day holiday drops April from 26 to 23 school days (Part 1 demo)');

insert into public.working_day_overrides (workspace_id, date, is_working, reason)
values ('41000000-0000-4000-b000-00000000000a', '2026-04-10', true,  'Make-up day for the flood'),
       ('41000000-0000-4000-b000-00000000000a', '2026-04-14', true,  'Exam re-sit'),
       ('41000000-0000-4000-b000-00000000000a', '2026-04-20', false, 'Local strike');

select is(app.is_school_day('41000000-0000-4000-b000-00000000000a', '2026-04-10'), true,
  'an override opens a Friday (override beats the weekly pattern)');
select is(app.is_school_day('41000000-0000-4000-b000-00000000000a', '2026-04-14'), true,
  'an override opens a holiday date (override beats the holiday)');
select is(app.is_school_day('41000000-0000-4000-b000-00000000000a', '2026-04-20'), false,
  'an override closes a normal Monday');
select is(app.school_day_count('41000000-0000-4000-b000-00000000000a', '2026-04-01', '2026-04-30'), 24,
  'April = 23 + Friday opened + 14th reopened - 20th closed = 24');

-- A teacher (RLS-filtered) gets the same answer as postgres.
select tests.login('41000000-0000-4000-a000-000000000003');
select is(app.school_day_count('41000000-0000-4000-b000-00000000000a', '2026-04-01', '2026-04-30'), 24,
  'a teacher computes the same school-day count');
select tests.logout();

select throws_ok(
  $$select app.school_day_count('41000000-0000-4000-b000-00000000000a', '2026-04-30', '2026-04-01')$$,
  '22023', 'INVALID_RANGE',
  'a reversed range is refused');

select is(
  (select array_agg(d order by d) from app.school_days('41000000-0000-4000-b000-00000000000a', '2026-04-09', '2026-04-11')),
  array['2026-04-09', '2026-04-10', '2026-04-11']::date[],
  'school_days lists the dates themselves, override-opened Friday included');

-- =====================================================================
-- 5. Audit and the read-only guard.
-- =====================================================================
select ok(
  exists (select 1 from public.audit_events
           where workspace_id = '41000000-0000-4000-b000-00000000000a'
             and action = 'holidays.insert'
             and table_name = 'public.holidays'),
  'declaring a holiday writes a holidays.insert audit row');

select app.set_access_mode('41000000-0000-4000-b000-00000000000a', 'read_only', 'Your Pro trial has ended.');
select tests.login('41000000-0000-4000-a000-000000000002');
select throws_ok(
  $$insert into public.holidays (workspace_id, name, starts_on, ends_on)
    values ('41000000-0000-4000-b000-00000000000a', 'While read-only', '2026-05-01', '2026-05-01')$$,
  '42501', 'PLAN_READ_ONLY',
  'a read-only workspace refuses a new holiday');
select throws_ok(
  $$delete from public.working_day_overrides
     where workspace_id = '41000000-0000-4000-b000-00000000000a' and date = '2026-04-20'$$,
  '42501', 'PLAN_READ_ONLY',
  'a read-only workspace refuses removing an override');

select * from finish();
rollback;
