-- =====================================================================
-- F-AC-06 Part 3 (demo cut) — marks entry, plus Part 4's publish gate
-- (D-304). Builds on exams/exam_subjects (20260925300305, D-303) and
-- students/enrollments (20260925300306, D-103).
--
--   * exam_subjects.teacher_id — the paper's subject teacher. There is no
--     section_subjects table yet (D-303 item 2), so the admin names the
--     teacher on the paper. When section_subjects lands, it seeds this.
--   * marks — one row per student per paper: `entered` with a number, or
--     `absent` / `exempt` with none. Every FK is composite with
--     workspace_id.
--   * Who may enter or read a paper's marks: an active owner/admin, the
--     paper's teacher, or the section's class teacher (app.can_enter_marks).
--     Staff read. Parents never read marks (they read published results,
--     Part 7). Another subject's teacher reads nothing.
--   * Only public.save_marks writes marks (no INSERT/UPDATE/DELETE grant):
--     idempotent by key, and a per-row version check — each row names the
--     updated_at it loaded, so a stale row is rejected (CONFLICT) instead of
--     overwriting a colleague's newer mark, while the other rows still save.
--     A value below 0 or above full marks is rejected for that row only
--     (MARK_OUT_OF_RANGE); valid rows still save (§4.2, AC12).
--   * Entry is open only while the exam is in `marks_entry` and the paper is
--     not `locked`. The date window (entry_opens_on/closes_on) waits for
--     Part 4.
--   * Audit: the first save moves the paper pending -> entering (audited on
--     exam_subjects); a mark is audited when it CHANGES, with before and
--     after, so an overwritten value is never lost.
--   * Part 4's completeness gate: an exam cannot move to `published` while
--     any enrolled student in any of its papers has no mark row
--     (MARKS_INCOMPLETE). Absent and exempt count as marked.
-- =====================================================================

do $$ begin
  create type public.mark_status as enum ('entered', 'absent', 'exempt');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- The paper's subject teacher
-- ---------------------------------------------------------------------
alter table public.exam_subjects add column if not exists teacher_id uuid;
alter table public.exam_subjects
  add constraint exam_subjects_teacher_fkey
  foreign key (teacher_id, workspace_id) references public.workspace_members (id, workspace_id)
  on delete set null (teacher_id);
create index if not exists exam_subjects_teacher_idx
  on public.exam_subjects (teacher_id) where teacher_id is not null;
-- justification: FK column; a teacher's own papers.

comment on column public.exam_subjects.teacher_id is
  'F-AC-06 Part 3 (D-304): the paper''s subject teacher, set by an owner/admin. '
  'Stands in for section_subjects.teacher_id until F-AC-01 ships it.';

-- ---------------------------------------------------------------------
-- marks
-- ---------------------------------------------------------------------
create table if not exists public.marks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  exam_subject_id uuid not null,
  student_id      uuid not null,
  enrollment_id   uuid not null,
  status          public.mark_status not null,
  obtained        numeric(6,2),
  entered_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id) on delete set null,
  constraint marks_obtained_matches_status
    check ((status = 'entered') = (obtained is not null)),
  constraint marks_obtained_not_negative check (obtained is null or obtained >= 0),
  constraint marks_exam_subject_fkey
    foreign key (exam_subject_id, workspace_id) references public.exam_subjects (id, workspace_id)
    on delete cascade,
  constraint marks_student_fkey
    foreign key (student_id, workspace_id) references public.students (id, workspace_id),
  constraint marks_enrollment_fkey
    foreign key (enrollment_id, workspace_id) references public.enrollments (id, workspace_id)
);

comment on table public.marks is
  'F-AC-06 §3 (Part 3 demo cut, D-304): one student''s mark on one paper — a '
  'number (status entered) or absent/exempt. Written only by public.save_marks.';

create unique index if not exists marks_exam_subject_student_key
  on public.marks (exam_subject_id, student_id);
