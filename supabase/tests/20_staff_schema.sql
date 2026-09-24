-- =====================================================================
-- pgTAP · F-OP-06 Part 1 — staff_records, staff_compensation,
-- staff_documents: tenant isolation, role escalation, the compensation
-- exclusion constraint, app.staff_hourly_rate point-in-time correctness,
-- app.can_open_staff_document, the self-update column guard and the
-- membership<->record status trigger.
--
-- Core security property this file exists to prove (F-OP-06 Part 1 demo):
-- a teacher can read their own record and their own rate, cannot read a
-- colleague's rate by ANY query (direct table, join, or the RPC from
-- another user's perspective), and app.staff_hourly_rate returns the rate
-- in force on a PAST date, not today's.
-- =====================================================================
begin;
select plan(64);

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
-- fixtures: two schools. School A: owner, admin, two teachers, a parent.
-- School B: an owner, for the isolation cases.
-- ---------------------------------------------------------------------
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000001', 'owner.a@test.local',    'Owner A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000002', 'admin.a@test.local',    'Admin A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000003', 'teacher.a@test.local',  'Teacher A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000004', 'teacher2.a@test.local', 'Teacher A2');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000005', 'parent.a@test.local',   'Parent A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000008', 'staff3.a@test.local',   'Staff A3 (no rate)');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000001', 'owner.b@test.local',    'Owner B');

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a-staff',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('22222222-2222-2222-2222-222222222222', 'school', 'School B', 'school-b-staff',
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
values ('dddd0002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000002', 'admin',   'active', now()),
       ('dddd0003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000003', 'teacher', 'active', now()),
       ('dddd0004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000004', 'teacher', 'active', now()),
       ('dddd0005-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000005', 'parent',  'active', now()),
       ('dddd0008-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000008', 'staff',   'active', now());

-- =====================================================================
-- 0. custom_labels seeding (F-OP-06 §3.4) — the workspace_bootstrap
--    trigger seeded nine default labels for each school workspace above
--    (Guardian/parent is not one of them — custom_labels forbids
--    base_role = 'parent' entirely; D-63 deviation from spec §3.4).
-- =====================================================================
select is(
  (select count(*)::int from public.custom_labels where workspace_id = '11111111-1111-1111-1111-111111111111'),
  9, 'a new school workspace is seeded with the nine default custom labels');

select is(
  (select name from public.custom_labels
    where workspace_id = '11111111-1111-1111-1111-111111111111' and base_role = 'admin'
    order by sort_order limit 1),
  'Principal', 'Principal is the first admin label, sort_order 0');

-- =====================================================================
-- fixtures: staff_records + staff_compensation, School A and School B
-- (inserted as postgres, bypassing RLS, exactly like every other fixture
-- block in this test suite).
-- =====================================================================
insert into public.staff_records
  (id, workspace_id, user_id, membership_id, staff_code, full_name, employment_status, joined_on)
values
  ('ee000003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000003', 'dddd0003-0000-0000-0000-000000000003',
   'TCH-2026-0001', 'Teacher A', 'active', '2025-01-01'),
  ('ee000004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000004', 'dddd0004-0000-0000-0000-000000000004',
   'TCH-2026-0002', 'Teacher A2', 'active', '2025-01-01'),
  ('ee000009-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-0000-0000-000000000001', null,
   'TCH-2026-0099', 'Owner B (as staff)', 'active', '2025-01-01'),
  ('ee000008-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000008', 'dddd0008-0000-0000-0000-000000000008',
   'STA-2026-0003', 'Staff A3', 'active', '2025-01-01');

insert into public.staff_compensation
  (id, workspace_id, staff_record_id, hourly_rate_paisa, effective_from, effective_to)
