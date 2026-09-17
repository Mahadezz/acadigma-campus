-- =====================================================================
-- pgTAP · F-ID-09 Part 1 — the audit substrate built on top of 0003's
-- audit_events / app.tg_audit() / app.log_audit_event() (04_audit_append_only.sql
-- already proves append-only + owner/admin/teacher read scoping; this file
-- proves what 20260917020200_audit_substrate.sql ADDS: the action catalogue,
-- severity/actor_kind/changed_fields/subject_user_id, the universal secret
-- deny-list, the free-text-nulling list, the widened subject-of-the-event
-- read branch, platform-admin cross-workspace read, correlation-id
-- threading, and the read-time redaction view.
-- =====================================================================
begin;
select plan(30);

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
select tests.mkuser('cccccccc-0000-0000-0000-000000000001', 'platform@test.local',  'Platform Staff');

update public.profiles set is_platform_admin = true
 where id = 'cccccccc-0000-0000-0000-000000000001';

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('22222222-2222-2222-2222-222222222222', 'school', 'School B', 'school-b',
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin',   'active', now()),
       ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'teacher', 'active', now());

-- =====================================================================
-- 1. The action catalogue
-- =====================================================================
select ok(
  exists(select 1 from public.audit_action_catalog where action = 'member.role_changed'),
  'the curated catalogue includes member.role_changed');

select is(
  (select severity::text from public.audit_action_catalog where action = 'member.role_changed'),
  'critical', 'member.role_changed is catalogued as critical severity');

select ok(
  exists(select 1 from public.audit_action_catalog where action = 'workspace_members.update' and is_generic),
  'the generic <table>.<op> rows are seeded for every attached table');

-- =====================================================================
-- 2. app.log_audit_event enforces the catalogue (acceptance criterion 17)
-- =====================================================================
select throws_ok(
  $$select app.log_audit_event('not.a.real.action')$$,
  '22023', null,
  'an action absent from the catalogue is rejected, not silently written');

select ok(
  (select app.log_audit_event('account.login', null, 'auth.users', null, null, null) is not null),
  'a catalogued action is accepted and returns a row id');

select is(
  (select severity::text from public.audit_events
    where action = 'account.login' order by id desc limit 1),
  'info', 'severity is stamped from the catalogue, never supplied by the caller');

-- =====================================================================
-- 3. Universal secret deny-list + the free-text list (TG_ARGV[1])
-- =====================================================================
create table tests.scratch (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid,
  title text,
  api_token text,
  notes text
);
select app.attach_audit('tests.scratch', '{}', array['notes']);

insert into tests.scratch (workspace_id, title, api_token, notes)
values ('11111111-1111-1111-1111-111111111111', 'Row one', 'sk-super-secret', 'a private note');

select ok(
  (select not (after ? 'api_token') from public.audit_events
    where table_name = 'tests.scratch' and action = 'scratch.insert' order by id desc limit 1),
  'a column matching the universal secret deny-list (%token%) is dropped even with no explicit redact list');

select ok(
  (select not ('api_token' = any(changed_fields)) from public.audit_events
    where table_name = 'tests.scratch' and action = 'scratch.insert' order by id desc limit 1),
  'the secret column name is also removed from changed_fields');

select ok(
  (select 'notes' = any(changed_fields) from public.audit_events
    where table_name = 'tests.scratch' and action = 'scratch.insert' order by id desc limit 1),
  'a free-text column''s NAME survives in changed_fields');

select ok(
  (select (after ->> 'notes') is null from public.audit_events
    where table_name = 'tests.scratch' and action = 'scratch.insert' order by id desc limit 1),
  'but its VALUE is nulled, never the actual text');

update tests.scratch set title = 'Row one (renamed)'
 where workspace_id = '11111111-1111-1111-1111-111111111111';

select ok(
  (select 'title' = any(changed_fields) from public.audit_events
    where table_name = 'tests.scratch' and action = 'scratch.update' order by id desc limit 1),
  'an ordinary column change is recorded in changed_fields');

-- =====================================================================
-- 4. actor_kind and severity on a trigger-written row
-- =====================================================================
select is(
  (select actor_kind::text from public.audit_events
    where action = 'workspaces.insert'
      and row_id = '11111111-1111-1111-1111-111111111111'),
  'system', 'a row written with no auth.uid() (this migration script) is actor_kind system');

select is(
  (select severity::text from public.audit_events
    where action = 'workspace_members.insert'
      and workspace_id = '11111111-1111-1111-1111-111111111111'
    order by id desc limit 1),
  'info', 'severity for the generic workspace_members.insert action comes from the catalogue');

update public.workspace_members set role = 'staff'
 where workspace_id = '11111111-1111-1111-1111-111111111111'
   and user_id = 'aaaaaaaa-0000-0000-0000-000000000003';

select is(
  (select severity::text from public.audit_events
    where action = 'workspace_members.update'
      and workspace_id = '11111111-1111-1111-1111-111111111111'
    order by id desc limit 1),
  'notable', 'severity for the generic workspace_members.update action comes from the catalogue');

-- =====================================================================
-- 5. correlation id threading
-- =====================================================================
select set_config('app.correlation_id', '99999999-9999-4999-8999-999999999999', true);
insert into tests.scratch (workspace_id, title) values ('11111111-1111-1111-1111-111111111111', 'Correlated row');
select is(
  (select correlation_id::text from public.audit_events
    where table_name = 'tests.scratch' and action = 'scratch.insert'
    order by id desc limit 1),
  '99999999-9999-4999-8999-999999999999',
  'app.current_correlation_id() (set via the transaction-local setting) is persisted on the row');

select lives_ok(
  $$select app.set_correlation_id('88888888-8888-4888-8888-888888888888')$$,
  'app.set_correlation_id is callable directly (service-role/job fallback path)');

select is(
  current_setting('app.correlation_id', true),
  '88888888-8888-4888-8888-888888888888',
  'app.set_correlation_id updates the transaction-local setting');

select set_config('request.headers',
  '{"x-correlation-id":"77777777-7777-4777-8777-777777777777"}', true);
select lives_ok($$select app.pre_request()$$, 'app.pre_request runs without error given request.headers');
select is(
  current_setting('app.correlation_id', true),
  '77777777-7777-4777-8777-777777777777',
  'app.pre_request copies x-correlation-id from request.headers into app.correlation_id');

-- =====================================================================
-- 6. app.hash_request_ip — never the raw address, stable within a day
-- =====================================================================
select is(
  app.hash_request_ip('203.0.113.9'::inet),
  app.hash_request_ip('203.0.113.9'::inet),
  'the same address hashes the same way on the same day');

select isnt(
  app.hash_request_ip('203.0.113.9'::inet),
  app.hash_request_ip('203.0.113.10'::inet),
  'different addresses hash differently');

-- =====================================================================
-- 7. Read policy — subject-of-the-event branch (acceptance criterion 6)
-- =====================================================================
select app.log_audit_event(
  'member.removed', '11111111-1111-1111-1111-111111111111', 'public.workspace_members', null,
  null, null, null, null, null, 'user', 'aaaaaaaa-0000-0000-0000-000000000003');

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');
select ok(
  exists(select 1 from public.audit_events_view
    where action = 'member.removed' and subject_user_id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  'the SUBJECT of an event can read it even without workspace-level read access');
select is(
  (select count(*)::int from public.audit_events_view
    where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'and still cannot read a workspace they are not a member of');
select tests.logout();

-- Regression: the widened policy did not accidentally grant admin read.
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.audit_events_view
    where workspace_id = '11111111-1111-1111-1111-111111111111'
      and action <> 'member.removed'),
  0, 'an admin (not the subject) still cannot read the workspace trail by default');
select tests.logout();

-- =====================================================================
-- 8. Platform staff read across every workspace
-- =====================================================================
select tests.login('cccccccc-0000-0000-0000-000000000001');
select ok(
  (select count(*) from public.audit_events_view where workspace_id = '11111111-1111-1111-1111-111111111111') > 0
  and (select count(*) from public.audit_events_view where workspace_id = '22222222-2222-2222-2222-222222222222') > 0,
  'platform staff read every workspace''s trail');
select tests.logout();

-- =====================================================================
-- 9. The redaction view never exposes the deprecated raw columns
-- =====================================================================
select ok(
  not exists(
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'audit_events_view'
       and column_name in ('ip', 'user_agent')),
  'audit_events_view omits the deprecated raw ip / user_agent columns');

-- =====================================================================
-- 10. The trigger is now attached to every tenant table F-ID-09 names
-- =====================================================================
select ok(
  exists(select 1 from pg_trigger where tgname = 'audit_public_workspace_member_capabilities'),
  'workspace_member_capabilities now has the audit trigger attached');
select ok(
  exists(select 1 from pg_trigger where tgname = 'audit_public_user_preferences'),
  'user_preferences now has the audit trigger attached');
select ok(
  exists(select 1 from pg_trigger where tgname = 'audit_public_device_registrations'),
  'device_registrations now has the audit trigger attached');

select lives_ok(
  $$select app.attach_audit('public.workspaces')$$,
  'attach_audit is idempotent — re-running it on an already-attached table does not error');

select * from finish();
rollback;
