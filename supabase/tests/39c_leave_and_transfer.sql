-- =====================================================================
-- pgTAP · F-ID-03 Part 7 — remove, leave, transfer ownership
--   (20260929172553_member_leave_transfer.sql, D-112)
--
--   A. Removal is a plain UPDATE by an owner/admin; an admin cannot remove
--      an owner; a teacher or another school's owner removes nothing.
--   B. Leaving: own row active|pending -> removed only; no smuggled change,
--      no self re-activation, not for parents, never the sole owner;
--      allowed on a read-only plan.
--   C. public.transfer_ownership: owner only, eligible targets only, one
--      transaction, keep-owner, read-only refused, grants.
-- =====================================================================
begin;
select plan(39);

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
      'email', (select u.email from auth.users u where u.id = p_id),
      -- a fresh password sign-in, as the transfer requires (D-112 review)
      'amr', json_build_array(json_build_object('method', 'password',
        'timestamp', extract(epoch from now())::bigint)))::text, true);
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
-- teacher T, teacher T2, staff S, parent PA, pending P. School B: owner OB.
-- ---------------------------------------------------------------------
select tests.mkuser('39c00000-0000-4000-a000-000000000001', 'lt-owner@test.local', 'Owner Olive');
select tests.mkuser('39c00000-0000-4000-a000-000000000002', 'lt-admin@test.local', 'Admin Adil');
select tests.mkuser('39c00000-0000-4000-a000-000000000003', 'lt-teacher@test.local', 'Teacher Tania');
select tests.mkuser('39c00000-0000-4000-a000-000000000004', 'lt-teacher2@test.local', 'Teacher Two');
select tests.mkuser('39c00000-0000-4000-a000-000000000005', 'lt-staff@test.local', 'Staff Sumi');
select tests.mkuser('39c00000-0000-4000-a000-000000000006', 'lt-parent@test.local', 'Parent Parvin');
select tests.mkuser('39c00000-0000-4000-a000-000000000007', 'lt-pending@test.local', 'Pending Pia');
select tests.mkuser('39c00000-0000-4000-a000-000000000008', 'lt-ownerb@test.local', 'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('39c00000-0000-4000-b000-000000000001', 'school', 'Leave School', 'leave-school-39c',
   '39c00000-0000-4000-a000-000000000001', '39c00000-0000-4000-a000-000000000001', 'active'),
  ('39c00000-0000-4000-b000-000000000002', 'school', 'Other School', 'other-school-39c',
   '39c00000-0000-4000-a000-000000000008', '39c00000-0000-4000-a000-000000000008', 'active');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values
  ('39c00000-0000-4000-e000-000000000002', '39c00000-0000-4000-b000-000000000001',
   '39c00000-0000-4000-a000-000000000002', 'admin', 'active', now()),
  ('39c00000-0000-4000-e000-000000000003', '39c00000-0000-4000-b000-000000000001',
   '39c00000-0000-4000-a000-000000000003', 'teacher', 'active', now()),
  ('39c00000-0000-4000-e000-000000000004', '39c00000-0000-4000-b000-000000000001',
   '39c00000-0000-4000-a000-000000000004', 'teacher', 'active', now()),
  ('39c00000-0000-4000-e000-000000000005', '39c00000-0000-4000-b000-000000000001',
   '39c00000-0000-4000-a000-000000000005', 'staff', 'active', now()),
  ('39c00000-0000-4000-e000-000000000006', '39c00000-0000-4000-b000-000000000001',
   '39c00000-0000-4000-a000-000000000006', 'parent', 'active', now()),
  ('39c00000-0000-4000-e000-000000000007', '39c00000-0000-4000-b000-000000000001',
   '39c00000-0000-4000-a000-000000000007', 'teacher', 'pending', null);

-- "<role>/<status>" of user ...00<n> in school A, read as the definer.
create or replace function tests.m(p_user text)
returns text language sql security definer as $fn$
  select role::text || '/' || status::text from public.workspace_members
   where workspace_id = '39c00000-0000-4000-b000-000000000001'
     and user_id = ('39c00000-0000-4000-a000-00000000000' || p_user)::uuid
$fn$;

-- ---------------------------------------------------------------------
-- A. Removal by owner/admin (plain UPDATE).
-- ---------------------------------------------------------------------
select tests.login('39c00000-0000-4000-a000-000000000002');   -- admin
update public.workspace_members set status = 'removed'
 where id = '39c00000-0000-4000-e000-000000000003';
select tests.logout();
select is(tests.m('3'), 'teacher/removed', 'an admin removes a teacher');

select tests.login('39c00000-0000-4000-a000-000000000003');
select is(app.member_role('39c00000-0000-4000-b000-000000000001')::text, null,
  'the removed teacher has no role in the school on their next request');
select is(
  (select count(*)::int from public.workspace_members
    where workspace_id = '39c00000-0000-4000-b000-000000000001'
      and user_id <> '39c00000-0000-4000-a000-000000000003'), 0,
  'the removed teacher can no longer read the school''s roster');
