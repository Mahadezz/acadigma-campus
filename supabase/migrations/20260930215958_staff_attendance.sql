-- =====================================================================
-- F-AC-04 Part 1 (D-214) — staff attendance and self check-in.
--
--   1. enums staff_attendance_status, staff_attendance_source
--   2. public.staff_attendance — one row per member per date; NO write grant
--   3. app.staff_attendance_policy — code defaults (no policy table yet)
--   4. public.staff_check_in / staff_check_out / staff_attendance_today
--   5. audit_action_catalog rows for the generic audit trigger
--
-- Writes are RPC-only (like public.save_attendance): the functions take no
-- time, date or status from the caller, so a row cannot be back-dated or
-- forged; the time is the server's, the date the school's (Asia/Dhaka unless
-- school_profiles.timezone says otherwise). Self-service writes only
-- present / late; it never writes half_day and never overwrites a status on
-- check-out. Non-school days get no row (lead decision 2026-10-01).
-- =====================================================================

do $$ begin
  create type public.staff_attendance_status as enum
    ('present', 'absent', 'late', 'half_day', 'on_leave', 'holiday', 'weekend', 'official_duty');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_attendance_source as enum ('self', 'admin', 'leave', 'auto', 'import');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. staff_attendance
-- ---------------------------------------------------------------------
create table if not exists public.staff_attendance (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  member_id     uuid not null,
  date          date not null,
  status        public.staff_attendance_status not null,
  check_in_at   timestamptz,
  check_out_at  timestamptz,
  minutes_late  integer check (minutes_late is null or minutes_late >= 0),
  source        public.staff_attendance_source not null default 'self',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint staff_attendance_member_fkey
    foreign key (member_id, workspace_id)
    references public.workspace_members (id, workspace_id) on delete cascade,
  constraint staff_attendance_member_date_key unique (member_id, date),
  constraint staff_attendance_out_after_in
    check (check_out_at is null or (check_in_at is not null and check_out_at >= check_in_at))
);

comment on table public.staff_attendance is
  'F-AC-04 §3 (D-214): one row per staff member per date. Written only by '
  'public.staff_check_in / staff_check_out (no write grant). Self-service '
  'writes present or late only; the admin grid, leave and derived '
  'weekend/holiday statuses arrive in later Parts.';

-- justification: the daily summary and the missed-punch job scan a date.
create index if not exists staff_attendance_workspace_date_idx
  on public.staff_attendance (workspace_id, date);

alter table public.staff_attendance enable row level security;

-- A member reads their own rows; owner/admin read the whole workspace.
create policy staff_attendance_select on public.staff_attendance
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin'])
    or exists (
      select 1
        from public.workspace_members m
       where m.id = staff_attendance.member_id
         and m.workspace_id = staff_attendance.workspace_id
         and m.user_id = (select auth.uid())
         and m.status = 'active'
    )
    or (select app.is_platform_admin())
  );

revoke all on public.staff_attendance from anon, authenticated;
grant select on public.staff_attendance to authenticated;

select app.attach_updated_at('public.staff_attendance');
select app.attach_freeze_workspace('public.staff_attendance');
select app.attach_audit('public.staff_attendance');
select app.attach_require_writable('public.staff_attendance');

-- ---------------------------------------------------------------------
-- 3. Policy defaults (D-214 point 5). One place, so the admin-editable
--    school_profiles.staff_attendance_policy can replace it later.
-- ---------------------------------------------------------------------
create or replace function app.staff_attendance_policy(p_workspace_id uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"on_time_until": "08:00", "grace_minutes": 10}'::jsonb
$$;

revoke all on function app.staff_attendance_policy(uuid) from public, anon;

-- ---------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------
create or replace function app.staff_row_json(p_row public.staff_attendance)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_row.id,
    'date', p_row.date,
    'status', p_row.status,
    'check_in_at', p_row.check_in_at,
    'check_out_at', p_row.check_out_at,
    'minutes_late', p_row.minutes_late
  )
$$;

revoke all on function app.staff_row_json(public.staff_attendance) from public, anon;

