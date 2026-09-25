-- =====================================================================
-- pgTAP · F-OP-03 Part 3 (D-206) — the 'report_card' report_kind value.
--
-- Proves the new enum value participates in report_runs' RLS rather than
-- bypassing it — a teacher's own report_card run is visible to them and to
-- their school's owner, invisible to another school, and still not directly
-- UPDATE-able — and that staff (D-206) may request and read their own
-- report_card run but never a 'sample' run or a colleague's run.
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
-- fixtures: two schools, one teacher each.
-- ---------------------------------------------------------------------
select tests.mkuser('cccccccc-0000-0000-0000-000000000001', 'owner.c@test.local',   'Owner C');
select tests.mkuser('cccccccc-0000-0000-0000-000000000002', 'teacher.c@test.local', 'Teacher C');
select tests.mkuser('cccccccc-0000-0000-0000-000000000003', 'staff.c@test.local',   'Staff C');
select tests.mkuser('dddddddd-0000-0000-0000-000000000001', 'owner.d@test.local',   'Owner D');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('33333333-3333-3333-3333-333333333333', 'school', 'School C', 'school-c-reportcard',
        'cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001'),
       ('44444444-4444-4444-4444-444444444444', 'school', 'School D', 'school-d-reportcard',
        'dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('eeee0001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
        'cccccccc-0000-0000-0000-000000000002', 'teacher', 'active', now()),
       ('eeee0001-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333',
        'cccccccc-0000-0000-0000-000000000003', 'staff', 'active', now());

-- =====================================================================
-- 1. the enum value exists (would fail to even reach RLS otherwise)
-- =====================================================================
select ok(
  'report_card' = any(enum_range(null::public.report_kind)::text[]),
  'public.report_kind has a report_card value'
);

-- =====================================================================
-- 2. a teacher can request their own report_card run
-- =====================================================================
select tests.login('cccccccc-0000-0000-0000-000000000002');

select lives_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('a0000001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
            'report_card', '{"kind":"report_card"}'::jsonb, 'bn',
            'cccccccc-0000-0000-0000-000000000002', 'key-report-card-teacher-c')$$,
  'a teacher can request a report_card run attributed to themselves'
);

select results_eq(
  $$select kind::text from public.report_runs where id = 'a0000001-0000-0000-0000-000000000001'$$,
  $$values ('report_card'::text)$$,
  'the inserted row carries kind = report_card'
);

select tests.logout();

-- Another school's run, for the isolation check.
insert into public.report_runs
  (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
values ('a0000002-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444',
        'report_card', '{"kind":"report_card"}'::jsonb, 'en',
        'dddddddd-0000-0000-0000-000000000001', 'key-report-card-owner-d');

-- =====================================================================
-- 3. the same RLS still scopes report_card rows: the owner of School C
--    sees their teacher's report_card run, never School D's
-- =====================================================================
select tests.login('cccccccc-0000-0000-0000-000000000001');

select results_eq(
  $$select id from public.report_runs order by id$$,
  $$values ('a0000001-0000-0000-0000-000000000001'::uuid)$$,
  'the owner of School C sees the report_card run and none of School D''s'
);

select tests.logout();

-- =====================================================================
-- 4. still no client UPDATE on a report_card row (same guarantee as
--    every other kind — the render pipeline's status transitions stay
--    service-role only)
-- =====================================================================
select tests.login('cccccccc-0000-0000-0000-000000000001');

select throws_ok(
  $$update public.report_runs set status = 'ready' where id = 'a0000001-0000-0000-0000-000000000001'$$,
  '42501', 'permission denied for table report_runs',
  'even the owner cannot UPDATE a report_card run directly'
);

select tests.logout();

-- =====================================================================
-- 5. idempotency works identically for report_card as for every other
--    kind (same unique index, no kind-specific carve-out)
-- =====================================================================
select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('a0000003-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333',
            'report_card', '{"kind":"report_card"}'::jsonb, 'bn',
            'cccccccc-0000-0000-0000-000000000002', 'key-report-card-teacher-c')$$,
  '23505', null,
  'a second live report_card run with the same (workspace, idempotency_key) is refused'
);

-- =====================================================================
-- 6. staff (D-206): may request a report_card run, never a sample run,
--    and sees only their own runs
-- =====================================================================
select tests.login('cccccccc-0000-0000-0000-000000000003');

select lives_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('a0000004-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333',
            'report_card', '{"kind":"report_card"}'::jsonb, 'bn',
            'cccccccc-0000-0000-0000-000000000003', 'key-report-card-staff-c')$$,
  'staff can request a report_card run attributed to themselves'
);

select throws_ok(
  $$insert into public.report_runs
      (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
    values ('a0000005-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333',
            'sample', '{"kind":"sample"}'::jsonb, 'bn',
            'cccccccc-0000-0000-0000-000000000003', 'key-sample-staff-c')$$,
  '42501', 'new row violates row-level security policy for table "report_runs"',
  'staff cannot request a sample run'
);

select results_eq(
  $$select id from public.report_runs order by id$$,
  $$values ('a0000004-0000-0000-0000-000000000004'::uuid)$$,
  'staff sees only their own run, not the teacher''s'
);

select tests.logout();

select tests.login('cccccccc-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.report_runs),
  2,
  'the owner sees both the teacher''s and the staff member''s runs'
);
select tests.logout();

select * from finish();
rollback;
