-- =====================================================================
-- pgTAP · F-ID-01 Part 7 — second review round
--   (20260930034629_account_deletion_guards.sql, D-113)
--
--   A. A closing account (profile deleted, or deletion past its date)
--      cannot own a new workspace, gain or regain a membership, or create
--      a school through public.create_school_workspace — an access token
--      can outlive the account by up to an hour. A normal account can.
--   B. Two co-owners of one school whose deletions fall due on the same
--      night: exactly one is purged, the other is cancelled with
--      SOLE_OWNER_BLOCKED, and the school keeps an active owner.
-- =====================================================================
begin;
select plan(9);

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
-- Fixture (as postgres).
--   P  purged (deleted_at set)        Q  deletion past its date
--   R  an ordinary account            O  owner of school S
--   C1, C2 co-owners of school T, both due tonight
-- ---------------------------------------------------------------------
select tests.mkuser('39e00000-0000-4000-a000-000000000001', 'g-purged@test.local', 'Purged P');
select tests.mkuser('39e00000-0000-4000-a000-000000000002', 'g-due@test.local', 'Due Q');
select tests.mkuser('39e00000-0000-4000-a000-000000000003', 'g-normal@test.local', 'Normal R');
select tests.mkuser('39e00000-0000-4000-a000-000000000004', 'g-owner@test.local', 'Owner O');
select tests.mkuser('39e00000-0000-4000-a000-000000000005', 'g-co1@test.local', 'Co One');
select tests.mkuser('39e00000-0000-4000-a000-000000000006', 'g-co2@test.local', 'Co Two');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('39e00000-0000-4000-b000-000000000001', 'school', 'Guard School', 'guard-school-39e',
   '39e00000-0000-4000-a000-000000000004', '39e00000-0000-4000-a000-000000000004', 'active'),
  ('39e00000-0000-4000-b000-000000000002', 'school', 'Twin School', 'twin-school-39e',
   '39e00000-0000-4000-a000-000000000005', '39e00000-0000-4000-a000-000000000005', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('39e00000-0000-4000-b000-000000000001', '39e00000-0000-4000-a000-000000000002',
   'teacher', 'removed', now()),
  ('39e00000-0000-4000-b000-000000000002', '39e00000-0000-4000-a000-000000000006',
   'owner', 'active', now());

update public.profiles set deleted_at = now()
 where id = '39e00000-0000-4000-a000-000000000001';

insert into public.account_deletion_requests (user_id, requested_at, scheduled_purge_at)
values
  ('39e00000-0000-4000-a000-000000000002', now() - interval '31 days', now() - interval '1 day'),
  ('39e00000-0000-4000-a000-000000000005', now() - interval '31 days', now() - interval '1 day'),
  ('39e00000-0000-4000-a000-000000000006', now() - interval '31 days', now() - interval '1 day');

-- =====================================================================
-- A. A closing account joins nothing
-- =====================================================================
select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('39e00000-0000-4000-b000-000000000001', '39e00000-0000-4000-a000-000000000001', 'teacher', 'active')$$,
  '42501', 'ACCOUNT_CLOSED',
  'A1: a purged account gains no membership');
select throws_ok(
  $$update public.workspace_members set status = 'active'
     where workspace_id = '39e00000-0000-4000-b000-000000000001'
       and user_id = '39e00000-0000-4000-a000-000000000002'$$,
  '42501', 'ACCOUNT_CLOSED',
  'A2: an account past its deletion date cannot be re-activated in a school');
select throws_ok(
  $$insert into public.workspaces (type, name, slug, owner_id, created_by)
    values ('school', 'Ghost School', 'ghost-school-39e',
            '39e00000-0000-4000-a000-000000000001', '39e00000-0000-4000-a000-000000000001')$$,
  '42501', 'ACCOUNT_CLOSED',
  'A3: a purged account owns no new workspace');
select lives_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('39e00000-0000-4000-b000-000000000001', '39e00000-0000-4000-a000-000000000003', 'teacher', 'active')$$,
  'A4: an ordinary account still joins');

select tests.login('39e00000-0000-4000-a000-000000000001');
select throws_ok(
  $$select public.create_school_workspace(jsonb_build_object(
      'name', 'Ghost Academy', 'board', 'dhaka', 'medium', 'bangla',
      'timezone', 'Asia/Dhaka', 'working_days', jsonb_build_array(6, 7, 1, 2, 3, 4),
      'academic_year', jsonb_build_object('name', '2026', 'starts_on', '2026-01-01', 'ends_on', '2026-12-31'),
      'grade_levels', jsonb_build_array(jsonb_build_object(
        'name', 'Class 6', 'name_bn', 'ষষ্ঠ শ্রেণি', 'level_number', 6, 'stage', 'secondary')),
      'idempotency_key', '39e00000-0000-4000-c000-000000000001'))$$,
  '42501', 'ACCOUNT_CLOSED',
  'A5: a leftover token of a purged account cannot create a school');
select tests.logout();

-- Q is not part of B.
update public.account_deletion_requests set status = 'cancelled', cancelled_at = now()
 where user_id = '39e00000-0000-4000-a000-000000000002';

-- =====================================================================
-- B. Two co-owners due the same night
-- =====================================================================
select is(app.run_account_purges(), 1, 'B1: exactly one co-owner is purged');
select is(
  (select count(*)::int from public.workspace_members
    where workspace_id = '39e00000-0000-4000-b000-000000000002'
      and role = 'owner' and status = 'active'),
  1,
  'B2: the school keeps an active owner');
select is(
  (select count(*)::int from public.account_deletion_requests
    where user_id in ('39e00000-0000-4000-a000-000000000005', '39e00000-0000-4000-a000-000000000006')
      and status = 'cancelled' and last_error = 'SOLE_OWNER_BLOCKED'),
  1,
  'B3: the other request is cancelled as SOLE_OWNER_BLOCKED');
select is(
  (select count(*)::int from public.account_deletion_requests
    where user_id in ('39e00000-0000-4000-a000-000000000005', '39e00000-0000-4000-a000-000000000006')
      and status = 'completed'),
  1,
  'B4: one request is completed');

select * from finish();
rollback;
