-- =====================================================================
-- F-OP-07 Part 6 (D-211) · The danger zone: archive / unarchive, a
-- 30-day cancellable deletion, and "export all data".
-- ---------------------------------------------------------------------
-- Every action is owner-only IN THE DATABASE, not just in the UI: each
-- client-callable function below re-checks `app.member_role(ws) = 'owner'`
-- and the typed school name itself, so a direct RPC with an admin's JWT
-- (or a wrong name) is refused exactly like the app would refuse it.
--
-- Shape of the state (D-211):
--   * Archived        = workspaces.status 'archived' + archived_at. Every
--                       tenant write is refused (app.tg_require_writable,
--                       below); reads and export keep working; the owner
--                       can unarchive within 12 months.
--   * Pending deletion = workspaces.deletion_scheduled_at IS NOT NULL.
--                       NOT a new workspace_status value: an enum value
--                       cannot be added and used in one migration, and
--                       every `status <> 'active'` gate (switch_workspace)
--                       would lock the owner out of the school they may
--                       still cancel. The school keeps working for 30 days.
--   * Deleted          = the row is gone. Only public.purge_due_workspace
--                       (service_role only, called by the daily cron) does
--                       it, and only once deletion_scheduled_at has passed.
--
-- The status/archived_at/deletion_scheduled_at columns stay platform-only
-- for plain client DML (app.tg_workspaces_guard). The functions below
-- change them through the transaction-local `app.workspace_lifecycle`,
-- which they set to the workspace id after their own checks; nothing a
-- client can reach sets an `app.*` setting (PostgREST maps headers and JWT
-- claims to `request.*` only, and set_config is not exposed) — the same
-- mechanism as D-112's `app.ownership_transfer`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------
alter table public.workspaces
  add column if not exists archived_at           timestamptz,
  add column if not exists deletion_scheduled_at timestamptz;

comment on column public.workspaces.archived_at is
  'F-OP-07 W8 (D-211): when the owner archived the school; the owner may '
  'unarchive until archived_at + 12 months. Set only by public.archive_workspace.';
comment on column public.workspaces.deletion_scheduled_at is
  'F-OP-07 W8 (D-211): non-null = pending deletion. The daily purge deletes '
  'the school once this has passed; the owner may cancel until then.';

-- The purge job scans only schools with a deletion scheduled.
create index if not exists workspaces_deletion_scheduled_idx
  on public.workspaces (deletion_scheduled_at)
  where deletion_scheduled_at is not null;

-- ---------------------------------------------------------------------
-- 2. app.tg_workspaces_guard — the lifecycle columns join status as
--    platform-only for plain client DML; the danger-zone functions pass
--    through `app.workspace_lifecycle`, and may change ONLY those columns.
--    Body otherwise identical to 20260925000100_personal_workspace_uniqueness.sql.
-- ---------------------------------------------------------------------
create or replace function app.tg_workspaces_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() then
    return new;                                   -- server-owned path
  end if;

  if new.type is distinct from old.type then
    raise exception 'workspace type is immutable' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'ownership is transferred through app.transfer_ownership(), not by update'
      using errcode = '42501';
  end if;

  if new.invite_code is distinct from old.invite_code then
    raise exception 'the invite code is rotated through app.rotate_invite_code()'
      using errcode = '42501';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable — it records who the workspace was made for'
      using errcode = '42501';
  end if;

  if app.is_platform_admin() then
    return new;
  end if;

  -- D-211: a danger-zone function, after its own owner + name checks.
  if coalesce(current_setting('app.workspace_lifecycle', true), '') = new.id::text
     and to_jsonb(new) - array['status', 'archived_at', 'deletion_scheduled_at', 'updated_at']
       = to_jsonb(old) - array['status', 'archived_at', 'deletion_scheduled_at', 'updated_at'] then
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.status is distinct from old.status
     or new.access_mode is distinct from old.access_mode
     or new.archived_at is distinct from old.archived_at
     or new.deletion_scheduled_at is distinct from old.deletion_scheduled_at then
    raise exception 'plan, trial, workspace status, access mode, archiving and deletion are set by billing, platform staff and the danger zone'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. app.tg_require_writable — an ARCHIVED school is read-only too (D-211),