values
  ('cc000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'ee000003-0000-0000-0000-000000000003', 35000, '2025-01-01', null),
  -- Teacher A2's own row exists precisely so the "join through to a
  -- colleague" test below proves RLS filters it out, not merely that no
  -- such row exists at all.
  ('cc000002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'ee000004-0000-0000-0000-000000000004', 45000, '2025-01-01', null);

insert into public.files
  (id, workspace_id, owner_id, bucket, path, original_name, mime_type, size_bytes, created_by)
values
  ('ff11ee09-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-0000-0000-000000000001', 'private', 'staff/owner-b-nid.pdf', 'nid.pdf',
   'application/pdf', 1024, 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('aa11ee03-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000003', 'private', 'staff/teacher-a-nid.pdf', 'nid.pdf',
   'application/pdf', 1024, 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aa11ee04-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000004', 'private', 'staff/teacher-a2-nid.pdf', 'nid.pdf',
   'application/pdf', 1024, 'aaaaaaaa-0000-0000-0000-000000000004'),
  ('aa11ee05-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000003', 'private', 'staff/teacher-a-forged-verify.pdf', 'x.pdf',
   'application/pdf', 1024, 'aaaaaaaa-0000-0000-0000-000000000003'),
  ('aa11ee06-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000003', 'private', 'staff/teacher-a-forged-upload.pdf', 'x.pdf',
   'application/pdf', 1024, 'aaaaaaaa-0000-0000-0000-000000000003');

insert into public.staff_documents (id, workspace_id, staff_record_id, kind, file_id, uploaded_by)
values
  ('dd11ee09-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222',
   'ee000009-0000-0000-0000-000000000009', 'other', 'ff11ee09-0000-0000-0000-000000000009',
   'bbbbbbbb-0000-0000-0000-000000000001');

-- =====================================================================
-- 1. Tenant isolation (AC 29) — an admin of School A sees zero School B
--    rows on all three tables.
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.staff_records where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'School A admin reads zero School B staff_records rows');

select is(
  (select count(*)::int from public.staff_compensation where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'School A admin reads zero School B staff_compensation rows');

select is(
  (select count(*)::int from public.staff_documents where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'School A admin reads zero School B staff_documents rows');

select is(
  (select count(*)::int from public.staff_records where workspace_id = '11111111-1111-1111-1111-111111111111'),
  3, 'School A admin reads every School A staff_records row');

select tests.logout();

-- =====================================================================
-- 2. Escalation — a teacher reads their own record and their own rate,
--    never a colleague's, by any query path (AC 10, Part 1 demo).
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from public.staff_records),
  1, 'a teacher sees exactly one staff_records row via direct select');

select is(
  (select user_id from public.staff_records limit 1),
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
  '...and it is their own');

select is(
  (select count(*)::int from public.staff_compensation),
  1, 'a teacher sees exactly one staff_compensation row — their own');

select is(
  (select hourly_rate_paisa from public.staff_compensation limit 1),
  35000::bigint, '...at their own rate');

-- Direct-table attempt at a colleague's compensation via an explicit join —
-- "by any available query path" (§10 Tests) means this must also return
-- nothing, not merely the unqualified `select *` above.
select is(
  (select count(*)::int from public.staff_compensation c
     join public.staff_records sr on sr.id = c.staff_record_id
    where sr.user_id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  0, 'a teacher cannot reach a colleague''s compensation row through a join either');

select is(
  (select count(*)::int from public.staff_records where user_id = 'aaaaaaaa-0000-0000-0000-000000000004'),
  0, 'a teacher cannot read a colleague''s staff_records row at all');

-- app.staff_hourly_rate: own rate is visible via the RPC too.
select is(
  app.staff_hourly_rate('11111111-1111-1111-1111-111111111111',
                         'aaaaaaaa-0000-0000-0000-000000000003', '2025-06-01'),
  35000::bigint, 'app.staff_hourly_rate returns the caller''s own rate');

-- a colleague's rate is never returned, even through the RPC.
select is(
  app.staff_hourly_rate('11111111-1111-1111-1111-111111111111',
                         'aaaaaaaa-0000-0000-0000-000000000004', '2025-06-01'),
  null, 'app.staff_hourly_rate never returns a colleague''s rate to a teacher');

-- a teacher cannot set compensation (write escalation, AC 11 in spirit —
-- INSERT fails WITH CHECK, raising 42501).
select throws_ok(
  $$insert into public.staff_compensation (workspace_id, staff_record_id, hourly_rate_paisa, effective_from)
    values ('11111111-1111-1111-1111-111111111111', 'ee000003-0000-0000-0000-000000000003', 99999, '2026-01-01')$$,
  '42501', null,
  'a teacher cannot insert a staff_compensation row');

-- AC 11 also holds for a 'staff' role, not only 'teacher' (lead review, PR #32).
select tests.login('aaaaaaaa-0000-0000-0000-000000000008');
select throws_ok(
  $$insert into public.staff_compensation (workspace_id, staff_record_id, hourly_rate_paisa, effective_from)
    values ('11111111-1111-1111-1111-111111111111', 'ee000008-0000-0000-0000-000000000008', 99999, '2026-01-01')$$,
  '42501', null,
  'a staff member cannot insert a staff_compensation row either');
select tests.login('aaaaaaaa-0000-0000-0000-000000000003');

-- a teacher CAN edit their own contact/emergency fields (AC 3).
select lives_ok(
  $$update public.staff_records
       set personal_phone = '+8801711111111', emergency_contact = '{"name":"Ma","relation":"mother","phone":"+8801700000000"}'::jsonb
     where id = 'ee000003-0000-0000-0000-000000000003'$$,
  'a teacher can update their own contact and emergency fields');

-- a teacher CANNOT edit their own employment fields (AC 3, §2 footnote 1).
select throws_ok(
  $$update public.staff_records set employment_type = 'part_time'
     where id = 'ee000003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a teacher patching employment_type on their own record is refused');

select throws_ok(
  $$update public.staff_records set employment_status = 'left'
     where id = 'ee000003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a teacher patching employment_status on their own record is refused');

select throws_ok(
  $$update public.staff_records set staff_code = 'HACKED-0001'
     where id = 'ee000003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a teacher cannot rewrite their own staff_code');

-- The allow-list guard denies every admin-only column individually, not
-- just the three above (lead review, PR #32).
-- The guard trigger (BEFORE UPDATE) fires before the FK constraint check,
-- so a well-formed but nonexistent uuid is enough to prove the column-level
-- rejection specifically — this must raise 42501, not a later 23503.
select throws_ok(
  $$update public.staff_records set designation_label_id = 'aaaa9999-0000-0000-0000-000000000099'
     where id = 'ee000003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a teacher cannot self-edit designation_label_id');

select throws_ok(
  $$update public.staff_records set joined_on = '2020-01-01'
     where id = 'ee000003-0000-0000-0000-000000000003'$$,
  '42501', null,
  'a teacher cannot self-edit joined_on');

-- a teacher cannot touch a colleague's record at all (RLS filters to zero rows).
with attempted as (
  update public.staff_records set personal_phone = '+8801799999999'
   where id = 'ee000004-0000-0000-0000-000000000004'
  returning 1)
select is((select count(*)::int from attempted), 0,
          'a teacher''s attempt to edit a colleague''s record affects zero rows');

-- staff_documents: a teacher may insert their own, never a colleague's
-- (the two backing `files` rows were created as postgres in the fixtures
-- above — a client never gets to choose whose name is on a file record).
select lives_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by)
    values ('11111111-1111-1111-1111-111111111111', 'ee000003-0000-0000-0000-000000000003',
            'nid', 'aa11ee03-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003')$$,
  'a teacher can upload their own staff document');

-- Security review, PR #32: a self-inserting teacher cannot fake admin
-- verification on their own upload.
select throws_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by, verified_by, verified_at)
    values ('11111111-1111-1111-1111-111111111111', 'ee000003-0000-0000-0000-000000000003',
            'nid', 'aa11ee05-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000003',
            'aaaaaaaa-0000-0000-0000-000000000003', now())$$,
  '42501', null,
  'a teacher cannot self-verify their own uploaded document');

-- ...nor attribute the upload to someone else (uploaded_by must be self).
select throws_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by)
    values ('11111111-1111-1111-1111-111111111111', 'ee000003-0000-0000-0000-000000000003',
            'nid', 'aa11ee06-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  '42501', null,
  'a teacher cannot attribute their own upload to someone else (uploaded_by spoofing)');

