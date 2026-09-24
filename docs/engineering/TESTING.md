# Acadigma Campus — Testing

What we test, where, how it runs, and what proof leaves the pipeline. Gates are defined in `docs/engineering/CI.md`; the Definition of Done that consumes them is `docs/engineering/HANDBOOK.md` §5.

The premise: this app holds children's medical records, national ID scans and money. The Base44 prototype had 42 of 64 entities with no access control and an audit trail written from the browser. **Every test in this document exists because something specific must be provably impossible.**

---

## 1. The pyramid for this stack

```
        ┌──────────────────────────────────────┐
        │  e2e — Playwright journeys           │  ~25 journeys, 2 viewports, + axe
        │  the acceptance criteria, as a user  │  minutes
        ├──────────────────────────────────────┤
        │  integration — server actions        │  every action: parse → ctx → policy
        │  against the Supabase dev branch     │  → repo → result
        ├──────────────────────────────────────┤
        │  database — pgTAP                    │  RLS isolation + escalation
        │  the security boundary itself        │  EVERY tenant table, no exceptions
        ├──────────────────────────────────────┤
        │  unit — Vitest on packages/domain    │  pure rules: grading, payroll,
        │  no I/O, milliseconds, hundreds      │  permissions, pricing, cover ranking
        └──────────────────────────────────────┘
             + contract/enum parity  (cheap, catches drift)
             + performance budgets   (Lighthouse, query timing)
```

Two deliberate departures from the classic pyramid:

1. **The database layer is not optional or thin.** RLS is a security control, and an untested security control is a claim. pgTAP tests are as mandatory as unit tests and there are roughly as many of them.
2. **Integration tests run against a real Postgres** (the Supabase dev branch), not a mock. Mocking Supabase would mock away RLS, which is the thing most likely to be wrong.

What we do **not** do: snapshot tests of rendered markup (they fail on every design change and catch nothing), mocked repository unit tests for server actions (they prove the mock works), and manual regression passes (they are not repeatable and produce no artifact).

| Layer                 | Tool                                    | Runs on    | Blocking gate     |
| --------------------- | --------------------------------------- | ---------- | ----------------- |
| Unit                  | Vitest (node env)                       | every push | `CI / unit`       |
| Component             | Vitest + Testing Library (jsdom)        | every push | `CI / unit`       |
| Integration (actions) | Vitest (node) + dev-branch Postgres     | every push | `CI / unit`       |
| Database              | pgTAP via `pnpm db:test`                | every push | `CI / db`         |
| Contract parity       | Vitest                                  | every push | `CI / contracts`  |
| e2e + a11y            | Playwright + `@axe-core/playwright`     | every push | `CI / e2e`        |
| Performance           | Lighthouse CI + query budget assertions | every push | `CI / lighthouse` |

---

## 2. Vitest

### 2.1 Workspace setup

One Vitest config at the repo root (`vitest.config.ts`, `test.projects`) so the environments do not fight. (Vitest 4 removed the separate `vitest.workspace.ts` file — see D-49 2026-09-24 dependency bump.)

```ts
// vitest.config.ts — test.projects
export default [
  {
    test: {
      name: "domain",
      root: "./packages/domain",
      environment: "node",
      include: ["src/**/*.test.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "json-summary", "lcov"],
        include: ["src/**/*.ts"],
        exclude: ["src/**/*.test.ts", "src/**/index.ts"],
        thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      },
    },
  },
  {
    test: {
      name: "server",
      root: "./apps/web",
      environment: "node",
      include: ["{app,lib,server}/**/*.test.ts"],
      setupFiles: ["./test/setup.server.ts"],
      pool: "forks", // isolated processes: each test owns a transaction
      fileParallelism: false, // one writer at a time against the shared dev branch
      testTimeout: 20_000,
    },
  },
  {
    test: {
      name: "ui",
      root: "./packages/ui",
      environment: "jsdom",
      include: ["src/**/*.test.tsx"],
      setupFiles: ["./test/setup.ui.ts"],
    },
  },
]
```

Coverage thresholds are enforced, not advisory: `packages/domain` ≥ 80 % lines, repository-wide ≥ 70 % (ARCHITECTURE §9). The domain threshold rises as the package matures; it never falls. Lowering a threshold requires a line in the PR description explaining why, and the reviewer will say no.

### 2.2 `packages/domain`

