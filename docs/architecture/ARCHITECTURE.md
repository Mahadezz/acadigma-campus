# Acadigma Campus — Architecture

This is the **binding contract** for everything built in this repository. Feature specs (`docs/features/`) describe _what_; this document fixes _how_. If a feature needs to deviate, the deviation is recorded in `docs/decisions/DECISION-LOG.md` first.

Related: `docs/product/PRODUCT-DECISIONS.md` (what we are building and why) · `docs/architecture/DATA-MODEL.md` (tables, relations, policies) · `docs/engineering/HANDBOOK.md` (how we work) · `docs/engineering/SECURITY.md` (threat model and controls).

---

## 1. System overview

```
┌──────────────────────────────── clients ────────────────────────────────┐
│  Web PWA (phone-first)   Android (Capacitor shell)   Windows (Tauri 2)  │
│  ───────────────── one Next.js app, one design system ───────────────── │
└───────────────┬─────────────────────────────────────────────────────────┘
                │ HTTPS · Supabase session (JWT) · x-workspace-id
┌───────────────▼─────────────── apps/web (Vercel) ───────────────────────┐
│ Next.js 15 App Router                                                    │
│  • Server Components + Server Actions + Route Handlers = the API         │
│  • packages/domain  — pure business rules (policy, grading, payroll…)   │
│  • packages/db      — typed repositories; every call takes WorkspaceCtx │
│  • packages/contracts — Zod schemas shared by UI, actions, jobs, tests  │
│  • adapters/        — payments (SSLCommerz), ai (Claude), email, pdf     │
└───────┬───────────────────────┬──────────────────────┬──────────────────┘
        │ service role (server only)                   │ anon key + user JWT (browser: reads, realtime)
┌───────▼───────────────────────▼──────────────────────▼──────────────────┐
│ Supabase project `acadigma-suite` (ap-south-1)                          │
│  Postgres 17 — RLS on every table · SECURITY DEFINER helpers · triggers │
│  Auth (email+password, phone OTP, magic link) · Storage (private)        │
│  Realtime (messaging, notifications) · pg_cron (jobs) · Edge Functions   │
│  (webhooks: SSLCommerz IPN, email events)                                │
└──────────────────────────────────────────────────────────────────────────┘
External: SSLCommerz (BDT payments) · Anthropic Claude · Resend (email) · Vercel (hosting, previews, cron)
```

**One rule above all:** _the database and the server are the security boundary._ UI guards exist for experience only.

## 2. Repository layout

```
acadigma-campus/
  apps/
    web/                    Next.js app (PWA). Route groups below.
    android/                Capacitor project (added in the wrapper phase)
    windows/                Tauri 2 project + print agent (wrapper phase)
  packages/
    contracts/              Zod schemas + inferred types (requests, responses, events, forms)
    domain/                 Pure TS: permissions matrix, grading/GPA, attendance %, payroll impact,
                            cover ranking, credit pricing, id formatting. No I/O. 100% unit-tested.
    db/                     Supabase clients (server/browser/service), generated types,
                            repositories per module, WorkspaceContext, query helpers
    ui/                     Design system: tokens, shadcn components (from F:\shadcn-ui registry),
                            phone-first primitives (AppShell, BottomNav, Sheet forms, DataList)
    config/                 shared tsconfig, eslint, prettier, tailwind preset
  supabase/
    migrations/             SQL, one file per change, forward-only, numbered by timestamp
    seed/                   dev seed (demo school, users, timetable, marks)
    tests/                  pgTAP tests: RLS isolation + role escalation per table
    functions/              Edge Functions (webhooks only)
  docs/                     everything human-readable (see docs/README.md)
  .github/                  CI, PR template, CODEOWNERS, release workflow
  .changeset/               Changesets for versioning + CHANGELOG
```

### `apps/web` route groups

