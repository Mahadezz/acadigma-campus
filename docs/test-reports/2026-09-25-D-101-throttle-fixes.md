# Test Report — D-101: per-user throttle keys and the throttled sign-in copy

|         |                                                         |
| ------- | ------------------------------------------------------- |
| Feature | F-ID-01 (rate limits), F-ID-05 (create-school throttle) |
| Part    | Follow-up fix (D-100 item 7; production copy bug)       |
| PR      | #45                                                     |
| Status  | **PASS** (CI numbers in the PR checks)                  |
| Date    | 2026-09-25                                              |
| Run by  | Claude (identity lane builder)                          |

## 1. Scope

1. `/login` after the rate limit trips: the wait appeared in the banner and as the button label, as raw seconds. Now: banner only, whole minutes, button a disabled "Sign in"; the same minutes wording for every rate-limited action (en + bn).
2. Per-user throttle buckets could be filled by anyone who knew a user's id. Now their keys are derived from `auth.uid()` inside the database.

## 2. Environment

Local PostgreSQL 17.10 + pgTAP 1.3.4 (the CI `db` job's steps: bootstrap, every migration, every test file). Node 24, pnpm 10.

## 3. Unit (Vitest)

`apps/web` suites: 98 passed. New: `login-form.test.tsx` — the banner reads "Try again in 15 min." and in Bangla "১৫ মিনিট" (native digits via `Intl.NumberFormat`); a 30-second wait reads "1 min."; the banner is announced with `role="alert"`; the button is a disabled "Sign in" and re-enables when the countdown reaches zero (fake timers, ticking on minute boundaries); no "900" anywhere. Updated: `(onboarding)/actions.test.ts` (the key is `user:eiinCheck`; the error carries `retryAfterSeconds: 137` and says "3 min").

## 4. Database (pgTAP)

All files pass locally. `31_throttle_per_user_keys.sql` **11/11**:

- 40 `createSchool` failures recorded by Alice naming the victim's key: zero rows touch the victim; all 40 land on Alice's own row.
- `throttle_status` with a `user:` key naming someone else reads only the caller's own row; `throttle_reset` refuses any `user:` key from a client (`42501`), including the caller's own `user:createSchool` (review of PR #45).
- anon calling `throttle_status('user:…')` → `42501 authentication required`; anon `throttle_status('ci-smoke:post-deploy')` still answers (the D-65 smoke test).
- A client-keyed bucket (`loginByEmail`) still records under the key it was given.

`30_create_school_workspace.sql` 64/64 with the new key name.

## 5. End to end

No new journey; the login journey is live-gated (OQ-27).

## 6. Known issues

- Rows already stored under the old salted per-user keys are orphaned and expire on their own (15-minute windows).

## 7. Sign-off

Builder: local gate green. CI: see PR #45.
