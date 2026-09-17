# WF-04 — Exam cycle: create → marks → GPA & rank → publish → report cards (Bengali PDF) → parent

|                  |                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Journey          | One term exam, from scheduling to a printed Bengali report card in a parent's hand                                                                                                                     |
| Primary actors   | Admin (schedules, publishes, prints) · Subject teacher (enters marks)                                                                                                                                  |
| Secondary actors | Class teacher (AI comment approval) · Parent (reads) · Owner (audit, rank disputes)                                                                                                                    |
| Features         | F-AC-06 (exams, marks, GPA, rank, publish) · F-AC-01 (sections/section_subjects) · F-TE-04 (AI tools) · F-TE-03 (AI credits) · F-OP-03 (reports/PDF) · F-OP-04 (print queue) · F-AC-0x (parent portal) |
| Budget           | A whole section's report cards in **≤ 2 minutes**, zero manual formatting (PRD §3)                                                                                                                     |
| Exit state       | `exams.published_at` set, `marks` complete, GPA + rank computed by one SQL function, bulk PDFs in `files` + `print_jobs`, parents see results                                                          |

---

## 1. Actors and preconditions

| Actor               | Device                                                    | Needs                                              |
| ------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| **Admin**           | Windows PC                                                | `exams.write`, `exams.publish`, `reports.generate` |
| **Subject teacher** | Android phone in the staff room, Windows PC in the office | `marks.write` for their own `section_subjects`     |
| **Class teacher**   | Android phone                                             | `report_comment.approve` for their section         |
| **Parent**          | Android phone                                             | `guardian_users` link                              |

**Preconditions**

- `grade_scales` seeded per school with the **Bangladesh default** (PRODUCT-DECISIONS §2.4): A+ 80–100 → 5.00, A 70–79 → 4.00, A− 60–69 → 3.50, B 50–59 → 3.00, C 40–49 → 2.00, D 33–39 → 1.00, F 0–32 → 0.00; pass mark 33; **an F in any subject ⇒ GPA 0** (configurable).
- `academic_years` + `terms` current, `sections` and `section_subjects` populated with teachers (WF-01).
- Bengali font embedded in the PDF renderer — verified in R1 report-card part 1 (PRD §8).

---

## 2. Sequence

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    actor TE as Subject teacher
    actor CT as Class teacher
    participant C as Client
    participant SA as Server Actions
    participant DB as Postgres + RLS
    participant AI as adapters/ai (Claude)
    participant JOB as jobs / pg_cron
    actor P as Parent

    A->>C: /app/exams → New exam
    C->>SA: createExam(CreateExamInput)
    SA->>DB: exams(term_id, type, status='scheduled')
    A->>C: Add exam subjects (bulk by section)
    C->>SA: upsertExamSubjects(ExamSubjectsInput)
    SA->>DB: exam_subjects(section_subject_id, date, full_marks, pass_marks)
    DB->>DB: notifications: exam.reminder → subject teachers

    TE->>C: /app/marks?examSubject=… (phone: one student per row; desktop: grid)
    C->>SA: saveMarks(SaveMarksInput, idempotency_key)
    SA->>DB: BEGIN → marks upsert (unique student × exam_subject) → COMMIT
    DB->>DB: audit_events: mark.saved (before/after)
    SA-->>C: canonical rows + per-subject completeness

    A->>C: /app/exams/[id] → Compute results
    C->>SA: computeExamResults({examId})
    SA->>DB: app.compute_exam_results(exam_id)
    DB->>DB: exam_results(student, gpa, total, grade, rank) — one SQL function
    SA-->>C: "412 of 420 marks entered · 8 missing" (blocking list)

    A->>C: Publish
    C->>SA: publishExam({examId, confirm:true})
    SA->>DB: exams.published_at = now()
    DB->>DB: notifications: exam.published → parents of every section in the exam
    DB->>DB: audit_events: exam.published

    CT->>C: Report cards → Generate comments with AI
    C->>SA: generateReportComments({sectionId, examId, idempotency_key})
    SA->>AI: ai.reserve → prompt report_comment.v1 → ai.settle
    SA->>DB: report_comments(status='draft', ai_generation_id)
    CT->>C: reviews, edits, Approve all
    C->>SA: approveReportComments({ids})
    SA->>DB: report_comments(status='approved', approved_by)

    A->>C: Bulk report cards (section × exam)
    C->>SA: POST /api/pdf/report-card?mode=bulk
    SA->>JOB: jobs{type:'reportcard.render.bulk'}
    JOB->>DB: files(private) per student + one merged file
    JOB->>DB: print_jobs(kind='report_card', copies=enrolled count)
    JOB->>DB: notifications: print.ready → requester
    P->>C: /family → Results (only published exams)
