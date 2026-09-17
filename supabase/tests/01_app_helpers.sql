-- =====================================================================
-- pgTAP · app.* helper correctness
-- app.member_role / app.has_role / app.is_platform_admin /
-- app.shares_active_workspace / app.next_id
-- =====================================================================
begin;
select plan(16);

-- ---------------------------------------------------------------------
-- test-only harness (rolled back with the transaction)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- fixtures: two schools, five people
-- ---------------------------------------------------------------------
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000001', 'owner.a@test.local',    'Owner A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000002', 'teacher.a@test.local',  'Teacher A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000003', 'parent.a@test.local',   'Parent A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000004', 'pending.a@test.local',  'Pending A');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000001', 'owner.b@test.local',    'Owner B');
select tests.mkuser('cccccccc-0000-0000-0000-000000000001', 'platform@test.local',   'Platform Staff');

update public.profiles set is_platform_admin = true
 where id = 'cccccccc-0000-0000-0000-000000000001';

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('22222222-2222-2222-2222-222222222222', 'school', 'School B', 'school-b',
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'teacher', 'active', now()),
       ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'parent',  'active', now()),
       ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000004', 'teacher', 'pending', null);

-- =====================================================================
-- the helpers exist with the signatures ARCHITECTURE §3 promises
-- =====================================================================
select has_function('app', 'member_role',  array['uuid'],         'app.member_role(uuid) exists');
select has_function('app', 'has_role',     array['uuid','text[]'],'app.has_role(uuid, text[]) exists');
select has_function('app', 'is_guardian_of', array['uuid'],       'app.is_guardian_of(uuid) exists');

-- =====================================================================
-- app.member_role
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select is(app.member_role('11111111-1111-1111-1111-111111111111'), 'owner',
          'the creator of a workspace is its owner');
select is(app.member_role('22222222-2222-2222-2222-222222222222'), null,
          'a non-member gets NULL for another workspace');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000004');
select is(app.member_role('11111111-1111-1111-1111-111111111111'), null,
          'a PENDING member is not yet a member');
select tests.logout();

-- removal revokes instantly (PRODUCT-DECISIONS 1.14)
update public.workspace_members set status = 'removed'
 where workspace_id = '11111111-1111-1111-1111-111111111111'
   and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';

select tests.login('aaaaaaaa-0000-0000-0000-000000000002');
select is(app.member_role('11111111-1111-1111-1111-111111111111'), null,
          'a REMOVED member loses access the moment status changes');
select tests.logout();

update public.workspace_members set status = 'active'
 where workspace_id = '11111111-1111-1111-1111-111111111111'
   and user_id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- =====================================================================
-- app.has_role
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');
select ok(app.has_role('11111111-1111-1111-1111-111111111111', array['owner','admin','teacher']),
          'has_role is true when the caller''s role is in the list');
select ok(not app.has_role('11111111-1111-1111-1111-111111111111', array['owner','admin']),
          'has_role is false when the role is not in the list');
select ok(not app.has_role('22222222-2222-2222-2222-222222222222', array['teacher']),
          'has_role is false in a workspace the caller does not belong to');
select tests.logout();

-- =====================================================================
-- app.is_platform_admin
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select ok(not app.is_platform_admin(), 'a school owner is not platform staff');
select tests.logout();

select tests.login('cccccccc-0000-0000-0000-000000000001');
select ok(app.is_platform_admin(), 'platform staff are recognised');
select is(app.member_role('11111111-1111-1111-1111-111111111111'), null,
          'platform staff are still NOT members of any workspace (PRODUCT-DECISIONS 1.21)');
select tests.logout();

-- =====================================================================
-- app.shares_active_workspace — a parent may never enumerate colleagues
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');
select ok(app.shares_active_workspace('aaaaaaaa-0000-0000-0000-000000000001'),
          'a teacher shares a workspace with the owner');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');
select ok(not app.shares_active_workspace('aaaaaaaa-0000-0000-0000-000000000001'),
          'a parent does NOT get roster visibility through shares_active_workspace');
select tests.logout();

-- =====================================================================
-- app.next_id — per-workspace sequential identifiers
-- =====================================================================
select is(
  array[
    app.next_id('11111111-1111-1111-1111-111111111111', 'student'),
    app.next_id('11111111-1111-1111-1111-111111111111', 'student'),
    app.next_id('22222222-2222-2222-2222-222222222222', 'student')
  ],
  array[
    'STU-' || to_char(now() at time zone 'Asia/Dhaka', 'YYYY') || '-00001',
    'STU-' || to_char(now() at time zone 'Asia/Dhaka', 'YYYY') || '-00002',
    'STU-' || to_char(now() at time zone 'Asia/Dhaka', 'YYYY') || '-00001'
  ],
  'app.next_id increments per workspace and restarts in another workspace');

select * from finish();
rollback;
