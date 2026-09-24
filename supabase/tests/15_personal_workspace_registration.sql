-- =====================================================================
-- pgTAP · F-ID-05 Part 1 — automatic personal workspace at registration
--
-- Proves the acceptance criteria that are actually Part 1's (spec §9
-- AC1-AC2, §5 "personal workspaces per user: exactly 1", §10) AND the
-- security gap an Opus review of this PR's first draft found: the
-- partial unique index alone did not stop an authenticated client from
-- minting unlimited personal workspaces (PATCH created_by to null, then
-- POST a fresh type='personal' row — NULL never collides with NULL in a
-- unique index). Covers:
--   1. a signup produces exactly one `type='personal'` workspace and one
--      `owner`/`active` membership, in the SAME transaction as the
--      `auth.users` row, and the new owner's role is visible immediately;
--   2. a forced failure in the LAST function of the bootstrap chain
--      (app.tg_workspace_bootstrap(), not handle_new_user() itself) rolls
--      back the WHOLE signup — proving a genuine partial-write scenario
--      (profile + preferences + workspace already inserted) unwinds, not
--      just a failure on the very first statement;
--   3. app.handle_new_user() keeps working normally afterwards;
--   4. workspaces_one_personal_per_creator (the index) rejects a second
--      personal workspace for the same creator, by name, for a privileged
--      caller — defence in depth beneath the RLS layer;
--   5. app.tg_workspaces_guard() now refuses to change created_by, like
--      type/owner_id/invite_code;
--   6. the workspaces_insert policy refuses ANY direct client insert of a
--      personal workspace (RLS, 42501) while still allowing the one
--      legitimate client insert path — a school workspace.
-- =====================================================================
begin;
select plan(19);

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

-- =====================================================================
-- 1. a plain signup gets exactly one personal workspace + owner membership
-- =====================================================================
select tests.mkuser('f1050001-0000-0000-0000-000000000001', 'p1.owner@test.local', 'Part One Owner');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050001-0000-0000-0000-000000000001' and type = 'personal'),
  1,
  'registration creates exactly one personal workspace for the new user');

select is(
  (select count(*)::int from public.profiles where id = 'f1050001-0000-0000-0000-000000000001'),
  1,
  'registration creates the profile row in the same transaction');

select is(
  (select count(*)::int from public.user_preferences where user_id = 'f1050001-0000-0000-0000-000000000001'),
  1,
  'registration creates the user_preferences row in the same transaction');

select is(
  (select m.role::text
     from public.workspace_members m
     join public.workspaces w on w.id = m.workspace_id
    where w.created_by = 'f1050001-0000-0000-0000-000000000001'
      and w.type = 'personal'
      and m.user_id = 'f1050001-0000-0000-0000-000000000001'),
  'owner',
  'the new user is the owner member of their own personal workspace');

select is(
  (select m.status::text
     from public.workspace_members m
     join public.workspaces w on w.id = m.workspace_id
    where w.created_by = 'f1050001-0000-0000-0000-000000000001'
      and w.type = 'personal'
      and m.user_id = 'f1050001-0000-0000-0000-000000000001'),
  'active',
  'the owner membership is active immediately — no separate activation step');

select tests.login('f1050001-0000-0000-0000-000000000001');
select ok(
  (select app.has_role(w.id, array['owner'])
     from public.workspaces w
    where w.created_by = 'f1050001-0000-0000-0000-000000000001' and w.type = 'personal'),
  'app.has_role(ws, ''{owner}'') is true for the new owner immediately, as themselves');
select tests.logout();

-- =====================================================================
-- 2. a forced failure in the LAST function of the bootstrap chain
--    (app.tg_workspace_bootstrap, the AFTER INSERT trigger on workspaces —
--    NOT handle_new_user() itself) rolls back everything, proving a real
--    partial-write scenario unwinds. Temporary, transaction-local
--    substitution — restored below.
-- =====================================================================
savepoint forced_failure;

create or replace function app.tg_workspace_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'pgtap forced tg_workspace_bootstrap failure' using errcode = 'P0001';
end;
$$;

