-- =====================================================================
-- Security audit Part 2 (D-77): Part 1's hand-ons (L1-L5) and the
-- SECURITY DEFINER sweep. Tests: supabase/tests/25_security_audit_p2.sql.
--
-- Safe to apply live: policy, grant and trigger-function changes only; no
-- table rewrite, no index, no data change. The tables are near-empty in
-- production, and each statement takes only a brief lock.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. files (L5). No app code writes files yet; storage and
--    /api/files/[id] are unbuilt. Server paths (service role, SECURITY
--    DEFINER functions) bypass all of this and keep their own path
--    conventions (receipts/<ws>/..., fees/<ws>/..., F-CM-*). A client
--    write is now held to:
--      * a path under `<workspace_id>/<own uid>/`, so nobody registers
--        a path another uploader or the server will use;
--      * `public` (anon-era marketing assets) only for owners/admins;
--      * no server-owned column: virus_scan_status, download_count,
--        purge_after, deleted_at on insert; bucket/path/owner/size/mime
--        and the rest on update.
--    Public metadata was readable by anon and every signed-in user of
--    any school (original_name can carry a child's name). A public
--    object is served by its storage URL, which needs no row, so the
--    row is now readable by the school's staff only.
-- ---------------------------------------------------------------------
drop policy files_select_public on public.files;

drop policy files_select_member on public.files;
create policy files_select_member on public.files
  for select to authenticated
  using (
    deleted_at is null
    and (
      (visibility in ('workspace', 'public')
        and app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff']))
      or owner_id = (select auth.uid())
      or app.has_role(workspace_id, array['owner', 'admin'])
      or (select app.is_platform_admin())
    )
  );

drop policy files_insert on public.files;
create policy files_insert on public.files
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    and owner_id   = (select auth.uid())
    and created_by = (select auth.uid())
    and starts_with(path, workspace_id::text || '/' || (select auth.uid())::text || '/')
    and (visibility <> 'public' or app.has_role(workspace_id, array['owner', 'admin']))
  );

drop policy files_update on public.files;
create policy files_update on public.files
  for update to authenticated
  using (owner_id = (select auth.uid()) or app.has_role(workspace_id, array['owner', 'admin']))
  with check (
    (owner_id = (select auth.uid()) or app.has_role(workspace_id, array['owner', 'admin']))
    and (visibility <> 'public' or app.has_role(workspace_id, array['owner', 'admin']))
  );

revoke select, insert, update on public.files from anon, authenticated;
grant select on public.files to authenticated;
grant insert (id, workspace_id, owner_id, created_by, bucket, path, original_name, mime_type,
              size_bytes, checksum_sha256, visibility, kind, is_sensitive,
              linked_table, linked_row_id)
  on public.files to authenticated;
grant update (original_name, visibility, kind, is_sensitive, linked_table, linked_row_id)
  on public.files to authenticated;

-- ---------------------------------------------------------------------
-- 2. report_runs (L1). A client could insert a run already `ready`,
--    with any file_id. The render pipeline moves status and sets the
--    file under withServiceRole; the client may send only what
--    createReportRun sends (packages/db/src/repositories/reports.ts).
-- ---------------------------------------------------------------------
revoke insert on public.report_runs from authenticated;
grant insert (id, workspace_id, kind, params, locale, requested_by, idempotency_key)
  on public.report_runs to authenticated;

-- ---------------------------------------------------------------------
-- 3. data_requests (L3). Anyone could file into any school's queue. A
--    school request now needs the requester to belong to that school; an
--    ex-member or a stranger files a platform-level request (workspace_id
--    null), which platform staff triage. The deadline, outcome and file
--    are not client-insertable (due_on is the privacy-notice clock).
-- ---------------------------------------------------------------------
drop policy data_requests_insert on public.data_requests;
create policy data_requests_insert on public.data_requests
  for insert to authenticated
  with check (
    requester_user_id = (select auth.uid())
    and status = 'received'
    and (workspace_id is null or app.member_role(workspace_id) is not null)
  );

revoke insert on public.data_requests from authenticated;
grant insert (workspace_id, requester_user_id, subject_type, subject_id, kind, detail)
  on public.data_requests to authenticated;

-- ---------------------------------------------------------------------
-- 4. workspace_member_capabilities (L4). Any admin could grant or revoke
--    a capability, including for themselves or a peer admin. The first
--    capability is fees.cashier: separation of duties is its point, so
--    capability writes are owner-only.
-- ---------------------------------------------------------------------
drop policy workspace_member_capabilities_write on public.workspace_member_capabilities;
create policy workspace_member_capabilities_write on public.workspace_member_capabilities
  for all to authenticated
  using (app.has_role(workspace_id, array['owner']))
  with check (app.has_role(workspace_id, array['owner']));

-- ---------------------------------------------------------------------
-- 5. workspace_members (L2). A member could PATCH their own joined_at,
--    invited_by, invitation_id, employee_code, label_id. The guard is
--    20260926180341's with two additions, both for direct client writes
--    only (current_user 'authenticated'; SECURITY DEFINER functions run as
--    their owner and keep their own rules):
--      * provenance (joined_at, invited_by, invitation_id, created_by,
--        created_at, removed_at, removed_by) is never client-set; the
--        lifecycle stamps below still set it on activation/removal;
--      * on their own row a member who is not an owner/admin may change
--        phone, department and subjects only.
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
-- 6. SECURITY DEFINER sweep. Every definer function in app/public already
--    pins search_path = '' and none is executable by PUBLIC; anon has
--    only the pre-session surface (12_function_grants_invariant.sql).
--    `app` is not exposed by PostgREST, but D-50 granted all of it to
--    `authenticated`, so any future SECURITY INVOKER wrapper in `public`
--    would hand a caller these writers, which check nothing: any school's
--    audit trail, anyone's inbox, forged consent, any school's document
--    counters, any file's access log. They are only ever called from
--    other definer functions and triggers (running as their owner), so
--    `authenticated` loses them. is_adult has no caller at all.
-- ---------------------------------------------------------------------
revoke execute on function
  app.log_audit_event(text, uuid, text, uuid, jsonb, jsonb, inet, text, uuid,
                      public.audit_actor_kind, uuid, text[], text),
  app.notify(uuid, text, text, text, text, uuid, jsonb, timestamptz),
  app.record_consent(text, text, text, bytea, text, uuid, uuid, uuid, uuid, text, bytea,
                     text, uuid, uuid),
  app.next_id(uuid, text),
  app.log_file_access(uuid, public.file_access_action, inet, text, uuid),
  app.is_adult(uuid)
  from authenticated;
