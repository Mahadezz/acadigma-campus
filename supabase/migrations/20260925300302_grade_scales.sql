-- =====================================================================
-- F-AC-06 Part 1 — grade scales and the grading domain (D-302)
-- ---------------------------------------------------------------------
-- DATA-MODEL.md §2 names win over the spec draft: `grade_scales (code, name,
-- is_default)` and `grade_bands (letter, min_percent, max_percent,
-- grade_point, sort_order)`, plus `is_fail` on a band (§5.3 needs it).
-- Pass mark / F-zeroes-GPA / 4th-subject rules stay where they already live
-- (`school_profiles.academic_settings`, `academic_years`) — D-302.
--
--   - Bands of one scale must cover 0.00-100.00 with no gap and no overlap
--     (2-decimal steps: next.min = prev.max + 0.01), and grade points must
--     not decrease band by band. Checked by a DEFERRED constraint trigger
--     that locks the scale row first, so a whole band set is replaced in one
--     transaction (public.save_grade_scale) and two writers serialise.
--   - Bands change only through save_grade_scale / seed_bd_grade_scale:
--     authenticated has SELECT on grade_bands, not INSERT/UPDATE/DELETE, so
--     both RPCs are SECURITY DEFINER and re-check owner/admin themselves.
--   - grade_scales.code and is_default are immutable to clients.
--   - Banding (D-302 a): a percentage is banded as-is — min <= pct <= max —
--     after §5.1 has rounded it to 2 decimals; band_for does not round.
--   - app.round_half_up / app.band_for are the SQL halves of
--     packages/domain/src/grading (parity-tested against the same table in
--     supabase/tests/52_grade_scales.sql).
--   - public.seed_bd_grade_scale(workspace) — the Bangladesh default
--     (PRODUCT-DECISIONS 2.4), idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.grade_scales (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code         text not null check (code ~ '^[A-Z0-9_]{1,40}$'),
  name         text not null check (length(btrim(name)) between 1 and 100),
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  constraint grade_scales_id_workspace_key unique (id, workspace_id)
);

comment on table public.grade_scales is
  'F-AC-06 §3 / DATA-MODEL.md §2: a named grading scale per school. code is '
  'what school_profiles.academic_settings.grade_scale_code points at '
  '(BD_GPA5 = the Bangladesh default).';

create unique index if not exists grade_scales_workspace_code_key
  on public.grade_scales (workspace_id, code);
-- justification: tenant key + natural key; the settings lookup by code.
create unique index if not exists grade_scales_one_default
  on public.grade_scales (workspace_id) where is_default;
-- justification: at most one default scale per school.
create index if not exists grade_scales_created_by_idx
  on public.grade_scales (created_by) where created_by is not null;
-- justification: FK column (profiles on delete set null).

create table if not exists public.grade_bands (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null,
  grade_scale_id uuid not null,
  letter         text not null check (length(btrim(letter)) between 1 and 5),
  min_percent    numeric(5,2) not null,
  max_percent    numeric(5,2) not null,
  grade_point    numeric(3,2) not null check (grade_point >= 0),
  is_fail        boolean not null default false,
  sort_order     smallint not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint grade_bands_range_valid
    check (min_percent >= 0 and max_percent <= 100 and min_percent <= max_percent),
  constraint grade_bands_scale_fkey
    foreign key (grade_scale_id, workspace_id)
    references public.grade_scales (id, workspace_id) on delete cascade
);

comment on table public.grade_bands is
  'F-AC-06 §3 / DATA-MODEL.md §2: the bands of a grade scale. Per scale they '
  'cover 0.00-100.00 exactly once (deferred trigger app.tg_grade_bands_coverage). '
  'The composite FK keeps a band in its scale''s workspace.';

create unique index if not exists grade_bands_scale_letter_key
  on public.grade_bands (grade_scale_id, lower(letter));
