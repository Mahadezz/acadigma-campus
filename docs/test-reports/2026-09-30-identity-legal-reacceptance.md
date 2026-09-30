# Test Report — Re-acceptance of the current legal documents (D-115)

|         |                                                                          |
| ------- | ------------------------------------------------------------------------ |
| Feature | F-ID-01 — "Re-acceptance of the current legal documents" (follows D-114) |
| Part    | Re-acceptance gate + `/account/legal` screen                             |
| Spec    | `docs/features/01-identity/F-ID-01-authentication.md` §11, D-115 section |
| PR      | #125                                                                     |
| Status  | **PASS WITH KNOWN ISSUES**                                               |
| Date    | 2026-09-30                                                               |
| Run by  | Claude (identity lane)                                                   |

## 1. Scope

Accounts made before D-114 had no Terms/Privacy row, schools made before it had no DPA row, and a new version would never be asked for again. Now every shell page (`requireShell`) sends a person who has not accepted the **current** Terms and Privacy — and a school's **owner** who has not accepted its current DPA — to `/account/legal`, which reuses the sign-up and school-creation checkboxes. Account deletion (`/account/security`) and the owner's school export (`/api/settings/export`) stay outside the gate and are linked from the screen.

| Criterion                                                                            | Covered by                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| R1 no current Terms/Privacy row → `/account/legal`                                   | `lib/workspace.test.ts` (legal gate); `legal-reacceptance.spec.ts`          |
| R2 accepting records one row per document at the current version and opens the app   | pgTAP `39g` A1-A3; `actions.test.ts`; `legal-reacceptance.spec.ts`          |
| R3 the owner is asked for the school's DPA, an admin is not                          | `lib/legal/outstanding.test.ts`; `lib/workspace.test.ts`; pgTAP `39g` B, C1 |
| R4 `/account/security` reachable while acceptance is outstanding                     | `legal-reacceptance.spec.ts`                                                |
| R5 axe clean at both viewports                                                       | `legal-reacceptance.spec.ts`                                                |
| Only a published version can be recorded; shown ≠ current → refused                  | pgTAP `39g` A4-A5; `actions.test.ts`; `accept-form.test.tsx`                |
| Isolation/escalation: admin, teacher, other school's owner, personal workspace, anon | pgTAP `39g` C1-C9                                                           |

**Out of scope** (D-115 Consequences): a grace period, email notice of a new version, Bengali Terms/Privacy, guardian re-consent, gating server actions.

## 2. Environment

|                |                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Branch         | `feat/identity-legal-reacceptance`                                                                     |
| Migration head | `20260930113432_legal_reacceptance.sql`                                                                |
| Node / pnpm    | local Windows (Node 24, pnpm 10); CI ubuntu                                                            |
| Database       | No local Docker in this session: pgTAP ran only in CI's `db` job (run 36712374571), the run of record. |
| Browser        | Playwright Chromium, CI `e2e-live` job (local Supabase stack in CI)                                    |

## 3. Unit and integration (Vitest)

| Suite                       | Result                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test` (local, all)    | 192 files passed, 11 skipped; 1928 tests passed, 36 skipped                                                                               |
| CI `unit` (run 36712374571) | 195 files passed, 11 skipped; 1952 tests passed, 36 skipped                                                                               |
| CI `db-integration`         | 11 files, 36 tests passed                                                                                                                 |
| New/changed for this PR     | `outstanding.test.ts`, `legal.test.ts` (repository), `actions.test.ts`, `accept-form.test.tsx`, `workspace.test.ts` (+4 legal-gate cases) |

Coverage (CI `unit`): all files 85.49 % statements, 88.77 % lines; `packages/db/src/repositories/legal.ts` 100 % lines, 92.85 % branches.

A first full local run failed one unrelated test (`packages/pdf` register performance budget: 4051 ms against 4000 ms on a loaded machine); the next full run passed.

## 4. Database (pgTAP) — CI `db` job, run 36712374571

| File                                   | Plan | Result | Notes                                  |
| -------------------------------------- | ---- | ------ | -------------------------------------- |
| `39g_legal_reacceptance.sql`           | 17   | pass   | new                                    |
| `12_function_grants_invariant.sql`     | —    | pass   | allowlist adds `accept_legal_document` |
| `39f_legal_acceptance_and_consent.sql` | —    | pass   | regression (the D-114 writers)         |
| All files                              | —    | pass   | Files=62, Tests=1804                   |

The first CI run (36711945269) failed `39g` before any assertion: the four fixture users shared a name and an id prefix, so their personal-workspace slugs collided. Fixed by giving each a distinct name.

## 5. End to end (Playwright)

| Journey                      | 360 × 800 | 1280 × 800 | Notes                                                                    |
| ---------------------------- | --------- | ---------- | ------------------------------------------------------------------------ |
| `legal-reacceptance.spec.ts` | pending   | pending    | live-only; the screen's screenshot is attached per viewport              |
| every other live journey     | pending   | pending    | seeded accounts now hold every published acceptance (`e2e-fixtures.sql`) |

### Screenshots

Not taken locally: this session had no local Supabase stack and no seeded account on a dev database. Each viewport's screenshot of `/account/legal` is attached (`legal-reacceptance`) to the `playwright-report-live-*` artifacts of the CI run.

## 6. Performance

- `/account/legal`: 4.31 kB, first-load JS 207 kB (local `next build`); `check-bundle-budget` passes.
- The gate adds one indexed read of the caller's own `legal_acceptances` rows per request (`React.cache`, so a layout and its page share it).

## 7. Security checks

- New function `public.accept_legal_document`: SECURITY DEFINER, `search_path = ''`, revoked from `public`/`anon`, granted to `authenticated` only (D-54); `12_function_grants_invariant` passes.
- The DPA's school is never taken from the request: the action resolves the workspace context and the database re-checks active ownership and `type = school`.
- The versions the screen showed must equal the current ones, or nothing is recorded.
- Gitleaks, Semgrep, `pnpm audit`: CI `security` job pass (run 36712374571).
- ECC reviewers (security, react, typescript, ponytail): left to the lead's review round.

## 8. Known issues

| #   | Issue                                                                                                   | Severity | Ship anyway?                                      |
| --- | ------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| 1   | The gate is a render gate: server actions and route handlers are not gated (D-115 §6)                   | medium   | yes — permissions are unchanged; decided in D-115 |
| 2   | The DPA branch has no Playwright journey (needs a school without a DPA row); unit + pgTAP only          | low      | yes                                               |
| 3   | The (account) layout's Back link goes to `/app`, which returns to the screen until accepted             | low      | yes                                               |
| 4   | No grace period; the demo school's owner and every pre-D-114 account see the screen on their next visit | low      | yes — intended (D-115 §4)                         |
| 5   | Texts are still interim; Terms/Privacy/DPA English only                                                 | medium   | yes — OWNER-QUESTIONS (counsel)                   |
| 6   | No local screenshots (§5)                                                                               | low      | yes                                               |

## 9. Sign-off

Built and self-reviewed by Claude (identity lane). Awaiting the lead's review.
