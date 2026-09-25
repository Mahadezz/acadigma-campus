-- =====================================================================
-- F-AC-11 Part 1 (demo cut, D-202; functions per D-203) — the school-day calendar.
--
--   1. enums holiday_kind, holiday_source
--   2. public.holidays               — days the school is closed
--   3. public.working_day_overrides  — a single date forced open or shut
--   4. app.is_school_day / app.school_days / app.school_day_count
--   5. audit_action_catalog rows for the two new generic-audit tables
--
-- Deferred (D-202): holidays.academic_year_id (academic_years arrives with
-- F-ID-05 Part 4, PR #37), holiday_scopes and the section argument (no
-- sections table yet), recurrence, calendar_events (Part 3), the TS mirror
-- + parity test and GET /api/calendar/school-days.
-- =====================================================================

do $$ begin
  create type public.holiday_kind as enum
    ('public', 'religious', 'national', 'school', 'vacation', 'weather', 'emergency');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.holiday_source as enum ('seed', 'manual', 'import');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. holidays
-- ---------------------------------------------------------------------
create table if not exists public.holidays (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 1 and 120),
  name_bn       text check (name_bn is null or length(btrim(name_bn)) between 1 and 120),
  starts_on     date not null,
  ends_on       date not null,
  kind          public.holiday_kind   not null default 'school',
  source        public.holiday_source not null default 'manual',
  note          text check (note is null or length(note) <= 500),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- inclusive range; a single day has starts_on = ends_on. One year max:
  -- a longer "holiday" is a data-entry mistake that would empty a term.
  constraint holidays_range_valid
    check (ends_on >= starts_on and ends_on - starts_on < 366),
  -- The same holiday entered twice (a double tap, a re-seed) is refused;
  -- overlapping holidays with different names are allowed (HOLIDAY_OVERLAP
  -- warning is deferred, D-203).
  constraint holidays_workspace_name_start_key unique (workspace_id, name, starts_on)
);

comment on table public.holidays is
  'F-AC-11 §3: days the school is closed. Read by app.is_school_day, the '
  'one denominator behind attendance %, leave day counts and analytics gaps.';

-- justification: app.is_school_day's containment test `range @> d` per
-- workspace; btree_gist lets workspace_id share the GiST index.
create index if not exists holidays_workspace_range_gist
  on public.holidays using gist (workspace_id, daterange(starts_on, ends_on, '[]'));
-- justification: the settings list, ordered by date.
create index if not exists holidays_workspace_starts_idx
  on public.holidays (workspace_id, starts_on);
-- justification: FK column.
create index if not exists holidays_created_by_idx
  on public.holidays (created_by) where created_by is not null;

alter table public.holidays enable row level security;

create policy holidays_select on public.holidays
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );
-- Parents have no direct policy (F-AC-11 §3): they will read through
-- parent_calendar_v (F-AC-10).

create policy holidays_insert on public.holidays
  for insert to authenticated
  with check (app.has_role(workspace_id, array['owner', 'admin']));

create policy holidays_update on public.holidays
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

create policy holidays_delete on public.holidays
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

revoke all on public.holidays from anon, authenticated;
grant select, insert, update, delete on public.holidays to authenticated;

select app.attach_updated_at('public.holidays');
select app.attach_freeze_workspace('public.holidays');
select app.attach_audit('public.holidays');
select app.attach_require_writable('public.holidays');
-- created_by stays who declared it (PR #43 security review, same trigger as #37).
drop trigger if exists created_by_immutable on public.holidays;
create trigger created_by_immutable before update on public.holidays
  for each row execute function app.tg_created_by_immutable();

-- ---------------------------------------------------------------------
-- 3. working_day_overrides
-- ---------------------------------------------------------------------
create table if not exists public.working_day_overrides (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  date          date not null,
  is_working    boolean not null,
  -- F-AC-11 §4.3 / AC13: a reason is always required.
  reason        text not null check (length(btrim(reason)) between 1 and 300),
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint working_day_overrides_workspace_date_key unique (workspace_id, date)
);

comment on table public.working_day_overrides is
  'F-AC-11 §3: one date forced to a school day (a make-up Friday) or to a '
  'closure (a strike). Beats both the weekly pattern and any holiday.';

-- justification: FK column.
create index if not exists working_day_overrides_created_by_idx
  on public.working_day_overrides (created_by) where created_by is not null;

alter table public.working_day_overrides enable row level security;

create policy working_day_overrides_select on public.working_day_overrides
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );

create policy working_day_overrides_insert on public.working_day_overrides
  for insert to authenticated
  with check (app.has_role(workspace_id, array['owner', 'admin']));

