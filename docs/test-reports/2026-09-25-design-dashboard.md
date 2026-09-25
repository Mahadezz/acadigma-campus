# Test Report — Design D-400, the school "today" dashboard + nav without dead links

|         |                                                                                   |
| ------- | --------------------------------------------------------------------------------- |
| Feature | Design lane (4) — school dashboard (D-400)                                        |
| Part    | Owner/admin dashboard from real data; nav hides unimplemented routes              |
| Spec    | `DECISION-LOG.md` D-400; `DESIGN-SYSTEM.md` §8.2 wireframe 2 ("What ships first") |
| PR      | #41                                                                               |
| Status  | **PASS WITH KNOWN ISSUES**                                                        |
| Date    | 2026-09-25                                                                        |
| Run by  | Claude (design lane builder)                                                      |

---

## 1. Scope

**What this Part is.** `/app/dashboard` stops being a developer debug card ("Workspace resolved … workspace &lt;uuid&gt;") and becomes the school's "today" page, built only from data that exists: the school's letterhead name (F-OP-07) or workspace name, plan and trial days left, the read-only state, active members by role, the staff-directory count, a setup checklist, and the last five audit events for roles with `audit.read`. Attendance and exam results are real empty-state slots. Teachers and office staff get a lighter view. English and Bengali.

Also (coordinator bug hunt, HIGH): the school shell's sidebar and bottom nav linked to 14 routes with no page, so every signed-in page prefetched a string of 404s. `apps/web/lib/implemented-routes.ts` now lists the nav destinations that have a page, and the shell hides every other item. The nav configs are unchanged, so each item appears when its Part adds its page to the list. The owner's "School settings" item now points to `/app/settings` (the F-OP-07 settings home; `/app/settings/workspace` does not exist, D-201).

| What                                                                                                                          | Covered by                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Setup checklist order, done-ness from facts, nav hrefs                                                                        | `packages/domain/src/dashboard/index.test.ts`                                             |
| Trial days counted on the school's calendar (0 / negative)                                                                    | same                                                                                      |
| Counts are head-only, workspace-scoped, active members only; staff = active + on notice; fails closed                         | `packages/db/src/repositories/dashboard.test.ts`                                          |
| Owner view, teacher view, read-only chip, empty slots with no numbers, checklist hides when complete, unlinked steps, Bengali | `apps/web/app/(school)/app/dashboard/dashboard-view.test.tsx`                             |
| Registry ⇄ page.tsx both ways; nav shows real pages only                                                                      | `apps/web/lib/implemented-routes.test.ts`                                                 |
| Owner and teacher journeys + axe                                                                                              | `e2e/journeys/school-dashboard.spec.ts` (live, skip-gated like the other seeded journeys) |
| Shell nav journey updated for hidden items                                                                                    | `e2e/journeys/school-shell-nav.spec.ts`                                                   |

**Out of scope:** F-TE-07 analytics views, the teacher "NOW" period card (needs F-AC-05), real academic-year and student facts for the checklist (their tables do not exist; both steps stay "to do").

## 2. Environment

|             |                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch      | `feat/design-owner-dashboard`, merged with `origin/main` @ `d60d15d` (screenshots taken at `c4085ff`; no dashboard or nav code changed in the merge) |
| Supabase    | live project, read-only as the demo owner (Acadigma Demo School); no writes                                                                          |
| Server      | local `next start` of this branch (after); production campus.acadigma.com (before)                                                                   |
| Node / pnpm | v24.19.0 / 10.34.5                                                                                                                                   |

## 3. Unit (Vitest)