```

---

## 3. Steps

### Stage A — Create the exam (F-AC-06)

1. **`/app/exams` → New exam.** Sheet on phone, dialog on desktop: title ("First Term Examination"), term (defaults to `app.current_term`), exam type (`term | mid_term | class_test | model_test | annual`), grade levels or sections in scope, default full marks, default pass marks, weight in the year's aggregate.
   _Writes:_ `exams` (`workspace_id`, `academic_year_id`, `term_id`, `title`, `type`, `status='scheduled'`, `weight_percent`, `published_at = null`). _Events:_ `audit_events`: `exam.created`.
2. **Exam subjects.** "Add subjects" opens a bulk sheet: choose sections, and every `section_subjects` row for those sections is proposed with its default full/pass marks. The admin sets a date and time per subject.
   _Writes:_ `exam_subjects` (`exam_id`, `section_subject_id`, `exam_date`, `starts_at`, `duration_minutes`, `full_marks`, `pass_marks`, `room_id`). Unique `(exam_id, section_subject_id)`.
   _Events:_ `notifications`: `exam.reminder` to each subject teacher (`action_url=/app/marks?examSubject={id}`), and a second reminder job 24 h before each paper. Exams appear on the school calendar and export as ICS.

### Stage B — Marks entry, two form factors, one contract

3. **Desktop (`/app/marks`)** — an Excel-style grid: students down, one editable numeric cell each, arrow/Tab/Enter navigation, paste from a column of numbers, running "38 of 40 entered". Save is a **single batched action**, not one request per student.
4. **Phone (`/app/marks`)** — the same data as a `DataList`: one 64 px row per student (roll, name, big numeric input with `inputMode="decimal"`), a sticky header showing `Class 6 – A · Mathematics · out of 100`, and a sticky Save. The numeric keypad never covers the current row (the list scrolls the focused row above the keyboard).
5. **Validation, client and server:** `0 ≤ obtained ≤ exam_subjects.full_marks`; blank is permitted and means _not yet entered_, which is **not** zero; `absent` is an explicit toggle per student, stored as `is_absent`, and is excluded from the average but shown as `Ab` on the report card.
   _Writes:_ `marks` (`workspace_id`, `exam_subject_id`, `student_id`, `marks_obtained numeric(6,2) null`, `is_absent bool`, `remarks`, `recorded_by`, `recorded_at`). Unique `(exam_subject_id, student_id)`.
   _Events:_ `audit_events`: `mark.saved` with before/after per changed row — a mark change is the single most disputed write in a school and must be answerable.
6. **Lock.** Once the exam is published, `marks` become read-only to teachers; an admin with `marks.edit_published` may still correct one, which writes an audit event **and** flips the affected student's report card to `stale`, forcing a re-render before reprint.

### Stage C — Compute GPA and rank (one SQL function, never the client)

7. `app.compute_exam_results(exam_id)` writes `exam_results` (`exam_id`, `student_id`, `section_id`, `total_obtained`, `total_full`, `percent`, `gpa numeric(3,2)`, `letter`, `rank_in_section`, `rank_in_grade`, `subjects_failed`, `computed_at`). Rules:
   - per `exam_subjects`: `percent = obtained / full_marks × 100` → `grade_scales` lookup → `letter` and `grade_point`;
   - **GPA = mean of the subject grade points** over subjects with `counts_in_gpa = true`;
   - **an F in any counted subject ⇒ GPA 0.00** when `grade_scales.fail_zeroes_gpa` (BD default true);
   - optional-subject handling (the BD 4th-subject rule) per `subjects.is_optional` — the optional subject's points above 2.00 are added, per school setting;
   - **rank** = dense rank by `gpa desc, total_obtained desc`; ties share a rank and the next rank skips accordingly; students with incomplete marks are **unranked** (`rank is null`), never ranked as if they had scored zero.
8. The results screen refuses to publish while any `marks` row for a scheduled `exam_subject` is null, and lists the exact gaps: _"Class 7 – B · Physics · 8 students"_ with a deep link. Publishing over gaps requires an admin override with a typed reason, which is audited.

### Stage D — Publish

9. **Publish** sets `exams.published_at` and `status='published'`.
   _Events:_ `audit_events`: `exam.published`. `notifications`: `exam.published` to every `guardian_users` account linked to a student in the exam's sections, `action_url=/family?tab=results&exam={id}`, plus `jobs` rows for email per `notification_preferences`.
   Before this moment the parent portal shows **nothing** about this exam — not zeros, not "pending".
10. **Unpublish** exists (mistakes happen) and is audited loudly; parents who already opened the result keep no cached copy because the portal reads live.

### Stage E — AI teacher comments, with approval (PRODUCT-DECISIONS §6.6)

11. **`/app/reports/report-cards`** → pick section + exam → **Comments** tab. The class teacher taps **Generate with AI**. The cost line reads "Uses 1 credit per student · you have 96".
    _Server:_ `ai.reserve(workspace, user, 'report_comment.generate')` → prompt `report_comment.v1` → structured output (Zod) → `ai.settle` → `ai_generations` row.
    **The prompt receives the student's first name, grade-level label, per-subject percentages and the attendance percentage — and nothing else.** No guardian data, no health data, no full name, no ID (PRODUCT-DECISIONS §5.3 / F-TE-01 §5.8 rule applied here).
    _Writes:_ `report_comments` (`workspace_id`, `exam_id`, `student_id`, `body`, `language`, `status='draft'`, `generated_by_ai=true`, `ai_generation_id`, `prompt_version`).
12. The teacher reviews each comment in a swipeable card stack on phone (edit inline, **Approve** / **Skip**), or a two-column table on desktop with **Approve all**.
    _Writes:_ `report_comments.status='approved'`, `approved_by`, `approved_at`. _Events:_ `audit_events`: `report_comment.approved`.
    **A comment with `status != 'approved'` never renders on a parent-visible document.** This is the fix for the prototype's comments that lived in React state and vanished on navigate.

### Stage F — Bulk report cards and the print queue

13. **Generate for the section** enqueues `jobs{type:'reportcard.render.bulk', payload:{sectionId, examId}}`. The job renders one A4 PDF per student with React-PDF and one merged file for printing:
    - header from `school_profiles` (name, address, EIIN, logo) — **never a hardcoded academy name**;
    - student block: name, `STU-2026-00001`, section, roll, academic year, exam title, term;
    - subject table: subject (Bengali name when the document language is `bn`), full marks, obtained, percent, letter, grade point;
    - summary: total, percent, **GPA**, letter, **rank in section**, subjects failed, attendance % for the term;
    - the approved teacher comment;
    - signature rules for class teacher and principal; generated-on date in Asia/Dhaka.
      The section name and the school header are **snapshotted at publish time** so a later rename never alters an issued document (F-AC-01 §11.5).
      _Writes:_ `files` (`visibility='private'`, one per student + one merged), `print_jobs` (`kind='report_card'`, `copies` defaulted to the active enrolment count, `file_id`, `status='queued'`).
      _Events:_ `notifications`: `print.ready` to the requester. `audit_events`: `report.rendered`.
14. **`/app/print`** lists queued jobs as cards with copies, pages and total sheets. v1 actions: **Print** (opens the browser print dialog for the merged PDF) and **Download**. There is no fake printer status; `printers` and live status arrive with the Tauri agent (PRODUCT-DECISIONS §6.4).
15. **Mark sheet** (`/api/pdf/mark-sheet`) is the same pipeline with a section × subject matrix, for the office wall and the board file.

### Stage G — Parent view

16. **`/family` → Results.** One card per published exam: GPA in 32 px, letter, rank ("12th of 38"), then a per-subject list with marks and letters, the teacher's approved comment, and a **Download report card** button that fetches `/api/files/{id}` → a 5-minute signed URL after the `app.is_guardian_of` check, logged to `file_access_log`.

---

## 4. Failure and edge cases

| Case                                                     | Detection                                            | UI behaviour                                                                                                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marks entered above full marks                           | Zod + DB check                                       | Inline field error; the row keeps focus; the batch does not save                                                                                                                    |
| Student absent from a paper                              | `is_absent` toggle                                   | Excluded from the subject average; renders `Ab` on the report card; counted as a fail for GPA **only** if the school's policy says so (`grade_scales.absent_is_fail`, default true) |
| Incomplete marks at publish                              | Server pre-check                                     | Blocking list with deep links; override requires a typed reason and is audited                                                                                                      |
| Tied GPA and total                                       | `dense_rank`                                         | Both students share the rank; the next rank skips; the report card prints the shared rank                                                                                           |
| Unranked student (incomplete marks)                      | `rank is null`                                       | Report card prints `—` for rank, never `0`                                                                                                                                          |
| Grade scale edited after publishing                      | Version guard on `grade_scales`                      | Editing a scale referenced by a published exam is refused; the school creates a new scale effective from the next year                                                              |
| Mark corrected after publishing                          | `marks.edit_published`                               | Audit event + `exam_results` recomputed for that student + their report-card file marked `stale`; reprint is forced before the queue will accept it again                           |
| AI comment generation fails (timeout / schema / refusal) | `adapters/ai`                                        | Reservation released, **nothing charged**, inline alert inside the sheet, Retry enabled. `ai_generations.status` records the failure class                                          |
| Zero credits                                             | `ai_credit_ledger` balance                           | Generate is disabled with "Not enough credits — Request credits" → WF-05 §credit request                                                                                            |
| Teacher never approves a comment                         | `report_comments.status='draft'`                     | The report card renders **without** a comment block rather than with an unapproved one; the generate screen shows "12 of 38 approved"                                               |
| Bulk render times out                                    | `jobs` retry with backoff ×3                         | The card shows per-student progress ("31 of 38 rendered"); partial results are usable; failures are listed by student                                                               |
| Bengali glyphs drop in the PDF                           | Font-embedding snapshot test                         | CI fails before release; at runtime a missing glyph raises `PDF_FAILED` rather than printing boxes                                                                                  |
| Parent opens a result for an unpublished exam            | `published_at is null` filter in the guardian view   | Not found — the exam's existence is not leaked                                                                                                                                      |
| Two admins publish simultaneously                        | `published_at` set with `where published_at is null` | Second call is a no-op returning the first result; one notification fan-out                                                                                                         |

---

## 5. What the Base44 prototype did instead

There was **no GPA, no weighting, no subject credit, no pass mark and no ranking anywhere in the code** (inventory 02 §1). Terms were a hardcoded five-value enum on `Mark`, and the marks screen's own `TERMS` list dropped "Mid Term", which the schema and the student-detail screen both used — so mid-term marks were unreachable from the entry screen. `Exam` and `Mark` were **completely unconnected**: there was no `Mark.exam_id`, marks were organised by "component" (Quiz / Class Test / Homework / Oral / Midterm / Final Exam / Project / Classwork), and the exam lifecycle was one "Advance Status" button cycling `upcoming → paper_ready → conducted → graded → upcoming` — it **wrapped**, so one extra click silently reverted a graded exam to upcoming, and `graded` never required a single mark to exist. Marks were saved with one sequential `await` per student with no try/catch and no partial-failure report. Four independent, mutually inconsistent grade-letter implementations shipped, one of which — the parent portal's — used a different band set entirely, so the same 72 % displayed as "B+" to the teacher and "C" to the parent. Averages disagreed too: the student profile used an unweighted mean of percentages with a denominator bug that dragged the average down, while the report card used a mark-weighted total. The report card itself lived at `/reports`, rendered one student at a time, had **no bulk generation**, hardcoded the school name to **"TeachFlow Academy"** instead of reading `SchoolSettings.name`, and exported via `window.print()` with **no `@media print` CSS anywhere in the repository**, so the sidebar and navigation printed too. Its AI teacher comments were a real `InvokeLLM` call whose output was held in `useState` and **never persisted** — lost on navigate, never reviewed, never approved, and never metered against any credit system. Three separate report engines coexisted (`StudentReportCard`, `pdfReports.js`, and an orphaned `ProgressReportGenerator` that nothing imported) with **four different grade/threshold vocabularies**, so any two reports for the same student could legitimately disagree.
