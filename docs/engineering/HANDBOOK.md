# Acadigma Campus — Engineering Handbook

How we work. Read this before your first commit, and re-read §5 (Definition of Done) before every PR.

Binding documents this handbook implements: `docs/architecture/ARCHITECTURE.md` (the _how_ contract) and `docs/decisions/DECISION-LOG.md` **D-14** (git workflow, CI, releases — owner requirement). Where this file and ARCHITECTURE disagree, ARCHITECTURE wins and this file is the bug.

Related: `docs/engineering/TESTING.md` · `docs/engineering/SECURITY.md` · `docs/engineering/CI.md` · `docs/engineering/RELEASES.md` · `docs/engineering/OBSERVABILITY.md` · `CONTRIBUTING.md` · `CLAUDE.md`.

---

## 1. The five rules that are not negotiable

These come from ARCHITECTURE §3–§5 and from the Base44 security review. Breaking one is a blocking PR review comment, not a discussion.

1. **The database and the server are the security boundary.** UI guards are experience only. Every write passes a `domain/permissions.can()` check _and_ an RLS policy. Tests assert both.
2. **Tenant context is never taken from the client.** The browser sends `x-workspace-id`; `packages/db` resolves it against `workspace_members` for `(workspace_id, auth.uid(), status='active')` and builds `WorkspaceContext`. Missing or inactive → 403. Nothing else may construct a `WorkspaceContext`.
3. **Zod at every boundary.** Server actions, route handlers, webhooks, job payloads and forms all `parse` a schema from `packages/contracts`. No `any`, no unvalidated `request.json()`.
4. **No client-side filtering of tables.** Lists are server-filtered and cursor-paginated through `DataList`. `ParentPortal.jsx:42` in the prototype fetched every student and filtered in React; that class of bug is banned by review.
5. **Migrations are forward-only and applied by CI.** Never `supabase db push` against production from a laptop. Ever.

Two more that cost us money or trust if broken: **money is computed server-side only** (D-06, integer paisa), and **audit rows are written by database triggers**, never by application or client code (D-05).

---

## 2. Branches

`main` is protected and always deployable. There is no `develop`. All work happens on short-lived branches cut from `main`.

### Naming

```
<type>/<area>-<slug>
```

| Type        | Use for                                                           | Example                           |
| ----------- | ----------------------------------------------------------------- | --------------------------------- |
| `feat/`     | new user-visible capability or a part of one                      | `feat/attendance-daily-register`  |
| `fix/`      | defect in shipped behaviour                                       | `fix/billing-invoice-rounding`    |
| `chore/`    | tooling, deps, config, scaffolding                                | `chore/ci-playwright-shards`      |
| `docs/`     | documentation only (no `apps/`, `packages/`, `supabase/` changes) | `docs/security-threat-model`      |
| `refactor/` | behaviour-preserving restructure with tests unchanged             | `refactor/db-repository-generics` |

`<area>` is one of the feature areas in §8 (`auth`, `academics`, `teaching`, `market`, `billing`, `ops`, `platform`) or an infrastructure area (`ci`, `db`, `ui`, `docs`). `<slug>` is 2–4 kebab-case words describing the _part_, not the whole epic.

### Size and lifetime

One branch = **one Part** from the feature spec's §8 (build chunks), which is sized at ≤ ~2 days. A branch that has been open longer than three working days is a planning failure: split it. Rebase on `main` daily (`git pull --rebase origin main`); never merge `main` into a feature branch.

Push the branch on the **first** commit, before the work is finished, and open a **draft PR**. This is the owner's explicit instruction ("whenever you are working on a major feature push the files and create branches so it doesn't break the app") — the point is that work in progress is visible and recoverable, not that it is finished.

Delete the branch on merge (GitHub does this automatically; the setting is on).

---

## 3. Commits

