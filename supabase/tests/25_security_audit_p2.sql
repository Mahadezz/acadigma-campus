-- =====================================================================
-- pgTAP · Security audit Part 2 (D-77) — Part 1's hand-ons, fixed
--
--   A. files (L5). A teacher could create a `public` file row, which
--      files_select_public showed to anon (a file name can carry a
--      child's name); files_insert took any bucket/path, so a teacher
--      could register a path someone else was about to upload to; and a
--      client could set server-owned columns (virus_scan_status,
--      download_count, path on update). Now: only owners/admins make a
--      file public, a client row lives under `<workspace_id>/<own uid>/`,
--      public metadata is readable by the school's staff only (never
--      anon), and server-owned columns are not client-writable.
--   B. report_runs (L1). A client could insert a run already `ready`
--      with any file_id. Only the columns the server action sends are
--      insertable now.
--   C. workspace_members (L2). A member could edit their own joined_at,
--      invited_by, invitation_id, employee_code, label_id. Provenance
--      columns are server-only for every direct client write; a member's
--      own row allows phone, department and subjects only.
--   D. data_requests (L3). Any user could file into any school's queue.
--      A school request now needs a membership in that school; the
--      deadline, file and outcome columns are not client-insertable.
--   E. workspace_member_capabilities (L4). An admin could grant
--      themselves (or a peer) a capability. Capability writes are
--      owner-only.
--   F. SECURITY DEFINER sweep: search_path pinned everywhere, nothing
--      executable by PUBLIC, and `authenticated` executes only an
--      explicit allowlist in `app` (the unchecked writers log_audit_event,
--      notify, record_consent, next_id, log_file_access and the unused
--      is_adult are no longer on it).
-- =====================================================================
begin;
select plan(33);

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
  perform set_config('role', 'postgres', true);
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

create or replace function tests.as_anon()
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$fn$;

-- ---------------------------------------------------------------------
-- Fixture (as postgres). School A: owner OA, admin AD, teachers T1, T2.
-- School B: owner OB. X: signed in, no school. A has one public file
-- (the owner's) and T1 has one private file.
-- ---------------------------------------------------------------------
select tests.mkuser('25000000-0000-4000-a000-000000000001', 'oa@sa25.local', 'Owner A');
select tests.mkuser('25000000-0000-4000-a000-000000000002', 't1@sa25.local', 'Teacher 1');
select tests.mkuser('25000000-0000-4000-a000-000000000003', 't2@sa25.local', 'Teacher 2');
select tests.mkuser('25000000-0000-4000-a000-000000000004', 'ob@sa25.local', 'Owner B');
select tests.mkuser('25000000-0000-4000-a000-000000000005', 'x@sa25.local', 'Stranger X');
select tests.mkuser('25000000-0000-4000-a000-000000000006', 'ad@sa25.local', 'Admin A');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values
  ('25000000-0000-4000-b000-000000000001', 'school', 'Audit School A', 'audit-school-a-25',
   '25000000-0000-4000-a000-000000000001', '25000000-0000-4000-a000-000000000001', 'active'),
  ('25000000-0000-4000-b000-000000000002', 'school', 'Audit School B', 'audit-school-b-25',
   '25000000-0000-4000-a000-000000000004', '25000000-0000-4000-a000-000000000004', 'active');

insert into public.workspace_members (workspace_id, user_id, role, status, joined_at)
values
  ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002', 'teacher', 'active', now()),
  ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000003', 'teacher', 'active', now()),
  ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000006', 'admin',   'active', now());

insert into public.files
  (id, workspace_id, owner_id, bucket, path, original_name, mime_type, size_bytes,
   visibility, created_by)
values
  ('25000000-0000-4000-f000-000000000001', '25000000-0000-4000-b000-000000000001',
   '25000000-0000-4000-a000-000000000001', 'public',
   '25000000-0000-4000-b000-000000000001/25000000-0000-4000-a000-000000000001/prize-day.jpg',
   'Rahim Class 5 prize day.jpg', 'image/jpeg', 2048, 'public',
   '25000000-0000-4000-a000-000000000001'),
  ('25000000-0000-4000-f000-000000000002', '25000000-0000-4000-b000-000000000001',
   '25000000-0000-4000-a000-000000000002', 'private',
   '25000000-0000-4000-b000-000000000001/25000000-0000-4000-a000-000000000002/notes.pdf',
   'notes.pdf', 'application/pdf', 1024, 'private',
   '25000000-0000-4000-a000-000000000002');

-- =====================================================================
-- A. files (L5)
-- =====================================================================
select tests.login('25000000-0000-4000-a000-000000000002');  -- T1

select throws_ok(
  $$insert into public.files (workspace_id, owner_id, bucket, path, original_name, mime_type,
                              size_bytes, visibility, created_by)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'public', '25000000-0000-4000-b000-000000000001/25000000-0000-4000-a000-000000000002/a.jpg',
            'a.jpg', 'image/jpeg', 10, 'public', '25000000-0000-4000-a000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "files"',
  'A1: a teacher cannot create a public file');

select throws_ok(
  $$insert into public.files (workspace_id, owner_id, bucket, path, original_name, mime_type,
                              size_bytes, visibility, created_by)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'private', '25000000-0000-4000-b000-000000000001/25000000-0000-4000-a000-000000000003/nid.pdf',
            'nid.pdf', 'application/pdf', 10, 'private', '25000000-0000-4000-a000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "files"',
  'A2: a teacher cannot register a path under a colleague''s prefix');

select throws_ok(
  $$insert into public.files (workspace_id, owner_id, bucket, path, original_name, mime_type,
                              size_bytes, visibility, created_by)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'private', 'receipts/25000000-0000-4000-b000-000000000001/R-0001.pdf',
            'R-0001.pdf', 'application/pdf', 10, 'private', '25000000-0000-4000-a000-000000000002')$$,
  '42501', 'new row violates row-level security policy for table "files"',
  'A3: a teacher cannot register a server-namespace path');

