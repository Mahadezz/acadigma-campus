-- =====================================================================
-- D-301 — joining a read-only school is refused by the join functions,
-- not by the require_writable trigger (PR #35 security re-check, low)
-- ---------------------------------------------------------------------
-- D-300's trigger refused a non-member's membership INSERT with
-- PLAN_READ_ONLY. A direct PostgREST insert into workspace_members by a
-- stranger therefore got PLAN_READ_ONLY on a read-only workspace and an RLS
-- error otherwise — anyone holding a workspace uuid could learn its access
-- mode. Now:
--   - app.accept_invitation / app.join_workspace_by_code check access_mode
--     themselves, AFTER the token/binding or code has been verified, so only
--     a genuine invitee learns it, with "ask the owner to upgrade".
--   - app.tg_require_writable drops its non-member branch: a stranger's
--     write only ever meets RLS.
-- Both functions are otherwise identical to 20260917010100_identity.sql
-- (create or replace keeps their grants).
-- =====================================================================

create or replace function app.accept_invitation(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_inv   public.workspace_invitations;
  v_email text;
  v_phone text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select lower(p.email), p.phone into v_email, v_phone
    from public.profiles p where p.id = v_uid;

  select * into v_inv
    from public.workspace_invitations i
   where i.token_hash = app.hash_token(p_token)
     for update;

  if not found then
    raise exception 'invitation not found' using errcode = '22023';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'invitation is already %', v_inv.status using errcode = '22023';
  end if;

  if v_inv.expires_at <= now() then
    update public.workspace_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired' using errcode = '22023';
  end if;

  if v_inv.email is not null and lower(v_inv.email) is distinct from v_email then
    raise exception 'this invitation is bound to a different email address'
      using errcode = '42501';
  end if;

  if v_inv.email is null
     and app.normalize_phone(v_inv.phone) is distinct from app.normalize_phone(v_phone) then
    raise exception 'this invitation is bound to a different phone number'
      using errcode = '42501';
  end if;

  -- D-301: a verified invitee may not join a read-only school.
  if exists (select 1 from public.workspaces w
              where w.id = v_inv.workspace_id and w.access_mode = 'read_only') then
    raise exception 'PLAN_READ_ONLY'
      using errcode = '42501',
            detail  = 'This workspace is read-only. Ask the owner to upgrade.';
  end if;

  insert into public.workspace_members
    (workspace_id, user_id, role, status, label_id, invitation_id, invited_by, joined_at, created_by)
  values
    (v_inv.workspace_id, v_uid, v_inv.role, 'active', v_inv.label_id, v_inv.id,
     v_inv.invited_by, now(), v_uid)
  on conflict (workspace_id, user_id) do update
    set status        = 'active',
        role          = case when workspace_members.role = 'owner' then 'owner'::public.member_role
                             else excluded.role end,
        label_id      = coalesce(excluded.label_id, workspace_members.label_id),
        invitation_id = excluded.invitation_id,
        joined_at     = coalesce(workspace_members.joined_at, now()),
        removed_at    = null,
        removed_by    = null;

  update public.workspace_invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_inv.id;

  return v_inv.workspace_id;
end;
$$;

create or replace function app.join_workspace_by_code(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select w.id into v_ws
    from public.workspaces w
   where w.type = 'school'
     and w.status = 'active'
     and w.invite_code = upper(btrim(p_code));

  if not found then
    raise exception 'invalid invite code' using errcode = '22023';
  end if;

  -- D-301: a valid code for a read-only school does not let anyone join.
  if exists (select 1 from public.workspaces w
              where w.id = v_ws and w.access_mode = 'read_only') then
    raise exception 'PLAN_READ_ONLY'
      using errcode = '42501',
            detail  = 'This workspace is read-only. Ask the owner to upgrade.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, status, created_by)
  values (v_ws, v_uid, 'teacher', 'pending', v_uid)
  on conflict (workspace_id, user_id) do nothing;

  return v_ws;
end;
$$;

-- D-300's trigger without the non-member branch (D-301).
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
