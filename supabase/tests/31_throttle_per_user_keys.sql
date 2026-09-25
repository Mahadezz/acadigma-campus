-- =====================================================================
-- pgTAP · D-101 — per-user throttle keys come from auth.uid(), never the
-- caller (20260925300303_throttle_per_user_keys.sql).
--
--   1. A user cannot record a failure against another user's per-user row,
--      whatever key they pass — for the per-user buckets p_key is ignored.
--   2. `user:` keys passed to throttle_status resolve to the caller's own
--      row only, and throttle_reset refuses them from clients altogether.
--   3. anon cannot use the `user:` namespace at all.
--   4. Client-keyed buckets (sign-in) still take the caller's key, and anon
--      throttle_status on a plain key still works (the D-65 smoke test).
-- =====================================================================
begin;
select plan(16);

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

-- A valid input; p_patch overrides top-level keys.

select tests.mkuser('f1010100-0000-0000-0000-00000000000a', 'd101.alice@test.local', 'Alice');
select tests.mkuser('f1010100-0000-0000-0000-00000000000b', 'd101.victim@test.local', 'Victim');

-- 1. Alice names the victim's key for a per-user bucket, 40 times.
select tests.login('f1010100-0000-0000-0000-00000000000a');
select public.throttle_record_failure('createSchool', 'user:createSchool:f1010100-0000-0000-0000-00000000000b')
  from generate_series(1, 40);
select public.throttle_record_failure('eiinCheck', 'create-school:f1010100-0000-0000-0000-00000000000b');
select tests.logout();

select is(
  (select count(*)::int from public.auth_throttle where key like '%f1010100-0000-0000-0000-00000000000b%'),
  0, 'no row was written against the victim, whatever key Alice passed');
select is(
  (select attempts from public.auth_throttle where key = 'user:createSchool:f1010100-0000-0000-0000-00000000000a'),
  40, 'the attempts landed on Alice''s own createSchool row');

-- 2. status / reset with a user: key only see the caller's own row.
select tests.login('f1010100-0000-0000-0000-00000000000b');
select is(
  (select blocked from public.throttle_status('user:createSchool')),
  false, 'the victim is not blocked from creating a school');
select is(
  (select blocked from public.throttle_status('user:createSchool:f1010100-0000-0000-0000-00000000000a')),
  false, 'naming Alice''s row in throttle_status still reads the caller''s own (empty) row');
select throws_ok(
  $$select public.throttle_reset('user:createSchool:f1010100-0000-0000-0000-00000000000a')$$,
  '42501', 'per-user throttle limits are not reset by the caller',
  'the victim cannot clear Alice''s row');
select tests.logout();
select tests.login('f1010100-0000-0000-0000-00000000000a');
select throws_ok(
  $$select public.throttle_reset('user:createSchool')$$,
  '42501', 'per-user throttle limits are not reset by the caller',
  'Alice cannot clear her own createSchool limit (it would undo the D-100 limit)');
select tests.logout();
select is(
  (select attempts from public.auth_throttle where key = 'user:createSchool:f1010100-0000-0000-0000-00000000000a'),
  40, 'Alice''s row is untouched by either reset attempt');

select tests.login('f1010100-0000-0000-0000-00000000000a');
select is(
  (select blocked from public.throttle_status('user:createSchool')),
  true, 'Alice herself is blocked after 40 attempts');
select tests.logout();

-- 3. anon cannot use the user: namespace.
set local role anon;
select throws_ok(
  $$select public.throttle_status('user:createSchool')$$,
  '42501', 'authentication required',
  'anon cannot read a per-user throttle row');
-- 4. anon still reads a plain key (the D-65 post-deploy smoke test's call).
select is(
  (select blocked from public.throttle_status('ci-smoke:post-deploy')),
  false, 'anon throttle_status on a plain key still answers');
reset role;

-- Client-keyed buckets keep the caller's key.
select public.throttle_record_failure('loginByEmail', 'login-email:abc');
select is(
  (select attempts from public.auth_throttle where key = 'login-email:abc'),
  1, 'a client-keyed bucket still records under the key it was given');

-- 5. A user: key only works with its own bucket (no shortening a block by
--    recording into it with a bucket that has a shorter window).
select tests.login('f1010100-0000-0000-0000-00000000000a');
select throws_ok(
  $$select public.throttle_record_failure('loginByEmail', 'user:changePassword')$$,
  '22023', 'throttle key does not match bucket',
  'a user: key cannot be recorded under a different bucket');
select tests.logout();

-- 6. A running block is never shortened.
update public.auth_throttle set blocked_until = now() + interval '2 hours'
 where key = 'user:createSchool:f1010100-0000-0000-0000-00000000000a';
select tests.login('f1010100-0000-0000-0000-00000000000a');
select public.throttle_record_failure('createSchool', 'ignored');
select tests.logout();
select ok(
  (select blocked_until > now() + interval '119 minutes' from public.auth_throttle
    where key = 'user:createSchool:f1010100-0000-0000-0000-00000000000a'),
  'another failure while blocked keeps the later block end');

-- 7. An expired block starts a fresh window: one failure does not re-block,
--    a full window's worth does.
update public.auth_throttle
   set attempts = 6, blocked_until = now() - interval '1 second',
       window_started_at = now() - interval '20 minutes'
 where key = 'login-email:abc';
select is(
  (select blocked from public.throttle_record_failure('loginByEmail', 'login-email:abc')),
  false, 'the first failure after a block expires does not re-block');
select is(
  (select attempts from public.auth_throttle where key = 'login-email:abc'),
  1, 'and it counts from 1 in a fresh window');
select public.throttle_record_failure('loginByEmail', 'login-email:abc') from generate_series(1, 4);
select is(
  (select blocked from public.throttle_record_failure('loginByEmail', 'login-email:abc')),
  true, 'the sixth failure in the new window blocks again');

select * from finish();
rollback;
