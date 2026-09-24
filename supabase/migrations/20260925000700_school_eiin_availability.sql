-- =====================================================================
-- F-ID-05 Part 3 — EIIN availability check (spec §4.3 step 1, §5, §7, D-66).
--
-- Step 1 of the create-school wizard must tell the user, before they ever
-- submit the five-step form, whether an EIIN they typed already belongs to
-- another school (AC6: "an inline error names the collision ... the
-- wizard does not advance"). `school_profiles`' RLS (DATA-MODEL.md §1.3,
-- class T2) only lets an ACTIVE MEMBER of a school read its row -- exactly
-- the access a brand-new user filling in the wizard does not have for any
-- school, let alone the one whose EIIN collides.
--
-- Two pieces:
--   1. The actual enforcement: a partial unique index. A race between two
--      concurrent submissions is a database constraint's job, not a
--      client-side check's -- this is also what Part 4's
--      app.create_school_workspace() will eventually catch (23505) and
--      translate to the CreateSchoolWorkspaceInput error EIIN_TAKEN.
--   2. The UX-layer probe this Part's step 1 actually calls: a SECURITY
--      DEFINER function returning a boolean ONLY (never which school holds
--      the EIIN, never any other column) -- the same "does X already
--      exist, without granting read access to the row" shape
--      public.throttle_status and this codebase's other public SECURITY
--      DEFINER wrappers already use (D-50, 20260917020000_identity_auth.sql).
-- =====================================================================

create unique index if not exists school_profiles_eiin_unique
  on public.school_profiles (eiin)
  where eiin is not null;

comment on index public.school_profiles_eiin_unique is
  'F-ID-05 §5: "EIIN ... unique across the platform." Partial: personal '
  'workspaces carry no school_profiles.eiin and most schools have none yet.';

create or replace function app.eiin_is_available(p_eiin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.school_profiles where eiin = p_eiin
  );
$$;

comment on function app.eiin_is_available(text) is
  'F-ID-05 Part 3: true when no school_profiles row already carries this '
  'EIIN. SECURITY DEFINER -- RLS would otherwise hide every school a caller '
  'is not a member of, which for a brand-new wizard is every school.';

create or replace function public.check_eiin_available(eiin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.eiin_is_available(eiin);
$$;

comment on function public.check_eiin_available(text) is
  'F-ID-05 Part 3 §4.3 step 1, AC6: the wizard''s pre-submit EIIN probe. '
  'public wrapper around app.eiin_is_available -- app is unreachable from '
  'PostgREST directly (D-50; supabase/config.toml exposes only public).';

revoke all on function public.check_eiin_available(text) from public;
grant execute on function public.check_eiin_available(text) to authenticated;
