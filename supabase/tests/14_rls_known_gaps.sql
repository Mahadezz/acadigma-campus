-- =====================================================================
-- pgTAP · isolation + escalation for the KNOWN_GAPS tables
-- (scripts/check-coverage-test-files.mjs, D-56): consent_records,
-- legal_acceptances, email_log, file_access_log, subscription_events,
-- notifications. This file's job is to shrink KNOWN_GAPS to empty.
--
-- The first five have RLS on, SELECT-only grants to `authenticated` (no
-- grant to `anon` at all) and no write policy anywhere — sections 1-5.
--
-- `notifications` (section 6) is shaped differently and gets its own
-- comment there: it is scoped to `recipient_id = auth.uid()` alone, with
-- NO owner/admin or platform-admin branch at all (stricter than the other
-- five, not weaker), and it DOES carry real UPDATE/DELETE grants to
-- `authenticated`, guarded by RLS (own row only) plus a BEFORE UPDATE
-- trigger that permits only `read_at`/`archived_at` to change.
--
-- Per table (sections 1-5) this proves:
--   (a) isolation — a member of workspace A sees zero rows of workspace B;
--       anon has no SELECT privilege at all; a teacher/staff member (not
--       owner/admin) sees only what the policy actually allows — which, for
--       three of these five tables, is nothing at all, even for a row about
--       their own action; the row's own user sees their own row where (and
--       only where) the policy has an own-row branch; platform admin sees
--       every workspace.
--   (b) escalation — authenticated INSERT/UPDATE/DELETE are all refused
--       with 42501. Unlike `custom_labels`/`workspace_members` elsewhere in
--       this suite, these five tables have no write GRANT to `authenticated`
--       at all (not even a policy-filtered one), so every write verb fails
--       at the privilege check before a policy is even consulted — the
--       "verb the role holds no GRANT for at all" case from the README.
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
-- fixtures: two schools (A, B), A has owner/admin/teacher/staff, B has an
-- owner, plus one platform-admin account that belongs to neither.
-- ---------------------------------------------------------------------
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000001', 'owner.a@test.local',   'Owner A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000002', 'admin.a@test.local',   'Admin A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000003', 'teacher.a@test.local', 'Teacher A');
select tests.mkuser('aaaaaaaa-0000-0000-0000-000000000004', 'staff.a@test.local',   'Staff A');
select tests.mkuser('bbbbbbbb-0000-0000-0000-000000000001', 'owner.b@test.local',   'Owner B');
select tests.mkuser('cccccccc-0000-0000-0000-000000000001', 'platform@test.local',  'Platform Staff');

update public.profiles set is_platform_admin = true
 where id = 'cccccccc-0000-0000-0000-000000000001';

insert into public.workspaces (id, type, name, slug, owner_id, created_by)
values ('11111111-1111-1111-1111-111111111111', 'school', 'School A', 'school-a',
        'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
       ('22222222-2222-2222-2222-222222222222', 'school', 'School B', 'school-b',
        'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
-- Each `school`-type insert above also fires app.tg_new_workspace_subscription
-- (20260917010300), which creates a `trialing` subscriptions row AND one
-- subscription_events row (type = 'trial_started') per workspace — exactly
-- the fixture the subscription_events section below needs, for free.

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'admin',   'active', now()),
       ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'teacher', 'active', now()),
       ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000004', 'staff',   'active', now());

-- =====================================================================
-- 1. consent_records — select: own consenting_user_id, OR has_role(owner,
--    admin), OR platform admin. No write grant at all (PDPA evidence).
-- =====================================================================
insert into public.consent_records
  (id, workspace_id, subject_type, consenting_user_id, purpose, text_version, text_sha256, channel)
overriding system value
values
  (900001, '11111111-1111-1111-1111-111111111111', 'student',
   'aaaaaaaa-0000-0000-0000-000000000003', 'student.enrolment_data', 'v1',
   sha256(convert_to('v1', 'UTF8')), 'web'),          -- consented by teacher.a themselves
  (900002, '11111111-1111-1111-1111-111111111111', 'student',
   'aaaaaaaa-0000-0000-0000-000000000002', 'student.enrolment_data', 'v1',
   sha256(convert_to('v1', 'UTF8')), 'web'),          -- consented by admin.a, same workspace
  (900003, '22222222-2222-2222-2222-222222222222', 'student',
   'bbbbbbbb-0000-0000-0000-000000000001', 'student.enrolment_data', 'v1',
   sha256(convert_to('v1', 'UTF8')), 'web');           -- workspace B

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');   -- teacher.a
select is(
  (select count(*)::int from public.consent_records where id = 900001),
  1, 'consent_records: teacher.a sees their OWN consent record');
