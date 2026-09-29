-- =====================================================================
-- pgTAP · F-ID-01 Part 7 — account deletion with a 30-day grace
--   (20260929181340_account_deletion.sql, D-113)
--
--   A. Sole-owner guard: the only active owner of a school is blocked and
--      told which school; a co-owner is not.
--   B. Isolation + escalation: a person sees only their own request; no
--      client can insert, update or delete a request directly; another
--      user's cancel touches nothing; anon cannot call the functions; the
--      purge functions are granted to nobody; nobody can set deleted_at.
--   C. Nothing is destroyed before the grace ends: the CHECK refuses an
--      early date, the nightly run skips a pending request, and a direct
--      purge of it is NOT_DUE.
--   D. Cancel, idempotency, 3 requests a day.
--   E. The purge: auth user gone, profile a tombstone, personal workspace
--      gone, school membership 'removed', the school (created_by the
--      purged user) intact, audit_events for the actor intact, other
--      users untouched, a second run a no-op.
--   F. Someone who became a sole owner during the grace is cancelled, not
--      purged.
-- =====================================================================
begin;
select plan(38);

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
--   U  teacher in school S; created school T (owned by C1/C2)
--   O  sole owner of school S
--   C1, C2 co-owners of school T
--   X  a stranger with no school
-- ---------------------------------------------------------------------
select tests.mkuser('39d00000-0000-4000-a000-000000000001', 'del-user@test.local', 'Delia Deleter');
select tests.mkuser('39d00000-0000-4000-a000-000000000002', 'del-owner@test.local', 'Owner Olive');
select tests.mkuser('39d00000-0000-4000-a000-000000000003', 'del-co1@test.local', 'Co Owner One');
select tests.mkuser('39d00000-0000-4000-a000-000000000004', 'del-co2@test.local', 'Co Owner Two');
select tests.mkuser('39d00000-0000-4000-a000-000000000005', 'del-stranger@test.local', 'Stranger Sami');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('39d00000-0000-4000-b000-000000000001', 'school', 'Solo School', 'solo-school-39d',
   '39d00000-0000-4000-a000-000000000002', '39d00000-0000-4000-a000-000000000002', 'active'),
  ('39d00000-0000-4000-b000-000000000002', 'school', 'Shared School', 'shared-school-39d',
   '39d00000-0000-4000-a000-000000000003', '39d00000-0000-4000-a000-000000000001', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at, phone)
values
  ('39d00000-0000-4000-b000-000000000001', '39d00000-0000-4000-a000-000000000001',
   'teacher', 'active', now(), '+8801700000001'),
  ('39d00000-0000-4000-b000-000000000002', '39d00000-0000-4000-a000-000000000004',
   'owner', 'active', now(), null);

-- =====================================================================
-- A. Sole-owner guard
-- =====================================================================
select tests.login('39d00000-0000-4000-a000-000000000002');
select results_eq(
  $$select workspace_id, name from public.account_deletion_blockers()$$,
  $$values ('39d00000-0000-4000-b000-000000000001'::uuid, 'Solo School'::text)$$,
  'A1: the only owner of a school sees that school as the blocker');
select throws_ok(
  $$select public.request_account_deletion()$$,
  'P0001', 'SOLE_OWNER_BLOCKED',
  'A2: the only owner of a school cannot request deletion');

select tests.login('39d00000-0000-4000-a000-000000000003');
select is(
  (select count(*)::int from public.account_deletion_blockers()), 0,
  'A3: a co-owner is not blocked');
select tests.logout();

-- =====================================================================
-- B. Isolation + escalation
-- =====================================================================
select tests.login('39d00000-0000-4000-a000-000000000001');
select ok(
  (select public.request_account_deletion()) >= now() + interval '30 days' - interval '1 minute',
  'B1: a request is scheduled 30 days out');
select is(
  (select public.request_account_deletion()),
  (select r.scheduled_purge_at from public.account_deletion_requests r),
  'B2: a second request returns the same date (idempotent)');
select is(
  (select count(*)::int from public.account_deletion_requests), 1,
  'B3: the requester sees their own request');
