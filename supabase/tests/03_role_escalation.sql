-- =====================================================================
-- pgTAP · privilege escalation
-- Nobody edits their own role or status; parents cannot read the roster;
-- the last owner cannot be removed; billing is not client-writable.
-- Regression test for Base44 security review findings 2 and 6.
--
-- Note on expectations: an INSERT that fails WITH CHECK raises 42501, but an
-- UPDATE or DELETE whose rows are filtered by a USING clause simply affects
-- zero rows. Where that is the real behaviour, the test asserts "the write
-- did nothing" rather than "the write errored" — asserting an error that
-- Postgres does not raise would be a test that lies.
-- =====================================================================
begin;
select plan(21);

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
-- fixtures: one school, owner + admin + teacher + parent
-- ---------------------------------------------------------------------
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000001', 'owner@test.local',   'Owner');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000002', 'admin@test.local',   'Admin');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000003', 'teacher@test.local', 'Teacher');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000004', 'parent@test.local',  'Parent');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('dddd0002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000002', 'admin',   'active', now()),
       ('dddd0003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000003', 'teacher', 'active', now()),
       ('dddd0004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000004', 'parent',  'active', now());

-- =====================================================================
-- a teacher may not touch their own role or status
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000003');

select throws_ok(
  $$update public.workspace_members set role = 'owner'
     where id = 'dddd0003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a teacher cannot promote themselves to owner');

select throws_ok(
  $$update public.workspace_members set role = 'admin'
     where id = 'dddd0003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a teacher cannot promote themselves to admin');

select throws_ok(
  $$update public.workspace_members set status = 'removed'
     where id = 'dddd0003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a teacher cannot rewrite their own membership status');

select lives_ok(
  $$update public.workspace_members set phone = '+8801700000003', department = 'Science'
     where id = 'dddd0003-0000-0000-0000-000000000003'$$,
  'a teacher CAN maintain their own phone and department');

with attempted as (
  update public.workspace_members set role = 'staff'
   where id = 'dddd0004-0000-0000-0000-000000000004'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a teacher''s attempt to re-role a colleague affects ZERO rows...');

select is(
  (select role::text from public.workspace_members where id = 'dddd0004-0000-0000-0000-000000000004'),
  'parent',
  '...and the colleague is still a parent');

select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('11111111-1111-1111-1111-111111111111',
            'aaaaaaaa-0000-0000-0000-000000000001', 'owner', 'active')$$,
  '42501', null,
  'a teacher cannot add members');

select throws_ok(
  $$delete from public.workspace_members where id = 'dddd0003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'no client role holds DELETE on workspace_members (PRODUCT-DECISIONS 1.14)');

select throws_ok(
  $$update public.profiles set is_platform_admin = true
     where id = 'aaaaaaaa-0000-0000-0000-000000000003'$$,
  '42501', null,
  'nobody promotes themselves to platform staff');

select tests.logout();

-- =====================================================================
-- an admin may manage others but not themselves, and not ownership
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');

select lives_ok(
  $$update public.workspace_members set role = 'staff'
     where id = 'dddd0003-0000-0000-0000-000000000003'$$,
  'an admin can change a teacher''s role');

select throws_ok(
  $$update public.workspace_members set role = 'owner'
     where id = 'dddd0002-0000-0000-0000-000000000002'$$,
  '42501', null,
  'an admin cannot promote themselves to owner');

select throws_ok(
  $$update public.workspace_members set role = 'owner'
     where id = 'dddd0003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'an admin cannot grant ownership — only an owner can');

with attempted as (
  update public.subscriptions set status = 'active'
   where workspace_id = '11111111-1111-1111-1111-111111111111'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'an admin activating their own subscription affects ZERO rows...');

select is(
  (select status::text from public.subscriptions
    where workspace_id = '11111111-1111-1111-1111-111111111111'),
  'trialing',
  '...and it is still on trial (Base44: plan/status was client-writable)');

with attempted as (
  update public.plan_prices set monthly_paisa = 0
   where plan_id = (select id from public.plans where code = 'pro')
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a tenant rewriting the price list affects ZERO rows...');

select is(
  (select monthly_paisa from public.plan_prices
    where plan_id = (select id from public.plans where code = 'pro')
      and student_min = 0),
  490000::bigint,
  '...and the Pro 0-300 band still costs Tk 4,900 (D-39 seed)');

select tests.logout();

update public.workspace_members set role = 'teacher'
 where id = 'dddd0003-0000-0000-0000-000000000003';

-- =====================================================================
-- a parent sees their own membership row and nothing else
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000004');

select is(
  (select count(*)::int from public.workspace_members
    where workspace_id = '11111111-1111-1111-1111-111111111111'),
  1, 'a parent can read exactly one membership row');

select is(
  (select user_id from public.workspace_members
    where workspace_id = '11111111-1111-1111-1111-111111111111'),
  'aaaaaaaa-0000-0000-0000-000000000004'::uuid,
  'and it is their own — the staff roster is invisible to parents');

select throws_ok(
  $$insert into public.custom_labels (workspace_id, base_role, name, created_by)
    values ('11111111-1111-1111-1111-111111111111', 'teacher', 'Parent Label',
            'aaaaaaaa-0000-0000-0000-000000000004')$$,
  '42501', null,
  'a parent cannot write school configuration');

select tests.logout();

-- =====================================================================
-- the last owner is protected — from themselves and from the server
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');

select throws_ok(
  $$update public.workspace_members set role = 'admin'
     where workspace_id = '11111111-1111-1111-1111-111111111111'
       and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '42501', null,
  'an owner cannot downgrade their own membership');

select tests.logout();

select throws_ok(
  $$update public.workspace_members set role = 'admin'
     where workspace_id = '11111111-1111-1111-1111-111111111111'
       and user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23514', null,
  'the last active owner cannot be downgraded even by a privileged caller');

select * from finish();
rollback;