select throws_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by)
    values ('11111111-1111-1111-1111-111111111111', 'ee000004-0000-0000-0000-000000000004',
            'nid', 'aa11ee04-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000003')$$,
  '42501', null,
  'a teacher cannot upload a document onto a colleague''s staff record');

select is(
  (select count(*)::int from public.staff_documents where staff_record_id = 'ee000004-0000-0000-0000-000000000004'),
  0, 'and a colleague''s document row is invisible to this teacher (AC 14 in spirit)');

select ok(
  not app.can_open_staff_document('aa11ee04-0000-0000-0000-000000000004'),
  'app.can_open_staff_document refuses a colleague''s document file id');

select tests.logout();

-- =====================================================================
-- 3. Owner/admin visibility — the reverse of §2: an admin sees everything
--    in their own school, including compensation and documents.
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from public.staff_compensation
    where staff_record_id = 'ee000003-0000-0000-0000-000000000003'),
  1, 'an admin reads a teacher''s compensation row');

select ok(
  app.can_open_staff_document('aa11ee03-0000-0000-0000-000000000003'),
  'app.can_open_staff_document allows an admin to open any staff document in their workspace');

select lives_ok(
  $$update public.staff_records set employment_type = 'part_time'
     where id = 'ee000003-0000-0000-0000-000000000003'$$,
  'an admin CAN change an employment field on someone else''s record');

