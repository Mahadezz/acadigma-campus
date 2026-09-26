-- =====================================================================
-- pgTAP · Security audit Part 1 (D-75) — identity columns and file refs
--
--   A. profiles.email / profiles.phone are copied from auth.users by
--      app.handle_new_user and are the identity app.current_email() and
--      app.accept_invitation trust. A signed-in user could PATCH their own
--      profile to someone else's email and (1) read that person's pending
--      invitations through workspace_invitations_select, (2) squat the
--      address so the real person can never sign up (profiles_email_key
--      makes handle_new_user fail). Only a privileged (server) context may
--      change them now.
--   B. staff_documents.file_id was a plain FK on files(id): a teacher's
--      self-upload could name any file id — a colleague's NID scan, or
--      another school's file — and app.can_open_staff_document (the
--      /api/files guard) would then approve it for them. The file must now
--      be in the same school (composite FK), and on the self path it must
--      be the uploader's own file.
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
  perform set_config('app.correlation_id', '', true);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner OA, teachers T1 and T2 (each with
-- a staff record and an own private file). School B: owner OB and a file.
-- X is a signed-in user with no school. A pending teacher invitation in A
-- is addressed to victim@sa23.local, who has not signed up.
-- ---------------------------------------------------------------------
select tests.mkuser('23000000-0000-4000-a000-000000000001', 'oa@sa23.local', 'Owner A');
select tests.mkuser('23000000-0000-4000-a000-000000000002', 't1@sa23.local', 'Teacher 1');
select tests.mkuser('23000000-0000-4000-a000-000000000003', 't2@sa23.local', 'Teacher 2');
select tests.mkuser('23000000-0000-4000-a000-000000000004', 'ob@sa23.local', 'Owner B');
select tests.mkuser('23000000-0000-4000-a000-000000000005', 'x@sa23.local', 'Stranger X');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('23000000-0000-4000-b000-000000000001', 'school', 'Audit School A', 'audit-school-a-23',
   '23000000-0000-4000-a000-000000000001', '23000000-0000-4000-a000-000000000001', 'active'),
  ('23000000-0000-4000-b000-000000000002', 'school', 'Audit School B', 'audit-school-b-23',
   '23000000-0000-4000-a000-000000000004', '23000000-0000-4000-a000-000000000004', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('23000000-0000-4000-b000-000000000001', '23000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('23000000-0000-4000-b000-000000000001', '23000000-0000-4000-a000-000000000003', 'teacher', 'active', now());

insert into public.workspace_invitations
  (workspace_id, channel, email, role, token_hash, token_prefix, invited_by, expires_at)
values
  ('23000000-0000-4000-b000-000000000001', 'email', 'victim@sa23.local', 'teacher',
   app.hash_token('sa23-token'), 'sa23-tok', '23000000-0000-4000-a000-000000000001',
   now() + interval '7 days');

insert into public.staff_records (id, workspace_id, user_id, staff_code, full_name, employment_status)
values
  ('23000000-0000-4000-e000-000000000001', '23000000-0000-4000-b000-000000000001',
   '23000000-0000-4000-a000-000000000002', 'TCH-23-1', 'Teacher 1', 'active'),
  ('23000000-0000-4000-e000-000000000002', '23000000-0000-4000-b000-000000000001',
   '23000000-0000-4000-a000-000000000003', 'TCH-23-2', 'Teacher 2', 'active');

insert into public.files
  (id, workspace_id, owner_id, bucket, path, original_name, mime_type, size_bytes, created_by)
values
  ('23000000-0000-4000-f000-000000000001', '23000000-0000-4000-b000-000000000001',
   '23000000-0000-4000-a000-000000000002', 'private', 'staff/sa23-t1-nid.pdf', 'nid.pdf',
   'application/pdf', 1024, '23000000-0000-4000-a000-000000000002'),
  ('23000000-0000-4000-f000-000000000002', '23000000-0000-4000-b000-000000000001',
   '23000000-0000-4000-a000-000000000003', 'private', 'staff/sa23-t2-nid.pdf', 'nid.pdf',
   'application/pdf', 1024, '23000000-0000-4000-a000-000000000003'),
  ('23000000-0000-4000-f000-000000000003', '23000000-0000-4000-b000-000000000002',
   '23000000-0000-4000-a000-000000000004', 'private', 'staff/sa23-ob-nid.pdf', 'nid.pdf',
   'application/pdf', 1024, '23000000-0000-4000-a000-000000000004');

-- =====================================================================
-- A. profiles.email / phone
-- =====================================================================
select tests.login('23000000-0000-4000-a000-000000000005');
select is((select count(*)::int from public.workspace_invitations), 0,
  'X reads no invitation before touching their profile');
select throws_ok(
  $$update public.profiles set email = 'victim@sa23.local' where id = auth.uid()$$,
  '42501', 'email and phone come from sign-in and cannot be changed here',
  'a user cannot set their profile email to someone else''s address');
select is((select count(*)::int from public.workspace_invitations), 0,
  'so X still reads no invitation addressed to that address');
select throws_ok(
  $$update public.profiles set phone = '+8801700000023' where id = auth.uid()$$,
  '42501', 'email and phone come from sign-in and cannot be changed here',
  'a user cannot change their profile phone either (app.accept_invitation binds to it)');
select lives_ok(
  $$update public.profiles set full_name = 'Stranger X2', locale = 'bn' where id = auth.uid()$$,
  'the rest of the profile is still the user''s to edit');
select tests.logout();

select lives_ok(
  $$select tests.mkuser('23000000-0000-4000-a000-000000000009', 'victim@sa23.local', 'Victim')$$,
  'the address was not squatted: its owner can still sign up');
select lives_ok(
  $$update public.profiles set email = 'x-new@sa23.local' where id = '23000000-0000-4000-a000-000000000005'$$,
  'a privileged (server) context can still change the email');

-- =====================================================================
-- B. staff_documents.file_id
-- =====================================================================
select tests.login('23000000-0000-4000-a000-000000000002');
select lives_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by)
    values ('23000000-0000-4000-b000-000000000001', '23000000-0000-4000-e000-000000000001',
            'nid', '23000000-0000-4000-f000-000000000001', '23000000-0000-4000-a000-000000000002')$$,
  'a teacher attaches their own file to their own staff record');
select throws_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by)
    values ('23000000-0000-4000-b000-000000000001', '23000000-0000-4000-e000-000000000001',
            'nid', '23000000-0000-4000-f000-000000000002', '23000000-0000-4000-a000-000000000002')$$,
  '42501', null,
  'a teacher cannot attach a colleague''s file to their own record');
select throws_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by)
    values ('23000000-0000-4000-b000-000000000001', '23000000-0000-4000-e000-000000000001',
            'nid', '23000000-0000-4000-f000-000000000003', '23000000-0000-4000-a000-000000000002')$$,
  '42501', null,
  'a teacher cannot attach another school''s file to their own record');
select ok(not app.can_open_staff_document('23000000-0000-4000-f000-000000000002'),
  'so the /api/files guard does not open the colleague''s file for them');
select tests.logout();

select tests.login('23000000-0000-4000-a000-000000000001');
select throws_ok(
  $$insert into public.staff_documents (workspace_id, staff_record_id, kind, file_id, uploaded_by)
    values ('23000000-0000-4000-b000-000000000001', '23000000-0000-4000-e000-000000000002',
            'nid', '23000000-0000-4000-f000-000000000003', '23000000-0000-4000-a000-000000000001')$$,
  '23503', null,
  'an owner cannot attach another school''s file to a staff record either (composite FK)');
select tests.logout();

select * from finish();
rollback;