```
app/
  (marketing)/              /, /pricing, /jobs/[slug]  (public)
  (auth)/                   /login, /register, /forgot, /reset, /invite/[token], /verify
  (onboarding)/             /onboarding (create school / join with code)
  (account)/account/        user-level settings independent of workspace: security, devices,
                            sessions, language/theme, data requests, delete account
  (school)/app/             school workspace shell — bottom nav on phone, sidebar on desktop
     dashboard, attendance, timetable, classes, students, exams, marks, assignments,
     lessons, curriculum, resources, library, reports, print, messages, hiring, cover,
     staff, billing, settings, ai
  (personal)/personal/      personal workspace shell — students, attendance, files, diary,
     cv, applications, requests, settings
  (parent)/family/          parent shell — per-child tabs
  (seller)/sell/            seller area (user-level) — listings, orders, earnings, payouts, kyc
  (market)/market/          marketplace browse/detail/checkout (any signed-in user)
  (platform)/platform/      platform staff console (is_platform_admin only)
  api/                      route handlers: webhooks, file download, pdf, health
```

## 3. Identity and tenancy

- **Auth:** Supabase Auth. `profiles` (1:1 with `auth.users`) holds display data + `is_platform_admin`.
- **Workspaces:** `workspaces(type ∈ school|personal)`. `workspace_members(workspace_id, user_id, role, status)` is the **only** source of membership. Roles: `owner | admin | teacher | staff | parent`.
- **Active workspace selection:** the client sends `x-workspace-id` (header, set from a cookie). The server **never trusts it directly**: `packages/db` resolves `WorkspaceContext = { workspaceId, userId, role, plan }` by querying `workspace_members` for `(workspace_id, auth.uid(), status='active')`. Missing → 403. This context is passed to every repository call and set as a transaction-local setting (`set_config('app.workspace_id', …, true)`) so RLS and triggers can read it.
- **RLS helper functions** (all `SECURITY DEFINER`, `STABLE`, search_path pinned):
  - `app.current_user_id()` → `auth.uid()`
  - `app.is_platform_admin()`
  - `app.member_role(workspace_id)` → role text or null (active members only)
  - `app.has_role(workspace_id, roles text[])`
  - `app.is_guardian_of(student_id)` — for parent reads
- **Policy pattern** for every tenant table (generated from a template, tested by pgTAP):
  ```sql
  create policy sel on t for select using (app.has_role(workspace_id, '{owner,admin,teacher,staff}'));
  create policy ins on t for insert with check (app.has_role(workspace_id, '{owner,admin,teacher}'));
  create policy upd on t for update using (app.has_role(workspace_id, '{owner,admin,teacher}')) with check (app.has_role(workspace_id, '{owner,admin,teacher}'));
  -- tenant re-parenting is prevented by the BEFORE UPDATE trigger app.tg_freeze_workspace(), because a policy
  -- cannot compare OLD and NEW (an earlier self-referential WITH CHECK here was degenerate — see DATA-MODEL.md §11)
  create policy del on t for delete using (app.has_role(workspace_id, '{owner,admin}'));
  ```
  Parent policies are separate and student-scoped. Platform admin has a bypass policy on the tables the console needs (read) and on moderation tables (write).
- **Server data access:** the browser uses the anon key + user JWT **only for reads that RLS already protects and for Realtime subscriptions**. All writes go through Server Actions / Route Handlers using the **user's JWT** (so RLS still applies) — the **service role** is used only in (a) webhooks, (b) cron jobs, (c) explicitly reviewed admin operations, each wrapped in `withServiceRole(reason)` which logs the reason.

## 4. Data conventions