-- justification: DATA-MODEL.md — one "A" per scale, case-insensitive like the Zod contract.
create index if not exists grade_bands_scale_min_idx
  on public.grade_bands (grade_scale_id, min_percent);
-- justification: DATA-MODEL.md — band lookup by percentage (app.band_for).
create index if not exists grade_bands_workspace_idx
  on public.grade_bands (workspace_id);
-- justification: tenant key; RLS predicate and cascade from workspaces.

-- ---------------------------------------------------------------------
-- Coverage: no gap, no overlap, 0.00 to 100.00, grade points never
-- decrease — checked at commit.
-- ---------------------------------------------------------------------
create or replace function app.assert_grade_scale_coverage(p_scale_id uuid)
returns void
language plpgsql
volatile
security definer   -- sees every band of the scale regardless of the caller
set search_path = ''
as $$
declare
  v_band  record;
  v_prev  numeric(5,2);
  v_point numeric(3,2);
  v_n     int := 0;
begin
  -- Serialise writers of one scale; a deleted scale (cascade) has nothing to check.
  perform 1 from public.grade_scales s where s.id = p_scale_id for update;
  if not found then
    return;
  end if;

  for v_band in
    select b.min_percent, b.max_percent, b.grade_point
      from public.grade_bands b
     where b.grade_scale_id = p_scale_id
     order by b.min_percent, b.max_percent
  loop
    v_n := v_n + 1;
    if v_prev is null then
      if v_band.min_percent <> 0 then
        raise exception 'BAND_GAP' using errcode = '23514',
          detail = format('the lowest band starts at %s, not 0', v_band.min_percent);
      end if;
    elsif v_band.min_percent <= v_prev then
      raise exception 'BAND_OVERLAP' using errcode = '23514',
        detail = format('a band starting at %s overlaps one ending at %s', v_band.min_percent, v_prev);
    elsif v_band.min_percent > v_prev + 0.01 then
      raise exception 'BAND_GAP' using errcode = '23514',
        detail = format('nothing covers %s to %s', v_prev + 0.01, v_band.min_percent - 0.01);
    end if;
    if v_point is not null and v_band.grade_point < v_point then
      raise exception 'BAND_POINTS_DECREASE' using errcode = '23514',
        detail = format('the band starting at %s has a lower grade point than the band below it',
                        v_band.min_percent);
    end if;
    v_prev  := v_band.max_percent;
    v_point := v_band.grade_point;
  end loop;

  if v_n = 0 then
    raise exception 'BAND_GAP' using errcode = '23514',
      detail = 'a grade scale needs bands covering 0 to 100';
  end if;
  if v_prev <> 100 then
    raise exception 'BAND_GAP' using errcode = '23514',
      detail = format('the highest band ends at %s, not 100', v_prev);
  end if;
end;
$$;

revoke all on function app.assert_grade_scale_coverage(uuid) from public, anon, authenticated;

create or replace function app.tg_grade_bands_coverage()
returns trigger
language plpgsql
security definer   -- may call app.assert_grade_scale_coverage, granted to nobody
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    perform app.assert_grade_scale_coverage(old.grade_scale_id);
  end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.grade_scale_id <> old.grade_scale_id) then
    perform app.assert_grade_scale_coverage(new.grade_scale_id);
  end if;
  return null;
end;
$$;

revoke all on function app.tg_grade_bands_coverage() from public, anon, authenticated;

drop trigger if exists grade_bands_coverage on public.grade_bands;
create constraint trigger grade_bands_coverage
  after insert or update or delete on public.grade_bands
  deferrable initially deferred
  for each row execute function app.tg_grade_bands_coverage();

