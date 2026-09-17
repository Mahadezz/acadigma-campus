-- =====================================================================
-- 0001 · extensions, the `app` schema, and every shared helper
-- Acadigma Campus · Supabase Postgres 17
-- ---------------------------------------------------------------------
-- Forward-only. Idempotent-safe: extensions and types are guarded, every
-- function is `create or replace`, every object uses `if not exists`.
--
-- Helper functions live in `app`, NOT in `public`, because `public` is
-- exposed through the Data API: a `security definer` function in `public`
-- is callable by anon/authenticated by default (Postgres grants EXECUTE to
-- PUBLIC on every new function). `app` is never exposed, and `anon` is not
-- granted USAGE on it.
--
-- Helpers reference tables that are created in 0002/0003. Postgres
-- validates LANGUAGE SQL function bodies at creation time, so body
-- checking is turned off for this migration only (session-scoped).
-- =====================================================================

set check_function_bodies = off;

-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------
create schema if not exists extensions;

create extension if not exists pgcrypto      with schema extensions;
create extension if not exists pg_trgm       with schema extensions;
create extension if not exists btree_gin     with schema extensions;
create extension if not exists btree_gist    with schema extensions;
create extension if not exists unaccent      with schema extensions;

-- pg_cron is only installable on the Supabase-managed primary. Never fail
-- a migration (or a local pgTAP run) because it is unavailable.
do $$
begin
  create extension if not exists pg_cron;
exception
  when insufficient_privilege or feature_not_supported or undefined_file then
    raise notice 'pg_cron not available in this environment; SQL-only jobs will be scheduled separately';
end
$$;

-- pgTAP is only needed by `supabase test db`; harmless elsewhere.
do $$
begin
  create extension if not exists pgtap with schema extensions;
exception
  when insufficient_privilege or feature_not_supported or undefined_file then
    raise notice 'pgtap not available in this environment';
end
$$;

-- ---------------------------------------------------------------------
-- 2. The `app` schema
-- ---------------------------------------------------------------------
create schema if not exists app;

comment on schema app is
  'Private schema: RLS helpers, trigger functions, server-only tables '
  '(document_counters, idempotency_keys, jobs, inbound_events). Never '
  'exposed '
  'through PostgREST. anon has no USAGE.';

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Identity helpers (ARCHITECTURE §3)
-- ---------------------------------------------------------------------

-- app.current_user_id() -> the calling user, or null for anon/service role.
create or replace function app.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid()
$$;

comment on function app.current_user_id() is
  'The authenticated user id (auth.uid()). NULL for anon and for the '
  'service role. Never derived from a client-supplied header.';

-- app.current_email() -> the calling user''s lower-cased email.
create or replace function app.current_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(p.email)
  from public.profiles p
  where p.id = auth.uid()
$$;

-- app.is_platform_admin() -> platform staff flag (PRODUCT-DECISIONS 1.21).
-- Reads `profiles.is_platform_admin`, which only another platform admin can
-- ever set (enforced by app.tg_profiles_guard).
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

comment on function app.is_platform_admin() is
  'True when the caller is platform staff. Grants access to /platform only; '
  'never implies workspace membership (PRODUCT-DECISIONS 1.21).';

