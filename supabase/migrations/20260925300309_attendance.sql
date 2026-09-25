-- =====================================================================
-- F-AC-03 demo cut — daily roll call (Parts 1-3 core; D-104).
--
-- Builds on sections (D-102), students/enrollments (D-103) and the school
-- calendar (D-202/D-203). Same trigger set as every tenant table: tenant
-- freeze, updated_at, generic audit + catalogue rows, require_writable
-- (D-300), immutable created_by.
--
-- The rules live in the database:
--   * one session per section per date (unique index), one record per
--     student per session (unique index);
--   * sessions and records are written ONLY by public.save_attendance
--     (no INSERT/UPDATE/DELETE grant): the section's class teacher or an
--     owner/admin, inside the edit window for a teacher, never in the
--     future, on a school day unless explicitly overridden, for exactly the
--     students enrolled in the section on that date (§5.3);
--   * "Mark all present" is a flag on the save that stamps bulk_marked_by /
--     bulk_marked_at (D-22) — nothing is ever presumed present;
--   * two devices never silently overwrite each other: a re-save must name
--     the version it loaded (CONFLICT otherwise);
--   * every foreign key between tenant rows is composite with workspace_id.
-- =====================================================================

do $$ begin
  create type public.attendance_status as enum ('present', 'absent', 'late', 'excused', 'half_day');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_session_status as enum ('draft', 'submitted', 'locked');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- attendance_sessions — one roll call per section per date
-- ---------------------------------------------------------------------
create table if not exists public.attendance_sessions (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  section_id          uuid not null,
  academic_year_id    uuid not null,
  date                date not null,
  status              public.attendance_session_status not null default 'submitted',
  taken_by            uuid,
  taken_at            timestamptz not null default now(),
  expected_count      integer not null check (expected_count >= 0),
  present_count       integer not null default 0 check (present_count >= 0),
  absent_count        integer not null default 0 check (absent_count >= 0),
  late_count          integer not null default 0 check (late_count >= 0),
  excused_count       integer not null default 0 check (excused_count >= 0),
  half_day_count      integer not null default 0 check (half_day_count >= 0),
  bulk_marked_by      uuid,
  bulk_marked_at      timestamptz,
  edited_after_window boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id) on delete set null,
  constraint attendance_sessions_id_workspace_key unique (id, workspace_id),
  constraint attendance_sessions_section_fkey
    foreign key (section_id, academic_year_id, workspace_id)
    references public.sections (id, academic_year_id, workspace_id),
  constraint attendance_sessions_taken_by_fkey
    foreign key (taken_by, workspace_id) references public.workspace_members (id, workspace_id)
    on delete set null (taken_by),
  constraint attendance_sessions_bulk_marked_by_fkey
    foreign key (bulk_marked_by, workspace_id) references public.workspace_members (id, workspace_id)
    on delete set null (bulk_marked_by),
  constraint attendance_sessions_bulk_pair
    check (bulk_marked_by is null or bulk_marked_at is not null)
);

comment on table public.attendance_sessions is
  'F-AC-03 / DATA-MODEL.md §2: one daily roll call per section per date. '
  'Counts are a cache written with the records by public.save_attendance. '
  'bulk_marked_by/at record the audited "Mark all present" (D-22). Written '
  'only by save_attendance (D-104).';

create unique index if not exists attendance_sessions_section_date_key
  on public.attendance_sessions (section_id, date);
-- justification: §3, one session per section per date (daily mode; period
-- mode widens the key when it ships).
create index if not exists attendance_sessions_workspace_date_idx
  on public.attendance_sessions (workspace_id, date);
-- justification: the "today" matrix and the dashboard.
create index if not exists attendance_sessions_taken_by_idx
  on public.attendance_sessions (taken_by) where taken_by is not null;
create index if not exists attendance_sessions_bulk_marked_by_idx
  on public.attendance_sessions (bulk_marked_by) where bulk_marked_by is not null;
create index if not exists attendance_sessions_created_by_idx
  on public.attendance_sessions (created_by) where created_by is not null;

-- ---------------------------------------------------------------------
-- attendance_records — one student's status in one session
-- ---------------------------------------------------------------------
create table if not exists public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  session_id    uuid not null,
  student_id    uuid not null,
  enrollment_id uuid not null,
  status        public.attendance_status not null,
  marked_by     uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id) on delete set null,
  constraint attendance_records_session_fkey
    foreign key (session_id, workspace_id) references public.attendance_sessions (id, workspace_id)
    on delete cascade,
  constraint attendance_records_student_fkey
    foreign key (student_id, workspace_id) references public.students (id, workspace_id),
  constraint attendance_records_enrollment_fkey
    foreign key (enrollment_id, workspace_id) references public.enrollments (id, workspace_id)
);

comment on table public.attendance_records is
  'F-AC-03 / DATA-MODEL.md §2: one student''s status in one session, tied to '
  'the enrolment it was taken under (so a transfer never rewrites history). '
  'Written only by public.save_attendance (D-104).';

