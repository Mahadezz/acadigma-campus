# Acadigma Campus — Tooling & References

> Tooling scout output. Stack is fixed: Next.js 15 App Router + TypeScript on Vercel · Supabase (Postgres RLS, Auth, Storage signed URLs, Edge Functions, Realtime, pg_cron) · Tailwind + shadcn/ui (local registry `F:\shadcn-ui\apps\v4\registry\new-york-v4`) · pnpm monorepo · Vitest + Playwright · Changesets · GitHub Actions. Later: Android via Capacitor, Windows via Tauri 2.
>
> Compiled 2026-09-17. All versions verified via `npm view <pkg> version` and repo stats via `gh api`.

---

## 1. Installed skills

All skills installed under `C:\Users\Mahadi Sir\.claude\skills\` (user-global; nothing installed into the project). Marketplace/community skills were read before adoption; risky-command scan (curl|wget|eval|base64 -d|npm publish|rm -rf|secrets) came back clean on all copied ones.

### Officially recommended (installed via `npx skills add`)

| Skill                              | Source                                                                     | What for                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase`                         | `supabase/agent-skills` (official; `npx skills add supabase/agent-skills`) | ANY Supabase task — Auth/SSR (`@supabase/ssr`), RLS, migrations, declarative schema, Edge Functions, Realtime, Storage, pg_cron/pgmq, Logs. Load before writing Supabase code. |
| `supabase-postgres-best-practices` | `supabase/agent-skills` (official)                                         | Postgres schema/type choices, RLS policy + pgTAP tests, indexes, triggers, functions, pgvector, EXPLAIN/perf. Load before any DB change.                                       |
| `vercel-react-best-practices`      | `vercel-labs/agent-skills` (Socket: 0 alerts, Snyk: Low)                   | React 19 / Next.js performance: RSC boundaries, data fetching, bundle optimization.                                                                                            |
| `web-design-guidelines`            | `vercel-labs/agent-skills` (0 alerts, Low)                                 | Audit UI code against Web Interface Guidelines (a11y, UX).                                                                                                                     |
| `writing-guidelines`               | `vercel-labs/agent-skills` (0 alerts, Med)                                 | Review docs/prose for voice/tone/style — for `/docs`.                                                                                                                          |

### Vetted local library skills (copied from `F:\agent-library\skills`, ECC origin)

