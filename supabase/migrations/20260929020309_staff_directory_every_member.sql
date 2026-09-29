-- =====================================================================
-- F-OP-06 Part 2 — Directory + person sheet (D-209)
--
-- Widens `staff_directory` (Part 1, 20260925000900_staff_schema.sql) from
-- "every staff_records row" to "every active non-parent workspace member",
-- LEFT JOINing staff_records instead of starting from it. Part 1's view
-- showed nothing for a member with no staff_records row yet — which is
-- every school's owner on day one (the bootstrap trigger never inserts a
-- staff_records row for them) and any member added before this feature
-- existed. AC1 requires "every active member" and the Part 2 demo requires
-- a brand-new school's directory to show the owner alone — neither held
-- under the Part 1 shape.
--
-- `id` (staff_records.id) is now NULLABLE: a member with no record yet has
-- no staff record to point at. `membership_id` (workspace_members.id) is
-- added as the column that is always present, and is what Part 2's UI
-- routes on. Designation label / department / work phone fall back to the
-- pre-existing workspace_members.label_id/department/phone (F-ID-03) when
-- no staff_records row exists, so a school that has never touched this
-- feature still sees a sensible directory.
--
-- Not touched: staff_records, staff_compensation, staff_documents and
-- their RLS — this migration only replaces one view.
-- =====================================================================

create or replace view public.staff_directory
with (security_barrier = true)
as
select
  -- `create or replace view` may only APPEND columns, never reorder or
  -- rename an existing one (Postgres refuses "cannot change name of view
  -- column ... to ..." otherwise) — every column Part 1 already had stays
  -- in its original position; membership_id is new, so it goes last.
  sr.id,
  wm.workspace_id,
  wm.user_id,
  sr.staff_code,
  coalesce(p.full_name, sr.full_name) as full_name,
  p.avatar_url,
  coalesce(sr.designation_label_id, wm.label_id) as designation_label_id,
  coalesce(cl_sr.name, cl_wm.name) as designation_label,
  wm.role as base_role,
  coalesce(sr.department, wm.department) as department,
  coalesce(sr.subject_ids, '{}') as subject_ids,
  sr.work_email,
  coalesce(sr.work_phone, wm.phone) as work_phone,
  coalesce(sr.employment_status, 'active'::public.staff_status) as employment_status,
  coalesce(sr.joined_on, wm.joined_at::date) as joined_on,
  wm.id as membership_id
from public.workspace_members wm
left join public.staff_records sr
  on sr.workspace_id = wm.workspace_id and sr.user_id = wm.user_id
left join public.profiles p on p.id = wm.user_id
left join public.custom_labels cl_sr on cl_sr.id = sr.designation_label_id
left join public.custom_labels cl_wm on cl_wm.id = wm.label_id
where wm.status = 'active'
  and wm.role in ('owner', 'admin', 'teacher', 'staff')
  and app.has_role(wm.workspace_id, array['owner', 'admin', 'teacher', 'staff']);

comment on view public.staff_directory is
  'F-OP-06 §3.1/Part 2 (D-209) safe subset: every ACTIVE non-parent member, '
  'name, label, base role, department, subjects, work email/phone, status — '
  'whether or not a staff_records row exists yet. No compensation, no NID, '
  'no documents (AC 1, AC 16). membership_id is always present; id '
  '(staff_records.id) is null until a record exists for that member.';

revoke all on public.staff_directory from anon, authenticated;
grant select on public.staff_directory to authenticated;