select tests.logout();
select is(
  (select removed_by::text from public.workspace_members
    where id = '39c00000-0000-4000-e000-000000000003'),
  '39c00000-0000-4000-a000-000000000002',
  'removed_by is the admin who removed them');

select tests.login('39c00000-0000-4000-a000-000000000002');
select throws_ok(
  $$update public.workspace_members set status = 'removed'
     where workspace_id = '39c00000-0000-4000-b000-000000000001'
       and user_id = '39c00000-0000-4000-a000-000000000001'$$,
  '42501', 'only an owner can grant or remove ownership',
  'an admin cannot remove an owner (FORBIDDEN_OWNER_TARGET)');

select tests.logout();
select tests.login('39c00000-0000-4000-a000-000000000004');   -- teacher T2
update public.workspace_members set status = 'removed'
 where id = '39c00000-0000-4000-e000-000000000005';
select tests.logout();
select is(tests.m('5'), 'staff/active', 'a teacher cannot remove anyone (RLS: zero rows)');

select tests.login('39c00000-0000-4000-a000-000000000008');   -- school B owner
update public.workspace_members set status = 'removed'
 where id = '39c00000-0000-4000-e000-000000000005';
select tests.logout();
select is(tests.m('5'), 'staff/active',
  'another school''s owner cannot remove this school''s member');

-- ---------------------------------------------------------------------
-- B. Leaving (own row, plain UPDATE under workspace_members_update_self).
-- ---------------------------------------------------------------------
select tests.login('39c00000-0000-4000-a000-000000000004');   -- T2
select throws_ok(
  $$update public.workspace_members set status = 'removed', department = 'X'
     where id = '39c00000-0000-4000-e000-000000000004'$$,
  '42501', 'members cannot change their own role or status',
  'a leave cannot carry another change with it');
select throws_ok(
  $$update public.workspace_members set status = 'removed', role = 'admin'
     where id = '39c00000-0000-4000-e000-000000000004'$$,
  '42501', 'members cannot change their own role or status',
  'a leave cannot change the role');
update public.workspace_members set status = 'removed'
 where id = '39c00000-0000-4000-e000-000000000004';
select tests.logout();
select is(tests.m('4'), 'teacher/removed', 'a teacher leaves the school');
select is(
  (select removed_by::text from public.workspace_members
    where id = '39c00000-0000-4000-e000-000000000004'),
  '39c00000-0000-4000-a000-000000000004',
  'removed_by is the leaver themselves');

select tests.login('39c00000-0000-4000-a000-000000000004');
select throws_ok(
  $$update public.workspace_members set status = 'active'
     where id = '39c00000-0000-4000-e000-000000000004'$$,
  '42501', 'members cannot change their own role or status',
  'a member who left cannot re-activate themselves');
select tests.logout();

select tests.login('39c00000-0000-4000-a000-000000000006');   -- parent
select throws_ok(
  $$update public.workspace_members set status = 'removed'
     where id = '39c00000-0000-4000-e000-000000000006'$$,
  '42501', 'members cannot change their own role or status',
  'a parent does not leave this way (access is per child, D-108)');
select tests.logout();

select tests.login('39c00000-0000-4000-a000-000000000007');   -- pending
update public.workspace_members set status = 'removed'
 where id = '39c00000-0000-4000-e000-000000000007';
select tests.logout();
select is(tests.m('7'), 'teacher/removed', 'a pending joiner can withdraw their request');

select tests.login('39c00000-0000-4000-a000-000000000001');   -- sole owner
select throws_ok(
  $$update public.workspace_members set status = 'removed'
     where workspace_id = '39c00000-0000-4000-b000-000000000001'
       and user_id = '39c00000-0000-4000-a000-000000000001'$$,
  '23514', 'a workspace must always have at least one active owner',
  'the sole owner cannot leave (LAST_OWNER_BLOCKED)');
select tests.logout();

select app.set_access_mode('39c00000-0000-4000-b000-000000000001', 'read_only',
                           'Your Pro trial has ended.');
select tests.login('39c00000-0000-4000-a000-000000000005');   -- staff
update public.workspace_members set status = 'removed'
 where id = '39c00000-0000-4000-e000-000000000005';
select tests.logout();
select is(tests.m('5'), 'staff/removed', 'leaving works on a read-only plan (D-300)');

-- ---------------------------------------------------------------------
-- C. transfer_ownership. The school is still read-only here.
-- ---------------------------------------------------------------------
select tests.login('39c00000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000002')$$,
  '42501', 'PLAN_READ_ONLY',
  'a read-only plan refuses an ownership transfer');
select tests.logout();
select is(tests.m('1') || ' ' || tests.m('2'), 'owner/active admin/active',
  'the refused transfer changed nothing');
select app.set_access_mode('39c00000-0000-4000-b000-000000000001', 'normal', null);

-- Bring teacher T2 and staff S back as targets (as postgres).
update public.workspace_members set status = 'active'
 where id in ('39c00000-0000-4000-e000-000000000004', '39c00000-0000-4000-e000-000000000005');

select tests.login('39c00000-0000-4000-a000-000000000002');   -- admin
select throws_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000004')$$,
  '42501', 'FORBIDDEN',
  'an admin cannot transfer ownership');
select tests.logout();

