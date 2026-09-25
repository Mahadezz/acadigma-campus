-- =====================================================================
-- F-AC-03 follow-ups (D-105).
--
--   * Any active teacher of the school may mark any section, so a
--     substitute can cover (owner decision 2026-09-26). The FORBIDDEN
--     guard (active owner/admin/teacher of this workspace) is the whole
--     rule now; app.can_mark_attendance and NOT_ASSIGNED are gone. Every
--     other guard is unchanged; the audit already records who saved.
--   * "Enrolled in the section on that date" (§5.3) is decided by
--     enrolled_on / ended_on alone, not the enrolment's current status, so
--     a student transferred out today still appears on last week's register.
--     A student with two enrolments in the section covering the date is
--     counted once (the later enrolment wins).
--   * An enrolment that is no longer active must say when it ended
--     (enrollments_closed_has_end), so the date rule above can never keep
--     a transferred or withdrawn student on a register by accident.
--   * save_attendance keeps the expected class list in a jsonb map instead
--     of two temp tables; attendance_day scopes its enrolment count by
--     workspace_id too.
-- =====================================================================

create or replace function public.save_attendance(p_workspace_id uuid, p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_key         text := p_input ->> 'idempotency_key';
  v_hash        bytea;
  v_prior       app.idempotency_keys;
  v_section     public.sections;
  v_year        public.academic_years;
  v_date        date;
  v_today       date;
  v_is_admin    boolean;
  v_late        boolean;
  v_member      uuid;
  v_session     public.attendance_sessions;
  v_enrolled    jsonb;  -- student_id -> enrollment_id, the expected class list
  v_expected    integer;
  v_given       integer;
  v_distinct    integer;
  v_invalid     integer;
  v_strangers   integer;
  v_bulk        boolean := coalesce((p_input ->> 'bulk_marked')::boolean, false);
  v_result      jsonb;
begin
  -- D-105: any active owner/admin/teacher of this school may mark any section.
  if v_uid is null or not app.has_role(p_workspace_id, array['owner', 'admin', 'teacher']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if jsonb_typeof(p_input) is distinct from 'object'
     or jsonb_typeof(p_input -> 'records') is distinct from 'array'
     or v_key is null
     or v_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(p_input ->> 'section_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(p_input ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  v_date := (p_input ->> 'date')::date;

  -- §5.11: a replayed save returns what the first one stored.
  perform pg_advisory_xact_lock(hashtext('save_attendance'), hashtext(v_key));
  v_hash := sha256(convert_to((p_input - 'idempotency_key')::text, 'UTF8'));
  select * into v_prior from app.idempotency_keys k
   where k.scope = 'save_attendance' and k.key = v_key;
  if found then
    if v_prior.user_id is distinct from v_uid
       or v_prior.workspace_id is distinct from p_workspace_id
       or v_prior.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return v_prior.response || jsonb_build_object('replayed', true);
  end if;

  -- The section row lock serialises two devices saving the same class.
  select * into v_section from public.sections s
   where s.id = (p_input ->> 'section_id')::uuid and s.workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'SECTION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_section.archived_at is not null then
    raise exception 'SECTION_ARCHIVED' using errcode = '22023';
  end if;
  select * into v_year from public.academic_years y where y.id = v_section.academic_year_id;
  if not v_year.is_current then
    raise exception 'YEAR_CLOSED' using errcode = '22023';
  end if;

  v_today := app.school_today(p_workspace_id);
  if v_date > v_today then
    raise exception 'FUTURE_DATE' using errcode = '22023';
  end if;
  if v_date < v_year.starts_on or v_date > v_year.ends_on then
    raise exception 'OUTSIDE_YEAR' using errcode = '22023';
  end if;
  v_is_admin := app.has_role(p_workspace_id, array['owner', 'admin']);
  v_late := v_today - v_date > app.attendance_edit_window_days(p_workspace_id);
  if v_late and not v_is_admin then
    raise exception 'OUTSIDE_EDIT_WINDOW' using errcode = '42501';
  end if;
  if not app.is_school_day(p_workspace_id, v_date)
     and not coalesce((p_input ->> 'allow_non_school_day')::boolean, false) then
    raise exception 'NOT_SCHOOL_DAY' using errcode = '22023';
  end if;

  -- §5.3: exactly the students enrolled in this section on this date.
  select coalesce(jsonb_object_agg(e.student_id, e.id order by e.enrolled_on), '{}'::jsonb)
    into v_enrolled
    from public.enrollments e
    join public.students st on st.id = e.student_id
   where e.section_id = v_section.id
     and e.workspace_id = p_workspace_id
     and e.enrolled_on <= v_date
     and (e.ended_on is null or e.ended_on >= v_date)
     and st.status = 'active'
     and st.deleted_at is null;
  select count(*) into v_expected from jsonb_object_keys(v_enrolled);
  if v_expected = 0 then
    raise exception 'NO_STUDENTS' using errcode = '22023';
  end if;

  begin
    select count(*),
           count(distinct g.student_id),
           count(*) filter (where g.student_id is null or g.status is null),
           count(*) filter (where not v_enrolled ? g.student_id::text)
      into v_given, v_distinct, v_invalid, v_strangers
      from jsonb_to_recordset(p_input -> 'records') as g(student_id uuid, status public.attendance_status);
  exception when invalid_text_representation or not_null_violation then
    raise exception 'VALIDATION' using errcode = '22023';
  end;
  if v_invalid > 0 or v_given <> v_distinct then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if v_strangers > 0 then
    raise exception 'STUDENT_NOT_ENROLLED' using errcode = '22023';
  end if;
  if v_given <> v_expected then
    raise exception 'UNMARKED_STUDENTS' using errcode = '22023';
  end if;

  select m.id into v_member from public.workspace_members m
   where m.workspace_id = p_workspace_id and m.user_id = v_uid and m.status = 'active';

  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;

  select * into v_session from public.attendance_sessions s
   where s.section_id = v_section.id and s.date = v_date
     for update;

  if found then
    -- Never a silent overwrite (AC4): the client names the version it loaded.
    if (p_input ->> 'expected_updated_at') is null
       or (p_input ->> 'expected_updated_at')::timestamptz is distinct from v_session.updated_at then
      raise exception 'CONFLICT' using errcode = '40001';
    end if;
    if v_session.status = 'locked' then
      raise exception 'SESSION_LOCKED' using errcode = '42501';
    end if;
  else
    insert into public.attendance_sessions
      (workspace_id, section_id, academic_year_id, date, taken_by, expected_count, created_by)
    values
      (p_workspace_id, v_section.id, v_section.academic_year_id, v_date, v_member, v_expected, v_uid)
    returning * into v_session;
  end if;

  insert into public.attendance_records
    (workspace_id, session_id, student_id, enrollment_id, status, marked_by, created_by)
  select p_workspace_id, v_session.id, g.student_id, (v_enrolled ->> g.student_id::text)::uuid,
         g.status, v_uid, v_uid
    from jsonb_to_recordset(p_input -> 'records') as g(student_id uuid, status public.attendance_status)
  on conflict (session_id, student_id) do update
     set status = excluded.status, marked_by = excluded.marked_by
   where public.attendance_records.status is distinct from excluded.status;

  update public.attendance_sessions s
     set expected_count      = v_expected,
         present_count       = c.present,
         absent_count        = c.absent,
         late_count          = c.late,
         excused_count       = c.excused,
         half_day_count      = c.half_day,
         bulk_marked_by      = case when v_bulk then v_member else s.bulk_marked_by end,
         bulk_marked_at      = case when v_bulk then now() else s.bulk_marked_at end,
         edited_after_window = s.edited_after_window or v_late
    from (select count(*) filter (where status = 'present')  as present,
                 count(*) filter (where status = 'absent')   as absent,
                 count(*) filter (where status = 'late')     as late,
                 count(*) filter (where status = 'excused')  as excused,
                 count(*) filter (where status = 'half_day') as half_day
            from public.attendance_records r where r.session_id = v_session.id) c
   where s.id = v_session.id
  returning s.* into v_session;

  v_result := jsonb_build_object(
    'session_id', v_session.id,
    'updated_at', v_session.updated_at,
    'expected', v_session.expected_count,
    'present', v_session.present_count,
    'absent', v_session.absent_count,
    'late', v_session.late_count,
    'excused', v_session.excused_count,
    'half_day', v_session.half_day_count);

  insert into app.idempotency_keys
    (scope, key, workspace_id, user_id, request_hash, status, response, completed_at)
  values
    ('save_attendance', v_key, p_workspace_id, v_uid, v_hash, 'succeeded', v_result, now());

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

comment on function public.save_attendance(uuid, jsonb) is
  'F-AC-03 §4.1 (D-104, D-105): saves a daily roll call — the session and '
  'every record — in one transaction. Any active owner/admin/teacher of the '
  'school, for any section (substitutes cover); a teacher only inside the '
  'edit window (admins beyond it, stamped edited_after_window); never a '
  'future date; a non-school day only with allow_non_school_day; exactly '
  'the students enrolled (enrolled_on..ended_on) on that date; a re-save '
  'must carry expected_updated_at. Raises FORBIDDEN, VALIDATION, '
  'IDEMPOTENCY_KEY_REUSED, SECTION_NOT_FOUND, SECTION_ARCHIVED, YEAR_CLOSED, '
  'FUTURE_DATE, OUTSIDE_YEAR, OUTSIDE_EDIT_WINDOW, NOT_SCHOOL_DAY, '
  'NO_STUDENTS, STUDENT_NOT_ENROLLED, UNMARKED_STUDENTS, CONFLICT, '
  'SESSION_LOCKED; PLAN_READ_ONLY comes from the table guard.';

revoke all on function public.save_attendance(uuid, jsonb) from public, anon;
grant execute on function public.save_attendance(uuid, jsonb) to authenticated;

-- Its only caller was the NOT_ASSIGNED check above.
drop function if exists app.can_mark_attendance(uuid, uuid);

-- ---------------------------------------------------------------------
-- public.attendance_day — unchanged except the enrolled count: by date
-- alone (§5.3, same rule as save_attendance) and scoped by workspace.
-- ---------------------------------------------------------------------
create or replace function public.attendance_day(p_workspace_id uuid, p_date date default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with d as (
    select coalesce(p_date, app.school_today(p_workspace_id)) as day,
           app.school_today(p_workspace_id) as today
  )
  select jsonb_build_object(
    'date', d.day,
    'today', d.today,
    'is_school_day', app.is_school_day(p_workspace_id, d.day),
    'edit_window_days', app.attendance_edit_window_days(p_workspace_id),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'section_id', s.id,
               'section_name', s.name,
               'grade_name', g.name,
               'grade_name_bn', g.name_bn,
               'class_teacher_name', nullif(btrim(p.full_name), ''),
               'is_mine', m.user_id is not distinct from auth.uid() and m.user_id is not null,
               'enrolled', (select count(distinct e.student_id) from public.enrollments e
                             join public.students st on st.id = e.student_id
                            where e.section_id = s.id
                              and e.workspace_id = p_workspace_id
                              and e.enrolled_on <= d.day
                              and (e.ended_on is null or e.ended_on >= d.day)
                              and st.status = 'active' and st.deleted_at is null),
               'session', (select jsonb_build_object(
                                    'id', a.id,
                                    'updated_at', a.updated_at,
                                    'taken_at', a.taken_at,
                                    'taken_by_name', nullif(btrim(tp.full_name), ''),
                                    'expected', a.expected_count,
                                    'present', a.present_count,
                                    'absent', a.absent_count,
                                    'late', a.late_count,
                                    'excused', a.excused_count,
                                    'half_day', a.half_day_count,
                                    'bulk_marked', a.bulk_marked_at is not null)
                             from public.attendance_sessions a
                             left join public.workspace_members tm on tm.id = a.taken_by
                             left join public.profiles tp on tp.id = tm.user_id
                            where a.section_id = s.id and a.date = d.day))
             order by g.level_number, s.name)
        from public.sections s
        join public.academic_years y on y.id = s.academic_year_id and y.is_current
        join public.grade_levels g on g.id = s.grade_level_id
        left join public.workspace_members m on m.id = s.class_teacher_id
        left join public.profiles p on p.id = m.user_id
       where s.workspace_id = p_workspace_id and s.archived_at is null), '[]'::jsonb))
  from d
$$;

comment on function public.attendance_day(uuid, date) is
  'F-AC-03 §6 Today (D-104, D-105): the day''s date, whether it is a school '
  'day, and every live section of the current year with its enrolled count '
  '(by enrolled_on/ended_on) and its session (or null). SECURITY INVOKER — '
  'RLS decides what the caller sees.';

revoke all on function public.attendance_day(uuid, date) from public, anon;
grant execute on function public.attendance_day(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- A closed enrolment has an end date (D-105). Nothing writes non-active
-- enrolments yet, so no existing row is affected.
-- ---------------------------------------------------------------------
alter table public.enrollments
  add constraint enrollments_closed_has_end check (status = 'active' or ended_on is not null);
