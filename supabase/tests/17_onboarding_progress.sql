-- =====================================================================
-- pgTAP · F-ID-05 Part 2 — onboarding_progress RLS
--
-- §10 "DB (pgTAP)": "onboarding_progress cross-user isolation and no-delete
-- grant". User-scoped table (no workspace_id), so this is not
-- 02_tenant_isolation.sql / 03_role_escalation.sql material (both key on
-- `workspace_id`) — it gets its own file, the way
-- 15_personal_workspace_registration.sql does for another user-adjacent
-- table.
--
-- Covers:
--   1. a user can insert and read their own row, with the documented
--      defaults (path='undecided', step=1, draft='{}');
--   2. a second user cannot see the first user's row at all (isolation);
--   3. a second user cannot insert a row on the first user's behalf, and
--      cannot update it either — 0 rows affected, not an exception, since
--      the USING clause simply matches nothing;
--   4. nobody — not even the row's own owner — has a DELETE grant on this
--      table: the error is a grant-level 42501 raised before RLS is ever
--      evaluated, proving "no delete" is enforced at the grant, not left to
--      an easily-loosened policy;
--   5. platform staff can read another user's row (the one policy this
--      table's SELECT has beyond "your own row" — support access);
--   6. `app.attach_updated_at` actually attached its trigger to this table
--      (checked against the catalog, not by comparing `now()` values — the
--      whole file runs inside one `begin;`/`rollback;` transaction, so
--      `now()` returns the SAME value everywhere in it; `updated_at` and
--      `started_at` would be indistinguishable by timestamp alone here);
--   7. the 32000-byte draft size cap is enforced at the database (CHECK
--      constraint, 23514), not only by the app-layer Zod schema.
-- =====================================================================
begin;
select plan(12);

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
-- Fixtures: two ordinary users, one platform admin.
-- =====================================================================
select tests.mkuser('f1050101-0000-0000-0000-000000000001', 'p2.userA@test.local', 'User A');
select tests.mkuser('f1050101-0000-0000-0000-000000000002', 'p2.userB@test.local', 'User B');
select tests.mkuser('f1050101-0000-0000-0000-000000000003', 'p2.staff@test.local', 'Platform Staff');
update public.profiles set is_platform_admin = true
  where id = 'f1050101-0000-0000-0000-000000000003';

-- =====================================================================
-- 1. User A inserts their own row with just the defaults, then reads it.
-- =====================================================================
select tests.login('f1050101-0000-0000-0000-000000000001');

select lives_ok(
  $$insert into public.onboarding_progress (user_id) values ('f1050101-0000-0000-0000-000000000001')$$,
  'user A can insert their own onboarding_progress row');

select is(
  (select path::text from public.onboarding_progress where user_id = 'f1050101-0000-0000-0000-000000000001'),
  'undecided',
  'a fresh row defaults path to undecided');

select is(
  (select step::int from public.onboarding_progress where user_id = 'f1050101-0000-0000-0000-000000000001'),
  1,
  'a fresh row defaults step to 1');

select is(
  (select draft from public.onboarding_progress where user_id = 'f1050101-0000-0000-0000-000000000001'),
  '{}'::jsonb,
  'a fresh row defaults draft to an empty object');

select tests.logout();

-- =====================================================================
-- 2. User B cannot see user A's row at all (cross-user isolation).
-- =====================================================================
select tests.login('f1050101-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.onboarding_progress where user_id = 'f1050101-0000-0000-0000-000000000001'),
  0,
  'user B sees zero rows when querying for user A''s onboarding_progress row');

-- =====================================================================
-- 3. User B cannot write on user A's behalf.
-- =====================================================================
select throws_ok(
  $$insert into public.onboarding_progress (user_id, path) values ('f1050101-0000-0000-0000-000000000001', 'create_school')$$,
  '42501',
  'new row violates row-level security policy for table "onboarding_progress"',
  'user B cannot insert a row for user A — the WITH CHECK requires user_id = the caller');

update public.onboarding_progress set step = 5 where user_id = 'f1050101-0000-0000-0000-000000000001';

select tests.logout();

-- Re-check as user A (not B, who cannot see the row at all under RLS —
-- checking through B's own eyes would just read back NULL/0-rows and prove
-- nothing about whether the UPDATE above actually touched the row).
select tests.login('f1050101-0000-0000-0000-000000000001');
select is(
  (select step::int from public.onboarding_progress where user_id = 'f1050101-0000-0000-0000-000000000001'),
  1,
  'user B''s update touched zero rows (USING matches nothing) — user A''s row is untouched');
select tests.logout();

-- =====================================================================
-- 4. No DELETE grant for anyone — a grant-level failure, before RLS.
-- =====================================================================
select tests.login('f1050101-0000-0000-0000-000000000001');

select throws_ok(
  $$delete from public.onboarding_progress where user_id = 'f1050101-0000-0000-0000-000000000001'$$,
  '42501',
  'permission denied for table onboarding_progress',
  'even the row''s own owner cannot delete it — no DELETE grant exists on this table at all');

select tests.logout();

-- =====================================================================
-- 5. Platform staff can read another user's row (support access, §3).
-- =====================================================================
select tests.login('f1050101-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.onboarding_progress where user_id = 'f1050101-0000-0000-0000-000000000001'),
  1,
  'platform staff can read user A''s onboarding_progress row for support');

select tests.logout();

-- =====================================================================
-- 6. app.attach_updated_at's trigger is actually attached (catalog check —
--    see the note above on why this cannot be proven by comparing `now()`
--    values inside this single transaction), and a real update by the
--    row's owner still succeeds.
-- =====================================================================
select ok(
  exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_proc p on p.oid = t.tgfoid
     where c.relname = 'onboarding_progress'
       and p.proname = 'tg_set_updated_at'
       and not t.tgisinternal
  ),
  'app.attach_updated_at attached app.tg_set_updated_at as a trigger on onboarding_progress');

select tests.login('f1050101-0000-0000-0000-000000000001');

select lives_ok(
  $$update public.onboarding_progress
       set path = 'join_school', step = 2, draft = '{"code":"ACD-1234"}'::jsonb
     where user_id = 'f1050101-0000-0000-0000-000000000001'$$,
  'the row''s own owner can update path/step/draft');

-- =====================================================================
-- 7. The 32000-byte draft cap is enforced at the database, not just by
--    packages/contracts' Zod schema — a direct authenticated write must
--    not be able to bypass it (Opus review, PR #24).
-- =====================================================================
select throws_ok(
  $$update public.onboarding_progress
       set draft = jsonb_build_object('blob', repeat('x', 40000))
     where user_id = 'f1050101-0000-0000-0000-000000000001'$$,
  '23514',
  'an oversized draft is rejected by the CHECK constraint (23514), as the row''s own authenticated owner');

select tests.logout();

select * from finish();
rollback;