create unique index if not exists attendance_records_session_student_key
  on public.attendance_records (session_id, student_id);
-- justification: §3, one record per student per session.
create index if not exists attendance_records_workspace_student_idx
  on public.attendance_records (workspace_id, student_id);
-- justification: every per-student percentage.
create index if not exists attendance_records_enrollment_idx
  on public.attendance_records (enrollment_id);
create index if not exists attendance_records_marked_by_idx
  on public.attendance_records (marked_by) where marked_by is not null;
create index if not exists attendance_records_created_by_idx
  on public.attendance_records (created_by) where created_by is not null;

-- ---------------------------------------------------------------------
-- Triggers, audit catalogue
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.attendance_sessions');
select app.attach_updated_at('public.attendance_sessions');
select app.attach_audit('public.attendance_sessions');
select app.attach_require_writable('public.attendance_sessions');
select app.attach_freeze_workspace('public.attendance_records');
select app.attach_updated_at('public.attendance_records');
select app.attach_require_writable('public.attendance_records');

-- §4.1 Audit: the first save is covered by the session row (counts, bulk
-- stamp); a record is audited when it CHANGES afterwards, never 40 rows per
-- morning.
drop trigger if exists audit_public_attendance_records on public.attendance_records;
create trigger audit_public_attendance_records
  after update or delete on public.attendance_records
  for each row execute function app.tg_audit('', '');

create trigger created_by_immutable before update on public.attendance_sessions
  for each row execute function app.tg_created_by_immutable();
create trigger created_by_immutable before update on public.attendance_records
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['attendance_sessions', 'attendance_records'];
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

-- A re-save touches the session row every morning: info, not notable.
update public.audit_action_catalog set severity = 'info' where action = 'attendance_sessions.update';

-- ---------------------------------------------------------------------
-- RLS: read for owner/admin/teacher/staff (teachers substitute, §2);
-- parents read through their portal later (F-AC-10); no write grant.
-- ---------------------------------------------------------------------
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

drop policy if exists attendance_sessions_select on public.attendance_sessions;
create policy attendance_sessions_select on public.attendance_sessions
  for select to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff']));

drop policy if exists attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records
  for select to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff']));

revoke all on public.attendance_sessions, public.attendance_records from anon, authenticated;
grant select on public.attendance_sessions, public.attendance_records to authenticated;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- §5.14: "today" is the school's calendar date, computed in SQL.
create or replace function app.school_today(p_workspace_id uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
            (select sp.timezone from public.school_profiles sp where sp.workspace_id = p_workspace_id),
            'Asia/Dhaka'))::date
$$;

comment on function app.school_today(uuid) is
  'F-AC-03 §5.14 (D-104): the calendar date now in the school''s timezone '
  '(Asia/Dhaka when unset). Reveals nothing beyond a timezone.';

revoke all on function app.school_today(uuid) from public, anon;
grant execute on function app.school_today(uuid) to authenticated, service_role;

-- §5.9: a teacher may change a day up to N days back (default 2).
create or replace function app.attendance_edit_window_days(p_workspace_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(sp.attendance_policy -> 'edit_window_days') = 'number'
                 then greatest(0, least(31, (sp.attendance_policy ->> 'edit_window_days')::int)) end
       from public.school_profiles sp where sp.workspace_id = p_workspace_id),
    2)
$$;

revoke all on function app.attendance_edit_window_days(uuid) from public, anon;
grant execute on function app.attendance_edit_window_days(uuid) to authenticated, service_role;

