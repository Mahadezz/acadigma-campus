-- =====================================================================
-- pgTAP · F-CM-06 Part 4 (D-62) — public.expire_pro_trials()
--
-- Covers the acceptance criteria this Part narrows §9 AC1-AC3 to (D-62 —
-- an expired trial goes to access_mode=read_only, not to a "Free" plan that
-- no longer exists after D-42):
--   1. a trialing subscription whose trial_ends_at has passed is expired:
--      subscriptions.status -> 'expired', workspaces.access_mode ->
--      'read_only' with a reason, and a trial_expired subscription_events
--      row is written.
--   2. app.set_access_mode()'s own audit write is what lands the row in
--      audit_events (rule 9 — no application code writes audit rows), under
--      the action already in the catalogue.
--   3. a still-trialing subscription is completely untouched.
--   4. a paying (status='active') subscription is never touched, even if
--      its trial_ends_at happens to be in the past — "never touch a paying
--      school" is enforced by the status filter itself, not a bolt-on check.
--   5. idempotent: a second run the same day expires zero further trials and
--      writes no duplicate event.
--   6. only a privileged (service-role) caller may invoke the function at
--      all — proven directly against the grant (D-54: explicit, scoped),
--      not by guessing Postgres's own permission-denied wording.
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

-- ---------------------------------------------------------------------
-- 0. Only `service_role` may ever execute this function — checked directly
--    against the grant (12_function_grants_invariant.sql's own style),
--    rather than via throws_ok against Postgres's own permission-denied
--    wording, which this suite has no way to pin exactly (CLAUDE.md rule:
--    pin throws_ok messages, or don't use throws_ok for it).
-- ---------------------------------------------------------------------
select ok(
  has_function_privilege('service_role', 'public.expire_pro_trials()', 'execute'),
  'service_role may execute the trial-expiry job');

select ok(
  not has_function_privilege('authenticated', 'public.expire_pro_trials()', 'execute'),
  'authenticated has no EXECUTE grant on the trial-expiry job at all');

select ok(
  not has_function_privilege('anon', 'public.expire_pro_trials()', 'execute'),
  'anon has no EXECUTE grant on the trial-expiry job');

-- ---------------------------------------------------------------------
-- Setup: three school workspaces, each via a real authenticated INSERT so
-- the billing-bootstrap trigger runs exactly as it does in production
-- (Part 2), then backdated as the privileged `postgres` role where a
-- scenario needs a trial already in the past — a client can never do this
-- themselves (16_billing_bootstrap_guard.sql proves the guard still refuses
-- a direct client UPDATE of trial_ends_at/access_mode).
-- ---------------------------------------------------------------------
select tests.mkuser('19000001-0000-0000-0000-000000000001', 'p4.expired@test.local', 'P4 Expired Trial Owner');
select tests.login('19000001-0000-0000-0000-000000000001');
insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('19000001-0000-0000-0000-0000000000a1', 'school', 'P4 Expired Trial School',
        'p4-expired-trial', '19000001-0000-0000-0000-000000000001',
        '19000001-0000-0000-0000-000000000001');
select tests.logout();

select tests.mkuser('19000002-0000-0000-0000-000000000002', 'p4.active@test.local', 'P4 Active Trial Owner');
select tests.login('19000002-0000-0000-0000-000000000002');
insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('19000002-0000-0000-0000-0000000000a2', 'school', 'P4 Active Trial School',
        'p4-active-trial', '19000002-0000-0000-0000-000000000002',
        '19000002-0000-0000-0000-000000000002');
select tests.logout();

select tests.mkuser('19000003-0000-0000-0000-000000000003', 'p4.paying@test.local', 'P4 Paying School Owner');
select tests.login('19000003-0000-0000-0000-000000000003');
insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('19000003-0000-0000-0000-0000000000a3', 'school', 'P4 Paying School',
        'p4-paying-school', '19000003-0000-0000-0000-000000000003',
        '19000003-0000-0000-0000-000000000003');
select tests.logout();

-- Workspace 1's trial ended yesterday. Workspace 3 is already a paying
-- (active) subscription whose trial_ends_at also happens to be in the past
-- (the realistic shape once mid-trial upgrades exist, §5.4) — it must stay
-- untouched regardless of that date. Workspace 2's trial (set by the
-- bootstrap trigger to ~30 days out) is left exactly as created.
update public.subscriptions
   set trial_ends_at = now() - interval '1 day'
 where workspace_id = '19000001-0000-0000-0000-0000000000a1';

update public.subscriptions
   set status = 'active', trial_ends_at = now() - interval '1 day'
 where workspace_id = '19000003-0000-0000-0000-0000000000a3';

-- =====================================================================
-- 1. Run the job as the privileged role (this session's default outside
--    tests.login() — is_privileged_context() treats it exactly like the
--    cron route's service-role client).
-- =====================================================================
select is(
  public.expire_pro_trials(),
  1,
  'the job expires exactly one trial — workspace 1 only');

select is(
  (select status::text from public.subscriptions where workspace_id = '19000001-0000-0000-0000-0000000000a1'),
  'expired',
  'the expired trial''s subscription moves to status=expired');

select is(
  (select access_mode::text from public.workspaces where id = '19000001-0000-0000-0000-0000000000a1'),
  'read_only',
  'the expired trial''s workspace is put into access_mode=read_only');

select is(
  (select access_mode_reason from public.workspaces where id = '19000001-0000-0000-0000-0000000000a1'),
  'Your Pro trial has ended.',
  'access_mode_reason is set — the school-shell banner reads this text');

select is(
  (select count(*)::int from public.subscription_events se
    join public.subscriptions s on s.id = se.subscription_id
   where s.workspace_id = '19000001-0000-0000-0000-0000000000a1'
     and se.type = 'trial_expired'
     and se.from_status = 'trialing'
     and se.to_status = 'expired'),
  1,
  'a trial_expired subscription_events row was written');

select is(
  (select count(*)::int from public.audit_events
    where workspace_id = '19000001-0000-0000-0000-0000000000a1'
      and action = 'workspace.access_mode_read_only'),
  1,
  'app.set_access_mode wrote the curated audit row via the catalogue (rule 9 — no application code writes audit rows)');

-- =====================================================================
-- 2. The still-trialing workspace is completely untouched.
-- =====================================================================
select is(
  (select status::text from public.subscriptions where workspace_id = '19000002-0000-0000-0000-0000000000a2'),
  'trialing',
  'a trial that has not yet ended is left exactly as it was');

select is(
  (select access_mode::text from public.workspaces where id = '19000002-0000-0000-0000-0000000000a2'),
  'normal',
  'a workspace still inside its trial window stays access_mode=normal');

-- =====================================================================
-- 3. The paying school (status='active') is never touched — "never touch a
--    paying school" — even though its trial_ends_at is in the past.
-- =====================================================================
select is(
  (select status::text from public.subscriptions where workspace_id = '19000003-0000-0000-0000-0000000000a3'),
  'active',
  'a paying (active) subscription is untouched by the trial-expiry job');

select is(
  (select access_mode::text from public.workspaces where id = '19000003-0000-0000-0000-0000000000a3'),
  'normal',
  'a paying school''s workspace stays access_mode=normal — the job never matched it');

select is(
  (select count(*)::int from public.subscription_events se
    join public.subscriptions s on s.id = se.subscription_id
   where s.workspace_id = '19000003-0000-0000-0000-0000000000a3'
     and se.type = 'trial_expired'),
  0,
  'no trial_expired event was written for the paying school');

-- =====================================================================
-- 4. Idempotency: running the job again the same day processes nothing —
--    the WHERE clause no longer matches a row already moved to 'expired'.
-- =====================================================================
select is(
  public.expire_pro_trials(),
  0,
  're-running the job the same day expires zero further trials');

select is(
  (select count(*)::int from public.subscription_events se
    join public.subscriptions s on s.id = se.subscription_id
   where s.workspace_id = '19000001-0000-0000-0000-0000000000a1'
     and se.type = 'trial_expired'),
  1,
  'the second run did not write a duplicate trial_expired event');

select * from finish();
rollback;
