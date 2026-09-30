-- =====================================================================
-- F-ID-03 Part 6 review (D-111) · A label reference must stay in its school
-- ---------------------------------------------------------------------
-- workspace_members.label_id, staff_records.designation_label_id and
-- workspace_invitations.label_id were plain FKs to custom_labels(id), so
-- only application code checked that the label belonged to the same
-- school. An owner/admin of school A could PATCH label_id to school B's
-- label uuid straight through PostgREST (their own UPDATE policy passes);
-- staff_directory (a definer view) would then print B's label name in A,
-- and B deleting that label would change A's rows.
--
-- The fix is structural: each reference becomes a composite FK
-- (workspace_id, label_id) -> custom_labels(workspace_id, id), so a label
-- from another school cannot be referenced at all. On delete keeps its
-- existing behaviour — only the label column is nulled
-- (`on delete set null (col)`, Postgres 15+), never workspace_id.
-- Added NOT VALID then VALIDATEd (the validate scan takes a weaker lock);
-- the old single-column FKs are then dropped as redundant.
-- Before each VALIDATE, any existing cross-school reference (possible
-- before this migration via app.create_invitation's unchecked p_label_id or
-- a direct PostgREST write) is set to null, so the deploy cannot fail on
-- old data.
--
-- Also carries the review change to public.update_member_staff_fields
-- (generation skips codes already taken): 20260929065654 was already
-- pushed and applied by CI, so it is not edited in place.
-- =====================================================================

-- the composite FK target
alter table public.custom_labels
  add constraint custom_labels_workspace_id_id_key unique (workspace_id, id);

-- workspace_members.label_id
alter table public.workspace_members
  add constraint workspace_members_label_same_workspace_fkey
  foreign key (workspace_id, label_id)
  references public.custom_labels (workspace_id, id)
  on delete set null (label_id)
  not valid;
-- deploy safety: null any pre-existing cross-school reference so VALIDATE
-- cannot fail; same-school references are untouched.
update public.workspace_members set label_id = null
 where label_id is not null
   and not exists (select 1 from public.custom_labels l
                    where l.id = workspace_members.label_id
                      and l.workspace_id = workspace_members.workspace_id);
alter table public.workspace_members
  validate constraint workspace_members_label_same_workspace_fkey;
alter table public.workspace_members
  drop constraint if exists workspace_members_label_id_fkey;

-- staff_records.designation_label_id
alter table public.staff_records
  add constraint staff_records_designation_label_same_workspace_fkey
  foreign key (workspace_id, designation_label_id)
  references public.custom_labels (workspace_id, id)
  on delete set null (designation_label_id)
  not valid;
-- deploy safety: null any pre-existing cross-school reference so VALIDATE
-- cannot fail; same-school references are untouched.
update public.staff_records set designation_label_id = null
 where designation_label_id is not null
   and not exists (select 1 from public.custom_labels l
                    where l.id = staff_records.designation_label_id
                      and l.workspace_id = staff_records.workspace_id);
alter table public.staff_records
  validate constraint staff_records_designation_label_same_workspace_fkey;
alter table public.staff_records
  drop constraint if exists staff_records_designation_label_id_fkey;

-- workspace_invitations.label_id (same bug class: an invitation carries the
-- label the joiner will get)
alter table public.workspace_invitations
  add constraint workspace_invitations_label_same_workspace_fkey
  foreign key (workspace_id, label_id)
  references public.custom_labels (workspace_id, id)
  on delete set null (label_id)
  not valid;
-- deploy safety: null any pre-existing cross-school reference so VALIDATE
-- cannot fail; same-school references are untouched.
update public.workspace_invitations set label_id = null
 where label_id is not null
   and not exists (select 1 from public.custom_labels l
                    where l.id = workspace_invitations.label_id
                      and l.workspace_id = workspace_invitations.workspace_id);
alter table public.workspace_invitations
  validate constraint workspace_invitations_label_same_workspace_fkey;
alter table public.workspace_invitations
  drop constraint if exists workspace_invitations_label_id_fkey;

-- update_member_staff_fields: a blank save skips generated codes already
-- taken. Grants and comment from 20260929065654 carry over (same signature).
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
