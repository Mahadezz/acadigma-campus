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
alter table public.workspace_invitations
  validate constraint workspace_invitations_label_same_workspace_fkey;
alter table public.workspace_invitations
  drop constraint if exists workspace_invitations_label_id_fkey;