[Conventional Commits](https://www.conventionalcommits.org/) 1.0.0, enforced by `commitlint` on the `commit-msg` hook and re-checked in CI on the PR title.

```
<type>(<scope>): <subject>

<body — why, not what>

<footer — BREAKING CHANGE:, Refs:, Closes:>
```

**Types:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`.
**Scopes:** the package or area — `web`, `domain`, `db`, `contracts`, `ui`, `config`, `supabase`, `ci`, `docs`, or a feature area (`attendance`, `billing`, `market`, …).

Subject: imperative mood, lower case, no trailing period, ≤ 72 chars.

### Examples

```
feat(attendance): save daily register with idempotency key

Attendance saves replay from the offline queue, so the server action now takes
an idempotency_key and dedupes through idempotency_keys. Second identical save
returns the first result instead of a duplicate row.

Refs: F-academics-03 Part 2
```

```
fix(billing): compute commission from platform_settings, not the form value

CommissionEngine took the rate from a client field (Base44 finding 4). The rate
is now read server-side from platform_settings and snapshotted onto order_lines
at purchase time, so a later rate change cannot rewrite history.

Refs: D-15
```

```
feat(db)!: workspace context resolved from workspace_members

BREAKING CHANGE: repositories no longer accept a raw workspaceId string; they
take WorkspaceContext built by resolveWorkspaceContext(). Callers passing a
string will fail to typecheck.
```

```
docs(engineering): add pgTAP escalation template to TESTING.md
```

```
chore(deps): bump @supabase/supabase-js to 2.58.0
```

Commits on a branch are working notes — they are squashed on merge (§4), so the **PR title** is the commit message that survives into `CHANGELOG.md`. Write the PR title with the same care.

`revert:` commits are generated by GitHub's revert button; do not hand-write them.

---

## 4. Pull requests

### Flow

1. Cut branch from up-to-date `main`.
2. First commit → push → **open a draft PR** using `.github/PULL_REQUEST_TEMPLATE.md`. Link the feature spec and the Part number.
3. Work. Push often. CI runs on every push; a red draft PR is fine, a red ready PR is not.
4. When the Definition of Done (§5) is complete, mark **Ready for review** and fill the whole template: DoD checklist ticked, test report link, screenshots at **both** viewports.
5. Request review from `@Mahadezz` (CODEOWNERS makes this automatic).
6. All required checks green (§6 of `docs/engineering/CI.md`) + one approval → **Squash and merge**.
7. Branch auto-deletes. Changesets releases on the next release run (`docs/engineering/RELEASES.md`).

### Merge strategy

**Squash merge only.** Merge commits and rebase merges are disabled in repository settings. One PR = one commit on `main` = one changelog line = one revert unit. The squash commit message is the PR title plus the PR number; the body is the PR description's summary section.

### Review

- `@Mahadezz` is CODEOWNERS for the whole tree and the required approver.
- When Claude opens the PR, Claude does not approve it. A PR authored by an agent still needs a human approval.
- Reviewers check, in this order: does it break a §1 rule → is the DoD honestly complete → is the test report real → is the code understandable in six months.
- A review that only says "LGTM" on a PR touching RLS, money, files or auth is not a review. Say what you checked.

### What blocks a merge

- Any required check red.
- A DoD box ticked without evidence (no test report, no screenshots, no pgTAP file).
- Migration without an accompanying pgTAP isolation + escalation test for every table it creates.
- A behaviour change with no docs change in the same PR (§9).
- New dependency without a line in the PR description saying why, and a `pnpm audit` pass.

---

## 5. Definition of Done

D-14 fixes this list. A feature **Part** is done when every box is true. Not "mostly"; the owner's standard is "one feature at a time, 100 % sure it won't break."

| #   | Gate                                                                                                                                                       | Evidence                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | **Spec** — `docs/features/<area>.md` contains this Part with acceptance criteria                                                                           | Spec section exists and matches what was built; deviations logged as an ADR         |
| 2   | **Migration + pgTAP** — schema change is a forward-only migration; every tenant table it touches has an RLS isolation test _and_ a role-escalation test    | `supabase/migrations/<ts>_*.sql`, `supabase/tests/rls/<table>.sql`, `CI / db` green |
| 3   | **Unit** — domain rules and server actions covered; `packages/domain` ≥ 80 %, repo ≥ 70 %                                                                  | `CI / unit` green, coverage in job summary                                          |
| 4   | **UI both viewports** — built and visually verified at **360×800** and **1280×800**                                                                        | Screenshots in the PR, one per viewport per screen changed                          |
| 5   | **Playwright** — the acceptance criteria exist as a journey, run at both viewports                                                                         | `CI / e2e` green, HTML report artifact attached                                     |
| 6   | **a11y** — `@axe-core/playwright` scan passes with zero serious/critical violations on every new screen; 44 px targets; focus order sane; contrast ≥ 4.5:1 | axe results inside the Playwright report                                            |
| 7   | **Test report** — `docs/test-reports/<feature>-part-<n>.md` from `docs/test-reports/_TEMPLATE.md`, signed off                                              | File committed in this PR, linked from the PR body                                  |
| 8   | **Docs** — feature spec, `DATA-MODEL.md`, `docs/README.md` index and any ADR updated **in this PR**                                                        | Diff includes `docs/`                                                               |
| 9   | **PR merged** — squash-merged to `main` with all required checks green                                                                                     | —                                                                                   |

Additional gates that apply when relevant:

- Touches money → the calculation has a unit test with a fixture table, and the amount is never read from the request body.
- Touches files → signed URL path only, `file_access_log` row written, 5-minute expiry asserted in a test.
- Touches AI → `reserveCredits → invoke → settleCredits` wrapped, and a test that an over-quota workspace is refused _before_ the provider call.
- Touches membership/roles → an explicit pgTAP test that a member cannot change their own `role` or `status` (Base44 finding 2).

---

## 6. Feature flags

New surfaces ship behind a flag so a half-built feature can sit on `main` without being reachable. This is what makes "push early, merge small" safe.

- **Source of truth:** a `feature_flags` table (`key`, `description`, `enabled_globally`, `enabled_for_plans text[]`, `enabled_for_workspaces uuid[]`, `updated_at`), editable from the platform console (D-16). No flag values in env vars — env drift between preview and production is how flags lie to you.
- **Server:** `flags.isEnabled(ctx, 'attendance.offline_queue')` from `packages/domain`, evaluated in a Server Component or action. The flag check happens **after** the permission check, never instead of it. A flag is not a security control — a disabled flag must not be the only thing preventing an unauthorised write.
- **Client:** flag values resolved server-side and passed down as props. No flag-fetching hook; that would leak the roadmap and add a waterfall.
- **Nav:** `packages/ui` nav config filters on `role ∧ plan ∧ flag ∧ visibility`. A flagged-off route also returns 404 from the route segment, so a guessed URL shows nothing.
- **Lifecycle:** a flag is created in the PR that introduces it and **removed in the PR that completes the feature**, with the removal noted in the feature spec. A flag older than one release is a tracked issue. Flags are not configuration.
- **Tests:** e2e runs with the flag on (that is the feature) plus one assertion that the route 404s with the flag off.

---

## 7. Running everything locally (Windows)

The development machine is Windows 10 with **Node 24** and **pnpm 10** (D-12), **no Docker**. That last part is the important one: the local Supabase stack is not used. Local development points at the **Supabase `dev` branch in the cloud** (ARCHITECTURE §8).

### 7.1 Shells

Two shells, and they are not interchangeable.

**PowerShell** — the default. Use it for `pnpm`, `git`, `gh`, and anything you would type by hand.

```powershell
node -v                 # v24.x
corepack enable
corepack prepare pnpm@10 --activate
pnpm -v                 # 10.x
```

PowerShell 5.1 gotchas that will bite you:

- `&&` and `||` do not exist. Use `cmd; if ($?) { cmd2 }`.
- Env var for one command: `$env:FOO = 'bar'; pnpm test` — there is no `FOO=bar pnpm test` prefix form.
- `2>/dev/null` is `2>$null`.
- `Set-Content` defaults to ANSI. Pass `-Encoding utf8` when writing anything another tool reads.

**Git Bash** — use it for `supabase/` shell scripts, `psql`, anything in `scripts/*.sh`, and heredocs. It is POSIX `sh`: forward slashes, `$VAR`, `/dev/null`. Paths with spaces (`F:\Acadigma Suite\…`) must be quoted: `cd "/f/Acadigma Suite/acadigma-campus"`.

Line endings: `.gitattributes` sets `* text=auto eol=lf` and `*.ps1 text eol=crlf`. Run `git config --global core.autocrlf false` once — `true` will rewrite `.sql` and `.sh` files and break pgTAP.

### 7.2 First-time setup

```powershell
git clone https://github.com/Mahadezz/acadigma-campus.git "F:\Acadigma Suite\acadigma-campus"
cd "F:\Acadigma Suite\acadigma-campus"
pnpm install                     # installs the whole workspace; runs husky hooks setup
Copy-Item .env.example apps\web\.env.local
# fill .env.local from the values in §7.5 — ask the owner for the secret ones
pnpm db:types                    # generate packages/db/src/types.generated.ts from the dev branch
pnpm dev                         # http://localhost:3000
```

### 7.3 Supabase CLI

The CLI is a dev dependency, never a global install. Always `pnpm supabase` (it resolves the pinned version from the lockfile, so everyone runs the same binary).

```powershell
pnpm supabase login                       # once; stores SUPABASE_ACCESS_TOKEN in the CLI profile
pnpm supabase link --project-ref bvqzhrvcrxebawjusrxk
pnpm supabase branches list               # the dev branch you point local dev at
```

Day-to-day database work, all against the **dev branch**:

```powershell
pnpm db:diff  -- -f add_attendance_sessions   # authored change -> supabase/migrations/<ts>_add_attendance_sessions.sql
pnpm db:push                                   # apply pending migrations to the dev branch ONLY
pnpm db:types                                  # regenerate typed schema; commit the result
pnpm db:test                                   # run supabase/tests/**.sql (pgTAP) against the dev branch
pnpm db:seed                                   # reset dev data to supabase/seed
```

Hard rules:

- `db:push` targets the dev branch. Production is CI-only (ARCHITECTURE §4, D-14). The npm script refuses to run if `SUPABASE_DB_URL` resolves to the production ref.
- `types.generated.ts` is **committed**. CI fails if it is stale (`CI / contracts`). Regenerate and commit in the same PR as the migration.
- Migrations are forward-only. There is no `down`. To undo, write a new migration (see the rollback playbook in `RELEASES.md`).

### 7.4 Commands

| Command                         | What it does                                                          |
| ------------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                      | Next.js dev server, `apps/web`, port 3000                             |
| `pnpm build`                    | Production build of every package + the app                           |
| `pnpm typecheck`                | `tsc --noEmit` across the workspace                                   |
| `pnpm lint` / `pnpm lint:fix`   | ESLint + Prettier check / fix                                         |
| `pnpm test`                     | Vitest, all packages, watch off                                       |
| `pnpm test:watch`               | Vitest watch on the package you are in                                |
| `pnpm test:cov`                 | Vitest with V8 coverage + JSON report                                 |
| `pnpm test:contracts`           | Postgres enum ↔ Zod enum parity + generated-types freshness           |
| `pnpm db:*`                     | see §7.3                                                              |
| `pnpm e2e`                      | Playwright, both projects (`mobile-360`, `desktop-1280`)              |
| `pnpm e2e:ui`                   | Playwright UI mode for authoring                                      |
| `pnpm e2e:report`               | Open the last HTML report                                             |
| `pnpm changeset`                | Add a changeset for this PR                                           |
| `pnpm audit --audit-level high` | Dependency audit, the same gate CI runs                               |
| `pnpm verify`                   | `typecheck && lint && test && test:contracts` — run before every push |

First Playwright run needs browsers: `pnpm exec playwright install --with-deps chromium`.

### 7.5 Environment variables

`.env.local` lives in `apps/web/` and is git-ignored. `.env.example` is committed and must list every key below with an empty or placeholder value — adding a variable without adding it to `.env.example` breaks everyone else's checkout, and `CI / lint` checks for the mismatch.

| Variable                                               | Where it is set            | Exposed to browser | Purpose                                                                |
| ------------------------------------------------------ | -------------------------- | ------------------ | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                  | local, Vercel, CI          | yes                | Absolute base URL for links, emails, OAuth returns                     |
| `NEXT_PUBLIC_SUPABASE_URL`                             | local, Vercel, CI          | yes                | `https://bvqzhrvcrxebawjusrxk.supabase.co` (dev branch URL locally)    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                 | local, Vercel, CI          | yes                | Anon/publishable key; RLS-protected reads + Realtime only              |
| `SUPABASE_SERVICE_ROLE_KEY`                            | local, Vercel (server), CI | **never**          | Webhooks, cron, reviewed admin ops; only via `withServiceRole(reason)` |
| `SUPABASE_DB_URL`                                      | local, CI                  | no                 | Direct Postgres connection for `db:test` / pgTAP                       |
| `SUPABASE_PROJECT_REF`                                 | local, CI                  | no                 | `bvqzhrvcrxebawjusrxk`                                                 |
| `SUPABASE_ACCESS_TOKEN`                                | CLI profile, GH secret     | no                 | CLI auth for branch + migration operations                             |
| `SUPABASE_DB_PASSWORD`                                 | GH secret                  | no                 | Migration promotion on merge to `main`                                 |
| `ANTHROPIC_API_KEY`                                    | local, Vercel (server)     | **never**          | `adapters/ai`; server only, after credit reservation                   |
| `SSLCOMMERZ_STORE_ID`                                  | local, Vercel (server)     | never              | Payment gateway store id                                               |
| `SSLCOMMERZ_STORE_PASSWORD`                            | local, Vercel (server)     | **never**          | Gateway secret; also validates IPN                                     |
| `SSLCOMMERZ_SANDBOX`                                   | local, Vercel              | no                 | `true` everywhere except production                                    |
| `RESEND_API_KEY`                                       | local, Vercel (server)     | **never**          | Transactional email                                                    |
| `EMAIL_FROM`                                           | local, Vercel              | no                 | e.g. `Acadigma Campus <no-reply@acadigma.app>`                         |
| `CRON_SECRET`                                          | Vercel, CI                 | never              | Shared secret on `/api/cron/*`; requests without it are 401            |
| `NEXT_PUBLIC_SENTRY_DSN`                               | local, Vercel              | yes                | Client error reporting (DSN is public by design)                       |
| `SENTRY_AUTH_TOKEN`                                    | Vercel build, GH secret    | never              | Source map upload                                                      |
| `SENTRY_ORG` / `SENTRY_PROJECT`                        | Vercel, CI                 | no                 | Sentry target                                                          |
| `LOG_LEVEL`                                            | local, Vercel              | no                 | pino level; `debug` locally, `info` in production                      |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | GH secrets                 | no                 | Preview + production deploy control from CI                            |
| `SEMGREP_APP_TOKEN`                                    | GH secret (optional)       | no                 | Semgrep rule sync; scan runs without it                                |

Rules: no secret is ever committed, echoed into a log, or pasted into an issue. gitleaks runs on every PR and on a pre-commit hook. A secret that touched a terminal transcript is rotated — see `docs/engineering/SECURITY.md` §7.

### 7.6 Working against the Supabase dev branch

- One shared dev branch, `dev`, created from production's schema. Everyone's `pnpm dev` and every Vercel preview points at it.
- PR migrations are applied to the dev branch by CI (`CI / db`) so previews run the branch's schema.
- The dev branch is **resettable**: if it drifts or a bad migration lands, `pnpm supabase branches reset dev` then re-apply from `supabase/migrations` and `pnpm db:seed`. Nothing of value lives there.
- It holds **no real data**. Never copy production rows into it — the seed generates a synthetic school, and the prototype's data is untrusted anyway (security review, "What this means for the rewrite").

---

## 8. Code conventions

### TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`. Set once in `packages/config/tsconfig.base.json`; packages extend it and do not relax it.
- `any` is banned by lint. `unknown` + a Zod parse is the escape hatch. A genuinely necessary `any` needs `// eslint-disable-next-line` _with a reason on the same line_.
- No non-null `!` on values that came from I/O. Parse, then use.
- Type-only imports use `import type`. Barrel files only at package roots.
- Errors are values: server code returns `Result<T, ApiError>`; `ApiError` is a discriminated union defined in `packages/contracts`. Raw errors never reach the client (ARCHITECTURE §5).

### Zod at the boundaries

Every schema lives in `packages/contracts` and is the **single** definition shared by the form, the action, the job and the test.

```ts
// packages/contracts/src/attendance.ts
export const saveAttendanceInput = z.object({
  sessionId: z.uuid(),
  date: z.iso.date(),
  entries: z
    .array(
      z.object({
        studentId: z.uuid(),
        status: attendanceStatus, // mirrors the Postgres enum
        note: z.string().max(280).optional(),
      })
    )
    .min(1)
    .max(200),
  idempotencyKey: z.uuid(),
})
export type SaveAttendanceInput = z.infer<typeof saveAttendanceInput>
```

The form uses it through `zodResolver`; the action parses the same object; the pgTAP enum parity test asserts `attendanceStatus.options` equals the Postgres enum's labels.

### Server actions — the pattern

Every action has the same five steps in the same order. Deviating is a review comment.

```ts
"use server"
export async function saveAttendance(
  raw: unknown
): Promise<Result<AttendanceSaved, ApiError>> {
  // 1. Parse — never trust the argument, even from our own form.
  const parsed = saveAttendanceInput.safeParse(raw)
  if (!parsed.success) return err("VALIDATION", parsed.error.flatten())

  // 2. Context — resolved from workspace_members, not from the request body.
  const ctx = await resolveWorkspaceContext() // throws 403 if not an active member
  if (!ctx) return err("FORBIDDEN")

  // 3. Policy — explicit, before any write, even though RLS would also block.
  if (!can(ctx.role, "attendance.write")) return err("FORBIDDEN")

  // 4. Domain + repository — pure rules first, then I/O through a repository
  //    that takes ctx. Idempotent mutations dedupe on idempotencyKey.
  const plan = computeAttendanceWrite(parsed.data, ctx)
  const row = await attendanceRepo.save(ctx, plan, parsed.data.idempotencyKey)

  // 5. Revalidate + return the canonical row.
  revalidateTag(`attendance:${ctx.workspaceId}:${parsed.data.date}`)
  return ok(row)
}
```

Route handlers follow the same shape. Webhooks add "write `inbound_events` first, dedupe on the provider event id, then process" (ARCHITECTURE §5).

### Repositories

- All database access is in `packages/db/src/repositories/<module>.ts`. Feature code never imports a Supabase client.
- Every repository method's first parameter is `ctx: WorkspaceContext`. There is no overload without it.
- The repository sets `app.workspace_id` transaction-locally before querying, so RLS and audit triggers see it.
- Repositories return domain types from `packages/contracts`, not raw row shapes.
- Service-role access exists only inside `withServiceRole(reason, fn)`, which logs `reason` and is allowed only in webhooks, cron and reviewed admin operations. Its use in a PR must be called out in the description.

### Lists and queries

Cursor pagination (keyset on `(created_at, id)`), server-side filters and sorts, `select()` naming explicit columns — never `select('*')` on a table with private columns. No `.filter()` over a full table in React. If a screen needs a filter, the filter is a query parameter that reaches Postgres.

### React / UI

- Server Components by default; `'use client'` only for interactivity, and as deep in the tree as possible.
- Forms: `react-hook-form` + the shared Zod schema inside `FormSheet` (sheet on phone, dialog on desktop).
- Server state through TanStack Query with keys scoped by workspace: `['attendance', workspaceId, date]`. UI state is local. No global store.
- Design tokens and components from `packages/ui` only. No ad-hoc hex colours, no arbitrary Tailwind spacing values in feature code.
- Phone first: build at 360×800, then let `lg` switch the shell. 44 px minimum touch targets.

### Naming

| Thing              | Convention                                          | Example                                           |
| ------------------ | --------------------------------------------------- | ------------------------------------------------- |
| Files (TS modules) | kebab-case                                          | `attendance-repository.ts`                        |
| React components   | PascalCase file + export                            | `AttendanceSheet.tsx`                             |
| Hooks              | `use` prefix, camelCase                             | `useAttendanceDraft.ts`                           |
| Zod schemas        | camelCase `<verb><Noun>Input` / `Output`            | `saveAttendanceInput`                             |
| Inferred types     | PascalCase, same stem                               | `SaveAttendanceInput`                             |
| Server actions     | verb-first camelCase                                | `saveAttendance`, `inviteMember`                  |
| Permission keys    | `<area>.<action>`                                   | `attendance.write`, `market.listing.publish`      |
| Postgres tables    | plural snake_case                                   | `attendance_sessions`                             |
| Postgres columns   | snake_case; booleans `is_`/`has_`                   | `is_platform_admin`                               |
| Postgres enums     | singular snake_case; labels lower snake             | `attendance_status` → `present`, `absent`, `late` |
| RLS policies       | `<op>_<table>_<audience>`                           | `sel_students_staff`, `sel_students_parent`       |
| Migrations         | `<timestamp>_<verb>_<subject>.sql`                  | `20260918T0912_add_attendance_sessions.sql`       |
| pgTAP tests        | `supabase/tests/rls/<table>.sql`                    | `supabase/tests/rls/students.sql`                 |
| Feature specs      | `docs/features/<area>.md`, features `F-<area>-<nn>` | `F-academics-03`                                  |
| Test reports       | `docs/test-reports/<feature>-part-<n>.md`           | `docs/test-reports/F-academics-03-part-2.md`      |
| Flags              | `<area>.<snake_slug>`                               | `attendance.offline_queue`                        |
| Branches           | §2                                                  | `feat/academics-daily-register`                   |

### Comments

Comment the _why_. A comment that restates the code is deleted in review. Anything that exists because of a security finding gets a one-line reference (`// Base44 finding 2: role changes never come from the client`), because that is the comment nobody will dare delete without thinking.

---

## 9. Folder ownership map

`@Mahadezz` owns everything (see `.github/CODEOWNERS`). This map is about _which document governs a folder_ — what you must read before changing it and what you must update after.

| Path                                  | Governed by                                                                                                 | Change requires                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `apps/web/app/(marketing)`            | `docs/product/PRODUCT-DECISIONS.md`                                                                         | Copy review; Lighthouse ≥ 90                       |
| `apps/web/app/(auth)`, `(onboarding)` | ARCHITECTURE §3, `docs/features/01-identity/` (F-ID-01, F-ID-04, F-ID-05)                                   | pgTAP membership tests; SECURITY §2 auth surface   |
| `apps/web/app/(school)/app/*`         | the matching feature spec in `docs/features/`                                                               | Full DoD; both viewports                           |
| `apps/web/app/(personal)`, `(parent)` | `docs/features/01-identity/F-ID-06-personal-workspace.md`, `02-academics/F-AC-02-students-and-admission.md` | Parent policies tested separately in pgTAP         |
| `apps/web/app/(seller)`, `(market)`   | `docs/features/04-commerce/` (F-CM-01…F-CM-05), D-06/D-15/D-17                                              | Money path review; server-computed amounts         |
| `apps/web/app/(platform)`             | D-16                                                                                                        | `is_platform_admin` bypass policy test             |
| `apps/web/app/api/**`                 | ARCHITECTURE §5                                                                                             | Zod schemas; rate limit; webhook signature test    |
| `packages/contracts`                  | ARCHITECTURE §4–§5                                                                                          | Enum parity test; downstream typecheck             |
| `packages/domain`                     | feature spec §5                                                                                             | ≥ 80 % coverage; no I/O imports (lint-enforced)    |
| `packages/db`                         | ARCHITECTURE §3–§4                                                                                          | `ctx` first param; regenerate types                |
| `packages/ui`                         | `docs/architecture/DESIGN-SYSTEM.md`                                                                        | a11y check; both viewports; no feature logic       |
| `packages/config`                     | this handbook §8                                                                                            | Workspace-wide typecheck + lint must stay green    |
| `supabase/migrations`                 | ARCHITECTURE §4                                                                                             | Forward-only; pgTAP per table; CI applies it       |
| `supabase/tests`                      | `docs/engineering/TESTING.md` §3                                                                            | Isolation **and** escalation case per tenant table |
| `supabase/functions`                  | ARCHITECTURE §5 (webhooks)                                                                                  | Signature validation; `inbound_events` idempotency |
| `.github/workflows`                   | `docs/engineering/CI.md`                                                                                    | Pinned action SHAs; required check names unchanged |
| `docs/**`                             | `docs/README.md`                                                                                            | Index updated in the same PR                       |
| `.changeset`                          | `docs/engineering/RELEASES.md`                                                                              | One changeset per user-visible change              |

`apps/android` and `apps/windows` are created in the wrapper phase (D-13) and inherit the same rules.

---

## 10. Documentation

Docs are part of the product, not a write-up afterwards.

**The rule: a docs change is part of every PR.** If a PR changes behaviour, schema, a contract or a decision and the diff contains no `docs/` file, the PR is incomplete. If a PR genuinely needs no docs change, say so explicitly in the PR description — "docs: none, internal refactor, public behaviour unchanged" — so the reviewer checks that claim rather than assuming it.

### How docs are organised

| Folder               | Holds                                                                               | Written by      |
| -------------------- | ----------------------------------------------------------------------------------- | --------------- |
| `docs/product/`      | what we are building and why; every prototype ambiguity resolved                    | Lead + owner    |
| `docs/architecture/` | `ARCHITECTURE.md` (binding), `DATA-MODEL.md`, `DESIGN-SYSTEM.md`                    | Lead            |
| `docs/features/`     | one spec per area (5 areas), features `F-<area>-<nn>`, built from `_TEMPLATE.md`    | Feature author  |
| `docs/engineering/`  | this handbook, TESTING, SECURITY, CI, RELEASES, OBSERVABILITY                       | Engineering     |
| `docs/decisions/`    | `DECISION-LOG.md` — every non-obvious decision (§11)                                | Whoever decides |
| `docs/reference/`    | Base44 inventory, security review, tooling references — historical input, read-only | Scouts          |
| `docs/plan/`         | `ROADMAP.md` — order of work, chunk numbers                                         | Lead            |
| `docs/test-reports/` | one report per shipped feature part                                                 | Feature author  |

`docs/README.md` is the index and lists every file with one line. Adding a doc without adding its index line is an incomplete PR.

### Keeping them in sync

- The feature spec is updated _before_ the code when the design changes, and _with_ the code when reality differs from the spec.
- `DATA-MODEL.md` and `supabase/migrations` change in the same commit.
- Any deviation from `ARCHITECTURE.md` is an ADR entry first (§11), then code. Never the other way round.
- Test reports are written from real output. A report with invented numbers is worse than no report; it is the one artifact the owner reads to decide whether to trust the build.
- Reference docs (`docs/reference/`) are **not** updated — they are a snapshot of what the prototype was. New findings go in `docs/engineering/SECURITY.md`.

---

## 11. Writing a decision (ADR)

`docs/decisions/DECISION-LOG.md` is one file, append-only in spirit, numbered `D-nn`. We use a single file rather than one file per decision because the value is in reading the sequence — the log is the project's reasoning, in order.

### When

Write an entry when a choice is **non-obvious and expensive to reverse**: a dependency or vendor, a schema shape that other tables will copy, a security trade-off, a deviation from `ARCHITECTURE.md`, a scope cut, or anything the owner decided in conversation (capture their words verbatim — D-10, D-13 and D-14 do this, and it has already settled arguments).

Do **not** write one for a naming choice, a refactor, or something the architecture already dictates.

### Format

```markdown
## D-<nn> — <short title> · <STATUS> · <YYYY-MM-DD>

**Context:** What forced a decision. Include the constraint that makes this hard —
"no Docker on this machine", "Bangladesh-first payments", the specific finding.

**Decision:** What we will do, in the present tense, specifically enough to implement.

**Why:** The reasoning _at the time_. Include the alternatives considered and the
one sentence that killed each. This is the part future-you needs.

**Consequences:** What this now forces or forbids. Which docs/code change as a result.

**Owner's words:** (when the owner decided it — quote, do not paraphrase)
```

**Status** is one of `PROPOSED` · `ACCEPTED` · `ACCEPTED by owner` · `REJECTED` · `SUPERSEDED by D-nn`.

### Rules

- Numbers are never reused, and entries are never edited to change their meaning. A decision that changes gets a **new** entry with `SUPERSEDED by D-nn` appended to the old one. D-02's history is the model: proposed, then accepted by the owner, and the superseded worktree recorded separately in D-11.
- The ADR lands in the **same PR** as the first code that depends on it, or ahead of it if the decision needs sign-off first.
- If a PR contradicts an accepted decision, the PR is blocked until a superseding entry is merged. "The code already does it differently" is not an argument.
- Reference decisions from code and specs by number (`Refs: D-15`), not by restating them — restating is how two sources of truth begin.

---

## 12. Working with Claude on this repo

The agent reads `CLAUDE.md` at the repo root every session; that file is the short operational contract. This handbook is its long form.

- **One feature at a time.** The owner's standard. A session works on one Part, on one branch, to green CI, then stops.
- **Model choice:** Opus for architecture, security analysis, threat modelling and spec writing; Sonnet for implementing a written, unambiguous spec; Haiku for bulk mechanical work (generating the 40th RLS policy from the template, rewriting imports). Do not use a cheaper model on anything touching auth, money or RLS design.
- **Before building:** read the feature spec, `docs/architecture/DATA-MODEL.md` and `CLAUDE.md`. If the spec does not answer a question, the answer goes in the spec before the code exists.
- **After building:** test report, docs update and ADR (if any) are part of the same PR. An agent that opens a PR without them has not finished.
