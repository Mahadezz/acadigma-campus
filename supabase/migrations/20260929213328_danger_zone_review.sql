-- =====================================================================
-- F-OP-07 Part 6 (D-211) · security review follow-ups
--   1. The purge re-checks the billing blockers: a school that started
--      paying during its 30-day grace is refused (ACTIVE_SUBSCRIPTION /
--      UNPAID_BALANCE lands in the cron's failed list), never deleted with
--      its payment records.
--   2. export_workspace_table requires the caller to have opened an export
--      through log_workspace_export in the last 10 minutes (audited,
--      3-a-day, not suspended) — a direct RPC can no longer bulk-read every
--      table without the audit row and the limit.
-- Bodies otherwise identical to 20260929213326_danger_zone.sql §9-§10.
-- =====================================================================

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
  perform app.assert_no_billing_blocker(p_workspace_id);
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
  -- audit_events is owner-readable, so the invoker can see its own row.
  if not exists (select 1 from public.audit_events a
                  where a.workspace_id = p_workspace_id
                    and a.actor_id = auth.uid()
                    and a.action = 'workspace.exported'
                    and a.created_at > now() - interval '10 minutes') then
    raise exception 'EXPORT_NOT_STARTED' using errcode = '42501';
  end if;
  if p_table is null or p_table not in (select public.workspace_export_tables()) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

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

revoke all on function public.export_workspace_table(uuid, text) from public, anon;
grant execute on function public.export_workspace_table(uuid, text) to authenticated;
