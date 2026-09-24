-- =====================================================================
-- pgTAP · F-ID-05 Part 1 — automatic personal workspace at registration
--
-- Proves the acceptance criteria that are actually Part 1's (spec §9
-- AC1-AC2, §5 "personal workspaces per user: exactly 1", §10):
--   1. a signup produces exactly one `type='personal'` workspace and one
--      `owner`/`active` membership, in the SAME transaction as the
--      `auth.users` row, and the new owner's role is visible immediately;
--   2. a forced failure inside app.handle_new_user() rolls back the WHOLE
--      signup — no auth.users row, no profile, no workspace ever exists;
--   3. app.handle_new_user() keeps working normally afterwards (the forced
--      failure above is a temporary, transaction-local substitution, not a
--      permanent change to the function under test);
--   4. a second personal workspace for the same creator is rejected at the
--      database layer by `workspaces_one_personal_per_creator`
--      (20260925000100_personal_workspace_uniqueness.sql) — defence in
--      depth behind the application-level "runs once per signup" guarantee.
-- =====================================================================
begin;
select plan(13);

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
-- 2. a forced failure inside app.handle_new_user() rolls back everything
--    (temporary, transaction-local substitution — restored below)
-- =====================================================================
savepoint forced_failure;

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'pgtap forced handle_new_user failure' using errcode = 'P0001';
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
  'P0001', 'pgtap forced handle_new_user failure',
  'a forced trigger failure aborts the auth.users insert itself');

select is(
  (select count(*)::int from auth.users where id = 'f1050002-0000-0000-0000-000000000002'),
  0,
  'no auth.users row survives a forced trigger failure — never a half-account');

select is(
  (select count(*)::int from public.profiles where id = 'f1050002-0000-0000-0000-000000000002'),
  0,
  'no profile survives a forced trigger failure either');

select is(
  (select count(*)::int from public.workspaces where created_by = 'f1050002-0000-0000-0000-000000000002'),
  0,
  'no personal workspace survives a forced trigger failure either');

rollback to savepoint forced_failure;

-- =====================================================================
-- 3. app.handle_new_user() is back to normal after the savepoint rollback
--    (proves the forced-failure test above did not leave a permanent hole)
-- =====================================================================
select tests.mkuser('f1050003-0000-0000-0000-000000000003', 'p1.owner2@test.local', 'Part One Owner Two');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050003-0000-0000-0000-000000000003' and type = 'personal'),
  1,
  'app.handle_new_user() creates a personal workspace normally again after the savepoint rollback');

-- =====================================================================
-- 4. the partial unique index rejects a second personal workspace for the
--    same creator (20260925000100_personal_workspace_uniqueness.sql)
-- =====================================================================
select throws_ok(
  $$insert into public.workspaces (type, name, slug, owner_id, created_by)
    values ('personal', 'Duplicate Personal', 'duplicate-personal-f1050001',
            'f1050001-0000-0000-0000-000000000001', 'f1050001-0000-0000-0000-000000000001')$$,
  '23505', null,
  'a second personal workspace for a creator who already has one is rejected by the unique index');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050001-0000-0000-0000-000000000001' and type = 'personal'),
  1,
  'the rejected duplicate insert leaves exactly one personal workspace in place');

select * from finish();
rollback;