--    and the danger-zone functions may still change the school's own
--    `workspaces` row while it is read-only or archived (a school whose
--    trial lapsed must still be able to leave). Body otherwise identical
--    to 20260926065723_guardian_linking.sql.
-- ---------------------------------------------------------------------
create or replace function app.tg_require_writable()
returns trigger
language plpgsql
security definer   -- sees the workspace row even when the caller's RLS cannot
set search_path = ''
as $$
declare
  v_new    jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old    jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  -- UPDATE/DELETE read OLD's workspace: app.tg_freeze_workspace makes
  -- workspace_id immutable, so OLD and NEW always agree.
  v_ws     uuid  := (coalesce(v_old, v_new) ->> coalesce(tg_argv[0], 'workspace_id'))::uuid;
  v_reason text;
begin
  if app.is_privileged_context() or app.is_platform_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- D-211: archive/unarchive/schedule/cancel on the school's own row.
  if tg_table_name = 'workspaces' and tg_op = 'UPDATE'
     and coalesce(current_setting('app.workspace_lifecycle', true), '') = v_ws::text then
    return new;
  end if;

  select case when w.status = 'archived' then 'This school is archived.'
              else w.access_mode_reason end
    into v_reason
    from public.workspaces w
   where w.id = v_ws and (w.access_mode = 'read_only' or w.status = 'archived');
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Removing access is always allowed (D-300, security review).
  if (tg_table_name = 'workspace_members'
        and (tg_op = 'DELETE'
             or (tg_op = 'UPDATE' and v_new ->> 'status' = 'removed'
                 and v_new - array['status', 'removed_at', 'removed_by', 'updated_at']
                   = v_old - array['status', 'removed_at', 'removed_by', 'updated_at'])))
     or (tg_table_name = 'workspace_member_capabilities'
        and (tg_op = 'DELETE'
             or (tg_op = 'UPDATE' and v_new ->> 'revoked_at' is not null
                 and v_new - array['revoked_at', 'revoked_by']
                   = v_old - array['revoked_at', 'revoked_by'])))
     or (tg_table_name = 'workspace_invitations'
        and tg_op = 'UPDATE' and v_new ->> 'status' in ('revoked', 'declined')
        and v_new - array['status', 'revoked_at', 'revoked_by', 'declined_at', 'updated_at']
          = v_old - array['status', 'revoked_at', 'revoked_by', 'declined_at', 'updated_at'])
     -- D-107: releasing a teacher from a section or a section's subject.
     or (tg_table_name = 'sections'
        and tg_op = 'UPDATE' and v_new ->> 'class_teacher_id' is null
        and v_new - array['class_teacher_id', 'updated_at']
          = v_old - array['class_teacher_id', 'updated_at'])
     or (tg_table_name = 'section_subjects'
        and tg_op = 'UPDATE' and v_new ->> 'teacher_id' is null
        and v_new - array['teacher_id', 'updated_at']
          = v_old - array['teacher_id', 'updated_at'])
     -- D-108: revoking a parent's link to a child.
     or (tg_table_name = 'guardian_users'
        and tg_op = 'UPDATE' and v_new ->> 'status' = 'revoked'
        and v_new - array['status', 'revoked_at', 'updated_at']
          = v_old - array['status', 'revoked_at', 'updated_at'])
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Only an active member learns the mode; a non-member's write is left to
  -- RLS, which refuses it the same way whatever the mode (D-301).
  if app.member_role(v_ws) is not null then
    raise exception 'PLAN_READ_ONLY'
      using errcode = '42501',
            detail  = coalesce(v_reason, 'This workspace is read-only.');
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. public.switch_workspace — the OWNER may switch into their archived
--    school (to export, unarchive or delete it); everyone else still gets
--    WORKSPACE_UNAVAILABLE. Body otherwise identical to
--    20260917020300_tenancy_hardening.sql.
-- ---------------------------------------------------------------------
create or replace function public.switch_workspace(p_workspace_id uuid)
returns table (
  workspace_type public.workspace_type,
  role           public.member_role,
  plan_id        uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.member_role;
  v_type   public.workspace_type;
  v_plan   uuid;
  v_status public.workspace_status;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_workspace_id is null then
    raise exception 'a workspace id is required' using errcode = '22023';
  end if;

  select m.role, w.type, w.plan_id, w.status
    into v_role, v_type, v_plan, v_status
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.workspace_id = p_workspace_id
     and m.user_id = v_uid
     and m.status = 'active';

  if not found then
    raise exception 'WORKSPACE_NOT_MEMBER' using errcode = '42501';
  end if;

  -- ALLOWLIST, not a denylist (see 20260917020300). D-211 adds exactly one
  -- entry: an owner reaching their own archived school.
  if v_status <> 'active' and not (v_status = 'archived' and v_role = 'owner') then
    if v_status = 'suspended' then
      raise exception 'WORKSPACE_SUSPENDED' using errcode = '42501';
    end if;
    raise exception 'WORKSPACE_UNAVAILABLE' using errcode = '42501';
  end if;

  update public.profiles
     set last_active_workspace_id = p_workspace_id
   where id = v_uid;

  return query select v_type, v_role, v_plan;
end;
$$;

revoke all on function public.switch_workspace(uuid) from public, anon;
grant execute on function public.switch_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Audit catalogue — the danger-zone events.
-- ---------------------------------------------------------------------
insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
values
  ('workspace.unarchived', 'notable', '{actor} restored {workspace} from the archive',
    '{actor} {workspace} আর্কাইভ থেকে ফিরিয়ে এনেছেন', false),
  ('workspace.deletion_scheduled', 'critical', '{actor} scheduled {workspace} for deletion',
    '{actor} {workspace} মুছে ফেলার সময় নির্ধারণ করেছেন', false),
  ('workspace.deletion_cancelled', 'notable', '{actor} cancelled the deletion of {workspace}',
    '{actor} {workspace} মুছে ফেলা বাতিল করেছেন', false),
  ('workspace.deleted', 'critical', 'A school was deleted after its 30-day grace period',
    '৩০ দিনের সময় শেষে একটি স্কুল মুছে ফেলা হয়েছে', false),
  ('workspace.exported', 'notable', '{actor} downloaded a full export of {workspace}',
    '{actor} {workspace}-এর সম্পূর্ণ ডেটা ডাউনলোড করেছেন', false)
on conflict (action) do update
  set severity    = excluded.severity,
      sentence_en = excluded.sentence_en,
      sentence_bn = excluded.sentence_bn,
      is_generic  = excluded.is_generic;

-- ---------------------------------------------------------------------
-- 6. Shared checks (app schema: not reachable through PostgREST)
-- ---------------------------------------------------------------------

-- The caller must be the ACTIVE owner of a SCHOOL, and must have typed its
-- name (same letters, ignoring case and runs of spaces — D-112's rule).
-- Locks the workspace row for the rest of the transaction.
create or replace function app.danger_zone_check(p_workspace_id uuid, p_confirm_name text)
returns public.workspaces
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces;
begin
  if auth.uid() is null or app.member_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_ws from public.workspaces w where w.id = p_workspace_id for update;
  if not found or v_ws.type <> 'school' or v_ws.status = 'suspended' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_confirm_name is not null
     and lower(regexp_replace(btrim(normalize(p_confirm_name, NFC)), '\s+', ' ', 'g'))
         is distinct from lower(regexp_replace(btrim(normalize(v_ws.name, NFC)), '\s+', ' ', 'g')) then
    raise exception 'NAME_MISMATCH' using errcode = '22023';
  end if;

  return v_ws;
end;
$$;

-- A school with a paid, live subscription (or an unpaid balance) cannot be
-- archived or deleted until billing is settled (W8). A trial never blocks.
create or replace function app.assert_no_billing_blocker(p_workspace_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.subscription_status;
  v_plan   text;
begin
  select s.status, p.name into v_status, v_plan
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.workspace_id = p_workspace_id
     and s.status in ('active', 'past_due')
   order by s.created_at desc
   limit 1;

  if v_status = 'past_due' then
    raise exception 'UNPAID_BALANCE' using errcode = '55000',
      detail = format('The %s subscription has an unpaid balance.', v_plan);
  elsif v_status = 'active' then
    raise exception 'ACTIVE_SUBSCRIPTION' using errcode = '55000',
      detail = format('The %s subscription is active.', v_plan);
  end if;
end;
$$;

revoke all on function app.danger_zone_check(uuid, text) from public, anon, authenticated;
revoke all on function app.assert_no_billing_blocker(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Archive / unarchive
-- ---------------------------------------------------------------------
create or replace function public.archive_workspace(p_workspace_id uuid, p_confirm_name text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces;
begin
  v_ws := app.danger_zone_check(p_workspace_id, coalesce(p_confirm_name, ''));
  if v_ws.status = 'archived' then
    raise exception 'ALREADY_ARCHIVED' using errcode = '55000';
  end if;
  perform app.assert_no_billing_blocker(p_workspace_id);

  perform set_config('app.workspace_lifecycle', p_workspace_id::text, true);
  update public.workspaces
     set status = 'archived', archived_at = now()
   where id = p_workspace_id;
  perform set_config('app.workspace_lifecycle', '', true);

  perform app.log_audit_event('workspace.archived', p_workspace_id, 'public.workspaces', p_workspace_id);
  return now();
end;
$$;

create or replace function public.unarchive_workspace(p_workspace_id uuid, p_confirm_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces;
begin
  v_ws := app.danger_zone_check(p_workspace_id, coalesce(p_confirm_name, ''));
  if v_ws.status <> 'archived' then
    raise exception 'NOT_ARCHIVED' using errcode = '55000';
  end if;
  if v_ws.archived_at is not null and v_ws.archived_at < now() - interval '12 months' then
    raise exception 'ARCHIVE_EXPIRED' using errcode = '55000';
  end if;

  perform set_config('app.workspace_lifecycle', p_workspace_id::text, true);
  update public.workspaces
     set status = 'active', archived_at = null
   where id = p_workspace_id;
  perform set_config('app.workspace_lifecycle', '', true);

  perform app.log_audit_event('workspace.unarchived', p_workspace_id, 'public.workspaces', p_workspace_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Schedule / cancel deletion
-- ---------------------------------------------------------------------
create or replace function public.schedule_workspace_deletion(p_workspace_id uuid, p_confirm_name text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws   public.workspaces;
  v_when timestamptz := now() + interval '30 days';
begin
  v_ws := app.danger_zone_check(p_workspace_id, coalesce(p_confirm_name, ''));
  if v_ws.deletion_scheduled_at is not null then
    raise exception 'ALREADY_SCHEDULED' using errcode = '55000';
  end if;
  perform app.assert_no_billing_blocker(p_workspace_id);

  perform set_config('app.workspace_lifecycle', p_workspace_id::text, true);
  update public.workspaces
     set deletion_scheduled_at = v_when
   where id = p_workspace_id;
  perform set_config('app.workspace_lifecycle', '', true);

  perform app.log_audit_event('workspace.deletion_scheduled', p_workspace_id, 'public.workspaces',
    p_workspace_id, null, jsonb_build_object('deletion_scheduled_at', v_when));
  return v_when;
end;
$$;

-- Cancelling is the safe direction: no typed name (D-211). Refused once the
-- date has passed, so the purge never races a late cancel.
create or replace function public.cancel_workspace_deletion(p_workspace_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws public.workspaces;
begin
  v_ws := app.danger_zone_check(p_workspace_id, null);
  if v_ws.deletion_scheduled_at is null then
    raise exception 'NOT_SCHEDULED' using errcode = '55000';
  end if;
  if v_ws.deletion_scheduled_at <= now() then
    raise exception 'DELETION_DUE' using errcode = '55000';
  end if;

  perform set_config('app.workspace_lifecycle', p_workspace_id::text, true);
  update public.workspaces
     set deletion_scheduled_at = null
   where id = p_workspace_id;
  perform set_config('app.workspace_lifecycle', '', true);

  perform app.log_audit_event('workspace.deletion_cancelled', p_workspace_id, 'public.workspaces',
    p_workspace_id, jsonb_build_object('deletion_scheduled_at', v_ws.deletion_scheduled_at), null);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. The purge — service_role only (the daily cron route, withServiceRole).
--    Deletes ONE school whose grace has ended: the workspaces row, and with
--    it every tenant table by `on delete cascade`. What survives, by design:
--    audit_events, file_access_log, consent_records, legal_acceptances
--    (FK-free evidence with their own retention), data_requests
--    (workspace_id set null) and profiles (last_active_workspace_id set
--    null) — the people are users of the platform, not of the school.
--
--    The cascade fires the generic audit trigger once per deleted row, each
--    with the row's full `before` — a copy of the school's data in the
--    trail. Those rows are written under this call's own correlation id and
--    removed again before commit (the retention-purge path of
--    app.tg_append_only), and ONE platform-level row (workspace_id null)
--    records the deletion.
--
--    Fail-closed on files: no storage bucket exists yet, so a `files` row
--    here would be an object this function cannot delete. It refuses
--    (FILES_PRESENT) rather than leave a deleted school's files behind; the
--    files pipeline must remove objects before calling this.
-- ---------------------------------------------------------------------
create or replace function public.purge_due_workspace(p_workspace_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ws          public.workspaces;
  v_correlation uuid := gen_random_uuid();
begin
  if not app.is_privileged_context() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_ws from public.workspaces w where w.id = p_workspace_id for update;
  if not found or v_ws.deletion_scheduled_at is null or v_ws.deletion_scheduled_at > now() then
    raise exception 'NOT_DUE' using errcode = '55000';
  end if;
  if exists (select 1 from public.files f where f.workspace_id = p_workspace_id) then
    raise exception 'FILES_PRESENT' using errcode = '55000';
  end if;

  perform set_config('app.correlation_id', v_correlation::text, true);
  delete from public.workspaces where id = p_workspace_id;

  perform set_config('app.retention_purge', 'on', true);
  delete from public.audit_events where correlation_id = v_correlation;
  perform set_config('app.retention_purge', 'off', true);
  perform set_config('app.correlation_id', '', true);
  perform set_config('app.workspace_id', '', true);   -- the record is platform-level

  perform app.log_audit_event('workspace.deleted', null, 'public.workspaces', p_workspace_id,
    null, jsonb_build_object('deletion_scheduled_at', v_ws.deletion_scheduled_at),
    null, null, gen_random_uuid(), 'system');
end;
$$;

revoke all on function public.purge_due_workspace(uuid) from public, anon, authenticated;
grant execute on function public.purge_due_workspace(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 10. Export all data (W8 step 2, D-211 cut: a synchronous download).
--     public.log_workspace_export: owner only, at most 3 per school per
--     24 h, audited. public.export_workspace_table: SECURITY INVOKER — the
--     caller's own RLS and column grants decide what leaves, so the export
--     can never contain more than the owner could already read.
-- ---------------------------------------------------------------------
create or replace function public.log_workspace_export(p_workspace_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.danger_zone_check(p_workspace_id, null);
  if (select count(*) from public.audit_events a
       where a.workspace_id = p_workspace_id
         and a.action = 'workspace.exported'
         and a.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;
  perform app.log_audit_event('workspace.exported', p_workspace_id, 'public.workspaces', p_workspace_id);
end;
$$;

-- Every public base table that carries this school's rows: those with a
-- workspace_id column, plus `workspaces` itself (keyed by id).
create or replace function public.workspace_export_tables()
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select c.table_name::text
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public'
     and t.table_type = 'BASE TABLE'
     and (c.column_name = 'workspace_id' or (c.table_name = 'workspaces' and c.column_name = 'id'))
   order by 1
$$;

-- ponytail: one table per call, aggregated in memory — fine for a school's
-- few thousand rows; stream per table page when a school outgrows it.
create or replace function public.export_workspace_table(p_workspace_id uuid, p_table text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_key  text := case when p_table = 'workspaces' then 'id' else 'workspace_id' end;
  v_cols text;
  v_rows jsonb;
begin
  if app.member_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_table is null or p_table not in (select public.workspace_export_tables()) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  -- Only the columns the caller may SELECT (some tables grant per column).
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_table
     and has_column_privilege(format('public.%I', p_table), c.column_name, 'SELECT');
  if v_cols is null then
    return '[]'::jsonb;
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from (select %s from public.%I where %I = $1) r',
    v_cols, p_table, v_key)
    into v_rows
    using p_workspace_id;
  return v_rows;
end;
$$;

revoke all on function public.archive_workspace(uuid, text) from public, anon;
revoke all on function public.unarchive_workspace(uuid, text) from public, anon;
revoke all on function public.schedule_workspace_deletion(uuid, text) from public, anon;
revoke all on function public.cancel_workspace_deletion(uuid) from public, anon;
revoke all on function public.log_workspace_export(uuid) from public, anon;
revoke all on function public.workspace_export_tables() from public, anon;
revoke all on function public.export_workspace_table(uuid, text) from public, anon;
grant execute on function public.archive_workspace(uuid, text) to authenticated;
grant execute on function public.unarchive_workspace(uuid, text) to authenticated;
grant execute on function public.schedule_workspace_deletion(uuid, text) to authenticated;
grant execute on function public.cancel_workspace_deletion(uuid) to authenticated;
grant execute on function public.log_workspace_export(uuid) to authenticated;
grant execute on function public.workspace_export_tables() to authenticated;
grant execute on function public.export_workspace_table(uuid, text) to authenticated;
