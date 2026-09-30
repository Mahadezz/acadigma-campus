-- =====================================================================
-- pgTAP · legal acceptance and guardian consent
--         (20260930041659_legal_acceptance_and_consent.sql, D-114)
--
--   A. Sign-up: the versions in the new user's metadata become Terms and
--      Privacy rows with the published hash; no metadata, no rows; an
--      unpublished version fails the sign-up.
--   B. School creation: the owner's DPA row lands with the school, once
--      (a replay adds none); an unpublished or missing version creates
--      nothing.
--   C. Parent link: one consent_records row per invitation and person, with
--      the hash of the locale shown; an unpublished version or locale
--      creates no link.
--   D. Isolation and escalation: each row is visible to its own person and
--      the school's owner, never to another school or another person; no
--      client role reaches app.legal_documents or the hash lookup; the
--      published texts cannot be edited.
-- =====================================================================
begin;
select plan(30);

create schema if not exists tests;
grant usage on schema tests to authenticated;

create or replace function tests.mkuser(p_id uuid, p_email text, p_meta jsonb)
returns uuid language plpgsql as $fn$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    lower(p_email), '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, p_meta, now(), now());
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
  perform set_config('app.correlation_id', '', true);
end;
$fn$;

create or replace function tests.school_input(p_key uuid)
returns jsonb language sql as $fn$
  select jsonb_build_object(
    'name', 'Consent School',
    'board', 'dhaka',
    'medium', 'bangla',
    'timezone', 'Asia/Dhaka',
    'working_days', jsonb_build_array(6, 7, 1, 2, 3, 4),
    'academic_year', jsonb_build_object('name', '2026', 'starts_on', '2026-01-01', 'ends_on', '2026-12-31'),
    'grade_levels', jsonb_build_array(
      jsonb_build_object('name', 'Class 6', 'name_bn', 'ষষ্ঠ শ্রেণি', 'level_number', 6, 'stage', 'secondary')),
    'idempotency_key', p_key)
$fn$;

grant execute on all functions in schema tests to authenticated;

create temp table vals (label text primary key, v text);
grant all on vals to authenticated;

-- =====================================================================
-- A. Sign-up
-- =====================================================================
select tests.mkuser('39f00000-0000-4000-a000-000000000001', 'lc-signup@test.local',
  '{"full_name":"Signed Up","legal":{"terms":"2026-09-30-interim","privacy":"2026-09-30-interim"}}');
select tests.mkuser('39f00000-0000-4000-a000-000000000002', 'lc-nolegal@test.local',
  '{"full_name":"No Legal"}');

select results_eq(
  $$select document, version, workspace_id, locale from public.legal_acceptances
     where user_id = '39f00000-0000-4000-a000-000000000001' order by document$$,
  $$values ('privacy', '2026-09-30-interim', null::uuid, 'en'),
           ('terms',   '2026-09-30-interim', null::uuid, 'en')$$,
  'A1 sign-up with legal metadata records Terms and Privacy, personal (no workspace)');

select is(
  (select a.text_sha256 from public.legal_acceptances a
    where a.user_id = '39f00000-0000-4000-a000-000000000001' and a.document = 'terms'),
  (select d.text_sha256 from app.legal_documents d
    where d.document = 'terms' and d.version = '2026-09-30-interim' and d.locale = 'en'),
  'A2 the recorded hash is the published text''s hash');

select is(
  (select count(*)::int from public.legal_acceptances
    where user_id = '39f00000-0000-4000-a000-000000000002'),
  0, 'A3 a sign-up without legal metadata records nothing');

select throws_ok(
  $$select tests.mkuser('39f00000-0000-4000-a000-000000000009', 'lc-bogus@test.local',
      '{"full_name":"Bogus","legal":{"terms":"2099-01-01"}}')$$,
  '22023', 'LEGAL_DOCUMENT_UNKNOWN',
  'A4 an unpublished Terms version fails the sign-up');

select is(
  (select count(*)::int from auth.users where id = '39f00000-0000-4000-a000-000000000009'),
  0, 'A5 ... and no user is created');

-- =====================================================================
-- B. School creation: the DPA
-- =====================================================================
select tests.mkuser('39f00000-0000-4000-a000-000000000003', 'lc-owner@test.local', '{"full_name":"Owner O"}');

