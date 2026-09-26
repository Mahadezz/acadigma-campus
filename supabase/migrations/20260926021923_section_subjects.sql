-- =====================================================================
-- F-AC-01 Part 5 demo cut — section_subjects (D-107).
--
-- Which subjects a section takes and who teaches each one. Builds on
-- sections/subjects (20260925300304, D-102) and feeds exam papers
-- (create_exam, D-303 item 2) and the basic-mode home (D-403 (c)).
--
-- Class T2 RLS (read: owner/admin/teacher/staff; write: owner/admin), the
-- standard trigger set (tenant freeze, updated_at, generic audit,
-- require_writable, immutable created_by). Every foreign key into another
-- tenant table is composite with workspace_id, so a row can only join a
-- section, subject and teacher of its own school.
-- =====================================================================

create table if not exists public.section_subjects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  section_id   uuid not null,
  subject_id   uuid not null,
  teacher_id   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  constraint section_subjects_section_subject_key unique (section_id, subject_id),
  constraint section_subjects_id_workspace_key unique (id, workspace_id),
  constraint section_subjects_section_fkey
    foreign key (section_id, workspace_id) references public.sections (id, workspace_id),
  constraint section_subjects_subject_fkey
    foreign key (subject_id, workspace_id) references public.subjects (id, workspace_id),
  constraint section_subjects_teacher_fkey
    foreign key (teacher_id, workspace_id) references public.workspace_members (id, workspace_id)
    on delete set null (teacher_id)
);

comment on table public.section_subjects is
  'F-AC-01 Part 5 / DATA-MODEL.md §2 (demo cut, D-107): section x subject x '
  'teacher. teacher_id is the primary teacher; assistants, periods, marks '
  'and the 4th-subject override come with the full Part.';

create index if not exists section_subjects_teacher_idx
  on public.section_subjects (workspace_id, teacher_id) where teacher_id is not null;
-- justification: "my sections" for a teacher (listMySections); FK column.
create index if not exists section_subjects_subject_idx on public.section_subjects (subject_id);
create index if not exists section_subjects_created_by_idx
  on public.section_subjects (created_by) where created_by is not null;
-- justification: FK columns. section_id is covered by the unique key.

-- F-AC-01 §5 rule 9: a subject teacher is an ACTIVE owner/admin/teacher.
create or replace function app.tg_section_subjects_teacher_eligible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.teacher_id is not null
     and not exists (
       select 1 from public.workspace_members m
        where m.id = new.teacher_id
          and m.workspace_id = new.workspace_id
          and m.status = 'active'
          and m.role in ('owner', 'admin', 'teacher')) then
    raise exception 'MEMBER_NOT_ELIGIBLE' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger section_subjects_teacher_eligible
  before insert or update of teacher_id on public.section_subjects
  for each row execute function app.tg_section_subjects_teacher_eligible();

-- F-AC-01 §4.5: a member who stops being an active owner/admin/teacher
-- stops teaching their subjects (the class-teacher half is D-102's
-- app.tg_members_release_class_teacher).
create or replace function app.tg_members_release_subject_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (new.status = 'active' and new.role in ('owner', 'admin', 'teacher')) then
    update public.section_subjects
       set teacher_id = null
     where teacher_id = new.id;
  end if;
  return new;
end;
$$;

create trigger members_release_subject_teacher
  after update of status, role on public.workspace_members
  for each row execute function app.tg_members_release_subject_teacher();