This package is pure: no network, no database, no clock, no randomness. That is enforced by lint (`no-restricted-imports` blocks `@acadigma/db`, `next/*`, `node:fs`) and it is what makes these tests fast and total. Time and ids are injected:

```ts
// packages/domain/src/attendance/percentage.test.ts
import { describe, it, expect } from "vitest"
import { attendancePercentage } from "./percentage"

describe("attendancePercentage", () => {
  const cases = [
    { present: 18, late: 2, absent: 0, excused: 0, expected: 10_000 }, // basis points
    { present: 15, late: 0, absent: 5, excused: 0, expected: 7_500 },
    { present: 15, late: 0, absent: 3, excused: 2, expected: 8_333 }, // excused excluded from denominator
    { present: 0, late: 0, absent: 0, excused: 0, expected: null }, // no sessions -> not 0 %
  ]
  it.each(cases)("$present/$late/$absent/$excused -> $expected bp", (c) => {
    expect(attendancePercentage(c)).toBe(c.expected)
  })
})
```

Three habits that make domain tests worth having:

- **Table-driven.** Business rules are tables in the spec (`docs/features/<area>.md` §5); the test is that table, transcribed. If the spec has no table, the rule is not specified well enough to implement.
- **Boundaries and zero.** Empty sets, exactly-at-threshold, one-below, the rounding case. The `null` row above exists because "no sessions yet" rendering as 0 % is a bug that reaches parents.
- **Money never floats.** Every money test asserts integer paisa. `expect(commission(10_000_00, 3_000)).toBe(3_000_00)` — a test that passes with `toBeCloseTo` is a test that will ship a rounding error.

The permissions matrix gets exhaustive coverage: for every `(role, permissionKey)` pair the matrix defines, one assertion. It is generated from the matrix itself with an extra assertion that the matrix has no key the app does not use and no key the app uses that the matrix lacks — `permissions.js:77` in the prototype failed **open** to `teacher` for unknown roles, so the default-deny path gets its own explicit test.

### 2.3 Server actions

Integration tests, not unit tests. They run against the Supabase dev branch through the real repositories, as a real user, inside a transaction that is rolled back.

```ts
// apps/web/app/(school)/app/attendance/actions.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import { withTestWorkspace, actingAs } from "@/test/harness"
import { saveAttendance } from "./actions"

describe("saveAttendance", () => {
  let ws: TestWorkspace
  beforeEach(async () => {
    ws = await withTestWorkspace()
  }) // seeds a school, rolls back after

  it("rejects an input that fails the schema before touching the database", async () => {
    const res = await actingAs(ws.teacher, () =>
      saveAttendance({ sessionId: "not-a-uuid" })
    )
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } })
    await expect(ws.countRows("attendance_entries")).resolves.toBe(0)
  })

  it("refuses a caller who is not an active member of the workspace", async () => {
    const res = await actingAs(ws.outsider, () =>
      saveAttendance(validInput(ws))
    )
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } })
  })

  it("refuses a parent even though the row would satisfy the tenant predicate", async () => {
    // Base44 finding 1: tenant id alone is not authorisation.
    const res = await actingAs(ws.parent, () => saveAttendance(validInput(ws)))
    expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } })
  })

  it("is idempotent: the same key twice yields one row and the same result", async () => {
    const input = validInput(ws)
    const a = await actingAs(ws.teacher, () => saveAttendance(input))
    const b = await actingAs(ws.teacher, () => saveAttendance(input))
    expect(b).toEqual(a)
    await expect(ws.countRows("attendance_entries")).resolves.toBe(
      input.entries.length
    )
  })

  it("writes an audit_events row with the acting user, from the trigger", async () => {
    await actingAs(ws.teacher, () => saveAttendance(validInput(ws)))
    const audit = await ws.lastAudit("attendance_entries")
    expect(audit).toMatchObject({ actor_id: ws.teacher.id, action: "insert" })
    expect(audit.correlation_id).toBeTruthy()
  })
})
```

`actingAs` signs a real JWT for that test user and builds the client the same way a request does — so **RLS applies inside the test**. A test that bypasses RLS with the service role proves nothing about production.

Every server action gets, at minimum, these five tests: invalid input, non-member, wrong role, happy path with the canonical row returned, and audit row written. Idempotent mutations add the double-submit test. Anything touching money adds "amount in the request body is ignored".

### 2.4 Component tests

