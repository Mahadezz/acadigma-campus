-- =====================================================================
-- F-AC-06 Part 2 (demo cut) — exams and papers (D-303)
-- ---------------------------------------------------------------------
-- Builds on grade_scales (20260925300302, D-302) and sections/subjects
-- (20260925300203, D-102). Demo-cut shape, recorded in D-303:
--   - No `terms` table exists yet, so an exam has no term_id; `exam_type`
--     (midterm, term_final, annual, ...) says which part of the year it is.
--   - No `section_subjects` exists yet, so papers are created for the
--     subjects the admin picks, in every section the exam covers
--     (exam_subjects = exam x section x subject).
--   - The grading policy is SNAPSHOTTED on the exam at creation
--     (grading_snapshot: the scale's bands, pass mark, F-zeroes-GPA, the
--     year's 4th-subject threshold) by a trigger — never client-supplied,
--     never changed afterwards — so editing the scale in June cannot touch
--     March's exam (§5.2). This is the snapshot D-302 deferred to Part 2.
--   - Status moves only along §5.12's chain, one step at a time; the two
--     admin reversals need a reason. Enforced here and in the domain.
--   - Components (Written/MCQ split), exam dates on a calendar and the
--     question-paper upload are later Parts.
-- Every FK into another tenant table is composite with workspace_id.
-- =====================================================================

do $$ begin
  create type public.exam_type as enum
    ('class_test', 'midterm', 'term_final', 'annual', 'model_test', 'practical', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.exam_status as enum
    ('draft', 'scheduled', 'in_progress', 'marks_entry', 'marks_locked', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.exam_subject_status as enum ('pending', 'entering', 'submitted', 'locked');
exception when duplicate_object then null; end $$;

alter table public.sections
  add constraint sections_id_workspace_key unique (id, workspace_id);
alter table public.subjects
  add constraint subjects_id_workspace_key unique (id, workspace_id);

-- ---------------------------------------------------------------------
-- exams
-- ---------------------------------------------------------------------
create table if not exists public.exams (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  academic_year_id uuid not null,
  name             text not null check (length(btrim(name)) between 1 and 120),
  exam_type        public.exam_type not null,
  starts_on        date,
  ends_on          date,
  status           public.exam_status not null default 'draft',
  status_reason    text check (status_reason is null or length(btrim(status_reason)) between 1 and 500),
  grade_scale_id   uuid,
  grading_snapshot jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null,
  constraint exams_id_workspace_key unique (id, workspace_id),
  constraint exams_dates_valid check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint exams_academic_year_fkey
    foreign key (academic_year_id, workspace_id) references public.academic_years (id, workspace_id),
  constraint exams_grade_scale_fkey
    foreign key (grade_scale_id, workspace_id) references public.grade_scales (id, workspace_id)
);

comment on table public.exams is
  'F-AC-06 §3 (demo cut, D-303): one exam event in an academic year. '
  'grading_snapshot is written by app.tg_exams_snapshot_grading at insert and '
  'is immutable; status follows §5.12 (app.tg_exams_status_guard).';

create unique index if not exists exams_year_name_key
  on public.exams (workspace_id, academic_year_id, lower(name));
-- justification: NAME_TAKEN (§7 createExam); also serves the year's exam list.
create index if not exists exams_workspace_status_idx on public.exams (workspace_id, status);
-- justification: spec §3 — list/filter by status.
create index if not exists exams_grade_scale_idx on public.exams (grade_scale_id);
create index if not exists exams_created_by_idx on public.exams (created_by) where created_by is not null;
-- justification: FK columns.

-- ---------------------------------------------------------------------
-- exam_sections — which sections sit the exam
-- ---------------------------------------------------------------------
create table if not exists public.exam_sections (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  exam_id      uuid not null,
  section_id   uuid not null,
  created_at   timestamptz not null default now(),
  constraint exam_sections_exam_section_key unique (exam_id, section_id),
  constraint exam_sections_exam_fkey
    foreign key (exam_id, workspace_id) references public.exams (id, workspace_id) on delete cascade,
  constraint exam_sections_section_fkey
    foreign key (section_id, workspace_id) references public.sections (id, workspace_id)
);

create index if not exists exam_sections_section_idx on public.exam_sections (section_id);
create index if not exists exam_sections_workspace_idx on public.exam_sections (workspace_id);
-- justification: FK column; tenant key.

-- A section sits only exams of its own academic year.
create or replace function app.tg_exam_sections_same_year()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.exams e join public.sections s on s.id = new.section_id
     where e.id = new.exam_id and s.academic_year_id = e.academic_year_id) then
    raise exception 'SECTION_WRONG_YEAR' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger exam_sections_same_year
  before insert or update on public.exam_sections
  for each row execute function app.tg_exam_sections_same_year();

-- ---------------------------------------------------------------------
-- exam_subjects — the paper: exam x section x subject
-- ---------------------------------------------------------------------
create table if not exists public.exam_subjects (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  exam_id          uuid not null,
  section_id       uuid not null,
  subject_id       uuid not null,
  exam_date        date,
  starts_at        time,
  duration_minutes smallint check (duration_minutes is null or duration_minutes between 5 and 600),
  full_marks       numeric(6,2) not null check (full_marks > 0),
  pass_marks       numeric(6,2) not null check (pass_marks >= 0),
  status           public.exam_subject_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint exam_subjects_pass_le_full check (pass_marks <= full_marks),
  constraint exam_subjects_exam_section_subject_key unique (exam_id, section_id, subject_id),
  constraint exam_subjects_exam_fkey
    foreign key (exam_id, workspace_id) references public.exams (id, workspace_id) on delete cascade,
  constraint exam_subjects_exam_section_fkey
    foreign key (exam_id, section_id) references public.exam_sections (exam_id, section_id) on delete cascade,
  constraint exam_subjects_subject_fkey
    foreign key (subject_id, workspace_id) references public.subjects (id, workspace_id)
);

comment on table public.exam_subjects is
  'F-AC-06 §3 (demo cut, D-303): one paper — an exam''s subject in one of its '
  'sections. The (exam_id, section_id) FK means a paper exists only for a '
  'section that sits the exam.';

create index if not exists exam_subjects_workspace_exam_section_idx
  on public.exam_subjects (workspace_id, exam_id, section_id);
-- justification: spec §3 — an exam's papers by section.
create index if not exists exam_subjects_subject_idx on public.exam_subjects (subject_id);
create index if not exists exam_subjects_section_idx on public.exam_subjects (exam_id, section_id);
-- justification: FK columns.

-- ---------------------------------------------------------------------
-- Grading snapshot (D-302 -> D-303): set at insert from the school's
-- scale and settings, immutable afterwards.
-- ---------------------------------------------------------------------
create or replace function app.tg_exams_snapshot_grading()
returns trigger
language plpgsql
security definer   -- reads the scale and settings whatever the caller's RLS
set search_path = ''
as $$
declare
  v_settings jsonb;
  v_scale    public.grade_scales;
begin
  if tg_op = 'UPDATE' then
    if (new.grade_scale_id is distinct from old.grade_scale_id
        or new.grading_snapshot is distinct from old.grading_snapshot)
       and not app.is_privileged_context() then
      raise exception 'GRADING_SNAPSHOT_IMMUTABLE' using errcode = '42501';
    end if;
    return new;
  end if;

  select coalesce(p.academic_settings, '{}'::jsonb) into v_settings
    from public.school_profiles p where p.workspace_id = new.workspace_id;
  v_settings := coalesce(v_settings, '{}'::jsonb);

  select s.* into v_scale from public.grade_scales s
   where s.workspace_id = new.workspace_id
   order by (s.code = coalesce(v_settings ->> 'grade_scale_code', 'BD_GPA5')) desc,
            s.is_default desc, s.created_at
   limit 1;
  if not found then
    raise exception 'NO_GRADE_SCALE' using errcode = '22023',
      detail = 'Set up a grade scale in Settings -> Grading first.';
  end if;

  new.grade_scale_id := v_scale.id;
  new.grading_snapshot := jsonb_build_object(
    'grade_scale_code', v_scale.code,
    'grade_scale_name', v_scale.name,
    'pass_mark_percent', coalesce((v_settings ->> 'pass_mark_percent')::numeric, 33),
    'fail_any_subject_zero_gpa', coalesce((v_settings ->> 'fail_any_subject_zero_gpa')::boolean, true),
    'fourth_subject_bonus_threshold_gp',
      (select y.fourth_subject_bonus_threshold_gp from public.academic_years y
        where y.id = new.academic_year_id),
    'bands', (select coalesce(jsonb_agg(jsonb_build_object(
                'letter', b.letter, 'min_percent', b.min_percent, 'max_percent', b.max_percent,
                'grade_point', b.grade_point, 'is_fail', b.is_fail) order by b.sort_order), '[]'::jsonb)
                from public.grade_bands b where b.grade_scale_id = v_scale.id));
  return new;
end;
$$;

revoke all on function app.tg_exams_snapshot_grading() from public, anon, authenticated;

create trigger exams_snapshot_grading
  before insert or update on public.exams
  for each row execute function app.tg_exams_snapshot_grading();

-- ---------------------------------------------------------------------
-- Status (§5.12): one step forward along the chain, or one of the two
-- admin reversals with a reason. A forward step clears the reason.
-- ---------------------------------------------------------------------
create or replace function app.tg_exams_status_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_chain text[] := array['draft', 'scheduled', 'in_progress', 'marks_entry',
                          'marks_locked', 'published', 'archived'];
  v_from  int;
  v_to    int;
begin
  if new.status = old.status then
    return new;
  end if;
  v_from := array_position(v_chain, old.status::text);
  v_to   := array_position(v_chain, new.status::text);

  if v_to = v_from + 1 then
    new.status_reason := null;
    return new;
  end if;

  if (old.status, new.status) in (('published', 'marks_locked'), ('marks_locked', 'marks_entry')) then
    if new.status_reason is null or new.status_reason is not distinct from old.status_reason then
      raise exception 'REASON_REQUIRED' using errcode = '22023';
    end if;
    return new;
  end if;

  raise exception 'INVALID_TRANSITION' using errcode = '22023',
    detail = format('%s -> %s', old.status, new.status);
end;
$$;

create trigger exams_status_guard
  before update of status on public.exams
  for each row execute function app.tg_exams_status_guard();

-- ---------------------------------------------------------------------
-- createExam (§7): the exam, its sections and one paper per section x
-- picked subject, in one transaction. SECURITY INVOKER — RLS, the
-- snapshot trigger and require_writable decide.
-- ---------------------------------------------------------------------
create or replace function public.create_exam(p_input jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_ws        uuid := (p_input ->> 'workspace_id')::uuid;
  v_exam      public.exams;
  v_full      numeric := coalesce((p_input ->> 'full_marks')::numeric, 100);
begin
  insert into public.exams (workspace_id, academic_year_id, name, exam_type, starts_on, ends_on, created_by)
  values (v_ws, (p_input ->> 'academic_year_id')::uuid, p_input ->> 'name',
          (p_input ->> 'exam_type')::public.exam_type,
          (p_input ->> 'starts_on')::date, (p_input ->> 'ends_on')::date, auth.uid())
  returning * into v_exam;

  insert into public.exam_sections (workspace_id, exam_id, section_id)
  select v_ws, v_exam.id, s::uuid
    from jsonb_array_elements_text(p_input -> 'section_ids') as s;

  insert into public.exam_subjects (workspace_id, exam_id, section_id, subject_id, full_marks, pass_marks)
  select v_ws, v_exam.id, s::uuid, sub::uuid, v_full,
         -- round(numeric) is half-up for these non-negative values — the same
         -- rule as app.round_half_up, which is not granted to authenticated.
         round(v_full * (v_exam.grading_snapshot ->> 'pass_mark_percent')::numeric / 100, 0)
    from jsonb_array_elements_text(p_input -> 'section_ids') as s
   cross join jsonb_array_elements_text(p_input -> 'subject_ids') as sub;

  return v_exam.id;
end;
$$;

comment on function public.create_exam(jsonb) is
  'F-AC-06 Part 2 createExam (demo cut, D-303). SECURITY INVOKER. Pass marks '
  'default to round(full_marks x the snapshotted pass mark %, 0), half up.';

revoke all on function public.create_exam(jsonb) from public, anon;
grant execute on function public.create_exam(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Standard trigger set + audit catalogue
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.exams');
select app.attach_updated_at('public.exams');
select app.attach_audit('public.exams');
select app.attach_require_writable('public.exams');
select app.attach_freeze_workspace('public.exam_sections');
select app.attach_audit('public.exam_sections');
select app.attach_require_writable('public.exam_sections');
select app.attach_freeze_workspace('public.exam_subjects');
select app.attach_updated_at('public.exam_subjects');
select app.attach_audit('public.exam_subjects');
select app.attach_require_writable('public.exam_subjects');

create trigger created_by_immutable before update on public.exams
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['exams', 'exam_sections', 'exam_subjects'];
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

-- ---------------------------------------------------------------------
-- RLS (§3: read owner/admin/teacher/staff; write owner/admin). Parents see
-- published exams through a view in Part 7, not these tables.
-- ---------------------------------------------------------------------
alter table public.exams         enable row level security;
alter table public.exam_sections enable row level security;
alter table public.exam_subjects enable row level security;

drop policy if exists exams_select on public.exams;
create policy exams_select on public.exams
  for select to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
         or (select app.is_platform_admin()));
drop policy if exists exams_insert on public.exams;
create policy exams_insert on public.exams
  for insert to authenticated
  with check (app.has_role(workspace_id, array['owner', 'admin'])
              and created_by = (select auth.uid()));
drop policy if exists exams_update on public.exams;
create policy exams_update on public.exams
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
drop policy if exists exams_delete on public.exams;
create policy exams_delete on public.exams
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']) and status = 'draft');

drop policy if exists exam_sections_select on public.exam_sections;
create policy exam_sections_select on public.exam_sections
  for select to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
         or (select app.is_platform_admin()));
drop policy if exists exam_sections_write on public.exam_sections;
create policy exam_sections_write on public.exam_sections
  for all to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists exam_subjects_select on public.exam_subjects;
create policy exam_subjects_select on public.exam_subjects
  for select to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
         or (select app.is_platform_admin()));
drop policy if exists exam_subjects_write on public.exam_subjects;
create policy exam_subjects_write on public.exam_subjects
  for all to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

revoke all on public.exams, public.exam_sections, public.exam_subjects from anon, authenticated;
grant select, insert, update, delete on public.exams, public.exam_sections, public.exam_subjects
  to authenticated;
