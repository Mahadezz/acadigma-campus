-- =====================================================================
-- pgTAP · tenant isolation
-- A member of workspace A can neither read nor write workspace B.
-- This is the regression test for the Base44 root cause: RLS anchored to a
-- client-writable `active_workspace_id`.
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
end;
$fn$;

-- ---------------------------------------------------------------------
-- fixtures
-- ---------------------------------------------------------------------
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000001', 'owner.a@test.local',   'Owner A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000002', 'teacher.a@test.local', 'Teacher A');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000001', 'owner.b@test.local',   'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('22222222-2222-2222-2222-222222222222', 'school', 'School B', 'school-b',
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'teacher', 'active', now());

insert into public.custom_labels (id, workspace_id, base_role, name, created_by)
values ('cccc1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'teacher', 'Senior Teacher', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('cccc2222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        'teacher', 'Head of Science', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.files (id, workspace_id, owner_id, bucket, path, original_name,
                          mime_type, size_bytes, visibility, created_by)
values ('ffff1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'private', 'a/roster.pdf', 'roster.pdf',
        'application/pdf', 1024, 'workspace', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('ffff2222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-0000-0000-0000-000000000001', 'private', 'b/roster.pdf', 'roster.pdf',
        'application/pdf', 2048, 'workspace', 'bbbbbbbb-0000-0000-0000-000000000001');

-- =====================================================================
-- reads
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');   -- teacher in A

select is(
  (select count(*)::int from public.workspaces where id = '22222222-2222-2222-2222-222222222222'),
  0, 'workspaces: A cannot see workspace B');

select is(
  (select count(*)::int from public.workspaces where id = '11111111-1111-1111-1111-111111111111'),
  1, 'workspaces: A can see its own workspace');

select is(
  (select count(*)::int from public.school_profiles where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'school_profiles: A cannot read B''s school settings');

select is(
  (select count(*)::int from public.workspace_members where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'workspace_members: A cannot enumerate B''s staff');

select is(
  (select count(*)::int from public.custom_labels where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'custom_labels: A cannot read B''s labels');

select is(
  (select count(*)::int from public.custom_labels where workspace_id = '11111111-1111-1111-1111-111111111111'),
  1, 'custom_labels: A can read its own labels');

select is(
  (select count(*)::int from public.files where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'files: A cannot read B''s files');

select is(
  (select count(*)::int from public.files where workspace_id = '11111111-1111-1111-1111-111111111111'),
  1, 'files: workspace-visible files are readable by members');

select is(
  (select count(*)::int from public.subscriptions where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'subscriptions: A cannot read B''s billing state');

select is(
  (select count(*)::int from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
  0, 'profiles: A cannot read a person who shares no workspace with them');

select is(
  (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  1, 'profiles: A can read a colleague in the same workspace');

-- =====================================================================
-- writes
-- =====================================================================
select throws_ok(
  $$insert into public.custom_labels (workspace_id, base_role, name, created_by)
    values ('22222222-2222-2222-2222-222222222222', 'teacher', 'Injected',
            'aaaaaaaa-0000-0000-0000-000000000002')$$,
  '42501', null,
  'custom_labels: A cannot insert into B');

select throws_ok(
  $$insert into public.files (workspace_id, owner_id, bucket, path, original_name,
                              mime_type, size_bytes, created_by)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002',
            'private', 'b/injected.pdf', 'injected.pdf', 'application/pdf', 10,
            'aaaaaaaa-0000-0000-0000-000000000002')$$,
  '42501', null,
  'files: A cannot upload into B');

select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('22222222-2222-2222-2222-222222222222',
            'aaaaaaaa-0000-0000-0000-000000000002', 'owner', 'active')$$,
  '42501', null,
  'workspace_members: A cannot self-appoint into B (Base44 finding 2)');

-- RLS filters rows for UPDATE and DELETE rather than raising: the statement
-- succeeds and touches nothing. Asserting an error here would be a test that
-- passes for the wrong reason, so assert the row count instead.
with attempted as (
  update public.custom_labels set name = 'Hijacked'
   where id = 'cccc2222-0000-0000-0000-000000000002'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'custom_labels: an update aimed at B affects ZERO rows...');

select tests.logout();

select is(
  (select name from public.custom_labels where id = 'cccc2222-0000-0000-0000-000000000002'),
  'Head of Science',
  '...and B''s row is byte-for-byte unchanged');

-- =====================================================================
-- a tenant row can never be moved to another tenant
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner of A
select throws_ok(
  $$update public.custom_labels
       set workspace_id = '22222222-2222-2222-2222-222222222222'
     where id = 'cccc1111-0000-0000-0000-000000000001'$$,
  '42501', null,
  'custom_labels: workspace_id is immutable (tenant freeze trigger)');
select tests.logout();

-- =====================================================================
-- the personal workspace created at registration is private
-- =====================================================================
select tests.login('bbbbbbbb-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.workspaces where type = 'personal'),
  1, 'each user sees exactly one personal workspace — their own (1.2)');
select tests.logout();

-- =====================================================================
-- helper functions cannot be reached by anon at all
-- =====================================================================
select ok(
  not has_schema_privilege('anon', 'app', 'usage'),
  'anon has no USAGE on the app schema');

select ok(
  not has_table_privilege('anon', 'public.workspace_members', 'select'),
  'anon has no SELECT on workspace_members');

select * from finish();
rollback;
