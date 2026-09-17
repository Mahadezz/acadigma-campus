-- =====================================================================
-- 0006 · F-ID-03 Parts 1-3 — tenancy hardening
-- ---------------------------------------------------------------------
-- Everything tables/enums/RLS/triggers for workspaces, school_profiles,
-- workspace_members, custom_labels and workspace_modules already shipped in
-- 0002 (20260917010100_identity.sql), including the last-owner invariant and
-- the self-edit ban (app.tg_workspace_members_guard, verified present —
-- nothing to add there) and the tenant-freeze trigger on
-- workspace_member_capabilities / custom_labels / workspace_invitations.
--
-- This migration adds only what F-ID-03 Part 1-3 needs on top of that:
--
--   1. Three `public` RPCs the client actually calls (`switch_workspace`,
--      `list_my_workspaces`, `log_tenancy_context_rejected`) — DECISION-LOG
--      D-50: `supabase/config.toml` exposes only `public`/`graphql_public`
--      through PostgREST, so a SECURITY DEFINER entry point reachable from
--      `supabase-js` cannot live in `app`, even though the logic underneath
--      belongs there. This migration is the second Part to follow that
--      pattern (the first was F-ID-01's `public.log_auth_event`).
--   2. `app.attach_freeze_workspace('public.school_profiles')` — a real gap:
--      `school_profiles.workspace_id` is its own primary key, and the 0002
--      migration's comment ("keyed by workspace_id ... therefore cannot
--      move") is WRONG — a primary key is fully UPDATE-able in Postgres.
--      `school_profiles_update`'s policy is `with check
--      (app.has_role(workspace_id, {owner,admin}))`, which (per D-36's note
--      on the UPDATE-policy template) cannot compare OLD vs NEW, so an
--      owner/admin of TWO workspaces could `UPDATE ... SET workspace_id =
--      <other workspace I also own>` and merge one school's profile onto
--      another's row. `usage_counters` and `subscription_events` also carry
--      a NOT NULL `workspace_id` but were checked and found to have no
--      UPDATE grant to `authenticated` at all (0004's grants: SELECT only),
--      so there is no client path to re-parent them and no freeze trigger is
--      needed there.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. school_profiles: close the tenant-reparenting gap.
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.school_profiles');

-- ---------------------------------------------------------------------
-- 2. public.switch_workspace — F-ID-03 §4.2 / §7.
--    Re-verifies active membership server-side (never trusts the id it is
--    handed), refuses a suspended workspace, and records the choice on
--    profiles.last_active_workspace_id — the same UX-hint column
--    resolveWorkspaceContext's fallback chain reads, never anything RLS or a
--    policy consults directly (0002's comment on that column still holds).
--    Returns the resolved type/role/plan so the caller can compute
--    `resolveLandingRoute` without a second round trip.
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

  -- Message text is the machine-readable code (mirrors F-ID-03 §7's error
  -- names exactly) so apps/web can branch on it without parsing SQLSTATE.
  if not found then
    raise exception 'WORKSPACE_NOT_MEMBER' using errcode = '42501';
  end if;

  if v_status = 'suspended' then
    raise exception 'WORKSPACE_SUSPENDED' using errcode = '42501';
  end if;

  update public.profiles
     set last_active_workspace_id = p_workspace_id
   where id = v_uid;

  return query select v_type, v_role, v_plan;
end;
$$;

comment on function public.switch_workspace(uuid) is
  'F-ID-03 §4.2/§7 switchWorkspace. Re-verifies active membership (D-04: the '
  'id is a hint, never trusted), rejects a suspended workspace, and sets '
  'profiles.last_active_workspace_id — never used by RLS, read only by '
  'resolveWorkspaceContext''s fallback chain (packages/db).';

-- ---------------------------------------------------------------------
-- 3. public.list_my_workspaces — F-ID-03 §4.2 / §7.
--    SECURITY DEFINER on purpose: the plain `workspaces` SELECT policy is
--    `app.member_role(id) is not null`, which is active-only (every app.*
--    helper only considers status='active' rows) — a `pending` join-by-code
--    row would otherwise be invisible here, and the switcher explicitly
--    needs to render "Pending approval" for it (F-ID-03 §4.2 step 1). This
--    function bypasses that one restriction, narrowly, for the caller's own
--    membership rows only (`m.user_id = auth.uid()`, not parameterised).
-- ---------------------------------------------------------------------
create or replace function public.list_my_workspaces()
returns table (
  workspace_id uuid,
  name         text,
  type         public.workspace_type,
  role         public.member_role,
  status       public.member_status,
  logo_url     text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.name, w.type, m.role, m.status, w.logo_url
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.user_id = auth.uid()
   order by (w.type = 'personal') desc, m.joined_at asc nulls last, m.created_at asc;
$$;

comment on function public.list_my_workspaces() is
  'F-ID-03 §4.2/§7 listMyWorkspaces. Every membership the caller holds, '
  'INCLUDING pending and removed (0002''s workspace_members_select policy '
  'already allows a user to see their own rows in any status; this function '
  'additionally resolves the workspace name/logo for those rows even when '
  'the plain workspaces policy would hide a non-active one). Personal '
  'workspace first, matching resolveWorkspaceContext''s fallback order.';

-- ---------------------------------------------------------------------
-- 4. public.log_tenancy_context_rejected — F-ID-03 §4.3 failure case, AC1.
--    The one PostgREST-reachable door onto app.log_audit_event for this
--    specific tripwire (same shape as F-ID-01's public.log_auth_event: a
--    narrow, single-purpose forward, not a generic "log anything" RPC).
--    workspace_id is set to the ATTEMPTED workspace, not left null: this
--    lets that workspace's own owner see "someone attempted a forged header
--    against us" via the normal audit_events read policy (owner + platform
--    staff only, D-36) — a cheap, real piece of defensive visibility, not
--    just a platform-side counter.
-- ---------------------------------------------------------------------
create or replace function public.log_tenancy_context_rejected(
  p_attempted_workspace_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_attempted_workspace_id is null then
    raise exception 'an attempted workspace id is required' using errcode = '22023';
  end if;

  perform app.log_audit_event(
    'tenancy.context_rejected',
    p_attempted_workspace_id,
    'public.workspace_members',
    null,
    null,
    jsonb_build_object(
      'attempted_workspace_id', p_attempted_workspace_id,
      'user_id', auth.uid()),
    null, null, null);
end;
$$;

comment on function public.log_tenancy_context_rejected(uuid) is
  'F-ID-03 §4.3 tripwire (AC1): called by resolveWorkspaceContext '
  '(packages/db) exactly when a WELL-FORMED x-workspace-id header names a '
  'workspace the caller is not an active member of — never for a malformed '
  'id (noise) and never for a stale last_active_workspace_id falling '
  'through the resolution chain (an ordinary "you left" case, not a forgery '
  'attempt). Best-effort from the caller''s side: a failure here must never '
  'turn a 403 into a 500.';

-- ---------------------------------------------------------------------
-- 5. Grants — authenticated only. Every function above raises on
--    auth.uid() is null, so anon gets nothing (unlike F-ID-01's throttle
--    functions, these have no pre-session use case).
-- ---------------------------------------------------------------------
revoke all on function public.switch_workspace(uuid) from public;
revoke all on function public.list_my_workspaces() from public;
revoke all on function public.log_tenancy_context_rejected(uuid) from public;

grant execute on function public.switch_workspace(uuid) to authenticated;
grant execute on function public.list_my_workspaces() to authenticated;
grant execute on function public.log_tenancy_context_rejected(uuid) to authenticated;
