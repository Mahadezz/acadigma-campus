-- =====================================================================
-- pgTAP · F-OP-03 Parts 1-2 — report_runs / report_run_items: tenant
-- isolation, role escalation and the "no client UPDATE, ever" guarantee
-- that keeps a render's status/file_id out of client hands.
--
-- Core security property this file exists to prove: a teacher sees only
-- their own report runs (or every run once they are owner/admin), an
-- admin/teacher of School B can never see School A's runs by any query,
-- and no `authenticated` role — not even an owner — can UPDATE a run
-- directly (status/file_id transitions are service-role only).
-- =====================================================================
begin;
select plan(20);

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
-- fixtures: two schools. School A: owner, admin, two teachers. School B:
-- an admin, for the isolation cases.
-- ---------------------------------------------------------------------
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000001', 'owner.a@test.local',    'Owner A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000002', 'admin.a@test.local',    'Admin A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000003', 'teacher.a@test.local',  'Teacher A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000004', 'teacher2.a@test.local', 'Teacher A2');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000001', 'owner.b@test.local',    'Owner B');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000002', 'admin.b@test.local',    'Admin B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a-reports',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('22222222-2222-2222-2222-222222222222', 'school', 'School B', 'school-b-reports',
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('dddd0002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000002', 'admin',   'active', now()),
       ('dddd0003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000003', 'teacher', 'active', now()),
       ('dddd0004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000004', 'teacher', 'active', now()),
       ('dddd0006-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-0000-0000-0000-000000000002', 'admin',   'active', now());

-- =====================================================================
-- 1. anon has no privileges on either table at all
-- =====================================================================
select ok(not has_table_privilege('anon', 'public.report_runs', 'select'),
  'anon cannot select report_runs');
select ok(not has_table_privilege('anon', 'public.report_runs', 'insert'),
  'anon cannot insert report_runs');
select ok(not has_table_privilege('anon', 'public.report_run_items', 'select'),
  'anon cannot select report_run_items');

-- =====================================================================
-- 2. authenticated has select+insert on report_runs, select-only on items,
--    and NEVER update/delete on either (service-role-only transitions)
-- =====================================================================
select ok(has_table_privilege('authenticated', 'public.report_runs', 'select'),
  'authenticated can select report_runs (RLS still scopes rows)');
select ok(has_table_privilege('authenticated', 'public.report_runs', 'insert'),
  'authenticated can insert report_runs (RLS still checks requested_by)');
select ok(not has_table_privilege('authenticated', 'public.report_runs', 'update'),
  'authenticated has no UPDATE grant on report_runs at all');
select ok(not has_table_privilege('authenticated', 'public.report_run_items', 'insert'),
  'authenticated has no INSERT grant on report_run_items (Part 5 writes via service role)');

-- =====================================================================
-- 3. teacher inserts their own run; cannot insert one attributed to
--    someone else (escalation)
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000003');

select lives_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('e0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
            'sample', '{"kind":"sample"}'::jsonb, 'en',
            'aaaaaaaa-0000-0000-0000-000000000003', 'key-teacher-a-own')$$,
  'a teacher can request a sample run attributed to themselves');

select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('e0000002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
            'sample', '{"kind":"sample"}'::jsonb, 'en',
            'aaaaaaaa-0000-0000-0000-000000000004', 'key-teacher-a-forged')$$,
  '42501', null,
  'a teacher cannot insert a run attributed to a colleague');

select tests.logout();

