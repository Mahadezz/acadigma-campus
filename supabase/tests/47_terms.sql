-- =====================================================================
-- pgTAP · F-OP-07 Part 2 — terms (20260929121051_academic_terms.sql, D-210)
--
-- Isolation, escalation, the composite (tenant-bound) foreign key, the
-- natural-key uniqueness, the range check, delete (allowed here, unlike
-- sections/subjects), read-only mode, created_by immutability, audit.
-- =====================================================================
begin;
select plan(23);

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

create or replace function tests.school_input(p_key uuid, p_patch jsonb default '{}')
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'name', 'Ideal School & College',
    'eiin', '108263',
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

select tests.mkuser('d2100000-0000-0000-0000-000000000001', 'd210.owner@test.local',   'Owner A');
select tests.mkuser('d2100000-0000-0000-0000-000000000002', 'd210.teacher@test.local', 'Teacher A');
select tests.mkuser('d2100000-0000-0000-0000-000000000003', 'd210.parent@test.local',  'Parent A');
select tests.mkuser('d2100000-0000-0000-0000-000000000005', 'd210.ownerb@test.local',  'Owner B');

create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

select tests.login('d2100000-0000-0000-0000-000000000001');
insert into ids select 'a', (public.create_school_workspace(
  tests.school_input('e2100000-0000-4000-8000-000000000001', '{"eiin": null, "name": "School A"}')) ->> 'workspace_id')::uuid;
select tests.logout();
select tests.login('d2100000-0000-0000-0000-000000000005');
insert into ids select 'b', (public.create_school_workspace(
  tests.school_input('e2100000-0000-4000-8000-000000000002', '{"eiin": null, "name": "School B"}')) ->> 'workspace_id')::uuid;
select tests.logout();

insert into public.workspace_members (workspace_id, user_id, role, status) values
  ((select id from ids where label = 'a'), 'd2100000-0000-0000-0000-000000000002', 'teacher', 'active'),
  ((select id from ids where label = 'a'), 'd2100000-0000-0000-0000-000000000003', 'parent',  'active');

insert into ids
select 'a_year', id from public.academic_years where workspace_id = (select id from ids where label = 'a')
union all
select 'b_year', id from public.academic_years where workspace_id = (select id from ids where label = 'b');

select tests.login('d2100000-0000-0000-0000-000000000001');
with new_year as (
  insert into public.academic_years (workspace_id, name, starts_on, ends_on, created_by)
  values ((select id from ids where label = 'a'), '2027', '2027-01-01', '2027-12-31',
          'd2100000-0000-0000-0000-000000000001')
  returning id
)
insert into ids select 'a_year2', id from new_year;
select tests.logout();

-- =====================================================================
-- Owner: create, natural key, range check
-- =====================================================================
select tests.login('d2100000-0000-0000-0000-000000000001');
select lives_ok(
  $$insert into public.terms (workspace_id, academic_year_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            '1st Term', '2026-01-01', '2026-04-30', 'd2100000-0000-0000-0000-000000000001')$$,
  'the owner creates the 1st Term');
select lives_ok(
  $$insert into public.terms (workspace_id, academic_year_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            '2nd Term', '2026-05-01', '2026-08-31', 'd2100000-0000-0000-0000-000000000001')$$,
  'the owner creates the 2nd Term');
select throws_ok(
  $$insert into public.terms (workspace_id, academic_year_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            '1st term', '2026-09-01', '2026-10-31', 'd2100000-0000-0000-0000-000000000001')$$,
  '23505', 'duplicate key value violates unique constraint "terms_year_name_key"',
  'term names are unique per year, ignoring case');
select throws_ok(
  $$insert into public.terms (workspace_id, academic_year_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            '3rd Term', '2026-10-31', '2026-09-01', 'd2100000-0000-0000-0000-000000000001')$$,
  '23514', 'new row for relation "terms" violates check constraint "terms_range_valid"',
  'a term cannot end before it starts');
select throws_ok(
  $$update public.terms set created_by = 'd2100000-0000-0000-0000-000000000005'
     where workspace_id = (select id from ids where label = 'a') and name = '1st Term'$$,
  '42501', 'created_by is immutable', 'created_by on a term cannot be rewritten');
select lives_ok(
  $$delete from public.terms where workspace_id = (select id from ids where label = 'a') and name = '2nd Term'$$,
  'the owner deletes a term (no downstream reference exists yet, D-210)');
select tests.logout();

