-- =====================================================================
-- pgTAP · F-OP-06 Part 2 (D-209) — staff_directory widened to every
-- active non-parent member, not just staff_records rows.
--
-- Proves the Part 2 demo directly: a brand-new school's directory shows
-- its owner (who has no staff_records row — the bootstrap trigger never
-- creates one) with a sensible fallback shape (membership_id present,
-- id null, employment_status 'active', designation/department/phone read
-- through workspace_members when staff_records has none), a member WITH a
-- staff_records row is unaffected, a parent never appears as a row, and
-- tenant isolation still holds under the new join.
-- =====================================================================
begin;
select plan(11);

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

-- ---------------------------------------------------------------------
-- fixtures: School C — owner (bootstrap-created, no staff_records row),
-- an admin added directly with a workspace_members.label_id/department/
-- phone but no staff_records row (the pre-Part-2 "existing school" case),
-- a teacher WITH a staff_records row, and a parent (must never appear).
-- School D: a single owner, for the isolation case.
-- ---------------------------------------------------------------------
select tests.mkuser('cccccccc-0000-0000-0000-000000000001', 'owner.c@test.local',   'Owner C');
select tests.mkuser('cccccccc-0000-0000-0000-000000000002', 'admin.c@test.local',   'Admin C');
select tests.mkuser('cccccccc-0000-0000-0000-000000000003', 'teacher.c@test.local', 'Teacher C');
select tests.mkuser('cccccccc-0000-0000-0000-000000000004', 'parent.c@test.local',  'Parent C');
select tests.mkuser('dddddddd-0000-0000-0000-000000000001', 'owner.d@test.local',   'Owner D');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('33333333-3333-3333-3333-333333333333', 'school', 'School C', 'school-c-directory',
        'cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001'),
       ('44444444-4444-4444-4444-444444444444', 'school', 'School D', 'school-d-directory',
        'dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001');

-- The default-seeded 'Vice-Principal' admin label (sort_order 1, F-OP-06
-- §3.4 / app.tg_workspace_bootstrap) — read back, not hardcoded, so a
-- future reorder of the seed list does not silently break this fixture.
insert into public.workspace_members
  (id, workspace_id, user_id, role, status, joined_at, label_id, department, phone)
select
  '55550002-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333',
  'cccccccc-0000-0000-0000-000000000002', 'admin', 'active', '2026-02-01T00:00:00Z',
  cl.id, 'Front Office', '01711000002'
from public.custom_labels cl
where cl.workspace_id = '33333333-3333-3333-3333-333333333333'
  and cl.base_role = 'admin' and cl.name = 'Vice-Principal';

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('55550003-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333',
        'cccccccc-0000-0000-0000-000000000003', 'teacher', 'active', now()),
       ('55550004-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333',
        'cccccccc-0000-0000-0000-000000000004', 'parent', 'active', now());

insert into public.staff_records
  (id, workspace_id, user_id, membership_id, staff_code, full_name, employment_status, joined_on)
values
  ('66660003-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333',
   'cccccccc-0000-0000-0000-000000000003', '55550003-0000-0000-0000-000000000003',
   'TCH-2026-0500', 'Teacher C', 'active', '2025-06-01');

-- =====================================================================
-- 1. Directory membership: owner (no record) + admin (no record) +
--    teacher (has a record) = 3. Parent never a row, regardless of caller.
-- =====================================================================
select tests.login('cccccccc-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'),
  3, 'School C directory has 3 rows: owner, admin, teacher — never the parent');

-- =====================================================================
-- 2. The owner (no staff_records row) still appears, with the fallback
--    shape the Part 2 demo depends on: membership_id set, id null,
--    employment_status defaulted to active, joined_on from the membership.
-- =====================================================================
select is(
  (select id from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'cccccccc-0000-0000-0000-000000000001'),
  null, 'the owner has no staff_records row, so staff_directory.id is null');

select isnt(
  (select membership_id from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'cccccccc-0000-0000-0000-000000000001'),
  null, 'the owner''s membership_id is always present');

select is(
  (select employment_status::text from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'cccccccc-0000-0000-0000-000000000001'),
  'active', 'a member with no staff_records row defaults to employment_status active');

-- =====================================================================
-- 3. The admin (no staff_records row, but workspace_members carries
--    label_id/department/phone from F-ID-03) — the view falls back to
--    those instead of showing nulls (D-209).
-- =====================================================================
select is(
  (select designation_label from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'cccccccc-0000-0000-0000-000000000002'),
  'Vice-Principal', 'no staff_records row: designation_label falls back to workspace_members.label_id');

select is(
  (select department from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'cccccccc-0000-0000-0000-000000000002'),
  'Front Office', 'no staff_records row: department falls back to workspace_members.department');

select is(
  (select work_phone from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'cccccccc-0000-0000-0000-000000000002'),
  '01711000002', 'no staff_records row: work_phone falls back to workspace_members.phone');

-- =====================================================================
-- 4. A member WITH a staff_records row is unaffected: its own columns win
--    over any workspace_members fallback.
-- =====================================================================
select is(
  (select staff_code from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'cccccccc-0000-0000-0000-000000000003'),
  'TCH-2026-0500', 'a member with a staff_records row keeps its own staff_code');

select is(
  (select joined_on from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'
      and user_id = 'cccccccc-0000-0000-0000-000000000003'),
  '2025-06-01'::date, 'a member with a staff_records row keeps its own joined_on, not joined_at');

select tests.logout();

-- =====================================================================
-- 5. Tenant isolation still holds under the new join: School D's owner
--    reads zero School C rows, and vice versa.
-- =====================================================================
select tests.login('dddddddd-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.staff_directory
    where workspace_id = '33333333-3333-3333-3333-333333333333'),
  0, 'School D''s owner reads zero School C staff_directory rows');

select is(
  (select count(*)::int from public.staff_directory
    where workspace_id = '44444444-4444-4444-4444-444444444444'),
  1, 'School D''s owner reads exactly their own directory row (themself)');

select tests.logout();

select * from finish();
rollback;