select throws_ok(
  $$update public.account_deletion_requests set scheduled_purge_at = now()$$,
  '42501', null,
  'B4: the requester cannot move their purge date');
select throws_ok(
  $$delete from public.account_deletion_requests$$,
  '42501', null,
  'B5: the requester cannot delete their request');
select throws_ok(
  $$update public.profiles set deleted_at = now() where id = '39d00000-0000-4000-a000-000000000001'$$,
  '42501', 'an account is deleted only by the purge job',
  'B6: nobody marks their own profile deleted');

select tests.login('39d00000-0000-4000-a000-000000000005');
select is(
  (select count(*)::int from public.account_deletion_requests), 0,
  'B7: another user sees no one else''s request');
select throws_ok(
  $$insert into public.account_deletion_requests (user_id, scheduled_purge_at, requested_at)
    values ('39d00000-0000-4000-a000-000000000001', now(), now() - interval '31 days')$$,
  '42501', null,
  'B8: no client can insert a request, for anyone');
select is(
  (select public.cancel_account_deletion()), false,
  'B9: another user''s cancel finds nothing of theirs');
select tests.logout();
select is(
  (select status::text from public.account_deletion_requests
    where user_id = '39d00000-0000-4000-a000-000000000001'),
  'pending',
  'B10: ...and the requester''s request is still pending');

set local role anon;
select throws_ok(
  $$select public.request_account_deletion()$$,
  '42501', null,
  'B11: anon cannot request a deletion');
reset role;

select ok(
  not has_function_privilege('authenticated', 'app.purge_account(uuid)', 'execute')
  and not has_function_privilege('service_role', 'app.purge_account(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.run_account_purges()', 'execute')
  and not has_function_privilege('service_role', 'app.run_account_purges()', 'execute'),
  'B12: the purge functions are granted to nobody');
select ok(
  not has_table_privilege('authenticated', 'public.account_deletion_requests', 'insert')
  and not has_table_privilege('authenticated', 'public.account_deletion_requests', 'update')
  and not has_table_privilege('authenticated', 'public.account_deletion_requests', 'delete')
  and not has_table_privilege('anon', 'public.account_deletion_requests', 'select'),
  'B13: clients hold SELECT only');

-- =====================================================================
-- C. Nothing is destroyed before the grace ends
-- =====================================================================
select throws_ok(
  $$insert into public.account_deletion_requests (user_id, scheduled_purge_at)
    values ('39d00000-0000-4000-a000-000000000005', now() + interval '29 days')$$,
  '23514', null,
  'C1: a purge date inside the 30-day grace violates the CHECK, even for postgres');
select is(app.run_account_purges(), 0, 'C2: the nightly run skips a request still in its grace');
select throws_ok(
  format('select app.purge_account(%L)',
    (select id from public.account_deletion_requests
      where user_id = '39d00000-0000-4000-a000-000000000001')),
  '55000', 'NOT_DUE',
  'C3: purging a request still in its grace is refused');
select ok(
  exists (select 1 from auth.users where id = '39d00000-0000-4000-a000-000000000001')
  and (select full_name from public.profiles where id = '39d00000-0000-4000-a000-000000000001') = 'Delia Deleter'
  and exists (select 1 from public.workspaces where type = 'personal'
               and owner_id = '39d00000-0000-4000-a000-000000000001'),
  'C4: during the grace the account, profile and personal workspace are all intact');

-- =====================================================================
-- D. Cancel, then 3 requests a day (the stranger X)
-- =====================================================================
select tests.login('39d00000-0000-4000-a000-000000000005');
select lives_ok($$select public.request_account_deletion()$$, 'D1: X requests');
select is((select public.cancel_account_deletion()), true, 'D2: X keeps the account');
select is(
  (select status::text from public.account_deletion_requests), 'cancelled',
  'D3: the request reads cancelled');
select lives_ok(
  $$do $x$ begin
      perform public.request_account_deletion(); perform public.cancel_account_deletion();
      perform public.request_account_deletion(); perform public.cancel_account_deletion();
    end $x$ $$,
  'D4: two more request/cancel cycles');
select throws_ok(
  $$select public.request_account_deletion()$$,
  '54000', 'RATE_LIMITED',
  'D5: a fourth request in 24 hours is refused');
