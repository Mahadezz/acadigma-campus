# @acadigma/contracts

## 0.1.0

### Minor Changes

- 5024296: F-ID-09 Parts 1-3 (audit viewer): the audit substrate — richer `audit_events` columns (actor_kind, subject_user_id, changed_fields, severity, hashed request IP), `app.audit_action_catalog` with the F-ID-09 §5.1 action catalogue and a CI parity check against its TypeScript mirror, a universal secret deny-list plus a free-text-nulling mechanism in the generic audit trigger, `audit_events_view` as the sole read surface, and correlation-id threading via a PostgREST pre-request hook — plus the owner-facing audit viewer at `/app/audit` (filterable list, detail sheet with a redacted diff, and the correlation/per-record history views).
- ecb6888: Production foundation: pnpm/Turbo monorepo, Supabase migrations 0001–0004 with RLS helpers and pgTAP suites, shared contracts/domain/db/ui packages, Next.js 15 app shell with Supabase SSR auth and PWA, 13-job CI.
- 411cefe: F-ID-01 Authentication, Parts 1-4: register + email verification, sign in/out, forgot/reset/change password. Adds `auth_throttle` and the `public.throttle_*`/`log_auth_event` RPCs (migration `20260917020000_identity_auth.sql`); `packages/domain/src/auth` (password policy, safe-return-to); `packages/contracts/src/identity/auth`; `AuthCard`/`PasswordField`/`CountdownButton`/`InlineAlert` in `packages/ui`; the `/login`, `/register`, `/verify`, `/forgot`, `/reset` and `/account/security` screens.
- 7e774ce: F-ID-03 Workspaces & Membership, Parts 1-3: tenancy hardening + `WorkspaceContext` resolution + permission matrix + nav engine.

  - Migration `20260917020300_tenancy_hardening.sql` (D-50): `public.switch_workspace`/`public.list_my_workspaces`/`public.log_tenancy_context_rejected` RPCs, and `app.attach_freeze_workspace('public.school_profiles')` closing a real tenant-reparenting gap (the table's `workspace_id` PK was UPDATE-able).
  - `supabase/tests/09_tenancy.sql`: the four Base44 security-review attack paths (self-role escalation, cross-tenant read/write, membership self-insert-as-owner, removed-member access) re-proven with zero-rows-affected assertions.
  - `packages/db/src/workspace-context.ts`: full F-ID-03 §4.3 resolution order (header → `profiles.last_active_workspace_id` → first active membership, personal first), typed failure reasons, and the `tenancy.context_rejected` audit tripwire on a forged header.
  - `packages/domain/src/permissions.ts`: extended to the full F-ID-03 §2 tenancy/membership action list, with an exhaustive transcribed-table test.
  - `packages/domain/src/nav/`: typed nav config per workspace type × role (DESIGN-SYSTEM §3.2) and the pure `filterNav`/`isRouteVisible` functions.
  - `packages/domain/src/workspace/resolveLanding.ts`: `resolveLandingRoute` (F-ID-03 §4.4), replacing F-ID-01's `/onboarding`-only stub.
  - `apps/web/lib/workspace.ts` `requireWorkspace()` (unchanged contract, now backed by the hardened resolver) + `apps/web/app/(shared)/workspace/actions.ts` (`switchWorkspace`, `listMyWorkspaces`); `packages/contracts/src/identity/workspace.ts`.
  - `apps/web/app/(school)/app/page.tsx`: redirects the school shell root to `/app/dashboard` (needed for `resolveLandingRoute`'s `/app` destination to actually resolve).

- f1d28cb: M0 cross-feature gates: F-OP-07 school settings `resolve()` with the shipped defaults for the five `school_profiles` policy blobs, a read/patch repository and `updateSchoolSettings`/`getSchoolSettings` server action; F-ID-07 v1 notification event catalogue (54 events), its contracts mirror, and a CI parity test keeping catalogue, code and translated strings in sync.
- d6e1696: F-CM-06 Plans & Subscriptions, Parts 1-3: the reusable plans/limits engine. Adds
  `packages/domain/src/plans` (pure `assertWithinLimit`, `hasModule`, trial and
  proration math), `packages/db/src/repositories/{plans,subscriptions,usage}` (including
  the `requireWritable` PLAN_READ_ONLY guard, D-29), and `packages/contracts/src/plans`
  Zod schemas. Migration `20260917020100_plans_limits_engine.sql` adds a
  `platform_settings` table (AI top-up placeholders, D-39), seeds the `fees` module on
  Starter+ (D-31), adds `app.workspace_plan`/`app.within_limit`, and closes a permission
  gap in `app.set_access_mode` (previously callable by any authenticated user).

### Patch Changes

- 79c6671: Bump `vitest` (and its transitive `@vitest/mocker`) from 3.2.7 to 4.1.11 across every workspace to close GHSA-82fw-gwwq-j7x9 (path traversal / arbitrary file read via `@vitest/mocker`'s redirect mock), a dev-only dependency (Dependabot alerts #1–7, all moderate). 4.1.11 was published 2026-08-18, clearing D-49's 2-day release-age cooldown without an exclude entry.

  Vitest 4 removed the separate `vitest.workspace.ts` file; the five test projects (`domain`, `contracts`, `db`, `web`, `ui`) now live under `test.projects` in `vitest.config.ts`. `packages/ui` gained `@types/node` and `"node"` in its `tsconfig.json` `types` array, restoring the `process.env.NODE_ENV` typing in `src/motion/gsap.ts` that vitest 3's type chain had been pulling in incidentally. No runtime behaviour change; `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm --filter @acadigma/web build` are green.
