# Acadigma Campus — Build Log

A dated, newest-first record of what merged to `main`, what it shipped, which decisions it carries, which migrations went live and how the smoke test went. The lead appends one entry here after every merge (`docs/plan/LANES.md` "How a Part moves", step 6). Seeded from `git log origin/main --first-parent` and `gh pr list --state merged` for everything from M0 through 2026-09-25. Order is true merge order (`git log --first-parent`/`mergedAt`), newest first — not commit-message date.

---

## 2026-09-25 — PR #36 — feat(design): D-68 visual refinement (Blend) + Acadigma product logos

- **Lane:** design
- **Shipped:** "Blend" visual refinement (6px radius, hairline rings instead of drop shadows, lighter/tighter headings, 16px body, an `eyebrow` utility) on top of D-57's ink/paper palette; real Acadigma/Campus grid-mark logos and app icons replace the placeholder text/icon.
- **Decisions:** D-68.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #32 — feat(ops): F-OP-06 Part 1 — staff schema, RLS and the compensation split

- **Lane:** operations
- **Shipped:** Staff schema (roles, employment status, the fixed/hourly compensation split) with its RLS policies.
- **Decisions:** D-63.
- **Migrations:** `20260925000900` — applied to production; smoke test passed.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #33 — chore(release): version packages

- **Lane:** lead
- **Shipped:** Changesets "version packages" release PR, merged — bumps package versions and `CHANGELOG`s for the changesets accumulated up to and including PR #34.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #34 — feat(identity): F-ID-05 Part 3 — create-school wizard, steps 1-2

- **Lane:** identity
- **Shipped:** The create-school onboarding wizard's first two steps (school profile, EIIN lookup/availability).
- **Decisions:** D-66, D-67.
- **Migrations:** `20260925000700_school_eiin_availability.sql`, `20260925000800_throttle_eiin_check_bucket.sql` — applied to production; smoke test passed.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #31 — feat(commerce): F-CM-06 Part 4 — trial expiry job puts a workspace into read-only mode

- **Lane:** billing
- **Shipped:** `expire_pro_trials()` moves an expired-trial workspace to `access_mode = read_only` instead of a Free plan (D-42 retired the Free plan row).
- **Decisions:** D-62.
- **Migrations:** `20260925000500_trial_expiry_billing_tick.sql` — applied to production; smoke test passed.
- **Review/incidents:** none noted.

## 2026-09-25 — PR #30 — feat(identity): F-ID-03 Part 4 — workspace switcher, shell layout gate, minimal personal/family shells

- **Lane:** identity
- **Shipped:** `resolveShellGate()` closes the M0 gap where a parent/personal context could render the wrong shell's nav tree; `WorkspaceSwitcher` reuses `FormSheet` instead of a bespoke desktop dropdown.
- **Decisions:** D-61.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #24 — feat(identity): F-ID-05 Part 2 — onboarding shell and chooser

- **Lane:** identity
- **Shipped:** Onboarding shell and path chooser; `onboarding_progress` repository keyed on `userId` rather than `WorkspaceContext` (no context exists yet at this stage).
- **Decisions:** D-60.
- **Migrations:** `20260925000300_onboarding_progress.sql` — applied to production. Merged after PR #29 the same day, so the anonymous-RPC smoke test (added by #29) already existed for this deploy and passed.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #29 — fix(db): hotfix — pre-request hook broke every anonymous API call (D-65)

