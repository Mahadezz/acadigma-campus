-- =====================================================================
-- F-AC-01 demo cut — sections and the subject catalogue (D-102).
--
-- Builds on grade_levels / academic_years (20260925300101, D-100).
-- DATA-MODEL.md §2 shapes, class T2 RLS (read: owner/admin/teacher/staff;
-- write: owner/admin), the standard trigger set (tenant freeze,
-- updated_at, generic audit + catalogue rows, require_writable, immutable
-- created_by).
--
-- Cross-tenant references are impossible by construction: every foreign
-- key into another tenant table is composite with workspace_id, so a
-- section can only point at a year, grade and class teacher of its own
-- school.
-- =====================================================================

do $$ begin
  create type public.subject_category as enum ('core', 'optional', 'religion', 'co_curricular');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subject_kind as enum ('compulsory', 'optional_fourth');
exception when duplicate_object then null; end $$;

comment on type public.subject_kind is
  'DATA-MODEL.md §2: the Bangladesh fourth-subject rule. optional_fourth is '
  'the catalogue default; section_subjects (later Part) may override it.';

-- Targets for the composite foreign keys below.
alter table public.academic_years
  add constraint academic_years_id_workspace_key unique (id, workspace_id);
alter table public.grade_levels
  add constraint grade_levels_id_workspace_key unique (id, workspace_id);
alter table public.workspace_members
  add constraint workspace_members_id_workspace_key unique (id, workspace_id);

-- ---------------------------------------------------------------------
-- sections — "Class 6 – A", the homeroom, one per (year, grade, name)
-- ---------------------------------------------------------------------
create table if not exists public.sections (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  academic_year_id uuid not null,
  grade_level_id   uuid not null,
  name             text not null check (length(btrim(name)) between 1 and 20),
  class_teacher_id uuid,
  room             text check (room is null or length(btrim(room)) between 1 and 40),
  capacity         smallint check (capacity is null or capacity between 1 and 500),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null,
  constraint sections_academic_year_fkey
    foreign key (academic_year_id, workspace_id) references public.academic_years (id, workspace_id),
  constraint sections_grade_level_fkey
    foreign key (grade_level_id, workspace_id) references public.grade_levels (id, workspace_id),
  constraint sections_class_teacher_fkey
    foreign key (class_teacher_id, workspace_id) references public.workspace_members (id, workspace_id)
    on delete set null (class_teacher_id)
);

comment on table public.sections is
  'F-AC-01 / DATA-MODEL.md §2: a homeroom ("Class 6 – A") in one academic '
  'year. Archived, never deleted once used. Display name comes from '
  'packages/domain sectionDisplayName, never built per screen.';

create unique index if not exists sections_year_grade_name_key
  on public.sections (workspace_id, academic_year_id, grade_level_id, lower(name));
-- justification: tenant key + natural key; also serves "sections of a grade".
create unique index if not exists sections_one_class_teacher_per_year
  on public.sections (academic_year_id, class_teacher_id)
  where class_teacher_id is not null and archived_at is null;
-- justification: F-AC-01 §5 rule 10, a member is class teacher of at most one
-- live section per year.
create index if not exists sections_class_teacher_idx
  on public.sections (workspace_id, class_teacher_id) where class_teacher_id is not null;
-- justification: "my sections" for a teacher; FK column.
create index if not exists sections_grade_level_idx on public.sections (grade_level_id);
create index if not exists sections_created_by_idx
  on public.sections (created_by) where created_by is not null;
-- justification: FK columns.

-- F-AC-01 §5 rule 9: a class teacher is an ACTIVE owner/admin/teacher.
create or replace function app.tg_sections_class_teacher_eligible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.class_teacher_id is not null
     and not exists (
       select 1 from public.workspace_members m
        where m.id = new.class_teacher_id
          and m.status = 'active'
          and m.role in ('owner', 'admin', 'teacher')) then
    raise exception 'MEMBER_NOT_ELIGIBLE' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger sections_class_teacher_eligible
  before insert or update of class_teacher_id on public.sections
  for each row execute function app.tg_sections_class_teacher_eligible();

-- ---------------------------------------------------------------------
-- subjects — the school's catalogue
-- ---------------------------------------------------------------------
create table if not exists public.subjects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 80),
  name_bn      text check (name_bn is null or length(btrim(name_bn)) between 1 and 80),
  code         text check (code is null or code ~ '^[A-Z0-9-]{1,12}$'),
  category     public.subject_category not null default 'core',
  subject_kind public.subject_kind not null default 'compulsory',
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null
);

comment on table public.subjects is
  'F-AC-01 / DATA-MODEL.md §2: the subject catalogue per school. Seeded from '
  'the NCTB starter list in packages/domain (copied into the tenant, never '
  'referenced across tenants). Archived, never deleted once used.';

create unique index if not exists subjects_workspace_name_key
  on public.subjects (workspace_id, lower(name));
-- justification: DATA-MODEL.md §2 natural key; also makes the seed idempotent.
create unique index if not exists subjects_workspace_code_key
  on public.subjects (workspace_id, code) where code is not null;
-- justification: F-AC-01 §3 unique code per school.
create index if not exists subjects_created_by_idx
  on public.subjects (created_by) where created_by is not null;

-- ---------------------------------------------------------------------
-- Triggers, audit catalogue, RLS (T2), grants
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.sections');
select app.attach_updated_at('public.sections');
select app.attach_audit('public.sections');
select app.attach_require_writable('public.sections');
select app.attach_freeze_workspace('public.subjects');
select app.attach_updated_at('public.subjects');
select app.attach_audit('public.subjects');
select app.attach_require_writable('public.subjects');

create trigger created_by_immutable before update on public.sections
  for each row execute function app.tg_created_by_immutable();
create trigger created_by_immutable before update on public.subjects
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['sections', 'subjects'];
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

alter table public.sections enable row level security;
alter table public.subjects enable row level security;

drop policy if exists sections_select on public.sections;
create policy sections_select on public.sections
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );
drop policy if exists sections_insert on public.sections;
create policy sections_insert on public.sections
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
drop policy if exists sections_update on public.sections;
create policy sections_update on public.sections
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );
drop policy if exists subjects_insert on public.subjects;
create policy subjects_insert on public.subjects
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
drop policy if exists subjects_update on public.subjects;
create policy subjects_update on public.subjects
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

-- Archive-only (F-AC-01 §5 rule 12): no DELETE policy and no DELETE grant.
revoke all on public.sections, public.subjects from anon, authenticated;
grant select, insert, update on public.sections to authenticated;
grant select, insert, update on public.subjects to authenticated;

-- ---------------------------------------------------------------------
-- F-AC-01 §4.5: when a member stops being an active owner/admin/teacher
-- (removed, or moved to staff/parent), they stop being a class teacher.
-- Memberships are never deleted, so the section's FK alone cannot do
-- this, and the eligibility trigger only fires on section writes.
-- ---------------------------------------------------------------------
create or replace function app.tg_members_release_class_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (new.status = 'active' and new.role in ('owner', 'admin', 'teacher')) then
    update public.sections
       set class_teacher_id = null
     where class_teacher_id = new.id
       and archived_at is null;
  end if;
  return new;
end;
$$;

comment on function app.tg_members_release_class_teacher() is
  'F-AC-01 §4.5 (D-102): clears class_teacher_id on live sections when the '
  'member is no longer an active owner/admin/teacher.';

create trigger members_release_class_teacher
  after update of status, role on public.workspace_members
  for each row execute function app.tg_members_release_class_teacher();