select throws_ok(
  $$insert into public.files (workspace_id, owner_id, bucket, path, original_name, mime_type,
                              size_bytes, created_by, virus_scan_status)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'private', '25000000-0000-4000-b000-000000000001/25000000-0000-4000-a000-000000000002/b.pdf',
            'b.pdf', 'application/pdf', 10, '25000000-0000-4000-a000-000000000002', 'clean')$$,
  '42501', 'permission denied for table files',
  'A4: a client cannot insert a file already marked virus-clean');

select lives_ok(
  $$insert into public.files (workspace_id, owner_id, bucket, path, original_name, mime_type,
                              size_bytes, visibility, created_by)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'private', '25000000-0000-4000-b000-000000000001/25000000-0000-4000-a000-000000000002/c.pdf',
            'c.pdf', 'application/pdf', 10, 'workspace', '25000000-0000-4000-a000-000000000002')$$,
  'A5: a teacher can register a private or workspace file under their own prefix');

select throws_ok(
  $$update public.files set visibility = 'public'
     where id = '25000000-0000-4000-f000-000000000002'$$,
  '42501', 'new row violates row-level security policy for table "files"',
  'A6: a teacher cannot make their own file public afterwards');

select throws_ok(
  $$update public.files set path = 'elsewhere/notes.pdf'
     where id = '25000000-0000-4000-f000-000000000002'$$,
  '42501', 'permission denied for table files',
  'A7: a client cannot move a file row to another path');

select lives_ok(
  $$update public.files set original_name = 'lesson-notes.pdf'
     where id = '25000000-0000-4000-f000-000000000002'$$,
  'A8: a teacher can still rename their own file');

select is(
  (select count(*)::int from public.files where id = '25000000-0000-4000-f000-000000000001'),
  1, 'A9: school staff still read the school''s public file metadata');

select tests.login('25000000-0000-4000-a000-000000000001');  -- OA
select lives_ok(
  $$insert into public.files (workspace_id, owner_id, bucket, path, original_name, mime_type,
                              size_bytes, visibility, created_by)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000001',
            'public', '25000000-0000-4000-b000-000000000001/25000000-0000-4000-a000-000000000001/logo.png',
            'logo.png', 'image/png', 10, 'public', '25000000-0000-4000-a000-000000000001')$$,
  'A10: an owner can still publish a public file under their own prefix');

select tests.login('25000000-0000-4000-a000-000000000004');  -- OB
select is(
  (select count(*)::int from public.files where id = '25000000-0000-4000-f000-000000000001'),
  0, 'A11: another school cannot read A''s public file metadata');

select tests.logout();
select tests.as_anon();
select throws_ok(
  $$select count(*) from public.files$$,
  '42501', 'permission denied for table files',
  'A12: anon cannot read file metadata at all');
select tests.logout();

-- =====================================================================
-- B. report_runs (L1)
-- =====================================================================
select tests.login('25000000-0000-4000-a000-000000000002');  -- T1

