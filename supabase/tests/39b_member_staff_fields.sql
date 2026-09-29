-- =====================================================================
-- pgTAP · F-ID-03 Part 6 — role changes, staff fields, labels
--   (20260929065654_member_staff_fields.sql, D-111)
--
--   A. public.update_member_staff_fields: an owner/admin sets a member's
--      employee code, department and work phone; a blank code is generated
--      from app.next_id only when the member has none; a duplicate code is
--      unique_violation; a parent id is MEMBER_NOT_FOUND.
--   B. Auth on the RPC: a teacher, another school's owner and anon are all
--      refused; a read-only plan refuses the write.
--   C. Role change and label assignment are plain UPDATEs: an admin re-roles
--      a teacher but cannot mint an owner; an owner assigns a label without
--      touching the role; a teacher cannot assign a label to someone else.
-- =====================================================================
begin;
select plan(20);

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

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner O (auto-membership), admin AD,
-- teacher T (the target), teacher T2, parent PA. School B: owner OB.
-- ---------------------------------------------------------------------
select tests.mkuser('39b00000-0000-4000-a000-000000000001', 'sf-owner@test.local', 'Owner Olive');
select tests.mkuser('39b00000-0000-4000-a000-000000000002', 'sf-admin@test.local', 'Admin Adil');
select tests.mkuser('39b00000-0000-4000-a000-000000000003', 'sf-teacher@test.local', 'Teacher Tania');
select tests.mkuser('39b00000-0000-4000-a000-000000000004', 'sf-teacher2@test.local', 'Teacher Two');
select tests.mkuser('39b00000-0000-4000-a000-000000000005', 'sf-parent@test.local', 'Parent Parvin');
select tests.mkuser('39b00000-0000-4000-a000-000000000006', 'sf-ownerb@test.local', 'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('39b00000-0000-4000-b000-000000000001', 'school', 'Staff School', 'staff-school-39b',
   '39b00000-0000-4000-a000-000000000001', '39b00000-0000-4000-a000-000000000001', 'active'),
  ('39b00000-0000-4000-b000-000000000002', 'school', 'Other School', 'other-school-39b',
   '39b00000-0000-4000-a000-000000000006', '39b00000-0000-4000-a000-000000000006', 'active');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at, created_at)
values
  ('39b00000-0000-4000-e000-000000000002', '39b00000-0000-4000-b000-000000000001',
   '39b00000-0000-4000-a000-000000000002', 'admin', 'active', now(), now() - interval '9 days'),
  ('39b00000-0000-4000-e000-000000000003', '39b00000-0000-4000-b000-000000000001',
   '39b00000-0000-4000-a000-000000000003', 'teacher', 'active', now(), now() - interval '8 days'),
  ('39b00000-0000-4000-e000-000000000004', '39b00000-0000-4000-b000-000000000001',
   '39b00000-0000-4000-a000-000000000004', 'teacher', 'active', now(), now() - interval '7 days'),
  ('39b00000-0000-4000-e000-000000000005', '39b00000-0000-4000-b000-000000000001',
   '39b00000-0000-4000-a000-000000000005', 'parent', 'active', now(), now() - interval '6 days');

-- ---------------------------------------------------------------------
-- A. update_member_staff_fields — owner, happy paths and generation.
-- ---------------------------------------------------------------------
select tests.login('39b00000-0000-4000-a000-000000000001');

select is(
  (select employee_code from public.update_member_staff_fields(
     '39b00000-0000-4000-b000-000000000001', '39b00000-0000-4000-e000-000000000003',
     'TCH-EXP-1', 'Science', '+880255500')),
  'TCH-EXP-1',
  'owner: an explicit employee code is kept verbatim');

select tests.logout();
select is(
  (select department from public.workspace_members
    where id = '39b00000-0000-4000-e000-000000000003'),
  'Science',
  'owner: department and phone are saved');

select tests.login('39b00000-0000-4000-a000-000000000001');
select matches(
  (select employee_code from public.update_member_staff_fields(
     '39b00000-0000-4000-b000-000000000001', '39b00000-0000-4000-e000-000000000004')),
  '^TCH-\d{4}-\d{4}$',
  'a blank code on a member with none is generated from app.next_id');

select is(
  (select employee_code from public.update_member_staff_fields(
     '39b00000-0000-4000-b000-000000000001', '39b00000-0000-4000-e000-000000000003',
     null, 'Maths', null)),
  'TCH-EXP-1',
  'a blank code on a member who already has one keeps it');

