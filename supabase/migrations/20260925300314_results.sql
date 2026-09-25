-- =====================================================================
-- F-AC-06 Part 5 (demo cut) — result computation and rank in SQL (D-305).
-- Builds on exams (20260925300305, D-303) and marks (20260925300312, D-304).
--
--   * results — one row per student per exam: totals, the mark-weighted
--     percentage, GPA, the overall letter, pass/fail, failed papers and the
--     section rank. result_subject_lines — one row per paper: the subject
--     name snapshotted, the mark, the percentage, letter, grade point and
--     whether the paper was passed.
--   * Only app.compute_results writes them (no write grant). It reads the
--     exam's grading_snapshot (D-303 review), never the live scale:
--       - paper % = round_half_up(100 x obtained / full, 2); banded as is
--         (D-302: 79.5 -> A, 32.5 -> F);
--       - absent = 0 % and a failed paper; exempt is left out of totals,
--         percentage and GPA;
--       - a paper is passed when obtained >= its pass marks and its band is
--         not a fail band (the pass flag flips exactly at the pass mark);
--       - GPA = round_half_up(mean grade point of the non-exempt papers, 2),
--         0.00 when any paper failed and fail_any_subject_zero_gpa is on;
--       - overall letter = the first band (top down) whose grade point is at
--         or below the GPA;
--       - section rank = rank() over (partition by section order by gpa
--         desc, total_obtained desc, percentage desc). student_code is NOT a
--         rank key — it would break every tie — it only orders the list.
--   * Compute runs only on a marks_locked exam (MARKS_NOT_LOCKED) whose
--     marks are complete (MARKS_INCOMPLETE — the same app.exam_marks_missing
--     count the publish gate uses), so no result is ever computed from
--     partial marks and no `incomplete` result exists yet.
--   * Re-running replaces the exam's results in one transaction and logs one
--     results.computed event. Going back to marks_entry clears them.
--   * RLS: owner/admin/staff and the section's class teacher read; parents
--     read nothing until Part 7 (publishing).
-- =====================================================================

do $$ begin
  create type public.result_status as enum ('pass', 'fail');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- results
-- ---------------------------------------------------------------------
create table if not exists public.results (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  exam_id         uuid not null,
  section_id      uuid not null,
  student_id      uuid not null,
  enrollment_id   uuid not null,
  total_obtained  numeric(8,2) not null,
  total_full      numeric(8,2) not null,
  percentage      numeric(5,2),   -- null only when every paper is exempt
  gpa             numeric(4,2) check (gpa between 0 and 5),
  letter          text,
  result_status   public.result_status not null,
  failed_subjects smallint not null check (failed_subjects >= 0),
  section_rank    integer check (section_rank > 0),
  computed_at     timestamptz not null default now(),
  computed_by     uuid references public.profiles (id) on delete set null,
  constraint results_exam_student_key unique (exam_id, student_id),
  constraint results_id_workspace_key unique (id, workspace_id),
  constraint results_exam_fkey
    foreign key (exam_id, workspace_id) references public.exams (id, workspace_id) on delete cascade,
  constraint results_exam_section_fkey
    foreign key (exam_id, section_id) references public.exam_sections (exam_id, section_id) on delete cascade,
  constraint results_section_fkey
    foreign key (section_id, workspace_id) references public.sections (id, workspace_id),
  constraint results_student_fkey
    foreign key (student_id, workspace_id) references public.students (id, workspace_id),
  constraint results_enrollment_fkey
    foreign key (enrollment_id, workspace_id) references public.enrollments (id, workspace_id)
);

comment on table public.results is
  'F-AC-06 §3 (Part 5 demo cut, D-305): one student''s computed result for one '
  'exam. Written only by app.compute_results.';

create index if not exists results_workspace_section_exam_idx
  on public.results (workspace_id, section_id, exam_id);
-- justification: spec §3 — a section's results preview.
create index if not exists results_workspace_student_idx on public.results (workspace_id, student_id);
-- justification: a student's results (report card, profile).
create index if not exists results_section_idx on public.results (section_id);
create index if not exists results_enrollment_idx on public.results (enrollment_id);
create index if not exists results_computed_by_idx on public.results (computed_by) where computed_by is not null;
-- justification: FK columns. (exam_id, ...) is served by the unique key's prefix.

