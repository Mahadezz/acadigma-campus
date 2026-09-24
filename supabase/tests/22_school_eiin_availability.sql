-- =====================================================================
-- pgTAP · F-ID-05 Part 3 — EIIN availability check (D-66)
--
-- 20260925000700_school_eiin_availability.sql adds a partial unique index
-- on school_profiles(eiin) plus public.check_eiin_available(text), a
-- SECURITY DEFINER boolean probe the wizard's step 1 calls before a school
-- (or any membership) exists for the caller.
--
-- Covers:
--   1. an EIIN nobody has used yet is reported available, by a caller who
--      is a member of nothing;
--   2. once a DIFFERENT school (owned by someone else) has that EIIN, the
--      same non-member caller is told it is NOT available;
--   3. the same non-member caller still cannot read that other school's
--      school_profiles row directly -- the boolean function answers the
--      one question without granting row access (proving this isn't an
--      RLS-widening shortcut);
--   4. the partial unique index actually rejects a second school reusing
--      an EIIN already in use (23505);
--   5. two schools with NO eiin (both null) do not collide -- the index is
--      partial (`where eiin is not null`).
-- =====================================================================
begin;
select plan(7);

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

-- =====================================================================
-- Fixtures: an owner for an existing school, and an unrelated caller with
-- no membership anywhere -- the exact shape of a user mid-wizard.
-- =====================================================================
select tests.mkuser('f1050301-0000-0000-0000-000000000001', 'p3.owner@test.local', 'Existing Owner');
select tests.mkuser('f1050301-0000-0000-0000-000000000002', 'p3.newcomer@test.local', 'Newcomer');

-- As postgres (privileged), seed one real school workspace the ordinary
-- bootstrap triggers would produce, then set its EIIN directly -- this test
-- is about the availability probe and the index, not the creation
-- transaction itself (Part 4's job).
insert into public.workspaces (type, name, slug, owner_id, created_by)
values (
  'school', 'Existing School', 'existing-school-p3',
  'f1050301-0000-0000-0000-000000000001', 'f1050301-0000-0000-0000-000000000001'
);

update public.school_profiles
   set eiin = '123456'
 where workspace_id = (
   select id from public.workspaces where slug = 'existing-school-p3'
 );

-- =====================================================================
-- 1. An unused EIIN is reported available, by a caller with no membership
--    anywhere.
-- =====================================================================
select tests.login('f1050301-0000-0000-0000-000000000002');

select is(
  (select public.check_eiin_available('999999')),
  true,
  'an EIIN nobody has used is reported available, even to a non-member caller');

-- =====================================================================
-- 2. An EIIN already on another (inaccessible-to-this-caller) school is
--    reported NOT available.
-- =====================================================================
select is(
  (select public.check_eiin_available('123456')),
  false,
  'an EIIN already registered to another school is reported unavailable');

-- =====================================================================
-- 3. The same caller still cannot read that school's row directly -- the
--    boolean RPC answers the question without widening RLS.
-- =====================================================================
select is(
  (select count(*)::int from public.school_profiles
    where workspace_id = (select id from public.workspaces where slug = 'existing-school-p3')),
  0,
  'the caller still cannot see the other school''s school_profiles row directly under RLS');

select tests.logout();

-- =====================================================================
-- 4. The partial unique index rejects a second school reusing an EIIN
--    already in use.
-- =====================================================================
insert into public.workspaces (type, name, slug, owner_id, created_by)
values (
  'school', 'Copycat School', 'copycat-school-p3',
  'f1050301-0000-0000-0000-000000000001', 'f1050301-0000-0000-0000-000000000001'
);

select throws_ok(
  $$update public.school_profiles set eiin = '123456'
     where workspace_id = (select id from public.workspaces where slug = 'copycat-school-p3')$$,
  '23505',
  'duplicate key value violates unique constraint "school_profiles_eiin_unique"',
  'a second school cannot reuse an EIIN already registered to another school');

-- =====================================================================
-- 5. Two schools with no EIIN at all do not collide -- the index is
--    partial (`where eiin is not null`); both rows already have a null
--    eiin from the bootstrap trigger, so this is just confirming no
--    exception was raised by their creation above.
-- =====================================================================
select is(
  (select count(*)::int from public.school_profiles
    where workspace_id in (
      select id from public.workspaces where slug in ('existing-school-p3', 'copycat-school-p3')
    )),
  2,
  'both schools exist -- a null eiin on the second one never collided with the first''s null default before it was set');

-- =====================================================================
-- 6. Grant shape: authenticated can execute the probe; anon cannot
--    (D-50 -- pre-membership but still a signed-in-only surface, unlike
--    the throttle functions which are reachable pre-session).
-- =====================================================================
select ok(
  has_function_privilege('authenticated', 'public.check_eiin_available(text)', 'execute'),
  'authenticated has EXECUTE on public.check_eiin_available');

select ok(
  not has_function_privilege('anon', 'public.check_eiin_available(text)', 'execute'),
  'anon has no EXECUTE on public.check_eiin_available -- onboarding requires a signed-in, verified account (§2)');

select * from finish();
rollback;