-- §2: who may mark a section — an active owner/admin, or the section's
-- active class teacher (still an owner/admin/teacher).
create or replace function app.can_mark_attendance(p_workspace_id uuid, p_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role(p_workspace_id, array['owner', 'admin'])
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

revoke all on function app.can_mark_attendance(uuid, uuid) from public, anon;
grant execute on function app.can_mark_attendance(uuid, uuid) to authenticated, service_role;

-- §5.4: the ONE percentage. Present counts 1; late and half day count 1
-- unless the school's policy says otherwise; excused and absent count 0;
-- every record is in the denominator. Mirrored by
-- packages/domain/src/attendance/percentage.ts (same fixtures in both
-- test suites). SECURITY INVOKER: the caller's RLS decides what it sees.
create or replace function app.attendance_pct(
  p_workspace_id uuid, p_student_id uuid, p_from date, p_to date)
returns numeric
language sql
stable
set search_path = ''
as $$
  with policy as (
    select coalesce((sp.attendance_policy ->> 'late_counts_present')::boolean, true) as late_ok,
           coalesce((sp.attendance_policy ->> 'half_day_counts_present')::boolean, true) as half_ok
      from (select 1) one
      left join public.school_profiles sp on sp.workspace_id = p_workspace_id
  ),
  recs as (
    select r.status
      from public.attendance_records r
      join public.attendance_sessions s on s.id = r.session_id
     where r.workspace_id = p_workspace_id
       and r.student_id = p_student_id
       and s.date between p_from and p_to
  )
  select case when count(*) = 0 then 0::numeric
         else round(100.0 * sum(case r.status
                                  when 'present' then 1
                                  when 'late' then case when p.late_ok then 1 else 0 end
                                  when 'half_day' then case when p.half_ok then 1 else 0 end
                                  else 0 end) / count(*), 2)
         end
    from recs r cross join policy p
$$;

comment on function app.attendance_pct(uuid, uuid, date, date) is
  'F-AC-03 §5.4 (D-104): a student''s attendance percentage over a date range, '
  'rounded to 2 places, 0 with no records. The single SQL implementation; '
  'packages/domain attendancePercentage is its mirror.';

revoke all on function app.attendance_pct(uuid, uuid, date, date) from public, anon;
grant execute on function app.attendance_pct(uuid, uuid, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- public.save_attendance — §4.1 save, the only writer.
-- ---------------------------------------------------------------------
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
  v_expected    integer;
  v_given       integer;
  v_bulk        boolean := coalesce((p_input ->> 'bulk_marked')::boolean, false);
  v_result      jsonb;
begin
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

  if not app.can_mark_attendance(p_workspace_id, v_section.id) then
    raise exception 'NOT_ASSIGNED' using errcode = '42501';
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
  create temp table if not exists pg_temp.att_expected (student_id uuid primary key, enrollment_id uuid) on commit drop;
  create temp table if not exists pg_temp.att_given (student_id uuid, status public.attendance_status) on commit drop;
  truncate pg_temp.att_expected, pg_temp.att_given;

  insert into pg_temp.att_expected
  select e.student_id, e.id
    from public.enrollments e
    join public.students st on st.id = e.student_id
   where e.section_id = v_section.id
     and e.workspace_id = p_workspace_id
     and e.status = 'active'
     and e.enrolled_on <= v_date
     and (e.ended_on is null or e.ended_on >= v_date)
     and st.status = 'active'
     and st.deleted_at is null;
  get diagnostics v_expected = row_count;
  if v_expected = 0 then
    raise exception 'NO_STUDENTS' using errcode = '22023';
  end if;

  begin
    insert into pg_temp.att_given
    select x.student_id, x.status
      from jsonb_to_recordset(p_input -> 'records') as x(student_id uuid, status public.attendance_status);
  exception when invalid_text_representation or not_null_violation then
    raise exception 'VALIDATION' using errcode = '22023';
  end;

  if exists (select 1 from pg_temp.att_given g where g.student_id is null or g.status is null)
     or (select count(*) from pg_temp.att_given) <> (select count(distinct g.student_id) from pg_temp.att_given g) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.att_given g
              where not exists (select 1 from pg_temp.att_expected x where x.student_id = g.student_id)) then
    raise exception 'STUDENT_NOT_ENROLLED' using errcode = '22023';
  end if;
  select count(*) into v_given from pg_temp.att_given;
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
  select p_workspace_id, v_session.id, g.student_id, x.enrollment_id, g.status, v_uid, v_uid
    from pg_temp.att_given g
    join pg_temp.att_expected x on x.student_id = g.student_id
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
  'F-AC-03 §4.1 (D-104): saves a daily roll call — the session and every '
  'record — in one transaction. Only the class teacher or an owner/admin; '
  'a teacher only inside the edit window (admins beyond it, stamped '
  'edited_after_window); never a future date; a non-school day only with '
  'allow_non_school_day; exactly the students enrolled on that date; a '
  're-save must carry expected_updated_at. Raises FORBIDDEN, VALIDATION, '
  'IDEMPOTENCY_KEY_REUSED, SECTION_NOT_FOUND, SECTION_ARCHIVED, YEAR_CLOSED, '
  'NOT_ASSIGNED, FUTURE_DATE, OUTSIDE_YEAR, OUTSIDE_EDIT_WINDOW, '
  'NOT_SCHOOL_DAY, NO_STUDENTS, STUDENT_NOT_ENROLLED, UNMARKED_STUDENTS, '
  'CONFLICT, SESSION_LOCKED; PLAN_READ_ONLY comes from the table guard.';

revoke all on function public.save_attendance(uuid, jsonb) from public, anon;
grant execute on function public.save_attendance(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- public.attendance_day — §6 "Today": every live section of the current
-- year with its session for the day (or none). SECURITY INVOKER: the
-- caller's RLS on sections, enrollments and sessions decides what shows.
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
               'enrolled', (select count(*) from public.enrollments e
                             join public.students st on st.id = e.student_id
                            where e.section_id = s.id and e.status = 'active'
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
  'F-AC-03 §6 Today (D-104): the day''s date, whether it is a school day, and '
  'every live section of the current year with its enrolled count and its '
  'session (or null). SECURITY INVOKER — RLS decides what the caller sees.';

revoke all on function public.attendance_day(uuid, date) from public, anon;
grant execute on function public.attendance_day(uuid, date) to authenticated;
