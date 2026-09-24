-- =====================================================================
-- F-ID-03 follow-up: public.log_tenancy_context_rejected refuses a caller
-- with no auth.uid(), exactly like its siblings switch_workspace and
-- list_my_workspaces (20260917020300_tenancy_hardening.sql:69).
--
-- Since D-54 (20260924030000) anon cannot EXECUTE this function at all, so
-- this is defence in depth: a future grant mistake, or a service_role
-- caller without a user JWT, must not be able to write an actor-less
-- tripwire row into an arbitrary school's audit feed.
--
-- Body otherwise identical to 20260924020000_tenancy_tripwire_membership_status.sql.
-- CREATE OR REPLACE keeps the signature, owner and grants.
-- =====================================================================
create or replace function public.log_tenancy_context_rejected(
  p_attempted_workspace_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_attempted_workspace_id is null then
    raise exception 'an attempted workspace id is required' using errcode = '22023';
  end if;

  select m.status::text
    into v_status
    from public.workspace_members m
   where m.workspace_id = p_attempted_workspace_id
     and m.user_id = v_uid;

  perform app.log_audit_event(
    'tenancy.context_rejected',
    p_attempted_workspace_id,
    'public.workspace_members',
    null,
    null,
    jsonb_build_object(
      'attempted_workspace_id', p_attempted_workspace_id,
      'user_id', v_uid,
      'membership_status', coalesce(v_status, 'none'),
      'severity', case when v_status is null then 'forgery' else 'inactive' end),
    null, null, null);
end;
$$;
