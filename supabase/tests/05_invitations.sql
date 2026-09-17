-- =====================================================================
-- pgTAP · the invitation and join-by-code paths
-- Both self-service membership paths run through SECURITY DEFINER RPCs;
-- neither can choose its own role, and acceptance verifies the email
-- binding (which the Base44 redeem never did).
-- =====================================================================
begin;
select plan(18);

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
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000001', 'owner@test.local',    'Owner');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000002', 'teacher@test.local',  'Teacher');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000003', 'invitee@test.local',  'Invitee');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000004', 'stranger@test.local', 'Stranger');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000005', 'joiner@test.local',   'Joiner');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'teacher', 'active', now());

-- =====================================================================
-- only owners and admins may invite
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');
select throws_ok(
  $$select app.create_invitation('11111111-1111-1111-1111-111111111111',
                                 'teacher'::public.member_role, 'x@test.local')$$,
  '42501', null,
  'a teacher cannot create an invitation');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$select app.create_invitation('11111111-1111-1111-1111-111111111111',
                                 'teacher'::public.member_role)$$,
  '22023', null,
  'an invitation needs an email or a phone number');

select set_config('tests.token',
  (select token from app.create_invitation(
     '11111111-1111-1111-1111-111111111111',
     'teacher'::public.member_role,
     'invitee@test.local')),
  true);

select ok(length(current_setting('tests.token')) = 64,
          'create_invitation returns a 64-character raw token');
select tests.logout();

select is(
  (select count(*)::int from public.workspace_invitations
    where workspace_id = '11111111-1111-1111-1111-111111111111'
      and email = 'invitee@test.local' and status = 'pending'),
  1, 'a pending invitation row exists');

select is(
  (select token_hash from public.workspace_invitations where email = 'invitee@test.local'),
  app.hash_token(current_setting('tests.token')),
  'only the SHA-256 digest of the token is stored');

-- =====================================================================
-- the email binding is enforced on redeem
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000004');   -- stranger@test.local
select throws_ok(
  format('select app.accept_invitation(%L)', current_setting('tests.token')),
  '42501', null,
  'a token cannot be redeemed by an account it was not addressed to');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');   -- invitee@test.local
select throws_ok(
  $$select app.accept_invitation('not-a-real-token')$$,
  '22023', null,
  'an unknown token is rejected');

select is(
  (select app.accept_invitation(current_setting('tests.token'))),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'the addressed account can accept, and gets back the workspace id');

select is(app.member_role('11111111-1111-1111-1111-111111111111'), 'teacher',
          'acceptance produces an ACTIVE membership with the invited role');

select throws_ok(
  format('select app.accept_invitation(%L)', current_setting('tests.token')),
  '22023', null,
  'a token cannot be redeemed twice');
select tests.logout();

select is(
  (select status::text from public.workspace_invitations where email = 'invitee@test.local'),
  'accepted', 'the invitation is marked accepted');

select is(
  (select accepted_by from public.workspace_invitations where email = 'invitee@test.local'),
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  'and records who accepted it');

-- expiry
update public.workspace_invitations
   set status = 'pending', accepted_by = null, accepted_at = null,
       expires_at = now() - interval '1 day'
 where email = 'invitee@test.local';

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');
select throws_ok(
  format('select app.accept_invitation(%L)', current_setting('tests.token')),
  '22023', null,
  'an expired invitation is rejected');
select tests.logout();

select is(
  (select status::text from public.workspace_invitations where email = 'invitee@test.local'),
  'expired', 'and the row is flipped to expired on the way out');

-- =====================================================================
-- join by invite code — always PENDING, always `teacher`
-- The code is captured here, as a privileged caller: a prospective joiner
-- cannot read `workspaces` at all, which is exactly the point — they only
-- ever hold the code the school gave them.
-- =====================================================================
select set_config('tests.code',
  (select w.invite_code from public.workspaces w
    where w.id = '11111111-1111-1111-1111-111111111111'),
  true);

select tests.login('aaaaaaaa-0000-0000-0000-000000000005');

select throws_ok(
  $$select app.join_workspace_by_code('ACD-0000-0000')$$,
  '22023', null,
  'an unknown invite code is rejected');

select is(
  (select app.join_workspace_by_code(current_setting('tests.code'))),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'a valid invite code returns the workspace id');

select is(app.member_role('11111111-1111-1111-1111-111111111111'), null,
          'but the joiner is NOT a member yet — an admin still has to approve');

select tests.logout();

select is(
  (select role::text || '/' || status::text from public.workspace_members
    where workspace_id = '11111111-1111-1111-1111-111111111111'
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000005'),
  'teacher/pending',
  'the self-created row is forced to teacher/pending — the joiner cannot pick a role');

select * from finish();
rollback;