-- ---------------------------------------------------------------------
-- The two grading primitives (F-AC-06 §5.2, §5.13)
-- ---------------------------------------------------------------------
-- Postgres round(numeric, int) already rounds half away from zero — the
-- same as the domain's roundHalfUp for the non-negative values grading
-- uses. It is wrapped so every caller names the rule, and so the parity
-- test has one SQL function to pin. (round(double precision) would be
-- banker's rounding — hence the numeric signature.)
create or replace function app.round_half_up(p_value numeric, p_places int)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(p_value, p_places)
$$;

-- The band whose [min_percent, max_percent] holds pct, as given (D-302 a:
-- no rounding before banding — §5.1 already rounded pct to 2 decimals).
-- Null when no band holds it.
create or replace function app.band_for(p_grade_scale_id uuid, p_pct numeric)
returns public.grade_bands
language sql
stable
set search_path = ''
as $$
  select b.*
    from public.grade_bands b
   where b.grade_scale_id = p_grade_scale_id
     and p_pct between b.min_percent and b.max_percent
   limit 1
$$;

revoke all on function app.round_half_up(numeric, int) from public, anon, authenticated;
revoke all on function app.band_for(uuid, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Client RPCs (D-50: public). SECURITY DEFINER because clients hold no
-- INSERT/UPDATE/DELETE on grade_bands (bands change only here); each one
-- re-checks owner/admin itself. require_writable still fires (it reads the
-- caller's role GUC, which a definer call does not change).
-- ---------------------------------------------------------------------
-- The Bangladesh default (PRODUCT-DECISIONS 2.4). Idempotent: a second call
-- returns the existing scale and changes nothing.
create or replace function public.seed_bd_grade_scale(p_workspace_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'only an owner or admin can change grading' using errcode = '42501';
  end if;

  insert into public.grade_scales (workspace_id, code, name, is_default, created_by)
  values (p_workspace_id, 'BD_GPA5', 'Bangladesh GPA 5.00',
          not exists (select 1 from public.grade_scales s
                       where s.workspace_id = p_workspace_id and s.is_default),
          auth.uid())
  on conflict (workspace_id, code) do nothing
  returning id into v_id;

  if v_id is null then   -- already seeded
    select s.id into v_id from public.grade_scales s
     where s.workspace_id = p_workspace_id and s.code = 'BD_GPA5';
    return v_id;
  end if;

  insert into public.grade_bands
    (workspace_id, grade_scale_id, letter, min_percent, max_percent, grade_point, is_fail, sort_order)
  values
    (p_workspace_id, v_id, 'A+', 80.00, 100.00, 5.00, false, 1),
    (p_workspace_id, v_id, 'A',  70.00,  79.99, 4.00, false, 2),
    (p_workspace_id, v_id, 'A-', 60.00,  69.99, 3.50, false, 3),
    (p_workspace_id, v_id, 'B',  50.00,  59.99, 3.00, false, 4),
    (p_workspace_id, v_id, 'C',  40.00,  49.99, 2.00, false, 5),
    (p_workspace_id, v_id, 'D',  33.00,  39.99, 1.00, false, 6),
    (p_workspace_id, v_id, 'F',   0.00,  32.99, 0.00, true,  7);

  return v_id;
end;
$$;

comment on function public.seed_bd_grade_scale(uuid) is
  'F-AC-06 Part 1: creates the Bangladesh GPA 5.00 scale (code BD_GPA5) for a '
  'school, once (insert ... on conflict do nothing). Owner/admin only.';

-- Replaces a scale's name and whole band set in one transaction, so the
-- deferred coverage check sees only the final set.
create or replace function public.save_grade_scale(
  p_workspace_id uuid,
  p_scale_id     uuid,
  p_name         text,
  p_bands        jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'only an owner or admin can change grading' using errcode = '42501';
  end if;

  update public.grade_scales set name = p_name
   where id = p_scale_id and workspace_id = p_workspace_id;
  if not found then
    raise exception 'grade scale not found' using errcode = 'P0002';
  end if;

  delete from public.grade_bands where grade_scale_id = p_scale_id;

  insert into public.grade_bands
    (workspace_id, grade_scale_id, letter, min_percent, max_percent, grade_point, is_fail, sort_order)
  select p_workspace_id, p_scale_id, b.letter, b.min_percent, b.max_percent, b.grade_point,
         coalesce(b.is_fail, false), b.sort_order
    from jsonb_to_recordset(p_bands) as b(
           letter text, min_percent numeric, max_percent numeric,
           grade_point numeric, is_fail boolean, sort_order smallint);

  -- Surface a gap/overlap now, with its name, instead of at commit.
  set constraints public.grade_bands_coverage immediate;
  return p_scale_id;
end;
$$;

comment on function public.save_grade_scale(uuid, uuid, text, jsonb) is
  'F-AC-06 Part 1 upsertGradeScale: rename a scale and replace its bands '
  'atomically. Owner/admin only; raises BAND_GAP / BAND_OVERLAP / '
  'BAND_POINTS_DECREASE (23514).';

revoke all on function public.seed_bd_grade_scale(uuid) from public, anon;
revoke all on function public.save_grade_scale(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.seed_bd_grade_scale(uuid) to authenticated;
grant execute on function public.save_grade_scale(uuid, uuid, text, jsonb) to authenticated;

-- code and is_default are identity: a client cannot move them (security
-- review, PR #46). Privileged callers (migrations, platform tooling) can.
create or replace function app.tg_grade_scales_identity_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.code is distinct from old.code or new.is_default is distinct from old.is_default)
     and not app.is_privileged_context() then
    raise exception 'GRADE_SCALE_IDENTITY_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger grade_scales_identity_immutable before update on public.grade_scales
  for each row execute function app.tg_grade_scales_identity_immutable();

-- ---------------------------------------------------------------------
-- Triggers (class T2 template) + audit catalogue
-- ---------------------------------------------------------------------
select app.attach_freeze_workspace('public.grade_scales');
select app.attach_updated_at('public.grade_scales');
select app.attach_audit('public.grade_scales');
select app.attach_require_writable('public.grade_scales');
select app.attach_freeze_workspace('public.grade_bands');
select app.attach_updated_at('public.grade_bands');
select app.attach_audit('public.grade_bands');
select app.attach_require_writable('public.grade_bands');

create trigger created_by_immutable before update on public.grade_scales
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['grade_scales', 'grade_bands'];
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

-- Band rows churn on every save (delete + insert of the whole set); the
-- scale's own grade_scales.update row is the notable event, so band rows are
-- info-level (review of PR #46). Mirrored in GENERIC_SEVERITY_OVERRIDES
-- (packages/domain/src/audit/catalog.ts).
update public.audit_action_catalog set severity = 'info'
 where action in ('grade_bands.update', 'grade_bands.delete');

-- ---------------------------------------------------------------------
-- RLS (F-AC-06 §3: read by all active members, write by owner/admin)
-- ---------------------------------------------------------------------
alter table public.grade_scales enable row level security;
alter table public.grade_bands  enable row level security;

drop policy if exists grade_scales_select on public.grade_scales;
create policy grade_scales_select on public.grade_scales
  for select to authenticated
  using (app.member_role(workspace_id) is not null or (select app.is_platform_admin()));
drop policy if exists grade_scales_insert on public.grade_scales;
create policy grade_scales_insert on public.grade_scales
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
drop policy if exists grade_scales_update on public.grade_scales;
create policy grade_scales_update on public.grade_scales
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
drop policy if exists grade_scales_delete on public.grade_scales;
create policy grade_scales_delete on public.grade_scales
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

drop policy if exists grade_bands_select on public.grade_bands;
create policy grade_bands_select on public.grade_bands
  for select to authenticated
  using (app.member_role(workspace_id) is not null or (select app.is_platform_admin()));

revoke all on public.grade_scales, public.grade_bands from anon, authenticated;
grant select, insert, update, delete on public.grade_scales to authenticated;
grant select on public.grade_bands to authenticated;   -- writes only via the RPCs
