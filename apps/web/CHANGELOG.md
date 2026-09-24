# @acadigma/web

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
- df07612: `packages/ui` primitives brought into conformance with DESIGN-SYSTEM.md §3–§7: nav-config-driven `BottomNav` (role/plan/owner-visibility filtering, a "More" sheet), token-only `StatusChip`/`MoneyText` (Indian grouping, Bengali numerals, lakh/crore compact), `DataList` rows-not-cards with cursor pagination and fixed-row virtualisation, a dirty-close guard on `FormSheet`, safe-area padding on `TopBar`/`BottomNav`, and the four missing custom primitives (`AttendanceToggle`, `MarkCell`, `PeriodGrid`, `BnEnText`). OpenTelemetry via `@vercel/otel` in `apps/web/instrumentation.ts` plus a `workspace_id`/`correlation_id` span-attribute helper (D-30). `redactForAI()` in `packages/domain/src/ai/redact.ts` — the allow-listed, fail-closed projection required before any Anthropic call (D-34) — with a Semgrep rule and an eslint import restriction enforcing D-26(5).
- 53a8393: M0 wrap-up (DECISION-LOG D-56): the two nav systems (`packages/domain/src/nav` and `packages/ui/src/primitives/nav-config.ts`) are unified on domain's curated DESIGN-SYSTEM §3.2 trees as the single source of `NavItem`/`NavConfig` types and data; `packages/ui` adds only the icon map and the seller/platform trees domain deliberately does not model. New `packages/domain/src/nav/entitlements.ts` maps the nav's per-screen module keys onto the plans engine's per-bundle `plan_modules`. The school shell (`apps/web/app/(school)/app`) now picks its curated tree from `WorkspaceContext.role` server-side, computes entitled modules from the plans engine, and renders `BottomNavFromConfig` on phone and the new `SidebarFromConfig` on desktop — replacing the old hand-rolled `SCHOOL_NAV`/`SchoolSidebar` that read neither nav engine.
- c87dc0f: D-57: visual language from acadigma.com. Chrome tokens (background, foreground, card, popover, muted, border, input, ring, primary, secondary, accent, sidebar) are now literal ink (`#0b0b0b`) / paper (`#f4f4f2`) hex copied from acadigma-website's `globals.css`, replacing the indigo `--primary` and dark-navy `--sidebar`. `--danger`/`--destructive` is recoloured to the website's literal red (`#b42318` light, `#f97066` dark). `--accent` is retired from a rationed amber highlight to a plain neutral surface. Attendance, grade-band and chart colours are unchanged. Radius multipliers now match the website's; shadows are ink-tinted instead of hue-272; a new `--ease-out-expo` token is available for entrances. JetBrains Mono is added as `--font-mono` via `next/font`, and `html` gets `cv11`/`ss01` font features. `button`, `card`, `input` and `auth-card` move to the ink-tinted `shadow-flat` token in place of Tailwind's stock shadow utilities.

### Patch Changes

- 371489d: Campus now runs on its own Supabase project `kekfmibwjejdhxjkmezo` (DECISION-LOG D-53, superseding D-19): the Next.js remote-image host, `.env.example`, CI's public env and `supabase/config.toml` point at the new project. The marketing site keeps the old project for its waitlist. `packages/db/src/types.generated.ts` is now generated from the live schema (it was a placeholder); `updateSchoolSettings` and the web audit helper are typed against it, which exposed and fixed four null-vs-optional argument mismatches.
- 79c6671: Bump `vitest` (and its transitive `@vitest/mocker`) from 3.2.7 to 4.1.11 across every workspace to close GHSA-82fw-gwwq-j7x9 (path traversal / arbitrary file read via `@vitest/mocker`'s redirect mock), a dev-only dependency (Dependabot alerts #1–7, all moderate). 4.1.11 was published 2026-08-18, clearing D-49's 2-day release-age cooldown without an exclude entry.

  Vitest 4 removed the separate `vitest.workspace.ts` file; the five test projects (`domain`, `contracts`, `db`, `web`, `ui`) now live under `test.projects` in `vitest.config.ts`. `packages/ui` gained `@types/node` and `"node"` in its `tsconfig.json` `types` array, restoring the `process.env.NODE_ENV` typing in `src/motion/gsap.ts` that vitest 3's type chain had been pulling in incidentally. No runtime behaviour change; `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm --filter @acadigma/web build` are green.

- 2b8664d: F-ID-03 review follow-ups (D-52): a stale `acadigma_workspace` cookie from a previous session on a shared device no longer survives into a new sign-in (`signInWithPassword`, `resetPassword`'s `verifyOtp`, `/api/auth/callback`'s `verifyOtp` all clear it, and `resolveLandingRoute` never trusts the request's `x-workspace-id` header); `resolveWorkspaceContext` distinguishes a removed/pending member (`membership_inactive`) from a genuine forged-header attempt (`not_a_member`); both still fire the tripwire, which now records the caller's membership status and a `forgery`/`inactive` severity server-side (`20260924020000_tenancy_tripwire_membership_status.sql`); and a new migration (`20260924010000_tenancy_freeze_cascade_exception.sql`) lets `app.tg_freeze_workspace` allow the one `ON DELETE SET NULL` cascade transition on `public.data_requests.workspace_id` that a platform hard-delete of a workspace needs, while still blocking every direct client re-parent.
- 98ff1f8: Load Inter and Hind Siliguri through `next/font` in the root layout and bind the `--font-sans` / `--font-bn` tokens to them (DESIGN-SYSTEM §1.6). Until now no font was loaded at all, so every surface rendered in the browser default.
- b2e2117: Pin Vercel functions to `bom1` (Mumbai), next to the Supabase project in ap-south-1 (COMPLIANCE-PDPA P19). Production functions previously ran in `iad1` (US East).
- Updated dependencies [5024296]
- Updated dependencies [371489d]
- Updated dependencies [35d4350]
- Updated dependencies [79c6671]
- Updated dependencies [ecb6888]
- Updated dependencies [411cefe]
- Updated dependencies [7e774ce]
- Updated dependencies [f1d28cb]
- Updated dependencies [df07612]
- Updated dependencies [53a8393]
- Updated dependencies [d6e1696]
- Updated dependencies [2b8664d]
- Updated dependencies [98ff1f8]
- Updated dependencies [c87dc0f]
  - @acadigma/contracts@0.1.0
  - @acadigma/domain@0.1.0
  - @acadigma/db@0.1.0
  - @acadigma/ui@0.1.0
