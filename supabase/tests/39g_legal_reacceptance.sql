-- =====================================================================
-- pgTAP · re-acceptance of the current legal documents (D-115)
--         (20260930113432_legal_reacceptance.sql)
--
--   A. A person records their own Terms/Privacy (no workspace), with the
--      published hash; twice records once; an unpublished version or an
--      unknown document records nothing.
--   B. The DPA: the school's active owner records it for that school.
--   C. Isolation and escalation: an admin, a teacher, an owner of another
--      school, the owner of a personal workspace and anon cannot record a
--      DPA; Terms/Privacy cannot be recorded against a school; the rows
--      still show only to their own person and the school's owner.
-- =====================================================================
begin;
select plan(17);

create schema if not exists tests;
grant usage on schema tests to authenticated;

create or replace function tests.mkuser(p_id uuid, p_email text)
returns uuid language plpgsql as $fn$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    lower(p_email), '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Re Accept"}'::jsonb, now(), now());
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

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------
-- Fixture (as postgres): school A (owner O, admin AD, teacher T),
-- school B (owner OB). Users signed up without legal metadata, as every
-- account before D-114 did, so none holds a Terms/Privacy row.
-- ---------------------------------------------------------------------
select tests.mkuser('39900000-0000-4000-a000-000000000001', 'ra-owner@test.local');
select tests.mkuser('39900000-0000-4000-a000-000000000002', 'ra-admin@test.local');
select tests.mkuser('39900000-0000-4000-a000-000000000003', 'ra-teacher@test.local');
select tests.mkuser('39900000-0000-4000-a000-000000000004', 'ra-ownerb@test.local');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('39900000-0000-4000-b000-000000000001', 'school', 'Reaccept School', 'reaccept-school-39g',
   '39900000-0000-4000-a000-000000000001', '39900000-0000-4000-a000-000000000001', 'active'),
  ('39900000-0000-4000-b000-000000000002', 'school', 'Other School', 'other-school-39g',
   '39900000-0000-4000-a000-000000000004', '39900000-0000-4000-a000-000000000004', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('39900000-0000-4000-b000-000000000001', '39900000-0000-4000-a000-000000000002', 'admin', 'active', now()),
  ('39900000-0000-4000-b000-000000000001', '39900000-0000-4000-a000-000000000003', 'teacher', 'active', now());

-- =====================================================================
-- A. Terms and Privacy, for oneself
-- =====================================================================
select tests.login('39900000-0000-4000-a000-000000000003');
select lives_ok(
  $$select public.accept_legal_document('terms', '2026-09-30-interim');
    select public.accept_legal_document('privacy', '2026-09-30-interim-2');
    select public.accept_legal_document('terms', '2026-09-30-interim')$$,
  'A1 a signed-in person accepts the current Terms and Privacy (twice is fine)');
select tests.logout();

select results_eq(
  $$select document, version, workspace_id from public.legal_acceptances
     where user_id = '39900000-0000-4000-a000-000000000003' order by document$$,
  $$values ('privacy', '2026-09-30-interim-2', null::uuid),
           ('terms',   '2026-09-30-interim',   null::uuid)$$,
  'A2 one personal row per document, the second Terms acceptance recorded once');

select is(
  (select a.text_sha256 from public.legal_acceptances a
    where a.user_id = '39900000-0000-4000-a000-000000000003' and a.document = 'privacy'),
  (select d.text_sha256 from app.legal_documents d
    where d.document = 'privacy' and d.version = '2026-09-30-interim-2' and d.locale = 'en'),
  'A3 the recorded hash is the published text''s hash');

select tests.login('39900000-0000-4000-a000-000000000003');
select throws_ok(
  $$select public.accept_legal_document('terms', '2099-01-01')$$,
  '22023', 'LEGAL_DOCUMENT_UNKNOWN',
  'A4 an unpublished version is refused');
select throws_ok(
  $$select public.accept_legal_document('guardian_consent', '2026-09-30-2')$$,
  '22023', 'LEGAL_DOCUMENT_UNKNOWN',
  'A5 a document that is not a legal acceptance is refused');
select tests.logout();

select is(
  (select count(*)::int from public.audit_events
    where action = 'legal.accepted'
      and subject_user_id = '39900000-0000-4000-a000-000000000003'),
  2, 'A6 each recorded acceptance writes one legal.accepted audit event');

-- =====================================================================
-- B. The DPA, by the school's owner
-- =====================================================================
select tests.login('39900000-0000-4000-a000-000000000001');
select lives_ok(
  $$select public.accept_legal_document('dpa', '2026-09-30-interim',
      '39900000-0000-4000-b000-000000000001')$$,
  'B1 the owner accepts the current DPA for their school');
select tests.logout();

select results_eq(
  $$select workspace_id, user_id, document from public.legal_acceptances
     where workspace_id = '39900000-0000-4000-b000-000000000001'$$,
  $$values ('39900000-0000-4000-b000-000000000001'::uuid,
            '39900000-0000-4000-a000-000000000001'::uuid, 'dpa')$$,
  'B2 the DPA row names the school and the owner');

-- =====================================================================
-- C. Isolation and escalation
-- =====================================================================
select tests.login('39900000-0000-4000-a000-000000000002');
select throws_ok(
  $$select public.accept_legal_document('dpa', '2026-09-30-interim',
      '39900000-0000-4000-b000-000000000001')$$,
  '42501', 'FORBIDDEN', 'C1 an admin cannot accept the DPA for the school');
select tests.logout();

select tests.login('39900000-0000-4000-a000-000000000003');
select throws_ok(
  $$select public.accept_legal_document('dpa', '2026-09-30-interim',
      '39900000-0000-4000-b000-000000000001')$$,
  '42501', 'FORBIDDEN', 'C2 a teacher cannot accept the DPA for the school');
select tests.logout();

select tests.login('39900000-0000-4000-a000-000000000004');
select throws_ok(
  $$select public.accept_legal_document('dpa', '2026-09-30-interim',
      '39900000-0000-4000-b000-000000000001')$$,
  '42501', 'FORBIDDEN', 'C3 the owner of another school cannot accept this school''s DPA');
select throws_ok(
  $$select public.accept_legal_document('dpa', '2026-09-30-interim',
      (select w.id from public.workspaces w
        where w.created_by = '39900000-0000-4000-a000-000000000004' and w.type = 'personal'))$$,
  '42501', 'FORBIDDEN', 'C4 a personal workspace has no DPA, even for its owner');
select throws_ok(
  $$select public.accept_legal_document('dpa', '2026-09-30-interim')$$,
  '42501', 'FORBIDDEN', 'C5 a DPA without a school is refused');
select throws_ok(
  $$select public.accept_legal_document('terms', '2026-09-30-interim',
      '39900000-0000-4000-b000-000000000002')$$,
  '22023', 'INVALID_INPUT', 'C6 Terms cannot be recorded against a school');
select is(
  (select count(*)::int from public.legal_acceptances
    where workspace_id = '39900000-0000-4000-b000-000000000001'
       or user_id = '39900000-0000-4000-a000-000000000003'),
  0, 'C7 another school''s owner sees neither school A''s DPA nor a stranger''s Terms');
select tests.logout();

select is(
  (select count(*)::int from public.legal_acceptances
    where workspace_id = '39900000-0000-4000-b000-000000000002'
       or user_id in ('39900000-0000-4000-a000-000000000002',
                      '39900000-0000-4000-a000-000000000004')),
  0, 'C8 none of the refused calls recorded anything');

select is(
  has_function_privilege('anon', 'public.accept_legal_document(text, text, uuid)', 'execute'),
  false, 'C9 anon cannot call accept_legal_document');

select * from finish();
rollback;