select throws_ok(
  $$insert into public.report_runs (workspace_id, kind, params, locale, requested_by,
                                    idempotency_key, status)
    values ('25000000-0000-4000-b000-000000000001', 'sample', '{}'::jsonb, 'en',
            '25000000-0000-4000-a000-000000000002', 'b1', 'ready')$$,
  '42501', 'permission denied for table report_runs',
  'B1: a client cannot insert a run that is already ready');

select throws_ok(
  $$insert into public.report_runs (workspace_id, kind, params, locale, requested_by,
                                    idempotency_key, file_id)
    values ('25000000-0000-4000-b000-000000000001', 'sample', '{}'::jsonb, 'en',
            '25000000-0000-4000-a000-000000000002', 'b2', '25000000-0000-4000-f000-000000000001')$$,
  '42501', 'permission denied for table report_runs',
  'B2: a client cannot attach a file to a new run');

select lives_ok(
  $$insert into public.report_runs (workspace_id, kind, params, locale, requested_by,
                                    idempotency_key)
    values ('25000000-0000-4000-b000-000000000001', 'sample', '{}'::jsonb, 'en',
            '25000000-0000-4000-a000-000000000002', 'b3')$$,
  'B3: the columns createReportRun sends are still insertable');

-- =====================================================================
-- C. workspace_members (L2)
-- =====================================================================
select throws_ok(
  $$update public.workspace_members set joined_at = '2001-01-01'
     where user_id = '25000000-0000-4000-a000-000000000002'$$,
  '42501', 'joined_at, invited_by, invitation_id and removal stamps are set by the server',
  'C1: a member cannot back-date their own joined_at');

select throws_ok(
  $$update public.workspace_members set invited_by = '25000000-0000-4000-a000-000000000001'
     where user_id = '25000000-0000-4000-a000-000000000002'$$,
  '42501', 'joined_at, invited_by, invitation_id and removal stamps are set by the server',
  'C2: a member cannot rewrite who invited them');

select throws_ok(
  $$update public.workspace_members set employee_code = 'HM-001'
     where user_id = '25000000-0000-4000-a000-000000000002'$$,
  '42501', 'members may edit only their own phone, department and subjects',
  'C3: a member cannot set their own employee code');

select lives_ok(
  $$update public.workspace_members
       set phone = '01700000000', department = 'Science', subjects = array['Physics']
     where user_id = '25000000-0000-4000-a000-000000000002'$$,
  'C4: a member can still edit their own phone, department and subjects');

select tests.login('25000000-0000-4000-a000-000000000006');  -- AD
select throws_ok(
  $$update public.workspace_members set joined_at = '2001-01-01'
     where user_id = '25000000-0000-4000-a000-000000000003'$$,
  '42501', 'joined_at, invited_by, invitation_id and removal stamps are set by the server',
  'C5: an admin cannot rewrite a colleague''s joined_at either');

select lives_ok(
  $$update public.workspace_members set employee_code = 'T-002', department = 'Maths'
     where user_id = '25000000-0000-4000-a000-000000000003'$$,
  'C6: an admin can still edit a teacher''s employee code and department');

-- =====================================================================
-- D. data_requests (L3)
-- =====================================================================
select tests.login('25000000-0000-4000-a000-000000000005');  -- X, no school

select throws_ok(
  $$insert into public.data_requests (workspace_id, requester_user_id, subject_type, kind)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000005',
            'self', 'erasure')$$,
  '42501', 'new row violates row-level security policy for table "data_requests"',
  'D1: a stranger cannot file into a school''s request queue');

select lives_ok(
  $$insert into public.data_requests (workspace_id, requester_user_id, subject_type, kind)
    values (null, '25000000-0000-4000-a000-000000000005', 'self', 'export')$$,
  'D2: anyone can still file a platform-level request about themselves');

select tests.login('25000000-0000-4000-a000-000000000002');  -- T1
select lives_ok(
  $$insert into public.data_requests (workspace_id, requester_user_id, subject_type, kind)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'self', 'correction')$$,
  'D3: a member can file into their own school''s queue');

select throws_ok(
  $$insert into public.data_requests (workspace_id, requester_user_id, subject_type, kind, due_on)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'self', 'export', '2099-01-01')$$,
  '42501', 'permission denied for table data_requests',
  'D4: a requester cannot set their own deadline');

-- =====================================================================
-- E. workspace_member_capabilities (L4)
-- =====================================================================
select tests.login('25000000-0000-4000-a000-000000000006');  -- AD

select throws_ok(
  $$insert into public.workspace_member_capabilities (workspace_id, user_id, capability)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000006',
            'fees.cashier')$$,
  '42501', 'new row violates row-level security policy for table "workspace_member_capabilities"',
  'E1: an admin cannot grant themselves a capability');

