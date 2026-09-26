-- =====================================================================
-- F-ID-11 Part 2b (D-310): late sync of an offline roll call (§5.3), and
-- the queued_offline audit flag (AC-2).
--
--   * attendance_sessions.captured_at — the clock-corrected device time the
--     roll was taken, sent only by an offline replay (null for an online
--     save; the value of the latest save).
--   * attendance_sessions.queued_offline — generated (captured_at is not
--     null), so the generic audit row of every replayed save carries
--     queued_offline: true without a second writer.
--   * attendance_sessions.synced_late — sticky; set when a teacher's replay
--     was accepted outside the edit window under §5.3.
--   * save_attendance: a teacher's save outside the edit window is accepted
--     only when ALL hold — no session exists yet for the section and date
--     (the late path creates a register, it never edits one); captured_at
--     is >= the start of the session date (school timezone) and <= now();
--     captured_at falls inside the edit window for that date; and it arrives
--     within 7 days of captured_at. Then it is stamped synced_late and an
--     attendance.synced_late event records capture and arrival
--     time. Anything else is OUTSIDE_EDIT_WINDOW, as before. Every other
--     rule is unchanged.
--   * attendance_day returns synced_late with each session (admin overview).
-- =====================================================================

alter table public.attendance_sessions
  add column if not exists captured_at timestamptz,
  add column if not exists queued_offline boolean generated always as (captured_at is not null) stored,
  add column if not exists synced_late boolean not null default false;

comment on column public.attendance_sessions.captured_at is
  'F-ID-11 §3 (D-310): the clock-corrected device time the latest save was '
  'taken, sent only by an offline replay; null for an online save. Used only '
  'by the §5.3 late-sync bounds and the audit trail.';
comment on column public.attendance_sessions.queued_offline is
  'F-ID-11 AC-2 (D-310): the latest save was an offline replay. Generated '
  'from captured_at so the generic audit row carries it.';
comment on column public.attendance_sessions.synced_late is
  'F-ID-11 §5.3 (D-310): a teacher''s offline roll call accepted outside the '
  'edit window by the late-sync rule. Sticky.';

insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
values
  ('attendance.synced_late', 'notable',
    '{actor}''s roll call taken offline reached the server late',
    '{actor}-এর অফলাইনে নেওয়া হাজিরা দেরিতে সার্ভারে পৌঁছেছে', false)
on conflict (action) do update
  set severity    = excluded.severity,
      sentence_en = excluded.sentence_en,
      sentence_bn = excluded.sentence_bn,
      is_generic  = excluded.is_generic;

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
  v_captured    timestamptz;
  v_tz          text;
  v_synced_late boolean := false;
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
  -- D-310: an ISO timestamp with an offset, or nothing.
  if jsonb_typeof(p_input -> 'captured_at') is distinct from 'null' and p_input ? 'captured_at' then
    if coalesce(p_input ->> 'captured_at', '') !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$' then
      raise exception 'VALIDATION' using errcode = '22023';
    end if;
    v_captured := (p_input ->> 'captured_at')::timestamptz;
  end if;

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
    -- §5.3 (D-310): a roll taken offline inside its window, arriving within
    -- 7 days, may still create the register (no session yet: checked below).
    v_tz := coalesce(
      (select sp.timezone from public.school_profiles sp where sp.workspace_id = p_workspace_id),
      'Asia/Dhaka');
    if v_captured is null
       or v_captured < (v_date::timestamp at time zone v_tz)
       or v_captured > now()
       or (v_captured at time zone v_tz)::date - v_date > app.attendance_edit_window_days(p_workspace_id)
       or now() - v_captured > interval '7 days' then
      raise exception 'OUTSIDE_EDIT_WINDOW' using errcode = '42501';
    end if;
    v_synced_late := true;
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
    -- §5.3: the late path creates a register, it never edits one.
    if v_synced_late then
      raise exception 'OUTSIDE_EDIT_WINDOW' using errcode = '42501';
    end if;
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
      (workspace_id, section_id, academic_year_id, date, taken_by, expected_count, created_by,
       captured_at, synced_late)
    values
      (p_workspace_id, v_section.id, v_section.academic_year_id, v_date, v_member, v_expected, v_uid,
       v_captured, v_synced_late)
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
         edited_after_window = s.edited_after_window or v_late,
         captured_at         = v_captured
    from (select count(*) filter (where status = 'present')  as present,
                 count(*) filter (where status = 'absent')   as absent,
                 count(*) filter (where status = 'late')     as late,
                 count(*) filter (where status = 'excused')  as excused,
                 count(*) filter (where status = 'half_day') as half_day
            from public.attendance_records r where r.session_id = v_session.id) c
   where s.id = v_session.id
  returning s.* into v_session;

  if v_synced_late then
    perform app.log_audit_event('attendance.synced_late', p_workspace_id, 'attendance_sessions', v_session.id,
      null, jsonb_build_object('date', v_date, 'captured_at', v_captured, 'arrived_at', now()));
  end if;

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
  'SESSION_LOCKED; PLAN_READ_ONLY comes from the table guard. D-310: a '
  'teacher''s offline replay (captured_at) outside the window creates a '
  'missing register under the F-ID-11 §5.3 bounds, stamped synced_late.';

revoke all on function public.save_attendance(uuid, jsonb) from public, anon;
grant execute on function public.save_attendance(uuid, jsonb) to authenticated;

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
                                    'bulk_marked', a.bulk_marked_at is not null,
                                    'synced_late', a.synced_late)
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
  'F-AC-03 §6 Today (D-104, D-105, D-310 synced_late): the day''s date, whether it is a school '
  'day, and every live section of the current year with its enrolled count '
  '(by enrolled_on/ended_on) and its session (or null). SECURITY INVOKER — '
  'RLS decides what the caller sees.';

revoke all on function public.attendance_day(uuid, date) from public, anon;
grant execute on function public.attendance_day(uuid, date) to authenticated;
