-- =====================================================================
-- pgTAP · F-ID-03 review follow-up — the tripwire always writes, and records
-- the caller's membership status server-side
-- (20260924020000_tenancy_tripwire_membership_status.sql, D-52).
--
-- A pending member (anyone with the invite code) and a removed member must
-- still leave an audit row when they name the school in x-workspace-id; only
-- the severity differs from a true stranger's. Rows are counted as postgres:
-- none of these callers can read audit_events (owner + platform only, D-36).
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
end;
$fn$;

-- ---------------------------------------------------------------------
-- fixtures — one school, its owner, a pending applicant, a removed teacher,
-- and a stranger with no row at all. Written as postgres.
-- ---------------------------------------------------------------------
select tests.mkuser('99990011-0000-0000-0000-000000000001', 'owner@t11.local',    'Owner T11');
select tests.mkuser('99990011-0000-0000-0000-000000000002', 'pending@t11.local',  'Pending T11');
select tests.mkuser('99990011-0000-0000-0000-000000000003', 'removed@t11.local',  'Removed T11');
select tests.mkuser('99990011-0000-0000-0000-000000000004', 'stranger@t11.local', 'Stranger T11');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('99991111-0011-0011-0011-000000000011', 'school', 'T11 School', 't11-school',
        '99990011-0000-0000-0000-000000000001', '99990011-0000-0000-0000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('99991111-0011-0011-0011-000000000011', '99990011-0000-0000-0000-000000000002',
        'teacher', 'pending', now()),
       ('99991111-0011-0011-0011-000000000011', '99990011-0000-0000-0000-000000000003',
        'teacher', 'removed', now());

-- ---------------------------------------------------------------------
-- each caller trips the wire once, as themselves
-- ---------------------------------------------------------------------
select tests.login('99990011-0000-0000-0000-000000000002');
select lives_ok(
  $$select public.log_tenancy_context_rejected('99991111-0011-0011-0011-000000000011')$$,
  'a PENDING member naming the school still trips the wire without error');
select tests.logout();

select tests.login('99990011-0000-0000-0000-000000000003');
select lives_ok(
  $$select public.log_tenancy_context_rejected('99991111-0011-0011-0011-000000000011')$$,
  'a REMOVED member naming the school still trips the wire without error');
select tests.logout();

select tests.login('99990011-0000-0000-0000-000000000004');
select lives_ok(
  $$select public.log_tenancy_context_rejected('99991111-0011-0011-0011-000000000011')$$,
  'a stranger naming the school trips the wire without error');
select tests.logout();

-- ---------------------------------------------------------------------
-- counted as postgres (RLS bypassed): one row each, correctly classified
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.audit_events
    where action = 'tenancy.context_rejected'
      and workspace_id = '99991111-0011-0011-0011-000000000011'),
  3, 'exactly three tripwire rows: none suppressed for pending or removed callers');

select is(
  (select after->>'membership_status' from public.audit_events
    where action = 'tenancy.context_rejected'
      and actor_id = '99990011-0000-0000-0000-000000000002'),
  'pending', 'the pending caller row records membership_status = pending');

select is(
  (select after->>'membership_status' from public.audit_events
    where action = 'tenancy.context_rejected'
      and actor_id = '99990011-0000-0000-0000-000000000003'),
  'removed', 'the removed caller row records membership_status = removed');

select is(
  (select after->>'severity' from public.audit_events
    where action = 'tenancy.context_rejected'
      and actor_id = '99990011-0000-0000-0000-000000000002'),
  'inactive', 'a pending caller is classified inactive, not forgery');

select is(
  (select (after->>'membership_status') || '/' || (after->>'severity') from public.audit_events
    where action = 'tenancy.context_rejected'
      and actor_id = '99990011-0000-0000-0000-000000000004'),
  'none/forgery', 'a caller with no row at all is classified none/forgery');

-- The school owner sees all three through the normal audit read policy:
-- the defensive-visibility reason the row is tagged to the attempted school.
select tests.login('99990011-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.audit_events
    where action = 'tenancy.context_rejected'
      and workspace_id = '99991111-0011-0011-0011-000000000011'),
  3, 'the school owner sees all three tripwire rows');
select tests.logout();

select * from finish();
rollback;
