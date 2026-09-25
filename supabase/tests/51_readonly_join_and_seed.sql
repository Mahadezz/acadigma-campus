-- =====================================================================
-- pgTAP · D-301 — joining a read-only school, and the seed's passwords
--
--   A. supabase/seed/seed.sql applies cleanly on the migrated schema and
--      hashes every seed account's password at seed time (no bcrypt literal
--      in the repo): crypt('password123', hash) = hash for all four.
--   B. A stranger's direct INSERT into workspace_members meets the SAME RLS
--      refusal on a read-only school as on a normal one — the access mode
--      no longer leaks. A verified invitee (accept_invitation) and a valid
--      invite code (join_workspace_by_code) are refused with PLAN_READ_ONLY
--      on the read-only school; the code still works on a normal school.
-- =====================================================================
begin;
select plan(7);

\ir ../seed/seed.sql

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

-- ---------------------------------------------------------------------
-- A. Seed
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from auth.users
    where email in ('owner@acadigma.test', 'teacher@acadigma.test',
                    'parent@acadigma.test', 'lapsed@acadigma.test')
      and encrypted_password = extensions.crypt('password123', encrypted_password)),
  4,
  'seed: all four accounts sign in with password123, hashed at seed time');

select is(
  (select access_mode::text from public.workspaces
    where id = '5eed0000-0000-4000-b000-000000000002'),
  'read_only',
  'seed: Acadigma Lapsed School is read_only');

-- ---------------------------------------------------------------------
-- B. Joining
-- ---------------------------------------------------------------------
select tests.mkuser('51000000-0000-4000-a000-000000000001', 'ro-stranger51@test.local', 'Stranger');
select tests.mkuser('51000000-0000-4000-a000-000000000002', 'ro-invitee51@test.local', 'Invitee');

insert into public.workspace_invitations
  (workspace_id, channel, email, role, token_hash, token_prefix, invited_by, expires_at)
values ('5eed0000-0000-4000-b000-000000000002', 'email', 'ro-invitee51@test.local', 'teacher',
        app.hash_token('ro-token-51'), 'ro-token', '5eed0000-0000-4000-a000-000000000004',
        now() + interval '7 days');

update public.workspaces set invite_code = 'ACD-LAPSED-51'
 where id = '5eed0000-0000-4000-b000-000000000002';

select tests.login('51000000-0000-4000-a000-000000000001');

select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('5eed0000-0000-4000-b000-000000000002',
            '51000000-0000-4000-a000-000000000001', 'teacher', 'pending')$$,
  '42501', 'new row violates row-level security policy for table "workspace_members"',
  'stranger insert into a READ-ONLY school: plain RLS refusal (no PLAN_READ_ONLY)');

select throws_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status)
    values ('5eed0000-0000-4000-b000-000000000001',
            '51000000-0000-4000-a000-000000000001', 'teacher', 'pending')$$,
  '42501', 'new row violates row-level security policy for table "workspace_members"',
  'stranger insert into a NORMAL school: the identical refusal');

select throws_ok(
  $$select app.join_workspace_by_code('ACD-LAPSED-51')$$,
  '42501', 'PLAN_READ_ONLY',
  'a valid invite code for a read-only school is refused');

select lives_ok(
  $$select app.join_workspace_by_code('ACD-DEMO-2026')$$,
  'the invite code for a normal school still works');

select tests.logout();
select tests.login('51000000-0000-4000-a000-000000000002');

select throws_ok(
  $$select app.accept_invitation('ro-token-51')$$,
  '42501', 'PLAN_READ_ONLY',
  'a verified invitee cannot join a read-only school');

select tests.logout();

select * from finish();
rollback;