-- ---------------------------------------------------------------------
-- result_subject_lines
-- ---------------------------------------------------------------------
create table if not exists public.result_subject_lines (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  result_id       uuid not null,
  exam_subject_id uuid not null,
  subject_id      uuid not null,
  subject_name    text not null,   -- snapshotted at compute time
  subject_name_bn text,
  full_marks      numeric(6,2) not null,
  pass_marks      numeric(6,2) not null,
  status          public.mark_status not null,
  obtained        numeric(6,2),    -- null when absent or exempt
  percentage      numeric(5,2),    -- 0 when absent, null when exempt
  letter          text,
  grade_point     numeric(3,2),
  passed          boolean,         -- null when exempt
  constraint result_subject_lines_result_paper_key unique (result_id, exam_subject_id),
  constraint result_subject_lines_result_fkey
    foreign key (result_id, workspace_id) references public.results (id, workspace_id) on delete cascade,
  constraint result_subject_lines_exam_subject_fkey
    foreign key (exam_subject_id, workspace_id) references public.exam_subjects (id, workspace_id)
    on delete cascade,
  constraint result_subject_lines_subject_fkey
    foreign key (subject_id, workspace_id) references public.subjects (id, workspace_id)
);

comment on table public.result_subject_lines is
  'F-AC-06 §3 (Part 5 demo cut, D-305): one paper''s line on a result — the '
  'mark-sheet row. Written only by app.compute_results.';

create index if not exists result_subject_lines_exam_subject_idx on public.result_subject_lines (exam_subject_id);
create index if not exists result_subject_lines_subject_idx on public.result_subject_lines (subject_id);
create index if not exists result_subject_lines_workspace_idx on public.result_subject_lines (workspace_id);
-- justification: FK columns. result_id is served by the unique key's prefix.

select app.attach_freeze_workspace('public.results');
select app.attach_require_writable('public.results');
select app.attach_freeze_workspace('public.result_subject_lines');
select app.attach_require_writable('public.result_subject_lines');

-- ---------------------------------------------------------------------
-- The band a percentage falls in, from an exam's snapshotted bands
-- (D-303 review: results never read the live scale). Same rule as
-- app.band_for: min_percent <= pct <= max_percent, no rounding.
-- ---------------------------------------------------------------------
create or replace function app.snapshot_band(p_bands jsonb, p_pct numeric)
returns table (letter text, grade_point numeric, is_fail boolean)
language sql
immutable
set search_path = ''
as $$
  select b ->> 'letter', (b ->> 'grade_point')::numeric, (b ->> 'is_fail')::boolean
    from jsonb_array_elements(p_bands) as b
   where p_pct between (b ->> 'min_percent')::numeric and (b ->> 'max_percent')::numeric
   limit 1
$$;

