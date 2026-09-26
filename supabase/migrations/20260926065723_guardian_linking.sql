-- =====================================================================
-- F-AC-02 Part 4 (demo cut) — guardian linking (D-108). Builds on
-- guardian_users and the parent RLS of 20260926023537_publish_results.sql
-- (D-306) and on F-ID-04's workspace_invitations (token hashing, status
-- lifecycle, expiry) — no second invitation table.
--
--   * workspace_invitations gains guardian_id + student_id: a guardian
--     invitation (role 'parent') names exactly one guardian row and so one
--     child; the composite FK to guardians (id, student_id, workspace_id)
--     makes a link to another student or another school unrepresentable.
--   * public.invite_guardian(ws, guardian) — owner/admin: mints a single-use
--     link (the raw token is returned once, only its SHA-256 is stored),
--     30-day expiry, replaces any earlier pending link for that guardian,
--     60 guardian invitations an hour per school.
--   * public.guardian_invitation_preview(token) — signed-in: what the link is
--     for (school, child) so acceptance is informed; names only while pending.
--   * public.accept_guardian_invitation(token) — signed-in: once, before
--     expiry, creates the parent membership (or reuses an active one) and
--     the active guardian_users link for the invitation's own student only.
--   * public.revoke_guardian_link(ws, link) — owner/admin: status 'revoked';
--     app.is_guardian_of reads status = 'active', so access ends at once.
--   * The last revoked link also removes the parent's membership, and any
--     removal of a membership revokes that person's guardian links. The
--     members guard lets a removed parent reactivate their own membership
--     only inside accept_guardian_invitation (a guardian invitation they
--     accepted in the same transaction), changing nothing else. Parents no longer read workspace-visibility files or usage
--     counters. app.accept_invitation / decline_invitation ignore guardian
--     invitations (PR #78 review).
--   * students gains a parent SELECT policy: a parent reads the rows of
--     their linked children (the public columns; DOB and guardians stay in
--     their private tables).
--
-- Binding (D-108): guardians hold a phone only and sign-in is email and
-- password (phone OTP is F-ID-01 Part 5+), so the link itself is the
-- credential — whoever holds it may accept, like a join code, but only for
-- one child, once, within 30 days. The school sees which account accepted
-- and can revoke. When phone OTP ships, bind guardian invitations to the
-- verified phone.
-- =====================================================================

alter table public.workspace_invitations
  add column guardian_id uuid,
  add column student_id  uuid,
  add constraint workspace_invitations_guardian_fkey
    foreign key (guardian_id, student_id, workspace_id)
    references public.guardians (id, student_id, workspace_id) on delete cascade,
  add constraint workspace_invitations_guardian_pair
    check ((guardian_id is null) = (student_id is null)),
  add constraint workspace_invitations_parent_is_guardian
    check ((role = 'parent') = (guardian_id is not null));

comment on column public.workspace_invitations.guardian_id is
  'F-AC-02 Part 4 (D-108): set on a guardian invitation (role parent). '
  'Accepting links the account to this guardian''s student and nothing else.';

create index if not exists workspace_invitations_guardian_pending_idx
  on public.workspace_invitations (guardian_id) where status = 'pending';
-- justification: invite_guardian revokes the guardian's earlier pending link;
-- also covers the FK's leading column for the guardians cascade.

alter table public.guardian_users
  add column invitation_id uuid references public.workspace_invitations (id) on delete set null;

create index if not exists guardian_users_invitation_idx
  on public.guardian_users (invitation_id) where invitation_id is not null;
-- justification: FK column.

-- ---------------------------------------------------------------------
-- public.invite_guardian
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
  if v_uid is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select g.* into v_guardian
    from public.guardians g
    join public.students st on st.id = g.student_id and st.deleted_at is null
   where g.id = p_guardian_id and g.workspace_id = p_workspace_id;
  if not found then
    raise exception 'GUARDIAN_NOT_FOUND' using errcode = '22023';
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
  'F-AC-02 Part 4 (D-108): owner/admin. A single-use guardian link for one '
  'child, 30 days; the raw token is returned once. Raises FORBIDDEN, '
  'GUARDIAN_NOT_FOUND, GUARDIAN_ALREADY_LINKED, RATE_LIMITED; PLAN_READ_ONLY '
  'from the table guard.';

revoke all on function public.invite_guardian(uuid, uuid) from public, anon;
grant execute on function public.invite_guardian(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- public.guardian_invitation_preview
-- ---------------------------------------------------------------------
create or replace function public.guardian_invitation_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv    public.workspace_invitations;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select i.* into v_inv from public.workspace_invitations i
   where i.token_hash = app.hash_token(p_token) and i.guardian_id is not null;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = '22023';
  end if;

  v_status := case when v_inv.status = 'pending' and v_inv.expires_at <= now()
                   then 'expired' else v_inv.status::text end;
  if v_status <> 'pending' then
    return jsonb_build_object('status', v_status,
      'accepted_by_me', v_inv.accepted_by is not distinct from auth.uid());
  end if;

  return (select jsonb_build_object(
                   'status', 'pending',
                   'school_name', w.name,
                   'student_name', st.full_name,
                   'student_name_bn', st.full_name_bn,
                   'relation', g.relation,
                   'expires_at', v_inv.expires_at)
            from public.workspaces w, public.students st, public.guardians g
           where w.id = v_inv.workspace_id and st.id = v_inv.student_id
             and g.id = v_inv.guardian_id);
end;
$$;

comment on function public.guardian_invitation_preview(text) is
  'F-AC-02 Part 4 (D-108): signed-in. The school and child a guardian link '
  'is for, so the accept screen names them; only the status once it is no '
  'longer pending. Raises FORBIDDEN, INVITATION_NOT_FOUND.';

revoke all on function public.guardian_invitation_preview(text) from public, anon;
grant execute on function public.guardian_invitation_preview(text) to authenticated;

-- ---------------------------------------------------------------------
-- public.accept_guardian_invitation
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

  -- One membership per person per school: a parent of a second child keeps
  -- theirs, and a removed parent comes back (below, after the link). Anyone in the school in another role is refused rather than
  -- silently turned into a parent.
  select m.* into v_member from public.workspace_members m
   where m.workspace_id = v_inv.workspace_id and m.user_id = v_uid;
  if found and not (v_member.role = 'parent' and v_member.status in ('active', 'removed')) then
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
  'F-AC-02 Part 4 (D-108): signed-in. Accepts a guardian link once, before it '
  'expires: an active parent membership and an active guardian_users link to '
  'the invitation''s own student. Raises FORBIDDEN, INVITATION_NOT_FOUND, '
  'INVITATION_EXPIRED, INVITATION_ACCEPTED, INVITATION_REVOKED, '
  'INVITATION_DECLINED, MEMBERSHIP_CONFLICT, PLAN_READ_ONLY.';

revoke all on function public.accept_guardian_invitation(text) from public, anon;
grant execute on function public.accept_guardian_invitation(text) to authenticated;

-- ---------------------------------------------------------------------
-- public.revoke_guardian_link
-- ---------------------------------------------------------------------
create or replace function public.revoke_guardian_link(p_workspace_id uuid, p_link_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select gu.user_id into v_user from public.guardian_users gu
   where gu.id = p_link_id and gu.workspace_id = p_workspace_id;
  if not found then
    raise exception 'LINK_NOT_FOUND' using errcode = '22023';
  end if;
  update public.guardian_users
     set status = 'revoked', revoked_at = now()
   where id = p_link_id and status <> 'revoked';

  -- The last link gone: the parent leaves the school too (audited on
  -- workspace_members), so a leaked link keeps no workspace-level reach.
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
  'F-AC-02 Part 4 (D-108): owner/admin. Revokes a parent''s link to a child '
  'and, with their last link, their parent membership; idempotent, and allowed '
  'in a read-only school (removing access). Raises FORBIDDEN, LINK_NOT_FOUND.';

revoke all on function public.revoke_guardian_link(uuid, uuid) from public, anon;
grant execute on function public.revoke_guardian_link(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- students: a parent reads their linked children
-- ---------------------------------------------------------------------
drop policy if exists students_select_guardian on public.students;
create policy students_select_guardian on public.students
  for select to authenticated
  using (deleted_at is null
         and app.has_role(workspace_id, array['parent'])
         and app.is_guardian_of(id));

-- ---------------------------------------------------------------------
-- Parents never see the school's internal files or its plan usage (lead
-- decision, PR #78 review). The school's name, profile and calendar stay
-- readable to an active parent.
-- ---------------------------------------------------------------------
drop policy if exists files_select_member on public.files;
create policy files_select_member on public.files
  for select to authenticated
  using (
    deleted_at is null
    and (
      (visibility = 'workspace' and app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff']))
      or owner_id = (select auth.uid())
      or app.has_role(workspace_id, array['owner', 'admin'])
      or (select app.is_platform_admin())
    )
  );

drop policy if exists usage_counters_select on public.usage_counters;
create policy usage_counters_select on public.usage_counters
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );

-- ---------------------------------------------------------------------
-- A guardian invitation is accepted or declined only through the guardian
-- path (PR #78 review): the member functions ignore it. Otherwise identical
-- to 20260925300201_readonly_join_check.sql / 20260917010100_identity.sql.
-- ---------------------------------------------------------------------
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
     and i.guardian_id is null
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

create or replace function app.decline_invitation(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inv public.workspace_invitations;
begin
  select * into v_inv from public.workspace_invitations i
   where i.token_hash = app.hash_token(p_token) and i.status = 'pending'
     and i.guardian_id is null
     for update;
  if not found then
    raise exception 'invitation not found' using errcode = '22023';
  end if;
  update public.workspace_invitations
     set status = 'declined', declined_at = now()
   where id = v_inv.id;
end;
$$;

-- ---------------------------------------------------------------------
-- The members guard (PR #78 security re-check). A member may never change
-- their own role or status, with one exception: a removed parent returning
-- through accept_guardian_invitation. The exception needs a guardian
-- invitation naming this membership (invitation_id) that this person
-- accepted in this same transaction (accepted_at = now(), the transaction's
-- start), and allows no other column to change. Invitations are written
-- only by SECURITY DEFINER functions, and a PostgREST PATCH is its own
-- transaction, so a direct self-update can never satisfy it.
-- (app.is_privileged_context() reads the `role` setting, which a SECURITY
-- DEFINER function does not change, so it does not cover this path.)
-- Otherwise identical to 20260917010100_identity.sql.
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
  end if;

  -- ---- authorization: skipped for server-owned paths and platform staff --
  if not (app.is_privileged_context() or app.is_platform_admin() or v_returning) then

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

-- ---------------------------------------------------------------------
-- Removing a membership, by any path (the members screen, leaving,
-- revoke_guardian_link), revokes that person's guardian links in the
-- school, so a removed parent keeps no path to a child's results.
-- ---------------------------------------------------------------------
create or replace function app.tg_members_revoke_guardian_links()
returns trigger
language plpgsql
security definer   -- guardian_users has no client write grant
set search_path = ''
as $$
begin
  update public.guardian_users gu
     set status = 'revoked', revoked_at = now()
   where gu.workspace_id = new.workspace_id
     and gu.user_id = new.user_id
     and gu.status = 'active';
  return null;
end;
$$;

revoke all on function app.tg_members_revoke_guardian_links() from public, anon, authenticated;

drop trigger if exists workspace_members_revoke_guardian_links on public.workspace_members;
create trigger workspace_members_revoke_guardian_links
  after update of status on public.workspace_members
  for each row
  when (new.status = 'removed' and old.status is distinct from 'removed')
  execute function app.tg_members_revoke_guardian_links();

-- ---------------------------------------------------------------------
-- app.tg_require_writable: revoking a guardian link is removing access, so
-- it is allowed in a read-only school like a member removal (D-300); the
-- trigger above depends on it. Otherwise identical to
-- 20260926021923_section_subjects.sql.
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
