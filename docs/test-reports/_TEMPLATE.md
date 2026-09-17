# Test Report — F-\<area>-\<nn> \<Feature name>, Part \<n>

<!--
  Copy to docs/test-reports/F-<area>-<nn>-part-<n>.md and fill it in.
  Commit it in the PR that ships this Part.

  Every number in this report is COPIED FROM A REAL RUN. This is the document the owner
  reads instead of running the app, so an invented figure here becomes a bad release
  decision. If you did not run it, write "not run" and say why.
  Spec: docs/engineering/TESTING.md §7.2
-->

|         |                                                  |
| ------- | ------------------------------------------------ |
| Feature | F-\<area>-\<nn> — \<name>                        |
| Part    | \<n> — \<title from spec §8>                     |
| Spec    | `docs/features/<area>.md` §\<anchor>             |
| PR      | #\<n>                                            |
| Status  | **PASS** / **PASS WITH KNOWN ISSUES** / **FAIL** |
| Date    | YYYY-MM-DD                                       |
| Run by  | \<name>                                          |

---

## 1. Scope

**What this Part is.** One paragraph: what a user can now do that they could not before.

**Acceptance criteria covered** (from spec §9):

| #    | Criterion             | Covered by                           |
| ---- | --------------------- | ------------------------------------ |
| AC-1 | Given … when … then … | `e2e/journeys/<file>.spec.ts:<test>` |
| AC-2 |                       |                                      |

**Out of scope for this Part** — and where it is handled instead:

- …

**Risk areas** — what was most likely to break, and therefore where the testing effort went:

- …

---

## 2. Environment

|                |                                              |
| -------------- | -------------------------------------------- |
| Commit         | `<sha>`                                      |
| Branch         | `feat/<area>-<slug>`                         |
| CI run         | \<link to the GitHub Actions run>            |
| Preview URL    | \<vercel preview>                            |
| Supabase       | project `bvqzhrvcrxebawjusrxk`, branch `dev` |
| Migration head | `<timestamp>_<name>.sql`                     |
| Seed           | `supabase/seed` @ `<sha>`                    |
| Node / pnpm    | v24.x / 10.x                                 |
| Browsers       | Chromium \<version> (Playwright \<version>)  |
| Feature flags  | `<key>` = on/off                             |

---

## 3. Unit and integration (Vitest)

| Suite                     | Tests | Passed | Failed | Skipped | Duration |
| ------------------------- | ----- | ------ | ------ | ------- | -------- |
| `packages/domain`         |       |        |        |         |          |
| `apps/web` server actions |       |        |        |         |          |
| `packages/ui`             |       |        |        |         |          |
| **Total**                 |       |        |        |         |          |

### Coverage

| Package            | Lines | Branches | Functions | Threshold | Result |
| ------------------ | ----- | -------- | --------- | --------- | ------ |
| `packages/domain`  |       |          |           | 80 %      |        |
| Repository overall |       |          |           | 70 %      |        |

**Delta vs `main`:** \<+/- x.x pp>

### Notable cases proven

List the tests that matter, not all of them — the ones a reviewer would want to know exist.

- Invalid input rejected before any database write —
- Non-member of the workspace refused (403) —
- Wrong role refused even inside the correct workspace —
- Idempotent replay produces one row and the same result —
- Audit row written with the acting user —
- \<business rule, with the specific figures asserted> —

---

## 4. Database (pgTAP)

Every tenant table this Part touches appears here. Isolation = another tenant's rows are invisible and untouchable. Escalation = inside the tenant, role limits hold.

| Table     | Isolation assertions | Escalation assertions | Result      | File                             |
| --------- | -------------------- | --------------------- | ----------- | -------------------------------- |
| `<table>` |                      |                       | PASS / FAIL | `supabase/tests/rls/<table>.sql` |

**`coverage.sql`:** PASS / FAIL — \<if fail, which tables>

### Specifically proven

