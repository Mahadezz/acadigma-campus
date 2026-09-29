-- =====================================================================
-- pgTAP · F-ID-03 Part 5 — Team & Access roster (20260929015813_team_roster.sql, D-110)
--
--   A. public.list_workspace_members: an owner or admin reads their own
--      school's pending / active / removed staff with names (a pending
--      joiner's profile is otherwise invisible to them), parents excluded;
--      search by name or email; keyset paging newest first; limit clamped.
--   B. Isolation + escalation on the read: teacher, staff, parent, a
--      pending member, another school's owner, a stranger and anon are
--      all refused.
--   C. Approve / reject are plain UPDATEs of workspace_members.status: an
--      admin approves (joined_at stamped) and rejects (removed_at/by
--      stamped, joined_at stays null — the "rejected" marker the roster
--      shows); a teacher, another school's owner and the joiner themselves
--      cannot; a read-only school refuses approval but allows rejection.
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
  perform set_config('app.correlation_id', '', true);
end;
$fn$;

-- The names on one roster page, as the caller.
create or replace function tests.names(
  p_status public.member_status, p_q text default null,
  p_after uuid default null, p_limit integer default 25)
returns text[] language sql as $fn$
  select coalesce(array_agg(r.full_name), '{}')
    from public.list_workspace_members('39a00000-0000-4000-b000-000000000001',
                                       p_status, p_q, p_after, p_limit) r
$fn$;

create or replace function tests.status_of(p_member uuid)
returns text language sql security definer as $fn$
  select status::text from public.workspace_members where id = p_member
$fn$;

-- School B's owner membership id (invisible to school A's owner).
create or replace function tests.owner_b_member()
returns uuid language sql security definer as $fn$
  select id from public.workspace_members
   where workspace_id = '39a00000-0000-4000-b000-000000000002' and role = 'owner'
$fn$;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner O, admin AD, teacher T, staff S,
-- parent PA (active); pending joiners P1 (older) and P2 (newer); R, who
-- was active and then removed. School B: owner OB. Stranger X.
-- ---------------------------------------------------------------------
select tests.mkuser('39a00000-0000-4000-a000-000000000001', 'tr-owner@test.local', 'Owner Olive');
select tests.mkuser('39a00000-0000-4000-a000-000000000002', 'tr-admin@test.local', 'Admin Adil');
select tests.mkuser('39a00000-0000-4000-a000-000000000003', 'tr-teacher@test.local', 'Teacher Tania');
select tests.mkuser('39a00000-0000-4000-a000-000000000004', 'tr-staff@test.local', 'Staff Sumon');
select tests.mkuser('39a00000-0000-4000-a000-000000000005', 'tr-parent@test.local', 'Parent Parvin');
select tests.mkuser('39a00000-0000-4000-a000-000000000006', 'tr-p1@test.local', 'Pending Pritom');
select tests.mkuser('39a00000-0000-4000-a000-000000000007', 'tr-p2@test.local', 'Pending Rupa');
select tests.mkuser('39a00000-0000-4000-a000-000000000008', 'tr-removed@test.local', 'Removed Rahim');
select tests.mkuser('39a00000-0000-4000-a000-000000000009', 'tr-ownerb@test.local', 'Owner B');
select tests.mkuser('39a00000-0000-4000-a000-000000000010', 'tr-x@test.local', 'Stranger X');
select tests.mkuser('39a00000-0000-4000-a000-000000000011', 'tr-p3@test.local', 'Pending Three');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('39a00000-0000-4000-b000-000000000001', 'school', 'Roster School', 'roster-school-39a',
   '39a00000-0000-4000-a000-000000000001', '39a00000-0000-4000-a000-000000000001', 'active'),
  ('39a00000-0000-4000-b000-000000000002', 'school', 'Other School', 'other-school-39a',
   '39a00000-0000-4000-a000-000000000009', '39a00000-0000-4000-a000-000000000009', 'active');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at, created_at)
