-- =====================================================================
-- pgTAP · public.create_school_workspace, called by an ALREADY-ONBOARDED
-- caller (20260925300101_create_school_workspace.sql). Follow-up to
-- 30_create_school_workspace.sql, split out rather than appended because
-- that file is mid-edit in another open PR.
--
-- Owner report 2026-09-29: no in-app link reached "Create a school" for a
-- signed-in user (workspace-switcher.tsx, apps/web/app/(personal)/personal
-- /page.tsx — both fixed in this PR). Before shipping a new entry point into
-- an already-existing RPC, prove the RPC itself was already safe for the
-- population that now actually reaches it: a caller who exited onboarding
-- via the tutoring link (§4.2's "quiet third affordance" — completed_at
-- set, no school) creates a school cleanly, and still has exactly one
-- personal workspace. (Ponytail review: an "owner of one school creates a
-- second" scenario was cut here — that caller's switcher chip already had
-- more than one workspace and was already tappable before this PR, so it
-- proves nothing this diff changed.)
-- =====================================================================
begin;
select plan(6);

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

create or replace function tests.school_input(p_key uuid, p_patch jsonb default '{}')
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'name', 'Second School',
    'eiin', null,
    'board', 'dhaka',
    'medium', 'bangla',
    'timezone', 'Asia/Dhaka',
    'working_days', jsonb_build_array(6, 7, 1, 2, 3, 4),
    'academic_year', jsonb_build_object('name', '2026', 'starts_on', '2026-01-01', 'ends_on', '2026-12-31'),
    'grade_levels', jsonb_build_array(
      jsonb_build_object('name', 'Class 6', 'name_bn', 'ষষ্ঠ শ্রেণি', 'level_number', 6, 'stage', 'secondary')),
    'idempotency_key', p_key
  ) || p_patch;
$fn$;

-- ---------------------------------------------------------------------
-- 1. Exited onboarding as "personal only", then changes their mind.
-- ---------------------------------------------------------------------
select tests.mkuser('f1050402-0000-0000-0000-000000000001', 'p4b.tutor@test.local', 'Tutor');

select tests.login('f1050402-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050402-0000-0000-0000-000000000001' and type = 'personal'),
  1, 'registration alone gives exactly one personal workspace');

-- The tutoring exit link's own write (completeOnboarding / markOnboardingComplete):
-- onboarding_progress.completed_at set, no school, no draft.
insert into public.onboarding_progress (user_id, path, step, draft, completed_at)
values ('f1050402-0000-0000-0000-000000000001', 'undecided', 1, '{}'::jsonb, now())
on conflict (user_id) do update set path = 'undecided', step = 1, draft = '{}'::jsonb, completed_at = now();

create temp table tutor_call as
  select public.create_school_workspace(
    tests.school_input('b0000000-0000-4000-8000-000000000001'), '2026-09-30-interim') as r;
select tests.logout();

select is((select r ->> 'error' from tutor_call), null,
  'create_school_workspace succeeds for a caller who already "completed" onboarding as personal-only');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050402-0000-0000-0000-000000000001' and type = 'personal'),
  1, 'still exactly one personal workspace — create_school_workspace never inserts type=personal');

select is(
  (select count(*)::int from public.workspaces
    where created_by = 'f1050402-0000-0000-0000-000000000001' and type = 'school'),
  1, 'exactly one school now exists for this caller');

select results_eq(
  $$select path::text, completed_at is not null, draft is null
      from public.onboarding_progress
     where user_id = 'f1050402-0000-0000-0000-000000000001'$$,
  $$values ('create_school', true, true)$$,
  'onboarding_progress is overwritten to the create_school path, not left at the stale "undecided" row');

select is(
  (select count(*)::int from public.workspace_members
    where user_id = 'f1050402-0000-0000-0000-000000000001' and status = 'active'),
  2, 'the caller has exactly two active memberships: their personal workspace and the new school');

select * from finish();
rollback;
