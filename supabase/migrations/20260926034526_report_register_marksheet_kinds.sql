-- =====================================================================
-- F-OP-03 Part 6 (attendance register + exam mark sheet, demo cut) — D-208.
--
-- Adds two report_kind values (additive, forward-only, same pattern as
-- 20260925300313_report_card_kind.sql / 20260926022716_report_card_bulk_kind.sql):
--   'attendance_register' — one section, one month, students x calendar days
--   'mark_sheet'           — one section x exam, students x papers from `results`
--
-- No shape change to report_runs/report_run_items and no RLS change: both
-- kinds are single-item, synchronous renders (D-205's precedent) that write
-- no report_run_items row, exactly like 'sample'/'report_card'. The existing
-- report_runs_select/report_runs_insert policies (300313, 022716) already
-- gate by role via ACTION_FOR_KIND at the application layer; nothing here
-- needs a per-kind RLS clause because neither kind is staff-visible (spec
-- §2: staff gets neither report.render.attendance_register nor
-- report.render.mark_sheet) and the existing policies do not special-case
-- kinds beyond the 'report_card' staff carve-out already shipped.
--
-- `attendance_register_signoffs` (spec §3.1a) is explicitly NOT built here —
-- see D-208: it is real schema/RLS/state-machine work (sign, countersign,
-- reopen, the PERIOD_LOCKED guard on attendance_records) that the task
-- scoped out of this demo cut, not a "tiny" follow-up.
-- =====================================================================
alter type public.report_kind add value if not exists 'attendance_register';
alter type public.report_kind add value if not exists 'mark_sheet';

-- =====================================================================
-- Review fix (PR #76 batch, D-208 BLOCKER): the attendance register read
-- (packages/db/src/repositories/attendance-register.ts) selected
-- `attendance_records` directly through PostgREST, which caps any single
-- response at `max_rows` (supabase/config.toml, 1000) — a 40-student x
-- 26-day month is already 1,040 records, so the register silently dropped
-- ~40 of them and both the "-" cells and the % column were wrong, with no
-- error anywhere. `public.attendance_register` returns the whole month
-- (calendar days, roster, records) as ONE jsonb value instead of three
-- paginated row sets — PostgREST's row cap applies to the number of ROWS in
-- a resultset, never to a function's single scalar return, so this is
-- immune to `max_rows` by construction, not by raising the limit.
--
-- SECURITY INVOKER, like `public.attendance_day`: every table this reads
-- (`sections`, `enrollments`, `students`, `attendance_sessions`,
-- `attendance_records`, `school_profiles`) already has its own RLS policy
-- for owner/admin/teacher/staff (F-AC-03 §5, D-104/D-105) — this function
-- adds no row-scoping of its own, it only reshapes what the CALLER's own
-- RLS already lets them see; `section` comes back null when the caller
-- cannot read that section at all (wrong school, or no membership).
-- `app.is_school_day` is the one exception (it is itself SECURITY DEFINER,
-- D-203) — calling it from an invoker function is the same pattern
-- `save_attendance` already uses.
--
-- The roster is every enrolment whose enrolled_on/ended_on window overlaps
-- the month, regardless of the enrolment's or student's current `status`
-- (review nit): a student who withdrew last week must not vanish from last
-- month's register. This is now the ONE place that rule lives — the
-- TypeScript reimplementation of `app.is_school_day`'s precedence
-- (`isSchoolDay`/`isoDayOfWeek`, packages/domain/src/calendar) is deleted;
-- the repository only shapes what this function already returns.
-- =====================================================================
create or replace function public.attendance_register(
  p_workspace_id uuid, p_section_id uuid, p_month date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select date_trunc('month', p_month)::date as starts_on,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as ends_on
  ),
  sect as (
    select s.id, s.name, g.name as grade_name
      from public.sections s
      join public.grade_levels g on g.id = s.grade_level_id
     where s.id = p_section_id and s.workspace_id = p_workspace_id
  ),
  days as (
    select gs::date as date
      from bounds cross join generate_series(bounds.starts_on, bounds.ends_on, interval '1 day') as gs
  ),
  sessions as (
    select a.date
      from public.attendance_sessions a cross join bounds
     where a.workspace_id = p_workspace_id
       and a.section_id = p_section_id
       and a.date between bounds.starts_on and bounds.ends_on
  ),
  roster as (
    select e.student_id, e.roll_number, e.enrolled_on, e.ended_on,
           st.full_name, st.full_name_bn
      from public.enrollments e
      join public.students st on st.id = e.student_id
      cross join bounds
     where e.section_id = p_section_id
       and e.workspace_id = p_workspace_id
       and e.enrolled_on <= bounds.ends_on
       and (e.ended_on is null or e.ended_on >= bounds.starts_on)
       and st.deleted_at is null
  ),
  recs as (
    select r.student_id, a.date, r.status
      from public.attendance_records r
      join public.attendance_sessions a on a.id = r.session_id
      cross join bounds
     where r.workspace_id = p_workspace_id
       and a.section_id = p_section_id
       and a.date between bounds.starts_on and bounds.ends_on
  )
  select case when exists (select 1 from sect) then jsonb_build_object(
    'section', (select jsonb_build_object('id', sect.id, 'name', sect.name, 'grade_name', sect.grade_name) from sect),
    'policy', jsonb_build_object(
      'late_counts_present', coalesce((select (sp.attendance_policy ->> 'late_counts_present')::boolean
                                          from public.school_profiles sp where sp.workspace_id = p_workspace_id), true),
      'half_day_counts_present', coalesce((select (sp.attendance_policy ->> 'half_day_counts_present')::boolean
                                              from public.school_profiles sp where sp.workspace_id = p_workspace_id), true)),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
               'date', d.date,
               'is_school_day', app.is_school_day(p_workspace_id, d.date),
               'session_taken', exists(select 1 from sessions s where s.date = d.date))
             order by d.date) from days d), '[]'::jsonb),
    'roster', coalesce((select jsonb_agg(jsonb_build_object(
               'student_id', r.student_id, 'roll_number', r.roll_number,
               'full_name', r.full_name, 'full_name_bn', r.full_name_bn,
               'enrolled_on', r.enrolled_on, 'ended_on', r.ended_on)) from roster r), '[]'::jsonb),
    'records', coalesce((select jsonb_agg(jsonb_build_object(
               'student_id', rc.student_id, 'date', rc.date, 'status', rc.status)) from recs rc), '[]'::jsonb)
  ) else jsonb_build_object('section', null) end
