# Test Report — F-OP-07 School Settings, Part 6 (danger-zone half)

|         |                                                                                  |
| ------- | -------------------------------------------------------------------------------- |
| Feature | F-OP-07 — School Settings                                                        |
| Part    | 6 — danger zone only (export, archive/unarchive, 30-day deletion); D-211         |
| Spec    | `docs/features/05-operations/F-OP-07-school-settings.md` §4 W8, §9 AC33-39, AC41 |
| PR      | #117                                                                             |
| Status  | **PASS WITH KNOWN ISSUES**                                                       |
| Date    | 2026-09-29                                                                       |
| Run by  | Claude (operations lane)                                                         |

## 1. Scope

**What this Part is.** The owner — and only the owner — can download every record of the school as a zip of CSVs, archive the school (read-only for everyone, restorable for 12 months) and schedule its deletion 30 days out, with a banner on every screen and a cancel button until the date. A daily cron deletes schools whose grace has ended. Pulled forward by the owner on 2026-09-29 ("dont forget to add the account and workspace deletation").

| #    | Criterion                                                       | Covered by                                                                                                              |
| ---- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| AC33 | Admin: every danger action absent or `forbidden`                | pgTAP `48_danger_zone.sql` §1 (admin, teacher, other school's owner; plain UPDATEs); page shows owner-only note         |
| AC34 | Transfer ownership                                              | F-ID-03 Part 7 (#112, D-112) — the danger zone links to it                                                              |
| AC35 | Export zip of CSVs + manifest, any plan                         | `lib/workspace-export.test.ts`, `danger-zone.test.ts`, pgTAP §5 — **synchronous download, no email/7-day link (D-211)** |
| AC36 | Archived: every write read-only, data intact, unarchive ≤ 12 mo | pgTAP §4; `usage.test.ts` (requireWritable), `plans.test.ts` (message)                                                  |
| AC37 | Deletion refused with an active subscription, naming it         | pgTAP §2 (`ACTIVE_SUBSCRIPTION`, `UNPAID_BALANCE`), purge re-check §6; `danger-zone.test.ts`                            |
| AC38 | Scheduled: banner, cancellable, nothing destroyed before        | pgTAP §3 (`NOT_DUE`, rows intact, cancel), §6 (`DELETION_DUE`, purge); `danger-zone-view.test.tsx`                      |
| AC39 | Typed short name, `name_mismatch`                               | pgTAP §2 (`NAME_MISMATCH`, case/space-insensitive match); `danger-zone-view.test.tsx`                                   |
| AC41 | No danger action in fewer than two deliberate steps at 360×800  | `e2e/journeys/danger-zone.spec.ts` (written, not run — see §5)                                                          |

**Out of scope:** module visibility and ID patterns (rest of Part 6), emailed export link and file contents (no email sender / storage bucket), billing stop at period end, account deletion (F-ID-01 Part 7).

**Risk areas:** the purge cascade (every tenant table, other schools untouched, no audit copy of the school), owner-only enforcement in SQL, the replaced `tg_workspaces_guard` / `tg_require_writable` / `switch_workspace`.

## 2. Environment

|                |                                                                           |
| -------------- | ------------------------------------------------------------------------- |
| Commit         | `11cad638`                                                                |
| Branch         | `feat/operations-danger-zone`                                             |
| CI run         | https://github.com/Mahadezz/acadigma-campus/actions/runs/36634943714      |
| Supabase       | CI local stack (plain Postgres + migrations); dev branch **not** migrated |
| Migration head | `20260929213328_danger_zone_review.sql`                                   |
| Node / pnpm    | v24 / 10                                                                  |

## 3. Unit and integration (Vitest, CI run above)

| Suite                   | Result                                        |
| ----------------------- | --------------------------------------------- |
| Whole repo              | 1852 passed, 36 skipped, 0 failed (192 files) |
| `danger-zone.test.ts`   | 13 / 13                                       |
| `danger-zone-view.test` | 5 / 5                                         |
| export zip, purge route | 1 / 1, 3 / 3                                  |

Coverage (CI): all files 85.78 % statements; `packages/db` `danger-zone.ts` 100 % lines; web `danger-zone.ts` view file 92 % statements / 71.4 % branches.

## 4. Database (pgTAP, CI)

`Files=58, Tests=1698, Result: PASS`. `48_danger_zone.sql` 55 / 55; `12_function_grants_invariant.sql` 12 / 12 (adds the service-role-only purge check); `09_tenancy.sql` updated (owner may switch into an archived school, D-211).

## 5. End-to-end

**Not run.** `danger-zone.spec.ts` (3 tests; the mutating one desktop-only on the seeded lapsed school) carries the `E2E_LIVE_SUPABASE` guard; live journeys are skipped in CI until #90 lands, and the shared dev branch does not have this PR's migrations. **Screenshots at 360×800 / 1280×800: not taken** for the same reason (the page reads the new columns). Local `next build` passes; routes `/app/settings/danger`, `/api/settings/export`, `/api/cron/workspaces/purge` build.

## 6. Security checks

Reviews on this diff: security-reviewer (Opus) — no critical/high; its three mediums were fixed (purge re-checks billing; `export_workspace_table` needs an export opened through `log_workspace_export` in the last 10 minutes; D-211 now states that members already inside an archived school keep read-only access) and two lows (cross-site `Sec-Fetch-Site` refusal on the export; purge failure codes mapped to named codes). DB reviewer: added the service-role grant assertion; archive + scheduled deletion may coexist (documented). TypeScript reviewer: export fetch now handles network errors. Ponytail review: duplicate parsing and dead parameter removed.

## 7. Known issues

1. E2E journeys and screenshots not run (see §5).
2. Export is synchronous and holds no file contents; `files.csv` is metadata only.
3. Purge refuses any school with a `files` row (`FILES_PRESENT`) until the files pipeline deletes storage objects.
4. No re-authentication before scheduling a deletion (typed name + owner-only + 30-day cancel window instead).
5. A deleted school's `audit_events` are kept under the 7-year retention — to confirm with PDPA counsel.
6. Archive does not stop billing at period end; it is refused while a paid subscription is live, and there is no cancel-subscription action yet.

## 8. Sign-off

Ready for lead review. Not merged.
