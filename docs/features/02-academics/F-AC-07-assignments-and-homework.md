# F-AC-07 — Assignments and homework

|                  |                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                                                                                                           |
| Status           | planned                                                                                                                                                                                             |
| Owner branch     | `feat/academics-assignments`                                                                                                                                                                        |
| Depends on       | F-AC-01 (section_subjects), F-AC-02 (students, enrollments, guardians), F-AC-11 (calendar), F-OP-05 (files), F-AC-06 (optional: push a score into an exam), F-OP-04 (print queue, for handouts)     |
| Plan             | `docs/plan/ROADMAP.md` chunk 6                                                                                                                                                                      |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §2 (Assignment, Handout), §3 features 36–39, 47–49, 53, §4.3, §5 (completion rate, overdue alert), §6 items 13, 23, 25, 32, 37, 49, §7 Q7, Q8 |

## 1. Purpose

Homework is the daily contract between a teacher, a student and a parent. A subject teacher sets work for a section with a due date and an attachment, the class sees it in the diary, the parent sees "Maths: worksheet 4, due Thursday" in the portal, the teacher ticks off who handed it in and scores it, and the missing-submission count becomes one of the four inputs to the risk score (F-AC-09). This feature also absorbs **handouts**: publishing material to a section, which PRODUCT-DECISIONS 2.8 defines as "visible to those students' parents in the portal, optionally pushed to the print queue with copies = enrolled count". "Done": a teacher sets homework in three taps from their timetable card, parents get it the same minute, and by Friday the teacher sees "31 of 38 submitted" without opening a spreadsheet.

**Base44 intent vs reality.** `Assignment` pointed at a `Class` and had `description`, `file_url` and `google_doc_link` in its schema with **no UI field for any of them** — you could set homework but not say what it was or attach it. The type dropdown was wired to `MATERIAL_TYPES` (16 values) against a 6-value schema enum, so picking "Lab Report" or "Handout" wrote an out-of-enum value. **There was no per-student submission record at all**: "graded" was a status flag on the whole assignment, unconnected to any mark, so nobody was ever actually graded. Nothing notified students or parents. The overdue alert flagged _every student in a class_ when the class had more than three open assignments — a class-level count attributed to individuals. `Handout` had **no `workspace_id` and no RLS**, so every school on the platform saw every other school's handouts, and "Mark as distributed" flipped a boolean that printed nothing, emailed nobody and appeared to no student or parent. PRODUCT-DECISIONS 2.7 requires `assignment_submissions` with score and status; 2.8 defines distribution properly.

## 2. Roles and permissions

| Action                                | Permission key                | owner | admin | teacher                                              | staff | parent                        | platform |
| ------------------------------------- | ----------------------------- | ----- | ----- | ---------------------------------------------------- | ----- | ----------------------------- | -------- |
| View assignments for a section        | `assignments.read`            | yes   | yes   | yes                                                  | yes   | own children (published only) | no       |
| Create/edit an assignment             | `assignments.write`           | yes   | yes   | primary or assistant teacher of that section_subject | no    | no                            | no       |
| Edit/delete someone else's assignment | `assignments.write_any`       | yes   | yes   | no                                                   | no    | no                            | no       |
| Publish / unpublish an assignment     | `assignments.publish`         | yes   | yes   | the author                                           | no    | no                            | no       |
| Attach files                          | `assignments.attach`          | yes   | yes   | the author                                           | no    | no                            | no       |
| Record submissions and scores         | `assignments.grade`           | yes   | yes   | primary or assistant teacher of that section_subject | no    | no                            | no       |
| View submission detail for a student  | `assignments.read_submission` | yes   | yes   | teachers of that section_subject + class teacher     | yes   | own child's own row only      | no       |
| Publish a handout to a section        | `assignments.handout.write`   | yes   | yes   | teachers of that section_subject                     | no    | no                            | no       |
| Push a handout to the print queue     | `print.queue.write` (shared)  | yes   | yes   | yes                                                  | no    | no                            | no       |
| Push assignment scores into an exam   | `marks.write` (F-AC-06)       | yes   | yes   | the subject teacher                                  | no    | no                            | no       |

