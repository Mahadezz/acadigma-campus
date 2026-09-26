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
  -- theirs. Anyone already in the school in another role (or removed) is
  -- refused rather than silently turned into a parent.
  select m.* into v_member from public.workspace_members m
   where m.workspace_id = v_inv.workspace_id and m.user_id = v_uid;
  if found and not (v_member.role = 'parent' and v_member.status = 'active') then
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
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.guardian_users
     set status = 'revoked', revoked_at = now()
   where id = p_link_id and workspace_id = p_workspace_id and status <> 'revoked';
  if not found and not exists (select 1 from public.guardian_users gu
                                where gu.id = p_link_id and gu.workspace_id = p_workspace_id) then
    raise exception 'LINK_NOT_FOUND' using errcode = '22023';
  end if;
end;
$$;

comment on function public.revoke_guardian_link(uuid, uuid) is
  'F-AC-02 Part 4 (D-108): owner/admin. Revokes a parent''s link to a child; '
  'idempotent. Raises FORBIDDEN, LINK_NOT_FOUND; PLAN_READ_ONLY from the '
  'table guard.';

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
