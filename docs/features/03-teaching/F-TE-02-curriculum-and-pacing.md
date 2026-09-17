# F-TE-02 — Curriculum spine, lesson logs and pacing

|                  |                                                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | teaching                                                                                                                                                                                                                                                         |
| Status           | planned                                                                                                                                                                                                                                                          |
| Owner branch     | `feat/teaching-curriculum`                                                                                                                                                                                                                                       |
| Depends on       | F-AC-02 (grade levels, subjects, academic years) · F-AC-03 (sections, `section_subjects`) · F-AC-06 (timetable) · F-OP-02 (academic calendar / holidays) · F-TE-03 (AI credits — for PDF extraction and the pacing plan) · F-TE-01 (lesson plans link to topics) |
| Plan             | `docs/plan/ROADMAP.md` chunk — teaching, position 3                                                                                                                                                                                                              |
| Base44 reference | `docs/reference/base44-inventory/03-teaching-intelligence.md` §2.2, §2.4, §2.5, §2.6, §3.1(C), §4 rows 3–8, 11c, 14–16, §5.3, §6 "Syllabus completion %" / "Pacing plan capacity", §7 items 29–31, 42–43, §8 Q2–Q4                                               |

## 1. Purpose

This is the feature that makes every other teaching number mean something. A school records **what is supposed to be taught** — a syllabus per grade + subject + academic year, broken into units and topics with an estimated period count — and teachers record **what actually got taught**, one `lesson_logs` row per period. Subtract the two against the timetable and the academic calendar and you get the only question a head of department actually asks: _are we going to finish the syllabus before the exam, and if not, by how much?_

The syllabus is entered three ways: typed, imported from a saved template, or — the path that closes the data-entry gap — **uploaded as a PDF, extracted by Claude into a reviewable table, corrected by a human, then committed**. Nothing an AI extracts becomes curriculum without a person pressing Commit.