-- app.member_role(workspace_id) -> role text, ACTIVE members only.
-- Returns NULL for pending, removed and non-members: RLS therefore denies
-- access the instant a membership stops being `active`
-- (PRODUCT-DECISIONS 1.14; security review finding 6).
create or replace function app.member_role(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role::text
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1
$$;

comment on function app.member_role(uuid) is
  'The caller''s role in a workspace, or NULL when they are not an ACTIVE '
  'member. Single source of tenancy truth for RLS.';

-- app.has_role(workspace_id, roles[]) -> the policy workhorse.
create or replace function app.has_role(p_workspace_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role::text = any (p_roles)
  )
$$;

comment on function app.has_role(uuid, text[]) is
  'True when the caller is an ACTIVE member of the workspace holding one of '
  'the listed roles. Checks membership AND role — never the tenant id alone '
  '(security review: "RLS must check membership and role").';

-- app.is_adult(user_id) -> 18+ on this calendar day, in Asia/Dhaka.
-- Sellers must be adults (they receive payouts) and external job candidates
-- must be adults (they sign employment documents). Deliberately a function
-- rather than a generated column: age is not immutable, so a STORED
-- generated column would freeze whatever the answer was on the day the row
-- was written and silently keep a 17-year-old under-age forever.
create or replace function app.is_adult(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.date_of_birth is not null
        and p.date_of_birth <= ((now() at time zone 'Asia/Dhaka')::date - interval '18 years')
       from public.profiles p where p.id = p_user_id),
    false)
$$;

comment on function app.is_adult(uuid) is
  'True when the user is 18+ today. Gate for seller onboarding and external '
  'job applications. Computed, never stored, because age changes.';

-- app.has_capability(workspace_id, capability) -> fine-grained grants that
-- sit BESIDE the role, not inside it.
--
-- Roles stay five (PRODUCT-DECISIONS 1.5) because a permission matrix you
-- cannot hold in your head is a permission matrix nobody tests. But some
-- duties are narrower than a role: `fees.cashier` lets one named person take
-- cash at the front desk without making them an admin, and without inventing
-- a sixth role that every future policy would have to reason about.
-- A capability is always ADDITIVE and always requires an active membership.
create or replace function app.has_capability(p_workspace_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_member_capabilities c
    join public.workspace_members m
      on m.workspace_id = c.workspace_id
     and m.user_id      = c.user_id
    where c.workspace_id = p_workspace_id
      and c.user_id      = auth.uid()
      and c.capability   = p_capability
      and c.revoked_at is null
      and m.status = 'active'
  )
$$;

comment on function app.has_capability(uuid, text) is
  'Additive, named grants beyond the role (first use: fees.cashier). Always '
  'requires an ACTIVE membership, so revoking membership revokes every '
  'capability with it.';

-- app.shares_active_workspace(user_id) -> may the caller see this person?
-- Deliberately excludes `parent`: a parent must never be able to enumerate
-- a school''s staff (PRODUCT-DECISIONS 1.13).
create or replace function app.shares_active_workspace(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members me
    join public.workspace_members them
      on them.workspace_id = me.workspace_id
    where me.user_id = auth.uid()
      and me.status = 'active'
      and me.role in ('owner', 'admin', 'teacher', 'staff')
      and them.user_id = p_user_id
      and them.status = 'active'
  )
$$;

-- app.is_guardian_of(student_id) -> parent-portal reads.
-- `guardians` / `guardian_users` arrive with the academics migration; the
-- helper is declared here so every policy template can reference it.
create or replace function app.is_guardian_of(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.guardian_users gu
    join public.guardians g on g.id = gu.guardian_id
    where gu.user_id = auth.uid()
      and gu.status = 'active'
      and g.student_id = p_student_id
  )
$$;

comment on function app.is_guardian_of(uuid) is
  'True when the caller is an invitation-linked guardian of the student. '
  'The only predicate a parent-scoped policy may use.';