-- justification: §3, one mark per student per paper; also the paper's list.
create index if not exists marks_workspace_student_idx on public.marks (workspace_id, student_id);
-- justification: §3, report cards scan per student.
create index if not exists marks_enrollment_idx on public.marks (enrollment_id);
create index if not exists marks_entered_by_idx on public.marks (entered_by) where entered_by is not null;
create index if not exists marks_created_by_idx on public.marks (created_by) where created_by is not null;
-- justification: FK columns.

select app.attach_freeze_workspace('public.marks');
select app.attach_updated_at('public.marks');
select app.attach_require_writable('public.marks');

-- A first entry is covered by the paper's pending -> entering; a mark is
-- audited when it changes (before/after) or is removed.
drop trigger if exists audit_public_marks on public.marks;
create trigger audit_public_marks
  after update or delete on public.marks
  for each row execute function app.tg_audit('', '');

create trigger created_by_immutable before update on public.marks
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['marks'];
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
-- Who may enter (and read) a paper's marks
-- ---------------------------------------------------------------------
create or replace function app.can_enter_marks(p_workspace_id uuid, p_exam_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role(p_workspace_id, array['owner', 'admin'])
      or exists (
           select 1
             from public.exam_subjects es
             join public.sections s on s.id = es.section_id
             join public.workspace_members m
               on m.id = es.teacher_id or m.id = s.class_teacher_id
            where es.id = p_exam_subject_id
              and es.workspace_id = p_workspace_id
              and m.user_id = auth.uid()
              and m.status = 'active'
              and m.role in ('owner', 'admin', 'teacher'))
$$;

comment on function app.can_enter_marks(uuid, uuid) is
  'F-AC-06 §2 (D-304): an active owner/admin, the paper''s teacher '
  '(exam_subjects.teacher_id) or the section''s class teacher.';

revoke all on function app.can_enter_marks(uuid, uuid) from public, anon;
grant execute on function app.can_enter_marks(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- RLS: read by owner/admin/staff and the paper's own teachers; no write
-- grant (public.save_marks is the only writer).
-- ---------------------------------------------------------------------
alter table public.marks enable row level security;

drop policy if exists marks_select on public.marks;
create policy marks_select on public.marks
  for select to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin', 'staff'])
         or app.can_enter_marks(workspace_id, exam_subject_id));

revoke all on public.marks from anon, authenticated;
grant select on public.marks to authenticated;

-- ---------------------------------------------------------------------
-- The students a paper must have a mark for: active enrolments in the
-- paper's section, of students who are active and not deleted.
-- ---------------------------------------------------------------------
create or replace function app.exam_marks_missing(p_workspace_id uuid, p_exam_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.exam_subjects es
    join public.enrollments e
      on e.section_id = es.section_id and e.workspace_id = es.workspace_id and e.status = 'active'
    join public.students st on st.id = e.student_id and st.status = 'active' and st.deleted_at is null
   where es.exam_id = p_exam_id
     and es.workspace_id = p_workspace_id
     and not exists (select 1 from public.marks mk
                      where mk.exam_subject_id = es.id and mk.student_id = e.student_id)
$$;

comment on function app.exam_marks_missing(uuid, uuid) is
  'F-AC-06 Part 4 gate (D-304): how many (paper, enrolled student) pairs of an '
  'exam have no mark row. Absent and exempt rows count as marked.';

revoke all on function app.exam_marks_missing(uuid, uuid) from public, anon, authenticated;

create or replace function app.tg_exams_publish_gate()
returns trigger
language plpgsql
security definer   -- counts every paper's marks whatever the caller's RLS
set search_path = ''
as $$
declare
  v_missing integer;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    v_missing := app.exam_marks_missing(new.workspace_id, new.id);
    if v_missing > 0 then
      raise exception 'MARKS_INCOMPLETE' using errcode = '22023',
        detail = format('%s marks missing', v_missing);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app.tg_exams_publish_gate() from public, anon, authenticated;

-- Named to sort after exams_status_guard, so an invalid jump still reads
-- INVALID_TRANSITION first.
create trigger exams_status_publish_gate
  before update of status on public.exams
  for each row execute function app.tg_exams_publish_gate();

-- ---------------------------------------------------------------------
-- public.save_marks — §4.2 / §7 saveMarks, the only writer.
-- ---------------------------------------------------------------------
create or replace function public.save_marks(p_workspace_id uuid, p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_key     text := p_input ->> 'idempotency_key';
  v_hash    bytea;
  v_prior   app.idempotency_keys;
  v_paper   public.exam_subjects;
  v_exam    public.exams;
  v_result  jsonb;
begin
  if v_uid is null or not app.has_role(p_workspace_id, array['owner', 'admin', 'teacher']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if jsonb_typeof(p_input) is distinct from 'object'
     or jsonb_typeof(p_input -> 'entries') is distinct from 'array'
     or jsonb_array_length(p_input -> 'entries') not between 1 and 300
     or v_key is null
     or v_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(p_input ->> 'exam_subject_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  -- A replayed save returns what the first one stored.
  perform pg_advisory_xact_lock(hashtext('save_marks'), hashtext(v_key));
  v_hash := sha256(convert_to((p_input - 'idempotency_key')::text, 'UTF8'));
  select * into v_prior from app.idempotency_keys k
   where k.scope = 'save_marks' and k.key = v_key;
  if found then
    if v_prior.user_id is distinct from v_uid
       or v_prior.workspace_id is distinct from p_workspace_id
       or v_prior.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return v_prior.response || jsonb_build_object('replayed', true);
  end if;

  -- The paper row lock serialises two devices saving the same paper.
  select * into v_paper from public.exam_subjects es
   where es.id = (p_input ->> 'exam_subject_id')::uuid and es.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'PAPER_NOT_FOUND' using errcode = '22023';
  end if;
  if not app.can_enter_marks(p_workspace_id, v_paper.id) then
    raise exception 'NOT_ASSIGNED' using errcode = '42501';
  end if;
  select * into v_exam from public.exams e where e.id = v_paper.exam_id;
  if v_exam.status <> 'marks_entry' then
    raise exception 'ENTRY_CLOSED' using errcode = '22023';
  end if;
  if v_paper.status = 'locked' then
    raise exception 'SUBJECT_LOCKED' using errcode = '42501';
  end if;

  create temp table if not exists pg_temp.mk_expected (student_id uuid primary key, enrollment_id uuid) on commit drop;
  create temp table if not exists pg_temp.mk_given (
    student_id uuid, status public.mark_status, obtained numeric,
    expected_updated_at timestamptz, issue text) on commit drop;
  truncate pg_temp.mk_expected, pg_temp.mk_given;

  insert into pg_temp.mk_expected
  select e.student_id, e.id
    from public.enrollments e
    join public.students st on st.id = e.student_id
   where e.section_id = v_paper.section_id
     and e.workspace_id = p_workspace_id
     and e.status = 'active'
     and st.status = 'active'
     and st.deleted_at is null;

  begin
    insert into pg_temp.mk_given (student_id, status, obtained, expected_updated_at)
    select x.student_id, x.status, x.obtained, x.expected_updated_at
      from jsonb_to_recordset(p_input -> 'entries')
        as x(student_id uuid, status public.mark_status, obtained numeric, expected_updated_at timestamptz);
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'VALIDATION' using errcode = '22023';
  end;

  if exists (select 1 from pg_temp.mk_given g
              where g.student_id is null or g.status is null
                 or (g.status = 'entered') <> (g.obtained is not null))
     or (select count(*) from pg_temp.mk_given)
        <> (select count(distinct g.student_id) from pg_temp.mk_given g) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.mk_given g
              where not exists (select 1 from pg_temp.mk_expected x where x.student_id = g.student_id)) then
    raise exception 'STUDENT_NOT_ENROLLED' using errcode = '22023';
  end if;

  -- Per-row checks: the rest of the rows still save (§4.2, AC12).
  update pg_temp.mk_given g
     set issue = 'MARK_OUT_OF_RANGE'
   where g.obtained is not null
     and (g.obtained < 0 or g.obtained > v_paper.full_marks or g.obtained <> round(g.obtained, 2));
  update pg_temp.mk_given g
     set issue = 'CONFLICT'
   where g.issue is null
     and g.expected_updated_at is distinct from
         (select mk.updated_at from public.marks mk
           where mk.exam_subject_id = v_paper.id and mk.student_id = g.student_id);

  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;

  insert into public.marks
    (workspace_id, exam_subject_id, student_id, enrollment_id, status, obtained, entered_by, created_by)
  select p_workspace_id, v_paper.id, g.student_id, x.enrollment_id, g.status, g.obtained, v_uid, v_uid
    from pg_temp.mk_given g
    join pg_temp.mk_expected x on x.student_id = g.student_id
   where g.issue is null
  on conflict (exam_subject_id, student_id) do update
     set status = excluded.status, obtained = excluded.obtained,
         enrollment_id = excluded.enrollment_id, entered_by = excluded.entered_by
   where (public.marks.status, public.marks.obtained)
         is distinct from (excluded.status, excluded.obtained);

  if v_paper.status = 'pending' and exists (select 1 from pg_temp.mk_given g where g.issue is null) then
    update public.exam_subjects set status = 'entering' where id = v_paper.id;
  end if;

  v_result := jsonb_build_object(
    'saved', (select count(*) from pg_temp.mk_given g where g.issue is null),
    'rejected', coalesce((select jsonb_agg(jsonb_build_object('student_id', g.student_id, 'issue', g.issue)
                                           order by g.student_id)
                            from pg_temp.mk_given g where g.issue is not null), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(jsonb_build_object(
                                'student_id', mk.student_id, 'status', mk.status,
                                'obtained', mk.obtained, 'updated_at', mk.updated_at)
                              order by mk.student_id)
                         from public.marks mk
                         join pg_temp.mk_given g on g.student_id = mk.student_id
                        where mk.exam_subject_id = v_paper.id), '[]'::jsonb),
    'entered', (select count(*) from public.marks mk
                 join pg_temp.mk_expected x on x.student_id = mk.student_id
                where mk.exam_subject_id = v_paper.id),
    'enrolled', (select count(*) from pg_temp.mk_expected));

  insert into app.idempotency_keys
    (scope, key, workspace_id, user_id, request_hash, status, response, completed_at)
  values
    ('save_marks', v_key, p_workspace_id, v_uid, v_hash, 'succeeded', v_result, now());

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

comment on function public.save_marks(uuid, jsonb) is
  'F-AC-06 §4.2 saveMarks (Part 3 demo cut, D-304): upserts a paper''s marks '
  'in one statement. Only an owner/admin, the paper''s teacher or the class '
  'teacher; only while the exam is in marks_entry and the paper is not locked; '
  'only students enrolled in the paper''s section. Per row: MARK_OUT_OF_RANGE '
  'or CONFLICT (stale expected_updated_at) rejects that row, the rest save. '
  'Raises FORBIDDEN, VALIDATION, IDEMPOTENCY_KEY_REUSED, PAPER_NOT_FOUND, '
  'NOT_ASSIGNED, ENTRY_CLOSED, SUBJECT_LOCKED, STUDENT_NOT_ENROLLED; '
  'PLAN_READ_ONLY comes from the table guard.';

revoke all on function public.save_marks(uuid, jsonb) from public, anon;
grant execute on function public.save_marks(uuid, jsonb) to authenticated;