| Skill                    | What for                                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres-patterns`      | PostgreSQL query optimization, schema, indexing, RLS. Supabase-based.                                                                                           |
| `database-migrations`    | Schema/data migrations, rollbacks, zero-downtime (Prisma/Drizzle/Kysely/…).                                                                                     |
| `e2e-testing`            | Playwright POM, config, CI artifacts, flaky-test strategy.                                                                                                      |
| `ci-cd-and-automation`   | CI/CD pipelines, quality gates, test runners, deployment strategies.                                                                                            |
| `deployment-patterns`    | Deploy workflows, health checks, rollback, prod-readiness checklists.                                                                                           |
| `react-patterns`         | React 18/19 hooks, server/client boundaries, Suspense, form actions, a11y.                                                                                      |
| `nextjs-turbopack`       | Next.js 16+/Turbopack bundling & dev-speed guidance.                                                                                                            |
| `api-design`             | REST resource naming, status codes, pagination, versioning, rate limiting.                                                                                      |
| `security-and-hardening` | Input validation, authn/z, data storage, GDPR/CCPA.                                                                                                             |
| `appsec-review`          | Security checklist for authn, user input, secrets, API endpoints, payments (renamed from `security-review` to avoid the built-in `/security-review` collision). |
| `documentation-and-adrs` | ADRs + docs for architecture decisions and public APIs.                                                                                                         |

### Offensive-security skills — AUTHORIZED TESTING ONLY (our own preview deployments)

Copied from `F:\Claude-Red` (SnailSploit/claude-red, MIT, 5.7k★). Each was re-wrapped with a frontmatter guard: `AUTHORIZED TESTING ONLY (Acadigma Campus preview envs we own)`. Only the checklist skills relevant to testing our own web app/API were installed — AD/cloud/mobile/wireless/exploit-dev categories were **not** installed.

| Skill                      | Test surface for Acadigma                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `offensive-idor`           | Tenant-isolation / cross-school object access, GUID predictability, API IDOR — the #1 multi-tenant risk.           |
| `offensive-business-logic` | Credit-ledger abuse, marketplace payout logic, cover-teacher engine, report-card workflow.                         |
| `offensive-race-condition` | Double-spend of AI credits, duplicate marketplace purchases, concurrent enrollment.                                |
| `offensive-file-upload`    | Resources library + marketplace digital-file uploads (SVG/HTML stored XSS, MIME/extension bypass, path traversal). |
| `offensive-ssrf`           | Edge Functions / PDF generation fetching remote URLs; cloud metadata reach.                                        |
| `offensive-xss`            | Stored XSS in messaging, lesson plans, school profiles; CSP bypass.                                                |
| `offensive-jwt`            | Supabase JWT/`auth.jwt()` custom-claims tampering, alg confusion, session testing.                                 |
| `offensive-api-security`   | Broad API authz/authn checklist for our route handlers + Edge Functions.                                           |

**How to run against a preview deploy (security test plan):** create a throwaway Supabase branch + Vercel preview → seed ≥2 tenant schools, each with teacher/parent/student users → capture each role's JWT → drive the checklists (IDOR/business-logic/race first — highest multi-tenant impact) against the preview URL only, never production → confirm RLS denies cross-tenant reads at the DB layer, not just the UI. Pair with pgTAP RLS tests (§4) so isolation is proven in CI too.

### gstack (garrytan/gstack — 133k★, MIT)

Cloned to `~/.claude/skills/gstack` and `./setup` run. Installs as a **skill router** (`gstack` skill now available); subcommands are invoked as `Load gstack. Run /<command>`. Note: full feature set wants Bun v1.0+ (not currently installed on this machine) and, for `/cso`, a native toolchain + Docker — browser skills and `/cso` degrade gracefully without them.

Commands it adds and fit for our workflow:

| gstack command                                                                              | Fit                                                                                                        |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/office-hours`, `/autoplan`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review` | Feature planning before building modules — **high fit** for the phased rebuild.                            |
| `/review`                                                                                   | Rigorous branch code review — **high fit**, complements ECC reviewers.                                     |
| `/cso`                                                                                      | OWASP + STRIDE security audit — **high fit** for a multi-tenant payments app (needs Bun+native toolchain). |
| `/qa`, `/qa-only`, `/design-review`                                                         | Browser QA of a staging/preview URL — **medium fit** (overlaps Playwright + `playwright-skill`).           |
| `/ship`, `/land-and-deploy`, `/canary`                                                      | PR + deploy automation — **medium fit** (we standardize on Changesets + GH Actions; use selectively).      |
| `/make-pdf`, `/diagram`, `/document-release`, `/document-generate`                          | Docs/diagrams — **medium fit**.                                                                            |
| `/browse`, `/scrape`, `/investigate`, `/retro`, `/careful`, `/freeze`, `/guard`             | Utility — **low/optional fit**.                                                                            |

**Recommendation:** adopt `/office-hours`→`/autoplan`, `/review`, and `/cso` into the workflow; keep deploy/QA on our own GH Actions + Playwright to avoid tool sprawl.

---

## 2. Reference repositories by topic

Stars / last-commit / license verified 2026-09-17 via `gh api`.

### Multi-tenant Supabase + Next.js (workspace/membership RLS)

| Repo                                                                                                      | ★       | Last commit | License       | Borrow vs avoid                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ------- | ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [usebasejump/basejump](https://github.com/usebasejump/basejump)                                           | 940     | 2026-08-06  | MIT           | **Borrow:** the canonical `has_role_on_account()` `SECURITY DEFINER` helper + account/account_user/invitations RLS shape — near-perfect for school↔member. **Avoid:** its Stripe billing tables (we use SSLCommerz).                                            |
| [vercel/next-forge](https://github.com/vercel/next-forge)                                                 | 7,669   | 2026-05-28  | MIT           | **Borrow:** production Turborepo/pnpm monorepo layout, tooling wiring (Changesets, testing, env). **Avoid:** its auth/DB vendor choices (Clerk/Prisma) — not our stack.                                                                                         |
| [nextjs/saas-starter](https://github.com/nextjs/saas-starter) (leerob)                                    | 16,131  | 2025-12-11  | MIT           | **Borrow:** App Router + server-actions + RBAC middleware patterns. **Avoid:** Drizzle+Postgres-direct (no RLS); we use Supabase RLS.                                                                                                                           |
| [supabase-community/supabase-custom-claims](https://github.com/supabase-community/supabase-custom-claims) | 677     | 2026-05-12  | (none stated) | **Borrow:** `auth.jwt()` custom-claims pattern for putting `school_id`/role into the JWT to cut RLS subquery cost. **Avoid:** treat as reference; no explicit OSS license — reimplement, don't copy verbatim.                                                   |
| [supabase/supabase](https://github.com/supabase/supabase)                                                 | 109,670 | 2026-09-16  | Apache-2.0    | **Borrow:** `apps/ui-library/registry/default/blocks` — official Supabase auth + Realtime blocks (`password-based-auth-nextjs`, `social-auth-nextjs`, `realtime-chat`, `realtime-cursor`, `dropzone`). **Avoid:** cloning the monorepo; pull individual blocks. |

### RLS testing (pgTAP)

| Repo                                                                                                            | ★   | Last commit | License | Borrow vs avoid                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | --- | ----------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [usebasejump/supabase-test-helpers](https://github.com/usebasejump/supabase-test-helpers)                       | 131 | 2024-05-15  | MIT     | **Borrow:** `tests.create_supabase_user()`, `tests.authenticate_as()`, `tests.rls_enabled()` helpers to run pgTAP as a given user → the way to prove tenant isolation. **Avoid:** unmaintained since 2024 — vendor the SQL, pin it. |
| [supabase-community/mock_supabase_http_client](https://github.com/supabase-community/mock_supabase_http_client) | 15  | 2026-09-09  | MIT     | **Borrow:** mocking Supabase HTTP in unit tests. **Avoid:** not a substitute for real pgTAP RLS tests.                                                                                                                              |

Run with `supabase test db` (pgTAP) in CI on every migration.

### SSLCommerz (BDT payments)

| Repo                                                                            | ★   | Last commit | License   | Borrow vs avoid                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------- | --- | ----------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [sslcommerz/SSLCommerz-NodeJS](https://github.com/sslcommerz/SSLCommerz-NodeJS) | 121 | 2025-08-18  | ISC (npm) | **Borrow:** the official `sslcommerz-lts` package — `init()` (hosted checkout), `validate({val_id})` (IPN validation), `transactionQueryBySessionId`. **Avoid:** its `store_passwd` is sent in query strings — only ever call `validate`/query server-side (Edge Function / route handler), never client. |
| [hasinhayder/tutor-sslcommerz](https://github.com/hasinhayder/tutor-sslcommerz) | 108 | 2025-12-28  | (none)    | **Borrow:** end-to-end init→redirect→IPN→success/fail/cancel flow as a worked reference. **Avoid:** PHP/WordPress specifics — translate the flow only.                                                                                                                                                    |

### PDF generation in Next.js (report cards / invoices, Bengali fonts)

| Repo                                                          | ★      | Last commit | License | Borrow vs avoid                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------ | ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [diegomura/react-pdf](https://github.com/diegomura/react-pdf) | 16,790 | 2026-09-11  | MIT     | **Borrow:** `@react-pdf/renderer` `renderToStream/renderToBuffer` in a route handler; `Font.register()` for **Noto Sans Bengali / SolaimanLipi** embedding. **Avoid:** complex CSS grid — its fl-box subset is limited; keep report-card layout simple. |
| [Sparticuz/chromium](https://github.com/Sparticuz/chromium)   | 1,646  | 2026-09-11  | MIT     | **Borrow:** `@sparticuz/chromium` + `puppeteer-core` when a design needs full HTML/CSS fidelity (print-queue). **Avoid:** heavy cold starts on Vercel — prefer `@react-pdf/renderer` unless pixel-perfect HTML is required.                             |

Bengali fonts: register the TTF once and set it as the default family; test conjuncts/matras render (many PDF libs drop Bengali ligatures without the right shaping — validate early).

### Capacitor + Next.js / Tauri 2 + Next.js

| Repo                                                                              | ★      | Last commit | License | Borrow vs avoid                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ------ | ----------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ionic-team/capacitor](https://github.com/ionic-team/capacitor)                   | 16,687 | 2026-09-16  | MIT     | **Borrow:** wrap a **static export** (`output: 'export'`) of the phone-first web app; use `@capacitor/push-notifications` + `@capacitor/filesystem` for downloads. **Avoid:** pointing Capacitor at a remote Vercel URL for the shell — ship the export for offline/app-store review; call APIs remotely. |
| [kvnxiao/tauri-nextjs-template](https://github.com/kvnxiao/tauri-nextjs-template) | 694    | 2026-09-12  | MIT     | **Borrow:** Tauri 2 + Next.js 16 App Router **static export** template, pnpm, GH Actions for TS+Rust. **Avoid:** its note itself says Next.js is overkill for Tauri — keep the Tauri shell thin; no SSR inside the desktop bundle.                                                                        |

Both wrappers load a **static export**, not a remote URL — dynamic data comes from Supabase/route handlers over the network.

### shadcn/ui dashboard blocks + mobile-first nav; Aceternity/Magic UI

| Repo                                                                                                | ★       | Last commit | License | Borrow vs avoid                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ------- | ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui)                                                     | 124,039 | 2026-09-16  | MIT     | **Borrow:** dashboard blocks, `Sheet` (mobile drawers), `Drawer`. We already have the local `new-york-v4` registry — align to it.                                               |
| [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)                                   | 14,222  | 2026-09-10  | MIT     | **Borrow:** full admin layout — sidebar/topbar, tables, command palette — for the platform-staff console. **Avoid:** it's Vite/React-Router; port layout patterns, not routing. |
| [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | 7,010   | 2026-09-11  | MIT     | **Borrow:** **Next.js App Router** dashboard starter — the closest to our stack; parallel routes, data tables, forms. **Avoid:** Clerk auth — swap for Supabase.                |
| [magicuidesign/magicui](https://github.com/magicuidesign/magicui)                                   | 22,308  | 2026-09-13  | MIT     | **Borrow:** a few marketing/landing accents (sparingly). **Avoid:** animation-heavy components inside the app shell — phone-first perf budget.                                  |

Mobile bottom-nav: build from shadcn primitives (fixed bottom bar + `Sheet` for overflow) — no dedicated dependency needed. Aceternity UI has no canonical single OSS repo; copy individual components under MIT if used, sparingly.

### Open-source school-management systems (domain model reference only)

| Repo                                                                                              | ★     | Last commit | License     | Borrow for domain                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ----- | ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| [frappe/education](https://github.com/frappe/education)                                           | 636   | 2026-09-16  | GPL-3.0-ish | Program/Course/Enrollment, Assessment Plan + Grading Scale + GPA, Fee Structure/Schedule. Cleanest modern academics model. |
| [GibbonEdu/core](https://github.com/GibbonEdu/core)                                               | 632   | 2026-09-15  | GPL-3.0     | Timetable (period/space/roll-group), attendance, markbook. Mature, real-school-tested.                                     |
| [OS4ED/openSIS-Classic](https://github.com/OS4ED/openSIS-Classic)                                 | 339   | 2026-06-08  | (none)      | Section/subject/marking-period, report-card + grade-scale schema.                                                          |
| [hrshadhin/school-management-system](https://github.com/hrshadhin/school-management-system)       | 1,143 | 2026-09-16  | —           | Straightforward student/teacher/class/exam/fee tables — quick schema reference.                                            |
| [Yogndrr/MERN-School-Management-System](https://github.com/Yogndrr/MERN-School-Management-System) | 646   | 2026-09-16  | —           | JS/TS-native attendance + marks + complaint/notice models.                                                                 |

> All GPL — **model reference only**, do not copy code into our (proprietary) codebase. Borrow the _shape_ of entities, not the SQL.

### Realtime chat, fan-out, pg_cron, audit triggers

| Repo                                                                         | ★              | Last commit | License                   | Borrow vs avoid                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | -------------- | ----------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [supabase/supa_audit](https://github.com/supabase/supa_audit)                | 672            | 2024-01-03  | Apache-2.0 (**archived**) | **Borrow:** the `audit.record_version` table + `audit.enable_tracking(regclass)` trigger pattern (captures old/new jsonb, `auth.uid()`, `auth.role()`). **Avoid:** installing as a live extension — it's archived; vendor the SQL into a migration and maintain it. |
| supabase/supabase `blocks/realtime-chat`, `realtime-cursor`, `realtime-flow` | (in 109k repo) | 2026-09-16  | Apache-2.0                | **Borrow:** official Realtime chat/presence blocks for messaging. **Avoid:** re-inventing broadcast/presence.                                                                                                                                                       |

Notification fan-out: DB trigger → `pg_notify` / insert into a `notifications` table → Realtime broadcast; heavy fan-out via `pgmq` queue drained by an Edge Function on `pg_cron`. pg_cron jobs: cover-teacher engine, credit-ledger rollups, print-queue sweeps.

### Anthropic Claude TypeScript SDK (lesson-plan generation)

| Repo                                                                                          | ★      | Last commit | License | Borrow vs avoid                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------ | ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [anthropics/anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript) | 2,116  | 2026-09-15  | MIT     | **Borrow:** `@anthropic-ai/sdk` `messages.create` with **tool use for structured output** (define a `lesson_plan` tool schema, force `tool_choice`, parse `input`). Call only from an Edge Function/route handler behind the credit ledger. **Avoid:** free-text JSON parsing — use tool-use/JSON schema for reliability. |
| [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks)                 | 52,748 | 2026-09-16  | MIT     | **Borrow:** structured-output & tool-use recipes. **Avoid:** Python-first examples — translate to TS.                                                                                                                                                                                                                     |

### Changesets + GH Actions (pnpm monorepo), Playwright/Vitest reporting

| Repo                                                              | ★      | Last commit | License | Borrow vs avoid                                                                                   |
| ----------------------------------------------------------------- | ------ | ----------- | ------- | ------------------------------------------------------------------------------------------------- |
| [changesets/changesets](https://github.com/changesets/changesets) | 12,399 | 2026-09-16  | MIT     | **Borrow:** `@changesets/cli` versioning for the monorepo.                                        |
| [changesets/action](https://github.com/changesets/action)         | 1,069  | 2026-09-07  | MIT     | **Borrow:** the release GH Action ("Version PR" + publish) — standard pnpm-monorepo release flow. |

Playwright HTML report → upload as PR artifact via `actions/upload-artifact` (the `e2e-testing` skill has the config). Vitest coverage → `@vitest/coverage-v8` with the `json-summary`+`text` reporters piped into `$GITHUB_STEP_SUMMARY`.

### ECC harness (F:\ECC — affaan-m/ECC, 260k★, MIT)

Read `RULES.md`, `AGENTS.md`, `agents/` (68 agents), `commands/` (94), `hooks/`, `contexts/`, `config/`.

**Adopt into this repo's `.claude/` (copy agent .md files into `.claude/agents/`):**

| ECC agent                      | Why for Acadigma                                                     |
| ------------------------------ | -------------------------------------------------------------------- |
| `database-reviewer` (sonnet)   | PostgreSQL/Supabase schema+RLS review — MUST-USE on every migration. |
| `security-reviewer` (sonnet)   | OWASP/secrets/SSRF/injection — payments + multi-tenant.              |
| `typescript-reviewer` (sonnet) | Type safety, async correctness on all TS changes.                    |
| `react-reviewer` (sonnet)      | RSC/client boundaries, hooks, a11y on `.tsx` changes.                |
| `pr-test-analyzer` (sonnet)    | Behavioral test-coverage review before merge.                        |
| `doc-updater` (haiku)          | Keeps codemaps/docs in sync.                                         |

**Commands worth copying to `.claude/commands/`:** `/code-review`, `/build-fix`, `/feature-dev`, `/checkpoint`, `/plan-prd`, `/plan-canvas`, the `/orch-*` orchestration set, and `/harness-audit`.

**Rules to adopt:** ECC `RULES.md` "Must Always / Must Never" (delegate to specialist agents; tests before implementation; never emit secrets/absolute paths; conventional commits) — fold into this repo's `CLAUDE.md`. `contexts/{dev,research,review}.md` are good context presets.

**Hooks worth wiring** (via ECC installer `bash ./install.sh --target claude --modules hooks-runtime` — **do NOT** hand-paste `hooks/hooks.json`, it's plugin-oriented and path-rewrites on install):

- `PreToolUse:Bash` quality/push/GateGuard dispatcher (blocks bad bash).
- `PreToolUse:Write` doc-file-warning (warns on stray docs — aligns with "no stray .md").
- `PreToolUse:Edit|Write` suggest-compact (context hygiene).
- Optional `governance-capture` (secrets/policy events; enable with `ECC_GOVERNANCE_CAPTURE=1`).

> Wiring hooks touches `~/.claude` settings, out of scope for this doc write — flagged for the owner to run the ECC installer deliberately.

---

## 3. Specific code patterns to adopt

### 3.1 RLS membership helper (basejump shape) — the core multi-tenant primitive

```sql
-- SECURITY DEFINER so it can read the membership table regardless of the caller's RLS.
-- STABLE + SQL, search_path pinned. Grant to authenticated only.
create or replace function public.has_role_on_school(
  p_school_id uuid,
  p_role text default null
) returns boolean
  language sql
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.school_members m
    where m.user_id = auth.uid()
      and m.school_id = has_role_on_school.p_school_id
      and (m.role = has_role_on_school.p_role or has_role_on_school.p_role is null)
  );
