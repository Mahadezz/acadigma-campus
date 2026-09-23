-- =====================================================================
-- pgTAP · F-ID-03 Part 1 demo — the four Base44 security-review attack
-- paths, dead at the database level, with zero application code deployed.
--
--   1. Self-role escalation           (finding 2 / F-ID-03 §9 AC3)
--   2. Cross-tenant read/write        (finding 1 / F-ID-03 §9 AC1)
--   3. Membership self-insert-as-owner (finding 2 / F-ID-03 §9 AC2)
--   4. Removed-member access          (finding 6 / F-ID-03 §9 AC6)
--
-- 02_tenant_isolation.sql and 03_role_escalation.sql already cover most of
-- this ground table by table; this file is the one-stop version CI shows for
-- the Part 1 demo, PLUS the net-new surface this migration adds on top of
-- 0002: the `public.switch_workspace` / `public.list_my_workspaces` RPCs
-- (DECISION-LOG D-50), the `tenancy.context_rejected` tripwire, and the
-- `school_profiles` tenant-freeze gap this migration closes.
-- =====================================================================
begin;
select plan(31);

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
-- fixtures — two schools, A and B
-- ---------------------------------------------------------------------
select tests.mkuser('99990001-0000-0000-0000-000000000001', 'owner.a@t09.local',   'Owner A');
select tests.mkuser('99990001-0000-0000-0000-000000000002', 'teacher.a@t09.local', 'Teacher A');
select tests.mkuser('99990002-0000-0000-0000-000000000001', 'owner.b@t09.local',   'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('99991111-1111-1111-1111-111111111111', 'school', 'T09 School A', 't09-school-a',
        '99990001-0000-0000-0000-000000000001', '99990001-0000-0000-0000-000000000001'),
       ('99992222-2222-2222-2222-222222222222', 'school', 'T09 School B', 't09-school-b',
        '99990002-0000-0000-0000-000000000001', '99990002-0000-0000-0000-000000000001'),
       -- Owned by the SAME person as School A — the realistic case for the
       -- reparenting test below: a consultant who legitimately owns two
       -- schools. If the only guard were the WITH CHECK role predicate, this
       -- update would PASS (owner A holds owner/admin on both ends), which is
       -- exactly the degenerate-template gap D-36 and this migration close.
       ('99993333-3333-3333-3333-333333333333', 'school', 'T09 School C (same owner as A)',
        't09-school-c', '99990001-0000-0000-0000-000000000001',
        '99990001-0000-0000-0000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('99991111-1111-1111-1111-111111111111', '99990001-0000-0000-0000-000000000002',
        'teacher', 'active', now());

-- =====================================================================
-- attack path 1 — self-role escalation (Base44 finding 2)
-- =====================================================================
select tests.login('99990001-0000-0000-0000-000000000002');  -- teacher A

select throws_ok(
  $$update public.workspace_members set role = 'owner'
     where workspace_id = '99991111-1111-1111-1111-111111111111'
       and user_id = '99990001-0000-0000-0000-000000000002'$$,
  '42501', null,
  'attack 1: a member cannot promote their own role, at any target role');

select throws_ok(
  $$update public.workspace_members set status = 'active', role = 'admin'
     where workspace_id = '99991111-1111-1111-1111-111111111111'
       and user_id = '99990001-0000-0000-0000-000000000002'$$,
  '42501', null,
  'attack 1: the guard trigger raises before can() is even reached (AC3)');

select tests.logout();

-- =====================================================================
-- attack path 2 — cross-tenant read/write (Base44 finding 1)
-- =====================================================================
select tests.login('99990001-0000-0000-0000-000000000002');  -- teacher A

select is(
  (select count(*)::int from public.workspaces
    where id = '99992222-2222-2222-2222-222222222222'),
  0, 'attack 2: a member of A cannot see workspace B at all (AC1)');

select is(
  (select count(*)::int from public.school_profiles
    where workspace_id = '99992222-2222-2222-2222-222222222222'),
  0, 'attack 2: A cannot read B''s school profile');

select throws_ok(
  $$insert into public.custom_labels (workspace_id, base_role, name, created_by)
    values ('99992222-2222-2222-2222-222222222222', 'teacher', 'Injected',
            '99990001-0000-0000-0000-000000000002')$$,
  '42501', null,
  'attack 2: A cannot insert into B''s tables');

-- The zero-rows-affected pattern (README.md): a USING clause filters, it does
-- not raise, for UPDATE/DELETE.
with attempted as (
  update public.workspaces set name = 'Hijacked'
   where id = '99992222-2222-2222-2222-222222222222'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'attack 2: an update aimed at B''s workspace row affects ZERO rows');

select tests.logout();

select is(
  (select name from public.workspaces where id = '99992222-2222-2222-2222-222222222222'),
  'T09 School B',
  'attack 2: ...and B''s workspace is byte-for-byte unchanged');