-- D-300 "removing access always works", for teaching assignments too
-- (review of PR #73): removing a member from a READ-ONLY school runs the
-- release triggers above and D-102's app.tg_members_release_class_teacher,
-- whose updates hit this guard (a SECURITY DEFINER trigger does not change
-- current_setting('role'), so it is not a privileged context) and rolled
-- the removal back with PLAN_READ_ONLY. The guard now also lets through an
-- UPDATE that only clears sections.class_teacher_id or
-- section_subjects.teacher_id (updated_at aside). Clearing a teacher is
-- itself a removal of access, so a direct one is allowed too. The rest is
-- 20260925300201's function unchanged.
create or replace function app.tg_require_writable()
returns trigger
language plpgsql
security definer   -- sees the workspace row even when the caller's RLS cannot
set search_path = ''
as $$
declare
  v_new    jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old    jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  -- UPDATE/DELETE read OLD's workspace: app.tg_freeze_workspace makes
  -- workspace_id immutable, so OLD and NEW always agree.
  v_ws     uuid  := (coalesce(v_old, v_new) ->> coalesce(tg_argv[0], 'workspace_id'))::uuid;
  v_reason text;
begin
  if app.is_privileged_context() or app.is_platform_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select w.access_mode_reason into v_reason
    from public.workspaces w
   where w.id = v_ws and w.access_mode = 'read_only';
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Removing access is always allowed (D-300, security review).
  if (tg_table_name = 'workspace_members'
        and (tg_op = 'DELETE'
             or (tg_op = 'UPDATE' and v_new ->> 'status' = 'removed'
                 and v_new - array['status', 'removed_at', 'removed_by', 'updated_at']
                   = v_old - array['status', 'removed_at', 'removed_by', 'updated_at'])))
     or (tg_table_name = 'workspace_member_capabilities'
        and (tg_op = 'DELETE'
             or (tg_op = 'UPDATE' and v_new ->> 'revoked_at' is not null
                 and v_new - array['revoked_at', 'revoked_by']
                   = v_old - array['revoked_at', 'revoked_by'])))
     or (tg_table_name = 'workspace_invitations'
        and tg_op = 'UPDATE' and v_new ->> 'status' in ('revoked', 'declined')
        and v_new - array['status', 'revoked_at', 'revoked_by', 'declined_at', 'updated_at']
          = v_old - array['status', 'revoked_at', 'revoked_by', 'declined_at', 'updated_at'])
     -- D-107: releasing a teacher from a section or a section's subject.
     or (tg_table_name = 'sections'
        and tg_op = 'UPDATE' and v_new ->> 'class_teacher_id' is null
        and v_new - array['class_teacher_id', 'updated_at']
          = v_old - array['class_teacher_id', 'updated_at'])
     or (tg_table_name = 'section_subjects'
        and tg_op = 'UPDATE' and v_new ->> 'teacher_id' is null
        and v_new - array['teacher_id', 'updated_at']
          = v_old - array['teacher_id', 'updated_at'])
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Only an active member learns the mode; a non-member's write is left to
  -- RLS, which refuses it the same way whatever the mode (D-301).
  if app.member_role(v_ws) is not null then
    raise exception 'PLAN_READ_ONLY'
      using errcode = '42501',
            detail  = coalesce(v_reason, 'This workspace is read-only.');
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers, audit catalogue, RLS (T2), grants
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.section_subjects');
select app.attach_updated_at('public.section_subjects');
select app.attach_audit('public.section_subjects');
select app.attach_require_writable('public.section_subjects');

create trigger created_by_immutable before update on public.section_subjects
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['section_subjects'];
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
-- Taking a subject off a section is routine, not a critical event (review
-- of PR #73). Mirrored in GENERIC_SEVERITY_OVERRIDES
-- (packages/domain/src/audit/catalog.ts).
update public.audit_action_catalog set severity = 'notable'
 where action = 'section_subjects.delete';

alter table public.section_subjects enable row level security;

drop policy if exists section_subjects_select on public.section_subjects;
create policy section_subjects_select on public.section_subjects
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );
drop policy if exists section_subjects_insert on public.section_subjects;
create policy section_subjects_insert on public.section_subjects
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
drop policy if exists section_subjects_update on public.section_subjects;
create policy section_subjects_update on public.section_subjects
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
-- Nothing references a section_subject yet, so taking a subject off a
-- section is a delete. Timetable/lesson rows will reference it later with
-- `on delete restrict`, which then turns a used row archive-only.
drop policy if exists section_subjects_delete on public.section_subjects;
create policy section_subjects_delete on public.section_subjects
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

revoke all on public.section_subjects from anon, authenticated;
grant select, insert, update, delete on public.section_subjects to authenticated;

-- ---------------------------------------------------------------------
-- public.set_section_subjects — the Classes screen's one write: the
-- section's full subject list with each subject's teacher. Subjects not
-- in the list are taken off; the rest are added or have their teacher
-- changed. SECURITY INVOKER: RLS and the triggers above decide.
-- ---------------------------------------------------------------------
create or replace function public.set_section_subjects(
  p_workspace_id uuid, p_section_id uuid, p_subjects jsonb)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_ws    uuid;
  v_count integer;
begin
  select s.workspace_id into v_ws
    from public.sections s
   where s.id = p_section_id and s.workspace_id = p_workspace_id and s.archived_at is null;
  if v_ws is null then
    raise exception 'SECTION_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Only a NEWLY added subject must be live: one assigned before it was
  -- archived may stay, so the admin can still change anything else.
  if exists (
    select 1
      from jsonb_array_elements(p_subjects) e
      join public.subjects sub on sub.id = (e ->> 'subject_id')::uuid
     where sub.archived_at is not null
       and not exists (
         select 1 from public.section_subjects ss
          where ss.section_id = p_section_id and ss.subject_id = sub.id)) then
    raise exception 'SUBJECT_ARCHIVED' using errcode = '22023';
  end if;

  delete from public.section_subjects ss
   where ss.section_id = p_section_id
     and ss.subject_id not in (
       select (e ->> 'subject_id')::uuid from jsonb_array_elements(p_subjects) e);

  insert into public.section_subjects (workspace_id, section_id, subject_id, teacher_id, created_by)
  select v_ws, p_section_id, (e ->> 'subject_id')::uuid, (e ->> 'teacher_id')::uuid, auth.uid()
    from jsonb_array_elements(p_subjects) e
  on conflict (section_id, subject_id) do update
    set teacher_id = excluded.teacher_id
    where public.section_subjects.teacher_id is distinct from excluded.teacher_id;

  select count(*)::integer into v_count
    from public.section_subjects where section_id = p_section_id;
  return v_count;
end;
$$;

comment on function public.set_section_subjects(uuid, uuid, jsonb) is
  'F-AC-01 Part 5 demo cut (D-107). SECURITY INVOKER. p_subjects = '
  '[{subject_id, teacher_id|null}]; replaces the section''s subject list.';

revoke all on function public.set_section_subjects(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_section_subjects(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- create_exam: each paper's teacher defaults to the section's subject
-- teacher (D-303 item 2, D-304 item 1). Same signature and behaviour
-- otherwise; a section/subject with no section_subjects row keeps a null
-- teacher, exactly as before.
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

  insert into public.exam_subjects (workspace_id, exam_id, section_id, subject_id, full_marks, pass_marks, teacher_id)
  select v_ws, v_exam.id, s::uuid, sub::uuid, v_full,
         -- Not rounded to whole marks (D-302): 33 % of 50 is 16.50, which
         -- numeric(6,2) holds exactly.
         v_full * (v_exam.grading_snapshot ->> 'pass_mark_percent')::numeric / 100,
         ss.teacher_id
    from jsonb_array_elements_text(p_input -> 'section_ids') as s
   cross join jsonb_array_elements_text(p_input -> 'subject_ids') as sub
    left join public.section_subjects ss
      on ss.section_id = s::uuid and ss.subject_id = sub::uuid and ss.workspace_id = v_ws;

  return v_exam.id;
end;
$$;

comment on function public.create_exam(jsonb) is
  'F-AC-06 Part 2 createExam (demo cut, D-303). SECURITY INVOKER. Pass marks '
  'default to full_marks x the snapshotted pass mark % (not rounded, D-302); '
  'each paper''s teacher defaults to section_subjects.teacher_id (D-107).';