Reserved for `packages/ui` primitives with real logic — `DataList` cursor handling, `FormSheet` error surfacing, `BottomNav` role∧plan filtering. Feature screens are covered by Playwright instead; testing them in jsdom means asserting against a DOM that is not the one users get.

---

## 3. pgTAP — the RLS test suite

### 3.1 Why it is mandatory

RLS is the control that stands between a dismissed teacher and a child's medical record (Base44 finding 6), and between any signed-in user and every seller's passport scan (finding 3). We write the policy and then we prove it, per table, both directions.

Layout:

```
supabase/tests/
  helpers/
    fixtures.sql        create_test_workspaces() -> two schools, one user per role in each, plus an outsider
    assert.sql          shorthand: assert_can_select(), assert_cannot_insert(), as_user()
  rls/
    students.sql
    attendance_entries.sql
    …one file per tenant table
  coverage.sql          FAILS if any table with a workspace_id column has no rls/<table>.sql
```

The scaffold currently ships a bootstrap suite — `01_app_helpers.sql`, `02_tenant_isolation.sql`, `03_role_escalation.sql` — covering the identity tables in one pass. That is the right shape for the foundation, where every table shares one policy set. **From the first feature migration onward, each new tenant table gets its own `rls/<table>.sql`**, because one growing file becomes impossible to review and impossible to attribute when it fails. The bootstrap files remain as the cross-cutting cases they already are, and satisfy `coverage.sql` for the tables they name.

`coverage.sql` is the file that keeps this honest. It queries `information_schema` for every table carrying `workspace_id`, and fails the run if a corresponding test file is missing or if `relrowsecurity` is false. A new tenant table without tests cannot merge — that is a mechanical guarantee, not a review habit.

### 3.2 The template — every tenant table gets both halves

```sql
-- supabase/tests/rls/<table>.sql
begin;
select plan(14);
select create_test_workspaces();   -- school A (owner/admin/teacher/staff/parent), school B (same), outsider

-- ─── A. ISOLATION: school B is invisible and untouchable from school A ───────
select as_user('a_teacher');
select is(
  (select count(*) from <table> where workspace_id = ws('B'))::int, 0,
  'A.teacher sees zero rows belonging to school B');

select throws_ok(
  $$ insert into <table> (workspace_id, …) values (ws('B'), …) $$,
  '42501', 'new row violates row-level security policy for table "<table>"',
  'A.teacher cannot insert into school B');

select is(
  (select count(*) from <table> where id = row_id('B', 1))::int, 0,
  'A.teacher cannot read a known row id from school B');       -- direct id access, not just listing

select is(
  (with u as (update <table> set <col> = 'x' where id = row_id('B',1) returning 1)
   select count(*) from u)::int, 0,
  'A.teacher update against a school B row affects no rows');

select is(
  (with d as (delete from <table> where id = row_id('B',1) returning 1)
   select count(*) from d)::int, 0,
  'A.teacher delete against a school B row affects no rows');

select as_user('outsider');
select is((select count(*) from <table>)::int, 0,
  'a user with no membership sees nothing');

-- ─── B. ESCALATION: inside school A, role limits hold ────────────────────────
select as_user('a_parent');
select is((select count(*) from <table> where workspace_id = ws('A'))::int, <expected_for_parent>,
  'A.parent sees only guardian-scoped rows, not the whole tenant');   -- Base44 finding 1
select throws_ok($$ insert into <table> (workspace_id, …) values (ws('A'), …) $$, '42501',
  null, 'A.parent cannot insert');

select as_user('a_teacher');
select lives_ok($$ insert into <table> (workspace_id, …) values (ws('A'), …) $$,
  'A.teacher can insert into their own workspace');
select throws_ok($$ delete from <table> where workspace_id = ws('A') $$, '42501',
  null, 'A.teacher cannot delete (owner/admin only)');

-- tenant reassignment: the row cannot be moved to another workspace by anyone
select as_user('a_owner');
select is(
  (with u as (update <table> set workspace_id = ws('B') where id = row_id('A',1) returning 1)
   select count(*) from u)::int, 0,
  'even the owner cannot move a row to another workspace');

-- membership self-edit: the prototype let a parent promote themselves (finding 2)
select as_user('a_parent');
select is(
  (with u as (update workspace_members set role = 'owner'
              where user_id = uid('a_parent') returning 1) select count(*) from u)::int, 0,
  'a member cannot change their own role');
select is(
  (with u as (update workspace_members set status = 'active'
              where user_id = uid('outsider') and workspace_id = ws('A') returning 1)
   select count(*) from u)::int, 0,
  'nobody can self-activate a membership');

-- removed staff lose access immediately (finding 6)
select set_member_status('a_teacher', 'removed');
select as_user('a_teacher');
select is((select count(*) from <table>)::int, 0,
  'a removed member sees nothing, with no session change required');

select * from finish();
rollback;
```