- A user in school B sees zero rows of school A, by list **and** by known row id —
- Update and delete against another tenant's row affect **zero rows** —
- No role can move a row to another workspace —
- A member cannot change their own `role` or `status` —
- Nobody can self-activate a pending membership —
- A member whose status becomes `removed` loses access with no session change —
- Parent access is guardian-scoped, not tenant-scoped —
- `audit_events` has no UPDATE or DELETE grant for any role —

---

## 5. End to end (Playwright)

| Journey          | 360 × 800 | 1280 × 800 | Duration | Notes |
| ---------------- | --------- | ---------- | -------- | ----- |
| `<journey name>` | PASS      | PASS       |          |       |

**Flaky (passed on retry):** \<count> — \<which, and the issue link, or "none">
**Report artifact:** \<link>

### Accessibility (axe, WCAG 2.1 AA)

| Screen         | Critical | Serious | Moderate | Minor | Notes |
| -------------- | -------- | ------- | -------- | ----- | ----- |
| `/app/<route>` | 0        | 0       |          |       |       |

**Manual checks** (axe cannot see these):

| Check                                           | 360 × 800 | 1280 × 800 |
| ----------------------------------------------- | --------- | ---------- |
| Touch targets ≥ 44 px                           |           |            |
| Visible focus ring on every interactive element |           |            |
| Primary action completable by keyboard alone    |           |            |
| `aria-live` announces save and error            |           |            |
| No horizontal scroll                            |           | n/a        |
| Contrast ≥ 4.5:1 on new surfaces                |           |            |

### Screenshots

| Screen | 360 × 800 | 1280 × 800 |
| ------ | --------- | ---------- |
|        |           |            |

<!-- Synthetic seed data only. Never a real name, phone number, ID number or medical detail. -->

---

## 6. Performance

| Budget                          | Target      | Measured | Result |
| ------------------------------- | ----------- | -------- | ------ |
| Lighthouse Performance (mobile) | ≥ 85        |          |        |
| Lighthouse PWA                  | ≥ 90        |          |        |
| Lighthouse Accessibility        | ≥ 95        |          |        |
| LCP, phone                      | ≤ 2.5 s     |          |        |
| INP on the primary action       | ≤ 200 ms    |          |        |
| First-load JS for the new route | ≤ 250 kB gz |          |        |
| Server action p95               | ≤ 400 ms    |          |        |
| Queries per list render         | ≤ 4         |          |        |

---

## 7. Security checks

| Check                                                             | Result               |
| ----------------------------------------------------------------- | -------------------- |
| gitleaks                                                          |                      |
| Semgrep (ERROR severity)                                          |                      |
| `pnpm audit --audit-level high`                                   |                      |
| Supabase advisors — new security advisories                       |                      |
| Authorized DAST against preview (if auth / money / files changed) | run / not applicable |

**If DAST was run** — checklists used, findings, and the test that now covers each:

| Checklist | Findings | Automated test added |
| --------- | -------- | -------------------- |
|           |          |                      |

---

## 8. Known issues

Everything found and not fixed. **An empty section on a non-trivial feature means the report was not written honestly** — there is always something.

| #   | Issue | Severity            | Ship anyway?      | Tracked   |
| --- | ----- | ------------------- | ----------------- | --------- |
| 1   |       | low / medium / high | yes — reason / no | #\<issue> |

**Deliberately not tested, and why:**

- …

---

## 9. Sign-off

| Definition of Done                           | Met |
| -------------------------------------------- | --- |
| Spec written and matches the build           | ☐   |
| Migration + pgTAP isolation and escalation   | ☐   |
| Unit tests + coverage thresholds             | ☐   |
| UI built and verified at both viewports      | ☐   |
| Playwright journey at both viewports         | ☐   |
| a11y — zero serious/critical + manual checks | ☐   |
| This test report, with real numbers          | ☐   |
| Docs updated in the same PR                  | ☐   |

**Signed off by:** \<name>
**Date:** YYYY-MM-DD
**Commit:** `<sha>`

> I ran these tests or read their output myself. The numbers above are copied from real runs.
> \<Any caveat the owner should know before this ships.>