select tests.logout();

-- a parent cannot read the staff roster at all (mirrors 03_role_escalation.sql).
select tests.login('aaaaaaaa-0000-0000-0000-000000000005');
select is(
  (select count(*)::int from public.staff_records),
  0, 'a parent reads zero staff_records rows');
select is(
  (select count(*)::int from public.staff_directory),
  0, 'a parent reads zero staff_directory rows (not a non-parent role)');
select tests.logout();

-- =====================================================================
-- 4. staff_directory — the safe subset, visible to non-parent members,
--    never exposing compensation, NID or documents (AC 1, AC 16).
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000004');

select is(
  (select count(*)::int from public.staff_directory),
  3, 'a teacher reads every School A row through staff_directory');

select ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'staff_directory'
       and column_name in ('nid_number', 'personal_phone', 'address', 'emergency_contact', 'notes')),
  'staff_directory has no compensation-adjacent or private column at all');

select tests.logout();

-- =====================================================================
-- 5. app.staff_hourly_rate — point-in-time correctness (Part 1 demo):
--    a rate change is priced on its OWN date, never today's rate applied
--    retroactively (§5.8, AC 9, AC 12b).
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000002');

-- Second period starting 1 Oct 2025 — the BEFORE INSERT trigger must close
-- the January row's effective_to to 30 Sep 2025.
insert into public.staff_compensation (workspace_id, staff_record_id, hourly_rate_paisa, effective_from)
values ('11111111-1111-1111-1111-111111111111', 'ee000003-0000-0000-0000-000000000003', 40000, '2025-10-01');

select is(
  (select effective_to from public.staff_compensation
    where staff_record_id = 'ee000003-0000-0000-0000-000000000003' and hourly_rate_paisa = 35000),
  '2025-09-30'::date,
  'inserting a new period closes the prior one the day before it starts');

select is(
  app.staff_hourly_rate('11111111-1111-1111-1111-111111111111',
                         'aaaaaaaa-0000-0000-0000-000000000003', '2025-09-15'),
  35000::bigint, 'a cover on 15 Sep 2025 prices at the OLD rate (AC 9)');

select is(
  app.staff_hourly_rate('11111111-1111-1111-1111-111111111111',
                         'aaaaaaaa-0000-0000-0000-000000000003', '2025-10-15'),
  40000::bigint, 'a cover on 15 Oct 2025 prices at the NEW rate');

select is(
  app.staff_hourly_rate('11111111-1111-1111-1111-111111111111',
                         'aaaaaaaa-0000-0000-0000-000000000003', '2024-01-01'),
  null, 'a date before any compensation row exists returns null, not zero (AC 12)');

select is(
  app.staff_hourly_rate('11111111-1111-1111-1111-111111111111',
                         'aaaaaaaa-0000-0000-0000-000000000008', '2025-06-01'),
  null, 'a staff member with no compensation row at all returns null, not zero (AC 12)');

-- Cross-workspace: an admin of School A gets null for a School B user's
-- rate — app.staff_hourly_rate never leaks across the tenant boundary.
select is(
  app.staff_hourly_rate('11111111-1111-1111-1111-111111111111',
                         'bbbbbbbb-0000-0000-0000-000000000001', '2025-06-01'),
  null, 'app.staff_hourly_rate refuses a caller from a different workspace than the row it would read');

select tests.logout();

