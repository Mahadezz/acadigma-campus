-- =====================================================================
-- F-ID-05 Part 2 — onboarding_progress (spec §3, §4.2, §4.7).
--
-- One row per user so a wizard abandoned on a bus can be resumed on a
-- laptop (§4.7: "Continue setting up {draft name}"). User-scoped, not
-- tenant-scoped: onboarding runs BEFORE the caller has any workspace_id at
-- all in the paths this table is written from (§2: "Onboarding runs before
-- a role exists"), so there is nothing to key it on. Same shape as
-- `public.user_preferences` (`20260917010100_identity.sql`) for the same
-- reason.
--
-- No `app.attach_audit()` here, matching `user_preferences` and
-- `device_registrations` in that same migration: the generic trigger's
-- `v_row_id` is read off an `id` column this table (like those two)
-- deliberately does not have — its PK is `user_id` — and `draft` is
-- documented as "never contains secrets" but is still a user's in-progress
-- form data, not a business event worth a redacted copy in a shared audit
-- trail platform staff can browse. Part 4's `app.create_school_workspace()`
-- transaction is what actually needs audit rows (`workspace.created` etc.),
-- per D-58.
-- =====================================================================

do $$ begin
  create type public.onboarding_path as enum ('undecided', 'create_school', 'join_school');
exception when duplicate_object then null; end $$;

comment on type public.onboarding_path is
  'F-ID-05 §3: which of the two onboarding routes a user has started, or '
  '''undecided'' before they pick one.';

create table if not exists public.onboarding_progress (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  path         public.onboarding_path not null default 'undecided',
  step         smallint not null default 1 check (step between 1 and 5),
  -- Nullable (unlike user_preferences' jsonb columns): §4.7 clears a
  -- finished onboarding by "setting completed_at and nulling draft" —
  -- draft therefore has to be able to hold NULL, not just '{}'.
  -- The 32000-byte cap mirrors packages/contracts/src/identity/onboarding.ts's
  -- onboardingDraftSchema (Opus review, PR #24: the app-layer cap alone is
  -- not a boundary — a direct authenticated write bypasses Zod entirely).
  draft        jsonb default '{}'::jsonb
                 check (draft is null or octet_length(draft::text) <= 32000),
  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

comment on table public.onboarding_progress is
  'F-ID-05 §3/§4.7: one row per user, resumable onboarding/wizard state. '
  'Cleared (never deleted — RLS below grants no delete at all) by setting '
  'completed_at and nulling draft. `draft` is validated against the same '
  'Zod schema on resume and, per spec, never contains secrets.';

select app.attach_updated_at('public.onboarding_progress');

-- ---------------------------------------------------------------------
-- RLS (spec §3): select/insert/update where `user_id = app.current_user_id()`;
-- no delete grant; platform staff may additionally read, for support.
-- ---------------------------------------------------------------------
alter table public.onboarding_progress enable row level security;

drop policy if exists onboarding_progress_select on public.onboarding_progress;
create policy onboarding_progress_select on public.onboarding_progress
  for select to authenticated
  using (
    user_id = (select app.current_user_id())
    or (select app.is_platform_admin())
  );

drop policy if exists onboarding_progress_insert on public.onboarding_progress;
create policy onboarding_progress_insert on public.onboarding_progress
  for insert to authenticated
  with check (user_id = (select app.current_user_id()));

drop policy if exists onboarding_progress_update on public.onboarding_progress;
create policy onboarding_progress_update on public.onboarding_progress
  for update to authenticated
  using      (user_id = (select app.current_user_id()))
  with check (user_id = (select app.current_user_id()));

-- No delete policy, and — the part that actually matters, since RLS with no
-- policy for a verb still lets a superuser-granted role attempt it — no
-- delete grant either. The row is cleared by setting completed_at and
-- nulling draft (§4.7), never removed.
revoke all on public.onboarding_progress from anon, authenticated;
grant select, insert, update on public.onboarding_progress to authenticated;