-- school_profiles re-parenting: this migration's own fix. Owner A legitimately
-- holds owner/admin on BOTH A and C, so the WITH CHECK role predicate alone
-- would happily approve moving A's profile onto C — only the freeze trigger
-- this migration attaches stops it.
select tests.login('99990001-0000-0000-0000-000000000001');  -- owner of A AND C
select throws_ok(
  $$update public.school_profiles
       set workspace_id = '99993333-3333-3333-3333-333333333333'
     where workspace_id = '99991111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'attack 2: school_profiles.workspace_id is immutable even for an owner of both ends (this migration''s freeze fix)');
select tests.logout();

-- =====================================================================
-- attack path 3 — membership self-insert as owner (Base44 finding 2)
-- =====================================================================
select tests.login('99990001-0000-0000-0000-000000000002');  -- teacher A, has no role in B

select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('99992222-2222-2222-2222-222222222222',
            '99990001-0000-0000-0000-000000000002', 'owner', 'active')$$,
  '42501', null,
  'attack 3: cannot self-appoint as owner of a workspace never joined (AC2)');

select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('99991111-1111-1111-1111-111111111111',
            '99990001-0000-0000-0000-000000000002', 'owner', 'active')
    on conflict (workspace_id, user_id) do update set role = 'owner', status = 'active'$$,
  '42501', null,
  'attack 3: cannot self-escalate an existing membership to owner via upsert either');

select tests.logout();

-- =====================================================================
-- attack path 4 — removed member loses access on the next request
-- (Base44 finding 6: status='removed' was declared and never enforced)
-- =====================================================================
select tests.login('99990001-0000-0000-0000-000000000001');  -- owner A removes teacher A
update public.workspace_members
   set status = 'removed'
 where workspace_id = '99991111-1111-1111-1111-111111111111'
   and user_id = '99990001-0000-0000-0000-000000000002';
select tests.logout();

select is(
  (select status from public.workspace_members
    where workspace_id = '99991111-1111-1111-1111-111111111111'
      and user_id = '99990001-0000-0000-0000-000000000002'),
  'removed',
  'attack 4: the row is never deleted — status flips to removed (PRODUCT-DECISIONS 1.14)');

select tests.login('99990001-0000-0000-0000-000000000002');  -- the removed teacher, same session token

select is(
  (select count(*)::int from public.workspaces
    where id = '99991111-1111-1111-1111-111111111111'),
  0, 'attack 4: removed from A -> the NEXT request sees zero rows of A (AC6)');

select is(
  (select count(*)::int from public.school_profiles
    where workspace_id = '99991111-1111-1111-1111-111111111111'),
  0, 'attack 4: ...including the school profile');

select is(
  app.member_role('99991111-1111-1111-1111-111111111111'), null,
  'attack 4: app.member_role() returns null for a removed member (helper correctness)');

select is(
  (select count(*)::int from public.workspace_members
    where workspace_id = '99991111-1111-1111-1111-111111111111'),
  1, 'attack 4: the removed member sees only their own row, never the rest of the roster');

select tests.logout();

