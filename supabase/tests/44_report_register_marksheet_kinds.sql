-- =====================================================================
-- pgTAP · F-OP-03 Part 6 (D-208) — the 'attendance_register' and
-- 'mark_sheet' report_kind values.
--
-- Proves both new enum values participate in report_runs' existing RLS
-- exactly like 'report_card_bulk' does (no policy change was needed, per
-- D-208 item 1): owner/admin/teacher may request and see their own run,
-- cross-tenant isolation holds, staff can insert neither kind (spec §2:
-- both are owner/admin/teacher only, unlike the report_card carve-out),
-- and a client still cannot UPDATE either kind's row directly.
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
-- fixtures: two schools, one teacher and one staff member in School E.
-- ---------------------------------------------------------------------
select tests.mkuser('eeeeeeee-0000-0000-0000-000000000001', 'owner.e@test.local',   'Owner E');
select tests.mkuser('eeeeeeee-0000-0000-0000-000000000002', 'teacher.e@test.local', 'Teacher E');
select tests.mkuser('eeeeeeee-0000-0000-0000-000000000003', 'staff.e@test.local',   'Staff E');
select tests.mkuser('ffffffff-0000-0000-0000-000000000001', 'owner.f@test.local',   'Owner F');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('55555555-5555-5555-5555-555555555555', 'school', 'School E', 'school-e-register',
        'eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001'),
       ('66666666-6666-6666-6666-666666666666', 'school', 'School F', 'school-f-register',
        'ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('eeee0002-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
        'eeeeeeee-0000-0000-0000-000000000002', 'teacher', 'active', now()),
       ('eeee0002-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555',
        'eeeeeeee-0000-0000-0000-000000000003', 'staff', 'active', now());

-- =====================================================================
-- 1-2. both enum values exist
-- =====================================================================
select ok(
  'attendance_register' = any(enum_range(null::public.report_kind)::text[]),
  'public.report_kind has an attendance_register value'
);
select ok(
  'mark_sheet' = any(enum_range(null::public.report_kind)::text[]),
  'public.report_kind has a mark_sheet value'
);

-- =====================================================================
-- 3-4. a teacher can request their own attendance_register and mark_sheet
--      runs
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000002');

select lives_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
            'attendance_register', '{"kind":"attendance_register"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000002', 'key-register-teacher-e')$$,
  'a teacher can request an attendance_register run attributed to themselves'
);

select lives_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000002-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555',
            'mark_sheet', '{"kind":"mark_sheet"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000002', 'key-marksheet-teacher-e')$$,
  'a teacher can request a mark_sheet run attributed to themselves'
);

select tests.logout();

-- Another school's run, for the isolation check.
insert into public.report_runs
  (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
values ('b0000003-0000-0000-0000-000000000003', '66666666-6666-6666-6666-666666666666',
        'attendance_register', '{"kind":"attendance_register"}'::jsonb, 'en',
        'ffffffff-0000-0000-0000-000000000001', 'key-register-owner-f');

-- =====================================================================
-- 5. the owner of School E sees both of their teacher's runs, never
--    School F's
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000001');

select results_eq(
  $$select id from public.report_runs order by id$$,
  $$values ('b0000001-0000-0000-0000-000000000001'::uuid),
           ('b0000002-0000-0000-0000-000000000002'::uuid)$$,
  'the owner of School E sees both new-kind runs and none of School F''s'
);

select tests.logout();

-- =====================================================================
-- 6-7. staff cannot request either new kind (unlike report_card, spec §2
--      has "-" for staff on both)
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000003');

select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000004-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555',
            'attendance_register', '{"kind":"attendance_register"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000003', 'key-register-staff-e')$$,
  '42501', 'new row violates row-level security policy for table "report_runs"',
  'staff cannot request an attendance_register run'
);

select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000005-0000-0000-0000-000000000005', '55555555-5555-5555-5555-555555555555',
            'mark_sheet', '{"kind":"mark_sheet"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000003', 'key-marksheet-staff-e')$$,
  '42501', 'new row violates row-level security policy for table "report_runs"',
  'staff cannot request a mark_sheet run'
);

-- =====================================================================
-- 8. and staff sees neither run once logged in (defence in depth on the
--    SELECT side, same clause the report_card_bulk kind proved in
--    43_report_card_bulk_kind.sql)
-- =====================================================================
select is(
  (select count(*)::int from public.report_runs),
  0,
  'staff sees neither the teacher''s attendance_register nor mark_sheet run'
);

select tests.logout();

-- =====================================================================
-- 9-10. no client UPDATE on either new kind's row (same guarantee as
--       every other kind)
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000001');

select throws_ok(
  $$update public.report_runs set status = 'ready' where id = 'b0000001-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table report_runs',
  'even the owner cannot UPDATE an attendance_register run directly'
);

select throws_ok(
  $$update public.report_runs set status = 'ready' where id = 'b0000002-0000-0000-0000-000000000002'$$,
  '42501', 'permission denied for table report_runs',
  'even the owner cannot UPDATE a mark_sheet run directly'
);

select tests.logout();

-- =====================================================================
-- 11-12. idempotency works identically for both new kinds (same unique
--        index, no kind-specific carve-out)
-- =====================================================================
select tests.login('eeeeeeee-0000-0000-0000-000000000002');

select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000006-0000-0000-0000-000000000006', '55555555-5555-5555-5555-555555555555',
            'attendance_register', '{"kind":"attendance_register"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000002', 'key-register-teacher-e')$$,
  '23505', null,
  'a second live attendance_register run with the same (workspace, idempotency_key) is refused'
);

select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('b0000007-0000-0000-0000-000000000007', '55555555-5555-5555-5555-555555555555',
            'mark_sheet', '{"kind":"mark_sheet"}'::jsonb, 'bn',
            'eeeeeeee-0000-0000-0000-000000000002', 'key-marksheet-teacher-e')$$,
  '23505', null,
  'a second live mark_sheet run with the same (workspace, idempotency_key) is refused'
);

select tests.logout();

select * from finish();
rollback;
