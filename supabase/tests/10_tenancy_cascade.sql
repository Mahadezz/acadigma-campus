-- =====================================================================
-- pgTAP · F-ID-03 review follow-up — the tenant-freeze trigger vs. an
-- ON DELETE SET NULL cascade (20260924010000_tenancy_freeze_cascade_exception.sql)
--
-- Two things have to both be true, and they were previously in tension:
--   1. Hard-deleting a workspace that has a data_requests row must SUCCEED,
--      with that row's workspace_id nulled by the FK cascade (a DSAR outlives
--      the school it names).
--   2. A direct client attempt to move a data_requests row to another
--      workspace — or to null it out other than via an actual workspace
--      delete — must still raise, exactly as app.tg_freeze_workspace has
--      always enforced for every tenant table.
-- =====================================================================
begin;
select plan(5);

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
-- fixtures — an owner of two schools (D and E, same shape as 09_tenancy.sql's
-- reparenting fixture) plus a throwaway third school (F) to actually delete.
-- ---------------------------------------------------------------------
select tests.mkuser('99990010-0000-0000-0000-000000000001', 'owner.cascade@t10.local', 'Owner Cascade');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('99991010-1010-1010-1010-101010101010', 'school', 'T10 School D', 't10-school-d',
        '99990010-0000-0000-0000-000000000001', '99990010-0000-0000-0000-000000000001'),
       ('99991020-2020-2020-2020-202020202020', 'school', 'T10 School E', 't10-school-e',
        '99990010-0000-0000-0000-000000000001', '99990010-0000-0000-0000-000000000001'),
       ('99991030-3030-3030-3030-303030303030', 'school', 'T10 School F (to be deleted)', 't10-school-f',
        '99990010-0000-0000-0000-000000000001', '99990010-0000-0000-0000-000000000001');

-- One data_requests row per school this file needs. Inserted as postgres --
-- the RLS insert policy (requester = self, status = 'received') is not what
-- this file is testing.
insert into public.data_requests (id, workspace_id, requester_user_id, subject_type, kind, status)
values ('99990010-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99991010-1010-1010-1010-101010101010',
        '99990010-0000-0000-0000-000000000001', 'self', 'export', 'received'),
       ('99990010-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '99991030-3030-3030-3030-303030303030',
        '99990010-0000-0000-0000-000000000001', 'self', 'export', 'received');

-- =====================================================================
-- 1. A direct client re-parent is still blocked, even for an owner of BOTH
--    the source and target workspace (the exact shape D-36/this migration's
--    own comment warns a role-predicate-only WITH CHECK would otherwise
--    approve) — depth 1, not the cascade, so the exception never applies.
-- =====================================================================
select tests.login('99990010-0000-0000-0000-000000000001');

select throws_ok(
  $$update public.data_requests
       set workspace_id = '99991020-2020-2020-2020-202020202020'
     where id = '99990010-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501', 'workspace_id is immutable',
  'a direct client UPDATE re-parenting data_requests to another workspace still raises, even for an owner of both ends');

-- =====================================================================
-- 2. A direct client attempt to null the column out (mimicking the cascade's
--    OWN transition, but NOT actually via a workspace delete) is also
--    blocked: pg_trigger_depth() is 1 for a plain client statement.
-- =====================================================================
select throws_ok(
  $$update public.data_requests
       set workspace_id = null
     where id = '99990010-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501', 'workspace_id is immutable',
  'a direct client UPDATE nulling workspace_id still raises — only the FK cascade''s own nested call may do this');

select tests.logout();

-- Untouched by both blocked attempts above.
select is(
  (select workspace_id from public.data_requests where id = '99990010-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '99991010-1010-1010-1010-101010101010'::uuid,
  'data_requests.workspace_id is byte-for-byte unchanged after both blocked attempts');

-- =====================================================================
-- 3. The actual fix: hard-deleting a workspace with a data_requests row
--    succeeds, and the row survives with workspace_id nulled. Only postgres
--    can issue this DELETE — public.workspaces has no client DELETE grant
--    (F-ID-03 §3: "archiving is an update").
-- =====================================================================
select lives_ok(
  $$delete from public.workspaces where id = '99991030-3030-3030-3030-303030303030'$$,
  'deleting a workspace with a data_requests row succeeds (the freeze trigger allows the ON DELETE SET NULL transition)');

select is(
  (select workspace_id from public.data_requests where id = '99990010-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null,
  'the data_requests row survives the workspace delete, with workspace_id nulled by the cascade');

select * from finish();
rollback;