select throws_ok(
  $$insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (
      '00000000-0000-0000-0000-000000000000', 'f1050002-0000-0000-0000-000000000002',
      'authenticated', 'authenticated', 'p1.forced-fail@test.local', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Forced Failure'), now(), now())$$,
  'P0001', 'pgtap forced tg_workspace_bootstrap failure',
  'a forced failure in the LAST function of the bootstrap chain still aborts the auth.users insert');

select is(
  (select count(*)::int from auth.users where id = 'f1050002-0000-0000-0000-000000000002'),
  0,
  'no auth.users row survives — never a half-account');

select is(
  (select count(*)::int from public.profiles where id = 'f1050002-0000-0000-0000-000000000002'),
  0,
  'no profile survives either, even though it was inserted BEFORE the failing trigger fired');

select is(
  (select count(*)::int from public.user_preferences where user_id = 'f1050002-0000-0000-0000-000000000002'),
  0,
  'no user_preferences row survives either, for the same reason');

select is(
  (select count(*)::int from public.workspaces where created_by = 'f1050002-0000-0000-0000-000000000002'),
  0,
  'no personal workspace survives either — it was inserted, then the AFTER INSERT trigger on it failed');

rollback to savepoint forced_failure;

-- =====================================================================
-- 3. app.tg_workspace_bootstrap() is back to normal after the savepoint
--    rollback (proves the forced-failure test above did not leave a
--    permanent hole)
-- =====================================================================
select tests.mkuser('f1050003-0000-0000-0000-000000000003', 'p1.owner2@test.local', 'Part One Owner Two');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050003-0000-0000-0000-000000000003' and type = 'personal'),
  1,
  'registration creates a personal workspace normally again after the savepoint rollback');

-- =====================================================================
-- 4. the partial unique index rejects a second personal workspace for the
--    same creator (privileged caller — this proves the INDEX itself works,
--    independent of RLS; §6 below proves the RLS layer on top of it)
-- =====================================================================
select throws_ok(
  $$insert into public.workspaces (type, name, slug, owner_id, created_by)
    values ('personal', 'Duplicate Personal', 'duplicate-personal-f1050001',
            'f1050001-0000-0000-0000-000000000001', 'f1050001-0000-0000-0000-000000000001')$$,
  '23505',
  'duplicate key value violates unique constraint "workspaces_one_personal_per_creator"',
  'a second personal workspace for a creator who already has one is rejected BY NAME by the unique index');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050001-0000-0000-0000-000000000001' and type = 'personal'),
  1,
  'the rejected duplicate insert leaves exactly one personal workspace in place');

-- =====================================================================
-- 5. app.tg_workspaces_guard() refuses to change created_by, as themselves
--    (the first half of the exploit an Opus review found: PATCH created_by
--    to null, to defeat the unique index on a later POST)
-- =====================================================================
select tests.login('f1050001-0000-0000-0000-000000000001');

select throws_ok(
  $$update public.workspaces
       set created_by = 'f1050003-0000-0000-0000-000000000003'
     where created_by = 'f1050001-0000-0000-0000-000000000001' and type = 'personal'$$,
  '42501',
  'created_by is immutable — it records who the workspace was made for',
  'an owner cannot change their own personal workspace''s created_by, including to another real user');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050001-0000-0000-0000-000000000001' and type = 'personal'),
  1,
  'the blocked created_by change leaves the workspace exactly as it was');

-- =====================================================================
-- 6. the workspaces_insert policy refuses ANY direct client insert of a
--    personal workspace (the second half of the exploit — even a FIRST
--    personal-type insert by an authenticated client is now refused, not
--    just a second one)
-- =====================================================================
select throws_ok(
  $$insert into public.workspaces (type, name, slug, owner_id, created_by)
    values ('personal', 'Sneaky Personal', 'sneaky-personal-f1050001',
            'f1050001-0000-0000-0000-000000000001', 'f1050001-0000-0000-0000-000000000001')$$,
  '42501', null,
  'an authenticated client cannot insert a personal workspace directly — RLS requires type=''school''');

-- =====================================================================
-- 7. the one legitimate client insert path — a school workspace — still
--    works, unaffected by the tightened policy
-- =====================================================================
select lives_ok(
  $$insert into public.workspaces (type, name, slug, owner_id, created_by)
    values ('school', 'Owner One''s School', 'owner-one-school',
            'f1050001-0000-0000-0000-000000000001', 'f1050001-0000-0000-0000-000000000001')$$,
  'an authenticated client CAN still insert a school workspace directly (owner_id = created_by = self)');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050001-0000-0000-0000-000000000001' and type = 'school'),
  1,
  'the school insert actually landed, and the bootstrap trigger gave it an owner membership too');

select tests.logout();

select * from finish();
rollback;