Notes that matter:

- **Update and delete are asserted as "affects zero rows", not as errors.** Postgres does not raise on a `USING` failure — it silently filters. A test written with `throws_ok` for an update would pass against a table with _no_ policy at all. This is the single most common way an RLS test suite lies.
- `throws_ok` with `42501` is correct for `INSERT`/`UPDATE` **`WITH CHECK`** violations only.
- Every table repeats the tenant-reassignment case, because ARCHITECTURE §3's update policy exists precisely to prevent it.
- Parent-scoped tables additionally assert that a parent sees _their own children only_, using two guardians in school A.
- Platform admin tables assert the bypass policy grants read where intended and **not** write where not.

Run locally: `pnpm db:test` (applies pending migrations to the dev branch first, then runs every file, then rolls back). In CI it is the `CI / db` job.

### 3.3 Beyond RLS

`supabase/tests/` also covers: the audit trigger fires on insert/update/delete with the right actor; `audit_events` has no UPDATE/DELETE grant for any role (the prototype overwrote audit rows in place); `app.next_id()` produces no duplicates under concurrent calls; soft-deleted rows are excluded by the select policy; and `SECURITY DEFINER` helpers have a pinned `search_path`.

---

## 4. Playwright

### 4.1 Configuration

```ts
// playwright.config.ts
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // see §8 — 1, not 2, and retries are reported
  workers: process.env.CI ? 4 : 2,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
    ["github"],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "mobile-360",
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop-1280",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
})
```

Both viewports run **every** journey. 360×800 is the primary target (D-13: phone-first, and the Android wrapper ships this exact layout); 1280×800 proves the `lg` shell swap from bottom-nav + sheets to sidebar + panels. A journey that only passes on desktop is a failed journey.

Auth is set up once per role in `auth.setup.ts`, which signs in and saves storage state to `e2e/.auth/<role>.json`. Journeys pick a role through a fixture — they never walk the login form unless login _is_ the journey.

### 4.2 Journeys

A journey is an acceptance criterion from the feature spec §9, executed as a user. It is named for the outcome, not the screen.

```ts
// e2e/journeys/attendance-daily-register.spec.ts
test.describe("teacher takes attendance", () => {
  test.use({ storageState: ".auth/teacher.json" })

  test("marks a class present and the parent sees it", async ({
    page,
    axe,
  }) => {
    await page.goto("/app/attendance")
    await page.getByRole("button", { name: "Class 6A · Period 1" }).click()

    // phone: a sheet; desktop: a panel — same accessible name, one assertion
    const register = page.getByRole("dialog", { name: "Daily register" })
    await expect(register).toBeVisible()

    await register
      .getByRole("row", { name: "Rahim Uddin" })
      .getByRole("button", { name: "Absent" })
      .click()
    await register.getByRole("button", { name: "Save" }).click()

    await expect(page.getByRole("status")).toHaveText(/saved/i)
    await expect(page.getByText("1 absent")).toBeVisible()

    await checkA11y(page, axe) // §4.3
  })
})
```

Rules for journeys that stay green:

- **Role-based selectors only.** `getByRole`, `getByLabel`, `getByText`. `data-testid` is allowed only where no accessible name can exist (a canvas, a chart). CSS/XPath selectors are rejected in review — they encode the DOM, which is the thing we refactor.
- **No `waitForTimeout`.** Web-first assertions (`toBeVisible`, `toHaveText`) retry on their own. A sleep in a spec is a flake waiting for a slow CI runner.
- **One journey, one outcome.** Do not chain five features into one spec to save setup time; when it fails you will not know what broke.
- **Data is created by the journey or by the seed**, never assumed from a previous spec. Specs run in parallel and in any order.
- **Both shells asserted where they differ.** When the phone and desktop layouts genuinely differ (bottom nav vs sidebar), assert the difference explicitly with `test.skip(({ isMobile }) => …)` rather than writing selectors that happen to match both.