- Every tenant table: `id uuid pk default gen_random_uuid()`, `workspace_id uuid not null references workspaces`, `created_at timestamptz default now()`, `updated_at timestamptz` (trigger), `created_by uuid`, soft delete via `deleted_at` **only** where the feature spec says users expect undo (students, resources, listings); otherwise hard delete with audit.
- Enums are Postgres enums, mirrored in `packages/contracts` (`z.enum`) and checked by a test that compares both.
- Money: `bigint` **paisa** + `currency char(3)` (always `BDT` in v1). Percentages: basis points integer.
- Time: `timestamptz`; dates that are calendar dates (attendance date, exam date) are `date`. "Today" is computed in the workspace timezone (`school_profiles.timezone`, default `Asia/Dhaka`).
- Sequential IDs: `app.next_id(workspace_id, kind)` (advisory lock + `document_counters`, which also serves invoice/receipt numbering).
- Naming: **American English in all identifiers** (tables, columns, enums, TypeScript): `behavior_logs`, `color`, `organization`. British spelling only in user-facing copy (en-GB is the default UI locale for Bangladesh).
- Animation: GSAP (`gsap` + `@gsap/react`) is the only JS animation library; it is lazy-loaded via `packages/ui/src/motion/gsap.ts`, which registers a curated plugin set (no Pixi/Easel/Physics/MorphSVG/ScrollSmoother). Core-app interactions use CSS transitions from the design tokens by default; GSAP is for marketing pages, Flip layout transitions and explicit delight moments, and always respects `prefers-reduced-motion`.
- Audit: `audit_events(id, workspace_id nullable, actor_id, action, table_name, row_id, before, after, correlation_id, created_at)` filled by a generic trigger on every tenant table, plus `app.log_audit_event()` (SECURITY DEFINER) for account- and platform-level events that are not row changes (login, invitation redeemed, support grant). No application role — including `service_role` — has direct INSERT/UPDATE/DELETE grants on the table.
- Platform admin access is **narrow and enumerated** per feature spec (read on console tables, write on moderation/payout tables, time-boxed owner-granted `support_access_grants` for support) — never a blanket bypass, never impersonation.
- Localisation: en/bn via `next-intl`, locale from `user_preferences.language` (cookie-cached), no URL prefix; digits and currency formatting per `docs/engineering/I18N.md`.
- Files: `files` table + Storage buckets `private` (default) and `public` (marketing/avatars only). Signed URLs 5 min, issued by `/api/files/[id]` after a policy check; downloads logged to `file_access_log`.
- Migrations: forward-only SQL in `supabase/migrations`; applied to the cloud project **only by CI on merge to `main`** (and to the `dev` Supabase branch on PRs). Local authoring uses `supabase db diff` against the dev branch.
- Generated types: `pnpm db:types` → `packages/db/src/types.generated.ts` (committed; CI fails if stale).

## 5. Server layer

- **Contracts first:** every action/handler has `input` and `output` Zod schemas in `packages/contracts`. Handlers `parse` input, call domain + repositories, return `Result<T, ApiError>`; never throw raw errors to the client.
- **Policy check second:** `domain/permissions.can(ctx.role, 'attendance.write')` before any repository write, even though RLS would also block. Tests assert both layers.
- **Idempotency:** mutations that can be retried (attendance save, payments, invitations, credit debits) take an `idempotency_key`; the `idempotency_keys` table dedupes.
- **Jobs:** `jobs` table (type, payload, run_at, status, attempts) drained by a Vercel cron route every minute for app-level jobs (emails, PDF renders, risk scoring); pg_cron for pure-SQL jobs (daily credit reset, earnings hold release, trial expiry).
- **Webhooks:** Edge Functions with signature/validation, write an `inbound_events` row first (idempotent by provider event id), then process. Entitlements are granted only from a processed, validated event.
- **Realtime:** Postgres changes on `messages`, `notifications`, `print_jobs` filtered by workspace via RLS on the realtime publication.
- **AI:** `adapters/ai` wraps the Anthropic SDK; every call: `reserveCredits → invoke (structured output, Zod-validated) → settleCredits → aiUsageLog`. Prompts live in `packages/domain/ai/prompts/*.ts` with versions.
- **Payments:** `adapters/payments/PaymentProvider` interface (`createCheckout`, `validate`, `refund`); `SSLCommerzProvider` in v1. Orders: `orders` → `order_lines` → `payments`; state machine in domain.
- **PDF:** `@react-pdf/renderer` in a Node route (`/api/pdf/[kind]`), Bengali font embedded, output stored to `files` and linked to `print_jobs` when requested.
- **Email:** Resend via `adapters/email`, templates in React Email, every send logged to `email_log`.

## 6. Client architecture (phone-first)