select throws_ok(
  $$insert into public.workspace_member_capabilities (workspace_id, user_id, capability)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'fees.cashier')$$,
  '42501', 'new row violates row-level security policy for table "workspace_member_capabilities"',
  'E2: an admin cannot grant a capability to anyone (owner-only)');

select tests.login('25000000-0000-4000-a000-000000000001');  -- OA
select lives_ok(
  $$insert into public.workspace_member_capabilities (workspace_id, user_id, capability, granted_by)
    values ('25000000-0000-4000-b000-000000000001', '25000000-0000-4000-a000-000000000002',
            'fees.cashier', '25000000-0000-4000-a000-000000000001')$$,
  'E3: an owner grants a capability');

select tests.login('25000000-0000-4000-a000-000000000006');  -- AD
update public.workspace_member_capabilities set revoked_at = now()
 where user_id = '25000000-0000-4000-a000-000000000002';
select tests.logout();
select is(
  (select revoked_at from public.workspace_member_capabilities
    where user_id = '25000000-0000-4000-a000-000000000002'),
  null, 'E4: an admin cannot revoke it either (no row matched)');

-- =====================================================================
-- F. SECURITY DEFINER sweep
-- =====================================================================
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef and n.nspname in ('app', 'public')
      and not coalesce('search_path=""' = any (p.proconfig) or 'search_path=' = any (p.proconfig), false)),
  '{}'::text[], 'F1: every SECURITY DEFINER function pins search_path to empty');

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public')
      and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a
                                        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  '{}'::text[], 'F2: no function in app/public is executable by PUBLIC');

select is(
  (select coalesce(array_agg(p.proname::text order by 1), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.proname in ('log_audit_event', 'notify', 'record_consent', 'next_id',
                        'log_file_access', 'is_adult')
      and has_function_privilege('authenticated', p.oid, 'execute')),
  '{}'::text[], 'F3: authenticated cannot call the unchecked app writers directly');

-- Every app function a signed-in caller can execute, and why: a policy or
-- SECURITY INVOKER caller needs it, or it checks the caller itself. A new
-- entry here is a deliberate review decision, not a default.
select is(
  (select coalesce(array_agg(p.proname::text order by 1), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')),
  array[
    'accept_invitation',            -- the caller's own token
    'attendance_edit_window_days',  -- public.attendance_day (invoker)
    'can_enter_marks',              -- policy helper, caller-scoped
    'can_open_staff_document',      -- caller-scoped predicate
    'can_read_results',             -- policy helper, caller-scoped
    'can_read_school_calendar',     -- caller-scoped predicate
    'can_read_student_private',     -- policy helper, caller-scoped
    'count_active_owners',          -- members guard (invoker trigger)
    'create_invitation',            -- checks has_role itself
    'current_correlation_id',
    'current_email',                -- policy helper, caller-scoped
    'current_user_id',              -- policy helper
    'current_workspace_id',
    'decline_invitation',           -- the caller's own token
    'handle_new_user',              -- trigger only (A2, D-75)
    'has_capability',               -- caller-scoped
    'has_role',                     -- policy helper, caller-scoped
    'is_guardian_of',               -- policy helper, caller-scoped
    'is_platform_admin',            -- caller-scoped
    'is_school_day',                -- checks can_read_school_calendar
    'join_workspace_by_code',       -- the caller's own code
    'member_role',                  -- caller-scoped
    'pre_request',                  -- PostgREST pre-request hook
    'rotate_invite_code',           -- checks has_role itself
    'school_day_count',             -- via school_days' check
    'school_days',                  -- checks can_read_school_calendar
    'school_today',                 -- public.attendance_day (invoker)
    'set_access_mode',              -- checks privileged/platform itself
    'set_correlation_id',           -- the caller's own transaction
    'set_workspace_context',        -- checks member_role itself
    'shares_active_workspace',      -- policy helper, caller-scoped
    'staff_hourly_rate',            -- checks self or owner/admin itself
    'tg_audit',                     -- trigger only (A2, D-75)
    'tg_workspace_billing_bootstrap', -- trigger only (A2, D-75)
    'tg_workspace_bootstrap',       -- trigger only (A2, D-75)
    'transfer_ownership',           -- checks member_role itself
    'within_limit',                 -- checks membership itself
    'workspace_plan'                -- checks membership itself
  ]::text[],
  'F4: authenticated executes only the reviewed app allowlist');

select * from finish();
rollback;