$$;
grant execute on function public.has_role_on_school(uuid, text) to authenticated;

-- Policy usage:
create policy "members read school rows" on public.students
  for select using (public.has_role_on_school(school_id) = true);
```

Ref: basejump `20240414161947_basejump-accounts.sql` L252 (`has_role_on_account`), L278 (`get_accounts_with_role`). For hot paths, put `school_id`/role into the JWT via custom claims (supabase-custom-claims) and read `auth.jwt()->>'school_id'` to skip the subquery.

### 3.2 SSLCommerz init + IPN validation flow (server-side only)

```ts
import SSLCommerzPayment from "sslcommerz-lts"
const ssl = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, /* live */ true)

// 1. Init (route handler / Edge Function) -> returns GatewayPageURL to redirect the buyer.
const initRes = await ssl.init({
  total_amount: amountBDT,
  currency: "BDT",
  tran_id: ourTranId,
  success_url,
  fail_url,
  cancel_url,
  ipn_url /* + product/customer fields */,
})

// 2. IPN endpoint: SSLCommerz POSTs val_id -> we VALIDATE server-side before crediting.
const v = await ssl.validate({ val_id })
if (v.status === "VALID" || v.status === "VALIDATED") {
  // confirm v.tran_id matches our order, v.amount/currency match, mark paid, release payout ledger entry
}
```

Ref: `sslcommerz/SSLCommerz-NodeJS/api/payment-controller.js` — `init()` L19, `validate()` L25 (hits `/validator/api/validationserverAPI.php`). **Never** expose `store_passwd`; validate every IPN independently (don't trust the redirect); check `tran_id` + amount + currency against your own order row to prevent tampering/replay.

### 3.3 Audit trigger (supa_audit shape)

```sql
-- audit.record_version(old_record jsonb, record jsonb, op, ts, table_oid, auth_uid, auth_role...)
-- Attach to any table:
select audit.enable_tracking('public.marks'::regclass);
select audit.enable_tracking('public.credit_ledger'::regclass);
```

Ref: supa_audit `supa_audit--0.3.1.sql` — `record_version` table L28, `insert_update_delete_trigger()` L158, `enable_tracking(regclass)` L224 (auto-adds `auth_uid`/`auth_role` columns). Vendor the SQL into a migration (repo is archived). Track marks, credit_ledger, payouts, hiring decisions.

### 3.4 pgTAP RLS test (basejump test-helpers shape)

```sql
begin;
select plan(2);
select tests.create_supabase_user('teacher_a');
select tests.authenticate_as('teacher_a');
-- teacher from school A cannot see school B's students:
select is_empty($$ select 1 from public.students where school_id = '<school_B>' $$,
                'tenant isolation: teacher A sees no school B students');
