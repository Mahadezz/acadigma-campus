-- =====================================================================
-- pgTAP · F-ID-01 Part 6 — sessions and devices
--   (20260930204524_sessions_and_devices.sql, D-116)
--
--   A. Listing: the caller sees only their own live sessions, the current
--      one first and marked; never an expired one, never the IP.
--   B. New-device notification: raised once per session, only when
--      another session is live.
--   C. Revoke: another person's session and the current one are refused
--      without an error; one's own other session is deleted with its
--      refresh tokens and audited; a repeat is a no-op.
--   D. Escalation: anon can call none of the functions; authenticated
--      cannot read or delete auth.sessions directly.
-- =====================================================================
begin;
select plan(19);

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

-- Signed in on one particular session, as Supabase puts it in the JWT.
create or replace function tests.login_session(p_id uuid, p_session uuid)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id::text, 'role', 'authenticated',
      'session_id', p_session::text)::text, true);
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
-- Fixture (as postgres).
--   A  sessions A1 (current, this browser), A2 (a phone), A3 (expired)
--   B  session B1
-- ---------------------------------------------------------------------
select tests.mkuser('39800000-0000-4000-a000-000000000001', 'sess-a@test.local', 'Asha Sessions');
select tests.mkuser('39800000-0000-4000-a000-000000000002', 'sess-b@test.local', 'Bilal Sessions');

insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at, not_after, user_agent, ip)
values
  ('39800000-0000-4000-c000-0000000000a1', '39800000-0000-4000-a000-000000000001',
   now() - interval '2 days', now() - interval '2 days', null, null,
   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36', '203.0.113.7'),
  ('39800000-0000-4000-c000-0000000000a2', '39800000-0000-4000-a000-000000000001',
   now() - interval '5 days', now() - interval '5 days', (now() - interval '1 hour')::timestamp, null,
   'Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36', '203.0.113.8'),
  ('39800000-0000-4000-c000-0000000000a3', '39800000-0000-4000-a000-000000000001',
   now() - interval '60 days', now() - interval '60 days', null, now() - interval '1 day',
   'Old browser', '203.0.113.9'),
  ('39800000-0000-4000-c000-0000000000b1', '39800000-0000-4000-a000-000000000002',
   now() - interval '1 day', now() - interval '1 day', null, null,
   'Mozilla/5.0 (iPhone) Safari/604.1', '198.51.100.4');

insert into auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at, session_id)
values ('00000000-0000-0000-0000-000000000000', 'rt-39h-a2', '39800000-0000-4000-a000-000000000001',
        false, now(), now(), '39800000-0000-4000-c000-0000000000a2');

-- =====================================================================
-- A. Listing
-- =====================================================================
select tests.login_session('39800000-0000-4000-a000-000000000001', '39800000-0000-4000-c000-0000000000a1');
select results_eq(
  $$select id, is_current from public.my_sessions()$$,
  $$values ('39800000-0000-4000-c000-0000000000a1'::uuid, true),
           ('39800000-0000-4000-c000-0000000000a2'::uuid, false)$$,
  'A1: the caller sees their two live sessions, the current one first and marked');
select is(
  (select last_active_at from public.my_sessions() where not is_current),
  (select refreshed_at::timestamptz from auth.sessions where id = '39800000-0000-4000-c000-0000000000a2'),
  'A2: last active is the last refresh');
select is(
  (select user_agent from public.my_sessions() where is_current),
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36',
  'A3: the user agent is returned for the label');
select ok(
  pg_get_function_result('public.my_sessions()'::regprocedure) !~ '\mip\M',
  'A4: the IP is not among the returned columns');
select tests.logout();

select tests.login_session('39800000-0000-4000-a000-000000000002', '39800000-0000-4000-c000-0000000000b1');
select results_eq(
  $$select id from public.my_sessions()$$,
  $$values ('39800000-0000-4000-c000-0000000000b1'::uuid)$$,
  'A5: another person sees only their own session');

-- =====================================================================
-- B. New-device notification
-- =====================================================================
select is((select public.note_sign_in()), false,
  'B1: no notification when no other session is live');
select tests.logout();

select tests.login_session('39800000-0000-4000-a000-000000000001', '39800000-0000-4000-c000-0000000000a1');
select is((select public.note_sign_in()), true,
  'B2: a sign-in while another session is live raises the notification');
select is((select public.note_sign_in()), false,
  'B3: a repeat for the same session does nothing');
select tests.logout();
select is(
  (select count(*)::int from public.notifications
    where recipient_id = '39800000-0000-4000-a000-000000000001'
      and event_type = 'auth.new_device_signin'
      and action_url = '/account/security'
      and data = jsonb_build_object('session_id', '39800000-0000-4000-c000-0000000000a1')),
  1,
  'B4: exactly one auth.new_device_signin row, carrying only the session id');

-- =====================================================================
-- C. Revoke
-- =====================================================================
select tests.login_session('39800000-0000-4000-a000-000000000001', '39800000-0000-4000-c000-0000000000a1');
select is((select public.revoke_my_session('39800000-0000-4000-c000-0000000000b1')), false,
  'C1: another person''s session is refused without an error');
select is((select public.revoke_my_session('39800000-0000-4000-c000-0000000000a1')), false,
  'C2: the current session is refused (that is Sign out)');
select is((select public.revoke_my_session('39800000-0000-4000-c000-0000000000a2')), true,
  'C3: one''s own other session is revoked');
select is((select public.revoke_my_session('39800000-0000-4000-c000-0000000000a2')), false,
  'C4: a repeat is a no-op');
select tests.logout();

select ok(
  exists (select 1 from auth.sessions where id = '39800000-0000-4000-c000-0000000000b1')
  and exists (select 1 from auth.sessions where id = '39800000-0000-4000-c000-0000000000a1'),
  'C5: the refused sessions still exist');
select ok(
  not exists (select 1 from auth.sessions where id = '39800000-0000-4000-c000-0000000000a2')
  and not exists (select 1 from auth.refresh_tokens where token = 'rt-39h-a2'),
  'C6: the revoked session is gone with its refresh tokens');
select is(
  (select count(*)::int from public.audit_events
    where action = 'session.revoked'
      and row_id = '39800000-0000-4000-c000-0000000000a2'
      and subject_user_id = '39800000-0000-4000-a000-000000000001'
      and workspace_id is null
      and before is null and after is null
      and user_agent_family is null and request_ip_hash is null),
  1,
  'C7: exactly one session.revoked audit row, with no user agent or IP');

-- =====================================================================
-- D. Escalation
-- =====================================================================
select ok(
  not has_function_privilege('anon', 'public.my_sessions()', 'execute')
  and not has_function_privilege('anon', 'public.revoke_my_session(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.note_sign_in()', 'execute'),
  'D1: anon can call none of the functions');

select tests.login_session('39800000-0000-4000-a000-000000000001', '39800000-0000-4000-c000-0000000000a1');
select throws_ok(
  $$select count(*) from auth.sessions$$,
  '42501', 'permission denied for table sessions',
  'D2: authenticated cannot read auth.sessions directly');
select throws_ok(
  $$delete from auth.sessions where id = '39800000-0000-4000-c000-0000000000b1'$$,
  '42501', 'permission denied for table sessions',
  'D3: authenticated cannot delete auth.sessions directly');
select tests.logout();

select * from finish();
rollback;
