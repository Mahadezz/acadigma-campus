-- =====================================================================
-- D-108 follow-ups (D-109), on top of 20260926065723_guardian_linking.sql.
--
--   1. A staff member who is also a parent at their own school. An active
--      member of ANY role may hold guardian_users links in that school:
--      accepting a guardian link as an active owner/admin/teacher/staff
--      member adds the link and changes nothing about the membership. The
--      parent reads (students_select_guardian, results_select_guardian,
--      public.family_results) are gated on an active membership of any role
--      plus app.is_guardian_of(...) (an active link) instead of
--      role = 'parent'. A pure parent still gets a 'parent' membership.
--      MEMBERSHIP_CONFLICT is now only for a membership that is not active
--      (pending, or removed in a staff role): no one is reactivated or
--      re-roled by a link. No self-service exception is added to the
--      members guard (D-108's returning-parent path stays the only one).
--      Revoking a staff member's link removes nothing else (only a 'parent'
--      membership goes with its last link, unchanged); removing any
--      membership still revokes that person's links (the D-108 trigger).
--   2. Class-teacher invites (F-ID-04 OQ-6): the class teacher of the
--      student's CURRENT section (app.can_read_student_private, the same
--      rule that shows them the guardians) may invite and revoke for that
--      student, under the same 60/h school limit. The invitation insert and
--      the link update are audited by the generic table audit with the
--      teacher as actor. The class teacher also reads that student's links
--      (guardian_users_select), so the student page can show them.
--      A pure parent's last link revoked by a class teacher still removes
--      their parent membership. The members guard is a trigger that judges
--      the caller (auth.uid() and the `role` setting, which SECURITY
--      DEFINER does not change, D-108 §5), so it would refuse a teacher.
--      It accepts exactly that one removal (never an addition) when the
--      UPDATE runs inside a SECURITY DEFINER function (current_user is not
--      'authenticated') AND a link of that parent was revoked in this
--      transaction with none left. A direct PATCH never qualifies.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reads: any active member with an active link.
-- ---------------------------------------------------------------------
drop policy if exists students_select_guardian on public.students;
create policy students_select_guardian on public.students
  for select to authenticated
  using (deleted_at is null
         and app.member_role(workspace_id) is not null
         and app.is_guardian_of(id));

drop policy if exists results_select_guardian on public.results;
create policy results_select_guardian on public.results
  for select to authenticated
  using (published
         and withheld_reason is null
         and app.member_role(workspace_id) is not null
         and app.is_guardian_of(student_id));

