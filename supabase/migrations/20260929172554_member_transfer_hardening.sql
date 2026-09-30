-- =====================================================================
-- F-ID-03 Part 7 review follow-ups (D-112) · ownership has one door
-- ---------------------------------------------------------------------
-- 20260929172553 made the transfer re-authenticate in the server action
-- only. Independent security review of #112:
--
--   1. HIGH — an owner's session alone could still mint an owner with a
--      plain `UPDATE workspace_members SET role = 'owner'` (or an INSERT of
--      another user as owner), or call public.transfer_ownership directly
--      through PostgREST, skipping the password. Now:
--        * the guard refuses granting ownership to anyone else unless
--          app.ownership_transfer names that very row — which only
--          public.transfer_ownership sets (PostgREST cannot set app.*);
--        * public.transfer_ownership refuses a session whose JWT has no
--          password sign-in (`amr`) in the last 5 minutes
--          (REAUTH_REQUIRED, 28000). The server action signs in with the
--          password just before calling it, so its token is fresh; a stolen
--          older session is not.
--   2. MEDIUM — two owners leaving/being removed at the same instant could
--      each count the other and leave the school with none. The last-owner
--      check now takes a per-school transaction advisory lock first, so the
--      second one counts after the first commits.
--   3. LOW — the transfer now locks and re-checks the caller's own owner
--      row and requires the demotion to touch exactly that row.
--   4. LOW — app.transfer_ownership (20260917010100 §10.8: any active
--      member, parents included, as target; audit written from code) had no
--      caller and would now be refused by the guard anyway. Dropped.
--      `workspaces.owner_id` stays what it is in practice: who the school
--      was created for (the workspaces guard still freezes it); authority
--      is `workspace_members.role` alone.
-- Also: the transfer marker is compared as a uuid (`t.id = ...::uuid`),
-- so the lookup uses the primary key.
-- =====================================================================

create or replace function app.tg_workspace_members_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_actor_role  text;
  v_other_owner int;
  v_returning   boolean := false;
  v_unlinked    boolean := false;
  v_leaving     boolean := false;
  v_transfer    boolean := false;
  v_transfer_to text    := nullif(current_setting('app.ownership_transfer', true), '');