-- =====================================================================
-- set_current_academic_year
-- =====================================================================
select tests.login('d2100000-0000-0000-0000-000000000001');
select lives_ok(
  $$select public.set_current_academic_year(
      (select id from ids where label = 'a'), (select id from ids where label = 'a_year2'))$$,
  'the owner moves is_current to the 2027 year');
select is(
  (select is_current from public.academic_years where id = (select id from ids where label = 'a_year')),
  false, 'the old current year is no longer current');
select is(
  (select is_current from public.academic_years where id = (select id from ids where label = 'a_year2')),
  true, 'the new year is current');
select throws_ok(
  $$select public.set_current_academic_year(
      (select id from ids where label = 'a'), gen_random_uuid())$$,
  'P0002', 'academic year not found', 'a non-existent academic year is refused');
select tests.logout();

select tests.login('d2100000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.set_current_academic_year(
      (select id from ids where label = 'a'), (select id from ids where label = 'a_year'))$$,
  '42501', 'only an owner or admin can change the current academic year',
  'escalation: a teacher cannot change the current academic year');
select tests.logout();

select tests.login('d2100000-0000-0000-0000-000000000005');
select throws_ok(
  $$select public.set_current_academic_year(
      (select id from ids where label = 'a'), (select id from ids where label = 'a_year'))$$,
  '42501', 'only an owner or admin can change the current academic year',
  'isolation: another school''s owner cannot change this school''s current academic year');
select tests.logout();

-- =====================================================================
-- Isolation
-- =====================================================================
select tests.login('d2100000-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.terms where workspace_id = (select id from ids where label = 'a')),
  0, 'isolation: another school''s owner sees none of this school''s terms');
select throws_ok(
  $$insert into public.terms (workspace_id, academic_year_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            'Intruder Term', '2026-01-01', '2026-02-01', 'd2100000-0000-0000-0000-000000000005')$$,
  '42501', 'new row violates row-level security policy for table "terms"',
  'isolation: another school''s owner cannot add a term here');
select throws_ok(
  $$insert into public.terms (workspace_id, academic_year_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'b'), (select id from ids where label = 'a_year'),
            'Cross Term', '2026-01-01', '2026-02-01', 'd2100000-0000-0000-0000-000000000005')$$,
  '23503', 'insert or update on table "terms" violates foreign key constraint "terms_academic_year_fkey"',
  'a term cannot reference another school''s academic year');
select tests.logout();

-- =====================================================================
-- Escalation
-- =====================================================================
select tests.login('d2100000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.terms where workspace_id = (select id from ids where label = 'a')),
  1, 'a teacher reads the school''s terms');
select throws_ok(
  $$insert into public.terms (workspace_id, academic_year_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            'Teacher Term', '2026-09-01', '2026-10-01', 'd2100000-0000-0000-0000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "terms"',
  'escalation: a teacher cannot add a term');
update public.terms set name = 'Hacked' where workspace_id = (select id from ids where label = 'a');
select tests.logout();
select is(
  (select count(*)::int from public.terms where name = 'Hacked'),
  0, 'escalation: a teacher''s update of a term touches no rows');

select tests.login('d2100000-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.terms where workspace_id = (select id from ids where label = 'a')),
  0, 'a parent member reads no terms (T2)');
select tests.logout();

-- =====================================================================
-- Read-only mode, anon, audit
-- =====================================================================
update public.workspaces set access_mode = 'read_only' where id = (select id from ids where label = 'a');
select tests.login('d2100000-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into public.terms (workspace_id, academic_year_id, name, starts_on, ends_on, created_by)
    values ((select id from ids where label = 'a'), (select id from ids where label = 'a_year'),
            'Read Only Term', '2026-09-01', '2026-10-01', 'd2100000-0000-0000-0000-000000000001')$$,
  '42501', 'PLAN_READ_ONLY', 'a read-only school cannot add a term');
select throws_ok(
  $$select public.set_current_academic_year(
      (select id from ids where label = 'a'), (select id from ids where label = 'a_year'))$$,
  '42501', 'PLAN_READ_ONLY',
  'a read-only school cannot change its current academic year (the RPC''s own UPDATEs still hit app.tg_require_writable)');
select tests.logout();

select ok(not has_table_privilege('anon', 'public.terms', 'select'),
  'anon has no privilege on terms');
select is(
  (select count(*)::int from public.audit_events
    where workspace_id = (select id from ids where label = 'a') and action = 'terms.insert'),
  2, 'each of the two surviving term inserts wrote a generic audit row');

select * from finish();
rollback;
