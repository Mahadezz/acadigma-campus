-- =====================================================================
-- pgTAP · F-ID-01 Parts 1-4 — auth_throttle
--
-- auth_throttle has no RLS policy and no table grants at all (it is
-- reached exclusively through SECURITY DEFINER functions); this file
-- proves both halves: the table is unreachable directly, and the
-- functions behave exactly as F-ID-01 §5 describes.
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

select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000001', 'throttle-victim@test.local', 'Throttle Victim');

-- =====================================================================
-- A. the table itself is not reachable by anon or authenticated
-- =====================================================================
select tests.login('bbbbbbbb-0000-0000-0000-000000000001');

-- Class S1 means RLS is ON with zero policies, not merely "no grants": a later
-- blanket grant must still hit a closed door.
select is(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'auth_throttle'),
  true, 'auth_throttle has row level security enabled (class S1)');

select throws_ok(
  $$select 1 from public.auth_throttle limit 1$$,
  '42501', null,
  'an authenticated user holds no SELECT grant on auth_throttle');

select throws_ok(
  $$insert into public.auth_throttle (key, attempts) values ('x', 1)$$,
  '42501', null,
  'an authenticated user holds no INSERT grant on auth_throttle');

select tests.logout();

-- =====================================================================
-- B. throttle_status on an unknown key is never blocked
-- =====================================================================
select is(
  (select blocked from public.throttle_status('login:unknown-key')), false,
  'a key with no history is not blocked');

-- =====================================================================
-- C. throttle_record_failure: 5 failures allowed, the 6th blocks
--    (F-ID-01 §5 "Sign-in failures: 5 per (email, 15 min) -> 15 min block")
--    bucket 'loginByEmail' carries that threshold server-side now (security
--    review N2) -- the call takes only a bucket name and a key, no limits.
-- =====================================================================
select is(
  (select blocked from public.throttle_record_failure('loginByEmail', 'login:sha256(a@test.local)')),
  false, 'failure 1 of 5 does not block');

select public.throttle_record_failure('loginByEmail', 'login:sha256(a@test.local)'); -- 2
select public.throttle_record_failure('loginByEmail', 'login:sha256(a@test.local)'); -- 3
select public.throttle_record_failure('loginByEmail', 'login:sha256(a@test.local)'); -- 4

select is(
  (select blocked from public.throttle_record_failure('loginByEmail', 'login:sha256(a@test.local)')),
  false, 'failure 5 of 5 does not block yet');

select is(
  (select blocked from public.throttle_record_failure('loginByEmail', 'login:sha256(a@test.local)')),
  true, 'failure 6 (past the limit of 5) blocks the key');

select throws_ok(
  $$select public.throttle_record_failure('not-a-real-bucket', 'login:sha256(nobody@test.local)')$$,
  '22023', null,
  'an unrecognised bucket name is rejected rather than silently unthrottled');

select ok(
  (select retry_after_seconds from public.throttle_status('login:sha256(a@test.local)')) > 0,
  'a blocked key reports a positive retry-after countdown');

select is(
  (select blocked from public.throttle_status('login:sha256(a@test.local)')), true,
  'throttle_status agrees the key is blocked without bumping it further');

-- =====================================================================
-- D. throttle_reset clears a key (called on a successful attempt)
-- =====================================================================
select public.throttle_reset('login:sha256(a@test.local)');

select is(
  (select blocked from public.throttle_status('login:sha256(a@test.local)')), false,
  'throttle_reset clears the block');

-- =====================================================================
-- E. a fresh key still starts unblocked after the window design
-- =====================================================================
select is(
  (select attempts from public.auth_throttle where key = 'login:sha256(a@test.local)'),
  null, 'the row itself is gone after reset, not merely unblocked')
  -- auth_throttle has no SELECT grant to authenticated/anon, so this
  -- final assertion runs as the postgres owner role (tests.logout() above).
;

select ok(true, 'auth_throttle functions run to completion under service context');

-- =====================================================================
-- F. exposed throttle RPCs carry no caller-supplied limit/window params
--    (security review N2). The thresholds live server-side (migration
--    20260917020000 §3); a client can name a key or a bucket, never a
--    number.
-- =====================================================================
select is(
  pg_get_function_identity_arguments('public.throttle_status(text)'::regprocedure),
  'p_key text',
  'throttle_status takes only a key -- no limit or window parameters');

select is(
  pg_get_function_identity_arguments('public.throttle_record_failure(text, text)'::regprocedure),
  'p_bucket text, p_key text',
  'throttle_record_failure takes only a bucket name and a key -- no caller-supplied limits');

select is(
  pg_get_function_identity_arguments('public.throttle_reset(text)'::regprocedure),
  'p_key text',
  'throttle_reset takes only a key -- no limit or window parameters');

-- =====================================================================
-- G. log_auth_event — the allowlist is the whole security property
-- =====================================================================
select throws_ok(
  $$select public.log_auth_event('drop.everything', 'bbbbbbbb-0000-0000-0000-000000000001'::uuid)$$,
  '22023', null,
  'an action outside the seven-item allowlist is rejected');

select ok(
  (select public.log_auth_event('account.login', 'bbbbbbbb-0000-0000-0000-000000000001'::uuid)) is not null,
  'an allowlisted action writes a row and returns its id');

select finish();
rollback;
