-- =====================================================================
-- F-OP-07 Part 6 (D-211) · lead review: the purge refuses a SUSPENDED
-- school (SUSPENDED). A platform suspension (abuse, legal hold) also stops
-- the owner from cancelling (app.danger_zone_check refuses a suspended
-- school), so without this the cron would delete the evidence the hold
-- exists to keep. Body otherwise identical to
-- 20260929213328_danger_zone_review.sql.
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
  if v_ws.status = 'suspended' then
    raise exception 'SUSPENDED' using errcode = '55000';
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