create policy working_day_overrides_update on public.working_day_overrides
  for update to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));

create policy working_day_overrides_delete on public.working_day_overrides
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

revoke all on public.working_day_overrides from anon, authenticated;
grant select, insert, update, delete on public.working_day_overrides to authenticated;

select app.attach_updated_at('public.working_day_overrides');
select app.attach_freeze_workspace('public.working_day_overrides');
select app.attach_audit('public.working_day_overrides');
select app.attach_require_writable('public.working_day_overrides');
-- created_by stays who declared it (PR #43 security review, same trigger as #37).
drop trigger if exists created_by_immutable on public.working_day_overrides;
create trigger created_by_immutable before update on public.working_day_overrides
  for each row execute function app.tg_created_by_immutable();

-- ---------------------------------------------------------------------
-- 4. app.is_school_day — F-AC-11 §5.1 precedence:
--      1. an override for d            -> its is_working
--      2. weekday not in working_days  -> false
--      3. a holiday covers d           -> false
--      4. otherwise                    -> true
--
-- SECURITY DEFINER with a caller guard (D-203, superseding D-202 point 2):
-- a parent may not read holidays/overrides directly, but their child's
-- attendance % and their leave counts still need the school's real answer.
-- Only a member of the workspace, platform staff or a privileged (service)
-- context gets an answer; anyone else gets NULL (is_school_day) or
-- FORBIDDEN (school_days / school_day_count), never another school's days.
-- ---------------------------------------------------------------------
create or replace function app.can_read_school_calendar(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_privileged_context()
      or app.member_role(p_workspace_id) is not null
      or app.is_platform_admin()
$$;

comment on function app.can_read_school_calendar(uuid) is
  'F-AC-11 (D-203): the guard every school-day function checks first.';

create or replace function app.is_school_day(p_workspace_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.can_read_school_calendar(p_workspace_id) then coalesce(
    (select o.is_working
       from public.working_day_overrides o
      where o.workspace_id = p_workspace_id and o.date = p_day),
    extract(isodow from p_day)::smallint = any (
      coalesce(
        (select sp.working_days from public.school_profiles sp
          where sp.workspace_id = p_workspace_id),
        '{6,7,1,2,3,4}'::smallint[]))
    and not exists (
      select 1 from public.holidays h
       where h.workspace_id = p_workspace_id
         and daterange(h.starts_on, h.ends_on, '[]') @> p_day)
  ) end
$$;

comment on function app.is_school_day(uuid, date) is
  'F-AC-11 §5.1: override > weekly pattern (school_profiles.working_days, '
  'ISO 1=Mon..7=Sun, default Sat-Thu) > holiday > true. The one answer every '
  'denominator uses.';

create or replace function app.school_days(p_workspace_id uuid, p_from date, p_to date)
returns setof date
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_read_school_calendar(p_workspace_id) then
    raise exception 'FORBIDDEN' using errcode = '42501',
      detail = 'Only a member of this school can read its calendar.';
  end if;
  -- At most 731 dates (two years, one of them a leap year).
  if p_to < p_from or p_to - p_from > 730 then
    raise exception 'INVALID_RANGE' using errcode = '22023',
      detail = 'to must be on or after from, and at most two years later.';
  end if;
  return query
    select d::date
      from generate_series(p_from, p_to, interval '1 day') as g(d)
     where app.is_school_day(p_workspace_id, d::date)
     order by 1;
end;
$$;

comment on function app.school_days(uuid, date, date) is
  'F-AC-11 §5.2: every school day in [from, to], inclusive.';

create or replace function app.school_day_count(p_workspace_id uuid, p_from date, p_to date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from app.school_days(p_workspace_id, p_from, p_to)
$$;

revoke all on function app.can_read_school_calendar(uuid) from public, anon;
grant execute on function app.can_read_school_calendar(uuid) to authenticated, service_role;
revoke all on function app.is_school_day(uuid, date) from public, anon;
revoke all on function app.school_days(uuid, date, date) from public, anon;
revoke all on function app.school_day_count(uuid, date, date) from public, anon;
grant execute on function app.is_school_day(uuid, date) to authenticated, service_role;
grant execute on function app.school_days(uuid, date, date) to authenticated, service_role;
grant execute on function app.school_day_count(uuid, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. audit_action_catalog rows (same shape as 20260925000900_staff_schema.sql
--    §8; GENERIC_AUDIT_TABLES in packages/domain/src/audit/catalog.ts lists
--    the same two tables).
-- ---------------------------------------------------------------------
do $$
declare
  v_table  text;
  v_tables text[] := array['holidays', 'working_day_overrides'];
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