select throws_ok(
  $$select public.update_member_staff_fields(
      '39b00000-0000-4000-b000-000000000001',
      '39b00000-0000-4000-e000-000000000004', 'TCH-EXP-1')$$,
  '23505', null,
  'a duplicate employee code inside the school is rejected (EMPLOYEE_NO_TAKEN)');

select throws_ok(
  $$select public.update_member_staff_fields(
      '39b00000-0000-4000-b000-000000000001',
      '39b00000-0000-4000-e000-000000000005', null)$$,
  'P0002', 'MEMBER_NOT_FOUND',
  'a parent id is not a staff member (MEMBER_NOT_FOUND)');

-- ---------------------------------------------------------------------
-- B. Auth on the RPC.
-- ---------------------------------------------------------------------
select tests.logout();
select tests.login('39b00000-0000-4000-a000-000000000003');
select throws_ok(
  $$select public.update_member_staff_fields(
      '39b00000-0000-4000-b000-000000000001',
      '39b00000-0000-4000-e000-000000000004', 'X-1')$$,
  '42501', 'FORBIDDEN',
  'a teacher cannot set another member''s staff fields');

select tests.logout();
select tests.login('39b00000-0000-4000-a000-000000000006');
select throws_ok(
  $$select public.update_member_staff_fields(
      '39b00000-0000-4000-b000-000000000001',
      '39b00000-0000-4000-e000-000000000003', 'X-2')$$,
  '42501', 'FORBIDDEN',
  'another school''s owner cannot touch this school''s member');

select tests.logout();
select ok(
  not has_function_privilege('anon',
    'public.update_member_staff_fields(uuid, uuid, text, text, text)', 'execute'),
  'anon has no EXECUTE on update_member_staff_fields');

select app.set_access_mode('39b00000-0000-4000-b000-000000000001', 'read_only',
                           'Your Pro trial has ended.');
select tests.login('39b00000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.update_member_staff_fields(
      '39b00000-0000-4000-b000-000000000001',
      '39b00000-0000-4000-e000-000000000003', 'RO-1')$$,
  '42501', 'PLAN_READ_ONLY',
  'a read-only plan refuses the staff-field write');
select tests.logout();
select app.set_access_mode('39b00000-0000-4000-b000-000000000001', 'normal', null);

-- ---------------------------------------------------------------------
-- C. Role change and label assignment (plain UPDATEs).
-- ---------------------------------------------------------------------
select tests.login('39b00000-0000-4000-a000-000000000002');   -- admin
update public.workspace_members set role = 'staff'
 where id = '39b00000-0000-4000-e000-000000000003';
select tests.logout();
select is(
  (select role::text from public.workspace_members
    where id = '39b00000-0000-4000-e000-000000000003'),
  'staff',
  'an admin re-roles a teacher to staff');

select tests.login('39b00000-0000-4000-a000-000000000002');
select throws_ok(
  $$update public.workspace_members set role = 'owner'
     where id = '39b00000-0000-4000-e000-000000000004'$$,
  '42501', 'only an owner can grant or remove ownership',
  'an admin cannot promote anyone to owner');

-- owner assigns a label to T2 without changing the role. The label row is
-- seeded as postgres (custom_labels_insert requires created_by = auth.uid(),
-- which the repository's createCustomLabel sets; a fixture insert does not).
select tests.logout();
insert into public.custom_labels (id, workspace_id, base_role, name, color)
values ('39b00000-0000-4000-c000-000000000001',
        '39b00000-0000-4000-b000-000000000001', 'teacher', 'Head of Science', '#3B82F6');
select tests.login('39b00000-0000-4000-a000-000000000001');
update public.workspace_members set label_id = '39b00000-0000-4000-c000-000000000001'
 where id = '39b00000-0000-4000-e000-000000000004';
select tests.logout();
select is(
  (select label_id::text || ':' || role::text from public.workspace_members
    where id = '39b00000-0000-4000-e000-000000000004'),
  '39b00000-0000-4000-c000-000000000001:teacher',
  'assigning a label sets label_id and leaves the role unchanged');

-- a non-admin member cannot assign a label to someone else
-- (RLS update_admin needs owner/admin; zero rows, no throw). User ...003 is
-- now `staff` (re-roled above), which is exactly a non-admin member.
select tests.login('39b00000-0000-4000-a000-000000000003');
update public.workspace_members set label_id = null
 where id = '39b00000-0000-4000-e000-000000000004';
select tests.logout();
select is(
  (select label_id::text from public.workspace_members
    where id = '39b00000-0000-4000-e000-000000000004'),
  '39b00000-0000-4000-c000-000000000001',
  'a non-admin member cannot clear another member''s label (RLS blocks the update)');

-- ---------------------------------------------------------------------
-- D. Review follow-ups (20260929121412_label_same_workspace_fk.sql).
-- ---------------------------------------------------------------------
-- School B's rows, read as their definer (school A's owner cannot see them).
create or replace function tests.label_b()
returns uuid language sql security definer as $fn$
  select id from public.custom_labels
   where workspace_id = '39b00000-0000-4000-b000-000000000002'
   order by name limit 1
