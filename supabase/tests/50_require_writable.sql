-- =====================================================================
-- pgTAP · F-CM-06 read-only mode enforced at the database (D-300)
--
--   A. INVARIANT (can't be forgotten): every `public` table with a
--      `workspace_id` column, plus `public.workspaces` itself, carries a
--      BEFORE INSERT/UPDATE/DELETE row trigger calling
--      app.tg_require_writable() — unless it is on the EXEMPT list below,
--      each with its reason. A new tenant table that forgets the one-line
--      trigger fails CI here.
--   B. A member's direct writes (the PostgREST path, no server action) are
--      refused with PLAN_READ_ONLY while the workspace is read_only; reads
--      still work; a privileged caller still writes.
--   C. After reactivation (app.set_access_mode(..., 'normal')) the same
--      writes succeed.
-- =====================================================================
begin;
select plan(14);

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
    json_build_object(
      'sub',   p_id::text,
      'role',  'authenticated',
      'email', (select u.email from auth.users u where u.id = p_id)
    )::text, true);
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
-- A. Invariant. EXEMPT tables stay writable in read_only mode, on purpose:
--   audit_events, file_access_log, email_log — system logs written by
--       triggers/the server; a READ (a download, a tripwire) writes them.
--   subscriptions, subscription_events, usage_counters — billing: the
--       upgrade that lifts read_only must be able to write them.
--   consent_records, legal_acceptances, data_requests — the individual's own
--       legal/PDPA records; a data export request must still work.
--   notifications — the recipient's own inbox (read receipts), and billing
--       notices must still land.
-- ---------------------------------------------------------------------
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), array[]::text[])
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'p')
      and (c.relname = 'workspaces'
           or exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid
                         and a.attname = 'workspace_id'
                         and not a.attisdropped))
      and c.relname <> all (array[
            'audit_events', 'file_access_log', 'email_log',
            'subscriptions', 'subscription_events', 'usage_counters',
            'consent_records', 'legal_acceptances', 'data_requests',
            'notifications'])
      and not exists (
            select 1 from pg_trigger t
             where t.tgrelid = c.oid
               and t.tgfoid = 'app.tg_require_writable'::regproc
               and (t.tgtype & 31) = 31      -- ROW | BEFORE | INSERT | DELETE | UPDATE
               and t.tgenabled <> 'D')),
  array[]::text[],
  'every workspace_id table (and workspaces) has the require_writable trigger, or is on the exempt list');

-- ---------------------------------------------------------------------
-- Fixture: one school, its owner, one label — built as postgres.
-- ---------------------------------------------------------------------
select tests.mkuser('50000000-0000-4000-a000-000000000001', 'ro-owner@test.local', 'RO Owner');

insert into public.workspaces (id, type, name, slug, owner_id, created_by, status)
values ('50000000-0000-4000-b000-000000000001', 'school', 'Read-only School',
        'read-only-school-50', '50000000-0000-4000-a000-000000000001',
        '50000000-0000-4000-a000-000000000001', 'active');

insert into public.custom_labels (id, workspace_id, base_role, name, created_by)
values ('50000000-0000-4000-c000-000000000001', '50000000-0000-4000-b000-000000000001',
        'teacher', 'Coordinator', '50000000-0000-4000-a000-000000000001');

select app.set_access_mode('50000000-0000-4000-b000-000000000001', 'read_only',
                           'Your Pro trial has ended.');

-- ---------------------------------------------------------------------
-- B. read_only: the owner's direct writes are refused, reads are not.
-- ---------------------------------------------------------------------
select tests.login('50000000-0000-4000-a000-000000000001');

select throws_ok(
  $$update public.school_profiles set contact_email = 'x@test.local'
     where workspace_id = '50000000-0000-4000-b000-000000000001'$$,
  '42501', 'PLAN_READ_ONLY',
  'read_only: owner UPDATE of school_profiles is refused');

select throws_ok(
  $$insert into public.custom_labels (workspace_id, base_role, name, created_by)
    values ('50000000-0000-4000-b000-000000000001', 'staff', 'Clerk',
            '50000000-0000-4000-a000-000000000001')$$,
  '42501', 'PLAN_READ_ONLY',
  'read_only: owner INSERT into custom_labels is refused');

select throws_ok(
  $$delete from public.custom_labels where id = '50000000-0000-4000-c000-000000000001'$$,
  '42501', 'PLAN_READ_ONLY',
  'read_only: owner DELETE from custom_labels is refused');

select throws_ok(
  $$update public.workspaces set name = 'Renamed'
     where id = '50000000-0000-4000-b000-000000000001'$$,
  '42501', 'PLAN_READ_ONLY',
  'read_only: owner UPDATE of the workspace row itself is refused');

select is(
  (select count(*)::int from public.custom_labels
    where workspace_id = '50000000-0000-4000-b000-000000000001'),
  1,
  'read_only: reads still work (the owner still sees the label)');

select is(
  (select access_mode::text from public.workspaces
    where id = '50000000-0000-4000-b000-000000000001'),
  'read_only',
  'read_only: the owner still reads the workspace row (banner source)');

select tests.logout();

select lives_ok(
  $$update public.custom_labels set name = 'Coordinator (billing)'
     where id = '50000000-0000-4000-c000-000000000001'$$,
  'read_only: a privileged caller (service role / billing tick) still writes');

select is(
  (select name from public.workspaces where id = '50000000-0000-4000-b000-000000000001'),
  'Read-only School',
  'read_only: the refused rename changed nothing');

-- ---------------------------------------------------------------------
-- C. Reactivation lifts the guard for the same writes.
-- ---------------------------------------------------------------------
select lives_ok(
  $$select app.set_access_mode('50000000-0000-4000-b000-000000000001', 'normal', null)$$,
  'the billing path (privileged) can flip the mode back to normal');

select tests.login('50000000-0000-4000-a000-000000000001');

select lives_ok(
  $$update public.school_profiles set contact_email = 'x@test.local'
     where workspace_id = '50000000-0000-4000-b000-000000000001'$$,
  'normal: owner UPDATE of school_profiles succeeds');

select lives_ok(
  $$insert into public.custom_labels (workspace_id, base_role, name, created_by)
    values ('50000000-0000-4000-b000-000000000001', 'staff', 'Clerk',
            '50000000-0000-4000-a000-000000000001')$$,
  'normal: owner INSERT into custom_labels succeeds');

select lives_ok(
  $$delete from public.custom_labels where id = '50000000-0000-4000-c000-000000000001'$$,
  'normal: owner DELETE from custom_labels succeeds');

select tests.logout();

select is(
  (select count(*)::int from public.custom_labels
    where workspace_id = '50000000-0000-4000-b000-000000000001'),
  1,
  'normal: the writes actually landed (one label deleted, one added)');

select * from finish();
rollback;