-- The overall letter for a GPA: the first band, top down, whose grade point
-- is at or below it (BD: 4.67 -> A, 0.00 -> F).
create or replace function app.snapshot_gpa_letter(p_bands jsonb, p_gpa numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select b ->> 'letter'
    from jsonb_array_elements(p_bands) with ordinality as x(b, n)
   where (b ->> 'grade_point')::numeric <= p_gpa
   order by x.n
   limit 1
$$;

revoke all on function app.snapshot_band(jsonb, numeric) from public, anon, authenticated;
revoke all on function app.snapshot_gpa_letter(jsonb, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- app.compute_results — §4.4, §5.1-5.6, §5.8 for exam scope.
-- ---------------------------------------------------------------------
create or replace function app.compute_results(p_workspace_id uuid, p_exam_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_exam    public.exams;
  v_bands   jsonb;
  v_zero    boolean;
  v_missing integer;
  v_summary jsonb;
begin
  -- The exam row lock serialises two admins computing the same exam.
  select * into v_exam from public.exams e
   where e.id = p_exam_id and e.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'EXAM_NOT_FOUND' using errcode = '22023';
  end if;
  if v_exam.status <> 'marks_locked' then
    raise exception 'MARKS_NOT_LOCKED' using errcode = '22023';
  end if;
  v_missing := app.exam_marks_missing(p_workspace_id, p_exam_id);
  if v_missing > 0 then
    raise exception 'MARKS_INCOMPLETE' using errcode = '22023',
      detail = format('%s marks missing', v_missing);
  end if;

  v_bands := v_exam.grading_snapshot -> 'bands';
  v_zero  := coalesce((v_exam.grading_snapshot ->> 'fail_any_subject_zero_gpa')::boolean, true);

  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;

  delete from public.results r where r.exam_id = p_exam_id;   -- lines cascade

  with lines as (
    -- Every paper of every student actively enrolled in its section: the
    -- publish gate's definition, which has just found no missing mark.
    select e.student_id, e.id as enrollment_id, es.section_id, es.id as exam_subject_id,
           es.subject_id, sub.name as subject_name, sub.name_bn as subject_name_bn,
           es.full_marks, es.pass_marks, mk.status, mk.obtained,
           case mk.status
             when 'entered' then app.round_half_up(100 * mk.obtained / es.full_marks, 2)
             when 'absent'  then 0::numeric
           end as pct
      from public.exam_subjects es
      join public.subjects sub on sub.id = es.subject_id
      join public.enrollments e
        on e.section_id = es.section_id and e.workspace_id = es.workspace_id and e.status = 'active'
      join public.students st on st.id = e.student_id and st.status = 'active' and st.deleted_at is null
      join public.marks mk on mk.exam_subject_id = es.id and mk.student_id = e.student_id
     where es.exam_id = p_exam_id and es.workspace_id = p_workspace_id
  ),
  banded as (
    select l.*, b.letter, b.grade_point,
           case when l.status = 'exempt' then null
                else l.status = 'entered' and l.obtained >= l.pass_marks and not b.is_fail
           end as passed
      from lines l
      left join lateral app.snapshot_band(v_bands, l.pct) b on true
  ),
  per_student as (
    select b.student_id, b.enrollment_id, b.section_id,
           coalesce(sum(b.obtained) filter (where b.status <> 'exempt'), 0) as total_obtained,
           coalesce(sum(b.full_marks) filter (where b.status <> 'exempt'), 0) as total_full,
           count(*) filter (where b.passed is false) as failed,
           avg(b.grade_point) filter (where b.status <> 'exempt') as gp_mean
      from banded b
     group by b.student_id, b.enrollment_id, b.section_id
  ),
  graded as (
    select p.*,
           case when p.total_full > 0
                then app.round_half_up(100 * p.total_obtained / p.total_full, 2) end as percentage,
           case when p.gp_mean is null then null
                when v_zero and p.failed > 0 then 0::numeric
                else app.round_half_up(p.gp_mean, 2) end as gpa
      from per_student p
  ),
  inserted as (
    insert into public.results
      (workspace_id, exam_id, section_id, student_id, enrollment_id, total_obtained, total_full,
       percentage, gpa, letter, result_status, failed_subjects, section_rank, computed_by)
    select p_workspace_id, p_exam_id, g.section_id, g.student_id, g.enrollment_id,
           g.total_obtained, g.total_full, g.percentage, g.gpa,
           app.snapshot_gpa_letter(v_bands, g.gpa),
           case when g.failed > 0 then 'fail' else 'pass' end::public.result_status,
           g.failed,
           case when g.gpa is not null then
             rank() over (partition by g.section_id, g.gpa is null
                          order by g.gpa desc, g.total_obtained desc, g.percentage desc)
           end,
           auth.uid()
      from graded g
    returning id, student_id
  )
  insert into public.result_subject_lines
    (workspace_id, result_id, exam_subject_id, subject_id, subject_name, subject_name_bn,
     full_marks, pass_marks, status, obtained, percentage, letter, grade_point, passed)
  select p_workspace_id, i.id, b.exam_subject_id, b.subject_id, b.subject_name, b.subject_name_bn,
         b.full_marks, b.pass_marks, b.status, b.obtained, b.pct, b.letter, b.grade_point, b.passed
    from banded b
    join inserted i on i.student_id = b.student_id;

  select jsonb_build_object(
           'computed', count(*),
           'passed', count(*) filter (where r.result_status = 'pass'),
           'failed', count(*) filter (where r.result_status = 'fail'))
    into v_summary
    from public.results r where r.exam_id = p_exam_id;

  perform app.log_audit_event('results.computed', p_workspace_id, 'exams', p_exam_id,
    null, v_summary);
  return v_summary;
end;
$$;

comment on function app.compute_results(uuid, uuid) is
  'F-AC-06 §4.4 (Part 5 demo cut, D-305): replaces an exam''s results and '
  'result_subject_lines from its marks and grading_snapshot, with section '
  'ranks, in one transaction. Raises EXAM_NOT_FOUND, MARKS_NOT_LOCKED, '
  'MARKS_INCOMPLETE. No role check here: callers check.';

revoke all on function app.compute_results(uuid, uuid) from public, anon, authenticated;

-- The client RPC (D-50): an active owner/admin only.
create or replace function public.compute_results(p_workspace_id uuid, p_exam_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return app.compute_results(p_workspace_id, p_exam_id);
end;
$$;

comment on function public.compute_results(uuid, uuid) is
  'F-AC-06 §7 computeResults (Part 5, D-305): owner/admin only; see '
  'app.compute_results. PLAN_READ_ONLY comes from the table guard.';

revoke all on function public.compute_results(uuid, uuid) from public, anon;
grant execute on function public.compute_results(uuid, uuid) to authenticated;

insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
values
  ('results.computed', 'notable', '{actor} computed an exam''s results ({n})',
    '{actor} একটি পরীক্ষার ফলাফল তৈরি করেছেন ({n})', false)
on conflict (action) do update
  set severity    = excluded.severity,
      sentence_en = excluded.sentence_en,
      sentence_bn = excluded.sentence_bn,
      is_generic  = excluded.is_generic;

-- ---------------------------------------------------------------------
-- Going back to marks entry makes the results stale: clear them, so a
-- report card can never print a result the marks no longer support.
-- ---------------------------------------------------------------------
create or replace function app.tg_exams_clear_results()
returns trigger
language plpgsql
security definer   -- results have no client write grant
set search_path = ''
as $$
begin
  delete from public.results r where r.exam_id = new.id;
  return null;
end;
$$;

revoke all on function app.tg_exams_clear_results() from public, anon, authenticated;

create trigger exams_clear_results
  after update of status on public.exams
  for each row when (new.status = 'marks_entry' and old.status is distinct from 'marks_entry')
  execute function app.tg_exams_clear_results();

-- ---------------------------------------------------------------------
-- RLS: owner/admin/staff read every result; the section's class teacher
-- reads that section's. Parents read nothing until Part 7. No write grant.
-- ---------------------------------------------------------------------
create or replace function app.can_read_results(p_workspace_id uuid, p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role(p_workspace_id, array['owner', 'admin', 'staff'])
      or exists (
           select 1
             from public.sections s
             join public.workspace_members m on m.id = s.class_teacher_id
            where s.id = p_section_id
              and s.workspace_id = p_workspace_id
              and m.user_id = auth.uid()
              and m.status = 'active'
              and m.role in ('owner', 'admin', 'teacher'))
$$;

comment on function app.can_read_results(uuid, uuid) is
  'F-AC-06 §3 (D-305): an active owner/admin/staff, or the section''s active '
  'class teacher.';

revoke all on function app.can_read_results(uuid, uuid) from public, anon;
grant execute on function app.can_read_results(uuid, uuid) to authenticated, service_role;

alter table public.results              enable row level security;
alter table public.result_subject_lines enable row level security;

drop policy if exists results_select on public.results;
create policy results_select on public.results
  for select to authenticated
  using (app.can_read_results(workspace_id, section_id));

drop policy if exists result_subject_lines_select on public.result_subject_lines;
create policy result_subject_lines_select on public.result_subject_lines
  for select to authenticated
  using (exists (select 1 from public.results r where r.id = result_id));

revoke all on public.results, public.result_subject_lines from anon, authenticated;
grant select on public.results, public.result_subject_lines to authenticated;
