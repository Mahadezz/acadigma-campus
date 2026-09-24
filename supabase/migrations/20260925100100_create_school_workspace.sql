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
--    code (`tg_workspace_defaults`), the Pro plan + 14-day trial
--    (`tg_workspace_billing_defaults`) and the trialing subscription +
--    `trial_started` event (`tg_workspace_billing_bootstrap`). This
--    function adds the rest: the school profile fields, the current
--    academic year, the grade levels, the caller's onboarding completion,
--    and the idempotency record.
--
-- Error contract: the exception MESSAGE is the machine-readable code
-- (`EIIN_TAKEN`, `RATE_LIMITED`, ...), the same convention
-- `public.switch_workspace` uses, so apps/web branches without parsing
-- SQLSTATE.
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
select app.attach_freeze_workspace('public.academic_years');
select app.attach_updated_at('public.academic_years');
select app.attach_audit('public.academic_years');

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
-- public.create_school_workspace(jsonb)
--
-- Lives in `public`, not `app` (D-50: only `public` is reachable through
-- PostgREST; same shape as public.switch_workspace). Input is the
-- CreateSchoolWorkspaceInput Zod shape (packages/contracts); everything
-- is re-validated here because a direct RPC call bypasses Zod.
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
  v_levels   jsonb := p_input -> 'grade_levels';
  v_ws       uuid := gen_random_uuid();
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
  -- 3-per-day count and the insert, so neither a double submit nor two
  -- tabs can slip past either check.
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

  -- §5 anti-abuse: 3 schools per user per rolling day. A count of real
  -- rows rather than an auth_throttle bucket: it cannot drift from what
  -- was actually created, and it runs under the lock above.
  if (select count(*) from public.workspaces w
       where w.created_by = v_uid and w.type = 'school'
         and w.created_at > now() - interval '1 day') >= 3 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  -- F-ID-03 §5: soft cap of 20 active memberships per user.
  if (select count(*) from public.workspace_members m
       where m.user_id = v_uid and m.status = 'active') >= 20 then
    raise exception 'WORKSPACE_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  -- ---- shape checks the column constraints do not already make ---------
  if v_name is null or char_length(v_name) not between 2 and 120
     or (v_eiin is not null and v_eiin !~ '^[0-9]{6}$')
     or v_board is null or v_board not in ('dhaka', 'chattogram', 'rajshahi', 'khulna',
          'barishal', 'sylhet', 'rangpur', 'mymensingh', 'madrasah', 'technical',
          'cambridge', 'edexcel', 'ib', 'other')
     or v_medium is null or v_medium not in ('bangla', 'english_version', 'english', 'madrasah')
     or jsonb_typeof(p_input -> 'working_days') is distinct from 'array'
     or jsonb_typeof(v_year) is distinct from 'object'
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
  if coalesce(cardinality(v_days), 0) = 0 then
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

  -- One correlation id for every audit row this transaction writes (AC7).
  -- PostgREST's pre-request hook normally sets it from x-correlation-id;
  -- mint one when it did not.
  if app.current_correlation_id() is null then
    perform set_config('app.correlation_id', gen_random_uuid()::text, true);
  end if;

  -- ---- the writes --------------------------------------------------------
  insert into public.workspaces (id, type, name, slug, owner_id, created_by)
  values (v_ws, 'school', v_name,
          left(app.slugify(v_name), 40) || '-' || substr(replace(v_ws::text, '-', ''), 1, 8),
          v_uid, v_uid);

  begin
    update public.school_profiles
       set eiin = v_eiin, board = v_board, medium = v_medium,
           timezone = v_tz, working_days = v_days
     where workspace_id = v_ws;
  exception
    -- school_profiles_eiin_unique (D-66). No pre-check: the index is the
    -- only arbiter, so a concurrent submission that loses the race lands
    -- here exactly like a sequential one.
    when unique_violation then
      raise exception 'EIIN_TAKEN' using errcode = '23505';
    when check_violation then
      raise exception 'VALIDATION' using errcode = '22023';
  end;

  begin
    insert into public.academic_years (workspace_id, name, starts_on, ends_on, is_current, created_by)
    values (v_ws, btrim(v_year ->> 'name'), (v_year ->> 'starts_on')::date,
            (v_year ->> 'ends_on')::date, true, v_uid);
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'INVALID_ACADEMIC_YEAR' using errcode = '22023';
  end;

  begin
    insert into public.grade_levels (workspace_id, name, name_bn, level_number, stage, created_by)
    select v_ws,
           btrim(e ->> 'name'),
           coalesce(nullif(btrim(e ->> 'name_bn'), ''), btrim(e ->> 'name')),
           (e ->> 'level_number')::smallint,
           (e ->> 'stage')::public.grade_stage,
           v_uid
      from jsonb_array_elements(v_levels) e;
  exception when integrity_constraint_violation or data_exception then
    raise exception 'VALIDATION' using errcode = '22023';
  end;

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

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

comment on function public.create_school_workspace(jsonb) is
  'F-ID-05 Part 4 (D-100): creates a school workspace in one transaction — '
  'workspace (+ triggers: owner membership, school_profiles, invite code, '
  'Pro trial subscription), school profile fields, the current academic '
  'year, grade levels, onboarding completion and an idempotency record. '
  'Errors are raised by name: VALIDATION, EIIN_TAKEN, INVALID_TIMEZONE, '
  'INVALID_ACADEMIC_YEAR, RATE_LIMITED, WORKSPACE_LIMIT_REACHED, '
  'IDEMPOTENCY_KEY_REUSED, ACCOUNT_SUSPENDED.';

revoke all on function public.create_school_workspace(jsonb) from public;
grant execute on function public.create_school_workspace(jsonb) to authenticated;
