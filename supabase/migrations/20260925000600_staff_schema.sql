-- =====================================================================
-- F-OP-06 Part 1 — Staff schema, RLS and the compensation split (D-63)
--
-- Built ahead of its M1 1.7 merge slot (ROADMAP order: M1 1.1-1.6 land
-- first) so the branch stays self-contained and rebases cleanly onto them.
--
-- Ships: staff_records, staff_compensation (period-versioned, exclusion
-- constraint, closing trigger), staff_documents, the staff_directory view,
-- app.staff_hourly_rate (point-in-time pay lookup), app.can_open_staff_document
-- (the /api/files/[id] guard for Part 3), the membership<->record status
-- trigger, and default custom_labels seeding for new school workspaces.
--
-- Deliberately NOT in this Part (server actions + UI are Part 2-5):
-- listStaff, createStaffRecord, setStaffCompensation, uploadStaffDocument,
-- offboardings. Their tables (offboardings) are not created here either.
--
-- `staff_code` mirrors `workspace_members.employee_code` in spirit but is a
-- SEPARATE, independent value on this new table (spec F-OP-06 §3.1); this
-- migration does not touch `workspace_members` at all. See DECISION-LOG D-63
-- for why the two are left to coexist rather than reconciled in this Part.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.staff_employment_type as enum
    ('full_time', 'part_time', 'contract', 'substitute', 'volunteer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_status as enum
    ('pending_join', 'active', 'on_notice', 'left');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_document_kind as enum
    ('nid', 'passport', 'degree', 'certificate', 'contract',
     'appointment_letter', 'police_clearance', 'photo', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. staff_records (F-OP-06 §3.1)
-- ---------------------------------------------------------------------
create table if not exists public.staff_records (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces (id) on delete cascade,
  user_id                uuid references public.profiles (id) on delete set null,
  membership_id          uuid references public.workspace_members (id) on delete set null,
  staff_code             text not null,
  full_name              text not null check (length(btrim(full_name)) between 1 and 200),
  designation_label_id   uuid references public.custom_labels (id) on delete set null,
  department             text,
  employment_type        public.staff_employment_type not null default 'full_time',
  employment_status      public.staff_status not null default 'pending_join',
  joined_on              date,
  left_on                date,
  work_email             text,
  work_phone             text,
  personal_phone         text,
  emergency_contact      jsonb not null default '{}'::jsonb,
  blood_group            text,
  date_of_birth          date,
  gender                 text,
  nid_number             text,
  address                text,
  qualifications         jsonb not null default '[]'::jsonb,
  subject_ids            uuid[] not null default '{}',
  notes                  text,
  -- No FK yet: public.applications (F-OP-01, hiring) has not shipped
  -- (M2). Add the reference when it does.
  application_id         uuid,
  employment_history     jsonb not null default '[]'::jsonb,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint staff_records_emergency_contact_is_object
    check (jsonb_typeof(emergency_contact) = 'object'),
  constraint staff_records_qualifications_is_array
    check (jsonb_typeof(qualifications) = 'array'),
  constraint staff_records_employment_history_is_array
    check (jsonb_typeof(employment_history) = 'array'),
  constraint staff_records_left_on_requires_status
    check (left_on is null or employment_status = 'left')
);

comment on table public.staff_records is
  'F-OP-06 §3.1: one row per person who works at the school — the record '
  'admin/owner write and the person themselves partly maintains. Never '
  'deleted; employment_status carries the lifecycle (pending_join -> '
  'active -> on_notice -> left), mirroring workspace_members (D-63).';
comment on column public.staff_records.staff_code is
  'Human-facing code (e.g. TCH-2026-014), unique per workspace. Minted by '
  'app.next_id(workspace_id, ''staff'') when the create-record action ships '
  '(Part 3) — this column only stores it.';
comment on column public.staff_records.subject_ids is
  'What this person CAN teach — distinct from what they are ASSIGNED, which '
  'lives in section_subjects (F-AC-0x, not built yet).';
comment on column public.staff_records.nid_number is
  'Stored whole; app.audit_secret_pattern() drops it from every audit row. '
  'Masked to the last 4 digits in the UI for everyone but owner/admin (Part 3).';
comment on column public.staff_records.application_id is
  'Provenance from an F-OP-01 hire (not built yet, M2) — no FK until that '
  'table exists.';

create unique index if not exists staff_records_workspace_user_key
  on public.staff_records (workspace_id, user_id)
  where user_id is not null;
create unique index if not exists staff_records_workspace_code_key
  on public.staff_records (workspace_id, staff_code);
create index if not exists staff_records_workspace_status_idx
  on public.staff_records (workspace_id, employment_status);
create index if not exists staff_records_workspace_label_idx
  on public.staff_records (workspace_id, designation_label_id);
create index if not exists staff_records_membership_idx
  on public.staff_records (membership_id) where membership_id is not null;

alter table public.staff_records enable row level security;

-- SELECT — owner/admin read every record; a member reads their own
-- (F-OP-06 §3.1, §2 staff.record.view).
create policy staff_records_select on public.staff_records
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or user_id = app.current_user_id()
  );

-- INSERT — owner/admin only. Self-service record creation does not exist
-- (Part 3's createStaffRecord server action is the only writer besides
-- this migration's own hire/invite triggers, which run as SECURITY DEFINER).
create policy staff_records_insert on public.staff_records
  for insert to authenticated
  with check (app.has_role(workspace_id, array['owner', 'admin']));

-- UPDATE — owner/admin may change anything; a member may update their own
-- row too, but app.tg_staff_records_self_update_guard() (below) blocks a
-- non-privileged self-update from touching the employment-admin columns
-- (F-OP-06 §2 footnote 1) — Postgres RLS is row-level, so the column split
-- is enforced by the guard trigger, not by this policy.
create policy staff_records_update_admin on public.staff_records
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

create policy staff_records_update_self on public.staff_records
  for update to authenticated
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

-- No DELETE policy and no grant: rows are never deleted (PRODUCT-DECISIONS 1.14).

grant select, insert, update on public.staff_records to authenticated;

-- Column-scoped self-update guard (F-OP-06 §2 footnote 1): "employment
-- fields (employment_type, designation, joined_on, employment_status) are
-- admin-only even on your own record" — plus the identifiers and the
-- provenance columns, which are never end-user-editable at all. Mirrors
-- app.tg_workspace_members_guard()'s pattern: SECURITY INVOKER, exempting
-- server-owned paths via app.is_privileged_context().
--
-- One narrow additional exception (D-52's pg_trigger_depth() pattern,
-- 20260924010000_tenancy_freeze_cascade_exception.sql): the membership<->
-- record trigger below (app.tg_link_staff_record_on_membership_active(),
-- SECURITY DEFINER, AFTER on workspace_members) issues its own UPDATE
-- against staff_records to flip pending_join -> active on invitation
-- acceptance. That runs with `role` still 'authenticated' — SECURITY
-- DEFINER changes CURRENT_USER, not the `role` GUC is_privileged_context()
-- reads — so without this exception the invitee's own acceptance would trip
-- this very guard on their own record. A direct client UPDATE always runs
-- this trigger at depth 1; the membership trigger's nested UPDATE is
-- already one level deep, so it is observed at depth 2. Depth alone is not
-- the whole guard: requiring the EXACT pending_join -> active transition on
-- top of it means a hypothetical future nested caller still cannot smuggle
-- an arbitrary admin-only change through this door.
create or replace function app.tg_staff_records_self_update_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_admin_only_cols text[] := array[
    'staff_code', 'full_name', 'designation_label_id', 'department',
    'employment_type', 'employment_status', 'joined_on', 'left_on',
    'work_email', 'work_phone', 'subject_ids', 'notes',
    'membership_id', 'user_id', 'application_id', 'employment_history',
    'created_by', 'workspace_id'
  ];
  v_col text;
begin
  if app.is_privileged_context() or app.has_role(new.workspace_id, array['owner', 'admin']) then
    return new;                                   -- server-owned path or admin/owner
  end if;

  if pg_trigger_depth() > 1
     and old.employment_status = 'pending_join'
     and new.employment_status = 'active'
  then
    return new;    -- the membership<->record link trigger's own nested UPDATE
  end if;

  foreach v_col in array v_admin_only_cols loop
    if to_jsonb(old) -> v_col is distinct from to_jsonb(new) -> v_col then
      raise exception 'column % is admin-only, even on your own staff record', v_col
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

comment on function app.tg_staff_records_self_update_guard() is
  'A self-update may only touch contact/emergency/personal fields '
  '(personal_phone, emergency_contact, blood_group, date_of_birth, gender, '
  'nid_number, address, qualifications) — everything else is admin-only, '
  'even on your own record (F-OP-06 §2 footnote 1), except the exact '
  'pending_join -> active transition the membership-link trigger produces '
  '(pg_trigger_depth() > 1, D-52''s pattern).';

drop trigger if exists staff_records_self_update_guard on public.staff_records;
create trigger staff_records_self_update_guard
  before update on public.staff_records
  for each row execute function app.tg_staff_records_self_update_guard();

select app.attach_updated_at('public.staff_records');
select app.attach_freeze_workspace('public.staff_records');
select app.attach_audit('public.staff_records',
                        array[]::text[],
                        array['emergency_contact', 'address', 'notes']);

-- ---------------------------------------------------------------------
-- 3. staff_compensation (F-OP-06 §3.2) — a separate table, deliberately.
--    RLS is row-level, not column-level: putting hourly_rate on
--    staff_records means either everyone with record access reads pay, or
--    a teacher cannot read their own joining date either. This table's
--    policies are owner/admin (+ self-read), full stop.
-- ---------------------------------------------------------------------
create table if not exists public.staff_compensation (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  staff_record_id       uuid not null references public.staff_records (id) on delete cascade,
  hourly_rate_paisa     bigint check (hourly_rate_paisa is null or hourly_rate_paisa >= 0),
  monthly_salary_paisa  bigint check (monthly_salary_paisa is null or monthly_salary_paisa >= 0),
  currency              char(3) not null default 'BDT',
  effective_from        date not null,
  effective_to          date,
  note                  text,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint staff_compensation_effective_range_valid
    check (effective_to is null or effective_to >= effective_from),
  constraint staff_compensation_one_figure
    check (hourly_rate_paisa is not null or monthly_salary_paisa is not null),
  constraint staff_compensation_no_overlap
    exclude using gist (
      staff_record_id with =,
      daterange(effective_from, effective_to, '[]') with &&
    )
);

comment on table public.staff_compensation is
  'F-OP-06 §3.2: period-versioned pay. One row per change; effective_to is '
  'closed by app.tg_close_prior_compensation_period() when a newer row is '
  'inserted. The exclusion constraint (btree_gist) makes "no gaps, no '
  'overlaps" a database guarantee, not an application promise. Read only '
  'through app.staff_hourly_rate() outside owner/admin.';
comment on constraint staff_compensation_no_overlap on public.staff_compensation is
  'One rate in effect per staff record at a time. effective_to is INCLUSIVE '
  '(the last day the rate applied), so a period ending 30 Sep and the next '
  'starting 1 Oct do not overlap.';

create index if not exists staff_compensation_record_from_idx
  on public.staff_compensation (staff_record_id, effective_from desc);

alter table public.staff_compensation enable row level security;

create policy staff_compensation_select on public.staff_compensation
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or exists (
      select 1 from public.staff_records sr
      where sr.id = staff_compensation.staff_record_id
        and sr.user_id = app.current_user_id()
    )
  );

create policy staff_compensation_insert on public.staff_compensation
  for insert to authenticated
  with check (app.has_role(workspace_id, array['owner', 'admin']));

create policy staff_compensation_update on public.staff_compensation
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

-- No DELETE policy and no grant: "it never edits history" (F-OP-06 §3.2).

grant select, insert, update on public.staff_compensation to authenticated;

-- Closes the previously-open period when a later one starts, so the
-- exclusion constraint sees non-overlapping ranges for the common
-- forward-dated case (F-OP-06 §3.2, AC 7). Anything else (a back-dated or
-- genuinely overlapping insert) is left for the exclusion constraint itself
-- to refuse (AC 8) — this trigger only ever narrows an existing open row,
-- never widens or edits a closed one.
create or replace function app.tg_close_prior_compensation_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.staff_compensation
     set effective_to = new.effective_from - 1
   where staff_record_id = new.staff_record_id
     and effective_to is null
     and effective_from < new.effective_from
     and id is distinct from new.id;
  return new;
end;
$$;

drop trigger if exists staff_compensation_close_prior on public.staff_compensation;
create trigger staff_compensation_close_prior
  before insert on public.staff_compensation
  for each row execute function app.tg_close_prior_compensation_period();

select app.attach_freeze_workspace('public.staff_compensation');
select app.attach_audit('public.staff_compensation');

-- app.staff_hourly_rate — the ONLY way a non-owner/admin ever learns a
-- rate (F-OP-06 §3.2, §5.8). SECURITY DEFINER + search_path pinned so it
-- reads staff_compensation on the caller's behalf without granting the
-- caller table access; STABLE so the planner can call it once per row in
-- a loop (F-OP-02's cover engine). Self-check inside the function, not
-- trusted RLS on a join, because the caller here is never the row's own
-- workspace context — just two scalars.
create or replace function app.staff_hourly_rate(p_user_id uuid, p_on_date date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select c.hourly_rate_paisa
  from public.staff_compensation c
  join public.staff_records sr on sr.id = c.staff_record_id
  where sr.user_id = p_user_id
    and c.effective_from <= p_on_date
    and (c.effective_to is null or c.effective_to >= p_on_date)
    and (
      p_user_id = app.current_user_id()
      or app.has_role(sr.workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    )
  order by c.effective_from desc
  limit 1
$$;

comment on function app.staff_hourly_rate(uuid, date) is
  'The rate in force for p_user_id on p_on_date, or null when unset '
  '(F-OP-06 §3.2, §5.8) — never today''s rate applied retroactively. Only '
  'returns a value when the caller is that same user or an active member '
  '(any role) of the staff record''s own workspace; a caller from another '
  'workspace, or with no membership at all, gets null exactly as if the '
  'rate did not exist — never an error that would leak workspace shape.';

revoke all on function app.staff_hourly_rate(uuid, date) from public, anon;
grant execute on function app.staff_hourly_rate(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. staff_documents (F-OP-06 §3.3)
-- ---------------------------------------------------------------------
create table if not exists public.staff_documents (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  staff_record_id uuid not null references public.staff_records (id) on delete cascade,
  kind            public.staff_document_kind not null,
  file_id         uuid not null references public.files (id) on delete cascade,
  label           text,
  issued_on       date,
  expires_on      date,
  verified_by     uuid references public.profiles (id) on delete set null,
  verified_at     timestamptz,
  uploaded_by     uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint staff_documents_verified_pair
    check ((verified_by is null) = (verified_at is null))
);

comment on table public.staff_documents is
  'F-OP-06 §3.3: private-bucket documents against a staff record. Access '
  'through /api/files/[id] guarded by app.can_open_staff_document(), '
  'logged in file_access_log (Part 3).';

create index if not exists staff_documents_record_idx
  on public.staff_documents (staff_record_id);
create index if not exists staff_documents_expiring_idx
  on public.staff_documents (workspace_id, expires_on) where expires_on is not null;
create unique index if not exists staff_documents_file_key
  on public.staff_documents (file_id);

alter table public.staff_documents enable row level security;

-- "owner/admin full; the member may select and insert their own; nobody
-- else, ever" (F-OP-06 §3.3).
create policy staff_documents_select on public.staff_documents
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or exists (
      select 1 from public.staff_records sr
      where sr.id = staff_documents.staff_record_id
        and sr.user_id = app.current_user_id()
    )
  );

create policy staff_documents_insert on public.staff_documents
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    or exists (
      select 1 from public.staff_records sr
      where sr.id = staff_documents.staff_record_id
        and sr.user_id = app.current_user_id()
    )
  );

create policy staff_documents_update_admin on public.staff_documents
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

create policy staff_documents_delete_admin on public.staff_documents
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

grant select, insert, update, delete on public.staff_documents to authenticated;

select app.attach_updated_at('public.staff_documents');
select app.attach_freeze_workspace('public.staff_documents');
select app.attach_audit('public.staff_documents');

-- app.can_open_staff_document — the /api/files/[id] guard (Part 3 wires
-- the route; the function ships now so RLS/grants for the whole feature
-- land together). Mirrors staff_documents_select exactly, as a boolean a
-- route handler can check without needing SELECT on the table itself.
create or replace function app.can_open_staff_document(p_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_documents d
    join public.staff_records sr on sr.id = d.staff_record_id
    where d.file_id = p_file_id
      and (
        app.has_role(d.workspace_id, array['owner', 'admin'])
        or sr.user_id = app.current_user_id()
      )
  )
$$;

comment on function app.can_open_staff_document(uuid) is
  'True when the caller may open p_file_id via /api/files/[id]: owner/admin '
  'of the document''s workspace, or the staff member it belongs to. Nobody '
  'else, ever (F-OP-06 §3.3, AC 14).';

revoke all on function app.can_open_staff_document(uuid) from public, anon;
grant execute on function app.can_open_staff_document(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. staff_directory — the safe subset, readable by every active
--    non-parent member (F-OP-06 §3.1). Postgres RLS is row-level and
--    staff_records_select is owner/admin-or-self only, so this view
--    intentionally runs with the DEFINER's (table owner's) privileges —
--    no security_invoker — and re-implements the wider row check itself
--    via app.has_role(), the same helper every RLS policy in this schema
--    uses. security_barrier stops a future added column's evaluation
--    order from ever leaking a row this predicate would have excluded.
-- ---------------------------------------------------------------------
create or replace view public.staff_directory
with (security_barrier = true)
as
select
  sr.id,
  sr.workspace_id,
  sr.user_id,
  sr.staff_code,
  coalesce(p.full_name, sr.full_name) as full_name,
  p.avatar_url,
  sr.designation_label_id,
  cl.name as designation_label,
  wm.role as base_role,
  sr.department,
  sr.subject_ids,
  sr.work_email,
  sr.work_phone,
  sr.employment_status,
  sr.joined_on
from public.staff_records sr
left join public.profiles p on p.id = sr.user_id
left join public.custom_labels cl on cl.id = sr.designation_label_id
left join public.workspace_members wm on wm.id = sr.membership_id
where app.has_role(sr.workspace_id, array['owner', 'admin', 'teacher', 'staff']);

comment on view public.staff_directory is
  'F-OP-06 §3.1 safe subset: name, label, base role, department, subjects, '
  'work email/phone, status. No compensation, no NID, no documents, no '
  'personal_phone/address/emergency_contact/notes — those stay behind '
  'staff_records_select and are never selected here (AC 1, AC 16).';

revoke all on public.staff_directory from anon, authenticated;
grant select on public.staff_directory to authenticated;

-- ---------------------------------------------------------------------
-- 6. The membership <-> record status trigger (F-OP-06 §5.2)
--    "active requires a linked membership_id with
--    workspace_members.status='active' — a trigger keeps the two in step."
--    Fires on the FIRST-TIME insert too: app.accept_invitation() does
--    INSERT ... ON CONFLICT DO UPDATE, so a brand-new member's very first
--    row is an INSERT with status='active' directly, not an UPDATE.
-- ---------------------------------------------------------------------
create or replace function app.tg_link_staff_record_on_membership_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.staff_records sr
     set membership_id = new.id,
         employment_status = 'active',
         joined_on = coalesce(sr.joined_on, current_date)
   where sr.workspace_id = new.workspace_id
     and sr.user_id = new.user_id
     and sr.employment_status = 'pending_join';
  return new;
end;
$$;

comment on function app.tg_link_staff_record_on_membership_active() is
  'F-OP-06 W2/§5.2: on invitation acceptance (or any transition into an '
  'active membership), links the matching pending_join staff record and '
  'flips it active. A no-op when no such record exists (manual/self-signup '
  'members with no staff record) or the record is already linked.';

drop trigger if exists staff_records_link_on_membership_active on public.workspace_members;
create trigger staff_records_link_on_membership_active
  after insert or update of status on public.workspace_members
  for each row
  when (new.status = 'active')
  execute function app.tg_link_staff_record_on_membership_active();

-- ---------------------------------------------------------------------
-- 7. custom_labels seeding for new school workspaces (F-OP-06 §3.4).
--    Extends app.tg_workspace_bootstrap() (20260917010100_identity.sql)
--    rather than adding a second AFTER INSERT trigger on workspaces, so
--    the owner membership, school_profiles row and these ten labels all
--    land in the same transaction as the workspace itself.
-- ---------------------------------------------------------------------
create or replace function app.tg_workspace_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members
    (workspace_id, user_id, role, status, joined_at, created_by)
  values
    (new.id, new.owner_id, 'owner', 'active', now(), new.owner_id)
  on conflict (workspace_id, user_id) do update
    set role = 'owner', status = 'active', joined_at = coalesce(workspace_members.joined_at, now());

  if new.type = 'school' then
    insert into public.school_profiles (workspace_id)
    values (new.id)
    on conflict (workspace_id) do nothing;

    -- Seeded defaults (F-OP-06 §3.4). base_role carries permissions;
    -- these ten rows are display strings and a sort order, nothing more
    -- (PRODUCT-DECISIONS §1.4) — a school is free to rename or delete them.
    insert into public.custom_labels (workspace_id, base_role, name, sort_order, created_by)
    values
      (new.id, 'admin',   'Principal',          0, new.owner_id),
      (new.id, 'admin',   'Vice-Principal',     1, new.owner_id),
      (new.id, 'admin',   'Coordinator',        2, new.owner_id),
      (new.id, 'teacher', 'Head Teacher',       0, new.owner_id),
      (new.id, 'teacher', 'Senior Teacher',     1, new.owner_id),
      (new.id, 'teacher', 'Assistant Teacher',  2, new.owner_id),
      (new.id, 'staff',   'Office Assistant',   0, new.owner_id),
      (new.id, 'staff',   'Accountant',         1, new.owner_id),
      (new.id, 'staff',   'Librarian',          2, new.owner_id),
      (new.id, 'parent',  'Guardian',           0, new.owner_id)
    on conflict (workspace_id, lower(name)) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. audit_action_catalog rows for the three new generic-audit tables.
--    Not appended to 20260924000100_audit_substrate.sql's own v_tables
--    array (an already-applied migration is never edited) — the same
--    generic <table>.insert|update|delete shape, inserted directly.
--    check-audit-catalog-parity.mjs (contracts CI) now scans every
--    migration's v_tables array, this one included, and expects
--    GENERIC_AUDIT_TABLES in packages/domain/src/audit/catalog.ts to list
--    the same three tables (this migration's companion TS change).
-- ---------------------------------------------------------------------
do $$
declare
  v_table  text;
  v_tables text[] := array['staff_records', 'staff_compensation', 'staff_documents'];
begin
  foreach v_table in array v_tables loop
    insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
    values
      (v_table || '.insert', 'info',
        '{actor} created a ' || replace(v_table, '_', ' ') || ' record',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড তৈরি করেছেন', true),
      (v_table || '.update', 'notable',
        '{actor} updated a ' || replace(v_table, '_', ' ') || ' record ({fields})',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড হালনাগাদ করেছেন ({fields})', true),
      (v_table || '.delete', 'critical',
        '{actor} deleted a ' || replace(v_table, '_', ' ') || ' record',
        '{actor} একটি ' || replace(v_table, '_', ' ') || ' রেকর্ড মুছে ফেলেছেন', true)
    on conflict (action) do update
      set severity    = excluded.severity,
          sentence_en = excluded.sentence_en,
          sentence_bn = excluded.sentence_bn,
          is_generic  = excluded.is_generic;
  end loop;
end
$$;
