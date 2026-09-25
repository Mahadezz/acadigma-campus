# Test Report — F-CM-06 read-only follow-ups (D-301)

|         |                                                                     |
| ------- | ------------------------------------------------------------------- |
| Feature | F-CM-06 — Plans, subscriptions, limits, invoices and dunning        |
| Part    | Billing lane: PR #35 follow-ups — join check, seed password hashing |
| PR      | see branch `fix/F-CM-06-readonly-followups`                         |
| Status  | **PASS WITH KNOWN ISSUES**                                          |
| Date    | 2026-09-25                                                          |

## 1. Scope

- A stranger's direct `workspace_members` INSERT no longer reveals whether a school is read-only: the trigger's non-member branch is gone, so RLS refuses it identically in both modes.
- `app.accept_invitation()` and `app.join_workspace_by_code()` refuse a read-only school with `PLAN_READ_ONLY` ("Ask the owner to upgrade."), after verifying the token or code.
- The seed hashes all four account passwords at seed time (`extensions.crypt`), removing the Semgrep bcrypt findings.

- Found by the new test: the seed was broken on main since #32 (its label inserts collided with the labels the school bootstrap now creates); it now picks the bootstrap's labels by name.

## 2. Environment

Migration head `20260925300201_readonly_join_check.sql`. pgTAP is CI-only (no local Docker).

## 3. Unit

No TypeScript changed. Local gate (format, typecheck, lint, test, `scripts/check-*.mjs`, build) passed.

## 4. Database (pgTAP)

`51_readonly_join_and_seed.sql`, 7 assertions: the seed applies and all four accounts verify against `password123`; the lapsed school is read-only; a stranger's insert gets the same RLS error on a read-only and a normal school; join-by-code and accept-invitation are refused on the read-only school; the normal school's code still works. `50_require_writable.sql` still passes unchanged. Result: see the PR's `db` job.

## 8. Known issues

| #   | Issue                                                                                                                     | Severity | Ship anyway?                             |
| --- | ------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------- |
| 1   | The migration uses the lane-digit name `20260925300201`, not real UTC time: today's real time sorts before D-300's file.  | low      | yes — D-301 (3); real time from tomorrow |
| 2   | CI still does not run `supabase db reset` with the seed; `51_` applies it inside a rolled-back pgTAP transaction instead. | low      | yes                                      |