Coverage target: every acceptance criterion in every shipped feature spec has a journey. Cross-cutting journeys that always run: sign-up → create school → invite a teacher → accept; workspace switch (and that switching does **not** grant access to a workspace you left); a removed member losing access mid-session; marketplace purchase through a stubbed SSLCommerz sandbox to entitlement; parent portal showing exactly one family's children.

### 4.3 Accessibility

`@axe-core/playwright` runs inside journeys, not as a separate suite — scanning a screen you never interacted with misses everything behind a sheet.

```ts
// e2e/fixtures/a11y.ts
export async function checkA11y(page: Page, context?: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  )
  expect
    .soft(blocking, `axe violations${context ? ` (${context})` : ""}`)
    .toEqual([])
  await test.info().attach("axe.json", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  })
}
```

`serious` and `critical` fail the build. `moderate` and `minor` are attached to the report and reviewed; they become issues, not blockers. The axe JSON is attached to the Playwright report so the PR reviewer can see exactly what was checked.

Axe does not check everything. These are asserted manually per screen and recorded in the test report: 44 px minimum touch targets at 360 px width, visible focus ring on every interactive element, keyboard-only completion of the primary action, `aria-live` announcement on save/error toasts, and no horizontal scroll at 360 px.

---

## 5. Contract and enum parity

Cheap and high-value: the same concept is defined in Postgres, in Zod and in generated types, and the three drift silently.

```ts
// packages/contracts/src/parity.test.ts
const pairs = [
  ["attendance_status", attendanceStatus],
  ["member_role", memberRole],
  ["order_state", orderState],
  // …every Postgres enum, exhaustively — the test below proves the list is complete
] as const

it("every Postgres enum is mirrored by a Zod enum with identical labels", async () => {
  const dbEnums = await listPgEnums() // pg_type/pg_enum against the dev branch
  expect(new Set(pairs.map(([n]) => n))).toEqual(
    new Set(dbEnums.map((e) => e.name))
  )
  for (const [name, zod] of pairs) {
    const labels = dbEnums.find((e) => e.name === name)!.labels
    expect([...zod.options].sort()).toEqual([...labels].sort())
  }
})

it("generated database types are not stale", async () => {
  const fresh = await generateTypes() // same command as pnpm db:types
  expect(fresh).toBe(readFileSync("packages/db/src/types.generated.ts", "utf8"))
})
```

The second test is why `types.generated.ts` is committed: a stale file means somebody wrote a migration and never regenerated, and the typechecker has been lying ever since. Additional parity checks in the same suite: every permission key used in application code exists in the domain matrix; every table with `workspace_id` has RLS enabled; every feature flag referenced in code exists in the `feature_flags` seed.

---

## 6. Performance budgets

| Budget                                                | Measured by                                                  | Fails at               |
| ----------------------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| Lighthouse Performance (app shell, mobile, throttled) | Lighthouse CI on a preview URL                               | < 85                   |
| Lighthouse PWA                                        | Lighthouse CI                                                | < 90 (ARCHITECTURE §9) |
| Lighthouse Accessibility                              | Lighthouse CI                                                | < 95                   |
| LCP, phone, `/app/dashboard`                          | Lighthouse CI                                                | > 2.5 s                |
| INP on the primary action of every journey            | Playwright `PerformanceObserver`                             | > 200 ms               |
| First-load JS, any route in `(school)/app`            | `next build` route analysis, asserted in CI                  | > 250 kB gzipped       |
| Server action p95 (dev-branch integration run)        | Vitest timing assertion                                      | > 400 ms               |
| Any single query in a list screen                     | `explain (analyze)` assertion in pgTAP for the indexed paths | > 50 ms on seed data   |
| Queries per list render                               | Test harness counts statements                               | > 4 (N+1 detector)     |

The N+1 counter is the one that catches real regressions: the harness wraps the client, counts statements per action, and fails when a loop starts issuing queries. Budgets are asserted per-route, and raising one requires a line in the PR description and the owner's agreement — a budget that moves whenever it is inconvenient is not a budget.

---

## 7. Test reports

Two audiences. CI produces machine artifacts for the reviewer; `docs/test-reports/` holds the durable, human record the owner asked for.

### 7.1 From the pipeline