select is(
  (select count(*)::int from public.consent_records where id = 900002),
  0, 'consent_records: teacher.a does not see admin.a''s consent record in the same workspace');
select is(
  (select count(*)::int from public.consent_records where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'consent_records: a member of A sees zero rows of workspace B');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select is(
  (select count(*)::int from public.consent_records where workspace_id = '11111111-1111-1111-1111-111111111111'),
  2, 'consent_records: owner.a (has_role) sees every consent record in their workspace');
select is(
  (select count(*)::int from public.consent_records where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'consent_records: owner.a cannot read workspace B''s consent records');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000002');   -- admin.a
select is(
  (select count(*)::int from public.consent_records where id = 900001),
  1, 'consent_records: admin.a (has_role) sees teacher.a''s consent record — not their own row');
select tests.logout();

select tests.login('cccccccc-0000-0000-0000-000000000001');   -- platform admin
select is(
  (select count(*)::int from public.consent_records where id in (900001, 900002, 900003)),
  3, 'consent_records: platform admin sees every workspace''s consent records');
select tests.logout();

select ok(
  not has_table_privilege('anon', 'public.consent_records', 'select'),
  'consent_records: anon has no SELECT privilege at all');

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a — even the owner cannot write
select throws_ok(
  $$insert into public.consent_records (workspace_id, subject_type, consenting_user_id, purpose, text_version, text_sha256, channel)
    values ('11111111-1111-1111-1111-111111111111', 'student',
            'aaaaaaaa-0000-0000-0000-000000000001', 'student.enrolment_data', 'v1',
            sha256(convert_to('v1', 'UTF8')), 'web')$$,
  '42501', null,
  'consent_records: authenticated has no INSERT grant at all, even for an owner');
select throws_ok(
  $$update public.consent_records set text_version = 'v2' where id = 900001$$,
  '42501', null,
  'consent_records: authenticated has no UPDATE grant at all');
select throws_ok(
  $$delete from public.consent_records where id = 900001$$,
  '42501', null,
  'consent_records: authenticated has no DELETE grant at all');
select tests.logout();

-- =====================================================================
-- 2. legal_acceptances — select: own user_id, OR has_role(owner, admin),
--    OR platform admin. No write grant at all.
-- =====================================================================
insert into public.legal_acceptances (id, workspace_id, user_id, document, version, text_sha256)
overriding system value
values
  (900001, null, 'aaaaaaaa-0000-0000-0000-000000000003', 'terms', 'v1',
   sha256(convert_to('terms-v1', 'UTF8'))),           -- teacher.a's own personal acceptance
  (900002, '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
   'dpa', 'v1', sha256(convert_to('dpa-v1', 'UTF8'))), -- owner.a accepted the DPA for workspace A
  (900003, '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001',
   'dpa', 'v1', sha256(convert_to('dpa-v1', 'UTF8'))); -- workspace B's DPA

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');   -- teacher.a
select is(
  (select count(*)::int from public.legal_acceptances where id = 900001),
  1, 'legal_acceptances: teacher.a sees their OWN personal acceptance');
select is(
  (select count(*)::int from public.legal_acceptances where id = 900002),
  0, 'legal_acceptances: teacher.a does not see owner.a''s workspace-level DPA acceptance');
select is(
  (select count(*)::int from public.legal_acceptances where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'legal_acceptances: a member of A sees zero rows of workspace B');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000002');   -- admin.a — not the acceptor, has_role only
select is(
  (select count(*)::int from public.legal_acceptances where id = 900002),
  1, 'legal_acceptances: admin.a (has_role) sees the workspace DPA acceptance — not their own row');
select is(
  (select count(*)::int from public.legal_acceptances where id = 900001),
  0, 'legal_acceptances: admin.a does not see teacher.a''s personal acceptance');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select is(
  (select count(*)::int from public.legal_acceptances where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'legal_acceptances: owner.a cannot read workspace B''s DPA acceptance');
select tests.logout();

select tests.login('cccccccc-0000-0000-0000-000000000001');   -- platform admin
select is(
  (select count(*)::int from public.legal_acceptances where id in (900001, 900002, 900003)),
  3, 'legal_acceptances: platform admin sees every acceptance, personal or workspace');
select tests.logout();

select ok(
  not has_table_privilege('anon', 'public.legal_acceptances', 'select'),
  'legal_acceptances: anon has no SELECT privilege at all');

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select throws_ok(
  $$insert into public.legal_acceptances (workspace_id, user_id, document, version, text_sha256)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
            'privacy', 'v1', sha256(convert_to('privacy-v1', 'UTF8')))$$,
  '42501', null,
  'legal_acceptances: authenticated has no INSERT grant at all, even for an owner');
select throws_ok(
  $$update public.legal_acceptances set version = 'v2' where id = 900002$$,
  '42501', null,
  'legal_acceptances: authenticated has no UPDATE grant at all');
select throws_ok(
  $$delete from public.legal_acceptances where id = 900002$$,
  '42501', null,
  'legal_acceptances: authenticated has no DELETE grant at all');
select tests.logout();

-- =====================================================================
-- 3. file_access_log — select: has_role(owner, admin) OR platform admin
--    ONLY. There is no own-row branch: the person whose download it was
--    cannot read the log of their own action. No write grant at all.
-- =====================================================================
insert into public.file_access_log (id, file_id, workspace_id, user_id, action)
overriding system value
values
  (900001, 'ffff1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0000-0000-0000-000000000003', 'download'),  -- teacher.a's own download
  (900002, 'ffff2222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-0000-0000-0000-000000000001', 'download');  -- workspace B

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');   -- teacher.a — the very subject of row 900001
select is(
  (select count(*)::int from public.file_access_log where id = 900001),
  0, 'file_access_log: the policy has no own-row branch — teacher.a cannot read even the log of their OWN download');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select is(
  (select count(*)::int from public.file_access_log where workspace_id = '11111111-1111-1111-1111-111111111111'),
  1, 'file_access_log: owner.a (has_role) can read workspace A''s access log');
select is(
  (select count(*)::int from public.file_access_log where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'file_access_log: a member of A sees zero rows of workspace B');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000002');   -- admin.a
select is(
  (select count(*)::int from public.file_access_log where id = 900001),
  1, 'file_access_log: admin.a (has_role) can also read it');
select tests.logout();

select tests.login('cccccccc-0000-0000-0000-000000000001');   -- platform admin
select is(
  (select count(*)::int from public.file_access_log where id in (900001, 900002)),
  2, 'file_access_log: platform admin sees every workspace''s access log');
select tests.logout();

select ok(
  not has_table_privilege('anon', 'public.file_access_log', 'select'),
  'file_access_log: anon has no SELECT privilege at all');

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select throws_ok(
  $$insert into public.file_access_log (file_id, workspace_id, user_id, action)
    values ('ffff1111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
            'aaaaaaaa-0000-0000-0000-000000000001', 'download')$$,
  '42501', null,
  'file_access_log: authenticated has no INSERT grant at all, even for an owner');
select throws_ok(
  $$update public.file_access_log set action = 'delete' where id = 900001$$,
  '42501', null,
  'file_access_log: authenticated has no UPDATE grant at all');
select throws_ok(
  $$delete from public.file_access_log where id = 900001$$,
  '42501', null,
  'file_access_log: authenticated has no DELETE grant at all');
select tests.logout();

-- =====================================================================
-- 4. email_log — select: has_role(owner, admin) OR platform admin ONLY.
--    There is no per-recipient own-row branch (a `to_email` is not tied to
--    any auth.uid()). No write grant at all — the adapter writes as
--    service_role.
-- =====================================================================
insert into public.email_log (id, workspace_id, to_email, from_email, subject, template, status)
overriding system value
values
  (900001, '11111111-1111-1111-1111-111111111111', 'parent.a@example.test',
   'no-reply@acadigma.test', 'Welcome to School A', 'welcome', 'sent'),
  (900002, '22222222-2222-2222-2222-222222222222', 'parent.b@example.test',
   'no-reply@acadigma.test', 'Welcome to School B', 'welcome', 'sent');

select tests.login('aaaaaaaa-0000-0000-0000-000000000004');   -- staff.a — non owner/admin member
select is(
  (select count(*)::int from public.email_log where id = 900001),
  0, 'email_log: staff.a (not owner/admin) sees nothing in their own workspace''s send log');
select is(
  (select count(*)::int from public.email_log where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'email_log: a member of A sees zero rows of workspace B');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select is(
  (select count(*)::int from public.email_log where id = 900001),
  1, 'email_log: owner.a (has_role) can read workspace A''s send log');
select is(
  (select count(*)::int from public.email_log where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'email_log: owner.a cannot read workspace B''s send log');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000002');   -- admin.a
select is(
  (select count(*)::int from public.email_log where id = 900001),
  1, 'email_log: admin.a (has_role) can also read it');
select tests.logout();

select tests.login('cccccccc-0000-0000-0000-000000000001');   -- platform admin
select is(
  (select count(*)::int from public.email_log where id in (900001, 900002)),
  2, 'email_log: platform admin sees every workspace''s send log');
select tests.logout();

select ok(
  not has_table_privilege('anon', 'public.email_log', 'select'),
  'email_log: anon has no SELECT privilege at all');

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select throws_ok(
  $$insert into public.email_log (workspace_id, to_email, from_email, subject, template)
    values ('11111111-1111-1111-1111-111111111111', 'injected@example.test',
            'no-reply@acadigma.test', 'Injected', 'welcome')$$,
  '42501', null,
  'email_log: authenticated has no INSERT grant at all, even for an owner');
select throws_ok(
  $$update public.email_log set status = 'bounced' where id = 900001$$,
  '42501', null,
  'email_log: authenticated has no UPDATE grant at all');
select throws_ok(
  $$delete from public.email_log where id = 900001$$,
  '42501', null,
  'email_log: authenticated has no DELETE grant at all');
select tests.logout();

-- =====================================================================
-- 5. subscription_events — select: has_role(owner, admin) OR platform
--    admin ONLY (tighter than usage_counters, which every member reads).
--    No write grant at all — rows come from the billing flow and the IPN
--    handler. Fixture rows are the 'trial_started' events the workspace
--    insert above already created — nothing more to seed.
-- =====================================================================
select tests.login('aaaaaaaa-0000-0000-0000-000000000003');   -- teacher.a
select is(
  (select count(*)::int from public.subscription_events
    where workspace_id = '11111111-1111-1111-1111-111111111111'),
  0, 'subscription_events: teacher.a (not owner/admin) cannot read their own school''s billing timeline');
select is(
  (select count(*)::int from public.subscription_events
    where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'subscription_events: a member of A sees zero rows of workspace B');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select is(
  (select count(*)::int from public.subscription_events
    where workspace_id = '11111111-1111-1111-1111-111111111111' and type = 'trial_started'),
  1, 'subscription_events: owner.a (has_role) reads workspace A''s trial_started event');
select is(
  (select count(*)::int from public.subscription_events
    where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'subscription_events: owner.a cannot read workspace B''s billing timeline');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000002');   -- admin.a
select is(
  (select count(*)::int from public.subscription_events
    where workspace_id = '11111111-1111-1111-1111-111111111111' and type = 'trial_started'),
  1, 'subscription_events: admin.a (has_role) can also read it');
select tests.logout();

select tests.login('cccccccc-0000-0000-0000-000000000001');   -- platform admin
select is(
  (select count(*)::int from public.subscription_events
    where workspace_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2, 'subscription_events: platform admin sees both schools'' billing timelines');
select tests.logout();

select ok(
  not has_table_privilege('anon', 'public.subscription_events', 'select'),
  'subscription_events: anon has no SELECT privilege at all');

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select throws_ok(
  format(
    $$insert into public.subscription_events (subscription_id, workspace_id, type, to_status)
      values (%L, '11111111-1111-1111-1111-111111111111', 'manual_test', 'active')$$,
    (select id from public.subscriptions where workspace_id = '11111111-1111-1111-1111-111111111111')),
  '42501', null,
  'subscription_events: authenticated has no INSERT grant at all, even for an owner');
select throws_ok(
  $$update public.subscription_events set type = 'tampered'
     where workspace_id = '11111111-1111-1111-1111-111111111111' and type = 'trial_started'$$,
  '42501', null,
  'subscription_events: authenticated has no UPDATE grant at all');
select throws_ok(
  $$delete from public.subscription_events
     where workspace_id = '11111111-1111-1111-1111-111111111111' and type = 'trial_started'$$,
  '42501', null,
  'subscription_events: authenticated has no DELETE grant at all');
select tests.logout();

-- =====================================================================
-- 6. notifications — select: recipient_id = auth.uid() ONLY. No
--    has_role(owner, admin) branch and no platform-admin branch at all —
--    stricter than sections 1-5, not weaker. UPDATE/DELETE ARE granted to
--    authenticated, but RLS scopes both to the recipient's own rows, and a
--    BEFORE UPDATE trigger (app.tg_notifications_guard) additionally
--    refuses to let even the recipient change anything but read_at/
--    archived_at. INSERT has no grant at all — rows come from app.notify()
--    (SECURITY DEFINER) only.
-- =====================================================================
insert into public.notifications
  (id, workspace_id, recipient_id, event_type, title, action_url)
overriding system value
values
  (900001, '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
   'attendance.low', 'Attendance below threshold', '/app/attendance'),   -- owner.a's own notification
  (900002, '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003',
   'attendance.low', 'Attendance below threshold', '/app/attendance'),  -- teacher.a's own notification
  (900003, '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001',
   'attendance.low', 'Attendance below threshold', '/app/attendance');  -- workspace B

select tests.login('aaaaaaaa-0000-0000-0000-000000000003');   -- teacher.a
select is(
  (select count(*)::int from public.notifications where id = 900002),
  1, 'notifications: teacher.a sees their OWN notification');
select is(
  (select count(*)::int from public.notifications where id = 900001),
  0, 'notifications: teacher.a does NOT see owner.a''s notification — same workspace, no has_role branch here');
select is(
  (select count(*)::int from public.notifications where workspace_id = '22222222-2222-2222-2222-222222222222'),
  0, 'notifications: a member of A sees zero rows of workspace B');
select tests.logout();

select tests.login('aaaaaaaa-0000-0000-0000-000000000002');   -- admin.a
select is(
  (select count(*)::int from public.notifications where id in (900001, 900002)),
  0, 'notifications: admin.a sees NEITHER — unlike sections 1-5, there is no owner/admin bypass on this table');
select tests.logout();

select tests.login('cccccccc-0000-0000-0000-000000000001');   -- platform admin
select is(
  (select count(*)::int from public.notifications where id = 900001),
  0, 'notifications: platform admin does NOT see it either — no platform-admin bypass on this table at all');
select tests.logout();

select ok(
  not has_table_privilege('anon', 'public.notifications', 'select'),
  'notifications: anon has no SELECT privilege at all');

select tests.login('aaaaaaaa-0000-0000-0000-000000000001');   -- owner.a
select throws_ok(
  $$insert into public.notifications (workspace_id, recipient_id, event_type, title, action_url)
    values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
            'attendance.low', 'Injected', '/app')$$,
  '42501', null,
  'notifications: authenticated has no INSERT grant at all, even for an owner');

-- owner.a holds a general UPDATE grant, but RLS scopes it to their own rows:
-- an update aimed at teacher.a's notification (900002) is filtered to zero
-- rows, not an error (README rule 1 — a USING-filtered UPDATE affects
-- nothing rather than raising).
with attempted as (
  update public.notifications set read_at = now()
   where id = 900002
  returning 1)
select is((select count(*)::int from attempted), 0,
          'notifications: owner.a updating teacher.a''s notification affects ZERO rows...');
select tests.logout();

select is(
  (select read_at from public.notifications where id = 900002),
  null, '...and it is still unread — untouched by the attempt');

-- teacher.a holds UPDATE on their OWN row (900002), but the guard trigger
-- refuses any column beyond read_at/archived_at, even for the recipient.
select tests.login('aaaaaaaa-0000-0000-0000-000000000003');   -- teacher.a
select throws_ok(
  $$update public.notifications set title = 'Hijacked title' where id = 900002$$,
  '42501', null,
  'notifications: even the recipient cannot rewrite title/body/event_type/workspace_id on their own row');

select lives_ok(
  $$update public.notifications set read_at = now() where id = 900002$$,
  'notifications: the recipient CAN mark their own notification read — the legitimate self-service path still works');

-- teacher.a also holds a general DELETE grant, scoped by RLS the same way:
-- deleting owner.a's notification (900001) is filtered to zero rows.
with attempted as (
  delete from public.notifications
   where id = 900001
  returning 1)
select is((select count(*)::int from attempted), 0,
          'notifications: teacher.a deleting owner.a''s notification affects ZERO rows...');
select tests.logout();

select is(
  (select count(*)::int from public.notifications where id = 900001),
  1, '...and owner.a''s notification still exists, untouched');

select * from finish();
rollback;