-- Second teacher's own run, for the isolation checks below.
insert into public.report_runs
  (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
values ('e0000003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'sample', '{"kind":"sample"}'::jsonb, 'en',
        'aaaaaaaa-0000-0000-0000-000000000004', 'key-teacher-a2-own');

insert into public.report_runs
  (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
values ('e0000004-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
        'sample', '{"kind":"sample"}'::jsonb, 'en',
        'bbbbbbbb-0000-0000-0000-000000000002', 'key-admin-b-own');

-- =====================================================================
-- 4. a teacher sees only their own run, never a colleague's or another
--    school's, by direct select
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000003');

select results_eq(
  $$select id from public.report_runs order by id$$,
  $$values ('e0000001-0000-0000-0000-000000000001'::uuid)$$,
  'teacher A sees only their own report run');

select tests.logout();

-- =====================================================================
-- 5. owner/admin of School A see every School A run, never School B's
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');

select results_eq(
  $$select id from public.report_runs order by id$$,
  $$values ('e0000001-0000-0000-0000-000000000001'::uuid),
           ('e0000003-0000-0000-0000-000000000003'::uuid)$$,
  'the owner of School A sees both School A runs and none of School B''s');

select tests.logout();

select tests.login('bbbbbbbb-0000-0000-0000-000000000002');

select results_eq(
  $$select id from public.report_runs order by id$$,
  $$values ('e0000004-0000-0000-0000-000000000004'::uuid)$$,
  'School B''s admin sees only School B''s run — School A is invisible');

select tests.logout();

-- =====================================================================
-- 6. no authenticated role — not even the owner — can UPDATE a run
--    directly; status/file_id transitions are service-role only
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000001');

select throws_ok(
  $$update public.report_runs set status = 'ready' where id = 'e0000001-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table report_runs',
  'even the owner cannot UPDATE report_runs directly (no UPDATE grant at all)');

select throws_ok(
  $$delete from public.report_runs where id = 'e0000001-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table report_runs',
  'even the owner cannot DELETE a report_runs row directly');

select tests.logout();

-- Confirm as postgres (RLS bypassed) that neither statement above touched
-- the row — a thrown error rolled the individual statement back.
select is(
  (select status::text from public.report_runs where id = 'e0000001-0000-0000-0000-000000000001'),
  'queued',
  'the row is untouched after the rejected UPDATE attempt');

-- =====================================================================
-- 7. idempotency: a second identical (workspace, key) insert while a live
--    run exists is refused by the unique index, not silently duplicated
--    (§5.8/§9 AC19 — the repository layer is what turns this into "return
--    the existing run" rather than an error reaching the user)
-- =====================================================================
select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('e0000005-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
            'sample', '{"kind":"sample"}'::jsonb, 'en',
            'aaaaaaaa-0000-0000-0000-000000000003', 'key-teacher-a-own')$$,
  '23505', null,
  'a second live run with the same (workspace, idempotency_key) is refused by the unique index');

-- A failed/expired run with the same key does not block a fresh attempt.
update public.report_runs set status = 'failed', error_code = 'render_error'
  where id = 'e0000001-0000-0000-0000-000000000001';

select lives_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('e0000006-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
            'sample', '{"kind":"sample"}'::jsonb, 'en',
            'aaaaaaaa-0000-0000-0000-000000000003', 'key-teacher-a-own')$$,
  'the same idempotency key is reusable once the earlier run has failed');

-- =====================================================================
-- 8. report_run_items — visibility follows the parent run's owner
-- =====================================================================
insert into public.report_run_items
  (id, workspace_id, report_run_id, subject_type, subject_id, status)
values ('f0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'e0000001-0000-0000-0000-000000000001', 'student', gen_random_uuid(), 'queued'),
       ('f0000002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'e0000003-0000-0000-0000-000000000003', 'student', gen_random_uuid(), 'queued');

-- The composite FK (report_run_id, workspace_id) -> report_runs (id,
-- workspace_id) rejects an item whose workspace_id doesn't match its parent
-- run's — School A's run 'e0000001...' with School B's workspace_id — as a
-- foreign key violation, not just an RLS-invisible row.
select throws_ok(
  $$insert into public.report_run_items
      (id, workspace_id, report_run_id, subject_type, subject_id)
    values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222',
            'e0000001-0000-0000-0000-000000000001', 'student', gen_random_uuid())$$,
  '23503', null,
  'an item''s workspace_id must match its parent run''s (composite FK), not just any real run id'
);

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');

select results_eq(
  $$select id from public.report_run_items order by id$$,
  $$values ('f0000001-0000-0000-0000-000000000001'::uuid)$$,
  'a teacher sees only the run items of their own report run');

select throws_ok(
  $$insert into public.report_run_items
      (id, workspace_id, report_run_id, subject_type, subject_id)
    values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
            'e0000001-0000-0000-0000-000000000001', 'student', gen_random_uuid())$$,
  '42501', 'permission denied for table report_run_items',
  'no authenticated role can insert report_run_items directly (service-role/Part 5 only)');

select tests.logout();

select * from finish();
rollback;