select tests.rls_enabled('public', 'students');
select * from finish();
rollback;
```

Ref: usebasejump/supabase-test-helpers — `tests.authenticate_as()`, `tests.rls_enabled()`. Run via `supabase test db` in CI on every migration.

### 3.5 Claude lesson-plan via tool-use (structured output)

Define a `lesson_plan` tool with a JSON-schema `input` (objectives[], activities[], assessment, materials), call `messages.create` with `tool_choice: { type: "tool", name: "lesson_plan" }`, read the typed `tool_use.input`. Gate behind the credit ledger (decrement on success, refund on API error). Ref: anthropics/anthropic-sdk-typescript + claude-cookbooks tool-use recipes.

---

## 4. Things to avoid

- **Don't** copy GPL school-management code (frappe/education, GibbonEdu, openSIS) into the proprietary codebase — domain-model reference only.
- **Don't** install `supa_audit` as a live extension — it's archived (last commit 2024-01); vendor the SQL.
- **Don't** rely on supabase-test-helpers / custom-claims being maintained — pin/vendor them (custom-claims has no stated OSS license → reimplement, don't copy).
- **Don't** call SSLCommerz `validate`/`init` from the client or trust the redirect — `store_passwd` travels in query strings; validate every IPN server-side against your own order.
- **Don't** point Capacitor/Tauri shells at a remote URL — ship a Next.js **static export**; fetch data over the network.
- **Don't** enforce tenant isolation in the UI only — prove it at the DB with RLS + pgTAP; a passing UI is not a passing security test.
- **Don't** hand-paste ECC `hooks/hooks.json` into settings — use the ECC installer so paths rewrite.
- **Don't** over-use Magic UI/Aceternity animations inside the app shell — phone-first perf budget.
- **Don't** parse free-text JSON from Claude — use tool-use/JSON schema.
- **Don't** run the offensive-security skills against anything but our own preview/staging deployments.

---

## 5. Packages to use (versions verified 2026-09-17 via `npm view`)

| Package                        | Version               | Purpose                                                                        |
| ------------------------------ | --------------------- | ------------------------------------------------------------------------------ |
| `next`                         | 15.5.25 (latest 15.x) | App Router framework (stack-pinned to 15).                                     |
| `react`                        | 19.3.0                | React 19.                                                                      |
| `@supabase/supabase-js`        | 2.116.0               | Supabase client.                                                               |
| `@supabase/ssr`                | 0.12.7                | Next.js App Router SSR auth (cookies) — use this, not deprecated auth-helpers. |
| `supabase` (CLI)               | 2.117.0               | Local dev, migrations, `test db` (pgTAP), Edge Functions.                      |
| `tailwindcss`                  | 4.3.3                 | Styling.                                                                       |
| `shadcn` (CLI)                 | 4.21.0                | Component registry CLI (point at local `new-york-v4`).                         |
| `sslcommerz-lts`               | 1.2.0                 | Official SSLCommerz Node SDK (BDT).                                            |
| `@react-pdf/renderer`          | 4.9.0                 | Report cards / invoices (Bengali font embedding).                              |
| `@sparticuz/chromium`          | 153.0.0               | Serverless Chromium for HTML→PDF (print queue, when needed).                   |
| `puppeteer-core`               | 25.11.0               | Drives @sparticuz/chromium.                                                    |
| `@anthropic-ai/sdk`            | 0.126.0               | Claude SDK (lesson plans, tool use).                                           |
| `@playwright/test`             | 1.63.0                | E2E.                                                                           |
| `vitest`                       | 5.0.1                 | Unit tests.                                                                    |
| `@vitest/coverage-v8`          | 5.0.1                 | Coverage (job summaries).                                                      |
| `@changesets/cli`              | 3.0.3                 | Monorepo versioning/release.                                                   |
| `@changesets/changelog-github` | 1.0.1                 | GitHub changelog for changesets.                                               |
| `@capacitor/core`              | 8.5.2                 | Android wrapper (later).                                                       |
| `@capacitor/cli`               | 8.5.2                 | Capacitor CLI.                                                                 |
| `@capacitor/android`           | 8.5.2                 | Android platform.                                                              |
| `@tauri-apps/cli`              | 2.11.4                | Tauri 2 desktop build (later).                                                 |
| `@tauri-apps/api`              | 2.11.1                | Tauri 2 JS API.                                                                |
| `zod`                          | 4.6.5                 | Runtime validation / schema (route inputs, tool schemas).                      |
| `@tanstack/react-query`        | 5.103.1               | Client data caching (optional, alongside RSC).                                 |

> `next` and `react` are shown at latest-in-major to honor the fixed Next.js 15 constraint. All others are latest as of 2026-09-17.
