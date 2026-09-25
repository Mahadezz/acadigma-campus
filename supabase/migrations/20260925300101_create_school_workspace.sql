-- =====================================================================
-- F-ID-05 Part 4 — the create-school transaction (spec §4.3 "On submit",
-- §5, §7, AC7-AC9, AC16; D-100).
--
-- 1. `grade_levels` and `academic_years` (DATA-MODEL.md §2) — the first
--    two academic tables, created here because the wizard is what seeds
--    them. Policy class T2, template from DATA-MODEL.md §11.
-- 2. `public.create_school_workspace(jsonb)` — ONE SECURITY DEFINER
--    function, so every write below shares one transaction and one
--    correlation id. Most of the school is produced by triggers that
--    already exist on `workspaces` (D-59): owner membership + an empty
--    `school_profiles` row (`tg_workspace_bootstrap`), the invite (join)
--    code (`tg_workspace_defaults`), the Pro plan + trial
--    (`tg_workspace_billing_defaults`) and the trialing subscription +
--    `trial_started` event (`tg_workspace_billing_bootstrap`). This
--    function adds the rest: the school profile fields, the current
--    academic year, the grade levels, the caller's onboarding completion,
--    and the idempotency record.
--
-- 3. Only this function creates a school: the client INSERT path on
--    `workspaces` is closed (review of PR #37, HIGH), and a client can no
--    longer change `school_profiles.eiin` directly (MEDIUM, EIIN oracle).
--
-- Error contract: input-shape errors are RAISED with the code as the
-- exception message (`VALIDATION`, `INVALID_TIMEZONE`,
-- `INVALID_ACADEMIC_YEAR`, ...), like `public.switch_workspace`. Everything
-- after the attempt is counted in the `createSchool` throttle bucket is
-- RETURNED as `{"error": "<CODE>"}` instead, because raising would roll
-- the count back and make failed attempts free (EIIN_TAKEN, RATE_LIMITED,
-- WORKSPACE_LIMIT_REACHED).
-- =====================================================================

do $$ begin
  create type public.grade_stage as enum ('early', 'primary', 'secondary', 'higher');
exception when duplicate_object then null; end $$;

comment on type public.grade_stage is
  'DATA-MODEL.md §2 grade_levels "group": early (Play-KG), primary (1-5), '
  'secondary (6-10, O-Level), higher (11-12, A-Level). Named stage, not '
  'group, because GROUP is a reserved word (D-100).';

-- ---------------------------------------------------------------------
-- grade_levels
-- ---------------------------------------------------------------------
create table if not exists public.grade_levels (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  name_bn      text not null check (length(btrim(name_bn)) between 1 and 60),
  level_number smallint not null check (level_number between -10 and 200),
  stage        public.grade_stage,          -- null for a custom level
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null
);

comment on table public.grade_levels is
  'F-ID-05 §4.3 step 3 / DATA-MODEL.md §2: Class 1..12, Play/Nursery/KG, '
  'O/A-Level, or custom. level_number is the canonical sort order '
  '(packages/domain/src/academic/gradeLevels.ts): Play -2 .. KG 0, Class n '
  '= n, O-Level 13, A-Level 14, custom levels 100+.';

create unique index if not exists grade_levels_workspace_level_key
  on public.grade_levels (workspace_id, level_number);
-- justification: tenant key + sort order; every per-school listing reads
-- grade levels in this order, and two levels cannot share a position.
create unique index if not exists grade_levels_workspace_name_key
  on public.grade_levels (workspace_id, lower(name));
-- justification: natural key — no two "Class 6" rows in one school.

-- ---------------------------------------------------------------------
-- academic_years
-- ---------------------------------------------------------------------
create table if not exists public.academic_years (
  id                                uuid primary key default gen_random_uuid(),
  workspace_id                      uuid not null references public.workspaces (id) on delete cascade,
  name                              text not null check (length(btrim(name)) between 1 and 100),
  starts_on                         date not null,
  ends_on                           date not null,
  is_current                        boolean not null default false,
  exam_weights                      jsonb not null default '{}'::jsonb
                                      check (jsonb_typeof(exam_weights) = 'object'),
  fourth_subject_bonus_threshold_gp numeric(3,2) not null default 2.00
                                      check (fourth_subject_bonus_threshold_gp between 0 and 5),
  created_at                        timestamptz not null default now(),
  updated_at                        timestamptz not null default now(),
  created_by                        uuid references public.profiles (id) on delete set null,
  -- F-ID-05 §5: "1-730 days and ends_on > starts_on".
  constraint academic_years_range_valid
    check (ends_on > starts_on and ends_on - starts_on <= 730)
);

comment on table public.academic_years is
  'DATA-MODEL.md §2: a named school year. Exactly one is_current per '
  'workspace (partial unique index below). Seeded by the create-school '
  'wizard (F-ID-05 Part 4).';

create unique index if not exists academic_years_workspace_name_key
  on public.academic_years (workspace_id, name);
-- justification: tenant key + natural key ("2026" once per school).
create unique index if not exists academic_years_one_current
  on public.academic_years (workspace_id) where is_current;
-- justification: DATA-MODEL.md §2 "exactly one current year".


-- ---------------------------------------------------------------------
-- Triggers + RLS (class T2, DATA-MODEL.md §11 template)
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.grade_levels');
select app.attach_updated_at('public.grade_levels');
select app.attach_audit('public.grade_levels');
select app.attach_require_writable('public.grade_levels');
select app.attach_freeze_workspace('public.academic_years');
select app.attach_updated_at('public.academic_years');
select app.attach_audit('public.academic_years');
select app.attach_require_writable('public.academic_years');

-- created_by is who seeded the row; an UPDATE policy cannot compare OLD
-- with NEW, so a trigger keeps it fixed (review of PR #37, LOW).
create or replace function app.tg_created_by_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by
     and not app.is_privileged_context() then
    raise exception 'created_by is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger created_by_immutable before update on public.grade_levels
  for each row execute function app.tg_created_by_immutable();
create trigger created_by_immutable before update on public.academic_years
  for each row execute function app.tg_created_by_immutable();

create index if not exists grade_levels_created_by_idx
  on public.grade_levels (created_by) where created_by is not null;
create index if not exists academic_years_created_by_idx
  on public.academic_years (created_by) where created_by is not null;
-- justification: FK columns (profiles on delete set null).

-- Audit catalogue rows for the two tables' generic actions (the D-63
-- pattern from 20260925000900_staff_schema.sql; GENERIC_AUDIT_TABLES in
-- packages/domain/src/audit/catalog.ts lists the same tables).
do $$
declare
  v_table  text;
  v_tables text[] := array['grade_levels', 'academic_years'];
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

alter table public.grade_levels   enable row level security;
alter table public.academic_years enable row level security;

drop policy if exists grade_levels_select on public.grade_levels;
create policy grade_levels_select on public.grade_levels
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );
drop policy if exists grade_levels_insert on public.grade_levels;
create policy grade_levels_insert on public.grade_levels
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
drop policy if exists grade_levels_update on public.grade_levels;
create policy grade_levels_update on public.grade_levels
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
drop policy if exists grade_levels_delete on public.grade_levels;
create policy grade_levels_delete on public.grade_levels
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists academic_years_select on public.academic_years;
create policy academic_years_select on public.academic_years
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );
drop policy if exists academic_years_insert on public.academic_years;
create policy academic_years_insert on public.academic_years
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
drop policy if exists academic_years_update on public.academic_years;
create policy academic_years_update on public.academic_years
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
drop policy if exists academic_years_delete on public.academic_years;
create policy academic_years_delete on public.academic_years
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