Full `pnpm test`: **85 files, 979 tests, all passed** (after merging `origin/main` @ `d60d15d` and the PR #41 review fixes). New: domain dashboard 8 (incl. "academic year needs a current year and classes" and the curated-audit filter), db dashboard repository 5 (file coverage 93.3 % lines / 82.1 % branches / 100 % functions; incl. "a settings read error is an error, not a default"), dashboard view 7, implemented routes 4.

## 4. Database (pgTAP)

Not applicable — no migration, no new function or grant. Every read goes through existing RLS (`workspace_members_select`, `workspaces_select`, `staff_directory`, `audit_events_view`).

## 5. End to end and accessibility

Screenshots and axe (WCAG 2.1 A/AA, `@axe-core/playwright`), signed in once as the demo owner, view-only. After-shots retaken after the review fixes; the script also checked the page text for raw table names ("a profiles record") — none. The "404s" column lists every 404 response seen while loading the page.

| Screen                  | Viewport | axe violations | 404 responses                                                                                                                                              | UUID on screen |
| ----------------------- | -------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| before (production), en | 360      | none           | /app/attendance /app/messages /app/students                                                                                                                | **yes**        |
| before (production), en | 1280     | none           | 14 routes: marks, exams, classes, curriculum, timetable, assignments, lessons, staff/attendance, students, messages, attendance, staff, staff/team, hiring | **yes**        |
| after (this branch), en | 360      | none           | none                                                                                                                                                       | no             |
| after (this branch), en | 1280     | none           | none                                                                                                                                                       | no             |
| after (this branch), bn | 360      | none           | none                                                                                                                                                       | no             |
| after (this branch), bn | 1280     | none           | none                                                                                                                                                       | no             |

The live Playwright journeys (`school-dashboard.spec.ts`, `school-shell-nav.spec.ts`) need the seeded `owner@`/`teacher@acadigma.test` accounts, which are not in the live project (OQ-27); they are skip-gated and were not run locally.

### Screenshots

|                     | 360 × 800                                                                                                          | 1280 × 800                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Before (production) | [viewport](assets/d400/before-dashboard-en-360x800.png) · [full](assets/d400/before-dashboard-en-360x800-full.png) | [viewport](assets/d400/before-dashboard-en-1280x800.png) |
| After, English      | [viewport](assets/d400/after-dashboard-en-360x800.png) · [full](assets/d400/after-dashboard-en-360x800-full.png)   | [viewport](assets/d400/after-dashboard-en-1280x800.png)  |
| After, Bengali      | [viewport](assets/d400/after-dashboard-bn-360x800.png) · [full](assets/d400/after-dashboard-bn-360x800-full.png)   | [viewport](assets/d400/after-dashboard-bn-1280x800.png)  |

## 6. Performance

`check-bundle-budget.mjs` passes. The dashboard runs 10 queries in one `Promise.all` (workspace, school profile, staff count, current academic year, grade levels, five role counts) plus the audit page for owners; every count is `head: true`, so no rows are transferred.

## 7. Security

No write path. Counts run under the caller's RLS; the audit list goes through the existing `listAuditEvents` behind `can(role, "audit.read")`, the same gate `/app/audit` uses. No UUID, email or table name is rendered (checked on every after-screenshot).

## 8. Known issues

| #   | Issue                                                                                                                                                                                                                                                                                                                                  | Severity | Ship anyway?                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| 1   | Recent activity shows curated sentences only; for a quiet school that is mostly "signed in". The generic `<table>.<op>` rows (e.g. "updated a profiles record ()") are left to `/app/audit`, where the viewer still renders them with a raw table name and empty "()" — flagged to the F-ID-09 owner.                                  | low      | yes                                                                           |
| 2   | At 360 px the top bar's subtitle ("Signed in as owner", now translated) truncates next to the workspace switcher; the logo is mark-only on phones. The demo school shows "0 of 5" because it was provisioned before the wizard existed and has no academic year or classes — a school created through the wizard shows that step done. | low      | yes                                                                           |
| 3   | The live journeys cannot run until seeded accounts exist in the live project (OQ-27).                                                                                                                                                                                                                                                  | medium   | yes — unit and view tests cover the logic; axe was run on the real page above |
| 4   | Two throwaway accounts from the D-68 Part remain in the live project: `design-shots-d68@acadigma.test`, `design-shots-d68-wizard@acadigma.test`. There is no account-deletion path in the product yet, so they are listed here for the owner to delete in the Supabase dashboard.                                                      | low      | yes                                                                           |
| 5   | The demo login was throttled ("Too many attempts") for about 15 minutes after my first scripted runs (several sign-ins in a row); screenshots were retaken with one sign-in per run.                                                                                                                                                   | low      | n/a                                                                           |

## 9. Sign-off

| Definition of Done                              | Met                                      |
| ----------------------------------------------- | ---------------------------------------- |
| Decision written (D-400) and design doc updated | ☑                                        |
| Migration + pgTAP                               | n/a                                      |
| Unit tests (domain, repository, view, registry) | ☑                                        |
| UI at 360 and 1280, both languages              | ☑                                        |
| Playwright journeys                             | written; skip-gated on live seed (OQ-27) |
| axe — zero violations on the real page          | ☑                                        |
| This report, real numbers                       | ☑                                        |

> I ran these tests or read their output myself. The numbers above are copied from real runs.