- **Breakpoints:** design at 360×800 first; `sm` 640 adds density; `lg` 1024 switches the shell from bottom-nav + sheets to sidebar + panels. Same components, different layout slots.
- **App shell:** `AppShell` renders `TopBar` (workspace switcher, notifications), content, `BottomNav` (≤5 items per role, "More" sheet for the rest) on phone; `Sidebar` on desktop. Nav config is one typed object per workspace type, filtered by role ∧ plan ∧ visibility.
- **Forms:** `react-hook-form` + Zod (same schemas as the server) rendered in `Sheet` (phone) / `Dialog` (desktop) via one `FormSheet` primitive. Optimistic updates with TanStack Query; server actions return the canonical row.
- **Lists:** `DataList` primitive: virtualised, cursor-paginated, server-filtered, with a card layout on phone and a table on desktop. **No client-side filtering of whole tables.**
- **Offline:** PWA (service worker via `@serwist/next`): app shell cached; attendance save queues in IndexedDB and replays with idempotency keys (wrapper phase makes this default-on for Android).
- **Accessibility:** 44 px targets, focus rings, semantic landmarks, `aria-live` for toasts, colour contrast ≥ 4.5:1, tested by `@axe-core/playwright` in e2e.
- **State:** server state via TanStack Query (keys scoped by workspace); UI state local; no global stores.
- **Design system:** `packages/ui` — tokens from `docs/architecture/DESIGN-SYSTEM.md`; components copied from the shadcn registry (`F:\shadcn-ui\apps\v4\registry\new-york-v4`) and extended; no ad-hoc colours or spacing in feature code.

## 7. Native wrappers (after web Release 1)

- **Android (Capacitor 6):** shell loads the production URL (`server.url`) with a native splash; plugins: Push (FCM), Camera (QR scan), Filesystem/Share (downloads), App (deep links `acadigma://`). Auth session persists in the WebView. Play Store listing from `apps/android`.
- **Windows (Tauri 2):** shell loads the production URL; Rust sidecar **print agent** polls `print_jobs` for the signed-in school's queue and prints to local printers via the OS spooler; `printers` table receives real status from the agent. MSIX/NSIS installer via `tauri build`.
- Both share deep-link + push registration tables (`device_registrations`).

## 8. Environments and deployment

| Env        | Web                         | Database                                                   | Purpose                |
| ---------- | --------------------------- | ---------------------------------------------------------- | ---------------------- |
| local      | `pnpm dev` (localhost:3000) | Supabase **dev branch** (cloud; no Docker on this PC)      | day-to-day development |
| preview    | Vercel preview per PR       | Supabase dev branch (migrations from the PR applied by CI) | review + e2e           |
| production | Vercel `main`               | `acadigma-suite` main branch                               | live                   |

Secrets: `.env.local` (never committed), Vercel project env, GitHub Actions secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, provider keys). The browser only ever receives `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## 9. Quality gates (enforced by CI — see HANDBOOK)

typecheck · lint · unit (Vitest, ≥ 80 % on `packages/domain`, ≥ 70 % overall) · DB tests (pgTAP RLS isolation + escalation for every tenant table) · contract/enum parity test · Playwright e2e (360×800 and 1280×800, axe) with HTML report artifact · `pnpm audit` + gitleaks + Semgrep · migration dry-run · stale generated types check · Lighthouse PWA ≥ 90 on the app shell.

## 10. Observability

Structured JSON logs (pino) with `correlation_id`, `workspace_id`, `user_id` (never PII beyond ids); Vercel logs + Sentry for errors (PII scrubbing on); Supabase advisors run in CI weekly; `/api/health` checks DB + storage + auth; uptime monitor on it. Audit events retained indefinitely; `email_log`/`file_access_log` 1 year.

## 11. Threat model summary (details in SECURITY.md)

Cross-tenant read/write (RLS + context resolution + pgTAP) · privilege escalation via membership self-edit (role/status changes only via server actions with policy; RLS forbids self-update of role) · private file exposure (signed URLs, access log) · payment tampering (server-computed amounts, IPN validation, idempotent entitlements) · AI abuse (credits, rate limits per user/workspace) · account takeover (Supabase Auth, email verification, password policy, session refresh, device list) · injection/XSS (Zod on every input, React escaping, CSP, no raw HTML rendering) · supply chain (lockfile, audit, Dependabot, pinned actions).