$fn$;
create or replace function tests.member_b()
returns uuid language sql security definer as $fn$
  select id from public.workspace_members
   where workspace_id = '39b00000-0000-4000-b000-000000000002' limit 1
$fn$;

select tests.mkuser('39b00000-0000-4000-a000-000000000007', 'sf-pending@test.local', 'Pending Pia');
select tests.mkuser('39b00000-0000-4000-a000-000000000008', 'sf-removed@test.local', 'Removed Rafi');
select tests.mkuser('39b00000-0000-4000-a000-000000000009', 'sf-teacher3@test.local', 'Teacher Three');
insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values
  ('39b00000-0000-4000-e000-000000000007', '39b00000-0000-4000-b000-000000000001',
   '39b00000-0000-4000-a000-000000000007', 'admin', 'pending', null),
  ('39b00000-0000-4000-e000-000000000008', '39b00000-0000-4000-b000-000000000001',
   '39b00000-0000-4000-a000-000000000008', 'admin', 'removed', now()),
  ('39b00000-0000-4000-e000-000000000009', '39b00000-0000-4000-b000-000000000001',
   '39b00000-0000-4000-a000-000000000009', 'teacher', 'active', now());
insert into public.staff_records (id, workspace_id, user_id, membership_id, staff_code, full_name)
values ('39b00000-0000-4000-f000-000000000004', '39b00000-0000-4000-b000-000000000001',
        '39b00000-0000-4000-a000-000000000004', '39b00000-0000-4000-e000-000000000004',
        'STF-39B-1', 'Teacher Two');

-- Another school's label cannot be referenced at all (composite FK).
select tests.login('39b00000-0000-4000-a000-000000000001');
select throws_ok(
  format($$update public.workspace_members set label_id = %L
            where id = '39b00000-0000-4000-e000-000000000004'$$, tests.label_b()),
  '23503', null,
  'an owner cannot give a member another school''s label (workspace_members.label_id)');
select tests.logout();
select throws_ok(
  format($$update public.staff_records set designation_label_id = %L
            where id = '39b00000-0000-4000-f000-000000000004'$$, tests.label_b()),
  '23503', null,
  'no one can point staff_records.designation_label_id at another school''s label');

-- This school's id with another school's member id touches nothing.
select tests.login('39b00000-0000-4000-a000-000000000001');
select throws_ok(
  format($$select public.update_member_staff_fields(
      '39b00000-0000-4000-b000-000000000001', %L, 'X-3')$$, tests.member_b()),
  'P0002', 'MEMBER_NOT_FOUND',
  'the RPC with this school''s id and another school''s member id finds no row');

-- A pending and a removed admin hold no power over the RPC.
select tests.logout();
select tests.login('39b00000-0000-4000-a000-000000000007');
select throws_ok(
  $$select public.update_member_staff_fields(
      '39b00000-0000-4000-b000-000000000001',
      '39b00000-0000-4000-e000-000000000009', 'X-4')$$,
  '42501', 'FORBIDDEN',
  'a pending admin cannot set staff fields');
select tests.logout();
select tests.login('39b00000-0000-4000-a000-000000000008');
select throws_ok(
  $$select public.update_member_staff_fields(
      '39b00000-0000-4000-b000-000000000001',
      '39b00000-0000-4000-e000-000000000009', 'X-5')$$,
  '42501', 'FORBIDDEN',
  'a removed admin cannot set staff fields');

-- Generation skips a code someone typed by hand in the generated shape.
-- One code has been generated so far (T2's), so the next is -0002.
select tests.logout();
select tests.login('39b00000-0000-4000-a000-000000000001');
select public.update_member_staff_fields(
  '39b00000-0000-4000-b000-000000000001', '39b00000-0000-4000-e000-000000000002',
  'TCH-' || extract(year from now() at time zone 'Asia/Dhaka')::int || '-0002');
select is(
  (select employee_code from public.update_member_staff_fields(
     '39b00000-0000-4000-b000-000000000001', '39b00000-0000-4000-e000-000000000009')),
  'TCH-' || extract(year from now() at time zone 'Asia/Dhaka')::int || '-0003',
  'a blank save skips a hand-typed code already in the generated shape');
select tests.logout();

select * from finish();
rollback;
