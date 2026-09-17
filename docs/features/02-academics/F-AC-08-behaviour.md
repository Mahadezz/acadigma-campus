# F-AC-08 — Behaviour logs, points and conduct

|                  |                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                                                    |
| Status           | planned                                                                                                                                      |
| Owner branch     | `feat/academics-behaviour`                                                                                                                   |
| Depends on       | F-AC-01 (sections, terms), F-AC-02 (students, guardians), F-AC-10 (parent portal surface), consumed by F-AC-09                               |
| Plan             | `docs/plan/ROADMAP.md` chunk 6                                                                                                               |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §2 (BehaviorLog), §3 features 55–57, §4.5, §5 (conduct score), §6 items 37, 43, §7 Q16 |

## 1. Purpose

Schools run on merits and demerits: a house point for helping, a note for a missing uniform, an escalation for repeated rudeness. This feature is the merit/demerit ledger — a teacher logs an incident in two taps from the class roster, it carries a category and a point value, it is scoped to the **academic term** (PRODUCT-DECISIONS 2.13), it appears on the student's profile and — when the teacher marks it parent-visible — in the parent portal, and it rolls into a per-term **conduct score** and a **leaderboard** that resets with the term. It is also the third of the four inputs to the risk score (F-AC-09). "Done": a class teacher logs a positive and a negative in under fifteen seconds from the roster, the parent sees only the notes the teacher chose to share, and the term leaderboard is correct over the whole term rather than over "the most recent 200 rows".

**Base44 intent vs reality.** `BehaviorLog` was one of the few entities with a tenant field and RLS, but the UI **never set `class_id`** even though the schema had it, denormalised `student_name`/`logged_by_name` into every row, and computed the conduct score and leaderboard client-side over **only the latest 200 logs, all-time** — so scores silently became wrong the moment log 201 existed, and a term never reset anything. **Nobody was notified** of any incident: no email, no notification, no link from the log to the student profile, the report card or the parent. The incident's only downstream effect was as a penalty term in risk scoring. There was no category management, no severity, no escalation, no follow-up and no way for a parent to ever know.

## 2. Roles and permissions

| Action                                       | Permission key               | owner | admin | teacher                                                     | staff | parent                                   | platform |
| -------------------------------------------- | ---------------------------- | ----- | ----- | ----------------------------------------------------------- | ----- | ---------------------------------------- | -------- |
| View a student's behaviour log               | `behaviour.read`             | yes   | yes   | class teacher + teachers of that student's section_subjects | yes   | own children, `parent_visible` rows only | no       |
| View the school-wide feed                    | `behaviour.read_all`         | yes   | yes   | no                                                          | yes   | no                                       | no       |
| Log an incident                              | `behaviour.write`            | yes   | yes   | yes (for students in sections they teach)                   | no    | no                                       | no       |
| Edit / delete own log within the edit window | `behaviour.write_own`        | yes   | yes   | author only                                                 | no    | no                                       | no       |
| Edit / delete any log                        | `behaviour.write_any`        | yes   | yes   | no                                                          | no    | no                                       | no       |
| Toggle parent visibility on a log            | `behaviour.share`            | yes   | yes   | author (before the parent has seen it)                      | no    | no                                       | no       |
| Add a follow-up / resolution note            | `behaviour.followup`         | yes   | yes   | author + class teacher                                      | no    | no                                       | no       |
| Manage categories and point defaults         | `behaviour.policy.write`     | yes   | yes   | no                                                          | no    | no                                       | no       |
| View the conduct leaderboard                 | `behaviour.leaderboard.read` | yes   | yes   | class teacher (own sections)                                | yes   | no                                       | no       |
| Escalate to admin                            | `behaviour.escalate`         | yes   | yes   | yes                                                         | no    | no                                       | no       |

A teacher can log against any student they teach; only the author (within the window) and admins can change a log afterwards, because a behaviour record is a semi-formal document about a child.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table.

**`behaviour_categories`** — per school, so the seven hardcoded values in the prototype become editable: `name text` ("Helpfulness", "Homework not done", "Uniform", "Punctuality", "Class participation", "Property damage"), `type behaviour_type` (`positive|negative`), `default_points int`, `severity behaviour_severity` (`low|medium|high`), `requires_followup bool default false`, `auto_notify_parent bool default false`, `colour text`, `icon text`, `sort int`, `is_active bool`.
Index: `unique (workspace_id, name)`. Seeded with a 12-row BD-school default set.