revoke all on public.grade_levels, public.academic_years from anon, authenticated;
grant select, insert, update, delete on public.grade_levels   to authenticated;
grant select, insert, update, delete on public.academic_years to authenticated;

-- ---------------------------------------------------------------------
-- One door for schools (review of PR #37, HIGH). Before this, any signed-in
-- user could INSERT a type='school' row through PostgREST and skip the
-- per-day limit, the suspension check and the membership cap below. No app
-- code inserts workspaces directly; personal workspaces come from
-- app.handle_new_user() (SECURITY DEFINER), which neither the policy nor
-- the grant affects.
-- ---------------------------------------------------------------------
drop policy if exists workspaces_insert on public.workspaces;
revoke insert on public.workspaces from authenticated;

-- The per-day count in create_school_workspace scans these three columns.
create index if not exists workspaces_created_by_type_created_idx
  on public.workspaces (created_by, type, created_at) where created_by is not null;

-- ---------------------------------------------------------------------
-- EIIN changes (review of PR #37, MEDIUM). A client UPDATE of
-- school_profiles.eiin would answer "does another school have this EIIN"
-- through the unique index, with no limit, the same oracle D-67 closed for
-- the probe. Until a throttled "change EIIN" function exists (Settings,
-- F-ID-03 §4.10), only server-side paths may set it.
-- ---------------------------------------------------------------------
create or replace function app.tg_school_profiles_eiin_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- `old.created_at = now()`: the row was created in this very transaction,
  -- which for a client can only mean create_school_workspace (workspaces
  -- has no client INSERT). is_privileged_context() alone would not do: it
  -- reads the session role, which is still `authenticated` inside a
  -- SECURITY DEFINER function.
  if new.eiin is distinct from old.eiin
     and not app.is_privileged_context()
     and old.created_at <> now() then
    raise exception 'the EIIN is set through the school setup, not by update'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger school_profiles_eiin_guard before update on public.school_profiles
  for each row execute function app.tg_school_profiles_eiin_guard();

-- ---------------------------------------------------------------------
-- A `createSchool` throttle bucket: every attempt that passes input
-- validation counts, before any write (review of PR #37, MEDIUM). Same
-- function as 20260925000800 with one more row in the thresholds table.
-- ---------------------------------------------------------------------
create or replace function public.throttle_record_failure(
  p_bucket text,
  p_key    text)
returns table (blocked boolean, retry_after_seconds integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row            public.auth_throttle;
  v_max_attempts   integer;
  v_window_seconds integer;
  v_block_seconds  integer;
begin
  if coalesce(btrim(p_key), '') = '' then
    raise exception 'a throttle key is required' using errcode = '22023';
  end if;

  select l.max_attempts, l.window_seconds, l.block_seconds
    into v_max_attempts, v_window_seconds, v_block_seconds
  from (values
    -- bucket,                 max_attempts, window_seconds, block_seconds
    ('register',                5,  3600,  3600), -- "Registrations per IP: 5/h"
    ('loginByEmail',            5,   900,   900),  -- "5 per (email, 15 min) -> 15 min block"
    ('loginByIp',               30,  900,  3600),  -- "30 per (IP, 15 min) -> 60 min block"
    ('passwordResetRequest',    5,  3600,  3600),
    ('passwordResetSubmit',     10, 3600,  3600),  -- "resetPassword ... 10/h per IP"
    ('resendVerification',      5,  3600,  3600),
    ('changePassword',          10, 3600,  3600),
    ('eiinCheck',               30,  900,   900),  -- D-67: "30 per (user, 15 min) -> 15 min block"
    ('createSchool',            30,  900,   900)   -- D-100: create_school_workspace attempts per user
  ) as l(bucket, max_attempts, window_seconds, block_seconds)
  where l.bucket = p_bucket;

  if v_max_attempts is null then
    raise exception 'unrecognised throttle bucket: %', p_bucket using errcode = '22023';
  end if;

  insert into public.auth_throttle (key, window_started_at, attempts)
  values (p_key, now(), 1)
  on conflict (key) do update
    set attempts = case
          when auth_throttle.blocked_until is null
               and auth_throttle.window_started_at < now() - make_interval(secs => v_window_seconds)
            then 1
          else auth_throttle.attempts + 1
        end,
        window_started_at = case
          when auth_throttle.blocked_until is null
               and auth_throttle.window_started_at < now() - make_interval(secs => v_window_seconds)
            then now()
          else auth_throttle.window_started_at
        end
  returning * into v_row;

  if v_row.attempts > v_max_attempts then
    update public.auth_throttle
       set blocked_until = now() + make_interval(secs => v_block_seconds)
     where key = p_key
     returning * into v_row;
  end if;

  return query select
    (v_row.blocked_until is not null and v_row.blocked_until > now()),
    greatest(
      0,
      ceil(extract(epoch from (coalesce(v_row.blocked_until, now()) - now())))::integer
    );
end;
$$;

comment on function public.throttle_record_failure(text, text) is
  'F-ID-01 §7 / D-67 / D-100: server-side rate limit bump+check. Thresholds '
  'are constants in this function body, keyed by p_bucket -- NEVER '
  'caller-supplied (security review N2). Bucket names match '
  'apps/web/lib/throttle.ts''s THROTTLE_LIMITS keys.';

-- ---------------------------------------------------------------------
-- public.create_school_workspace(jsonb)
--
-- Lives in `public`, not `app` (D-50: only `public` is reachable through
-- PostgREST; same shape as public.switch_workspace). Input is the
-- CreateSchoolWorkspaceInput Zod shape (packages/contracts); everything
-- is re-validated here because a direct RPC call bypasses Zod.
--
-- Order matters: (1) auth, key, per-user lock, replay; (2) every input
-- check, so a bad request never reaches the EIIN index; (3) count the
-- attempt in `createSchool`; (4) limits; (5) the writes, in a block whose
-- failure is returned rather than raised so the count in (3) survives.
-- ---------------------------------------------------------------------
create or replace function public.create_school_workspace(p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_key      text := p_input ->> 'idempotency_key';
  v_hash     bytea;
  v_prior    app.idempotency_keys;
  v_name     text := btrim(p_input ->> 'name');
  v_eiin     text := nullif(btrim(coalesce(p_input ->> 'eiin', '')), '');
  v_board    text := p_input ->> 'board';
  v_medium   text := p_input ->> 'medium';
  v_tz       text := p_input ->> 'timezone';
  v_days     smallint[];
  v_year     jsonb := p_input -> 'academic_year';
  v_year_name text;
  v_starts   date;
  v_ends     date;
  v_levels   jsonb := p_input -> 'grade_levels';
  v_ws       uuid := gen_random_uuid();
  v_blocked  boolean;
  v_constraint text;
  v_result   jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_input) is distinct from 'object'
     or v_key is null
     or v_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  -- One create at a time per user: serialises the replay lookup, the
  -- counts and the insert, so neither a double submit nor two tabs can
  -- slip past a check.
  perform pg_advisory_xact_lock(hashtext('create_school_workspace'), hashtext(v_uid::text));

  -- Idempotency (§5): a replay returns the original workspace. The key is
  -- not part of the hash, so "same key, different body" is detectable.
  v_hash := sha256(convert_to((p_input - 'idempotency_key')::text, 'UTF8'));
  select * into v_prior
    from app.idempotency_keys k
   where k.scope = 'create_school_workspace' and k.key = v_key;
  if found then
    if v_prior.user_id is distinct from v_uid or v_prior.request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return v_prior.response || jsonb_build_object('replayed', true);
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and p.suspended_at is not null) then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;

  -- ---- (2) every input check, before anything touches the EIIN index ------
  -- The board and medium lists mirror schoolBoardSchema/schoolMediumSchema
  -- (packages/contracts/src/identity/school.ts); school_profiles.board and
  -- .medium are plain text today. Change both together, or promote them to
  -- Postgres enums.
  if v_name is null or char_length(v_name) not between 2 and 120
     or (v_eiin is not null and v_eiin !~ '^[0-9]{6}$')
     or v_board is null or v_board not in ('dhaka', 'chattogram', 'rajshahi', 'khulna',
          'barishal', 'sylhet', 'rangpur', 'mymensingh', 'madrasah', 'technical',
          'cambridge', 'edexcel', 'ib', 'other')
     or v_medium is null or v_medium not in ('bangla', 'english_version', 'english', 'madrasah')
     or jsonb_typeof(p_input -> 'working_days') is distinct from 'array'
     or jsonb_typeof(v_levels) is distinct from 'array'
     or jsonb_array_length(v_levels) not between 1 and 30 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  begin
    select array_agg(distinct d::smallint) into v_days
      from jsonb_array_elements_text(p_input -> 'working_days') d;
  exception when data_exception then
    raise exception 'VALIDATION' using errcode = '22023';
  end;
  -- school_profiles' own check passes an EMPTY array (array_length is NULL).
  if coalesce(cardinality(v_days), 0) = 0 or not (v_days <@ '{1,2,3,4,5,6,7}'::smallint[]) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  -- Grade levels: the same rules as the table's checks and unique indexes.
  if exists (
       select 1 from jsonb_array_elements(v_levels) e
        where jsonb_typeof(e) is distinct from 'object'
           or length(btrim(coalesce(e ->> 'name', ''))) not between 1 and 60
           or length(btrim(coalesce(nullif(btrim(e ->> 'name_bn'), ''), e ->> 'name'))) not between 1 and 60
           or coalesce(e ->> 'level_number', '') !~ '^-?[0-9]{1,3}$'
           or (e ->> 'level_number')::int not between -10 and 200
           or (e ->> 'stage' is not null
               and e ->> 'stage' not in ('early', 'primary', 'secondary', 'higher')))
     or (select count(distinct lower(btrim(e ->> 'name'))) from jsonb_array_elements(v_levels) e)
          <> jsonb_array_length(v_levels)
     or (select count(distinct e ->> 'level_number') from jsonb_array_elements(v_levels) e)
          <> jsonb_array_length(v_levels) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  if v_tz is null then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023';
  end if;
  begin
    perform now() at time zone v_tz;
  exception when others then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023';
  end;

  -- Academic year: the same rule as academic_years_range_valid.
  if jsonb_typeof(v_year) is distinct from 'object' then
    raise exception 'INVALID_ACADEMIC_YEAR' using errcode = '22023';
  end if;
  v_year_name := btrim(v_year ->> 'name');
  begin
    v_starts := (v_year ->> 'starts_on')::date;
    v_ends   := (v_year ->> 'ends_on')::date;
  exception when data_exception then
    raise exception 'INVALID_ACADEMIC_YEAR' using errcode = '22023';
  end;
  if v_year_name is null or length(v_year_name) not between 1 and 100
     or v_starts is null or v_ends is null
     or v_ends <= v_starts or v_ends - v_starts > 730 then
    raise exception 'INVALID_ACADEMIC_YEAR' using errcode = '22023';
  end if;

  -- ---- (3) count the attempt; from here on, failures are returned --------
  select t.blocked into v_blocked
    from public.throttle_record_failure('createSchool', 'create-school:' || v_uid::text) t;
  if v_blocked then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;

  -- ---- (4) limits ----------------------------------------------------------
  -- §5 anti-abuse: 3 schools per user per rolling day. A count of real rows
  -- (workspaces_created_by_type_created_idx), under the lock above.
  if (select count(*) from public.workspaces w
       where w.created_by = v_uid and w.type = 'school'
         and w.created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('error', 'RATE_LIMITED');
  end if;

  -- F-ID-03 §5: soft cap of 20 active memberships per user.
  if (select count(*) from public.workspace_members m
       where m.user_id = v_uid and m.status = 'active') >= 20 then
    return jsonb_build_object('error', 'WORKSPACE_LIMIT_REACHED');
  end if;

  -- One correlation id for every audit row this transaction writes (AC7).
  -- PostgREST's pre-request hook normally sets it from x-correlation-id;
  -- mint one when it did not.
  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;

  -- ---- (5) the writes --------------------------------------------------------
  begin
    insert into public.workspaces (id, type, name, slug, owner_id, created_by)
    values (v_ws, 'school', v_name,
            left(app.slugify(v_name), 40) || '-' || substr(replace(v_ws::text, '-', ''), 1, 8),
            v_uid, v_uid);

    -- school_profiles_eiin_unique (D-66) is the only arbiter, so a
    -- concurrent submission that loses the race lands in the handler below
    -- exactly like a sequential one.
    update public.school_profiles
       set eiin = v_eiin, board = v_board, medium = v_medium,
           timezone = v_tz, working_days = v_days
     where workspace_id = v_ws;

    insert into public.academic_years (workspace_id, name, starts_on, ends_on, is_current, created_by)
    values (v_ws, v_year_name, v_starts, v_ends, true, v_uid);

    insert into public.grade_levels (workspace_id, name, name_bn, level_number, stage, created_by)
    select v_ws,
           btrim(e ->> 'name'),
           coalesce(nullif(btrim(e ->> 'name_bn'), ''), btrim(e ->> 'name')),
           (e ->> 'level_number')::smallint,
           (e ->> 'stage')::public.grade_stage,
           v_uid
      from jsonb_array_elements(v_levels) e;

    update public.profiles
       set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
           last_active_workspace_id = v_ws
     where id = v_uid;

    insert into public.onboarding_progress (user_id, path, step, draft, completed_at)
    values (v_uid, 'create_school', 4, null, now())
    on conflict (user_id) do update
      set path = 'create_school', draft = null, completed_at = now();

    v_result := jsonb_build_object('workspace_id', v_ws, 'name', v_name);

    insert into app.idempotency_keys
      (scope, key, workspace_id, user_id, request_hash, status, response, completed_at)
    values
      ('create_school_workspace', v_key, v_ws, v_uid, v_hash, 'succeeded', v_result, now());
  exception when unique_violation then
    -- Every write above is undone; the attempt counted in (3) is kept.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'school_profiles_eiin_unique' then
      return jsonb_build_object('error', 'EIIN_TAKEN');
    end if;
    -- Anything else (a slug collision, a concurrent reuse of the same
    -- idempotency key by another user) is not about the EIIN.
    return jsonb_build_object('error', 'CONFLICT');
  end;

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

comment on function public.create_school_workspace(jsonb) is
  'F-ID-05 Part 4 (D-100): the only way to create a school workspace. One '
  'transaction: workspace (+ triggers: owner membership, school_profiles, '
  'invite code, Pro trial subscription), school profile fields, the current '
  'academic year, grade levels, onboarding completion and an idempotency '
  'record. Raises VALIDATION, INVALID_TIMEZONE, INVALID_ACADEMIC_YEAR, '
  'IDEMPOTENCY_KEY_REUSED, ACCOUNT_SUSPENDED; returns {"error": ...} for '
  'EIIN_TAKEN, CONFLICT, RATE_LIMITED and WORKSPACE_LIMIT_REACHED, which come after '
  'the attempt is counted in the createSchool throttle bucket.';

revoke all on function public.create_school_workspace(jsonb) from public;
grant execute on function public.create_school_workspace(jsonb) to authenticated;