select tests.login('39f00000-0000-4000-a000-000000000003');
insert into vals select 'ws', public.create_school_workspace(
  tests.school_input('39f00000-0000-4000-8000-000000000001'), '2026-09-30-interim') ->> 'workspace_id';
select tests.logout();

select results_eq(
  $$select workspace_id, document, version from public.legal_acceptances
     where user_id = '39f00000-0000-4000-a000-000000000003'$$,
  $$select v::uuid, 'dpa', '2026-09-30-interim' from vals where label = 'ws'$$,
  'B1 creating a school records the owner''s DPA acceptance for that school');

select tests.login('39f00000-0000-4000-a000-000000000003');
select is(
  public.create_school_workspace(
    tests.school_input('39f00000-0000-4000-8000-000000000001'), '2026-09-30-interim') ->> 'replayed',
  'true', 'B2 a replay of the same request returns the same school');
select tests.logout();

select is(
  (select count(*)::int from public.legal_acceptances
    where user_id = '39f00000-0000-4000-a000-000000000003' and document = 'dpa'),
  1, 'B3 ... and records no second DPA row');

select tests.login('39f00000-0000-4000-a000-000000000003');
select throws_ok(
  $$select public.create_school_workspace(
      tests.school_input('39f00000-0000-4000-8000-000000000002'), '2099-01-01')$$,
  '22023', 'LEGAL_DOCUMENT_UNKNOWN', 'B4 an unpublished DPA version is refused');
select throws_ok(
  $$select public.create_school_workspace(
      tests.school_input('39f00000-0000-4000-8000-000000000003'), null)$$,
  '22023', 'LEGAL_DOCUMENT_UNKNOWN', 'B5 a missing DPA version is refused');
select tests.logout();

select is(
  (select count(*)::int from public.workspaces
    where owner_id = '39f00000-0000-4000-a000-000000000003' and type = 'school'),
  1, 'B6 ... and neither refused call created a school');

select ok(
  not has_function_privilege('anon', 'public.create_school_workspace(jsonb, text)', 'execute')
  and has_function_privilege('authenticated', 'public.create_school_workspace(jsonb, text)', 'execute'),
  'B7 the DPA overload is for signed-in callers only');

-- =====================================================================
-- C. Parent link: the guardian's consent
-- =====================================================================
select tests.mkuser('39f00000-0000-4000-a000-000000000004', 'lc-parent@test.local', '{"full_name":"Parent P"}');

insert into public.students (id, workspace_id, student_code, first_name, last_name, gender)
select '39f00000-0000-4000-c000-000000000001', v::uuid, 'C1', 'Chaya', 'One', 'female'
  from vals where label = 'ws';
insert into public.students (id, workspace_id, student_code, first_name, last_name, gender)
select '39f00000-0000-4000-c000-000000000002', v::uuid, 'C2', 'Chandan', 'Two', 'male'
  from vals where label = 'ws';
insert into public.guardians (id, workspace_id, student_id, relation, full_name, phone, is_primary)
select '39f00000-0000-4000-d000-000000000001', v::uuid, '39f00000-0000-4000-c000-000000000001',
       'mother', 'Guardian C1', '+8801700039101', true from vals where label = 'ws';
insert into public.guardians (id, workspace_id, student_id, relation, full_name, phone, is_primary)
select '39f00000-0000-4000-d000-000000000002', v::uuid, '39f00000-0000-4000-c000-000000000002',
       'father', 'Guardian C2', '+8801700039102', true from vals where label = 'ws';

select tests.login('39f00000-0000-4000-a000-000000000003');
insert into vals select 'tok1', public.invite_guardian(
  (select v::uuid from vals where label = 'ws'), '39f00000-0000-4000-d000-000000000001') ->> 'token';
insert into vals select 'tok2', public.invite_guardian(
  (select v::uuid from vals where label = 'ws'), '39f00000-0000-4000-d000-000000000002') ->> 'token';
select tests.logout();

select tests.login('39f00000-0000-4000-a000-000000000004');
select is(
  public.accept_guardian_invitation((select v from vals where label = 'tok1'), '2026-09-30', 'bn')
    ->> 'student_id',
  '39f00000-0000-4000-c000-000000000001', 'C1 the parent accepts the link with consent');
select tests.logout();

