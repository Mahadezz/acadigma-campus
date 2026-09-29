-- =====================================================================
-- F-OP-07 Part 2 (D-210) — terms within an academic year.
--
-- Builds on academic_years (20260925300101, D-100), whose
-- `academic_years_id_workspace_key` composite unique index (added by
-- 20260925300304_sections_and_subjects.sql) backs the composite FK below.
-- Same class T2 shape as sections/subjects: tenant freeze, updated_at,
-- generic audit + catalogue rows, require_writable, immutable created_by.
--
-- Gap/overlap and in-year-range validation is domain-level (§5.2's
-- gap/overlap pattern already used for grade-scale bands), not a DB
-- exclusion constraint — checked in packages/domain/src/academic/terms.ts
-- and re-checked in the server action before every write, the same split
-- `checkCoverage`/`saveGradeScale` already use for grade bands.
--
-- No other table references term_id yet (D-303: exams do not either), so
-- DELETE is allowed here, unlike sections/subjects.
-- =====================================================================

create table if not exists public.terms (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  academic_year_id uuid not null,
  name             text not null check (length(btrim(name)) between 1 and 60),
  starts_on        date not null,
  ends_on          date not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null,
  constraint terms_academic_year_fkey
    foreign key (academic_year_id, workspace_id) references public.academic_years (id, workspace_id)
    on delete cascade,
  constraint terms_range_valid check (ends_on >= starts_on)
);

comment on table public.terms is
  'F-OP-07 §3.3 / §4 W3: an ordered term within an academic year ("1st '
  'Term", "Final Term"). Gap/overlap and in-year-range are domain-level '
  '(packages/domain/src/academic/terms.ts), not a DB constraint.';

create unique index if not exists terms_year_name_key
  on public.terms (academic_year_id, lower(name));
-- justification: natural key — no two "1st Term" rows in one year.
create index if not exists terms_workspace_year_idx
  on public.terms (workspace_id, academic_year_id, starts_on);
-- justification: tenant key + "terms of a year" listing, in date order
-- (the order the UI and the repository both use — DATA-MODEL.md §2.2).
create index if not exists terms_created_by_idx
  on public.terms (created_by) where created_by is not null;
-- justification: FK column (profiles on delete set null).

select app.attach_freeze_workspace('public.terms');
select app.attach_updated_at('public.terms');
select app.attach_audit('public.terms');
select app.attach_require_writable('public.terms');

create trigger created_by_immutable before update on public.terms
  for each row execute function app.tg_created_by_immutable();

do $$
declare
  v_table  text;
  v_tables text[] := array['terms'];
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

alter table public.terms enable row level security;

drop policy if exists terms_select on public.terms;
create policy terms_select on public.terms
  for select to authenticated
  using (
    app.has_role(workspace_id, array['owner', 'admin', 'teacher', 'staff'])
    or (select app.is_platform_admin())
  );
drop policy if exists terms_insert on public.terms;
create policy terms_insert on public.terms
  for insert to authenticated
  with check (
    app.has_role(workspace_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );
drop policy if exists terms_update on public.terms;
create policy terms_update on public.terms
  for update to authenticated
  using      (app.has_role(workspace_id, array['owner', 'admin']))
  with check (app.has_role(workspace_id, array['owner', 'admin']));
drop policy if exists terms_delete on public.terms;
create policy terms_delete on public.terms
  for delete to authenticated
  using (app.has_role(workspace_id, array['owner', 'admin']));

revoke all on public.terms from anon, authenticated;
grant select, insert, update, delete on public.terms to authenticated;

-- =====================================================================
-- set_current_academic_year — the swap `academic_years_one_current`
-- (20260925300101, D-100) requires: unset the old current year, set the
-- new one, in one transaction so the partial unique index is never
-- violated mid-swap. SECURITY DEFINER + an explicit role check (same
-- shape as public.save_grade_scale, D-302) because two ordinary
-- client-side UPDATEs are not atomic.
-- =====================================================================
create or replace function public.set_current_academic_year(
  p_workspace_id     uuid,
  p_academic_year_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.has_role(p_workspace_id, array['owner', 'admin']) then
    raise exception 'only an owner or admin can change the current academic year'
      using errcode = '42501';
  end if;

  -- Serialize concurrent swaps for the same workspace (review of PR #110):
  -- two ordinary (non-deferred) unique-index checks are safe within one call,
  -- but two concurrent calls targeting different years could otherwise both
  -- pass their own uniqueness check before either commits.
  perform pg_advisory_xact_lock(hashtext(p_workspace_id::text));

  if not exists (
    select 1 from public.academic_years
     where id = p_academic_year_id and workspace_id = p_workspace_id
  ) then
    raise exception 'academic year not found' using errcode = 'P0002';
  end if;

  update public.academic_years set is_current = false
   where workspace_id = p_workspace_id and is_current and id <> p_academic_year_id;

  update public.academic_years set is_current = true
   where id = p_academic_year_id and workspace_id = p_workspace_id;

  return p_academic_year_id;
end;
$$;

comment on function public.set_current_academic_year(uuid, uuid) is
  'F-OP-07 §4 W3.1 (D-210): atomically move is_current to another academic '
  'year. Owner/admin only; each UPDATE still fires app.attach_audit, so the '
  'change is traceable both ways (old year -> false, new year -> true).';

revoke all on function public.set_current_academic_year(uuid, uuid) from public, anon;
grant execute on function public.set_current_academic_year(uuid, uuid) to authenticated;