select tests.logout();

-- =====================================================================
-- E. The purge
-- =====================================================================
-- Evidence written while U was a user: must survive the purge unchanged.
create temp table tmp_u_audit as
  select id from public.audit_events where actor_id = '39d00000-0000-4000-a000-000000000001';

update public.account_deletion_requests
   set requested_at = now() - interval '31 days', scheduled_purge_at = now() - interval '1 day'
 where user_id = '39d00000-0000-4000-a000-000000000001' and status = 'pending';

select is(app.run_account_purges(), 1, 'E1: the nightly run purges the one due account');
select ok(
  not exists (select 1 from auth.users where id = '39d00000-0000-4000-a000-000000000001'),
  'E2: the auth user is deleted');
select results_eq(
  $$select full_name, email, phone, deleted_at is not null
      from public.profiles where id = '39d00000-0000-4000-a000-000000000001'$$,
  $$values ('Deleted user'::text, null::text, null::text, true)$$,
  'E3: the profile is an anonymised tombstone');
select ok(
  not exists (select 1 from public.workspaces where type = 'personal'
               and owner_id = '39d00000-0000-4000-a000-000000000001')
  and not exists (select 1 from public.user_preferences
                   where user_id = '39d00000-0000-4000-a000-000000000001'),
  'E4: the personal workspace and preferences are gone');
select results_eq(
  $$select status::text, phone from public.workspace_members
     where user_id = '39d00000-0000-4000-a000-000000000001'$$,
  $$values ('removed'::text, null::text)$$,
  'E5: the school membership reads removed, its phone nulled');
select is(
  (select created_by from public.workspaces where id = '39d00000-0000-4000-b000-000000000002'),
  '39d00000-0000-4000-a000-000000000001'::uuid,
  'E6: the school the purged user created is untouched and still names them');
select is(
  (select count(*)::int from public.audit_events a join tmp_u_audit t on t.id = a.id),
  (select count(*)::int from tmp_u_audit),
  'E7: every audit row written by the purged user survives');
select ok(
  (select status::text from public.account_deletion_requests
    where user_id = '39d00000-0000-4000-a000-000000000001' and completed_at is not null) = 'completed'
  and exists (select 1 from public.audit_events
               where action = 'account.deletion_purged'
                 and subject_user_id = '39d00000-0000-4000-a000-000000000001'),
  'E8: the request is completed and the purge is itself audited');
select ok(
  (select full_name from public.profiles where id = '39d00000-0000-4000-a000-000000000005') = 'Stranger Sami'
  and (select count(*) from public.workspace_members
        where workspace_id = '39d00000-0000-4000-b000-000000000001' and status = 'active') = 1,
  'E9: nobody else''s account or membership changed');
select is(app.run_account_purges(), 0, 'E10: a second run is a no-op');

-- =====================================================================
-- F. Became a sole owner during the grace → cancelled, not purged
-- =====================================================================
select tests.login('39d00000-0000-4000-a000-000000000003');
select lives_ok($$select public.request_account_deletion()$$, 'F1: co-owner C1 requests');
select tests.logout();

update public.workspace_members set status = 'removed'
 where workspace_id = '39d00000-0000-4000-b000-000000000002'
   and user_id = '39d00000-0000-4000-a000-000000000004';
update public.account_deletion_requests
   set requested_at = now() - interval '31 days', scheduled_purge_at = now() - interval '1 day'
 where user_id = '39d00000-0000-4000-a000-000000000003' and status = 'pending';

select is(app.run_account_purges(), 0, 'F2: the run purges nobody');
select ok(
  (select status::text || ':' || last_error from public.account_deletion_requests
    where user_id = '39d00000-0000-4000-a000-000000000003') = 'cancelled:SOLE_OWNER_BLOCKED'
  and (select full_name from public.profiles where id = '39d00000-0000-4000-a000-000000000003') = 'Co Owner One'
  and exists (select 1 from auth.users where id = '39d00000-0000-4000-a000-000000000003'),
  'F3: the request is cancelled with the reason and the account is intact');

select * from finish();
rollback;