-- =====================================================================
-- this migration's RPCs (D-50): switch_workspace / list_my_workspaces /
-- the tenancy.context_rejected tripwire
-- =====================================================================
-- Fixture work runs as postgres: tests.mkuser() inserts into auth.users, which
-- the authenticated role may not touch (CI failed here with 'permission denied
-- for table users' while still logged in as teacher A from attack 4).
-- A fresh user keeps this section legible on its own, independent of attack 4's
-- removal above.
select tests.mkuser('99990001-0000-0000-0000-000000000003', 'teacher.a2@t09.local', 'Teacher A2');
insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('99991111-1111-1111-1111-111111111111', '99990001-0000-0000-0000-000000000003',
        'teacher', 'active', now());
select tests.logout();

select tests.login('99990001-0000-0000-0000-000000000003');

select is(
  (select role from public.switch_workspace('99991111-1111-1111-1111-111111111111')),
  'teacher'::public.member_role,
  'switch_workspace: succeeds for an active member and returns their role');

select is(
  (select last_active_workspace_id from public.profiles
    where id = '99990001-0000-0000-0000-000000000003'),
  '99991111-1111-1111-1111-111111111111'::uuid,
  'switch_workspace: records the choice on profiles.last_active_workspace_id');

select throws_ok(
  $$select * from public.switch_workspace('99992222-2222-2222-2222-222222222222')$$,
  '42501', 'WORKSPACE_NOT_MEMBER',
  'switch_workspace: refuses a workspace the caller never joined, by name (§7)');

select is(
  (select count(*)::int from public.list_my_workspaces()
    where workspace_id = '99991111-1111-1111-1111-111111111111'),
  1, 'list_my_workspaces: includes the caller''s own membership');

select tests.logout();

-- ---------------------------------------------------------------------
-- switch_workspace's two gates, each proven on its own.
-- ---------------------------------------------------------------------
-- Gate 1 — membership status. A `pending` membership is not a membership
-- (app.member_role() agrees; see 01_app_helpers.sql). Join-by-code lands a
-- user exactly here, and the switcher does render them as "Pending approval"
-- from list_my_workspaces — but the switch itself must be refused with the
-- same error a total stranger gets.
select tests.mkuser('99990001-0000-0000-0000-000000000004', 'pending.a@t09.local', 'Pending A');
insert into public.workspace_members (workspace_id, user_id, role, status)
values ('99991111-1111-1111-1111-111111111111', '99990001-0000-0000-0000-000000000004',
        'teacher', 'pending');

select tests.login('99990001-0000-0000-0000-000000000004');

select throws_ok(
  $$select * from public.switch_workspace('99991111-1111-1111-1111-111111111111')$$,
  '42501', 'WORKSPACE_NOT_MEMBER',
  'switch_workspace: a PENDING member cannot switch in (status = ''active'' only)');

-- The point of the gate: a refused switch must not have moved the hint the
-- resolution chain reads. (It is non-null — app.handle_new_user() points it at
-- the personal workspace on signup — so assert what it is NOT.)
select isnt(
  (select last_active_workspace_id from public.profiles
    where id = '99990001-0000-0000-0000-000000000004'),
  '99991111-1111-1111-1111-111111111111'::uuid,
  'switch_workspace: a refused switch never writes the target to last_active_workspace_id');

select is(
  (select count(*)::int from public.list_my_workspaces()
    where workspace_id = '99991111-1111-1111-1111-111111111111'
      and status = 'pending'),
  1, 'list_my_workspaces: still shows the pending row, so the UI can say "Pending approval"');

select tests.logout();

-- Gate 2 — workspace status, as an ALLOWLIST. `archived` is already a
-- workspace_status value and was switchable while this check denylisted only
-- 'suspended'. Owner A is an active owner of School C, so membership passes
-- and the workspace's status is the only thing left that can reject it.
update public.workspaces set status = 'archived'
 where id = '99993333-3333-3333-3333-333333333333';

select tests.login('99990001-0000-0000-0000-000000000001');

select throws_ok(
  $$select * from public.switch_workspace('99993333-3333-3333-3333-333333333333')$$,
  '42501', 'WORKSPACE_UNAVAILABLE',
  'switch_workspace: an ARCHIVED workspace is refused even for its own owner (allowlist, not denylist)');

select tests.logout();

update public.workspaces set status = 'active'
 where id = '99993333-3333-3333-3333-333333333333';

select tests.login('99990001-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.list_my_workspaces()
    where workspace_id = '99992222-2222-2222-2222-222222222222'),
  0, 'list_my_workspaces: never includes a workspace the caller never joined');

-- The tripwire itself: any authenticated user may call it (it only ever
-- records what workspace id was attempted, never grants access to anything).
select lives_ok(
  $$select public.log_tenancy_context_rejected('99992222-2222-2222-2222-222222222222')$$,
  'log_tenancy_context_rejected: does not raise for an authenticated caller');

select is(
  (select count(*)::int from public.audit_events
    where action = 'tenancy.context_rejected'
      and workspace_id = '99992222-2222-2222-2222-222222222222'),
  1, 'log_tenancy_context_rejected: writes exactly one audit_events row, tagged to the attempted workspace');

select throws_ok(
  $$select public.log_tenancy_context_rejected(null)$$,
  '22023', null,
  'log_tenancy_context_rejected: refuses a null attempted-workspace id');

select tests.logout();

-- anon can reach none of this migration's new functions.
select ok(
  not has_function_privilege('anon', 'public.switch_workspace(uuid)', 'execute'),
  'anon cannot execute switch_workspace');
select ok(
  not has_function_privilege('anon', 'public.list_my_workspaces()', 'execute'),
  'anon cannot execute list_my_workspaces');
select ok(
  not has_function_privilege('anon', 'public.log_tenancy_context_rejected(uuid)', 'execute'),
  'anon cannot execute log_tenancy_context_rejected');

-- =====================================================================
-- the tenant-freeze template, checked mechanically rather than by eye
-- ---------------------------------------------------------------------
-- `school_profiles` was missed by 0002 because its `workspace_id` is also
-- its primary key, and `data_requests`/`notifications` were missed by the
-- first draft of 0006 because the audit was done by reading the migration
-- files. Both are the same failure: a human enumerating tenant tables. This
-- assertion enumerates them from the catalogue instead, so the NEXT table
-- that grants UPDATE to `authenticated` and carries a `workspace_id` fails
-- CI on the day it is added rather than in a security review.
--
-- `workspace_members` is the one legitimate exemption: it has no freeze
-- trigger because app.tg_workspace_members_guard() already raises on any
-- change to workspace_id or user_id (0002 §10.6), which is strictly
-- stricter than the generic freeze.
-- =====================================================================
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a
       on a.attrelid = c.oid and a.attname = 'workspace_id'
      and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public'
      and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'UPDATE')
      and c.relname <> 'workspace_members'
      and not exists (
            select 1
              from pg_trigger t
             where t.tgrelid = c.oid
               and not t.tgisinternal
               and t.tgfoid = 'app.tg_freeze_workspace'::regproc)),
  '',
  'every client-UPDATE-able table with a workspace_id carries app.tg_freeze_workspace (D-36)');

select * from finish();
rollback;