A teacher may only set and grade work for section_subjects they are attached to — enforced by RLS, ending the prototype's "any authenticated user" posture.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table — the exact thing `Handout` lacked.

**`assignments`** — `section_subject_id`, `section_id` (denormalised), `subject_id` (denormalised), `academic_year_id`, `term_id`, `title text`, `description text null` (rich text, sanitised), `kind assignment_kind` (`homework|classwork|worksheet|project|lab_report|presentation|reading|practice|handout|other`), `assigned_on date`, `due_on date null`, `due_at timestamptz null`, `max_score numeric(6,2) null`, `weight numeric(5,2) null` (optional, for a continuous-assessment total), `status assignment_status` (`draft|published|closed|archived`), `submission_mode submission_mode` (`physical|file_upload|none`), `allow_late bool default true`, `parent_visible bool default true`, `notify_parents bool default true`, `published_at`, `closed_at`, `created_by`, `linked_exam_subject_id uuid null` (when scores are pushed to F-AC-06).
Indexes: `index (workspace_id, section_id, due_on desc)`, `index (workspace_id, section_subject_id, status)`, `index (workspace_id, created_by)`.
**One entity, not two.** A handout is an assignment with `kind = 'handout'`, `submission_mode = 'none'` and no `due_on` — so it inherits tenancy, RLS, parent visibility and attachments for free, and the prototype's separate untenanted `Handout` table disappears.

**`assignment_attachments`** — `assignment_id`, `file_id references files`, `label text null`, `is_student_facing bool default true`, `sort int`.
Index: `index (workspace_id, assignment_id)`.

