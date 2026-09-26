-- =====================================================================
-- Security audit Part 1 (D-75): three fixes found auditing main.
-- Tests: supabase/tests/23_security_audit_identity.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles.email and profiles.phone are sign-in identity, not profile
--    text. app.handle_new_user copies them from auth.users;
--    app.current_email() (workspace_invitations_select) and
--    app.accept_invitation trust them. profiles_update_self let a user set
--    them to anything: read someone else's invitations, or squat an address
--    so profiles_email_key blocks its real owner from signing up. Only a
--    privileged (server) context or platform staff may change them now.
-- ---------------------------------------------------------------------
create or replace function app.tg_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() or app.is_platform_admin() then
    return new;
  end if;

  if new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'is_platform_admin can only be changed by platform staff'
      using errcode = '42501';
  end if;

  if new.suspended_at is distinct from old.suspended_at then
    raise exception 'account suspension is a platform action' using errcode = '42501';
  end if;

  if new.email is distinct from old.email or new.phone is distinct from old.phone then
    raise exception 'email and phone come from sign-in and cannot be changed here'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. staff_documents.file_id referenced files(id) alone, so a document
--    could name any school's file, and a teacher's self-upload any
--    colleague's file; app.can_open_staff_document (the /api/files guard)
--    then approved it. The file must be in the document's school, and on
--    the self path it must be the uploader's own file.
-- ---------------------------------------------------------------------
create unique index if not exists files_id_workspace_key on public.files (id, workspace_id);

alter table public.staff_documents
  drop constraint staff_documents_file_id_fkey,
  add constraint staff_documents_file_fkey
    foreign key (file_id, workspace_id) references public.files (id, workspace_id) on delete cascade;

drop policy staff_documents_insert on public.staff_documents;
create policy staff_documents_insert on public.staff_documents
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    or (
      exists (
        select 1 from public.staff_records sr
        where sr.id = staff_documents.staff_record_id
          and sr.user_id = (select app.current_user_id())
      )
      and exists (
        select 1 from public.files f
        where f.id = staff_documents.file_id
          and f.owner_id = (select app.current_user_id())
      )
      and verified_by is null
      and verified_at is null
      and uploaded_by = (select app.current_user_id())
    )
  );

-- ---------------------------------------------------------------------
-- 3. An admin could write an invitation with role = 'owner' (the policies
--    only checked owner-or-admin), and app.accept_invitation then inserts
--    the invitee as an owner: app.tg_workspace_members_guard allows a
--    self-insert as owner. Only an owner may create or set an owner
--    invitation, the same rule the guard applies to adding an owner.
-- ---------------------------------------------------------------------
drop policy workspace_invitations_insert on public.workspace_invitations;
create policy workspace_invitations_insert on public.workspace_invitations
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and (role <> 'owner' or app.has_role(workspace_id, array['owner']))
    and invited_by = (select auth.uid())
    and status = 'pending'
  );

drop policy workspace_invitations_update on public.workspace_invitations;
create policy workspace_invitations_update on public.workspace_invitations
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and (role <> 'owner' or app.has_role(workspace_id, array['owner']))
  );