select results_eq(
  $$select c.subject_type, c.subject_id, c.guardian_id, c.purpose, c.text_version, c.channel,
           c.locale, c.workspace_id
      from public.consent_records c
     where c.consenting_user_id = '39f00000-0000-4000-a000-000000000004'$$,
  $$select 'student', '39f00000-0000-4000-c000-000000000001'::uuid,
           '39f00000-0000-4000-d000-000000000001'::uuid, 'guardian.portal_access',
           '2026-09-30', 'web', 'bn', v::uuid from vals where label = 'ws'$$,
  'C2 one consent row: the child, the guardian, the purpose, the version and the language shown');

select is(
  (select c.text_sha256 from public.consent_records c
    where c.consenting_user_id = '39f00000-0000-4000-a000-000000000004'),
  (select d.text_sha256 from app.legal_documents d
    where d.document = 'guardian_consent' and d.version = '2026-09-30' and d.locale = 'bn'),
  'C3 the consent row carries the hash of the Bengali text');

select is(
  (select c.invitation_id from public.consent_records c
    where c.consenting_user_id = '39f00000-0000-4000-a000-000000000004'),
  (select i.id from public.workspace_invitations i
    where i.guardian_id = '39f00000-0000-4000-d000-000000000001' and i.status = 'accepted'),
  'C4 the consent row names the invitation it came with');

select tests.login('39f00000-0000-4000-a000-000000000004');
select lives_ok(
  $$select public.accept_guardian_invitation((select v from vals where label = 'tok1'), '2026-09-30', 'bn')$$,
  'C5 a double tap is not an error');
select tests.logout();

select is(
  (select count(*)::int from public.consent_records
    where consenting_user_id = '39f00000-0000-4000-a000-000000000004'),
  1, 'C6 ... and records consent once');

select tests.login('39f00000-0000-4000-a000-000000000004');
select throws_ok(
  $$select public.accept_guardian_invitation((select v from vals where label = 'tok2'), '2099-01-01', 'en')$$,
  '22023', 'LEGAL_DOCUMENT_UNKNOWN', 'C7 an unpublished consent version is refused');
select throws_ok(
  $$select public.accept_guardian_invitation((select v from vals where label = 'tok2'), '2026-09-30', 'fr')$$,
  '22023', 'LEGAL_DOCUMENT_UNKNOWN', 'C8 an unpublished language is refused');
select tests.logout();

select is(
  (select count(*)::int from public.guardian_users
    where user_id = '39f00000-0000-4000-a000-000000000004'
      and student_id = '39f00000-0000-4000-c000-000000000002'),
  0, 'C9 ... and neither refused call linked the second child');

-- =====================================================================
-- D. Isolation and escalation
-- =====================================================================
select tests.login('39f00000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.consent_records), 1,
  'D1 the parent sees their own consent row');
select is((select count(*)::int from public.legal_acceptances
            where user_id = '39f00000-0000-4000-a000-000000000003'), 0,
  'D2 the parent does not see the owner''s DPA acceptance');
select tests.logout();

select tests.login('39f00000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.consent_records
            where workspace_id = (select v::uuid from vals where label = 'ws')), 1,
  'D3 the school owner sees the consent recorded for their school');
select tests.logout();

select tests.login('39f00000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.consent_records), 0,
  'D4 a person outside the school sees no consent row');
select is((select count(*)::int from public.legal_acceptances), 2,
  'D5 ... and only their own two acceptances');
select tests.logout();

select ok(
  not has_table_privilege('authenticated', 'app.legal_documents', 'select')
  and not has_table_privilege('authenticated', 'app.legal_documents', 'insert')
  and not has_table_privilege('anon', 'app.legal_documents', 'select')
  and not has_table_privilege('service_role', 'app.legal_documents', 'insert'),
  'D6 no client role reads or writes the published-text registry');

select ok(
  not has_function_privilege('authenticated', 'app.legal_document_sha256(text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'app.tg_record_signup_legal()', 'execute'),
  'D7 no client role calls the hash lookup or the sign-up trigger function');

select ok(
  not has_function_privilege('anon', 'public.accept_guardian_invitation(text, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.accept_guardian_invitation(text, text, text)', 'execute'),
  'D8 the consent overload is for signed-in callers only');

select throws_ok(
  $$update app.legal_documents set text_sha256 = sha256('x') where document = 'terms'$$,
  '42501', 'legal_documents is append-only: UPDATE is not permitted',
  'D9 a published text''s hash cannot be changed');

select * from finish();
rollback;