begin
  -- D-77 (#94): an owner/admin adding a member directly cannot forge
  -- provenance either; the server stamps it. Definer paths keep theirs.
  if tg_op = 'INSERT' and current_user in ('authenticated', 'anon') then
    new.invitation_id := null;
    new.invited_by    := null;
    new.created_by    := v_uid;
    new.created_at    := now();
    new.joined_at     := case when new.status = 'active' then now() end;
    new.removed_at    := case when new.status = 'removed' then now() end;
    new.removed_by    := case when new.status = 'removed' then v_uid end;
  end if;

  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id
       or new.user_id is distinct from old.user_id then
      raise exception 'workspace_id and user_id are immutable on a membership'
        using errcode = '42501';
    end if;

    -- D-77 (L2): provenance is server-owned. Checked before the stamps
    -- below, which set joined_at/removed_* themselves.
    if current_user in ('authenticated', 'anon')
       and (new.joined_at     is distinct from old.joined_at
            or new.invited_by    is distinct from old.invited_by
            or new.invitation_id is distinct from old.invitation_id
            or new.created_by    is distinct from old.created_by
            or new.created_at    is distinct from old.created_at
            or new.removed_at    is distinct from old.removed_at
            or new.removed_by    is distinct from old.removed_by) then
      raise exception 'joined_at, invited_by, invitation_id and removal stamps are set by the server'
        using errcode = '42501';
    end if;

    -- lifecycle stamps, applied server-side so the client cannot forge them
    if new.status = 'removed' and old.status is distinct from 'removed' then
      new.removed_at := now();
      new.removed_by := v_uid;
    elsif new.status = 'active' and old.status is distinct from 'active' then
      new.joined_at  := coalesce(new.joined_at, now());
      new.removed_at := null;
      new.removed_by := null;
    end if;

    v_returning :=
      new.user_id = v_uid
      and old.role = 'parent' and new.role = 'parent'
      and old.status = 'removed' and new.status = 'active'
      and to_jsonb(new) - array['status', 'joined_at', 'removed_at', 'removed_by',
                                'invitation_id', 'updated_at']
        = to_jsonb(old) - array['status', 'joined_at', 'removed_at', 'removed_by',
                                'invitation_id', 'updated_at']
      and exists (select 1 from public.workspace_invitations i
                   where i.id = new.invitation_id
                     and i.workspace_id = new.workspace_id
                     and i.guardian_id is not null
                     and i.status = 'accepted'
                     and i.accepted_by = v_uid
                     and i.accepted_at = now());

    -- D-109: a parent whose last link was revoked in this same transaction
    -- (revoke_guardian_link, which a class teacher may call) leaves the
    -- school. See 20260926180341.
    v_unlinked :=
      current_user not in ('authenticated', 'anon')
      and old.role = 'parent' and new.role = 'parent'
      and old.status = 'active' and new.status = 'removed'
      and to_jsonb(new) - array['status', 'removed_at', 'removed_by', 'updated_at']
        = to_jsonb(old) - array['status', 'removed_at', 'removed_by', 'updated_at']
      and not exists (select 1 from public.guardian_users gu
                       where gu.workspace_id = new.workspace_id
                         and gu.user_id = new.user_id and gu.status = 'active')
      and exists (select 1 from public.guardian_users gu
                   where gu.workspace_id = new.workspace_id
                     and gu.user_id = new.user_id and gu.status = 'revoked'
                     and gu.revoked_at = now());

    -- D-112: a member leaves (§4.6). Own row, active|pending -> removed,
    -- nothing else changed; parents leave per child (D-108), not here.
    v_leaving :=
      v_uid is not null
      and new.user_id = v_uid
      and old.role <> 'parent' and new.role = old.role
      and old.status in ('active', 'pending') and new.status = 'removed'
      and to_jsonb(new) - array['status', 'removed_at', 'removed_by', 'updated_at']
        = to_jsonb(old) - array['status', 'removed_at', 'removed_by', 'updated_at'];

    -- D-112: public.transfer_ownership demotes the caller owner -> admin
    -- after promoting the target named in app.ownership_transfer.
    v_transfer :=
      v_transfer_to is not null
      and v_uid is not null
      and new.user_id = v_uid
      and old.role = 'owner' and new.role = 'admin'
      and old.status = 'active' and new.status = 'active'
      and to_jsonb(new) - array['role', 'updated_at']
        = to_jsonb(old) - array['role', 'updated_at']
      and exists (select 1 from public.workspace_members t
                   where t.id = v_transfer_to::uuid
                     and t.workspace_id = new.workspace_id
                     and t.user_id <> v_uid
                     and t.role = 'owner' and t.status = 'active');
  end if;

  -- ---- authorization: skipped for server-owned paths and platform staff --
  if not (app.is_privileged_context() or app.is_platform_admin()
          or v_returning or v_unlinked or v_leaving or v_transfer) then

    v_actor_role := app.member_role(new.workspace_id);

    if tg_op = 'UPDATE' and (new.role is distinct from old.role
                             or new.status is distinct from old.status) then

      if new.user_id = v_uid then
        raise exception 'members cannot change their own role or status'
          using errcode = '42501';
      end if;

      if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
        raise exception 'only owners and admins can change a membership role or status'
          using errcode = '42501';
      end if;

      if (new.role = 'owner' or old.role = 'owner') and v_actor_role <> 'owner' then
        raise exception 'only an owner can grant or remove ownership'
          using errcode = '42501';
      end if;

      -- D-112 review: ownership is granted only by public.transfer_ownership
      -- (password re-auth), which names the promoted row in the marker.
      if new.role = 'owner' and old.role is distinct from 'owner'
         and v_transfer_to is distinct from new.id::text then
        raise exception 'ownership is granted only through transfer_ownership'
          using errcode = '42501';
      end if;
    end if;

    -- D-77 (L2): a member's own row, written directly, allows only the
    -- fields workspace_members_update_self exists for.
    if tg_op = 'UPDATE'
       and current_user in ('authenticated', 'anon')
       and new.user_id = v_uid
       and v_actor_role is distinct from 'owner' and v_actor_role is distinct from 'admin'
       and to_jsonb(new) - array['phone', 'department', 'subjects', 'updated_at']
           is distinct from to_jsonb(old) - array['phone', 'department', 'subjects', 'updated_at'] then
      raise exception 'members may edit only their own phone, department and subjects'
        using errcode = '42501';
    end if;

    if tg_op = 'INSERT'
       and new.role = 'owner'
       and new.user_id is distinct from v_uid then
      -- D-112 review: not even an owner adds another owner directly.
      raise exception 'ownership is granted only through transfer_ownership'
        using errcode = '42501';
    end if;
  end if;

  -- ---- invariant: enforced for EVERY caller, including the server -------
  -- A workspace must always have at least one active owner
  -- (PRODUCT-DECISIONS 1.5: "last owner cannot leave/downgrade").
  if tg_op = 'UPDATE'
     and old.role = 'owner' and old.status = 'active'
     and (new.role <> 'owner' or new.status <> 'active') then
    -- D-112 review: serialise concurrent owner exits per school, so the
    -- second one counts after the first commits.
    perform pg_advisory_xact_lock(hashtext('workspace_owners:' || new.workspace_id::text));
    v_other_owner := app.count_active_owners(new.workspace_id, old.id);
    if v_other_owner = 0 then
      raise exception 'a workspace must always have at least one active owner'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.transfer_ownership(
  p_workspace_id uuid,
  p_member_id    uuid,
  p_keep_owner   boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_target public.workspace_members%rowtype;
  v_rows   integer;
begin
  -- The caller's own active owner row, locked for the whole transfer.
  perform 1
     from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = v_uid
      and m.role = 'owner' and m.status = 'active'
    for update;
  if v_uid is null or not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- A password sign-in in the last 5 minutes (the server action does one
  -- just before this call). A refreshed token keeps its original amr
  -- timestamps, so an older session cannot pass.
  if not exists (
    select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
     where a ->> 'method' = 'password'
       and (a ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 300) then
    raise exception 'REAUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_target
    from public.workspace_members m
   where m.id = p_member_id
     and m.workspace_id = p_workspace_id
   for update;
  if not found
     or v_target.user_id = v_uid
     or v_target.status <> 'active'
     or v_target.role not in ('admin', 'teacher') then
    raise exception 'TARGET_NOT_ELIGIBLE' using errcode = 'P0002';
  end if;

  perform set_config('app.ownership_transfer', p_member_id::text, true);
  update public.workspace_members
     set role = 'owner', updated_at = now()
   where id = p_member_id;

  if not coalesce(p_keep_owner, false) then
    update public.workspace_members
       set role = 'admin', updated_at = now()
     where workspace_id = p_workspace_id
       and user_id = v_uid
       and role = 'owner'
       and status = 'active';
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  perform set_config('app.ownership_transfer', '', true);
end;
$$;

comment on function public.transfer_ownership(uuid, uuid, boolean) is
  'F-ID-03 Part 7 (D-112): an active owner who signed in with their password '
  'in the last 5 minutes makes an active admin or teacher of the same school an '
  'owner and, unless p_keep_owner, becomes an admin, in one transaction. The '
  'only way ownership is granted. Raises FORBIDDEN (42501), REAUTH_REQUIRED '
  '(28000), TARGET_NOT_ELIGIBLE (P0002); a read-only school is refused by '
  'app.tg_require_writable (42501 PLAN_READ_ONLY).';

-- Grants are unchanged by create or replace (D-54: authenticated only).

drop function if exists app.transfer_ownership(uuid, uuid);