values
  ('39a00000-0000-4000-e000-000000000002', '39a00000-0000-4000-b000-000000000001',
   '39a00000-0000-4000-a000-000000000002', 'admin', 'active', now(), now() - interval '9 days'),
  ('39a00000-0000-4000-e000-000000000003', '39a00000-0000-4000-b000-000000000001',
   '39a00000-0000-4000-a000-000000000003', 'teacher', 'active', now(), now() - interval '8 days'),
  ('39a00000-0000-4000-e000-000000000004', '39a00000-0000-4000-b000-000000000001',
   '39a00000-0000-4000-a000-000000000004', 'staff', 'active', now(), now() - interval '7 days'),
  ('39a00000-0000-4000-e000-000000000005', '39a00000-0000-4000-b000-000000000001',
   '39a00000-0000-4000-a000-000000000005', 'parent', 'active', now(), now() - interval '6 days'),
  ('39a00000-0000-4000-e000-000000000006', '39a00000-0000-4000-b000-000000000001',
   '39a00000-0000-4000-a000-000000000006', 'teacher', 'pending', null, now() - interval '2 days'),
  ('39a00000-0000-4000-e000-000000000007', '39a00000-0000-4000-b000-000000000001',
   '39a00000-0000-4000-a000-000000000007', 'teacher', 'pending', null, now() - interval '1 day'),
  ('39a00000-0000-4000-e000-000000000008', '39a00000-0000-4000-b000-000000000001',
   '39a00000-0000-4000-a000-000000000008', 'teacher', 'active', now(), now() - interval '5 days'),
  ('39a00000-0000-4000-e000-000000000011', '39a00000-0000-4000-b000-000000000001',
   '39a00000-0000-4000-a000-000000000011', 'teacher', 'pending', null, now() - interval '3 days');

update public.workspace_members set status = 'removed'
 where id = '39a00000-0000-4000-e000-000000000008';

-- ---------------------------------------------------------------------
-- A. The read, as the owner and the admin.
-- ---------------------------------------------------------------------
select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000001');

select is(tests.names('pending'),
  array['Pending Rupa', 'Pending Pritom', 'Pending Three'],
  'owner: the pending tab names every joiner, newest first');

select is(
  (select r.email from public.list_workspace_members(
     '39a00000-0000-4000-b000-000000000001', 'pending', 'rupa') r),
  'tr-p2@test.local',
  'owner: a pending joiner''s email is returned (their profile is otherwise hidden)');

select is(
  (select count(*)::int from public.profiles where id = '39a00000-0000-4000-a000-000000000007'),
  0,
  'the owner still cannot read the pending joiner''s profiles row directly');

select is(tests.names('removed'), array['Removed Rahim'],
  'owner: the removed tab');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000002');

select is(tests.names('active'),
  array['Owner Olive', 'Staff Sumon', 'Teacher Tania', 'Admin Adil'],
  'admin: the active tab lists staff newest first (the bootstrap owner row is now) and excludes the parent');

select is(tests.names('active', '  TANIA '), array['Teacher Tania'],
  'search matches a name, trimmed and case-insensitive');

select is(tests.names('active', 'tr-staff@'), array['Staff Sumon'],
  'search matches an email');

select is(tests.names('active', 'nobody'), '{}'::text[],
  'a search with no match is an empty page');

select is(tests.names('pending', null, null, 1), array['Pending Rupa'],
  'paging: a limit of one returns the newest joiner');

select is(tests.names('pending', null, '39a00000-0000-4000-e000-000000000007', 1),
  array['Pending Pritom'],
  'paging: after the newest, the next one');

select is(tests.names('pending', null, '39a00000-0000-4000-e000-000000000011', 1),
  '{}'::text[],
  'paging: after the last row, nothing');

select is(tests.names('pending', null, null, 0), array['Pending Rupa'],
  'a limit below one is clamped to one');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000009');
select throws_ok(
  $$select tests.names('active', null, '39a00000-0000-4000-e000-000000000002')$$,
  '42501', 'FORBIDDEN',
  'isolation: another school''s owner is refused');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000001');
select throws_ok(
  $$select * from public.list_workspace_members('39a00000-0000-4000-b000-000000000001',
      'active', null, tests.owner_b_member())$$,
  '22023', 'CURSOR_INVALID',
  'a cursor from another school is refused');

-- ---------------------------------------------------------------------
-- B. Escalation on the read.
-- ---------------------------------------------------------------------
select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000003');
select throws_ok($$select tests.names('pending')$$, '42501', 'FORBIDDEN',
  'a teacher cannot read the roster');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000004');
