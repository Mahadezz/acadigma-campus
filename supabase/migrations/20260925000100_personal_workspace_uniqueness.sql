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
-- apps/web or packages — there is nothing to remove.
--
-- The one gap: PRODUCT-DECISIONS 1.2 and F-ID-05 §4.1/§5 promise "exactly
-- one [personal workspace], enforced by a partial unique index" — the
-- application-level guarantee (one call site, fired once per signup) was
-- never backed by a database-level one. This migration adds it.
-- =====================================================================

create unique index if not exists workspaces_one_personal_per_creator
  on public.workspaces (created_by)
  where type = 'personal';

comment on index public.workspaces_one_personal_per_creator is
  'PRODUCT-DECISIONS 1.2 / F-ID-05 Part 1: exactly one personal workspace '
  'per creator, ever. `created_by` (not `owner_id`) is the constrained '
  'column because a personal workspace''s ownership is never transferred '
  '(app.transfer_ownership() is a school-workspace operation) while '
  '`created_by` is the immutable "who was this made for" fact recorded at '
  'registration. Defence in depth: app.handle_new_user() already creates '
  'at most one by construction (it runs once per auth.users row), so this '
  'index guards against a future bug or a direct administrative insert, '
  'not the normal signup path.';
