-- =====================================================================
-- F-ID-03 review follow-up (PR #12, Opus review): the forged-workspace
-- tripwire ALWAYS writes its audit row, and records the caller's own
-- membership status in that row instead of being skipped for it.
--
-- The first version of this follow-up suppressed the tripwire whenever the
-- caller held a removed/pending row in the targeted workspace. That opened a
-- silent-probe path: anyone holding a school's invite code becomes `pending`
-- via join_workspace_by_code and could then forge x-workspace-id for that
-- school with no audit trace, and a removed ex-employee's probes of the school
-- they left went unrecorded. The shared-phone false positive that motivated
-- the suppression is already removed at its source (the workspace cookie is
-- cleared on every sign-in), so suppression bought nothing and cost AC1.
--
-- The status is looked up HERE, server-side, as SECURITY DEFINER — never taken
-- from the client — so a caller cannot downgrade its own row's severity.
--   membership_status: 'none' | 'pending' | 'removed' | 'active' (race only)
--   severity:          'forgery' when 'none', otherwise 'inactive'
-- Signature and grants are unchanged (create or replace keeps both).
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
  v_status text;
begin
  if p_attempted_workspace_id is null then
    raise exception 'an attempted workspace id is required' using errcode = '22023';
  end if;

  select m.status::text
    into v_status
    from public.workspace_members m
   where m.workspace_id = p_attempted_workspace_id
     and m.user_id = auth.uid();

  perform app.log_audit_event(
    'tenancy.context_rejected',
    p_attempted_workspace_id,
    'public.workspace_members',
    null,
    null,
    jsonb_build_object(
      'attempted_workspace_id', p_attempted_workspace_id,
      'user_id', auth.uid(),
      'membership_status', coalesce(v_status, 'none'),
      'severity', case when v_status is null then 'forgery' else 'inactive' end),
    null, null, null);
end;
$$;

comment on function public.log_tenancy_context_rejected(uuid) is
  'F-ID-03 §4.3 tripwire (AC1): called by resolveWorkspaceContext whenever a '
  'WELL-FORMED x-workspace-id names a workspace the caller has no ACTIVE '
  'membership in. Always writes one audit row; the row carries the caller''s '
  'own membership_status (looked up here, never client-supplied) and a '
  'severity of forgery (no row at all) or inactive (removed/pending). '
  'Best-effort from the caller''s side: a failure here must never turn a 403 '
  'into a 500. D-52.';
