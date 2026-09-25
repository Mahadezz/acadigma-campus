# Test Report — F-CM-06 Plans & Subscriptions, read-only enforcement

|         |                                                                              |
| ------- | ---------------------------------------------------------------------------- |
| Feature | F-CM-06 — Plans, subscriptions, limits, invoices and dunning                 |
| Part    | Billing lane item 1 — `requireWritable` on every write path (D-300)          |
| Spec    | `docs/features/04-commerce/F-CM-06-plans-and-subscriptions.md` §5.6, §11     |
| PR      | #35                                                                          |
| Status  | **PASS WITH KNOWN ISSUES** (CI numbers in §4-§5 filled from the PR's CI run) |
| Date    | 2026-09-25                                                                   |
| Run by  | Claude (billing lane builder)                                                |

---

## 1. Scope

**What this Part is.** A workspace in `access_mode = 'read_only'` (an expired trial, D-62) can no longer be changed. Before this, the mode only showed a banner. Now the one tenant write server action (`updateSchoolSettings`) refuses with `payment_required` and the read-only message. A direct PostgREST write is refused by the database (`app.tg_require_writable()` trigger, `PLAN_READ_ONLY`). CI fails any future write action or tenant table that skips either guard. Closes Known issue 5 of the Part 4 report.

| #    | Criterion                                                                                          | Covered by                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| AC-4 | A read-only school's rows stay visible; writes are blocked with a named error and an upgrade path. | `50_require_writable.sql` B; `settings/actions.test.ts`; `read-only-workspace.spec.ts`                                            |
| —    | Reactivation (`app.set_access_mode(..., 'normal')`) lifts the block for the same writes.           | `50_require_writable.sql` C                                                                                                       |
| —    | A new `workspace_id` table without the trigger fails CI.                                           | `50_require_writable.sql` A (catalog invariant)                                                                                   |
| —    | A new tenant write action without `requireWritable` fails CI.                                      | `scripts/check-require-writable.mjs` + `check-require-writable.test.mjs` (6 `node --test` cases incl. the private-helper pattern) |

**Out of scope:** export, billing/upgrade and member-leave actions do not exist yet; their exemptions are designed (D-300) but have nothing to exercise.

**Risk areas:** locking out the billing path (privileged callers and platform staff pass; `set_access_mode` back to `normal` tested); breaking reads (trigger is write-only; reads asserted in read_only); breaking existing pgTAP files that flip `access_mode` (07, 16, 19 only write as privileged/platform staff).

---

## 2. Environment

|                |                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- |
| Branch         | `feat/F-CM-06-require-writable`                                                              |
| Supabase       | pgTAP is CI-only (no local Docker, `docs/plan/HANDOFF-2026-09-24.md`)                        |
| Migration head | `20260925300100_require_writable_guard.sql`                                                  |
| Seed           | `supabase/seed/seed.sql` gains `lapsed@acadigma.test` + "Acadigma Lapsed School" (read_only) |
| Node / pnpm    | v24 / 10                                                                                     |

---

## 3. Unit (Vitest) — local run

| Suite                      | Result                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Whole repo (`pnpm test`)   | 72 files, 846 tests, all passed                                                                                              |
| `settings/actions.test.ts` | 3 new: read_only → `payment_required`, repo never called; writable → writes; teacher → `forbidden` before the writable check |
| `contracts/plans.test.ts`  | 2 new: `planReadOnlyApiError` keeps the reason; generic fallback                                                             |

Local gate: `format:check`, `typecheck`, `lint`, `test`, every `scripts/check-*.mjs`, `next build` — all passed.

---

## 4. Database (pgTAP) — CI only

`supabase/tests/50_require_writable.sql`, 23 assertions: the invariant (A, now incl. the three F-OP-06 staff tables); owner UPDATE/INSERT/DELETE and a workspace rename refused with `42501 PLAN_READ_ONLY`, reads still return rows, a privileged write still lands, the refused rename changed nothing; removing a member, deleting a capability, revoking and declining an invitation still work while a role change, capability grant, invitation edit and invitation accept are refused; a stranger's insert is refused by RLS, not with the reason (B); after reactivation the same UPDATE/INSERT/DELETE succeed and land (C). Result: see the PR's `db` job.

---

## 5. End to end (Playwright)

`e2e/journeys/read-only-workspace.spec.ts` (phone + desktop projects, axe): the lapsed owner signs in, sees the banner with the reason and "nothing has been deleted", and still opens the audit viewer. **Skip-gated on `E2E_LIVE_SUPABASE`** like every seeded journey (OQ-27), so CI skips it; not run live.

Screenshots: not taken — the only UI change is the existing `InlineAlert` banner's text, and rendering it needs a live read_only workspace.

---

## 8. Known issues

| #   | Issue                                                                                                                                   | Severity | Ship anyway?                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------- |
| 1   | The action check detects reads by name prefix (`get`/`list`/…); a write misnamed as a read passes the script.                           | low      | yes — the database trigger still refuses it |
| 2   | Leaving a read-only school is allowed by the owner's ruling, but the leave RPC does not exist yet; its trigger exception lands with it. | low      | yes — D-300                                 |
| 3   | The Playwright journey is skip-gated until a live Supabase is wired into CI (OQ-27).                                                    | medium   | yes — same as every seeded journey          |
| 4   | Exports and billing/upgrade actions do not exist yet; their exemption is designed, not exercised.                                       | low      | yes                                         |

---

## 9. Sign-off

| Definition of Done          | Met                              |
| --------------------------- | -------------------------------- |
| Spec §11 updated            | ☑                                |
| Migration + pgTAP           | ☑ (CI)                           |
| Unit tests                  | ☑                                |
| UI at both viewports        | banner text only; no screenshots |
| Playwright journey          | written, skip-gated (OQ-27)      |
| Docs updated in the same PR | ☑                                |
