-- =====================================================================
-- F-AC-06 Part 7 (demo cut) — publishing results and the parent read
-- (D-306). Builds on results (20260925300318, D-305), marks' publish gate
-- (20260925300312, D-304) and guardians (20260925300306, D-103).
--
--   * guardian_users — the link from a parent's account to a guardian row
--     (and so to one child). F-AC-02 §3's shape. No client write grant:
--     the invite/accept flow that creates links is F-AC-02 Part 4. Until
--     then no parent is linked in the product, so no parent reads a result.
--     app.is_guardian_of (declared in 20260917010000 against this table
--     before it existed) is redefined on the denormalised student_id.
--   * results gain published / published_at / published_by, a
--     withheld_reason, and frozen_payload: the report card's data
--     (ReportCardDto's shape) built in SQL at publish, so a later rename of
--     a subject, section or student, or later attendance edits, can never
--     change what a family was shown (§5.14). Every card read uses it when
--     present (packages/db getReportCard).
--   * public.publish_results(ws, exam, withhold) — owner/admin: sets each
--     withheld student's reason, then moves the exam marks_locked ->
--     published. That status change (from here or from setExamStatus)
--     runs D-304's MARKS_INCOMPLETE gate, then app.tg_exams_publish_results:
--     refused with NOT_COMPUTED when there are no results and
--     INCOMPLETE_PRESENT when any result is incomplete, so nothing
--     incomplete is ever published; otherwise every result is stamped
--     published with its frozen payload and one results.published event.
--   * Unpublish is the existing published -> marks_locked reversal with a
--     reason (D-303): results go back to unpublished, the frozen payload is
--     kept, one results.unpublished event carries the reason.
--   * RLS: a parent reads a result (and so its lines) only when it is
--     published, not withheld, and the parent is an active parent member of
--     that school linked to that child by an active guardian_users row.
--   * No notification fan-out: F-ID-07 has app.notify but no centre or
--     delivery yet (TODO D-306): results.published is the recorded event.
-- =====================================================================

-- ---------------------------------------------------------------------
-- guardian_users
-- ---------------------------------------------------------------------
do $$ begin
  create type public.guardian_link_status as enum ('invited', 'active', 'revoked');
exception when duplicate_object then null; end $$;

alter table public.guardians
  add constraint guardians_id_student_workspace_key unique (id, student_id, workspace_id);

create table if not exists public.guardian_users (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  guardian_id  uuid not null,
  student_id   uuid not null,   -- denormalised: app.is_guardian_of is one index probe
  user_id      uuid not null references public.profiles (id) on delete cascade,
  status       public.guardian_link_status not null default 'invited',
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  constraint guardian_users_guardian_user_key unique (guardian_id, user_id),
  -- The student is the guardian's own student, in the same school.
  constraint guardian_users_guardian_fkey
    foreign key (guardian_id, student_id, workspace_id)
    references public.guardians (id, student_id, workspace_id) on delete cascade
);

comment on table public.guardian_users is
  'F-AC-02 §3 (D-306): links a parent account to a guardian and so to one '
  'child. Only an active link lets a parent read anything (app.is_guardian_of). '
  'No client write grant: the invite/accept flow is F-AC-02 Part 4.';

create index if not exists guardian_users_active_probe_idx
  on public.guardian_users (user_id, student_id) where status = 'active';
-- justification: the exact probe in app.is_guardian_of().
create index if not exists guardian_users_workspace_idx on public.guardian_users (workspace_id);
create index if not exists guardian_users_created_by_idx
  on public.guardian_users (created_by) where created_by is not null;
-- justification: tenant key; FK column. guardian_id is the unique key's prefix.

select app.attach_freeze_workspace('public.guardian_users');
select app.attach_require_writable('public.guardian_users');
select app.attach_audit('public.guardian_users');

create trigger created_by_immutable before update on public.guardian_users
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['guardian_users'];
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

-- Curated actions (the publish trigger logs them).
insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
values
  ('results.published', 'notable', '{actor} published an exam''s results ({n})',
    '{actor} একটি পরীক্ষার ফলাফল প্রকাশ করেছেন ({n})', false),
  ('results.unpublished', 'notable', '{actor} unpublished an exam''s results ({n})',
    '{actor} একটি পরীক্ষার ফলাফল প্রকাশ বাতিল করেছেন ({n})', false)
on conflict (action) do update
  set severity    = excluded.severity,
      sentence_en = excluded.sentence_en,
      sentence_bn = excluded.sentence_bn,
      is_generic  = excluded.is_generic;

alter table public.guardian_users enable row level security;

drop policy if exists guardian_users_select on public.guardian_users;
create policy guardian_users_select on public.guardian_users
  for select to authenticated
  using (user_id = (select auth.uid()) or app.has_role(workspace_id, array['owner', 'admin']));

revoke all on public.guardian_users from anon, authenticated;
grant select on public.guardian_users to authenticated;

create or replace function app.is_guardian_of(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.guardian_users gu
     where gu.user_id = auth.uid()
       and gu.student_id = p_student_id
       and gu.status = 'active')
$$;

comment on function app.is_guardian_of(uuid) is
  'True when the caller has an active guardian_users link to the student. '
  'The only predicate a parent-scoped policy may use.';

-- ---------------------------------------------------------------------
-- results: publication columns
-- ---------------------------------------------------------------------
alter table public.results
  add column published       boolean not null default false,
  add column published_at    timestamptz,
  add column published_by    uuid references public.profiles (id) on delete set null,
  add column withheld_reason text
    check (withheld_reason is null or length(btrim(withheld_reason)) between 1 and 500),
  add column frozen_payload  jsonb,
  add constraint results_published_frozen check (not published or frozen_payload is not null);

comment on column public.results.frozen_payload is
  'F-AC-06 §5.14 (D-306): the report card (ReportCardDto shape) as published. '
  'Kept on unpublish; replaced on republish; gone only if results are recomputed.';

create index if not exists results_published_by_idx
  on public.results (published_by) where published_by is not null;
-- justification: FK column.

-- ---------------------------------------------------------------------
-- The report card's data for one result, frozen at publish. The same
-- values packages/db getReportCard builds live (D-305 item 9). A withheld
-- result freezes no marks at all (review of #75): the names, class and exam
-- only, with no subjects, totals, percentage, GPA, grade, rank or
-- attendance — what its family is shown, via public.family_results.
-- ---------------------------------------------------------------------
create or replace function app.result_card_payload(p_result_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'studentNameEn', st.full_name,
    'studentNameBn', coalesce(st.full_name_bn, st.full_name),
    'studentCode', st.student_code,
    'rollNumber', en.roll_number,
    'className', gl.name,
    'sectionName', sec.name,
    'examNameEn', ex.name,
    'examNameBn', ex.name,
    'subjects', case when w.withheld then '[]'::jsonb else (
      select jsonb_agg(jsonb_build_object(
               'subjectNameEn', l.subject_name,
               'subjectNameBn', coalesce(l.subject_name_bn, l.subject_name),
               'subjectKind', l.subject_kind,
               'status', coalesce(l.status::text, 'entered'),
               'marksObtained', l.obtained,
               'fullMarks', l.full_marks,
               'letter', l.letter,
               'gradePoint', l.grade_point) order by l.subject_name)
        from public.result_subject_lines l where l.result_id = r.id) end,
    'totalObtained', case when w.withheld then null else r.total_obtained end,
    'totalFull', case when w.withheld then null else r.total_full end,
    'percentage', case when w.withheld then null else r.percentage end,
    'gpa', case when w.withheld then null else r.gpa end,
    'gpaWithoutOptional', case when w.withheld then null else r.gpa_without_optional end,
    'overallLetter', case when w.withheld then null else r.letter end,
    'result', case when w.withheld then 'withheld' else r.result_status::text end,
    'rank', case when w.withheld then null else r.section_rank end,
    'rankTied', not w.withheld and r.section_rank is not null and exists (
      select 1 from public.results o
       where o.exam_id = r.exam_id and o.section_id = r.section_id
         and o.section_rank = r.section_rank and o.id <> r.id),
    'rankOf', case when w.withheld then null else (select nullif(count(*), 0) from public.results o
                where o.exam_id = r.exam_id and o.section_id = r.section_id
                  and o.section_rank is not null) end,
    'attendance', case when w.withheld then null else jsonb_build_object(
      'presentDays', a.present,
      'totalDays', a.total,
      'percent', a.pct,
      'belowMinimum', coalesce(a.pct * 100 < coalesce((sp.attendance_policy ->> 'min_attendance_bp')::numeric, 7500), false)) end)
    from public.results r
    cross join lateral (select r.withheld_reason is not null as withheld) w
    join public.students st on st.id = r.student_id
    join public.enrollments en on en.id = r.enrollment_id
    join public.sections sec on sec.id = r.section_id
    join public.grade_levels gl on gl.id = sec.grade_level_id
    join public.exams ex on ex.id = r.exam_id
    join public.academic_years y on y.id = ex.academic_year_id
    left join public.school_profiles sp on sp.workspace_id = r.workspace_id
    cross join lateral (
      select c.total, c.present,
             case when c.total > 0 then app.round_half_up(100.0 * c.present / c.total, 0) end as pct
        from (select count(*)::int as total,
                     coalesce(sum(case ar.status
                       when 'present' then 1
                       when 'late' then case when coalesce((sp.attendance_policy ->> 'late_counts_present')::boolean, true) then 1 else 0 end
                       when 'half_day' then case when coalesce((sp.attendance_policy ->> 'half_day_counts_present')::boolean, true) then 1 else 0 end
                       else 0 end), 0)::int as present
                from public.attendance_records ar
                join public.attendance_sessions s on s.id = ar.session_id
               where ar.workspace_id = r.workspace_id
                 and ar.student_id = r.student_id
                 and s.date between y.starts_on and coalesce(ex.ends_on, current_date)) c
    ) a
   where r.id = p_result_id
$$;

revoke all on function app.result_card_payload(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Publishing and unpublishing follow the exam's status, whichever path
-- changes it (publish_results or setExamStatus).
-- ---------------------------------------------------------------------
create or replace function app.tg_exams_publish_results()
returns trigger
language plpgsql
security definer   -- results have no client write grant
set search_path = ''
as $$
declare
  v_count    integer;
  v_withheld jsonb;
begin
  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;

  if new.status = 'published' then
    if not exists (select 1 from public.results r where r.exam_id = new.id) then
      raise exception 'NOT_COMPUTED' using errcode = '22023';
    end if;
    if exists (select 1 from public.results r
                where r.exam_id = new.id and r.result_status = 'incomplete') then
      raise exception 'INCOMPLETE_PRESENT' using errcode = '22023';
    end if;

    update public.results r
       set published = true, published_at = now(), published_by = auth.uid(),
           frozen_payload = app.result_card_payload(r.id)
     where r.exam_id = new.id;
    get diagnostics v_count = row_count;

    select coalesce(jsonb_agg(r.student_id order by r.student_id), '[]'::jsonb) into v_withheld
      from public.results r where r.exam_id = new.id and r.withheld_reason is not null;
    perform app.log_audit_event('results.published', new.workspace_id, 'exams', new.id, null,
      jsonb_build_object('published', v_count - jsonb_array_length(v_withheld),
                         'withheld', jsonb_array_length(v_withheld),
                         'withheld_student_ids', v_withheld));
    -- TODO(D-306): result.published fan-out to guardians once F-ID-07 delivers.
  else   -- published -> marks_locked: unpublish, keeping the frozen payload
    update public.results r set published = false where r.exam_id = new.id and r.published;
    get diagnostics v_count = row_count;
    perform app.log_audit_event('results.unpublished', new.workspace_id, 'exams', new.id, null,
      jsonb_build_object('unpublished', v_count, 'reason', new.status_reason));
  end if;
  return null;
end;
$$;

revoke all on function app.tg_exams_publish_results() from public, anon, authenticated;

create trigger exams_publish_results
  after update of status on public.exams
  for each row
  when ((new.status = 'published' and old.status is distinct from 'published')
     or (old.status = 'published' and new.status = 'marks_locked'))
  execute function app.tg_exams_publish_results();

-- ---------------------------------------------------------------------
-- public.publish_results — §7 publishResults (demo cut): owner/admin.
-- p_withhold: [{"student_id": uuid, "reason": text}, ...]
-- ---------------------------------------------------------------------
create or replace function public.publish_results(
  p_workspace_id uuid, p_exam_id uuid, p_withhold jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_exam public.exams;
begin
  if auth.uid() is null or not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_exam from public.exams e
   where e.id = p_exam_id and e.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'EXAM_NOT_FOUND' using errcode = '22023';
  end if;
  if v_exam.status <> 'marks_locked' then
    raise exception 'MARKS_NOT_LOCKED' using errcode = '22023';
  end if;

  p_withhold := coalesce(p_withhold, '[]'::jsonb);
  if jsonb_typeof(p_withhold) <> 'array' then
    raise exception 'VALIDATION' using errcode = '22023', detail = 'withhold must be an array';
  end if;
  if exists (
       select 1 from jsonb_array_elements(p_withhold) w
        where jsonb_typeof(w) <> 'object'
           or length(btrim(coalesce(w ->> 'reason', ''))) not between 1 and 500
           or not exists (select 1 from public.results r
                           where r.exam_id = p_exam_id
                             and r.student_id::text = w ->> 'student_id')) then
    raise exception 'VALIDATION' using errcode = '22023',
      detail = 'withhold: each entry needs a student with a result and a reason (1-500 characters)';
  end if;

  update public.results r
     set withheld_reason = (select btrim(w ->> 'reason') from jsonb_array_elements(p_withhold) w
                             where w ->> 'student_id' = r.student_id::text limit 1)
   where r.exam_id = p_exam_id;

  update public.exams set status = 'published' where id = p_exam_id;

  return (select jsonb_build_object(
                   'published', count(*) filter (where r.withheld_reason is null),
                   'withheld', count(*) filter (where r.withheld_reason is not null))
            from public.results r where r.exam_id = p_exam_id);
end;
$$;

comment on function public.publish_results(uuid, uuid, jsonb) is
  'F-AC-06 §7 publishResults (Part 7 demo cut, D-306): owner/admin. Sets the '
  'withheld students'' reasons and publishes the exam, which freezes every '
  'result (app.tg_exams_publish_results). Raises FORBIDDEN, EXAM_NOT_FOUND, '
  'MARKS_NOT_LOCKED, VALIDATION, MARKS_INCOMPLETE, NOT_COMPUTED, '
  'INCOMPLETE_PRESENT; PLAN_READ_ONLY from the table guard.';

revoke all on function public.publish_results(uuid, uuid, jsonb) from public, anon;
grant execute on function public.publish_results(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- RLS: a parent reads their own linked child's published, non-withheld
-- result. Lines follow their result (results_select_lines' EXISTS runs
-- under the caller's RLS).
-- ---------------------------------------------------------------------
drop policy if exists results_select_guardian on public.results;
create policy results_select_guardian on public.results
  for select to authenticated
  using (published
         and withheld_reason is null
         and app.has_role(workspace_id, array['parent'])
         and app.is_guardian_of(student_id));

-- ---------------------------------------------------------------------
-- public.family_results — the parent's results list (F-AC-10, D-306).
-- The RLS policy above never returns a withheld row, because RLS cannot
-- hide columns per role (the raw GPA and lines would reach the parent).
-- This function returns every published result of the caller's linked
-- children in this school, withheld ones included, as (exam, student,
-- published_at, withheld, card): the card is the frozen payload, which for
-- a withheld result carries no marks. The reason is never returned.
-- ---------------------------------------------------------------------
create or replace function public.family_results(p_workspace_id uuid)
returns table (exam_id uuid, student_id uuid, published_at timestamptz, withheld boolean, card jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.exam_id, r.student_id, r.published_at, r.withheld_reason is not null, r.frozen_payload
    from public.results r
   where r.workspace_id = p_workspace_id
     and r.published
     and app.has_role(p_workspace_id, array['parent'])
     and app.is_guardian_of(r.student_id)
   order by r.published_at desc, r.student_id
$$;

comment on function public.family_results(uuid) is
  'F-AC-10 results tab (D-306): the caller''s linked children''s published '
  'results with their frozen cards; withheld ones flagged, with no marks and '
  'no reason. Empty for anyone who is not an active parent of the school.';

revoke all on function public.family_results(uuid) from public, anon;
grant execute on function public.family_results(uuid) to authenticated;
