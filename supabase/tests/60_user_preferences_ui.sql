-- =====================================================================
-- pgTAP · F-ID-10 Part 1 — user_preferences.ui_mode / text_size (D-403,
-- 20260925300312_user_preferences_ui.sql)
--
-- The two new columns ride the table's existing `class U1` RLS (own row
-- only, full CRUD, no platform-admin bypass — DATA-MODEL.md §1.7): this file
-- proves that unchanged for the new columns, that every new user gets a row
-- with the documented defaults from app.handle_new_user() (no lazy-create
-- path needed), and that the enum types reject an out-of-range value.
--   1. Defaults — a brand-new user's row reads ui_mode='full',
--      text_size='normal' with no extra insert.
--   2. Isolation (select) — a user sees only their own ui_mode/text_size;
--      a stranger's row is invisible, count 0.
--   3. Isolation (write) — a direct UPDATE aimed at another user's row
--      touches zero rows; the target's values are unchanged.
--   4. A user updates their OWN ui_mode/text_size; the row's updated_at
--      moves (existing app.attach_updated_at trigger, unaffected by this
--      migration).
--   5. Escalation — a platform admin gets zero rows from another user's
--      preferences: this table has no platform-admin branch (unlike
--      onboarding_progress's documented deviation), so is_platform_admin
--      grants nothing here.
--   6. Enum guard — an invalid ui_mode/text_size value is rejected by
--      Postgres (22P02), pinned message, 4-arg throws_ok.
-- =====================================================================
begin;
select plan(13);

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

select tests.mkuser('d1040001-0000-0000-0000-00000000000a', 'd104.alice@test.local', 'Alice');
select tests.mkuser('d1040001-0000-0000-0000-00000000000b', 'd104.bob@test.local',   'Bob');
select tests.mkuser('d1040001-0000-0000-0000-00000000000c', 'd104.platform@test.local', 'Platform Staff');

update public.profiles set is_platform_admin = true
 where id = 'd1040001-0000-0000-0000-00000000000c';

-- ---------------------------------------------------------------------
-- 1. Defaults — handle_new_user() already inserted the row (D-403,
--    F-ID-10 §3 "no row needed to read": the row exists eagerly here,
--    but the defaults are what a lazily-created row would read as too).
-- ---------------------------------------------------------------------
select results_eq(
  $$select ui_mode::text, text_size::text from public.user_preferences
     where user_id = 'd1040001-0000-0000-0000-00000000000a'$$,
  $$values ('full', 'normal')$$,
  'a brand-new user''s row defaults to ui_mode=full, text_size=normal');

-- ---------------------------------------------------------------------
-- 2. Isolation — select
-- ---------------------------------------------------------------------
select tests.login('d1040001-0000-0000-0000-00000000000a');   -- Alice
select is(
  (select ui_mode::text from public.user_preferences
    where user_id = 'd1040001-0000-0000-0000-00000000000a'),
  'full', 'Alice reads her own ui_mode');
select is(
  (select count(*)::int from public.user_preferences
    where user_id = 'd1040001-0000-0000-0000-00000000000b'),
  0, 'Alice sees zero rows of Bob''s preferences');
select tests.logout();

-- ---------------------------------------------------------------------
-- 3. Isolation — write. Alice aims an UPDATE at Bob's row; RLS's USING
--    clause filters it to zero matching rows before WITH CHECK even runs.
-- ---------------------------------------------------------------------
select tests.login('d1040001-0000-0000-0000-00000000000a');   -- Alice
select is(
  (with upd as (
     update public.user_preferences set ui_mode = 'basic'
      where user_id = 'd1040001-0000-0000-0000-00000000000b'
     returning 1
   ) select count(*)::int from upd),
  0, 'Alice''s UPDATE aimed at Bob''s row touches zero rows');
select tests.logout();

select is(
  (select ui_mode::text from public.user_preferences
    where user_id = 'd1040001-0000-0000-0000-00000000000b'),
  'full', 'Bob''s ui_mode is unchanged by Alice''s attempt (read as postgres)');

-- ---------------------------------------------------------------------
-- 4. A user updates their OWN row.
-- ---------------------------------------------------------------------
select tests.login('d1040001-0000-0000-0000-00000000000a');   -- Alice
select is(
  (with upd as (
     update public.user_preferences set ui_mode = 'basic', text_size = 'xlarge'
      where user_id = 'd1040001-0000-0000-0000-00000000000a'
     returning 1
   ) select count(*)::int from upd),
  1, 'Alice updates her own row: exactly one row affected');
select tests.logout();

select results_eq(
  $$select ui_mode::text, text_size::text from public.user_preferences
     where user_id = 'd1040001-0000-0000-0000-00000000000a'$$,
  $$values ('basic', 'xlarge')$$,
  'Alice''s own ui_mode/text_size are now basic/xlarge (read as postgres)');
select cmp_ok(
  (select updated_at from public.user_preferences
    where user_id = 'd1040001-0000-0000-0000-00000000000a'),
  '>', (select created_at from public.user_preferences
    where user_id = 'd1040001-0000-0000-0000-00000000000a'),
  'updated_at moved past created_at after the edit (existing attach_updated_at trigger)');

-- ---------------------------------------------------------------------
-- 5. Escalation — no platform-admin branch on this table.
-- ---------------------------------------------------------------------
select tests.login('d1040001-0000-0000-0000-00000000000c');   -- platform admin
select is(
  (select count(*)::int from public.user_preferences
    where user_id = 'd1040001-0000-0000-0000-00000000000a'),
  0, 'a platform admin sees zero rows of another user''s preferences — no bypass on this table');
select is(
  (with upd as (
     update public.user_preferences set ui_mode = 'basic'
      where user_id = 'd1040001-0000-0000-0000-00000000000b'
     returning 1
   ) select count(*)::int from upd),
  0, 'a platform admin cannot write another user''s preferences either');
select tests.logout();

-- ---------------------------------------------------------------------
-- 6. Enum guard.
-- ---------------------------------------------------------------------
select tests.login('d1040001-0000-0000-0000-00000000000a');   -- Alice
select throws_ok(
  $$update public.user_preferences set ui_mode = 'bogus'
     where user_id = 'd1040001-0000-0000-0000-00000000000a'$$,
  '22P02', 'invalid input value for enum public.ui_mode: "bogus"',
  'an out-of-range ui_mode value is rejected by the enum type');
select throws_ok(
  $$update public.user_preferences set text_size = 'huge'
     where user_id = 'd1040001-0000-0000-0000-00000000000a'$$,
  '22P02', 'invalid input value for enum public.text_size: "huge"',
  'an out-of-range text_size value is rejected by the enum type');
select tests.logout();

select ok(
  not has_table_privilege('anon', 'public.user_preferences', 'select'),
  'anon has no SELECT privilege on user_preferences at all');

select * from finish();
rollback;