create or replace function public.family_results(p_workspace_id uuid)
returns table (exam_id uuid, student_id uuid, published_at timestamptz, withheld boolean, card jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.exam_id, r.student_id, r.published_at, r.withheld_reason is not null, r.frozen_payload
    from public.results r
   where r.workspace_id = p_workspace_id
     and r.published
     and app.member_role(p_workspace_id) is not null
     and app.is_guardian_of(r.student_id)
   order by r.published_at desc, r.student_id
$$;

comment on function public.family_results(uuid) is
  'F-AC-10 results tab (D-306, D-109): the caller''s linked children''s '
  'published results with their frozen cards; withheld ones flagged, with no '
  'marks and no reason. Any active member of the school with an active '
  'guardian link (a parent, or staff who are also parents); empty otherwise.';

-- The class teacher of the student's current section reads that student's
-- links (owner/admin are included in app.can_read_student_private).
drop policy if exists guardian_users_select on public.guardian_users;
create policy guardian_users_select on public.guardian_users
  for select to authenticated
  using (user_id = (select auth.uid())
         or app.can_read_student_private(workspace_id, student_id));

-- ---------------------------------------------------------------------
-- 2. invite_guardian: owner/admin, or the class teacher of the student's
--    current section. Otherwise identical to 20260926065723.
-- ---------------------------------------------------------------------
create or replace function public.invite_guardian(p_workspace_id uuid, p_guardian_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_guardian public.guardians;
  v_token    text;
  v_id       uuid;
  v_expires  timestamptz := now() + interval '30 days';
begin
  if v_uid is null or not app.has_role(p_workspace_id, array['owner', 'admin', 'teacher']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select g.* into v_guardian
    from public.guardians g
    join public.students st on st.id = g.student_id and st.deleted_at is null
   where g.id = p_guardian_id and g.workspace_id = p_workspace_id;
  if not found then
    raise exception 'GUARDIAN_NOT_FOUND' using errcode = '22023';
  end if;

  -- D-109: a teacher only for a student of the section they are class
  -- teacher of this year.
  if not app.can_read_student_private(p_workspace_id, v_guardian.student_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if exists (select 1 from public.guardian_users gu
              where gu.guardian_id = p_guardian_id and gu.status = 'active') then
    raise exception 'GUARDIAN_ALREADY_LINKED' using errcode = '22023';
  end if;

  -- ponytail: a per-school hourly count over the invitations index; a
  -- per-user bucket in auth_throttle if one admin must not starve another.
  if (select count(*) from public.workspace_invitations i
       where i.workspace_id = p_workspace_id and i.role = 'parent'
         and i.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'RATE_LIMITED' using errcode = '54000';
  end if;

  -- A new link replaces the old one: only the latest link works.
  update public.workspace_invitations
     set status = 'revoked', revoked_at = now(), revoked_by = v_uid
   where guardian_id = p_guardian_id and status = 'pending';

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.workspace_invitations
    (workspace_id, channel, phone, role, token_hash, token_prefix, invited_by,
     expires_at, last_sent_at, guardian_id, student_id)
  values
    (p_workspace_id, 'phone', v_guardian.phone, 'parent', app.hash_token(v_token),
     left(v_token, 8), v_uid, v_expires, now(), v_guardian.id, v_guardian.student_id)
  returning id into v_id;

  return jsonb_build_object('invitation_id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

comment on function public.invite_guardian(uuid, uuid) is
  'F-AC-02 Part 4 (D-108, D-109): owner/admin, or the class teacher of the '
  'student''s current section. A single-use guardian link for one child, 30 '
  'days; the raw token is returned once. Raises FORBIDDEN, GUARDIAN_NOT_FOUND, '
  'GUARDIAN_ALREADY_LINKED, RATE_LIMITED; PLAN_READ_ONLY from the table guard.';

-- ---------------------------------------------------------------------
-- revoke_guardian_link: the same rule. Otherwise identical to 20260926065723.
-- ---------------------------------------------------------------------
create or replace function public.revoke_guardian_link(p_workspace_id uuid, p_link_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user    uuid;
  v_student uuid;
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin', 'teacher']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select gu.user_id, gu.student_id into v_user, v_student from public.guardian_users gu
   where gu.id = p_link_id and gu.workspace_id = p_workspace_id;
  if not found then
    raise exception 'LINK_NOT_FOUND' using errcode = '22023';
  end if;
  if not app.can_read_student_private(p_workspace_id, v_student) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.guardian_users
     set status = 'revoked', revoked_at = now()
   where id = p_link_id and status <> 'revoked';

  -- The last link gone: a parent leaves the school too (audited on
  -- workspace_members), so a leaked link keeps no workspace-level reach.
  -- A staff member who was also a parent keeps their staff membership.
  if not exists (select 1 from public.guardian_users gu
                  where gu.workspace_id = p_workspace_id and gu.user_id = v_user
                    and gu.status = 'active') then
    update public.workspace_members set status = 'removed'
     where workspace_id = p_workspace_id and user_id = v_user
       and role = 'parent' and status = 'active';
  end if;
end;
$$;

comment on function public.revoke_guardian_link(uuid, uuid) is
  'F-AC-02 Part 4 (D-108, D-109): owner/admin, or the class teacher of the '
  'student''s current section. Revokes a link to a child and, with a parent''s '
  'last link, their parent membership (a staff membership stays); idempotent, '
  'allowed in a read-only school. Raises FORBIDDEN, LINK_NOT_FOUND.';

-- ---------------------------------------------------------------------
-- accept_guardian_invitation: an active member of any role gets the link
-- and nothing else. Otherwise identical to 20260926065723.
-- ---------------------------------------------------------------------
create or replace function public.accept_guardian_invitation(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_inv    public.workspace_invitations;
  v_member public.workspace_members;
begin
  if v_uid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select i.* into v_inv from public.workspace_invitations i
   where i.token_hash = app.hash_token(p_token) and i.guardian_id is not null
     for update;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = '22023';
  end if;

  -- A double tap by the same person is not an error.
  if v_inv.status = 'accepted' and v_inv.accepted_by = v_uid then
    return jsonb_build_object('workspace_id', v_inv.workspace_id, 'student_id', v_inv.student_id);
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'INVITATION_%', upper(v_inv.status::text) using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.students st
                  where st.id = v_inv.student_id and st.deleted_at is null) then
    raise exception 'INVITATION_NOT_FOUND' using errcode = '22023';
  end if;

  -- D-301: a verified invitee may not join a read-only school.
  if exists (select 1 from public.workspaces w
              where w.id = v_inv.workspace_id and w.access_mode = 'read_only') then
    raise exception 'PLAN_READ_ONLY'
      using errcode = '42501', detail = 'This workspace is read-only. Ask the owner to upgrade.';
  end if;

  -- One membership per person per school (D-109): an active member of any
  -- role (a parent of a second child, or staff who are also a parent) keeps
  -- theirs unchanged; a removed parent comes back (below, after the link).
  -- A membership that is pending, or removed in a staff role, is refused:
  -- a link never reactivates or re-roles anyone.
  select m.* into v_member from public.workspace_members m
   where m.workspace_id = v_inv.workspace_id and m.user_id = v_uid;
  if found and v_member.status <> 'active'
     and not (v_member.role = 'parent' and v_member.status = 'removed') then
    raise exception 'MEMBERSHIP_CONFLICT' using errcode = '22023';
  end if;
  if not found then
    insert into public.workspace_members
      (workspace_id, user_id, role, status, invitation_id, invited_by, joined_at, created_by)
    values
      (v_inv.workspace_id, v_uid, 'parent', 'active', v_inv.id, v_inv.invited_by, now(), v_uid);
  end if;

  insert into public.guardian_users
    (workspace_id, guardian_id, student_id, user_id, status, invited_at, accepted_at,
     created_by, invitation_id)
  values
    (v_inv.workspace_id, v_inv.guardian_id, v_inv.student_id, v_uid, 'active',
     v_inv.created_at, now(), v_inv.invited_by, v_inv.id)
  on conflict (guardian_id, user_id) do update
    set status = 'active', accepted_at = now(), revoked_at = null,
        invitation_id = excluded.invitation_id;

  update public.workspace_invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_inv.id;

  -- A returning parent: app.tg_workspace_members_guard accepts this one
  -- self-reactivation because the guardian invitation named here was
  -- accepted by them in this same transaction (accepted_at = now()).
  if v_member.id is not null and v_member.status = 'removed' then
    update public.workspace_members set status = 'active', invitation_id = v_inv.id
     where id = v_member.id;
  end if;

  return jsonb_build_object('workspace_id', v_inv.workspace_id, 'student_id', v_inv.student_id);
end;
$$;

comment on function public.accept_guardian_invitation(text) is
  'F-AC-02 Part 4 (D-108, D-109): signed-in. Accepts a guardian link once, '
  'before it expires: an active guardian_users link to the invitation''s own '
  'student, plus a parent membership for someone not yet in the school (an '
  'active member of any role keeps theirs unchanged). Raises FORBIDDEN, '
  'INVITATION_NOT_FOUND, INVITATION_EXPIRED, INVITATION_ACCEPTED, '
  'INVITATION_REVOKED, INVITATION_DECLINED, MEMBERSHIP_CONFLICT (a pending '
  'or removed staff membership), PLAN_READ_ONLY.';

-- ---------------------------------------------------------------------
-- The members guard: D-108's version plus one removal. A class teacher who
-- revokes a pure parent's last link (above) is not an owner/admin, so the
-- parent membership removal in revoke_guardian_link needs a proof here: the
-- link was revoked in this same transaction and none is left. It never
-- grants or restores anything. Otherwise identical to 20260926065723.
-- ---------------------------------------------------------------------
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
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id
       or new.user_id is distinct from old.user_id then
      raise exception 'workspace_id and user_id are immutable on a membership'
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
    -- school. Only active -> removed, only a parent, nothing else changed,
    -- no active link left. Two proofs, neither reachable by a client: the
    -- UPDATE itself runs inside a SECURITY DEFINER function (current_user
    -- is its owner; a direct PostgREST PATCH runs as 'authenticated'), and
    -- a link of this person was revoked at now() (guardian_users has no
    -- client write grant). It never grants, restores or re-roles anything
    -- and never touches a staff membership.
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
  end if;

  -- ---- authorization: skipped for server-owned paths and platform staff --
  if not (app.is_privileged_context() or app.is_platform_admin() or v_returning or v_unlinked) then

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
    end if;

    if tg_op = 'INSERT'
       and new.role = 'owner'
       and new.user_id is distinct from v_uid
       and v_actor_role is distinct from 'owner' then
      raise exception 'only an owner can add another owner' using errcode = '42501';
    end if;
  end if;

  -- ---- invariant: enforced for EVERY caller, including the server -------
  -- A workspace must always have at least one active owner
  -- (PRODUCT-DECISIONS 1.5: "last owner cannot leave/downgrade").
  if tg_op = 'UPDATE'
     and old.role = 'owner' and old.status = 'active'
     and (new.role <> 'owner' or new.status <> 'active') then
    v_other_owner := app.count_active_owners(new.workspace_id, old.id);
    if v_other_owner = 0 then
      raise exception 'a workspace must always have at least one active owner'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