$$;

comment on function public.attendance_register(uuid, uuid, date) is
  'F-OP-03 Part 6 review (D-208 BLOCKER fix): the monthly attendance '
  'register''s whole data set (calendar days with app.is_school_day, the '
  'roster by enrolled_on/ended_on window, every record) as one jsonb value, '
  'immune to PostgREST''s max_rows (supabase/config.toml) because it returns '
  'one scalar, not N rows. SECURITY INVOKER: every underlying table''s own '
  'RLS decides what the caller sees; `section` is null when the caller '
  'cannot read that section at all.';

revoke all on function public.attendance_register(uuid, uuid, date) from public, anon;
grant execute on function public.attendance_register(uuid, uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- Review fix (SHOULD): a public wrapper so `createReportRun` can check
-- "can this caller read this section's results" BEFORE queuing a
-- mark_sheet run, instead of letting a forbidden read surface later as a
-- misleading "results not computed" render failure. `app` is not a
-- PostgREST-exposed schema (supabase/config.toml `schemas`), so the
-- existing `app.can_read_results` (F-AC-06 §3/D-305) needs a thin public
-- passthrough to be reachable from a server action's `.rpc()` call.
-- ---------------------------------------------------------------------
create or replace function public.can_read_results(p_workspace_id uuid, p_section_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.can_read_results(p_workspace_id, p_section_id)
$$;

comment on function public.can_read_results(uuid, uuid) is
  'F-OP-03 Part 6 review (D-208): public passthrough to app.can_read_results '
  '(F-AC-06 §3/D-305) so createReportRun can gate a mark_sheet run on real '
  'read access before creating it.';

revoke all on function public.can_read_results(uuid, uuid) from public, anon;
grant execute on function public.can_read_results(uuid, uuid) to authenticated;