**`behaviour_logs`** — `student_id`, `enrollment_id` (so the log is pinned to the section the student was in — the prototype never set `class_id` at all), `section_id` (denormalised), `academic_year_id`, `term_id` (**the term scoping PRODUCT-DECISIONS 2.13 requires**), `category_id`, `type behaviour_type` (snapshotted from the category at write time so a later category edit cannot flip a log's sign), `points int` (stored positive, signed at read time by `type`), `occurred_on date`, `occurred_period_no int null`, `description text`, `location text null`, `logged_by uuid references workspace_members`, `parent_visible bool default false`, `parent_seen_at timestamptz null`, `severity behaviour_severity`, `status behaviour_status` (`open|acknowledged|followed_up|resolved|retracted`), `escalated_to uuid null`, `escalated_at timestamptz null`, `retracted_reason text null`, `edit_window_ends_at timestamptz`.
Indexes: `index (workspace_id, student_id, occurred_on desc)`, `index (workspace_id, term_id, type)`, `index (workspace_id, section_id, occurred_on desc)`, partial `index (workspace_id, status) where status = 'open'`.
**No denormalised names.** `student_name` and `logged_by_name` are joined, not copied — the prototype's copies went stale the moment a name was corrected.

**`behaviour_followups`** — the conversation after the incident: `behaviour_log_id`, `body text`, `kind followup_kind` (`note|parent_contacted|detention|counselling|resolved`), `author_id`, `contact_log_id uuid null` (links to the messaging module's contact log when a parent was phoned), `created_at`.
Index: `index (workspace_id, behaviour_log_id)`.

**`behaviour_term_scores`** (materialised, refreshed by trigger + nightly reconcile): `student_id`, `term_id`, `academic_year_id`, `section_id`, `positive_points int`, `negative_points int`, `net_points int`, `log_count int`, `band conduct_band` (`excellent|good|satisfactory|needs_improvement`), `section_rank int null`, `updated_at`.
Index: `unique (student_id, term_id)`, `index (workspace_id, term_id, net_points desc)`.

**Enums**: `behaviour_type`, `behaviour_severity`, `behaviour_status`, `followup_kind`, `conduct_band`.

**RLS in words.** `behaviour_categories`: read by all active members; write by owner/admin. `behaviour_logs`: SELECT for owner/admin/staff across the workspace; for a **teacher**, only logs whose `section_id` is a section they teach (class teacher or any `section_subjects` row) — a teacher in the other wing has no business reading a child's conduct record; for a **parent**, only rows where `app.is_guardian_of(student_id)` **and** `parent_visible = true` **and** `status <> 'retracted'`. INSERT by owner/admin/teacher with a check that the teacher teaches the student's section and that `occurred_on` is within `behaviour.backdate_limit_days` (default 14). UPDATE/DELETE by owner/admin, or by the author while `now() < edit_window_ends_at` **and** `parent_seen_at is null`; a retraction is an UPDATE to `status='retracted'` with a reason, never a hard delete once a parent has seen it. `behaviour_followups`: read follows the parent log's policy **except** that follow-ups are never parent-visible in v1 (they are staff notes); write by the author, the class teacher and admins. `behaviour_term_scores`: read by owner/admin/staff and by class teachers for their own sections; written only by the trigger/job (service role). `workspace_id` immutable everywhere.

**Private files.** None in v1. If a school attaches evidence (a photo of damage), it goes through `files` with `visibility='private'` and admin-only access — flagged in §11.

## 4. Workflows

**4.1 Log an incident (the two-tap path).**
_Trigger:_ from the class roster (long-press a student → "Log behaviour"), from the student profile, from the attendance roll-call row's overflow, or the `/app/behaviour` FAB.
_Steps:_ a bottom sheet pre-filled with the student and today's date. Two big segmented buttons — **Positive** / **Negative** — then a grid of category chips, each showing its default points ("Helpfulness +2"). Tapping a chip fills type, points and severity; points are adjustable with a compact stepper. An optional one-line description. A **"Share with parent"** toggle defaulted from the category's `auto_notify_parent`. Save.
_Outcome:_ one `behaviour_logs` row pinned to the student's current enrollment, section and **term**; `behaviour_term_scores` updated by trigger in the same transaction.
_Notifications:_ `behaviour.logged` to the class teacher (so they always know what happened in their homeroom, even when a subject teacher logged it); `behaviour.shared` to guardians **only** when `parent_visible = true`; `behaviour.escalated` to admins when severity is `high` or the category requires follow-up.
_Audit:_ `behaviour.logged` with the category and points.
_Failures:_ a teacher logging against a student they do not teach → refused by permission and RLS; `occurred_on` more than 14 days back → `BACKDATE_LIMIT`; an inactive category → the chip is absent.

**4.2 Share with a parent after the fact.** The author (within the window) or an admin can toggle `parent_visible`. Turning it **on** notifies guardians and stamps the log. Turning it **off** is possible only before `parent_seen_at` is set; afterwards the log can only be **retracted** with a reason, which hides it from the parent and leaves an audit trail. Audit `behaviour.shared` / `behaviour.unshared` / `behaviour.retracted`.

**4.3 Follow-up and resolution.**
_Trigger:_ a log with `requires_followup` or severity `high` appears on `/app/behaviour?tab=open`.
_Steps:_ the class teacher or an admin adds a follow-up — a note, "parent contacted" (which offers to create a `contact_log` entry in the messaging module per PRODUCT-DECISIONS 6.7), detention, counselling — and finally marks it `resolved`.
_Outcome:_ status moves `open → acknowledged → followed_up → resolved`; the open-items badge clears.
_Notifications:_ `behaviour.followup` to the original author so they know it was handled.
_Audit:_ `behaviour.followup.added`, `behaviour.resolved`.
_Failures:_ resolving without a follow-up on a `requires_followup` category → `FOLLOWUP_REQUIRED`.

**4.4 Escalate.** Any teacher can escalate a log to an admin with a note; `escalated_to` and `escalated_at` are set and the admin is notified. Escalation does not change the points.

**4.5 Conduct score and leaderboard.**
_Trigger:_ `/app/behaviour?tab=leaderboard`, the section detail page, and the student profile chip.
_Steps:_ shows the **current term** by default with a term switcher and an "All year" toggle (PRODUCT-DECISIONS 2.13: per term, with an all-time view available). Top positives, most-improved (term-over-term delta) and a per-section table.
_Outcome:_ the numbers come from `behaviour_term_scores`, computed in SQL over **every** log in the term — not a client-side pass over the latest 200 rows.

**4.6 Parent view.** `/family/[childId]?tab=behaviour` shows only shared, non-retracted logs, newest first, as cards: date, category, type icon, points, the teacher's description and who logged it. Opening the tab stamps `parent_seen_at`. There is no leaderboard, no rank and no other child's data.

**4.7 Categories setup.** `/app/settings/academics/behaviour` — seed the default 12, edit names, points, severity, colour, `auto_notify_parent` and `requires_followup`. Deactivating a category keeps historical logs intact (they store `type` and `points` themselves).

**4.8 Phone specifics.** The logging sheet is designed for one hand in a corridor: the Positive/Negative segmented control and the category chip grid occupy the lower two-thirds of the sheet, the description is a single optional line, and Save is sticky at the bottom. Nothing requires a scroll to complete the common case.

## 5. Business rules and calculations

1. **Term scoping.** Every log stores `term_id`, resolved at write time from `occurred_on` (the term whose inclusive date range contains it). A log falling in a vacation gap attaches to the nearest preceding term and is flagged `out_of_term` in the UI.
2. **Signed points.**

```
signed_points(log) = +points  when type = 'positive'
                   = -points  when type = 'negative'
```

`points` is always stored positive (1–10, default from the category); the sign lives in `type`, snapshotted at write time so editing a category later cannot silently flip old logs. 3. **Conduct score per term** (the correct version of the prototype's client-side sum):

```
positive_points(student, term) = Σ points where type = 'positive' and status <> 'retracted'
negative_points(student, term) = Σ points where type = 'negative' and status <> 'retracted'
net_points(student, term)      = positive_points - negative_points
```

Computed in SQL over **all** logs in the term. Retracted logs are excluded everywhere, including from history. 4. **Conduct bands** (school-configurable thresholds; defaults keep the prototype's bands but make them term-relative):

```
net >= 20  -> excellent
net >=  5  -> good
net >=  0  -> satisfactory
net <   0  -> needs_improvement
```

5. **Leaderboard rank** in SQL, never in the browser:

```sql
rank() over (partition by section_id, term_id order by net_points desc, positive_points desc, log_count asc)
```

Standard competition ranking (1, 2, 2, 4). A school-wide leaderboard uses the same expression partitioned by `term_id` only. Students with no logs in the term have `net_points = 0` and are included — a child with no incidents is not "unranked". 6. **Most improved** = `net_points(term N) − net_points(term N−1)`, computed only for students present in both terms. 7. **Risk input** (consumed by F-AC-09): `behaviourPoints(student, term)` exposes `net_points`, `negative_count` and `log_count`, computed over logs where `status <> 'retracted' and status <> 'resolved'` — **a resolved entry stops contributing to the risk score** the moment it is marked resolved (§4.3), even though it stays visible on the student's history and still counts toward the term leaderboard/conduct score in §5.3, which is a different purpose (a full, honest record of the term) from risk triage (what still needs attention). The normalisation into a 0–100 risk component lives in F-AC-09 §5, not here. 8. **Edit window.** `edit_window_ends_at = created_at + behaviour.edit_window_hours` (default 24). Inside it the author may edit or delete, **but only while `parent_seen_at is null`** — once a parent has read a note about their child, the record can only be retracted with a reason, never rewritten. 9. **Backdating** is limited to `behaviour.backdate_limit_days` (default 14) for teachers; admins are unlimited and every backdated log is stamped and audited. 10. **Parent visibility** requires all of: `parent_visible = true`, `status <> 'retracted'`, an active guardian link, and the log's student. Four conditions, all in RLS, mirroring F-AC-07. 11. **Notification budget.** At most one `behaviour.shared` per log per guardian; when more than three shared logs land for one child in a day they collapse into a single `behaviour.digest`. The class teacher receives at most one `behaviour.logged` digest per section per hour. 12. **Rollup maintenance.** `behaviour_term_scores` is upserted by an `after insert/update/delete` statement trigger on `behaviour_logs`; a nightly job recomputes the current term from scratch and logs any drift. Same pattern as F-AC-03's attendance rollup, for the same reason: the leaderboard must be correct at log 2,001, not just at log 200. 13. **Timezone.** `occurred_on` is a `date` in the school timezone; "today" in the logging sheet is computed server-side. 14. **Retention and annual review-and-clear.** `behaviour_logs` are retained for the academic year plus 3 years. Each year an owner/admin runs a documented **annual review-and-clear** pass (`/app/settings/academics/behaviour` → "Annual review") over the previous year's logs: every open or acknowledged log past the year boundary is surfaced for a decision — mark `resolved` with a note, or leave open for a documented reason — so nothing ages out of review silently. This is the fix for "no decay": before this rule, an old negative log kept weighing on the risk score indefinitely within its term; now a school has an explicit, once-a-year checkpoint to close out what should be closed, and §5's rule 7 ensures a resolved log immediately stops weighing on risk rather than waiting for the next annual pass.

## 6. UI

| Screen                | Route                               | 360×800                                                                                                                                     | ≥1024                                         | Primary action      | Empty                              | Loading          | Error                                 |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------- | ---------------------------------- | ---------------- | ------------------------------------- |
| Behaviour feed        | `/app/behaviour`                    | Virtualised cards (student, category chip, points, teacher, date); filter chips (My sections · Positive · Negative · Open · This term)      | Table + left filter rail + right detail panel | Log behaviour (FAB) | "No behaviour logs this term"      | 6 skeleton cards | Retry banner                          |
| Log sheet             | sheet, from anywhere                | Positive/Negative segmented control, category chip grid with points, stepper, one-line description, "Share with parent" toggle, sticky Save | Dialog, two columns                           | Save                | n/a                                | Button spinner   | Field errors; sheet content preserved |
| Open items            | `/app/behaviour?tab=open`           | Cards with a severity ribbon and "Add follow-up"                                                                                            | Table with a status column                    | Add follow-up       | "Nothing open"                     | Skeleton         | Retry                                 |
| Leaderboard           | `/app/behaviour?tab=leaderboard`    | Term switcher + top-10 cards with net points and band chips; "All year" toggle                                                              | Per-section table + most-improved panel       | Switch term         | "No logs in this term"             | Skeleton         | Retry                                 |
| Student behaviour tab | `/app/students/[id]?tab=behaviour`  | Net-points chip + band, then the log list with share state                                                                                  | Two-column: summary + timeline                | Log behaviour       | "No behaviour logs"                | Skeleton         | Retry                                 |
| Parent behaviour tab  | `/family/[childId]?tab=behaviour`   | Shared logs only, newest first, as cards                                                                                                    | Same, two columns                             | none (read-only)    | "No notes shared yet"              | Skeleton         | Retry                                 |
| Categories settings   | `/app/settings/academics/behaviour` | Grouped list (positive/negative) with point steppers and toggles                                                                            | Table with inline edit                        | Add category        | "Use the default set" one-tap seed | Skeleton         | Field errors                          |

`packages/ui`: `SegmentedControl`, `CategoryChipGrid`, `PointStepper`, `BandChip`, `TimelineList`, `SeverityRibbon`, `ShareToggle`, `FilterChips`, `EmptyState`, `ConfirmSheet`.

## 7. Server contracts

| Action / handler                                    | Input schema (Zod)                                                                                                                      | Output                               | Errors                                                                                              | Idempotency                         | Rate limit |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------- |
| `logBehaviour`                                      | `LogBehaviourInput` {studentId, categoryId, points?, occurredOn, occurredPeriodNo?, description?, location?, parentVisible?, severity?} | `BehaviourLog` + updated `termScore` | `NOT_TEACHING_STUDENT`, `BACKDATE_LIMIT`, `CATEGORY_INACTIVE`, `POINTS_OUT_OF_RANGE`, `YEAR_CLOSED` | key required                        | 600/h      |
| `updateBehaviourLog`                                | `UpdateBehaviourLogInput` {logId, points?, description?, occurredOn?, severity?}                                                        | `BehaviourLog`                       | `EDIT_WINDOW_CLOSED`, `PARENT_ALREADY_SEEN`, `NOT_AUTHOR`                                           | —                                   | 300/h      |
| `setBehaviourVisibility`                            | `SetVisibilityInput` {logId, parentVisible}                                                                                             | `BehaviourLog`                       | `PARENT_ALREADY_SEEN` (when turning off)                                                            | key required                        | 300/h      |
| `retractBehaviourLog`                               | `RetractLogInput` {logId, reason}                                                                                                       | `BehaviourLog`                       | `REASON_REQUIRED`, `ALREADY_RETRACTED`                                                              | key required                        | 120/h      |
| `addBehaviourFollowup`                              | `FollowupInput` {logId, kind, body, createContactLog?: boolean}                                                                         | `BehaviourFollowup`                  | `LOG_RETRACTED`                                                                                     | key required                        | 300/h      |
| `resolveBehaviourLog`                               | `ResolveLogInput` {logId, note?}                                                                                                        | `BehaviourLog`                       | `FOLLOWUP_REQUIRED`                                                                                 | —                                   | 300/h      |
| `escalateBehaviourLog`                              | `EscalateInput` {logId, toMemberId?, note}                                                                                              | `BehaviourLog`                       | `ALREADY_ESCALATED`                                                                                 | key required                        | 120/h      |
| `upsertBehaviourCategory`                           | `BehaviourCategoryInput` {id?, name, type, defaultPoints, severity, requiresFollowup, autoNotifyParent, colour, icon}                   | `BehaviourCategory`                  | `NAME_TAKEN`, `TYPE_CHANGE_FORBIDDEN` (when logs exist)                                             | —                                   | 60/h       |
| `seedBehaviourCategories`                           | `{}`                                                                                                                                    | `{created: number}`                  | `ALREADY_SEEDED`                                                                                    | key on (workspace,'behaviour-seed') | 3/h        |
| `updateBehaviourPolicy`                             | `BehaviourPolicyInput` {editWindowHours, backdateLimitDays, bands: {excellent, good, satisfactory}}                                     | `SchoolProfile`                      | `BANDS_NOT_ORDERED`                                                                                 | —                                   | 60/h       |
| `GET /api/behaviour`                                | `BehaviourQuery` {studentId?, sectionId?, termId?, type?, status?, cursor?, limit ≤ 50}                                                 | `Page<BehaviourLogCard>`             | —                                                                                                   | —                                   | 1200/h     |
| `GET /api/behaviour/leaderboard`                    | `LeaderboardQuery` {termId?, sectionId?, scope: 'section'\|'school', limit ≤ 50}                                                        | `LeaderboardRow[]`                   | —                                                                                                   | —                                   | 600/h      |
| `markBehaviourSeenByParent` (parent)                | `{logIds: string[]}`                                                                                                                    | `{updated: number}`                  | `FORBIDDEN`                                                                                         | —                                   | 600/h      |
| `recomputeBehaviourTermScores` (cron, service role) | `{termId?}`                                                                                                                             | `{updated: number, drift: number}`   | —                                                                                                   | idempotent                          | 1/night    |

Exported selector for F-AC-09: `behaviourPoints(ctx, {studentIds, termId})` → `{studentId, netPoints, negativeCount, logCount}`, excluding `retracted` and `resolved` logs per §5 rule 7.

## 8. Parts (build chunks)

**Part 1 — Categories and the log** · `behaviour_categories` + BD default seed, `behaviour_logs` with term resolution and enrollment/section pinning, enums, RLS (teacher-teaches-the-section read and write; four-condition parent policy), the two-tap logging sheet reachable from the roster and the student profile · tests: pgTAP isolation/escalation, a teacher of another wing can neither read nor write, backdate limit, term resolution across a term boundary and a vacation gap · **Demo:** a teacher logs "+2 Helpfulness" from the class roster in two taps; a teacher from another section cannot see it.

**Part 2 — Feed, edit window, retraction and sharing** · behaviour feed with server-side filters, edit window with the parent-seen guard, `setBehaviourVisibility`, retraction with a reason, `behaviour.logged` / `.shared` notifications with the §5.11 budget, parent-seen stamping · tests: integration proving a log cannot be rewritten after a parent has seen it and can only be retracted; notification-budget tests · **Demo:** share a note with a parent, watch it appear in the portal, then try to edit it and be offered retraction instead.

**Part 3 — Follow-ups, escalation and open items** · `behaviour_followups`, the open-items tab, `requires_followup` enforcement, escalation to admins, contact-log hand-off to the messaging module, `behaviour.followup` / `.escalated` notifications · tests: `FOLLOWUP_REQUIRED` enforcement; contact-log creation · **Demo:** a high-severity incident appears on the admin's open list; the class teacher records "parent contacted" with a contact-log entry and resolves it.

**Part 4 — Term scores, bands and leaderboard in SQL** · `behaviour_term_scores` with its statement trigger and nightly reconcile, SQL `rank()` leaderboard per section and school-wide, configurable bands, most-improved, the profile chip and section summary · tests: a 2,500-log fixture asserting the score is correct well past the prototype's 200-row ceiling; rank ties; retracted logs excluded; zero drift after a randomised operation sequence · **Demo:** the term leaderboard is correct in a school with 2,500 logs, and switching to the next term resets it to zero while "All year" still shows the total.

## 9. Acceptance criteria

1. **Given** a teacher who teaches Class 6 – A on a 360×800 phone, **when** they long-press a student in the roster and tap "Positive → Helpfulness", **then** a log exists with `points = 2`, `type = 'positive'`, the student's current `enrollment_id`, `section_id` and the **current term**, created in two taps plus Save.
2. **Given** a teacher who teaches no section containing that student, **when** they call `logBehaviour`, **then** both the permission check and RLS refuse it.
3. **Given** a log with `occurred_on` 20 days in the past and a 14-day limit, **when** a teacher saves it, **then** it is refused with `BACKDATE_LIMIT`; **when** an admin saves it, **then** it succeeds and the audit event records the backdating.
4. **Given** a log not marked parent-visible, **when** the parent loads the behaviour tab, **then** it is absent — proved by a pgTAP negative test.
5. **Given** the same log shared afterwards, **when** the parent loads the tab, **then** it appears, `parent_seen_at` is stamped, and exactly one `behaviour.shared` notification was sent.
6. **Given** a log a parent has seen, **when** the author tries to edit it or to turn sharing off, **then** both are refused with `PARENT_ALREADY_SEEN` and Retract (with a reason) is offered instead.
7. **Given** a retracted log, **when** any conduct score, leaderboard, parent view or risk input is computed, **then** it contributes nothing — and the audit trail still shows it existed and why it was retracted.
8. **Given** a student with +12 positive and −5 negative points in the current term, **when** the term score is computed, **then** `net_points = 7` and the band is `good`.
9. **Given** a school with 2,500 behaviour logs in a term, **when** the leaderboard loads, **then** every log is counted — the result is identical to a full recomputation, and no client-side 200-row window exists anywhere.
10. **Given** four students with net points 24, 18, 18, 9 in a section, **when** the leaderboard ranks them, **then** ranks are 1, 2, 2, 4, produced by SQL `rank()`.
11. **Given** a new term begins, **when** the leaderboard loads with the default term selection, **then** every student starts at 0, and the previous term's totals are still reachable via the term switcher and the "All year" toggle.
12. **Given** a student with no logs in the term, **when** the leaderboard renders, **then** they appear with `net_points = 0` rather than being omitted.
13. **Given** a category whose `requires_followup` is true, **when** an admin attempts to resolve the log with no follow-up recorded, **then** it is refused with `FOLLOWUP_REQUIRED`.
14. **Given** a category renamed and its default points changed, **when** an old log is displayed, **then** it still shows its own stored `type` and `points` — a category edit never rewrites history.
15. **Given** four shared logs for one child on the same day, **when** notifications are dispatched, **then** the guardian receives one `behaviour.digest`, not four.
16. **Given** two workspaces, **when** a member of workspace A queries behaviour logs or the leaderboard, **then** no row from workspace B is returned.
17. **Given** a parent, **when** they request another family's child's shared log by id, **then** RLS returns nothing.

## 10. Tests

- **Unit (`packages/domain`)**: `signedPoints`, `conductBand(net, thresholds)` at every boundary, `netPoints` with retractions, `termForDate(occurredOn, terms, tz)` including vacation gaps, `editWindowOpen(createdAt, parentSeenAt, policy)`, `backdateAllowed(role, occurredOn, today, limit)`, `mostImproved`, `notificationBudget`.
- **DB (pgTAP)**: isolation and escalation on `behaviour_logs`, `behaviour_followups`, `behaviour_term_scores`, `behaviour_categories`; the teacher-teaches-the-section read policy (positive for the class teacher and a subject teacher, negative for an unrelated teacher); the four-condition parent policy with each condition negated in turn; the author edit-window policy and the parent-seen guard; retraction semantics; the rollup trigger after insert, update, retract and delete; `workspace_id` immutability.
- **Integration**: every action's happy path and named errors; `logBehaviour` updating the term score in the same transaction; `retractBehaviourLog` removing the points from the leaderboard; `recomputeBehaviourTermScores` reporting zero drift after a randomised sequence of 1,000 operations.
- **E2E (360×800 and 1280×800, axe)**: `log-behaviour-two-taps`, `share-then-retract`, `leaderboard-term-reset`, `parent-sees-shared-only`. Axe clean on the feed, the logging sheet and the parent tab.
- **Performance budgets**: behaviour feed p95 < 300 ms at 10,000 logs (cursor-paginated, server-filtered); leaderboard for a 2,000-student school < 400 ms (reads the rollup, not the logs); `logBehaviour` p95 < 250 ms including the rollup upsert; nightly reconcile < 30 s per workspace.

## 11. Open questions

1. **Evidence attachments** (a photo of damaged property, a screenshot). Not in v1. Assumed: if added, files are `visibility='private'`, admin-only, never parent-visible, and covered by `file_access_log` — safeguarding makes this a deliberate decision, not a default.
2. **House / team points.** Many BD English-medium schools run houses. Assumed out of scope for v1; `students.house` plus a grouped leaderboard would be additive and is flagged for the owner.
3. **Whether points should feed anything besides risk and the leaderboard** (e.g. a conduct grade on the report card). Assumed no for v1 — PRODUCT-DECISIONS 6.6 lists the report-card contents and conduct is not among them. A `report_card.show_conduct` flag would be a small F-AC-06 change.
4. **Automatic escalation thresholds** ("3 negative logs in a week → notify admin"). Assumed manual in v1; the data supports a rule engine later, and F-AC-09's risk flag already covers the serious case.
5. **Default category set.** The 12 seeded categories are a reasonable BD-school starting point; the owner should review the negative ones (particularly anything touching bullying, which may warrant a separate safeguarding flow rather than a points entry) before launch, since their wording appears in a parent-facing notification.
6. **Should follow-ups ever be parent-visible?** v1 says no (they are staff notes). Flagged: schools that record "parent contacted" may want the parent to see that it happened.