-- =====================================================================
-- 5a. AC-30 — a person staffed at two schools has two independent rates,
--     and p_workspace_id keeps app.staff_hourly_rate from ever mixing them
--     (lead review, PR #32: the 2-argument first draft picked "whichever
--     compensation row sorted first" across ALL of a person's workspaces).
--     Owner B (bbbbbbbb...001) already has a staff_records row in School B
--     (ee000009, no compensation yet); give them a second one in School A
--     too, with a DIFFERENT overlapping-date rate.
-- =====================================================================
insert into public.staff_records (id, workspace_id, user_id, staff_code, full_name, employment_status)
values ('ee00000a-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
        'bbbbbbbb-0000-0000-0000-000000000001', 'TCH-2026-000A', 'Owner B (also staff at A)', 'active');

insert into public.staff_compensation (workspace_id, staff_record_id, hourly_rate_paisa, effective_from)
values ('22222222-2222-2222-2222-222222222222', 'ee000009-0000-0000-0000-000000000009', 20000, '2025-01-01'),
       ('11111111-1111-1111-1111-111111111111', 'ee00000a-0000-0000-0000-00000000000a', 90000, '2025-01-01');

-- Logged in as Owner B themselves — self-checking, so both calls satisfy
-- app.staff_hourly_rate's authorization branch regardless of which
-- workspace's admin/owner they are for that specific call.
select tests.login('bbbbbbbb-0000-0000-0000-000000000001');

select is(
  app.staff_hourly_rate('22222222-2222-2222-2222-222222222222',
                         'bbbbbbbb-0000-0000-0000-000000000001', '2025-06-01'),
  20000::bigint, 'AC-30: School B''s rate for a person staffed at both schools');

select is(
  app.staff_hourly_rate('11111111-1111-1111-1111-111111111111',
                         'bbbbbbbb-0000-0000-0000-000000000001', '2025-06-01'),
  90000::bigint, 'AC-30: the SAME call with School A''s workspace_id returns School A''s own rate, not School B''s');

select tests.logout();

-- =====================================================================
-- 5b. Cross-school row forgery (BLOCKING, lead review PR #32): an
--     owner/admin of School B cannot insert a staff_compensation or
--     staff_documents row that claims workspace_id=B while pointing
--     staff_record_id at a record that actually belongs to School A — the
--     composite (workspace_id, staff_record_id) FK refuses it outright,
--     regardless of what RLS alone would have allowed (RLS only checked
--     each table's OWN workspace_id column, never that it agreed with the
--     referenced record's real workspace).
-- =====================================================================
insert into public.files
  (id, workspace_id, owner_id, bucket, path, original_name, mime_type, size_bytes, created_by)
values
  ('ff22ee03-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-0000-0000-000000000001', 'private', 'b/forged.pdf', 'forged.pdf',
   'application/pdf', 1024, 'bbbbbbbb-0000-0000-0000-000000000001');

select tests.login('bbbbbbbb-0000-0000-0000-000000000001');   -- owner of B

select throws_ok(
  $$insert into public.staff_compensation (workspace_id, staff_record_id, hourly_rate_paisa, effective_from)
    values ('22222222-2222-2222-2222-222222222222', 'ee000003-0000-0000-0000-000000000003', 1, '2030-01-01')$$,
  '23503', null,
  'School B''s owner cannot insert compensation claiming workspace_id=B against a School A staff_record');

select throws_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by)
    values ('22222222-2222-2222-2222-222222222222', 'ee000003-0000-0000-0000-000000000003',
            'other', 'ff22ee03-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001')$$,
  '23503', null,
  'School B''s owner cannot insert a document claiming workspace_id=B against a School A staff_record');

select tests.logout();

-- =====================================================================
-- 6. The exclusion constraint itself (AC 8) — a genuinely overlapping
--    insert. This range falls inside the FIRST period, which the closing
--    trigger already closed to 2025-09-30 above and therefore will not
--    touch again (it only ever closes a still-OPEN row) — so this can only
--    be caught by the exclusion constraint itself, not the trigger.
-- =====================================================================
select throws_ok(
  $$insert into public.staff_compensation (workspace_id, staff_record_id, hourly_rate_paisa, effective_from, effective_to)
    values ('11111111-1111-1111-1111-111111111111', 'ee000003-0000-0000-0000-000000000003', 50000, '2025-09-15', '2025-09-20')$$,
  '23P01', null,
  'an insert overlapping an already-closed historical period is refused by the exclusion constraint');

-- =====================================================================
-- 7. The membership <-> record status trigger (§5.2, W2) — a pending_join
--    record is linked and flipped active the moment membership goes active,
--    whether that membership is a fresh INSERT or an UPDATE — AND, crucially,
--    the invitee's OWN acceptance must not trip
--    app.tg_staff_records_self_update_guard() on their own record.
--
-- tests.simulate_accept() stands in for app.accept_invitation() (SECURITY
-- DEFINER, first-time INSERT branch) without needing a real invitation row:
-- what matters here is that it is SECURITY DEFINER too, so the INSERT it
-- issues bypasses workspace_members' own owner/admin-only INSERT policy
-- exactly as accept_invitation's does, while `role` stays 'authenticated'
-- throughout (is_privileged_context() is false the whole way down) — the
-- exact shape that needs the pg_trigger_depth() exception added above.
-- =====================================================================
create or replace function tests.simulate_accept(p_id uuid, p_workspace_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  insert into public.workspace_members (id, workspace_id, user_id, role, status, joined_at)
  values (p_id, p_workspace_id, p_user_id, 'teacher', 'active', now());
end;
$fn$;

select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000006', 'pending.a@test.local', 'Pending Hire');

insert into public.staff_records (id, workspace_id, user_id, staff_code, full_name, employment_status)
values ('ee000006-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000006', 'TCH-2026-0006', 'Pending Hire', 'pending_join');

-- Logged in AS THE INVITEE — not postgres — so this genuinely exercises the
-- self-caller path, not merely the already-privileged postgres role.
select tests.login('aaaaaaaa-0000-0000-0000-000000000006');

select lives_ok(
  $$select tests.simulate_accept('dddd0006-0000-0000-0000-000000000006',
      '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000006')$$,
  'the invitee''s own first-time acceptance does not trip the staff_records self-update guard');

select tests.logout();

select is(
  (select employment_status::text from public.staff_records where id = 'ee000006-0000-0000-0000-000000000006'),
  'active', 'a fresh active membership INSERT flips the matching pending_join record to active');

select is(
  (select membership_id from public.staff_records where id = 'ee000006-0000-0000-0000-000000000006'),
  'dddd0006-0000-0000-0000-000000000006'::uuid,
  '...and links membership_id');

select isnt(
  (select joined_on from public.staff_records where id = 'ee000006-0000-0000-0000-000000000006'),
  null, '...and sets joined_on');

-- An UPDATE-path transition (pending -> active) also links a pending_join
-- record.
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000007', 'pending2.a@test.local', 'Pending Hire 2');

insert into public.staff_records (id, workspace_id, user_id, staff_code, full_name, employment_status)
values ('ee000007-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000007', 'TCH-2026-0007', 'Pending Hire 2', 'pending_join');

insert into public.workspace_members (id, workspace_id, user_id, role, status)
values ('dddd0007-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000007', 'teacher', 'pending');

update public.workspace_members set status = 'active', joined_at = now()
 where id = 'dddd0007-0000-0000-0000-000000000007';

select is(
  (select employment_status::text from public.staff_records where id = 'ee000007-0000-0000-0000-000000000007'),
  'active', 'a pending -> active membership UPDATE also flips the matching record');

-- No matching pending_join record: the trigger is a no-op, never an error.
select lives_ok(
  $$insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000005', 'staff', 'active', now())
    on conflict (workspace_id, user_id) do update set status = 'active'$$,
  'an active membership with no matching pending_join staff record is a harmless no-op');

-- =====================================================================
-- 8. Table/policy/grant shape assertions.
-- =====================================================================
select has_table('public', 'staff_records', 'staff_records exists');
select has_table('public', 'staff_compensation', 'staff_compensation exists');
select has_table('public', 'staff_documents', 'staff_documents exists');

select ok(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'staff_records'),
  'staff_records has row level security enabled');
select ok(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'staff_compensation'),
  'staff_compensation has row level security enabled');
select ok(
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'staff_documents'),
  'staff_documents has row level security enabled');

select ok(
  not has_table_privilege('anon', 'public.staff_records', 'select'),
  'anon has no privileges on staff_records at all');
select ok(
  not has_table_privilege('anon', 'public.staff_compensation', 'select'),
  'anon has no privileges on staff_compensation at all');

select ok(
  not has_function_privilege('anon', 'app.staff_hourly_rate(uuid, uuid, date)', 'execute'),
  'anon cannot execute app.staff_hourly_rate');
select ok(
  has_function_privilege('authenticated', 'app.staff_hourly_rate(uuid, uuid, date)', 'execute'),
  'authenticated can execute app.staff_hourly_rate');
select ok(
  not has_function_privilege('anon', 'app.can_open_staff_document(uuid)', 'execute'),
  'anon cannot execute app.can_open_staff_document');

select * from finish();
rollback;
