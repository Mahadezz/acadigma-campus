-- =====================================================================
-- F-ID-05 Part 1 — automatic personal workspace at registration.
--
-- Everything else Part 1 asks for already shipped in 0002
-- (20260917010100_identity.sql): app.handle_new_user() inserts a profile,
-- user_preferences and a `type='personal'` workspace in the SAME
-- transaction as the auth.users row, and the workspace insert's own AFTER
-- INSERT trigger (app.tg_workspace_bootstrap()) creates the owner
-- membership — so "no account can exist without a personal workspace" and
-- "a raised trigger rolls back the whole signup" already hold by
-- construction (Postgres trigger semantics: an exception anywhere in the
-- chain aborts the INSERT into auth.users itself). No user-triggered
-- "create my personal workspace" action exists anywhere in
-- apps/web or packages.
--
-- PRODUCT-DECISIONS 1.2 and F-ID-05 §4.1/§5 promise "exactly one [personal
-- workspace], enforced by a partial unique index" and spec §8 Part 1 says
-- "remove any notion of a user-triggered personal-workspace creation" — but
-- that promise was never actually closed at the database layer, and
-- `created_by` was NOT immutable (contrary to what an earlier draft of this
-- migration's own comment, DATA-MODEL.md and the spec all claimed). Before
-- this migration, ANY authenticated user could mint unlimited personal
-- workspaces directly over PostgREST:
--   1. PATCH .../workspaces?id=eq.<their own personal ws> { created_by: null }
--      — app.tg_workspaces_guard() checked type/owner_id/invite_code but not
--      created_by, and the owner/admin UPDATE policy + table-wide grant let
--      an owner update their own row.
--   2. POST .../workspaces { type: 'personal', owner_id: <uid>,
--      created_by: <uid> } — the INSERT policy only checked
--      owner_id = created_by = auth.uid(), never `type`, so a direct client
--      insert of a personal workspace was allowed outright.
--   3. Repeat: workspaces_one_personal_per_creator (added below) does not
--      stop this on its own, because NULL never collides with NULL in a
--      unique index — step 1 clears the OLD row's created_by first, so the
--      new row's created_by is free to collide with nothing.
-- Each such row gets a real owner membership + Free-plan bootstrap from
-- app.tg_workspace_bootstrap() like any other workspace — this is not a
-- cosmetic gap, it is unlimited free-tier resource creation.
--
-- This migration closes BOTH the missing enforcement and the two exploitable
-- paths, together, since the index alone (found by an earlier session) is
-- not sufficient by itself:
--   1. workspaces_one_personal_per_creator — the partial unique index.
--   2. app.tg_workspaces_guard() — created_by joins type/owner_id/invite_code
--      as immutable through plain client DML (CREATE OR REPLACE, body
--      otherwise unchanged from 20260917010100_identity.sql:606-644).
--   3. workspaces_insert policy — WITH CHECK gains `type = 'school'`: no
--      client code inserts a workspace of any type today (personal workspaces
--      are created exclusively by app.handle_new_user(), which runs as a
--      SECURITY DEFINER function and so is unaffected by this RLS policy;
--      packages/db/src/repositories/plans.ts:148 only ever reads
--      `workspaces`), so this closes the direct-insert path with no loss of
--      the RLS-level function a future school-creation path needs — a
--      type='school' row still PASSES this WITH CHECK clause (proven in
--      15_personal_workspace_registration.sql). Whether such an insert
--      succeeds END TO END is a separate question this migration does not
--      answer: writing that new test surfaced a pre-existing, unrelated bug
--      where app.tg_workspace_billing_bootstrap()'s own nested UPDATE trips
--      app.tg_workspaces_guard()'s app.is_privileged_context() check as
--      though it were an ordinary client statement, despite running inside
--      a SECURITY DEFINER function — tracked in this PR's test report as a
--      known issue, NOT fixed here (out of scope: unrelated to the
--      personal-workspace exploit this migration closes, and Part 4's
--      planned `app.create_school_workspace()` RPC should be re-verified
--      against this before anyone assumes it is unaffected).
-- =====================================================================

create unique index if not exists workspaces_one_personal_per_creator
  on public.workspaces (created_by)
  where type = 'personal';

comment on index public.workspaces_one_personal_per_creator is
  'PRODUCT-DECISIONS 1.2 / F-ID-05 Part 1: exactly one personal workspace '
  'per creator, ever. `created_by` (not `owner_id`) is the constrained '
  'column because a personal workspace''s ownership is never transferred '
  '(app.transfer_ownership() is a school-workspace operation) while '
  '`created_by` is the "who was this made for" fact recorded at '
  'registration and, since this migration, immutable through plain client '
  'DML (app.tg_workspaces_guard()). Defence in depth: app.handle_new_user() '
  'already creates at most one by construction (it runs once per '
  'auth.users row), so this index guards against a future bug or a direct '
  'administrative insert, not the normal signup path. On its own this index '
  'is NOT sufficient — created_by must also be immutable and personal-type '
  'inserts must be blocked for authenticated clients, both fixed below in '
  'the same migration.';

-- ---------------------------------------------------------------------
-- app.tg_workspaces_guard(): created_by joins type/owner_id/invite_code as
-- immutable through plain client DML. Body otherwise IDENTICAL to
-- 20260917010100_identity.sql:606-644.
-- ---------------------------------------------------------------------
create or replace function app.tg_workspaces_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_privileged_context() then
    return new;                                   -- server-owned path
  end if;

  if new.type is distinct from old.type then
    raise exception 'workspace type is immutable' using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'ownership is transferred through app.transfer_ownership(), not by update'
      using errcode = '42501';
  end if;

  if new.invite_code is distinct from old.invite_code then
    raise exception 'the invite code is rotated through app.rotate_invite_code()'
      using errcode = '42501';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'created_by is immutable — it records who the workspace was made for'
      using errcode = '42501';
  end if;

  if app.is_platform_admin() then
    return new;
  end if;

  if new.plan_id is distinct from old.plan_id
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.status is distinct from old.status
     or new.access_mode is distinct from old.access_mode then
    raise exception 'plan, trial, workspace status and access mode are set by billing and platform staff'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- workspaces_insert policy: only `type = 'school'` may be inserted by an
-- authenticated client. Personal workspaces come exclusively from
-- app.handle_new_user() (SECURITY DEFINER, unaffected by this policy).
-- Everything else about the policy is unchanged from
-- 20260917010100_identity.sql:1107-1110.
-- ---------------------------------------------------------------------
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and created_by = (select auth.uid())
    and type = 'school'
  );
