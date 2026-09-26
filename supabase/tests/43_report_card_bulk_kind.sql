-- =====================================================================
-- pgTAP · F-OP-03 Part 5 (D-207) — the 'report_card_bulk' report_kind value
-- and the tightened report_runs_select / report_run_items_select policies
-- (security LOW from the #63 review: staff see only report_card runs).
--
-- Proves: the new enum value participates in RLS like every other kind for
-- owner/admin/teacher; a teacher can request and read their own bulk run;
-- staff cannot insert a bulk run (existing 300313 insert policy, unchanged);
-- and — the new clause this migration adds — staff cannot SELECT a
-- report_card_bulk run even when requested_by is their own id (a state that
-- cannot arise through the insert policy, simulated here directly to prove
-- the read guarantee does not rely solely on the insert-time restriction
-- holding), for both report_runs and report_run_items.
-- =====================================================================
begin;
select plan(10);

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
-- fixtures: one school, one teacher, one staff member.
-- ---------------------------------------------------------------------
select tests.mkuser('eeeeeeee-0000-0000-0000-000000000001', 'owner.e@test.local',   'Owner E');
select tests.mkuser('eeeeeeee-0000-0000-0000-000000000002', 'teacher.e@test.local', 'Teacher E');
select tests.mkuser('eeeeeeee-0000-0000-0000-000000000003', 'staff.e@test.local',   'Staff E');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('55555555-5555-5555-5555-555555555555', 'school', 'School E', 'school-e-bulkreport',
        'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('eeee0002-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
        'eeeeeeee-0000-0000-0000-000000000002', 'teacher', 'active', now()),
       ('eeee0002-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555',
        'eeeeeeee-0000-0000-0000-000000000003', 'staff', 'active', now());

-- =====================================================================
-- 1. the enum value exists
-- =====================================================================
select ok(
  'report_card_bulk' = any(enum_range(null::public.report_kind)::text[]),
  'public.report_kind has a report_card_bulk value'
);

-- =====================================================================
-- 2. a teacher can request their own report_card_bulk run and read it back
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000002');

select lives_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
            'report_card_bulk', '{"kind":"report_card_bulk"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000002', 'key-bulk-teacher-e')$$,
  'a teacher can request a report_card_bulk run attributed to themselves'
);

select results_eq(
  $$select kind::text from public.report_runs where id = 'b0000001-0000-0000-0000-000000000001'$$,
  $$values ('report_card_bulk'::text)$$,
  'the teacher reads their own report_card_bulk run back'
);

select tests.logout();

-- =====================================================================
-- 3. staff cannot INSERT a report_card_bulk run (300313's insert policy —
--    unchanged by this migration, asserted here as a regression guard)
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000003');

select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000002-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555',
            'report_card_bulk', '{"kind":"report_card_bulk"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000003', 'key-bulk-staff-e')$$,
  '42501', 'new row violates row-level security policy for table "report_runs"',
  'staff cannot request a report_card_bulk run'
);

select tests.logout();

-- =====================================================================
-- 4. defence in depth: a report_card_bulk row directly attributed to the
--    staff member (a state the insert policy above already refuses to
--    create, simulated here as the table owner) is still invisible to
--    staff — the SELECT policy itself refuses it, not just the insert path.
-- =====================================================================
insert into public.report_runs
  (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
values ('b0000003-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555',
        'report_card_bulk', '{"kind":"report_card_bulk"}'::jsonb, 'bn',
        'eeeeeeee-0000-0000-0000-000000000003', 'key-bulk-staff-simulated');

-- One report_run_items row hanging off it, same simulation.
insert into public.report_run_items
  (id, workspace_id, report_run_id, subject_type, subject_id, status)
values ('b0000004-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555',
        'b0000003-0000-0000-0000-000000000003', 'student',
        'b0000005-0000-0000-0000-000000000005', 'ready');

select tests.login('eeeeeeee-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.report_runs
   where id = 'b0000003-0000-0000-0000-000000000003'),
  0,
  'staff cannot SELECT a report_card_bulk run even when requested_by is their own id'
);

select is(
  (select count(*)::int from public.report_run_items
   where id = 'b0000004-0000-0000-0000-000000000004'),
  0,
  'staff cannot SELECT that run''s report_run_items either'
);

select tests.logout();

-- =====================================================================
-- 5. regression: the owner (who satisfies the new clause via
--    has_role(...,'{owner,admin,teacher}')) still sees every run and item
--    in their workspace, bulk included.
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000001');

select is(
  (select count(*)::int from public.report_runs
   where workspace_id = '55555555-5555-5555-5555-555555555555'),
  2,
  'the owner sees both the teacher''s and the simulated staff-attributed bulk runs'
);

select is(
  (select count(*)::int from public.report_run_items
   where report_run_id = 'b0000003-0000-0000-0000-000000000003'),
  1,
  'the owner sees the simulated run''s report_run_items row'
);

select tests.logout();

-- =====================================================================
-- 6. positive regression (lead review, 2026-09-26): the tightened SELECT
--    policy's new `kind = 'report_card' OR has_role(...,{owner,admin,
--    teacher})` clause must not also take away staff's existing D-206
--    grant to request and read their OWN report_card run — the clause
--    only needs to narrow report_card_bulk visibility, not report_card.
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000003');

select lives_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000006-0000-0000-0000-000000000006', '55555555-5555-5555-5555-555555555555',
            'report_card', '{"kind":"report_card"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000003', 'key-report-card-staff-e')$$,
  'staff can still request their own report_card run (D-206, unaffected by the D-207 tightening)'
);

select results_eq(
  $$select id from public.report_runs where kind = 'report_card' order by id$$,
  $$values ('b0000006-0000-0000-0000-000000000006'::uuid)$$,
  'staff still sees their own report_card run under the tightened SELECT policy'
);

select tests.logout();

select * from finish();
rollback;
