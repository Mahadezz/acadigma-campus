-- =====================================================================
-- F-ID-03 Part 6 (D-111) · Member staff fields with employee-code generation
-- ---------------------------------------------------------------------
-- Role changes, label assignment and custom-label CRUD are all plain
-- writes under the policies and triggers that already exist:
--   * changeMemberRole / assignMemberLabel  -> UPDATE workspace_members
--     (workspace_members_update_admin + app.tg_workspace_members_guard).
--   * custom_labels CRUD                     -> INSERT/UPDATE/DELETE
--     (custom_labels_insert/update/delete, owner/admin).
-- None of those need a definer.
--
-- Staff fields DO need one, for one reason: the employee code is generated
-- by app.next_id(workspace_id, 'staff') (-> TCH-2026-0001), and app.next_id
-- lives in the `app` schema, which PostgREST does not expose (D-50). So the
-- one write that must both call app.next_id and update the row runs here,
-- as a SECURITY DEFINER function reachable from supabase-js. The UPDATE it
-- issues still fires app.tg_workspace_members_guard (immutability, the
-- self-edit ban) and app.tg_require_writable (read-only plans), because a
-- definer function is not a privileged context.
--
-- The code is generated only when the field is left blank AND the member has
-- none yet (F-ID-03 §5 "generated on first save when blank"); a blank field
-- for a member who already has a code keeps it, so an edit of department or
-- phone never silently drops the code.
-- =====================================================================

create or replace function public.update_member_staff_fields(
  p_workspace_id  uuid,
  p_member_id     uuid,
  p_employee_code text default null,
  p_department    text default null,
  p_phone         text default null)
returns table (
  id            uuid,
  employee_code text,
  department    text,
  phone         text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existing text;
  v_role     public.member_role;
  v_code     text := nullif(btrim(coalesce(p_employee_code, '')), '');
begin
  if not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Parents are managed per child, never as staff (D-108); they are not on
  -- this screen, so a parent id here is treated as "no such member".
  select m.employee_code, m.role
    into v_existing, v_role
    from public.workspace_members m
   where m.id = p_member_id
     and m.workspace_id = p_workspace_id
     and m.role <> 'parent';
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- blank + has a code -> keep it; blank + no code yet -> generate the next
  -- code nobody in this school holds. A hand-typed code in the generated
  -- shape (TCH-2026-0005) would otherwise collide with a later generated
  -- one and fail a blank save as "code taken", so taken numbers are skipped.
  -- ponytail: one probe per taken code; fine for hand-typed collisions.
  if v_code is null then
    v_code := v_existing;
  end if;
  while v_code is null loop
    v_code := app.next_id(p_workspace_id, 'staff');
    if exists (select 1 from public.workspace_members t
                where t.workspace_id = p_workspace_id
                  and t.employee_code = v_code) then
      v_code := null;
    end if;
  end loop;

  return query
  update public.workspace_members m
     set employee_code = v_code,
         department    = nullif(btrim(coalesce(p_department, '')), ''),
         phone         = nullif(btrim(coalesce(p_phone, '')), ''),
         updated_at    = now()
   where m.id = p_member_id
     and m.workspace_id = p_workspace_id
  returning m.id, m.employee_code, m.department, m.phone;
end;
$$;

comment on function public.update_member_staff_fields(uuid, uuid, text, text, text) is
  'F-ID-03 Part 6 (D-111): an owner or admin sets a member''s staff fields '
  '(employee code, department, work phone). A blank employee code is generated '
  'from app.next_id(workspace_id, ''staff'') only when the member has none. '
  'Raises FORBIDDEN (42501), MEMBER_NOT_FOUND (P0002); a duplicate employee '
  'code surfaces as unique_violation (23505).';

revoke all on function public.update_member_staff_fields(uuid, uuid, text, text, text)
  from public, anon;
grant execute on function public.update_member_staff_fields(uuid, uuid, text, text, text)
  to authenticated;
