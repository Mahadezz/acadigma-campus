-- =====================================================================
-- F-CM-06 — read-only mode enforced at the database too (D-300)
-- ---------------------------------------------------------------------
-- `workspaces.access_mode = 'read_only'` (set by the trial-expiry tick, D-62)
-- was checked only by server actions (`requireWritable`, D-29). A direct
-- PostgREST write from a member's own session skipped it entirely. This adds
-- one shared BEFORE trigger that refuses INSERT/UPDATE/DELETE on a tenant
-- table while the row's workspace is read_only.
--
--   - Reads are untouched: a write-only trigger, no RLS predicate, so none of
--     DATA-MODEL §1.2's reasons for keeping billing out of RLS apply.
--   - Privileged callers pass (service role, the billing tick, migrations,
--     the seed — `app.is_privileged_context()`), and so do platform staff
--     (`app.is_platform_admin()`), so `app.set_access_mode(..., 'normal')`
--     can always lift the mode.
--   - Removing access stays possible (security review): a member's status
--     set to 'removed', deleting a membership, revoking/deleting a
--     capability, and revoking/declining an invitation.
--   - A caller who is not an active member only gets refused on a
--     membership INSERT (accept invitation / join by code), with a generic
--     "ask the owner to upgrade" — never the workspace's reason. Every other
--     non-member write falls through to RLS, so the reason never leaks to a
--     stranger who knows a workspace uuid.
--   - Tables deliberately NOT guarded are listed with reasons in
--     supabase/tests/50_require_writable.sql, which fails CI for any
--     `workspace_id` table that is neither guarded nor on that list.
--
-- A new tenant table adds ONE line:
--   select app.attach_require_writable('public.<t>');
-- =====================================================================

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

  select w.access_mode_reason into v_reason
    from public.workspaces w
   where w.id = v_ws and w.access_mode = 'read_only';
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
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if app.member_role(v_ws) is not null then
    raise exception 'PLAN_READ_ONLY'
      using errcode = '42501',
            detail  = coalesce(v_reason, 'This workspace is read-only.');
  end if;

  -- Not a member: joining a read-only school is refused without its reason;
  -- anything else is left to RLS, which rejects it.
  if tg_table_name = 'workspace_members' and tg_op = 'INSERT' then
    raise exception 'PLAN_READ_ONLY'
      using errcode = '42501',
            detail  = 'This workspace is read-only. Ask the owner to upgrade.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function app.tg_require_writable() is
  'D-300: refuses INSERT/UPDATE/DELETE on a tenant row while its workspace is '
  'access_mode = read_only (PLAN_READ_ONLY, 42501). TG_ARGV[0] names the '
  'workspace column (default workspace_id; public.workspaces passes id). '
  'Privileged callers and platform staff pass; removing access (member '
  'removed, capability revoked, invitation revoked/declined) always passes.';

revoke all on function app.tg_require_writable() from public, anon, authenticated;

create or replace function app.attach_require_writable(
  p_table  regclass,
  p_column text default 'workspace_id')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left('require_writable_' || replace(replace(p_table::text, '.', '_'), '"', ''), 63);
begin
  execute format('drop trigger if exists %I on %s', v_name, p_table);
  execute format(
    'create trigger %I before insert or update or delete on %s '
    'for each row execute function app.tg_require_writable(%L)',
    v_name, p_table, p_column);
end;
$$;

comment on function app.attach_require_writable(regclass, text) is
  'D-300: attaches app.tg_require_writable() to a tenant table, idempotently. '
  'One call per new table with a workspace_id column.';

-- Migration-time DDL tool, granted to nobody (same as app.attach_audit).
revoke all on function app.attach_require_writable(regclass, text)
  from public, anon, authenticated, service_role;

select app.attach_require_writable('public.workspaces', 'id');
select app.attach_require_writable('public.school_profiles');
select app.attach_require_writable('public.custom_labels');
select app.attach_require_writable('public.workspace_invitations');
select app.attach_require_writable('public.workspace_members');
select app.attach_require_writable('public.workspace_member_capabilities');
select app.attach_require_writable('public.files');
select app.attach_require_writable('public.staff_records');
select app.attach_require_writable('public.staff_compensation');
select app.attach_require_writable('public.staff_documents');