select tests.login('39c00000-0000-4000-a000-000000000008');   -- school B owner
select throws_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000004')$$,
  '42501', 'FORBIDDEN',
  'another school''s owner cannot transfer this school');
select throws_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000002',
                                     '39c00000-0000-4000-e000-000000000004')$$,
  'P0002', 'TARGET_NOT_ELIGIBLE',
  'an owner cannot hand their school to another school''s member');
select tests.logout();

select tests.login('39c00000-0000-4000-a000-000000000001');   -- owner
select throws_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000005')$$,
  'P0002', 'TARGET_NOT_ELIGIBLE', 'a staff member is not an eligible target');
select throws_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000007')$$,
  'P0002', 'TARGET_NOT_ELIGIBLE', 'a withdrawn (removed) member is not an eligible target');
select throws_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000006')$$,
  'P0002', 'TARGET_NOT_ELIGIBLE', 'a parent is not an eligible target');
select throws_ok(
  $$update public.workspace_members set role = 'admin'
     where workspace_id = '39c00000-0000-4000-b000-000000000001'
       and user_id = '39c00000-0000-4000-a000-000000000001'$$,
  '42501', 'members cannot change their own role or status',
  'outside a transfer, an owner still cannot demote themselves');
select set_config('app.ownership_transfer', '39c00000-0000-4000-e000-000000000002', true);
select throws_ok(
  $$update public.workspace_members set role = 'admin'
     where workspace_id = '39c00000-0000-4000-b000-000000000001'
       and user_id = '39c00000-0000-4000-a000-000000000001'$$,
  '42501', 'members cannot change their own role or status',
  'the transfer marker alone is not enough: the named member must already be an owner');
select set_config('app.ownership_transfer', '', true);

-- D-112 review: ownership has one door.
select throws_ok(
  $$update public.workspace_members set role = 'owner'
     where id = '39c00000-0000-4000-e000-000000000004'$$,
  '42501', 'ownership is granted only through transfer_ownership',
  'an owner cannot mint another owner with a plain update (no re-auth)');
select tests.logout();
select tests.mkuser('39c00000-0000-4000-a000-000000000009', 'lt-outsider@test.local', 'Outsider');
select tests.login('39c00000-0000-4000-a000-000000000001');
select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('39c00000-0000-4000-b000-000000000001',
            '39c00000-0000-4000-a000-000000000009', 'owner', 'active')$$,
  '42501', 'ownership is granted only through transfer_ownership',
  'an owner cannot insert another person as an owner');
select set_config('request.jwt.claims',
  json_build_object('sub', '39c00000-0000-4000-a000-000000000001', 'role', 'authenticated',
    'amr', json_build_array(json_build_object('method', 'password',
      'timestamp', extract(epoch from now())::bigint - 3600)))::text, true);
select throws_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000004')$$,
  '28000', 'REAUTH_REQUIRED',
  'a session without a password sign-in in the last 5 minutes cannot transfer');
select tests.logout();
select tests.login('39c00000-0000-4000-a000-000000000001');

select lives_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000004', true)$$,
  'keep-owner: the owner makes a teacher a co-owner');
select tests.logout();
select is(tests.m('1') || ' ' || tests.m('4'), 'owner/active owner/active',
  'keep-owner leaves two owners');

-- D-112 §9: re-activating a removed owner is a grant too. O removes the
-- co-owner T2, cannot bring them back as an owner, can bring them back as
-- an admin.
select tests.login('39c00000-0000-4000-a000-000000000001');
update public.workspace_members set status = 'removed'
 where id = '39c00000-0000-4000-e000-000000000004';
select throws_ok(
  $update public.workspace_members set status = 'active'
     where id = '39c00000-0000-4000-e000-000000000004'$,
  '42501', 'ownership is granted only through transfer_ownership',
  're-activating a removed owner as an owner is refused (no re-auth)');
select lives_ok(
  $update public.workspace_members set status = 'active', role = 'admin'
     where id = '39c00000-0000-4000-e000-000000000004'$,
  'an owner re-activates a removed owner as an admin');
select tests.logout();
select is(tests.m('4'), 'admin/active', 'the re-activated member is an active admin');

select tests.login('39c00000-0000-4000-a000-000000000001');
select lives_ok(
  $$select public.transfer_ownership('39c00000-0000-4000-b000-000000000001',
                                     '39c00000-0000-4000-e000-000000000002')$$,
  'the owner transfers ownership to the admin');
select is(current_setting('app.ownership_transfer', true), '',
  'the transfer marker is cleared when the function returns');
select tests.logout();
select is(tests.m('1') || ' ' || tests.m('2'), 'admin/active owner/active',
  'transfer: the target is an owner and the previous owner an admin, in one step');

select ok(
  not has_function_privilege('anon',
    'public.transfer_ownership(uuid, uuid, boolean)', 'execute'),
  'anon has no EXECUTE on transfer_ownership');
select ok(
  has_function_privilege('authenticated',
    'public.transfer_ownership(uuid, uuid, boolean)', 'execute'),
  'authenticated has EXECUTE on transfer_ownership (D-54)');

select * from finish();
rollback;