select throws_ok($$select tests.names('active')$$, '42501', 'FORBIDDEN',
  'staff cannot read the roster');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000005');
select throws_ok($$select tests.names('active')$$, '42501', 'FORBIDDEN',
  'a parent cannot read the roster');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000006');
select throws_ok($$select tests.names('pending')$$, '42501', 'FORBIDDEN',
  'a pending joiner cannot read the roster');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000010');
select throws_ok($$select tests.names('active')$$, '42501', 'FORBIDDEN',
  'a stranger cannot read the roster');

select tests.logout();
select ok(
  not has_function_privilege('anon',
    'public.list_workspace_members(uuid, public.member_status, text, uuid, integer)', 'execute'),
  'anon has no EXECUTE on list_workspace_members');

-- ---------------------------------------------------------------------
-- C. Approve / reject.
-- ---------------------------------------------------------------------
select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000003');
update public.workspace_members set status = 'active'
 where id = '39a00000-0000-4000-e000-000000000007';
select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000009');
update public.workspace_members set status = 'active'
 where id = '39a00000-0000-4000-e000-000000000007';
select tests.logout();
select is(tests.status_of('39a00000-0000-4000-e000-000000000007'), 'pending',
  'a teacher and another school''s owner cannot approve (RLS: zero rows)');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000007');
select throws_ok(
  $$update public.workspace_members set status = 'active'
     where id = '39a00000-0000-4000-e000-000000000007'$$,
  '42501', 'members cannot change their own role or status',
  'a joiner cannot approve themselves');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000002');
update public.workspace_members set status = 'active'
 where id = '39a00000-0000-4000-e000-000000000006' and status = 'pending';
select tests.logout();
select ok(
  (select status = 'active' and joined_at is not null
     from public.workspace_members where id = '39a00000-0000-4000-e000-000000000006'),
  'admin approves: active, joined_at stamped');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000002');
select is(tests.names('active', 'pritom'), array['Pending Pritom'],
  'the approved member is on the active tab');

update public.workspace_members set status = 'removed'
 where id = '39a00000-0000-4000-e000-000000000007' and status = 'pending';
select tests.logout();
select ok(
  (select status = 'removed' and removed_at is not null and joined_at is null
          and removed_by = '39a00000-0000-4000-a000-000000000002'
     from public.workspace_members where id = '39a00000-0000-4000-e000-000000000007'),
  'admin rejects: removed, removed_by = the admin, joined_at still null');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000001');
select is(
  (select array_agg(r.full_name || ':' || (r.joined_at is null)::text order by r.full_name)
     from public.list_workspace_members('39a00000-0000-4000-b000-000000000001', 'removed') r),
  array['Pending Rupa:true', 'Removed Rahim:false'],
  'the removed tab tells a rejected request (never joined) from a removed member');

-- Read-only: approval is a write and is refused; rejection removes access
-- and is allowed (D-300).
select tests.logout();
select app.set_access_mode('39a00000-0000-4000-b000-000000000001', 'read_only',
                           'Your Pro trial has ended.');
select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000001');
select throws_ok(
  $$update public.workspace_members set status = 'active'
     where id = '39a00000-0000-4000-e000-000000000011'$$,
  '42501', 'PLAN_READ_ONLY',
  'read_only: approving is refused');

select is(tests.names('pending'), array['Pending Three'],
  'read_only: the roster still reads');

update public.workspace_members set status = 'removed'
 where id = '39a00000-0000-4000-e000-000000000011';
select tests.logout();
select is(tests.status_of('39a00000-0000-4000-e000-000000000011'), 'removed',
  'read_only: rejecting is allowed');

select tests.logout();
select tests.login('39a00000-0000-4000-a000-000000000002');
select throws_ok(
  $$update public.workspace_members set status = 'removed'
     where id = (select id from public.workspace_members
                  where workspace_id = '39a00000-0000-4000-b000-000000000001'
                    and user_id = '39a00000-0000-4000-a000-000000000001')$$,
  '42501', 'only an owner can grant or remove ownership',
  'an admin cannot remove the owner through the same update');

select * from finish();
rollback;