- **Lane:** lead
- **Shipped:** `public.pre_request()` SECURITY DEFINER wrapper so `anon` can reach the PostgREST pre-request hook without USAGE on schema `app`. `db.yml`'s push job gained the anonymous-RPC smoke test as part of this fix.
- **Decisions:** D-65.
- **Migrations:** `20260925000250_pre_request_public_wrapper.sql` — applied to production; first deploy to carry the new smoke test, passed.
- **Review/incidents:** **Incident.** The audit-substrate migration (PR #6) had set `pgrst.db_pre_request = app.pre_request`, and `anon` has no USAGE on schema `app` (D-50) — every anonymous request (sign in, register, reset password) failed with `42501` on the live site from the moment that migration deployed. CI could not catch it (no PostgREST in CI's Postgres). Found manually on 2026-09-24 by signing in to campus.acadigma.com with the demo account; fixed same day.

## 2026-09-24 — PR #28 — docs(decisions): D-64 — infrastructure decisions taken with the owner on 2026-09-24

- **Lane:** lead
- **Shipped:** Recorded the owner's infrastructure decisions: repo made public, public-repo protections enabled, Actions may open/approve PRs, Vercel functions pinned to `bom1`, demo account noted, `campus.acadigma.com` as the future domain.
- **Decisions:** D-64.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #27 — chore(release): version packages

- **Lane:** lead
- **Shipped:** Changesets "version packages" release PR, merged.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #26 — ci(release): rename createGithubReleases to create-github-releases (changesets/action v2)

- **Lane:** lead
- **Shipped:** Fixed `release.yml`'s changesets action input name for the v2 action, unblocking the release PR (had failed on this since M0).
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #5 — ci(deps): bump the actions group across 1 directory with 10 updates

- **Lane:** lead
- **Shipped:** Dependabot group bump of pinned GitHub Actions SHAs.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #25 — chore(web): pin Vercel functions to bom1 (Mumbai), next to the database

- **Lane:** lead
- **Shipped:** `apps/web/vercel.json` region pinned to `bom1`, alongside the `ap-south-1` database (production had been running in `iad1`). Completes COMPLIANCE-PDPA's function-region requirement.
- **Decisions:** none (folded into D-64 item 4).
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #23 — fix(db): workspace billing bootstrap no longer trips the tenant guard (D-59)

- **Lane:** billing
- **Shipped:** Split `app.tg_workspace_billing_bootstrap()` into a BEFORE INSERT `app.tg_workspace_billing_defaults()` (sets `plan_id`/`trial_ends_at` directly, no nested UPDATE) plus a narrower AFTER INSERT step for `subscriptions`, so the bootstrap no longer trips `app.tg_workspaces_guard()`'s `authenticated`-role check. Hardened on review: a client-supplied `plan_id`/`trial_ends_at` is now always overwritten, and a missing plan-catalogue row aborts the transaction instead of silently under-entitling.
- **Decisions:** D-59.
- **Migrations:** `20260925000200_billing_bootstrap_vs_workspace_guard.sql` — applied to production before the smoke-test step existed; no smoke-test record for this deploy.
- **Review/incidents:** hardening added on Opus review before merge (see D-59 consequences).

## 2026-09-24 — PR #19 — feat(identity): F-ID-05 Part 1 — personal workspace at registration

- **Lane:** identity
- **Shipped:** Registration creates a personal workspace for every new user; audited via the existing generic `workspaces.insert` row rather than a curated `workspace.created` action.
- **Decisions:** D-58.
- **Migrations:** `20260925000100_personal_workspace_uniqueness.sql` — applied to production before the smoke-test step existed; no smoke-test record for this deploy.
- **Review/incidents:** decision raised on Opus review (D-58) rather than left as an undiscussed spec deviation.

## 2026-09-24 — PR #22 — chore(deps): triage and fix Dependabot alerts

- **Lane:** lead
- **Shipped:** Triaged and resolved open Dependabot security alerts.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #20 — feat(ui): visual language from acadigma.com — ink/paper tokens, JetBrains Mono (D-57)

- **Lane:** design
- **Shipped:** Ink/paper token set and JetBrains Mono replace the prior palette across `packages/ui`; retired amber-as-decoration, kept semantic colour only.
- **Decisions:** D-57.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #18 — test(db): isolation + escalation tests for the 5 KNOWN_GAPS tables

- **Lane:** lead
- **Shipped:** pgTAP isolation and escalation coverage for the 5 tables `coverage.sql` had tracked as gaps since M0 wrap-up.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #21 — docs(roadmap): reconcile M1 Part numbers with the specs

- **Lane:** lead
- **Shipped:** Reconciled `ROADMAP.md`'s M1 order table against the feature specs' own §8 Part numbering (see ROADMAP.md "Changes (2026-09-24)" for the itemised fixes).
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #17 — feat(m0): wrap-up — one nav system wired into the school shell; RLS/grants invariants; coverage.sql

- **Lane:** lead
- **Shipped:** Unified the two nav systems onto the domain's curated trees; added `13_rls_grants_invariants.sql` (every table RLS-on, no anon USAGE on `app`) and `coverage.sql` + `scripts/check-coverage-test-files.mjs`. Closed M0.
- **Decisions:** D-56.
- **Migrations:** none.
- **Review/incidents:** review found the `(school)` shell layout-gate gap, carried into M1 1.1 / PR #30.

## 2026-09-24 — PR #16 — fix(tenancy): tripwire RPC refuses a caller with no auth.uid()

- **Lane:** identity
- **Shipped:** Tenancy tripwire RPC now refuses a caller with no `auth.uid()` instead of misclassifying it.
- **Decisions:** none.
- **Migrations:** `20260924040000_tripwire_requires_auth.sql` — applied to production.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #9 — docs: 2026-09-24 handoff, rules learned, OQ-26 answered

- **Lane:** lead
- **Shipped:** `docs/plan/HANDOFF-2026-09-24.md` — current state, infrastructure, rules learned, owner actions, next steps.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #14 — fix(db): deny-by-default function EXECUTE; CI mirrors Supabase default privileges

- **Lane:** lead
- **Shipped:** Revoked Supabase's default function EXECUTE grants (D-54: deny by default, explicit `grant execute` per function); `db` job's CI bootstrap now mirrors the platform's default privileges so this class of bug is caught in CI, not production.
- **Decisions:** D-54.
- **Migrations:** `20260924030000_revoke_default_function_grants.sql` — applied to production.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #12 — fix(tenancy): F-ID-03 review follow-ups — stale workspace cookie, removed-vs-forger tripwire, cascade freeze

- **Lane:** identity
- **Shipped:** Fixed three review follow-ups from the F-ID-03 tenancy PR: stale workspace cookie handling, distinguishing a removed member from a forged context, and a cascade-freeze exception.
- **Decisions:** D-52.
- **Migrations:** `20260924010000_tenancy_freeze_cascade_exception.sql`, `20260924020000_tenancy_tripwire_membership_status.sql` — applied to production.
- **Review/incidents:** follow-ups from F-ID-03's own review (PR #7).

## 2026-09-24 — PR #6 — feat(identity): F-ID-09 Parts 1-3 - audit substrate, catalogue, owner viewer

- **Lane:** lead
- **Shipped:** Append-only audit substrate, generic `app.tg_audit()` trigger, `app.log_audit_event()`, the audit action catalogue, and the owner's audit viewer.
- **Decisions:** D-51.
- **Migrations:** `20260924000100_audit_substrate.sql` — applied to production. This migration is the one that later broke anonymous sign-in (see PR #29's incident note).
- **Review/incidents:** the pre-request-hook permission gap that caused the D-65 incident originates in this migration; not caught here because CI has no PostgREST.

## 2026-09-24 — PR #15 — ci(db): check generated types against the PR's own migrations (D-55)

- **Lane:** lead
- **Shipped:** Moved `types.generated.ts` freshness checking into the `db` job, generated from the PR's own migrations applied to CI's Postgres rather than the live project.
- **Decisions:** D-55.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #13 — chore(supabase): move Campus to its own Supabase project (D-53)

- **Lane:** lead
- **Shipped:** Moved the Campus app onto its own Supabase project (`kekfmibwjejdhxjkmezo`), superseding the earlier shared-project decision (D-19).
- **Decisions:** D-53 (supersedes D-19).
- **Migrations:** none (project migration, not a schema migration).
- **Review/incidents:** none noted.

## 2026-09-24 — PR #11 — fix(ui): self-host Inter and Hind Siliguri via next/font (DESIGN-SYSTEM §1.6)

- **Lane:** design
- **Shipped:** Self-hosted Inter and Hind Siliguri via `next/font` instead of a runtime Google Fonts request.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-24 — PR #7 — F-ID-03 Workspaces & Membership, Parts 1-3: tenancy hardening, WorkspaceContext, permissions + nav

- **Lane:** identity
- **Shipped:** Tenancy tables, RLS template, `WorkspaceContext` resolution, permission matrix, nav engine — the highest-risk work in the repo, landed while the codebase was still small.
- **Decisions:** D-12 (further refined), D-50 (client-callable function grants).
- **Migrations:** `20260917020300_tenancy_hardening.sql` — applied to production.
- **Review/incidents:** produced the follow-ups fixed in PR #12.

## 2026-09-17 — PR #3 — feat(auth): F-ID-01 Authentication, Parts 1-4

- **Lane:** identity
- **Shipped:** Supabase Auth wiring, `profiles`, register + verify, sign in/out, password reset; established `withServiceRole`, middleware, generated types.
- **Decisions:** D-50.
- **Migrations:** `20260917020000_identity_auth.sql` — applied to production.
- **Review/incidents:** none noted.

## 2026-09-17 — PR #8 — M0 0.9: packages/ui primitives conformance, OpenTelemetry, redactForAI()

- **Lane:** design
- **Shipped:** `packages/ui` primitives (AppShell, TopBar, BottomNav, FormSheet, DataList, EmptyState, StatusChip, MoneyText) matched to `DESIGN-SYSTEM.md`; GSAP motion module (lazy-loaded, reduced-motion aware); OpenTelemetry wiring (`@vercel/otel`); `redactForAI()` moved up from M5 to land before any AI code path exists.
- **Decisions:** D-30, D-33 (implemented).
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-17 — PR #2 — feat(billing): plans/limits engine (F-CM-06 Parts 1-3)

- **Lane:** billing
- **Shipped:** Plans, subscriptions and trial; the limits engine (`assertWithinLimit`, `hasModule`, `access_mode`) every later area gates on.
- **Decisions:** D-39 (plan_prices/overage numbers).
- **Migrations:** `20260917020100_plans_limits_engine.sql` — applied to production.
- **Review/incidents:** none noted.

## 2026-09-17 — PR #4 — feat(settings,notifications): resolve() defaults + notification catalogue skeleton

- **Lane:** operations
- **Shipped:** `resolve()` settings with defaults (timezone Asia/Dhaka, working days, policies as jsonb); notification event catalogue skeleton with its CI parity test.
- **Decisions:** none.
- **Migrations:** none.
- **Review/incidents:** none noted.

## 2026-09-17 — PR #1 — Foundation: monorepo, database substrate, app shell, CI (M0 0.1)

- **Lane:** lead
- **Shipped:** Monorepo scaffold, foundation migrations 0001-0004 (app schema helpers, identity, audit/files/counters/jobs, plans/notifications), pgTAP bootstrap suite and seed, CI pipeline, app shell skeleton.
- **Decisions:** D-01 through D-49 (the initial decision log; not itemised individually here — see `DECISION-LOG.md`).
- **Migrations:** `20260917010000_extensions_and_app_schema.sql`, `20260917010100_identity.sql`, `20260917010200_audit_and_files.sql`, `20260917010300_plans_and_notifications.sql` — applied to production.
- **Review/incidents:** none noted.