- **Vitest** runs with `--reporter=json --reporter=default --coverage`. A small script turns `results.json` + `coverage-summary.json` into a Markdown table appended to `$GITHUB_STEP_SUMMARY`: suites, passed/failed/skipped, duration, and a coverage table per package with the delta against `main`. The raw JSON uploads as the `unit-results` artifact (30-day retention).
- **pgTAP** output (TAP) is converted to a summary table — tables covered, assertions, failures — and appended to the job summary. Missing-coverage failures from `coverage.sql` are printed with the offending table names, because that is the actionable part.
- **Playwright** uploads `playwright-report/` as the `playwright-report` artifact (30 days; traces and videos for failures only). The `github` reporter annotates failures inline on the diff. A comment on the PR links the artifact and the preview URL used.
- **Lighthouse CI** uploads its JSON + HTML as `lighthouse-report` and prints the scores table to the summary.
- All of the above are attached to the PR, so a reviewer never has to run anything to see what was verified.

### 7.2 The durable report

One file per feature part, in `docs/test-reports/`, created from `docs/test-reports/_TEMPLATE.md`, committed **in the PR that ships the part**. Naming: `<feature-id>-part-<n>.md`, e.g. `F-academics-03-part-2.md`.

Sections (the template is the authority; this is the contract it encodes):

1. **Scope** — what this part is, which acceptance criteria are covered, what is explicitly out of scope and why.
2. **Environment** — commit SHA, branch, PR, preview URL, Supabase branch and last migration applied, Node/pnpm versions, browsers, date, who ran it.
3. **Unit results** — table: suite · tests · passed · failed · skipped · duration. Plus coverage: package · lines · branches · functions · threshold · pass/fail.
4. **Database results** — table: table · isolation assertions · escalation assertions · result. Every tenant table the part touches appears here. Missing rows are a failed report.
5. **E2E results** — table: journey · viewport · result · duration. Both viewports listed separately. Plus the a11y table: screen · serious · critical · moderate · notes, and the manual checks (targets, focus, keyboard, `aria-live`, no horizontal scroll at 360).
6. **Performance** — measured value against each applicable budget.
7. **Known issues** — everything found and not fixed, each with severity, an issue link and a decision to ship or not. An empty section on a non-trivial feature is a sign the report was not written honestly.
8. **Sign-off** — who ran it, date, commit, and an explicit statement of the DoD boxes met. Signing off means you personally saw the output.

**The numbers are copied from real runs.** A fabricated report is the worst possible artifact in this repository: it is the thing the owner reads instead of running the app, so a lie there propagates into a release decision.

---

## 8. Flaky tests

A flaky test is a failed test. It costs more than a missing one because it teaches the team to ignore red.

**Policy**

1. **Retries are 1 in CI, 0 locally, and always reported.** Retries exist to keep one infrastructure hiccup from blocking a merge — not to hide non-determinism. A test that passes on retry still appears in the job summary under "flaky", and the PR cannot be merged with a flaky count > 0 without an explicit decision in the PR description.
2. **First flake → issue, same day.** Label `flaky`, attach the Playwright trace, name the suspected cause. Traces are retained on failure precisely so this is possible without reproducing.
3. **Second flake within 14 days → quarantine within 24 hours.** Tag it `test.fixme` (Playwright) or `it.skip` with a comment `// QUARANTINED <date> <issue> — <owner>`, so it is visible and attributable. Quarantining removes it from the gate; it does not remove it from the backlog.
4. **Quarantine has a 7-day expiry.** A weekly job fails the build if any quarantined test is older than 7 days. The options are fix or delete — a permanently skipped test is worse than no test, because the coverage report still counts the file.
5. **Never fix a flake with a sleep.** Root causes in this stack, in order of frequency: asserting before a server action's `revalidateTag` has propagated (assert on the visible outcome, not a timer); tests sharing seed rows (use `withTestWorkspace`); animation timing on sheets (wait for the `dialog` role, not the transition); and real races in the code, which are the ones worth finding.
6. **Quarantined RLS tests do not exist.** A pgTAP test cannot be quarantined. If an RLS test is failing intermittently, either the policy is non-deterministic or the fixture is shared — both are bugs to fix now, and the feature does not ship until it is green.

The flaky count per week is reported by the weekly CI job (`docs/engineering/CI.md` §7) and is a health metric we watch. A rising count means the suite is decaying; the response is to fix the top offender, not to raise the retry count.
