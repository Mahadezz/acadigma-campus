-- =====================================================================
-- pgTAP · audit_events is written by the server and can never be rewritten
-- Regression test for Base44 security review finding 5 ("the audit trail is
-- not evidence"): browser-written, RLS-free, and updated in place.
-- =====================================================================
begin;
select plan(14);

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
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000002', 'admin.a@test.local',   'Admin A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000003', 'teacher.a@test.local', 'Teacher A');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000001', 'owner.b@test.local',   'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('22222222-2222-2222-2222-222222222222', 'school', 'School B', 'school-b',
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin',   'active', now()),
       ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'teacher', 'active', now());

-- =====================================================================
-- the trigger records what happened
-- =====================================================================
select is(
  (select count(*)::int from public.audit_events
    where workspace_id = '11111111-1111-1111-1111-111111111111'
      and action = 'workspaces.insert'),
  1, 'creating a workspace writes exactly one audit row');

select is(
  (select count(*)::int from public.audit_events
    where workspace_id = '11111111-1111-1111-1111-111111111111'
      and action = 'workspace_members.insert'),
  3, 'the owner bootstrap plus two members are all audited');

update public.workspaces set name = 'School A (renamed)'
 where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select (before ->> 'name') || ' -> ' || (after ->> 'name')
     from public.audit_events
    where action = 'workspaces.update'
      and row_id = '11111111-1111-1111-1111-111111111111'
    order by id desc limit 1),
  'School A -> School A (renamed)',
  'an update records both the before and the after image');

-- secrets never reach the log
insert into public.workspace_invitations
  (workspace_id, channel, email, role, token_hash, token_prefix, invited_by)
values
  ('11111111-1111-1111-1111-111111111111', 'email', 'invitee@test.local', 'teacher',
   app.hash_token('super-secret-token'), 'super-se', 'aaaaaaaa-0000-0000-0000-000000000001');

select ok(
  (select not (after ? 'token_hash') and not (after ? 'token_prefix')
     from public.audit_events
    where action = 'workspace_invitations.insert'
    order by id desc limit 1),
  'the invitation token is redacted from the audit payload');

select ok(
  (select after ->> 'email' = 'i***@test.local'
     from public.audit_events
    where action = 'workspace_invitations.insert'
    order by id desc limit 1),
  'but the rest of the row is still recorded, the address masked at write time (F-ID-09 §5.3)');

-- =====================================================================
-- append-only, for everyone
-- =====================================================================
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'insert'),
          'authenticated has no INSERT on audit_events');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'update'),
          'authenticated has no UPDATE on audit_events');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'delete'),
          'authenticated has no DELETE on audit_events');

select throws_ok(
  $$update public.audit_events set action = 'tampered'
     where id = (select min(id) from public.audit_events)$$,
  '42501', null,
  'UPDATE on audit_events is refused even for a privileged caller');

select throws_ok(
  $$delete from public.audit_events
     where id = (select min(id) from public.audit_events)$$,
  '42501', null,
  'DELETE on audit_events is refused even for a privileged caller');

-- =====================================================================
-- who may read it (PRODUCT-DECISIONS 6.8: owners and platform staff)
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select ok(
  (select count(*) from public.audit_events
    where workspace_id = '11111111-1111-1111-1111-111111111111') > 0,
  'the workspace owner can read their own audit log');
select is(
  (select count(*)::int from public.audit_events
    where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'and cannot read another workspace''s audit log');
select tests.logout();

-- Scoped to the school workspace: handle_new_user() also bootstraps each
-- caller's own personal workspace (+ membership + subscription), which they
-- own and may legitimately read the audit trail of. That is not the leak
-- under test here — school A's audit log is.
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.audit_events
    where workspace_id = '11111111-1111-1111-1111-111111111111'),
  0, 'an admin cannot read the audit log — it has to be able to record what an admin did');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.audit_events
    where workspace_id = '11111111-1111-1111-1111-111111111111'),
  0, 'a teacher cannot read the audit log');
select tests.logout();

select * from finish();
rollback;