**What Base44 intended, and what was broken.** All three pieces existed and **none of them were reachable**. `SyllabusTab.jsx` was the only file in the codebase that could create a `Syllabus` row and it was imported by nothing — so every consumer of the curriculum spine was permanently empty. `LessonLogTab.jsx` (the only code that advanced a topic's status from a log) and `PacingPlanTab.jsx` (the most product-valuable AI feature in the whole export) were likewise dead files. `LessonLog` had no tenant column and no RLS. Consumers disagreed on how a class maps to syllabus rows — `grade_number + subject` in two files, `class_id` in a third. Two unrelated entities were both called "syllabus": `Syllabus` (topic rows) and `SyllabusUpload` (a parked PDF), with **no link between them and no extraction step**, even though the platform's `ExtractDataFromUploadedFile` was already in use over in the marketplace. The pacing planner's output was never persisted — a refresh lost it — and its Generate button was permanently disabled because `pendingTopics.length === 0` always. Its capacity window sliced by _topic count_ while ignoring each topic's `estimated_periods`, so a syllabus of multi-period topics silently over-filled the plan.

**Done looks like:** a syllabus that a real school can enter in one sitting, lesson logging that takes under 30 seconds on a phone at the end of a period, and a pacing view whose "12 topics left, 9 periods left, 3 periods short" is arithmetic over real rows — no model involved. The AI pacing _plan_ (the week-by-week schedule and advice) sits on top of that arithmetic, is optional, costs credits, and is **persisted**.

**Resolution of the inventory's open questions.** Per PRODUCT-DECISIONS 3.2: curriculum is **per grade + subject + academic year**; sections inherit it. `class_id`-scoped syllabi are not built — a section that deviates records the deviation in its lesson logs, not in a private syllabus.

## 2. Roles and permissions

| Action                              | permission key            | owner | admin | teacher                             | staff | parent | platform    |
| ----------------------------------- | ------------------------- | ----- | ----- | ----------------------------------- | ----- | ------ | ----------- |
| View syllabus for a grade+subject   | `syllabus.read`           | ✓     | ✓     | ✓                                   | ✓     | —      | read bypass |
| Create/edit syllabus, units, topics | `syllabus.write`          | ✓     | ✓     | ✓ _(only for a subject they teach)_ | —     | —      | —           |
| Reorder topics                      | `syllabus.write`          | ✓     | ✓     | ✓                                   | —     | —      | —           |
| Publish / lock a syllabus           | `syllabus.publish`        | ✓     | ✓     | —                                   | —     | —      | —           |
| Delete a syllabus                   | `syllabus.delete`         | ✓     | ✓     | —                                   | —     | —      | —           |
| Upload a syllabus document          | `syllabus.write`          | ✓     | ✓     | ✓                                   | —     | —      | —           |
| Run AI extraction                   | `ai.generate` + credits   | ✓     | ✓     | ✓                                   | —     | —      | —           |
| Commit an extraction                | `syllabus.write`          | ✓     | ✓     | ✓                                   | —     | —      | —           |
| Log a lesson                        | `lesson_log.write`        | ✓     | ✓     | ✓ _(section-subjects they teach)_   | —     | —      | —           |
| Edit/delete a lesson log            | `lesson_log.write`        | ✓     | ✓     | own, ≤7 days old                    | —     | —      | —           |
| View pacing for any section-subject | `pacing.read.any`         | ✓     | ✓     | —                                   | ✓     | —      | read bypass |
| View pacing for mine                | `pacing.read.own`         | ✓     | ✓     | ✓                                   | —     | —      | —           |
| Generate an AI pacing plan          | `ai.generate` + credits   | ✓     | ✓     | ✓                                   | —     | —      | —           |
| Manage the templates library        | `syllabus_template.write` | ✓     | ✓     | —                                   | —     | —      | —           |

"Only for a subject they teach" = there exists an active `section_subjects` row with `teacher_id = auth.uid()` and the syllabus's `subject_id`/`grade_level_id`. Enforced in the RLS policy via a helper `app.teaches_subject(workspace_id, subject_id, grade_level_id)`, not only in the app.

## 3. Data

**Proposed; `docs/architecture/DATA-MODEL.md` wins.** Tenant key is `workspace_id` on every table below — Base44 had it on none of them.

### 3.1 `syllabi`

`id`, `workspace_id`, `grade_level_id` → `grade_levels`, `subject_id` → `subjects`, `academic_year_id` → `academic_years`, `title` text not null, `board` text null (e.g. NCTB, Cambridge), `status` enum `syllabus_status` (`draft | published | archived`) default `draft`, `total_estimated_periods` integer generated/maintained by trigger, `source` enum `syllabus_source` (`manual | template | ai_extraction`) default `manual`, `source_document_id` uuid null → `files`, `created_by`, timestamps, `deleted_at`.
Unique `(workspace_id, grade_level_id, subject_id, academic_year_id)` where `deleted_at is null` — one syllabus per grade+subject+year, which is the join rule the prototype could never agree on.

### 3.2 `syllabus_units`

`id`, `workspace_id`, `syllabus_id` (cascade), `unit_number` integer not null, `title` text not null, `description` text null, `position` integer not null, timestamps. Unique `(syllabus_id, position)` deferrable. This is Base44's `chapter_number`/`chapter_title`, promoted from repeated strings on every topic row to a real parent.

### 3.3 `syllabus_topics`

`id`, `workspace_id`, `syllabus_id`, `unit_id` → `syllabus_units` (cascade), `title` text not null, `description` text null, `position` integer not null (order **within the unit**; global teaching order is `(unit.position, topic.position)` — Base44's single global `sequence_order` made unit insertion a renumber of the whole syllabus), `estimated_periods` smallint not null default 1 check > 0, `is_optional` boolean default false, `learning_outcomes` text[] default '{}', timestamps.
Index `(workspace_id, syllabus_id, unit_id, position)`.

**Topic status is deliberately not a column.** In Base44, `Syllabus.status` was `pending|in_progress|completed` per topic — which is wrong once two sections share one syllabus: Class 6-A can finish a topic that 6-B has not started. Coverage is derived **per `section_subject`** from `lesson_logs` (§5.1). A materialised helper view `analytics_topic_coverage` (F-TE-07) provides it.

### 3.4 `lesson_logs`

`id`, `workspace_id`, `section_subject_id` not null → `section_subjects`, `taught_on` date not null, `period_number` smallint null, `lesson_plan_id` uuid null → `lesson_plans`, `syllabus_topic_id` uuid null → `syllabus_topics`, `topic_freetext` text null (for off-syllabus lessons), `coverage` enum `lesson_coverage` (`completed | partial | skipped | revision | assessment`) not null default `completed`, `periods_used` numeric(3,1) not null default 1 check between 0.5 and 8, `notes` text null, `logged_by` uuid not null, `created_at`, `updated_at`.
Constraint: `syllabus_topic_id is not null or topic_freetext is not null`. Unique `(section_subject_id, taught_on, period_number)` where `period_number is not null` — one log per period, so a double-tap cannot double-count load.
Indexes `(workspace_id, section_subject_id, taught_on desc)`, `(workspace_id, syllabus_topic_id)`, `(workspace_id, logged_by, taught_on desc)`.

`periods_used` is `numeric(3,1)` because half-periods are real in BD school timetables; Base44's integer forced a lie.

### 3.5 `syllabus_extractions` (the PDF → review → commit staging table)

`id`, `workspace_id`, `file_id` → `files` (private bucket), `syllabus_id` uuid null (set on commit), `grade_level_id`, `subject_id`, `academic_year_id`, `status` enum `extraction_status` (`uploaded | extracting | review | committed | failed | cancelled`), `ai_generation_id` uuid null → `ai_generations`, `prompt_version` text, `credits_charged` integer null, `raw_output` jsonb null (what the model returned, pre-edit), `draft` jsonb not null default '{}' (the human-edited working copy: `{ units: [{ unit_number, title, topics: [{ title, estimated_periods, description }] }] }`), `page_count` smallint, `error_code` text null, `created_by`, timestamps.

Nothing in `syllabus_extractions` is curriculum. Only `syllabus.commitExtraction` writes `syllabi`/`syllabus_units`/`syllabus_topics`.

### 3.6 `syllabus_templates`

`id`, `workspace_id` **nullable** (null = platform-provided template, visible to every workspace, writable only by platform staff), `title`, `board` text, `grade_level_label` text (a label, not an FK — templates cross workspaces), `subject_label` text, `body` jsonb (same shape as `syllabus_extractions.draft`), `language` text default 'en', `use_count` integer default 0, `created_by`, timestamps. RLS: SELECT where `workspace_id is null or app.has_role(workspace_id, …)`; INSERT/UPDATE on null-workspace rows only for `app.is_platform_admin()`.

### 3.7 `pacing_plans` (AI output, persisted — Base44 threw this away)

`id`, `workspace_id`, `section_subject_id`, `generated_for_start` date, `weeks_count` smallint, `periods_per_week` smallint, `topics_in_scope` uuid[] (the exact topic ids fed to the model), `plan` jsonb (`{ weeks: [{ week_number, starts_on, ends_on, days: [{ date, topic_id?, topic_title, unit_title, notes }], summary }], recommendations: string[] }`), `ai_generation_id`, `prompt_version`, `credits_charged`, `created_by`, `created_at`. No update path; regenerating creates a new row and the view shows the latest.

### 3.8 Read-only inputs

`timetable_slots` _(proposed name; F-AC-06 owns it)_ — `(workspace_id, section_subject_id, weekday, period_number, effective_from, effective_to)`. `academic_calendar_days` _(proposed; F-OP-02)_ — `(workspace_id, date, kind ∈ instructional|holiday|exam|event)`. `school_profiles.working_days`, `school_profiles.timezone`. `academic_years(starts_on, ends_on)`, `terms`.

### 3.9 Private files

The uploaded syllabus PDF is a `files` row in the **private** bucket, `visibility='workspace'`. It is fetched for extraction server-side by file id; a signed URL (5 min) is issued only for the human preview pane, via `/api/files/[id]`, and every access is written to `file_access_log`.

## 4. Workflows

### 4.1 Create a syllabus manually

Trigger: `/app/curriculum` → "New syllabus". Pick grade level, subject, academic year (defaults to current), title, board. Creates a `draft` syllabus. Then units and topics are added inline: an accordion of units, each with an inline "+ topic" row taking title and estimated periods. Reorder with up/down on phone, drag at ≥1024. Publish (owner/admin) flips `status='published'`, which is what makes it selectable in lesson logging and pacing; `draft` syllabi are visible only to their workspace's staff and are excluded from pacing maths.

Audit: `syllabus.created`, `syllabus.published`, and per-row audit on units/topics from the generic trigger. Failure: the unique `(grade, subject, year)` constraint returns `SYLLABUS_EXISTS` with a link to the existing one.

### 4.2 Syllabus PDF → AI extraction → review → commit

**This is the flow that makes the whole spine viable. The review step is mandatory; there is no auto-commit.**

1. **Upload.** `/app/curriculum` → "Import from PDF". Picks grade, subject, year, then a `.pdf` (≤20 MB, ≤40 pages). Uploads through the standard `files` path into the private bucket. Creates `syllabus_extractions` with `status='uploaded'`. Storage quota is checked first (F-TE-05 §5.6).
2. **Cost gate.** The sheet shows "Extraction uses 10 credits · you have 37". Disabled below cost with "Request credits".
3. **Extract.** `syllabus.extract` → `ai.reserve(..., 'syllabus.extract')` → status `extracting` → Claude call with the PDF as a `document` content block (base64 from the private object, server-side; the model never gets a URL) and prompt `syllabus_extract.v1` (F-TE-04 §4.6) → structured output validated against `SyllabusExtractionOutput` → `ai.settle` → `raw_output` and `draft` both set → `status='review'`.
   This runs as a **background job** (`jobs` table, drained by the Vercel cron route) because a 40-page PDF can exceed a serverless request budget. The UI polls the extraction row and shows a progress card; the teacher may leave the page and come back.
4. **Review table.** `/app/curriculum/import/[id]` shows a two-pane layout on desktop (PDF preview left via signed URL, editable table right) and **stacked tabs on phone** (Document | Topics), because a PDF and a table cannot share 360 px. Every row is editable: unit number, unit title, topic title, estimated periods. Rows can be added, deleted, merged into the unit above, or reordered. A confidence flag from the model marks rows it was unsure about with an amber left border and "check this" — those rows are the review's whole point. A counter reads "24 topics · 41 estimated periods".
5. **Commit.** `syllabus.commitExtraction` runs in one transaction: create (or, if the teacher chose "add to existing", extend) the `syllabi` row with `source='ai_extraction'` and `source_document_id`, insert units and topics in order, set `syllabus_extractions.status='committed'` and `syllabus_id`. Audit `syllabus.committed_from_extraction` with the generation id.
6. **Cancel** sets `status='cancelled'`; the draft is retained for 30 days then purged by a job. Credits are **not** refunded — the extraction ran.
7. **Failures.** `AI_TIMEOUT` (180 s for extraction) / `AI_SCHEMA_INVALID` / `AI_REFUSAL` → `status='failed'` with `error_code`, reservation released, **no credits charged**, and the card offers Retry. `FILE_TOO_LARGE` / `PAGE_LIMIT` are caught at upload, before any reservation. A scanned-image PDF with no extractable structure returns an empty `units` array; the UI says "We couldn't find a topic list in this document — you can still enter it manually" and offers the manual editor pre-seeded with the file attached, **still not charging** (empty result is treated as a failed extraction; the reservation is released).

### 4.3 Import from a template

Trigger: "Start from a template". The library lists platform templates (NCTB Class 6 Mathematics, etc.) and the school's own. Preview shows units and topics. "Use this" opens the same review table as 4.2 step 4 pre-filled from `body`, so the teacher edits before committing. Increments `use_count`. **No AI, no credits.**

### 4.4 Log a lesson (the 30-second phone flow)

Trigger: the "Log lesson" quick action on the teacher dashboard, on `/app/curriculum/logs`, or the "Log this" button on a finished timetable period.

1. A short `Sheet` opens pre-filled from context: section-subject (from the tapped period, else last used), date = today in workspace tz, period number (from the timetable slot).
2. **Topic chips.** The sheet's first row is a horizontally scrollable strip of the **next 3 uncovered topics** for that section-subject, in teaching order, each as a one-tap chip. This is the feature Base44 built and could never show, because no `Syllabus` row could exist. Tapping a chip sets `syllabus_topic_id` and closes the topic picker. "Something else" opens a search over all topics in the syllabus plus a free-text field.
3. Coverage segmented control: Completed · Partial · Skipped · Revision · Assessment. Periods used: a stepper defaulting to 1, stepping by 0.5.
4. Optional note. Save.
5. **Outcome:** `lesson_logs` row. If `lesson_plan_id` is set (auto-linked when a `ready` plan exists for that section-subject and date), that plan flips to `status='taught'` with `taught_at` (F-TE-01 §4.6). Pacing recomputes on next read — no cached counters to drift.
6. **Audit:** generic trigger. **No notification** — logging must be frictionless.
7. **Failures:** the unique `(section_subject, date, period)` constraint returns `ALREADY_LOGGED` with "You already logged period 3 today — edit it?" and a link. Offline: the save queues in IndexedDB with an idempotency key and replays (same mechanism as attendance, ARCHITECTURE §6).

### 4.5 Pacing view

Trigger: `/app/curriculum/pacing`, or the "Pacing" tab on a section-subject.

Displays, per section-subject, computed live (§5.2–5.5): topics covered / total, periods taught / estimated, **periods remaining in the year from the timetable and calendar**, **estimated periods still needed**, the resulting surplus or shortfall in periods and in weeks, a projected finish date, and a RAG band. Below that, the per-unit coverage bars and a "not yet covered" list in teaching order.

Admin view (`pacing.read.any`) is a table of every section-subject with the same numbers, sortable by shortfall, filterable by grade/subject/teacher. This is the head-of-department screen.

### 4.6 AI pacing plan

Trigger: "Suggest a schedule" on the pacing view. Inputs: start date (default next instructional day), number of weeks (default: weeks remaining to the term end, capped 12), periods per week (**pre-filled from the timetable**, editable).

Cost gate at 8 credits. The prompt (`pacing_plan.v1`, F-TE-04 §4.5) receives the remaining topics **with their estimated periods**, the real instructional dates in the window (holidays and exam days already removed by SQL — the model is never asked to know the school calendar), the last 5 lesson logs as coverage context, and the computed capacity. Output is validated, **persisted to `pacing_plans`**, and rendered as week cards plus a recommendations panel. A "Copy to lesson plans" action creates `draft` `lesson_plans` rows from the schedule (each costing nothing — no AI involved) so the plan becomes work, not a picture.

Failures behave exactly as in 4.2 step 7 — released reservation, nothing charged, retry available.

### 4.7 Phone flow, explicitly

- `/app/curriculum` is a list of syllabi as cards (grade · subject · year · N units · N topics · status pill), with a subject filter chip row and a FAB.
- Editing a syllabus is a **route** (`/app/curriculum/[id]`) with an accordion of units; adding a topic is an **inline row**, not a sheet — a sheet per topic makes entering 30 topics unbearable.
- The import review is **tabbed** (Document | Topics), never side-by-side.
- Log-lesson is a **short sheet** (≈60 % height) so the teacher can see the timetable behind it; Save sits in a sticky footer within the thumb arc.
- The pacing view is a **stack of cards**, the headline number ("3 periods short") at 32 px, the supporting numbers at 14 px; the per-unit bars scroll vertically. No chart requiring hover exists on phone: the bars carry inline labels.

## 5. Business rules and calculations

All of these are SQL or pure domain functions. **None of them involve a model.**

**5.1 Topic coverage (per section_subject).** A topic is **covered** for a section-subject when a `lesson_logs` row exists with that `syllabus_topic_id`, that `section_subject_id`, and `coverage='completed'`. It is **in progress** when the only matching logs have `coverage='partial'`. `skipped`, `revision` and `assessment` logs never mark a topic covered (`skipped` is recorded so the shortfall maths is honest about deliberate omissions).

**5.2 Estimated periods remaining.**
`estimated_remaining = Σ estimated_periods over topics of the published syllabus that are not covered and not optional, for this section_subject`. Partially-covered topics count at **half** their estimate, rounded up to the nearest 0.5.

**5.3 Periods remaining (capacity).** From the timetable and the calendar, never from a typed guess:

```
periods_remaining =
  count of (date, period_number) pairs where
    date > today(workspace_tz)
    and date <= COALESCE(term_ends_on, academic_year.ends_on)
    and date is an instructional day in academic_calendar_days
    and extract(isodow from date) is in school_profiles.working_days
    and a timetable_slots row exists for this section_subject
        matching that weekday and effective on that date
```

This is the number Base44 asked the teacher to type (`periodsPerWeek`) and then multiplied by a typed week count.

**5.4 Balance and bands.**
`period_balance = periods_remaining − estimated_remaining`.
`weeks_balance = period_balance / NULLIF(periods_per_week, 0)` where `periods_per_week` = count of timetable slots per week for this section-subject.
Bands (school-configurable, stored in `school_profiles.pacing_thresholds`, defaults here):

- **On track** — `period_balance >= 0`
- **At risk** — `-0.1 × estimated_remaining <= period_balance < 0` (within 10 % of the remaining workload)
- **Behind** — `period_balance < -0.1 × estimated_remaining`
  A syllabus with `estimated_remaining = 0` is **Complete** regardless of balance.

**5.5 Projected finish date.** Walk forward through the instructional calendar from today, consuming one period per available `timetable_slots` occurrence, until `estimated_remaining` periods have been consumed. The date on which the last period is consumed is the projected finish. Returned `null` when there is not enough remaining calendar, in which case the UI shows "Won't finish this year — N periods short".

**5.6 Syllabus completion %.** `round(100 × covered_topics / NULLIF(total_non_optional_topics, 0))`, per section-subject. Base44 computed this over topic _rows_ with a global status, which double-counted across sections.

**5.7 Actual vs estimated pace.** `actual_periods_per_topic = Σ periods_used over completed logs / count of distinct covered topics`. Shown as "You are averaging 1.4 periods per topic; the syllabus estimates 1.0" — this is the signal that an estimate is wrong, and it feeds the pacing prompt.

**5.8 Pacing-plan capacity fed to the model.** `total_periods_available` = the count from 5.3 restricted to the requested window. Topics in scope = uncovered topics in teaching order, taken **until their cumulative `estimated_periods` meets `total_periods_available`**, plus 3 lookahead topics. Base44 sliced by topic count and ignored the estimates — the documented bug that made its plans over-full.

**5.9 Credit costs.** `syllabus.extract` = **10 credits**; `pacing.generate` = **8 credits** (PRODUCT-DECISIONS 3.3). Read from `ai_actions` at call time.

**5.10 Log edit window.** A teacher may edit or delete their own log for **7 days** (`school_profiles.lesson_log_edit_days`, default 7); after that only admin/owner. Every edit is audited with before/after.

**5.11 Off-syllabus logs** (`topic_freetext` set, `syllabus_topic_id` null) count toward workload (F-TE-06) and toward `periods_used`, but never toward coverage. The pacing view surfaces them as "4 periods spent off-syllabus this term" — a real and useful number.

**5.12 One syllabus per grade+subject+year.** If two sections genuinely run different curricula, the school creates two subjects (e.g. "Mathematics" / "Mathematics (Advanced)"). This is the deliberate resolution of the prototype's join-key contradiction, and it is documented in the UI's help text.

**5.13 Published is required for pacing.** Draft syllabi are excluded from every calculation above and from the topic chips in lesson logging.

## 6. UI

| Screen           | Route                                         | 360×800                                                                           | ≥1024                                         | Primary action       | Empty                                                                                 | Loading                                                                | Error                                            |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| Syllabi list     | `/app/curriculum`                             | Card `DataList` + subject chips + FAB                                             | Table + right preview                         | New syllabus         | "No curriculum yet. Import a PDF, start from a template, or type it." — three buttons | 5 skeleton cards                                                       | Inline `Alert` + Retry                           |
| Syllabus editor  | `/app/curriculum/[id]`                        | Unit accordion, inline topic rows, sticky "Publish" bar                           | Same + drag handles + a right-hand stats rail | Add topic            | "This syllabus has no units yet."                                                     | Skeleton accordion                                                     | Inline per-row                                   |
| Import (upload)  | `/app/curriculum/import`                      | Sheet: grade/subject/year + file picker + cost line                               | Dialog                                        | Extract              | n/a                                                                                   | Progress card with stage text (Uploading / Reading pages / Extracting) | `Alert` with error code copy + Retry             |
| Import review    | `/app/curriculum/import/[id]`                 | Tabs: **Document** \| **Topics**; editable rows; sticky footer "Commit 24 topics" | Split: PDF left, table right                  | Commit               | "We couldn't find a topic list" + manual editor button                                | Skeleton table                                                         | Inline; failed extraction card with Retry        |
| Templates        | `/app/curriculum/templates`                   | Card list, School / Acadigma tabs                                                 | Grid                                          | Use this             | "No templates yet."                                                                   | Skeletons                                                              | Inline                                           |
| Log lesson       | sheet, anywhere                               | 60 %-height `Sheet`, topic chip strip, segmented coverage, 0.5 stepper            | `Dialog` 560 px                               | Save                 | n/a (always pre-filled)                                                               | Chip strip skeleton                                                    | Inline; `ALREADY_LOGGED` shows an "Edit it" link |
| Logs list        | `/app/curriculum/logs`                        | Grouped-by-date cards                                                             | Table with filters                            | Log lesson           | "No lessons logged yet. Logging takes 15 seconds and powers your pacing."             | Skeletons                                                              | Inline                                           |
| Pacing (teacher) | `/app/curriculum/pacing`                      | Headline card, unit bars, uncovered list                                          | Two-column, plus the AI plan panel            | Suggest a schedule   | "Publish a syllabus to see pacing."                                                   | Skeleton headline                                                      | Inline                                           |
| Pacing (admin)   | `/app/curriculum/pacing?scope=school`         | Card per section-subject sorted by shortfall                                      | Sortable table                                | Export CSV           | "No published syllabi yet."                                                           | Skeletons                                                              | Inline                                           |
| AI pacing plan   | panel/route `/app/curriculum/pacing/[planId]` | Week cards, recommendations list, "Copy to lesson plans"                          | Same + week grid                              | Copy to lesson plans | n/a                                                                                   | Progress card                                                          | `Alert`, nothing charged                         |

Components: `DataList`, `DataTable`, `Accordion`, `InlineEditRow`, `ChipStrip`, `SegmentedControl`, `Stepper`, `FileDropzone`, `PdfPreview`, `ProgressCard`, `StatTile`, `ProgressBar`, `RagBadge`, `CreditBadge`, `AiGenerateButton`, `EmptyState`, `ErrorState`.

## 7. Server contracts

| Name                                                     | Input                                                                                                                                                  | Output                                                   | Errors                                                  | Idempotency                                     | Rate limit                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ----------------------------- |
| `syllabus.list`                                          | `{ gradeLevelId?, subjectId?, academicYearId?, status?, cursor, limit }`                                                                               | `{ items, nextCursor }`                                  | `FORBIDDEN`                                             | —                                               | 120/min                       |
| `syllabus.get`                                           | `{ id }`                                                                                                                                               | syllabus + units + topics + per-section coverage summary | `NOT_FOUND`                                             | —                                               | 240/min                       |
| `syllabus.create`                                        | `SyllabusCreateInput`                                                                                                                                  | `Syllabus`                                               | `SYLLABUS_EXISTS`, `VALIDATION`                         | key                                             | 30/min                        |
| `syllabus.update` / `.publish` / `.archive` / `.delete`  | `{ id, … }`                                                                                                                                            | `Syllabus`                                               | `NOT_FOUND`, `FORBIDDEN`, `IN_USE`                      | key                                             | 60/min                        |
| `syllabusUnit.upsert` / `.reorder` / `.delete`           | `{ syllabusId, units[] }`                                                                                                                              | units                                                    | `VALIDATION`                                            | key                                             | 120/min                       |
| `syllabusTopic.upsert` / `.reorder` / `.delete`          | `{ unitId, topics[] }`                                                                                                                                 | topics                                                   | `VALIDATION`, `TOPIC_IN_USE` (logged against)           | key                                             | 240/min                       |
| `syllabus.startImport`                                   | `{ fileId, gradeLevelId, subjectId, academicYearId }`                                                                                                  | `{ extractionId }`                                       | `FILE_TOO_LARGE`, `PAGE_LIMIT`, `QUOTA_EXCEEDED`        | key                                             | 10/hour/user                  |
| `syllabus.extract`                                       | `{ extractionId }`                                                                                                                                     | `{ jobId }` (async)                                      | `INSUFFICIENT_CREDITS`, `FORBIDDEN`                     | key **required**                                | 5/hour/user, 30/day/workspace |
| `syllabus.getExtraction`                                 | `{ extractionId }`                                                                                                                                     | extraction row incl. `draft`, `status`, `error_code`     | `NOT_FOUND`                                             | —                                               | 240/min (poll)                |
| `syllabus.updateExtractionDraft`                         | `{ extractionId, draft }`                                                                                                                              | `{ ok }`                                                 | `VALIDATION`, `WRONG_STATUS`                            | key                                             | 120/min                       |
| `syllabus.commitExtraction`                              | `{ extractionId, mode: 'new'\|'append', syllabusId? }`                                                                                                 | `{ syllabusId, unitsCreated, topicsCreated }`            | `WRONG_STATUS`, `SYLLABUS_EXISTS`                       | key **required**                                | 20/hour                       |
| `syllabus.cancelExtraction`                              | `{ extractionId }`                                                                                                                                     | `{ ok }`                                                 | —                                                       | key                                             | 30/min                        |
| `syllabusTemplate.list` / `.apply` / `.saveFromSyllabus` | …                                                                                                                                                      | …                                                        | `FORBIDDEN`                                             | key on writes                                   | 60/min                        |
| `lessonLog.create`                                       | `LessonLogCreateInput` `{ sectionSubjectId, taughtOn, periodNumber?, syllabusTopicId?, topicFreetext?, coverage, periodsUsed, notes?, lessonPlanId? }` | `LessonLog`                                              | `ALREADY_LOGGED`, `FORBIDDEN`, `VALIDATION`             | `idempotency_key` **required** (offline replay) | 120/min                       |
| `lessonLog.update` / `.delete`                           | `{ id, … }`                                                                                                                                            | `LessonLog`                                              | `EDIT_WINDOW_CLOSED`, `FORBIDDEN`                       | key                                             | 60/min                        |
| `lessonLog.list`                                         | `{ sectionSubjectId?, from?, to?, cursor }`                                                                                                            | `{ items, nextCursor }`                                  | —                                                       | —                                               | 120/min                       |
| `lessonLog.nextTopics`                                   | `{ sectionSubjectId, limit: 3 }`                                                                                                                       | `Topic[]`                                                | —                                                       | —                                               | 240/min                       |
| `pacing.get`                                             | `{ sectionSubjectId }`                                                                                                                                 | `PacingSummary` (§5.2–5.7 fields)                        | `NO_PUBLISHED_SYLLABUS`                                 | —                                               | 120/min                       |
| `pacing.school`                                          | `{ gradeLevelId?, subjectId?, teacherId?, cursor }`                                                                                                    | rows                                                     | `FORBIDDEN`                                             | —                                               | 60/min                        |
| `pacing.generate`                                        | `{ sectionSubjectId, startDate, weeksCount<=12, periodsPerWeek }`                                                                                      | `{ pacingPlanId, creditsCharged, plan }`                 | `INSUFFICIENT_CREDITS`, `AI_*`, `NO_PUBLISHED_SYLLABUS` | key **required**                                | 5/hour/user                   |
| `pacing.copyToLessonPlans`                               | `{ pacingPlanId, weekNumbers[] }`                                                                                                                      | `{ created: n }`                                         | `FORBIDDEN`                                             | key                                             | 10/hour                       |

## 8. Parts (build chunks)

**Part 1 — Curriculum schema + RLS (≤1 day).** Enums, `syllabi`, `syllabus_units`, `syllabus_topics`, `syllabus_templates`, indexes, unique constraints, RLS incl. `app.teaches_subject()`, audit triggers, contracts. Tests: pgTAP isolation + escalation on all four tables; a teacher cannot write a syllabus for a subject they do not teach; the grade+subject+year unique constraint holds. **Demo:** SQL transcript of both isolation and the teaches-subject restriction.

**Part 2 — Syllabus editor (≤2 days).** List, create, unit accordion with inline topic rows, reorder, publish/archive, delete guards, template save/apply (no AI). Tests: reorder is stable under concurrent edits; delete of a topic with logs returns `TOPIC_IN_USE`; e2e entering a 3-unit/12-topic syllabus at 360 px. **Demo:** a full Class 6 Mathematics syllabus typed on a phone in under 6 minutes.

**Part 3 — Lesson logs (≤2 days).** `lesson_logs` schema + RLS, the quick-log sheet with topic chips from `lessonLog.nextTopics`, 0.5 stepper, coverage control, edit window, `ALREADY_LOGGED` handling, plan auto-link and `taught` promotion, offline queue + idempotent replay, logs list. Tests: pgTAP isolation; duplicate period rejected; replayed idempotency key creates one row; edit window enforced server-side. **Demo:** log a lesson in airplane mode, reconnect, one row appears.

**Part 4 — Pacing calculations + views (≤2 days).** Domain functions and SQL for 5.1–5.7, `pacing.get`, `pacing.school`, the teacher pacing card and the admin table, CSV export. Tests: unit tests over a fixture calendar covering holidays, a mid-year timetable change (`effective_from/to`), a section with zero slots, partial coverage rounding, and the "won't finish" null case. **Demo:** change one holiday in the calendar and watch `periods_remaining` and the projected finish date move.

**Part 5 — Syllabus import: upload + extraction job (≤2 days).** _Requires F-TE-03 Parts 1–4, F-TE-04 Part 1._ `syllabus_extractions`, private upload with quota and page-count checks, the `jobs`-backed extraction with prompt `syllabus_extract.v1`, reserve/settle, status machine, polling contract, every failure path releasing the reservation. Tests: integration with a mocked Anthropic covering success, timeout, invalid schema, refusal, empty result — each asserting zero ledger movement on failure. **Demo:** upload a real NCTB syllabus PDF and watch the extraction reach `review` with units and topics populated.

**Part 6 — Import review + commit (≤2 days).** The tabbed/split review UI, row editing, add/delete/merge/reorder, confidence flags, draft autosave, transactional commit in `new` and `append` modes, cancel and the 30-day purge job. Tests: commit is atomic (forced failure mid-insert leaves no partial syllabus); `WRONG_STATUS` guards; e2e edit-then-commit producing exactly the edited rows. **Demo:** correct three mis-extracted topics and commit; the syllabus contains the corrections, not the model's output.

**Part 7 — AI pacing plan (≤2 days).** `pacing_plans`, `pacing.generate` with prompt `pacing_plan.v1` and the calendar-aware capacity from 5.8, persisted output, week-card rendering, recommendations, `pacing.copyToLessonPlans`. Tests: the topic window respects `estimated_periods` (regression against the Base44 slice-by-count bug); the model never receives holiday dates as instructional; plan persists across refresh; failure paths charge nothing. **Demo:** generate a plan, refresh the page, the plan is still there; copy week 1 into four draft lesson plans.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7. Parts 3 and 4 can run in parallel with 2 once Part 1 lands.

## 9. Acceptance criteria

1. **Given** a syllabus in school A, **when** anyone in school B queries syllabi, units or topics, **then** zero rows are returned.
2. **Given** I teach only English, **when** I try to create a syllabus for Mathematics, **then** the server returns `FORBIDDEN` and RLS rejects the insert independently.
3. **Given** a published syllabus exists for Class 6 Mathematics 2026, **when** I try to create another for the same grade+subject+year, **then** I get `SYLLABUS_EXISTS` with a link to the existing one.
4. **Given** a syllabus in `draft`, **when** I open the pacing view for a section using it, **then** I see "Publish a syllabus to see pacing" and no numbers.
5. **Given** a topic with `estimated_periods = 2` that is 'partial', **when** pacing computes `estimated_remaining`, **then** that topic contributes 1.0 period.
6. **Given** section 6-A has covered topic T and 6-B has not, **when** both pacing views load, **then** T is covered for 6-A and uncovered for 6-B.
7. **Given** a holiday is added to the academic calendar inside the remaining window, **when** pacing reloads, **then** `periods_remaining` decreases by exactly the number of that section-subject's slots on that weekday.
8. **Given** a timetable slot with `effective_to` in the past, **when** capacity is computed for future dates, **then** that slot contributes zero periods.
9. **Given** I log period 3 today for 6-A Mathematics, **when** I try to log period 3 again for the same date and section-subject, **then** I get `ALREADY_LOGGED` with an Edit link and exactly one row exists.
10. **Given** I log a lesson offline and the request replays twice with the same idempotency key, **when** connectivity returns, **then** exactly one `lesson_logs` row exists.
11. **Given** a `ready` lesson plan for 6-A Mathematics today, **when** I log that period, **then** the plan's status becomes `taught` with `taught_at` set.
12. **Given** a log 8 days old and a 7-day edit window, **when** I (a teacher) try to edit it, **then** I get `EDIT_WINDOW_CLOSED`; an admin can still edit it.
13. **Given** the next three uncovered topics exist, **when** I open the log sheet, **then** exactly those three appear as chips in teaching order.
14. **Given** a 30-page syllabus PDF, **when** I run extraction, **then** 10 credits are reserved, the job completes, `status='review'`, and the ledger shows exactly one settled debit of 10.
15. **Given** extraction times out at 180 s, **when** the job fails, **then** `status='failed'`, `error_code='AI_TIMEOUT'`, and my credit balance is identical to before.
16. **Given** extraction returns zero units, **when** the review loads, **then** the empty state offers the manual editor and my balance is unchanged.
17. **Given** I correct a topic title in the review table, **when** I commit, **then** the committed `syllabus_topics` row carries my correction and `raw_output` still carries the model's original.
18. **Given** a commit that fails partway, **when** the transaction rolls back, **then** no syllabus, unit or topic rows exist from that attempt and `status` is still `review`.
19. **Given** an extraction in `review`, **when** I call `commitExtraction` twice with the same idempotency key, **then** exactly one syllabus is created.
20. **Given** remaining topics estimating 30 periods and a 6-week/4-per-week window (24 periods), **when** I generate a pacing plan, **then** the topics sent to the model are those whose cumulative estimate reaches 24, plus 3 lookahead — not the first 24 topics by count.
21. **Given** two holidays inside the pacing window, **when** the plan is generated, **then** no day in the returned schedule falls on a holiday.
22. **Given** a generated pacing plan, **when** I refresh the page, **then** the plan is still displayed from `pacing_plans`.
23. **Given** a pacing plan week, **when** I press "Copy to lesson plans", **then** one `draft` lesson plan is created per scheduled period with the topic linked, and no credits are charged.
24. **Given** an off-syllabus lesson log, **when** pacing loads, **then** coverage is unchanged and "periods spent off-syllabus" increases by `periods_used`.
25. **Given** a section-subject with no published syllabus, **when** `pacing.generate` is called, **then** it returns `NO_PUBLISHED_SYLLABUS` before any credit reservation.

## 10. Tests

- **Unit (`packages/domain`):** `estimatedRemaining()`, `periodsRemaining()` over a fixture calendar, `pacingBand()`, `projectedFinishDate()`, `topicWindowForPacing()` (the estimate-aware slice), `completionPercent()`, `actualPacePerTopic()`, `canEditLog()`. Target ≥90 % on this module — it is the arithmetic the product is judged on.
- **DB (pgTAP):** isolation + escalation on `syllabi`, `syllabus_units`, `syllabus_topics`, `lesson_logs`, `syllabus_extractions`, `pacing_plans`, `syllabus_templates` (including the null-workspace template rule: a school admin cannot UPDATE a platform template). Unique-constraint tests. `app.teaches_subject()` behaviour for pending/removed members.
- **Integration:** the extraction state machine end to end with a mocked model; commit atomicity via an injected failure; idempotency replays on `lessonLog.create`, `commitExtraction`, `pacing.generate`.
- **e2e (360×800 + 1280×800, axe):** J1 type a syllabus; J2 import a PDF → review → correct → commit; J3 quick-log with chips, incl. the duplicate-period path; J4 pacing numbers change after logging; J5 generate and persist a pacing plan; J6 admin pacing table sorted by shortfall.
- **a11y:** the review table is navigable by keyboard with per-row labels; the chip strip is a proper listbox; progress cards announce stage changes via `aria-live`.
- **Performance:** `pacing.get` p95 < 300 ms for a syllabus of 120 topics and 400 logs; `pacing.school` p95 < 800 ms for 60 section-subjects (covered by the `analytics_*` views in F-TE-07 if the direct query misses budget); extraction job completes < 120 s for 40 pages.

## 11. Open questions

1. **Term-scoped pacing.** §5.3 uses `term_ends_on` when a term is active, else the year end. If a school runs three terms with a syllabus split across them, topics need a `term_id`. Default assumed: **no term column on topics** in v1 — pacing runs to the year end and the teacher picks the window for AI plans. Flagged as the most likely v1.1 change.
2. **Who owns `timetable_slots` and `academic_calendar_days`.** Named here as proposed; F-AC-06 and F-OP-02 own them. If their shapes differ, §5.3 changes but nothing else does.
3. **Model for extraction.** D-08 assigns `claude-haiku-4-5` to "cheap classification/extraction". This spec proposes `claude-sonnet-5` for syllabus extraction because a mis-extracted topic list propagates into every downstream number, and the action is run a handful of times per school per year. **Needs a DECISION-LOG entry** (see F-TE-04 §5 and the README's conflicts list). Default assumed until then: `claude-sonnet-5`.
4. **Scanned PDFs.** Claude reads image-only PDFs as images, which works but costs more input tokens. Should a page-count-weighted credit price replace the flat 10? Default assumed: flat 10, with `pages` recorded on `ai_generations` so the owner can reprice with real data.
5. **Platform-provided NCTB templates.** Who authors and maintains them? Default assumed: platform staff, seeded manually in v1, no import pipeline.
6. **Lesson-log reminders.** A nudge at the end of a period would lift logging rates enormously but is a notification-design question. Deferred to F-OP-07 (messaging/notifications).