-- The caller's active staff membership in the workspace (owner, admin,
-- teacher or staff — a parent has no staff attendance). NULL when none.
create or replace function app.staff_member_id(p_workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
    from public.workspace_members m
   where m.workspace_id = p_workspace_id
     and m.user_id = auth.uid()
     and m.status = 'active'
     and m.role::text in ('owner', 'admin', 'teacher', 'staff')
$$;

revoke all on function app.staff_member_id(uuid) from public, anon;

-- The whole status rule in one pure function, so its boundaries are tested
-- directly (a pgTAP run cannot move now()). Late only once the grace has
-- passed; minutes_late counts from the on-time time, never from the grace.
create or replace function app.staff_check_in_status(p_local time, p_start time, p_grace integer)
returns table (status public.staff_attendance_status, minutes_late integer)
language sql
immutable
set search_path = ''
as $
  with m as (
    select greatest(0, floor(extract(epoch from (p_local - p_start)) / 60)::integer) as mins
  )
  select case when m.mins > p_grace then 'late'::public.staff_attendance_status
              else 'present'::public.staff_attendance_status end,
         case when m.mins > p_grace then m.mins else null end
    from m
$;

revoke all on function app.staff_check_in_status(time, time, integer) from public, anon;

create or replace function public.staff_attendance_today(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member uuid := app.staff_member_id(p_workspace_id);
  v_today  date;
  v_row    public.staff_attendance;
begin
  if auth.uid() is null or v_member is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_today := app.school_today(p_workspace_id);
  select * into v_row from public.staff_attendance
   where member_id = v_member and date = v_today;
  return jsonb_build_object(
    'today', v_today,
    'is_school_day', coalesce(app.is_school_day(p_workspace_id, v_today), false),
    'record', case when v_row.id is null then null else app.staff_row_json(v_row) end
  );
end;
$$;

create or replace function public.staff_check_in(p_workspace_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member  uuid := app.staff_member_id(p_workspace_id);
  v_tz      text;
  v_now     timestamptz := now();
  v_local   timestamp;
  v_today   date;
  v_policy  jsonb := app.staff_attendance_policy(p_workspace_id);
  v_start   time := (v_policy ->> 'on_time_until')::time;
  v_grace   integer := (v_policy ->> 'grace_minutes')::integer;
  v_st      record;
  v_row     public.staff_attendance;
begin
  if auth.uid() is null or v_member is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_tz := coalesce(
    (select sp.timezone from public.school_profiles sp where sp.workspace_id = p_workspace_id),
    'Asia/Dhaka');
  v_local := v_now at time zone v_tz;
  v_today := v_local::date;

  if not coalesce(app.is_school_day(p_workspace_id, v_today), false) then
    raise exception 'NOT_SCHOOL_DAY' using errcode = '22023';
  end if;

  select * into v_st from app.staff_check_in_status(v_local::time, v_start, v_grace);

  insert into public.staff_attendance
    (workspace_id, member_id, date, status, check_in_at, minutes_late, source)
  values
    (p_workspace_id, v_member, v_today, v_st.status, v_now, v_st.minutes_late, 'self')
  on conflict (member_id, date) do nothing
  returning * into v_row;

  -- A second tap (or a race) returns the existing row unchanged.
  if v_row.id is null then
    select * into v_row from public.staff_attendance
     where member_id = v_member and date = v_today;
  end if;
  return app.staff_row_json(v_row);
end;
$$;

create or replace function public.staff_check_out(p_workspace_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_member uuid := app.staff_member_id(p_workspace_id);
  v_today  date;
  v_row    public.staff_attendance;
begin
  if auth.uid() is null or v_member is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_today := app.school_today(p_workspace_id);

  select * into v_row from public.staff_attendance
   where member_id = v_member and date = v_today and check_in_at is not null;
  if v_row.id is null then
    raise exception 'NOT_CHECKED_IN' using errcode = '22023';
  end if;
  if v_row.check_out_at is not null then
    return app.staff_row_json(v_row);  -- idempotent: the first check-out stands
  end if;

  update public.staff_attendance
     set check_out_at = greatest(now(), check_in_at)
   where id = v_row.id
  returning * into v_row;
  return app.staff_row_json(v_row);
end;
$$;

revoke all on function public.staff_attendance_today(uuid) from public, anon;
revoke all on function public.staff_check_in(uuid) from public, anon;
revoke all on function public.staff_check_out(uuid) from public, anon;
grant execute on function public.staff_attendance_today(uuid) to authenticated;
grant execute on function public.staff_check_in(uuid) to authenticated;
grant execute on function public.staff_check_out(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. audit_action_catalog rows (same shape as the calendar migration;
--    GENERIC_AUDIT_TABLES in packages/domain/src/audit/catalog.ts lists the
--    same table).
-- ---------------------------------------------------------------------
insert into public.audit_action_catalog (action, severity, sentence_en, sentence_bn, is_generic)
values
  ('staff_attendance.insert', 'info',
    '{actor} created a staff attendance record',
    '{actor} একটি স্টাফ উপস্থিতি রেকর্ড তৈরি করেছেন', true),
  ('staff_attendance.update', 'notable',
    '{actor} updated a staff attendance record ({fields})',
    '{actor} একটি স্টাফ উপস্থিতি রেকর্ড হালনাগাদ করেছেন ({fields})', true),
  ('staff_attendance.delete', 'critical',
    '{actor} deleted a staff attendance record',
    '{actor} একটি স্টাফ উপস্থিতি রেকর্ড মুছে ফেলেছেন', true)
on conflict (action) do update
  set severity    = excluded.severity,
      sentence_en = excluded.sentence_en,
      sentence_bn = excluded.sentence_bn,
      is_generic  = excluded.is_generic;