**`assignment_submissions`** — one per enrolled student per assignment, the row the prototype never had: `assignment_id`, `student_id`, `enrollment_id`, `status submission_status` (`pending|submitted|late|missing|excused|resubmit`), `submitted_on date null`, `score numeric(6,2) null`, `feedback text null`, `file_id uuid null` (when `submission_mode = 'file_upload'`), `graded_by uuid null`, `graded_at timestamptz null`, `recorded_by`, `recorded_at`, `parent_seen_at timestamptz null`.
Indexes: `unique (assignment_id, student_id)`, `index (workspace_id, student_id, status)` (the risk job's query), `index (workspace_id, assignment_id, status)`.

**`assignment_distributions`** — what "distribute" actually did (PRODUCT-DECISIONS 2.8): `assignment_id`, `channel distribution_channel` (`portal|print|message`), `target_section_id`, `copies int null`, `print_job_id uuid null`, `message_id uuid null`, `distributed_by`, `distributed_at`.
Index: `index (workspace_id, assignment_id)`.

**Enums**: `assignment_kind`, `assignment_status`, `submission_mode`, `submission_status`, `distribution_channel`. Each enum has **exactly one** source (the PG enum, mirrored into `packages/contracts` and checked by the enum-parity test) — the prototype's 16-values-into-a-6-value-enum bug is structurally impossible.

**RLS in words.** `assignments`: SELECT for active owner/admin/teacher/staff; a **parent policy** allows rows where `status = 'published'`, `parent_visible = true` and the parent is a guardian of a student with an active enrollment in `section_id` (via `app.is_guardian_of`). INSERT/UPDATE: owner/admin anywhere; a teacher only where they are the primary teacher or an assistant on `section_subject_id`, and only while `status <> 'archived'`; DELETE only by owner/admin or by the author while `status = 'draft'`. `assignment_submissions`: read/write by owner/admin and by teachers attached to the section_subject; **parents read only rows for their own children**, and only for published, parent-visible assignments, and only the columns exposed by the parent view (status, score, feedback, due date — never a classmate's row). `assignment_attachments`: follows the parent assignment; `is_student_facing = false` attachments (answer keys, marking schemes) are invisible to parents entirely. `assignment_distributions`: owner/admin/teacher read, author + admin write. `workspace_id` immutable everywhere.

**Private files.** Attachments live in the `private` bucket with `visibility = 'workspace'` for student-facing material and `'private'` for answer keys; both are served only through `GET /api/files/[id]` with a policy check, a 5-minute signed URL and a `file_access_log` row. Student-uploaded submission files are `private` and readable by the subject teachers, the class teacher, admins and that student's guardians only.

## 4. Workflows

**4.1 Set homework (the three-tap path).**
_Trigger:_ the teacher's timetable card ("Class 6 – A · Mathematics · now") has a "Set homework" action; also `/app/assignments` FAB, also the lesson-plan screen in the teaching area.
_Steps:_ a sheet pre-filled with section + subject from context. Title, due date (chips: Tomorrow · In 2 days · Next class · Pick a date), optional description, optional attachment, optional max score. Toggle "Notify parents" (on by default). Tap **Publish**.
_Outcome:_ one `assignments` row `published`, plus **one `assignment_submissions` row per actively enrolled student**, all `pending`, created in the same transaction. The section's parents see it immediately.
_Notifications:_ `assignment.published` to guardians of the section (batched into one notification per student, respecting `notify_parents`); an in-app entry in the class diary.
_Audit:_ `assignment.created`, `assignment.published`.
_Failures:_ due date before `assigned_on` → field error; the section has no active enrollments → published with zero submission rows and a warning; a teacher not attached to the section_subject → refused by permission and RLS.

**4.2 Draft and schedule.** Saving without publishing leaves `status = 'draft'` (invisible to parents). A `publish_at` is not modelled in v1; the teacher publishes when ready. Editing a published assignment is allowed until it is `closed`; changing the due date or title re-notifies parents with `assignment.updated` (rate-limited to one re-notify per assignment per day so a typo fix does not spam a family).

**4.3 Record submissions (the roll-call of homework).**
_Trigger:_ `/app/assignments/[id]/submissions`, or the teacher's "Due today" card.
_Steps (phone):_ the **same interaction pattern as attendance roll-call** so the muscle memory transfers — 64 px rows, roll + name, a right-aligned status pill in the thumb arc, tap to cycle `pending → submitted → missing → pending`. A long-press opens late/excused/resubmit and a feedback note. When `max_score` is set, each row also has a compact numeric input to the left of the pill, with the keypad staying up and Enter advancing (the F-AC-06 marks-entry primitive). "Mark all submitted" sits in the top bar. Sticky bottom bar: "31 of 38 submitted · avg 7.4/10" and one **Save**.
_Outcome:_ a single bulk upsert of the changed rows.
_Notifications:_ `assignment.missing` to the guardians of students still `missing` when the assignment is **closed**, not on every save (nobody wants a notification per tap).
_Audit:_ `assignment.submissions.recorded` (count) on first pass, `assignment.submission.changed` (before/after) on later edits.
_Failures:_ a score above `max_score` → inline row error, other rows still save; offline → the F-AC-03 queue with an idempotency key on (assignment_id, client_session_id).

**4.4 Student file submission.** When `submission_mode = 'file_upload'`, the parent portal exposes an upload control on the child's row (v1: parents upload on the student's behalf, since students have no accounts — PRODUCT-DECISIONS 1.22). The upload writes a private `files` row, sets `status = 'submitted'` (or `'late'` past the due time) and `submitted_on`, and notifies the teacher (`assignment.submission.received`).

**4.5 Close an assignment.** A teacher (or an automatic job at `due_at + grading.auto_close_days`, default 7) closes it: remaining `pending` rows become `missing`, `closed_at` is set, and the missing-work notification fires once. Closing is reversible by an admin with a reason. Audit `assignment.closed`.

**4.6 Publish a handout / distribute.**
_Trigger:_ `/app/assignments` → "New handout", or the "Distribute" action on any assignment.
_Steps:_ choose the target section(s) and the channels — **Portal** (parents see it and can download the attachment), **Print** (creates a `print_jobs` row with `copies = count of active enrollments`, per PRODUCT-DECISIONS 2.8), **Message** (posts to the section channel in the messaging module).
_Outcome:_ one `assignment_distributions` row per (assignment, channel, section); the print job appears in `/app/print` with real copies, not a boolean.
_Notifications:_ `handout.published` to guardians when the portal channel is used; `print.ready` when the PDF is rendered.
_Audit:_ `assignment.distributed` with the channels and copy count.
_Failures:_ no attachment and Print selected → refused with "nothing to print"; over the plan's storage quota → refused with an upgrade prompt (PRODUCT-DECISIONS 3.11).

**4.7 Push scores into an exam (optional).** For schools that count continuous assessment, a teacher can map a scored assignment to an `exam_subject` (F-AC-06) of type `class_test`: "Send scores to Class Test 2". The action writes `marks` rows scaled from `max_score` to the paper's `full_marks` and records `linked_exam_subject_id`. It is explicit and audited; there is never an implicit path from homework into a report card.

**4.8 Parent view.** In `/family/[childId]?tab=assignments`: three groups — **Due this week**, **Missing** (the thing parents actually want), **Past**. Each shows title, subject, due date, the child's status and score, the teacher's feedback and any student-facing attachment. Nothing about any other child.

**4.9 Phone specifics.** Creation is a bottom sheet reachable from the timetable card, so the common case is three taps from app open. The submissions screen reuses the roll-call primitive exactly. The assignment list is a virtualised card list grouped by due date with filter chips (My subjects · Section · Overdue · Ungraded), server-filtered — never `list()`-then-filter (the prototype's §6 pattern).

## 5. Business rules and calculations

1. **Submission rows are created at publish time**, one per student with an active enrollment in the section on `assigned_on`. A student enrolled _after_ publication is backfilled by a trigger on `enrollments` (status `pending`) so late joiners are not silently missing work; a student who transfers out keeps their row with whatever status it had.
2. **Status derivation on recording:**

```
submitted_on <= due_on                        -> submitted
submitted_on >  due_on AND allow_late         -> late
submitted_on >  due_on AND NOT allow_late     -> missing (with the submission date kept in feedback)
no record at close time                       -> missing
excused                                       -> excluded from every rate and from the risk input
```

3. **Per-assignment completion rate** (replacing the prototype's whole-class status flag):

```
counted   = submissions where status <> 'excused'
completed = submissions where status in ('submitted','late')
completion_pct = round(100 * completed / counted, 2)      // 0 when counted = 0
```

4. **Per-student missing count over a window** — the input F-AC-09 consumes:

```
missing_count(student, from, to) =
  count(submissions s join assignments a on …
        where a.status in ('published','closed')
          and a.due_on between from and to
          and s.status = 'missing')
denominator = count of the same join with s.status <> 'excused'
missing_rate = round(100 * missing_count / denominator, 2)   // null when denominator = 0
```

This is **per student**, not the class-level count the prototype attributed to every child (§5 of the inventory, overdue-assignment alert). 5. **Average score** for a scored assignment = `round(avg(score) over rows with score not null, 2)`; a student's subject-level assignment average = `round(100 * Σ score / Σ max_score, 2)` over scored assignments — **mark-weighted**, matching the F-AC-06 convention so the two never disagree. 6. **Overdue** = `due_on < today (school timezone)` and `status = 'published'` and the student's row is still `pending`. Computed in SQL against the workspace timezone, never from a UTC "today". 7. **Auto-close** runs nightly: assignments with `due_at < now() - grading.auto_close_days` (default 7) and `status = 'published'` are closed, pending rows become `missing`, and one `assignment.missing` notification per student is emitted. Idempotent: an already-closed assignment is skipped. 8. **Notification budget.** At most one `assignment.published` per student per assignment, at most one `assignment.updated` per assignment per day, and at most one `assignment.missing` per student per assignment. A daily digest (`assignment.digest`) is the default for parents with more than three notifications pending in a day. 9. **Print copies** = `count(enrollments where section_id = target and status = 'active')` at the moment of distribution, snapshotted onto `assignment_distributions.copies` so a later enrolment change does not alter a printed job. 10. **Score scaling into an exam** = `round(score * exam_subject.full_marks / assignment.max_score, 2)`, clamped to `[0, full_marks]`; students with no score are written as `status = 'absent'` on the mark, never as 0 without a record. 11. **Parent visibility** requires all of: assignment `status = 'published'`, `parent_visible = true`, the attachment `is_student_facing = true`, and an active guardian link. Four conditions, all enforced in RLS. 12. **Weekly load guard** (advisory): when a teacher publishes work that takes a section over `academics.max_assignments_per_week` (default 5, school setting), the sheet warns "Class 6 – A already has 5 assignments due this week" and lists them. It never blocks — it exists because homework overload is a real complaint and the data is right there. 13. **Timezone.** `due_at` is `timestamptz`; `due_on` is a `date` in the school timezone. "Due today" and "overdue" are computed by SQL in that timezone.

## 6. UI

| Screen                  | Route                                | 360×800                                                                                               | ≥1024                                          | Primary action     | Empty                                        | Loading          | Error                                           |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------ | -------------------------------------------- | ---------------- | ----------------------------------------------- |
| Assignments list        | `/app/assignments`                   | Virtualised cards grouped by due date; filter chips (My subjects · Section · Overdue · Ungraded); FAB | Table + left filter rail + right preview panel | New assignment     | "No assignments yet → set homework"          | 6 skeleton cards | Retry banner, filters stay usable               |
| Create/edit sheet       | sheet on any screen                  | Title, due-date chips, description, attachment, max score, notify toggle; sticky Publish              | Dialog with the same fields in two columns     | Publish            | n/a                                          | Button spinner   | Field errors; draft preserved                   |
| Assignment detail       | `/app/assignments/[id]`              | Header (subject, due, completion ring) + tabs: Details · Submissions · Distribution                   | Two-column: details left, submissions right    | Record submissions | "No submissions rows — no students enrolled" | Skeleton         | Retry                                           |
| Submissions             | `/app/assignments/[id]/submissions`  | Roll-call pattern: 64 px rows, right-aligned status pill, optional score input, sticky "31/38 · Save" | Grid with arrow-key nav and a score column     | Save               | "No students"                                | Roster skeleton  | Per-row errors; valid rows save; offline queued |
| Handout / distribute    | sheet                                | Channel checkboxes with computed copy count; Print shows "38 copies"                                  | Dialog                                         | Distribute         | n/a                                          | Spinner          | "Nothing to print" / quota error                |
| Student assignments tab | `/app/students/[id]?tab=assignments` | Grouped list (Missing · Due · Past) with scores                                                       | Table + trend                                  | Add note           | "No assignments"                             | Skeleton         | Retry                                           |
| Parent assignments tab  | `/family/[childId]?tab=assignments`  | Missing first (red count chip), then Due this week, then Past; attachment download buttons            | Same, two-column                               | Download / Upload  | "No homework right now"                      | Skeleton         | Retry                                           |
| Teacher "due" card      | `/app/dashboard`                     | One card: "3 assignments to grade · Class 6 – A Maths due today"                                      | Widget column                                  | Open               | hidden when empty                            | Skeleton         | silent fail, card hides                         |

`packages/ui`: `StatusRowList` (shared with F-AC-03 roll-call and F-AC-04), `MarksEntryList` (shared with F-AC-06 for the score column), `DueDateChips`, `CompletionRing`, `FileTile`, `AttachmentUploader`, `DistributionSheet`, `FilterChips`, `EmptyState`, `ConfirmSheet`.

## 7. Server contracts

| Action / handler                                 | Input schema (Zod)                                                                                                                                                                      | Output                                            | Errors                                                                                        | Idempotency      | Rate limit |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------- | ---------- |
| `createAssignment`                               | `CreateAssignmentInput` {sectionSubjectId, title, kind, assignedOn, dueOn?, dueAt?, description?, maxScore?, submissionMode, allowLate, parentVisible, notifyParents, publish: boolean} | `Assignment` with `submissionCount`               | `NOT_ASSIGNED`, `DUE_BEFORE_ASSIGNED`, `YEAR_CLOSED`, `WEEKLY_LOAD_WARNING` (warning payload) | key required     | 300/h      |
| `updateAssignment`                               | `UpdateAssignmentInput`                                                                                                                                                                 | `Assignment`                                      | `ASSIGNMENT_CLOSED`, `NOT_AUTHOR`                                                             | —                | 300/h      |
| `publishAssignment` / `unpublishAssignment`      | `AssignmentIdInput` / `{assignmentId, reason}`                                                                                                                                          | `Assignment`                                      | `ALREADY_PUBLISHED`, `HAS_SUBMISSIONS` (on unpublish)                                         | key required     | 120/h      |
| `closeAssignment` / `reopenAssignment`           | `AssignmentIdInput` / `{assignmentId, reason}`                                                                                                                                          | `Assignment`                                      | `ALREADY_CLOSED`, `REASON_REQUIRED`                                                           | key required     | 120/h      |
| `deleteAssignment`                               | `AssignmentIdInput`                                                                                                                                                                     | `{deleted: true}`                                 | `NOT_DRAFT`                                                                                   | —                | 60/h       |
| `addAssignmentAttachment`                        | `AttachmentInput` {assignmentId, fileId, label?, isStudentFacing}                                                                                                                       | `AssignmentAttachment`                            | `STORAGE_QUOTA_EXCEEDED`, `NOT_AUTHOR`                                                        | —                | 300/h      |
| `saveSubmissions`                                | `SaveSubmissionsInput` {assignmentId, clientSessionId (uuid), entries: [{studentId, status, score?, feedback?, submittedOn?}]}                                                          | `{saved: number, rejected: [{studentId, issue}]}` | `NOT_ASSIGNED`, `ASSIGNMENT_ARCHIVED`, `SCORE_OUT_OF_RANGE` (per row)                         | **key required** | 600/h      |
| `markAllSubmitted`                               | `MarkAllSubmissionsInput` {assignmentId, status}                                                                                                                                        | `{saved: number}`                                 | same as above                                                                                 | key required     | 120/h      |
| `uploadSubmissionFile`                           | `SubmissionFileInput` {assignmentId, studentId, fileId}                                                                                                                                 | `AssignmentSubmission`                            | `NOT_GUARDIAN`, `SUBMISSION_CLOSED`, `MODE_NOT_FILE_UPLOAD`                                   | key required     | 120/h      |
| `distributeAssignment`                           | `DistributeInput` {assignmentId, sectionIds[], channels: ('portal'\|'print'\|'message')[]}                                                                                              | `AssignmentDistribution[]`                        | `NOTHING_TO_PRINT`, `STORAGE_QUOTA_EXCEEDED`                                                  | key required     | 60/h       |
| `pushScoresToExamSubject`                        | `PushScoresInput` {assignmentId, examSubjectId}                                                                                                                                         | `{written: number, skipped: number}`              | `SUBJECT_MISMATCH`, `EXAM_SUBJECT_LOCKED`, `NO_MAX_SCORE`                                     | key required     | 30/h       |
| `GET /api/assignments`                           | `AssignmentQuery` {sectionId?, sectionSubjectId?, status?, overdue?, cursor?, limit ≤ 50}                                                                                               | `Page<AssignmentCard>`                            | —                                                                                             | —                | 1200/h     |
| `GET /api/assignments/student`                   | `StudentAssignmentsQuery` {studentId, from?, to?}                                                                                                                                       | `StudentAssignmentView[]` (parent-scoped)         | `FORBIDDEN`                                                                                   | —                | 600/h      |
| `runAssignmentAutoCloseJob` (cron, service role) | `{workspaceId?}`                                                                                                                                                                        | `{closed: number, missing: number}`               | —                                                                                             | idempotent       | 1/night    |

Exported selector for F-AC-09: `missingSubmissionStats(ctx, {studentIds, from, to})` returning `{studentId, missing, counted, missingRate}`.

## 8. Parts (build chunks)

**Part 1 — Assignments table and list** · `assignments` + `assignment_attachments` with enums, RLS (including the four-condition parent policy), storage-quota check on upload, list screen with server-side filters and grouping, create/edit sheet with description and attachments (the fields the prototype's schema had and its UI never exposed) · tests: pgTAP isolation/escalation, enum-parity test proving the contract enum and the PG enum match exactly, quota refusal · **Demo:** a teacher sets homework with a description and a PDF attachment from their timetable card in three taps.

**Part 2 — Submission rows and recording** · `assignment_submissions` created transactionally at publish, backfill trigger on `enrollments`, the roll-call-style submissions screen with status cycling and the optional score input, bulk upsert in one statement, offline queue with idempotency · tests: publish creates exactly one row per active enrollment; late joiner backfilled; e2e recording 38 students at 360×800; replay produces no duplicates · **Demo:** record 38 submissions one-thumb and see "31/38 · avg 7.4/10" before saving.

**Part 3 — Close, overdue and notifications** · close/reopen with reasons, nightly auto-close job, overdue computation in the school timezone, `assignment.published` / `.updated` / `.missing` / `.digest` events with the §5.8 budget, teacher "due" dashboard card · tests: job idempotency, notification-budget tests (one per student per assignment), timezone tests for "overdue" at 23:59 Dhaka · **Demo:** close an assignment and watch exactly one missing-work notification reach each affected guardian, and none reach anyone else.

**Part 4 — Handouts and distribution** · `kind = 'handout'` flow, `assignment_distributions`, portal channel, print channel with snapshotted `copies` from active enrollments, message channel hand-off, distribution tab · tests: copies snapshot correctness after a later enrolment change; refusal when there is nothing to print · **Demo:** publish a handout to Class 6 – A, push 38 copies to the print queue, and see it in a parent's portal — the three things the prototype's boolean claimed and never did.

**Part 5 — Parent view, file submissions and score push** · the `/family` assignments tab with Missing first, guardian file upload with private storage and teacher notification, `pushScoresToExamSubject` with scaling and audit, `missingSubmissionStats` selector for F-AC-09 · tests: pgTAP proving a parent sees only their child's submission row and never a classmate's score; scaling maths unit tests; an answer-key attachment invisible to parents · **Demo:** a parent sees "Maths worksheet 4 — missing", uploads the scan, the teacher is notified, scores it, and pushes the score into Class Test 2.

## 9. Acceptance criteria

1. **Given** a teacher attached to Class 6 – A Mathematics on a 360×800 phone, **when** they tap "Set homework" on their timetable card and publish with a title and "Tomorrow", **then** one published assignment exists and exactly one `assignment_submissions` row per actively enrolled student was created in the same transaction.
2. **Given** a teacher not attached to that section_subject, **when** they call `createAssignment` for it, **then** both the permission check and RLS refuse it.
3. **Given** a published assignment with an attachment marked `is_student_facing = false`, **when** a parent loads the child's assignments, **then** the assignment appears and that attachment does not.
4. **Given** `parent_visible = false`, **when** a parent loads the tab, **then** the assignment is absent entirely — proved by a pgTAP negative test, not by UI filtering.
5. **Given** a student enrolled into the section two days after publication, **when** the backfill trigger runs, **then** they have a `pending` submission row rather than silently having no work.
6. **Given** 38 students, **when** a teacher records 31 submitted and 7 missing and saves, **then** one bulk statement writes all 38 rows and the completion rate reads `round(100 × 31/38, 2) = 81.58`.
7. **Given** one of those 38 is `excused`, **when** the rate recomputes, **then** the denominator is 37 and the excused row is excluded from both numerator and denominator.
8. **Given** a score above `max_score`, **when** Save runs, **then** that row is rejected with an inline error and the other rows still save.
9. **Given** an assignment due 10 March with `allow_late = true`, **when** a submission is recorded on 12 March, **then** its status is `late`, not `missing`; **when** `allow_late = false`, **then** it is `missing` and the date is kept in the feedback.
10. **Given** an assignment past `due_at + 7 days`, **when** the nightly job runs, **then** it closes, pending rows become `missing`, exactly one `assignment.missing` notification per affected student is sent, and re-running the job the same night sends nothing more.
11. **Given** a student with 3 missing out of 12 counted assignments in the last 30 days, **when** `missingSubmissionStats` is called, **then** it returns `{missing: 3, counted: 12, missingRate: 25.00}` for **that student only** — never a class-level count attributed to every child (the prototype's defect).
12. **Given** a handout distributed to Class 6 – A with 38 active enrollments, **when** the print channel is used, **then** a `print_jobs` row exists with `copies = 38` snapshotted, and a later enrolment change does not alter it.
13. **Given** a handout with no attachment, **when** Print is selected, **then** distribution is refused with `NOTHING_TO_PRINT`.
14. **Given** a scored assignment with `max_score = 10` and an exam subject with `full_marks = 20`, **when** scores are pushed, **then** a score of 7 becomes a mark of 14.00, an unscored student is written as `absent`, and the action is audited.
15. **Given** two workspaces, **when** a member of workspace A lists assignments or handouts, **then** no row from workspace B appears (the prototype's `Handout` table was global).
16. **Given** a teacher publishing a sixth assignment due in the same week for one section, **when** the sheet validates, **then** a non-blocking warning lists the five existing ones and publishing still succeeds.
17. **Given** a parent uploading a submission file, **when** another family's parent requests that file id, **then** the file route returns 403 and the attempt is written to `file_access_log`.

## 10. Tests

- **Unit (`packages/domain`)**: `deriveSubmissionStatus(submittedOn, dueOn, allowLate)`, `completionRate` (excused excluded, zero-denominator), `missingRate`, `subjectAssignmentAverage` (mark-weighted, matching F-AC-06's convention), `scaleScoreToMarks` with clamping, `isOverdue(dueOn, now, tz)` across the Dhaka midnight boundary, `notificationBudget`, `weeklyLoad`.
- **DB (pgTAP)**: isolation and escalation for all four tables; the teacher-attachment write policy (positive for primary and assistant, negative for an unrelated teacher); the four-condition parent policy (published ∧ parent_visible ∧ guardian ∧ active enrollment), each condition negated in turn; a parent reading a classmate's submission row returns nothing; non-student-facing attachments invisible to parents; the publish-time submission-row creation and the enrollment backfill trigger; `workspace_id` immutability.
- **Enum-parity test**: `assignment_kind`, `assignment_status`, `submission_mode`, `submission_status` and `distribution_channel` compared between the PG enums and `packages/contracts` — CI fails on drift (the prototype shipped a 16-value picker against a 6-value enum).
- **Integration**: every action's happy path and named errors; `saveSubmissions` partial save and replay; `distributeAssignment` copy snapshotting; `pushScoresToExamSubject` against a locked exam subject; auto-close job idempotency and notification counts.
- **E2E (360×800 and 1280×800, axe)**: `set-homework-three-taps`, `record-submissions-one-thumb`, `parent-sees-missing-work`, `distribute-handout-to-print-queue`, `offline-submissions-sync`. Axe clean on the list, the submissions screen and the parent tab.
- **Performance budgets**: assignment list p95 < 300 ms with 2,000 assignments (cursor-paginated, server-filtered); `saveSubmissions` for 60 students is one statement, p95 < 400 ms; `missingSubmissionStats` for 2,000 students < 500 ms (it runs nightly inside F-AC-09); auto-close job < 30 s per workspace.

## 11. Open questions

1. **Student self-submission.** Students have no accounts in Campus v1 (PRODUCT-DECISIONS 1.22), so `file_upload` submissions come from guardians. Assumed acceptable; when the Students app lands, the same `assignment_submissions.file_id` path serves it with no schema change.
2. **Continuous-assessment weighting.** `assignments.weight` exists but nothing consumes it in v1 — scores reach a report card only through the explicit push in §4.7. Assumed correct (PRODUCT-DECISIONS 2.7: "report cards read exams only"). If schools want automatic CA components, that is an F-AC-06 change, not this one.
3. **Rubrics.** Out of scope for v1: a single `max_score` plus free-text feedback. Assumed sufficient for BD K-12; a rubric table would hang off `assignments` additively.
4. **Plagiarism / duplicate-file detection** on uploaded submissions. Out of scope; noted in `docs/product/FUTURE.md`.
5. **Assignment templates / reuse across sections.** Assumed: "Duplicate to another section" is a copy action in a later part; v1's three-tap creation is fast enough that duplication is a convenience, not a blocker.
6. **Whether `assignment.missing` should reach parents at all, or only the class teacher.** Default: guardians, once, at close. Flagged for the owner — some schools prefer the teacher to phone first, which is the posture F-AC-03 takes for low attendance.