-- app.staff_hourly_rate(workspace_id, user_id, on_date) -> paisa, or NULL.
--
-- Pay is NOT a column on staff_records. RLS is row-level: a rate column on
-- the employment record would either expose every colleague's pay to anyone
-- allowed to read that record, or block a teacher from reading their own
-- record at all. Compensation therefore lives in its own period-versioned
-- table that only owner/admin may SELECT, and the cover-teacher payroll
-- snapshot reads it through this SECURITY DEFINER function instead: the
-- caller never sees the row, only the number the calculation needs.
-- (`staff_compensation` ships with the operations migration.)
create or replace function app.staff_hourly_rate(p_workspace_id uuid, p_user_id uuid, p_on date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select c.hourly_rate_paisa
  from public.staff_compensation c
  where c.workspace_id = p_workspace_id
    and c.user_id = p_user_id
    and c.valid_from <= p_on
    and (c.valid_to is null or c.valid_to >= p_on)
  order by c.valid_from desc
  limit 1
$$;

comment on function app.staff_hourly_rate(uuid, uuid, date) is
  'The hourly rate in effect on a date, for payroll-impact snapshots. Exists '
  'so that pay never becomes a column a colleague can read.';

-- ---------------------------------------------------------------------
-- 4. Workspace context (ARCHITECTURE §3)
-- ---------------------------------------------------------------------

-- app.set_workspace_context(workspace_id) — called once per request by
-- packages/db after it has resolved WorkspaceContext. It RE-VERIFIES
-- membership server-side and raises 42501 when the caller is not an active
-- member, so a forged `x-workspace-id` header can never establish context.
-- This is the direct fix for the Base44 root cause (client-writable
-- `active_workspace_id`).
create or replace function app.set_workspace_context(p_workspace_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required' using errcode = '22023';
  end if;

  v_role := app.member_role(p_workspace_id);

  if v_role is null then
    if app.is_platform_admin() then
      v_role := 'platform_admin';
    else
      raise exception 'not an active member of workspace %', p_workspace_id
        using errcode = '42501';
    end if;
  end if;

  perform set_config('app.workspace_id', p_workspace_id::text, true);
  perform set_config('app.member_role', v_role, true);
  return v_role;
end;
$$;

comment on function app.set_workspace_context(uuid) is
  'Verifies active membership, then sets the transaction-local settings '
  'app.workspace_id / app.member_role that triggers and audit read. '
  'Raises 42501 for non-members: context is never taken on trust.';

create or replace function app.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

-- app.is_privileged_context() — TRUE when the statement is running inside a
-- server-owned path rather than as a direct client statement.
--
-- Deliberately SECURITY INVOKER: `current_user` is the *effective* role, so
-- it reads `authenticated` for a PostgREST statement, `postgres` inside a
-- SECURITY DEFINER function we own, and `service_role` / `supabase_auth_admin`
-- for trusted backend paths. Guard triggers use this instead of a
-- `set_config` flag, which a client could in principle set for itself.
create or replace function app.is_privileged_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('authenticated', 'anon')
$$;

-- Definer counterpart for guards that must count rows they may not see.
create or replace function app.count_active_owners(p_workspace_id uuid, p_exclude_member_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.role = 'owner'
    and m.status = 'active'
    and (p_exclude_member_id is null or m.id <> p_exclude_member_id)
$$;

create or replace function app.current_correlation_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(current_setting('app.correlation_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------
-- 5. Small utilities
-- ---------------------------------------------------------------------

create or replace function app.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')),
      ''),
    'ws')
$$;

create or replace function app.gen_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'ACD-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 2, 4))
$$;

-- Last 10 significant digits, for comparing phone numbers written with or
-- without +880 / 0 prefixes.
create or replace function app.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10), '')
$$;

create or replace function app.hash_token(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select sha256(convert_to(coalesce(p_token, ''), 'UTF8'))
$$;

comment on function app.hash_token(text) is
  'Invitation/API tokens are stored as SHA-256 digests only. The raw token '
  'exists exactly once, in the email or SMS that carried it.';

-- Which document kinds restart their numbering each year. Year-scoped kinds
-- read DOC-2026-00001; the rest read DOC-000001 and never reset.
create or replace function app.id_kind_is_yearly(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_kind in ('student', 'admission', 'staff', 'invoice', 'order',
                    'receipt', 'fee_invoice', 'fee_receipt', 'money_receipt')
$$;

create or replace function app.default_id_prefix(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'student'     then 'STU'
    when 'admission'   then 'ADM'
    when 'staff'       then 'TCH'
    when 'worksheet'   then 'WS'
    when 'exam_paper'  then 'EX'
    when 'notes'       then 'NT'
    when 'lesson_plan' then 'LP'
    when 'quiz'        then 'QZ'
    when 'handout'     then 'HO'
    when 'slides'      then 'SL'
    when 'resource'    then 'RS'
    when 'invoice'     then 'INV'
    when 'order'       then 'ORD'
    when 'receipt'     then 'RCP'
    else upper(left(regexp_replace(p_kind, '[^a-zA-Z]', '', 'g'), 3))
  end
$$;

-- ---------------------------------------------------------------------
-- 6. app.next_id — gapless, per-workspace document numbering
--    (PRODUCT-DECISIONS 2.6 / 3.6; ARCHITECTURE §4)
--
--    Backed by ONE table, app.document_counters. There is exactly one
--    counter mechanism in this system: student ids, staff ids, resource
--    codes, order numbers, invoice numbers and fee money-receipt numbers
--    all come from here. Three near-identical counter tables is how two of
--    them end up with different locking and one of them starts producing
--    duplicates under load.
--
--    Serialised by a transaction advisory lock keyed on (workspace, kind)
--    plus a row lock, so two concurrent admissions can never receive the
--    same STU-2026-00001, and the sequence is gapless — which a Postgres
--    sequence is not, and which a tax authority cares about.
-- ---------------------------------------------------------------------
create or replace function app.next_id(p_workspace_id uuid, p_kind text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_year int;
  v_row  app.document_counters;
  v_next integer;
begin
  if coalesce(p_kind, '') = '' then
    raise exception 'a document kind is required' using errcode = '22023';
  end if;

  -- workspace_id is nullable: platform-level sequences (payout batches,
  -- platform invoices) have no tenant.
  perform pg_advisory_xact_lock(
    hashtext(coalesce(p_workspace_id::text, 'platform')),
    hashtext(p_kind));

  select coalesce(sp.timezone, 'Asia/Dhaka')
    into v_tz
    from public.school_profiles sp
   where sp.workspace_id = p_workspace_id;
  v_tz := coalesce(v_tz, 'Asia/Dhaka');

  -- year 0 means "not year-scoped", so one column covers both shapes.
  v_year := case
              when app.id_kind_is_yearly(p_kind)
              then extract(year from (now() at time zone v_tz))::int
              else 0
            end;

  select * into v_row
    from app.document_counters c
   where c.workspace_id is not distinct from p_workspace_id
     and c.kind = p_kind
     and c.year = v_year
     for update;

  if not found then
    insert into app.document_counters (workspace_id, kind, year, prefix, pad_width, last_no)
    values (
      p_workspace_id,
      p_kind,
      v_year,
      app.default_id_prefix(p_kind),
      case when p_kind in ('student', 'worksheet', 'resource') then 5 else 4 end,
      0)
    returning * into v_row;
  end if;

  v_next := v_row.last_no + 1;

  update app.document_counters
     set last_no = v_next, updated_at = now()
   where workspace_id is not distinct from p_workspace_id
     and kind = p_kind
     and year = v_year;

  if v_year = 0 then
    return v_row.prefix || '-' || lpad(v_next::text, v_row.pad_width, '0');
  end if;

  return v_row.prefix || '-' || v_year::text || '-' || lpad(v_next::text, v_row.pad_width, '0');
end;
$$;

comment on function app.next_id(uuid, text) is
  'Next gapless per-workspace document number for a kind (STU-2026-00001, '
  'WS-000214). The single counter mechanism in the system; year-scoped kinds '
  'restart in the workspace timezone.';

-- ---------------------------------------------------------------------
-- 7. Generic triggers
-- ---------------------------------------------------------------------

create or replace function app.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A tenant row may never move to another workspace.
create or replace function app.tg_freeze_workspace()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Generic, server-side, same-transaction audit (ARCHITECTURE §4,
-- PRODUCT-DECISIONS 6.8). Runs as the table owner, so it writes to
-- audit_events even though no client role holds INSERT on that table.
-- TG_ARGV[0] is an optional comma-separated list of columns to redact —
-- use it for token hashes, ID-document paths and payout details.
create or replace function app.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_ws     uuid;
  v_row_id uuid;
  v_col    text;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after  := null;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    if v_before = v_after then
      return new;                       -- no-op update: nothing to record
    end if;
  else
    v_before := null;
    v_after  := to_jsonb(new);
  end if;

  if tg_nargs > 0 and coalesce(tg_argv[0], '') <> '' then
    foreach v_col in array string_to_array(tg_argv[0], ',') loop
      v_before := v_before - v_col;
      v_after  := v_after  - v_col;
    end loop;
  end if;

  -- `workspaces` audits itself: its own id is the tenant key.
  v_ws := coalesce(
            (v_after  ->> 'workspace_id')::uuid,
            (v_before ->> 'workspace_id')::uuid,
            case when tg_table_name = 'workspaces'
                 then coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid)
            end,
            app.current_workspace_id());

  v_row_id := coalesce((v_after ->> 'id')::uuid, (v_before ->> 'id')::uuid);

  insert into public.audit_events (
    workspace_id, actor_id, action, table_name, row_id,
    before, after, correlation_id)
  values (
    v_ws,
    auth.uid(),
    lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    v_row_id,
    v_before,
    v_after,
    app.current_correlation_id());

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Append-only guard, shared by audit_events, file_access_log,
-- consent_records and legal_acceptances.
--
-- UPDATE is refused unconditionally: there is no legitimate reason to alter
-- a record of what happened. DELETE is refused too, with one narrow
-- exception: the retention purge, which must be able to drop rows past their
-- legal retention window. That exception requires BOTH a privileged context
-- (current_user is not `authenticated`/`anon`, so a client statement can
-- never qualify) AND an explicit transaction-local flag that only the purge
-- function sets. Either alone is not enough.
create or replace function app.tg_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and app.is_privileged_context()
     and coalesce(current_setting('app.retention_purge', true), '') = 'on' then
    return old;
  end if;

  raise exception '% is append-only: % is not permitted',
    tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Trigger attachment helpers — one call per table, so the audit /
--    updated_at / tenant-freeze contract is literally identical everywhere.
-- ---------------------------------------------------------------------

create or replace function app.attach_updated_at(p_table regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left('set_updated_at_' || replace(replace(p_table::text, '.', '_'), '"', ''), 63);
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I before update on %s for each row execute function app.tg_set_updated_at()',
    v_name, p_table);
end;
$$;

create or replace function app.attach_freeze_workspace(p_table regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left('freeze_workspace_' || replace(replace(p_table::text, '.', '_'), '"', ''), 63);
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I before update on %s for each row execute function app.tg_freeze_workspace()',
    v_name, p_table);
end;
$$;

create or replace function app.attach_audit(p_table regclass, p_redact text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left('audit_' || replace(replace(p_table::text, '.', '_'), '"', ''), 63);
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I after insert or update or delete on %s '
    'for each row execute function app.tg_audit(%L)',
    v_name, p_table, array_to_string(coalesce(p_redact, '{}'), ','));
end;
$$;

create or replace function app.attach_append_only(p_table regclass)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left('append_only_' || replace(replace(p_table::text, '.', '_'), '"', ''), 63);
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I before update or delete on %s for each row execute function app.tg_append_only()',
    v_name, p_table);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Function grants
--    Postgres grants EXECUTE to PUBLIC on every new function. Revoke that
--    and hand it back explicitly. `anon` has no USAGE on `app`, so it
--    cannot reach these at all.
-- ---------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end
$$;

reset check_function_bodies;
