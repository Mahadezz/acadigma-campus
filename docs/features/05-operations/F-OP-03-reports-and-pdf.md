# F-OP-03 — Reports and PDF rendering

|                  |                                                                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | ops                                                                                                                                                                                                                         |
| Status           | in progress — Parts 1-2 shipped (D-204, D-205); Part 3 shipped fixture-backed (D-206); Parts 4-8 not started                                                                                                               |
| Owner branch     | `feat/ops-reports`                                                                                                                                                                                                          |
| Depends on       | F-AC-0x (students, sections, enrollments, exams, marks, attendance), F-AC-0x (`grade_scales` + GPA function), F-OP-06 (staff records), F-OP-07 (`school_profiles`, branding), F-OP-04 (print queue hand-off), files/storage |
| Plan             | `docs/plan/ROADMAP.md` chunk TBD                                                                                                                                                                                            |
| Base44 reference | `docs/reference/base44-inventory/05-operations.md` §1.4, §3 rows 54–63, §4.5, §5 (Reports), §6.2, §7.13, §8 Q10–Q12                                                                                                         |

---

## 1. Purpose

A school's year is measured in paper: report cards for parents, an attendance register the inspector asks for, a mark sheet the exam committee signs, a staff attendance summary for the monthly meeting, a profile sheet when a student transfers, and ID cards in September. **Reports** is the one place that produces all of them, from the real tables, with the school's own name and logo on the header, in Bengali or English, as a real PDF file — not a `window.print()` of the app with the sidebar in it.

**What Base44 intended and what was fake.** Three unrelated report engines coexisted (§1.4): a live on-screen report card at `/reports` exported with `window.print()`, a pair of hand-drawn jsPDF documents reached from other pages, and a third orphaned jsPDF generator nobody imported (§3 row 63). There was **no report-type picker at all** — `/reports` produced exactly one artefact (§4.5). The report card printed the literal string **"TeachFlow Academy"** on every school's paper (§7.13) and the orphan printed "School Troop". There was **no `@media print` CSS anywhere in the repo**, so "Download" printed the navigation (§3 row 59). **Four different grade-band vocabularies and two different averaging methods** coexisted, so any two reports for the same student could disagree (§5, closing note). AI teacher comments were real LLM calls whose output lived in `useState` and vanished on navigate (§7.13), with the result assigned into JSX with no shape guard. Bulk generation for a class did not exist (§3 row 60).

**Done looks like:** a teacher picks _Report card · Class 6 – A · Half-yearly_, taps Generate, and a minute later downloads one PDF containing 34 report cards with Bengali names rendered correctly, the school's logo, grades from the one grade scale the school configured, and teacher comments that a teacher actually approved — or sends the same file straight to the print queue with 34 copies already counted.

## 2. Roles and permissions

| Action                                           | Permission key                      | owner | admin |            teacher            | staff |    parent    | platform |
| ------------------------------------------------ | ----------------------------------- | :---: | :---: | :---------------------------: | :---: | :----------: | :------: |
| Open reports                                     | `report.view`                       |  ✅   |  ✅   |              ✅               |   —   |      —       |    —     |
| Render report card (single)                      | `report.render.report_card`         |  ✅   |  ✅   |         own sections¹         |   —   |      —       |    —     |
| Render report cards (bulk, per section per exam) | `report.render.report_card_bulk`    |  ✅   |  ✅   | class teacher of that section |   —   |      —       |    —     |
| Render attendance register                       | `report.render.attendance_register` |  ✅   |  ✅   |         own sections¹         |   —   |      —       |    —     |
| Sign attendance register (class teacher)         | `report.register.sign`              |  ✅   |  ✅   |         own sections¹         |   —   |      —       |    —     |
| Countersign / lock / reopen attendance register  | `report.register.countersign`       |  ✅   |  ✅   |               —               |   —   |      —       |    —     |
| Render exam mark sheet                           | `report.render.mark_sheet`          |  ✅   |  ✅   |     own section-subjects      |   —   |      —       |    —     |
| Render staff attendance summary                  | `report.render.staff_attendance`    |  ✅   |  ✅   |               —               |   —   |      —       |    —     |
| Render student profile sheet                     | `report.render.student_profile`     |  ✅   |  ✅   |         own sections¹         |   —   |      —       |    —     |
| Render ID cards                                  | `report.render.id_card`             |  ✅   |  ✅   |               —               |   —   |      —       |    —     |
| Render cover payroll monthly (F-OP-02)           | `report.render.cover_payroll`       |  ✅   |  ✅   |               —               |   —   |      —       |    —     |
| Write / edit a report comment                    | `report.comment.write`              |  ✅   |  ✅   |     own section-subjects      |   —   |      —       |    —     |
| Generate a comment with AI                       | `report.comment.ai`                 |  ✅   |  ✅   |     own section-subjects      |   —   |      —       |    —     |
| **Approve** a report comment                     | `report.comment.approve`            |  ✅   |  ✅   |     own section-subjects²     |   —   |      —       |    —     |
| Publish report cards to parents                  | `report.publish`                    |  ✅   |  ✅   |         class teacher         |   —   |      —       |    —     |
| Download a published report card                 | —                                   |  ✅   |  ✅   |              ✅¹              |   —   | own children |    —     |
| Edit PDF branding                                | `settings.branding.write`           |  ✅   |  ✅   |               —               |   —   |      —       |    —     |

¹ "own sections" = the member is the class teacher of the section or teaches a `section_subjects` row in it.
² A subject comment is approved by that subject's teacher (or by an admin). The overall/class-teacher comment is approved by the class teacher or an admin. A teacher can never approve another teacher's subject comment.

**Plan entitlement:** `reports` is a **Starter** entitlement (PRODUCT-DECISIONS §5.1). Free workspaces see the module locked with an upgrade card; report cards for parents are therefore also Starter+.

## 3. Data

> **Proposed; `docs/architecture/DATA-MODEL.md` wins.**

### 3.1 `report_runs` — a render is a job, not a click

| Column                                                       | Type                 | Notes                                                                                                                                                     |
| ------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace_id`                                               | uuid                 | tenant key                                                                                                                                                |
| `kind`                                                       | enum `report_kind`   | `report_card \| report_card_bulk \| attendance_register \| mark_sheet \| staff_attendance_summary \| student_profile \| id_card \| cover_payroll_monthly` |
| `params`                                                     | jsonb                | validated by a per-kind Zod schema (`ReportParams` discriminated union)                                                                                   |
| `status`                                                     | enum `report_status` | `queued \| rendering \| ready \| failed \| expired`                                                                                                       |
| `file_id`                                                    | uuid → `files`       | the merged PDF                                                                                                                                            |
| `page_count`, `item_count`                                   | int                  |                                                                                                                                                           |
| `locale`                                                     | enum                 | `bn \| en` (default from `school_profiles.report_locale`)                                                                                                 |
| `requested_by`, `requested_at`, `started_at`, `completed_at` |                      |                                                                                                                                                           |
| `duration_ms`                                                | int                  | for the performance budget                                                                                                                                |
| `error_code`, `error_detail`                                 | text                 | surfaced verbatim to the requester                                                                                                                        |
| `idempotency_key`                                            | text                 | `hash(workspace, kind, params, dataVersion)` — an identical request within 10 minutes returns the same run                                                |
| `expires_at`                                                 | timestamptz          | default `+30 days`; a cron marks `expired` and deletes the file                                                                                           |

`report_run_items (report_run_id, subject_type ∈ student|staff|section, subject_id, file_id nullable, page_from, page_to, status, error_detail)` — for bulk runs: per-student page ranges and, when `split_files` is requested, one file per student (used by the parent portal, which must not hand a parent the whole class).

Index `(workspace_id, kind, requested_at desc)`, `(status)` for the drainer.
RLS: select for `has_role(workspace_id,'{owner,admin,teacher}')` **and** `requested_by = current_user or has_role(…,'{owner,admin}')`; insert via server action only; parents read published report cards through `report_publications`, not this table.

### 3.1a `attendance_register_signoffs` (new; proposed — R1)

The attendance register is a legal/inspection document (§1) and a plain re-render is not a record of who attested it. One row per section per month.

| Column                                        | Type                           | Notes                                                                                     |
| --------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| `workspace_id`                                | uuid                           | tenant key                                                                                |
| `section_id`                                  | uuid                           |                                                                                           |
| `period_label`                                | text                           | `YYYY-MM`, the month the register covers                                                  |
| `report_run_id`                               | uuid → `report_runs`           | the specific rendered register PDF this sign-off attests to                               |
| `status`                                      | enum `register_signoff_status` | `open \| class_teacher_signed \| countersigned` — `countersigned` **is** the locked state |
| `class_teacher_id`, `class_teacher_signed_at` |                                | set by the sign action; must be the section's class teacher or an admin/owner             |
| `head_id`, `head_countersigned_at`            |                                | set by the countersign action; must be owner/admin (the "head" role for this purpose)     |
| `reopened_by`, `reopened_at`, `reopen_reason` |                                | set only when an owner/admin force-reopens a `countersigned` month (§4, §9)               |
| `created_at`, `updated_at`                    |                                |                                                                                           |

Unique `(workspace_id, section_id, period_label)` — one sign-off record per section per month, superseded in place on reopen rather than duplicated.
RLS: select `has_role(workspace_id,'{owner,admin,teacher}')` scoped to sections the teacher teaches, as elsewhere in this feature; insert/update only through the sign/countersign/reopen server actions (never a direct client write, so the state machine in §5.2a cannot be skipped).

**Month-close lock.** While a section's row is `countersigned` for a given `period_label`, that month's underlying `attendance_records` for that section are **not editable** — F-AC's attendance-write path checks this table and refuses with `PERIOD_LOCKED` (cross-feature dependency, tracked here because the lock is owned by the register's sign-off state, not by the attendance feature itself). Only an owner/admin **reopen** (§4, audited, reason required) clears the lock, reverting to `open` and requiring both signatures again before the month can close.

### 3.2 `report_comments`

| Column                                    | Type                  | Notes                                          |
| ----------------------------------------- | --------------------- | ---------------------------------------------- |
| `workspace_id`                            | uuid                  |                                                |
| `student_id`, `exam_id`                   | uuid not null         |                                                |
| `section_subject_id`                      | uuid null             | **null = the overall / class-teacher comment** |
| `body`                                    | text not null         | ≤ 600 characters                               |
| `source`                                  | enum                  | `manual \| ai`                                 |
| `ai_prompt_version`, `ai_credits_charged` | text/int              | traceability for §3.3 of PRODUCT-DECISIONS     |
| `status`                                  | enum `comment_status` | `draft \| approved`                            |
| `author_id`, `approved_by`, `approved_at` |                       |                                                |
| `parent_visible`                          | bool generated        | `status = 'approved'`                          |

Unique `(student_id, exam_id, coalesce(section_subject_id, '00000000-…'))` — one comment per student per exam per subject.
**A comment renders on a parent-visible report card only when `status='approved'`.** Draft comments render on the internal preview watermarked _DRAFT — not visible to parents_. This is the fix for §7.13's vanishing AI comments.
RLS: teachers may insert/update rows for their own `section_subject_id`s and may approve only those; admins/owners anything in the workspace; parents never touch the table (they see the rendered PDF).

### 3.3 `report_publications`

`(workspace_id, exam_id, section_id, report_run_id, published_by, published_at, unpublished_at, visible_to_parents bool)` plus per-student `report_publication_items(publication_id, student_id, file_id)`.
Publishing is the single act that makes a report card visible in `/family`. Unpublishing hides it again (the file survives, the link 403s).

### 3.4 Branding — read from `school_profiles` (F-OP-07)

`name`, `logo_file_id`, `address`, `eiin`, `board`, `phone`, `email`, `website`, `report_accent_colour`, `report_header_lines jsonb`, `report_footer_note`, `signature_labels jsonb` (`{class_teacher, principal, guardian, examiner}`), `report_locale`, `watermark_text`.
**No report template may contain a hardcoded school name, address or logo.** Enforced by a CI test that greps `packages/pdf` for the banned strings (`TeachFlow`, `School Troop`, `Acadigma Academy`, …) and by a unit test that renders every template against two different fixtures and asserts the headers differ.

### 3.5 Tables read

`students`, `guardians`, `enrollments`, `sections`, `grade_levels`, `subjects`, `section_subjects`, `exams`, `exam_subjects`, `marks`, `grade_scales` + `grade_scale_bands`, `attendance_sessions`, `attendance_records`, `staff_attendance`, `staff_records`, `workspace_members`, `custom_labels`, `files`, `id_counters`, `ai_credit_ledger`.

### 3.6 Fonts and assets

`packages/pdf/assets/fonts/` — **Noto Sans Bengali** (Regular 400, SemiBold 600) for Bengali, **Inter** (400, 600) for Latin digits and English, both subset to the Unicode ranges actually used, registered once via `Font.register` with a `fontFamily: 'NotoSansBengali, Inter'` fallback chain. Bengali digits are rendered per `report_locale` (`bn` → ০১২৩, `en` → 0123) by one helper `formatNumber(value, locale)`; **no template formats a number itself**. Hyphenation is disabled for Bengali (`Font.registerHyphenationCallback(w => [w])`) because @react-pdf's default Latin hyphenation breaks conjuncts.

## 4. Workflows

### W1 — Render a single report (the common path)

Trigger: user at `/app/reports` picks a report type card.

1. A **parameters sheet** (phone) / dialog (desktop) opens with only the fields that kind needs — e.g. report card: section → student → exam → language → include attendance? include comments?
2. **Preview** renders the first page in the browser as an image (server-rendered thumbnail of page 1) so the user sees the header and layout before committing.
3. **Generate** creates a `report_runs` row `queued` and returns immediately. The UI shows an inline progress card ("Rendering… page 3 of 34") driven by Realtime on `report_runs`/`report_run_items`.
4. The job drainer (Vercel cron route, every minute, plus an immediate in-request kick for single-item runs) renders with `@react-pdf/renderer` in a Node runtime route, streams to Supabase Storage (`private` bucket), creates the `files` row, sets `status='ready'`, `file_id`, `page_count`.
5. Outcome: three actions on the finished card — **Download** (signed URL, 5 min, logged), **Print** (opens the browser print dialog on the PDF), **Send to print queue** (F-OP-04, copies pre-filled).
   Failures: missing marks for a student → the student is rendered with "—" in those cells and listed in a **"12 of 34 students have incomplete marks"** banner, not silently omitted; a hard render error sets `failed` with `error_code` and a Retry button; a timeout (>120 s) fails the run and suggests splitting the batch.

### W2 — Bulk report cards (per section, per exam)

Trigger: _Report cards → Whole section_.

1. Parameters: section, exam, language, include comments, **split into one file per student** (default on — the parent portal needs it), order (roll number / name / rank).
2. The run creates one `report_run_items` row per enrolled active student up front, so progress is honest.
3. Rendering is chunked: 10 students per chunk, each chunk a separate job attempt; a failed student fails only their item.
4. Result: one merged PDF (page breaks per student, even-page padding if `duplex_friendly`) **plus** N per-student PDFs when split is on.
5. **Publish to parents** is a separate, explicit action (W5).
   Failures: a student with no marks at all in that exam → item `failed` with `no_marks`, excluded from the merged file, and named in the summary.

### W3 — Report comments (with AI)

Trigger: teacher opens _Comments_ for a section+exam.

1. A list of students with their subject result; for each, a comment box. **Generate with AI** costs credits (`parent message`-class action, priced in `ai_actions`) and calls Claude with structured output validated by Zod — the raw result is **never** assigned into render state unguarded (the §7.13 crash risk).
2. Generated text lands as `source='ai'`, `status='draft'`, fully editable.
3. **Approve** (per comment, or _Approve all visible_) sets `status='approved'`, `approved_by`, `approved_at`. Only approved comments reach a parent-visible render.
4. Edits after approval drop the comment back to `draft` (and hide it from parents until re-approved) — an approved statement about a child cannot change silently.
   Failures: zero AI credits → hard block with "request credits" (PRODUCT-DECISIONS §3.3); AI output failing schema validation → error toast, no credits settled beyond the reservation refund.

### W4 — ID cards

Trigger: _ID cards_ → choose audience (students of a section / all staff), template (portrait 54×86 mm), and sheet layout (10-up on A4, with crop marks).
Each card carries the school logo, name, photo, the sequential ID (`STU-2026-00001` / staff code), section, blood group (optional), guardian phone (optional), validity year, and a **QR code containing a signed token** (PRODUCT-DECISIONS §3.10) — `HS256` over `{workspace_id, subject_type, subject_id, issued_at, version}`, verified by `/api/id/verify`. Cards for students without a photo render a neutral placeholder and are listed in the summary.

### W5 — Publish to parents

Trigger: class teacher taps **Publish** on a finished bulk run.
Confirm sheet naming the section, exam, student count and how many comments are still draft ("8 comments are not approved and will not appear"). On confirm: `report_publications` + per-student items; notification `report.published` to each linked guardian; the card appears in `/family` under the child. **Unpublish** reverses visibility.

### W6 — Phone flow (explicit)

`/app/reports` at 360×800 is a **single column of report-type cards** (icon, name, one-line description). Tapping one opens a **bottom sheet** of parameters with selects that open as full-screen pickers (section and student lists are long). The primary Generate button is a full-width 44 px button pinned to the bottom of the sheet. Runs in progress appear as a **collapsed strip above the bottom nav** ("Rendering 3 of 34 — tap to view") so the user can leave the screen. Finished runs live at `/app/reports/runs` as a list; the row's primary action is Download, with Print / Send to queue in an overflow. Nothing important requires a two-hand gesture, and there is no horizontal scrolling anywhere.

### W7 — Sign and lock the attendance register (R1)

Trigger: class teacher (or admin) opens a rendered `attendance_register` run for a section and month.

1. **Sign** (class teacher, or owner/admin standing in): available once the register for that `period_label` has rendered `ready`. Writes `attendance_register_signoffs{status:'class_teacher_signed', class_teacher_id, class_teacher_signed_at}` (creating the row if this is the first sign for that section/month). Only the section's own class teacher, or an owner/admin, may sign — a teacher cannot sign another class's register.
2. **Countersign** (owner/admin only, the "head" role for this purpose): available only after `class_teacher_signed`. Writes `head_id`, `head_countersigned_at`, `status='countersigned'`. **Countersigning is the lock event** — from this moment the month's `attendance_records` for that section are refused for edit (`PERIOD_LOCKED`, enforced in F-AC's write path per §3.1a) until an explicit reopen.
3. The register PDF re-renders once countersigned, printing both names, roles and dates on the signature line using `school_profiles.signature_labels` — a signed register is a different artefact from a draft one, not the same PDF with a stamp implied.
4. **Reopen** (owner/admin only, reason required, audited `attendance_register.reopened`): reverts a `countersigned` month to `open`, clearing both signatures — the month must be signed and countersigned again from scratch, so a reopened month is never silently treated as still-attested.
   Failures: signing a month whose register has not rendered yet is refused with "Generate the register first"; countersigning before the class-teacher signature is refused with `NOT_YET_SIGNED`; any edit attempt against a locked month's attendance is refused with `PERIOD_LOCKED` naming who signed and when.

## 5. Business rules and calculations

### 5.2a Register signature and month-close lock (R1)

State machine: `open → class_teacher_signed → countersigned` (= locked) `→ (reopen, audited) → open`. There is no path from `open` directly to `countersigned` — the class teacher's attestation is a prerequisite to the head's, not a formality either role can skip. `countersigned` is the **only** status that locks `attendance_records`; `class_teacher_signed` alone does not lock anything, so a class teacher's own sign-off cannot itself block an admin correcting a data-entry error before the head reviews it. Locking is scoped to **`(section_id, period_label)`** — signing off October for Class 6-A never touches November, another section, or the staff attendance summary (§5.4, which has no sign-off concept in this spec).

### 5.1 One grading truth

Every grade, grade point, GPA and rank on every report comes from **`app.compute_exam_result(student_id, exam_id)`** (F-AC-0x), which reads the school's `grade_scales`. `packages/pdf` contains **no grade band table, no percentage-to-letter map and no averaging code.** This single rule kills the four-vocabulary bug of §5.

Recap of the values the function returns (defined in PRODUCT-DECISIONS §2.4, repeated here only so the templates' field list is unambiguous):

- per `exam_subject`: `marks_obtained`, `max_marks`, `percentage = round(obtained / max × 100, 0)`, `letter`, `grade_point`, `pass boolean` (pass mark default 33, per school);
- per student per exam: `total_obtained`, `total_max`, `overall_percentage` (totals-based), `gpa = mean(grade_point over subjects)` with the BD rule _F in any subject → GPA 0.00_ (configurable), `result ∈ pass|fail`, `rank` within the section by `gpa desc, total_obtained desc`, `rank_of` = number of students with results.
- Weighted-across-exams results (e.g. 1st term 30 % / final 70 %) use the academic-year weighting configured in F-OP-07; a report card for a weighted "Annual" exam shows the components and the weighted total.

### 5.2 Attendance on a report card and in the register

From F-AC-0x's policy (PRODUCT-DECISIONS §2.2):

```
present_equivalent = present + late + half_day×half_day_factor    // late counts as present by default
attendance_percent = round(present_equivalent / session_count × 100, 0)
```

`half_day_factor` default 0.5; `late_counts_present` default true; both per school. The register shows raw codes (P A L E H) per day with a per-student row total and a per-day column total; the legend prints the school's own policy sentence so an inspector can read how the percentage was derived.
Eligibility warning: `attendance_percent < school_profiles.min_attendance_percent` (default 75) prints a **warning line**, never a block (PRODUCT-DECISIONS §2.2).

### 5.3 Exam mark sheet

Rows = students (ordered by roll), columns = `exam_subjects` in the exam's configured order, cells = `marks_obtained/max_marks` with the letter beneath, plus `total`, `percentage`, `gpa`, `rank`, `result`. Column footers: `highest`, `lowest`, `average = round(mean(obtained), 2)`, `pass_count`, `pass_rate = round(pass_count / appeared × 100, 1)`. `appeared` excludes students with no mark row at all; absent-with-zero is a mark of 0 and **is** counted — the distinction is stored on `marks.status ∈ present|absent|exempt`.

### 5.4 Staff attendance summary

Per member, for a month: `working_days` (from `working_days` minus holidays), `present`, `absent`, `late`, `leave` (by type), `half_day`, `attendance_percent` by the same formula as 5.2, plus `cover_periods_taken` and `extra_hours` from F-OP-02 (a nice-to-have that costs one join and answers the question the principal actually asks). Footer: school totals and the three lowest-attendance members (configurable, default on).

### 5.5 Student profile sheet

One page (two if guardians and medical notes overflow): identity block (photo, name, `STU-` id, DOB, gender, blood group, religion, nationality), enrolment history (`enrollments` across years), guardians with relation and phone, address, current section and roll, attendance summary for the current year, exam results table (one row per exam: total, %, GPA, rank), behaviour summary (points by term, parent-visible entries only), and health/document notes. Private files are **listed by name, never embedded** — a profile sheet is a document that leaves the building.

### 5.6 ID card QR token

```
payload = { w: workspace_id, t: 'student'|'staff', s: subject_id, i: issued_at_epoch, v: 1 }
token   = base64url(payload) + '.' + base64url(HMAC_SHA256(secret_for_workspace, payload))
qr_url  = https://{host}/id/{token}
```

`secret_for_workspace` is a per-workspace key stored server-side (never in the PDF, never in the client). Verification endpoint returns name, photo, class/designation and validity only — enough for a gate guard, nothing more. Re-issuing a card bumps `v` and invalidates older tokens for that subject when the school enables strict mode (default off, so old cards keep working for the year).

### 5.7 Render rules that apply to every template

1. **Header** (every page): logo (left, max 18 mm), school name, then `report_header_lines` (address / EIIN / board / phone), a hairline rule in `report_accent_colour`, the report title and the scope line ("Class 6 – A · Half-yearly Examination 2026").
2. **Footer** (every page): `Generated {date} {time}` in workspace timezone, `report_footer_note`, and `Page i of n`. Page numbers are real (Base44's orphan hardcoded "Page 1", §6.2).
3. **Signatures**: label row from `signature_labels`, with rules to sign on — never a pre-printed signature image.
4. **Paper**: A4 portrait default; the attendance register and mark sheet are A4 **landscape** when the column count exceeds 12; margins 12 mm, 16 mm on the binding edge when `duplex_friendly`.
5. **Draft watermark**: any render containing an unapproved comment, or any preview, is watermarked diagonally _DRAFT_.
6. **Numbers**: one `formatNumber`/`formatDate` per locale; percentages to 0 dp, GPA to 2 dp, money to 2 dp with `৳`.
7. **Overflow**: no template may clip. Long names wrap to two lines; a subject table that exceeds the page continues with a repeated header row.
8. **Empty cells** print `—`, never `0`, never blank — the difference between "absent" and "not yet marked" must be visible.

### 5.8 Idempotency and caching

`idempotency_key = sha256(workspace_id | kind | canonical(params) | locale | data_version)` where `data_version` is the max `updated_at` across the rows the report reads (computed by a per-kind SQL function). An identical request while a matching `ready` run exists and the data has not changed returns that run instead of rendering again. Any mark, comment approval or profile edit changes `data_version` and therefore forces a fresh render — a stale report card is worse than a slow one.

## 6. UI

| Screen         | Route                                | 360×800                                                               | ≥1024                                   | Primary action | Empty / loading / error                                       |
| -------------- | ------------------------------------ | --------------------------------------------------------------------- | --------------------------------------- | -------------- | ------------------------------------------------------------- |
| Report gallery | `/app/reports`                       | Single column of 7 type cards; a "Recent" strip below                 | 3-column card grid + recent runs rail   | Pick a type    | "Reports need an exam and marks first" with links             |
| Parameters     | sheet / dialog                       | Bottom sheet, full-screen pickers for long lists, sticky **Generate** | Dialog with inline preview pane         | Generate       | Validation inline; disabled Generate with the reason named    |
| Run progress   | inline + `/app/reports/runs`         | Collapsed strip above bottom nav; tap → run detail                    | Toast + runs rail                       | View           | Progress "page 12 of 34"; failed items listed                 |
| Run detail     | `/app/reports/runs/[id]`             | Page-1 thumbnail, metadata, 3 actions stacked                         | Two-pane: PDF viewer + metadata         | Download       | `failed` shows `error_code` + Retry                           |
| Comments       | `/app/reports/comments?section&exam` | Student list; tap → comment sheet with AI button, Approve             | Table with inline editors, bulk approve | Approve        | "No comments yet"; credit balance shown next to the AI button |
| Publish        | sheet                                | Confirm sheet with counts                                             | Dialog                                  | Publish        | Warns about unapproved comments                               |
| Parent view    | `/family/[student]/reports`          | List of published report cards                                        | Same                                    | Download       | "No report cards published yet"                               |

Components: `AppShell`, `DataList`, `FormSheet`, `FullScreenPicker` (new), `ProgressStrip` (new), `PdfThumbnail`, `EmptyState`, `Skeleton`, `ConfirmSheet`, `CreditBalanceChip`.
`@media print` **does** exist: `packages/ui/styles/print.css` hides the shell, nav, toasts and buttons for the rare on-screen-print path, and every report's canonical output is still the PDF (§7.13's root cause removed at both ends).

## 7. Server contracts

| Name                                  | Input                                                                                                                                                                                                                                                               | Output                                              | Errors                                                | Idempotency                 | Rate limit                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- | --------------------------- | -------------------------- |
| `createReportRun`                     | `ReportRunInput` = discriminated union on `kind` with per-kind params (`ReportCardParams`, `BulkReportCardParams`, `AttendanceRegisterParams`, `MarkSheetParams`, `StaffAttendanceParams`, `StudentProfileParams`, `IdCardParams`, `CoverPayrollParams`) + `locale` | `ReportRun`                                         | `plan_required`, `forbidden`, `no_data`, `validation` | **required**, hash per §5.8 | 60/h/user, 200/h/workspace |
| `GET /api/pdf/[runId]` (Node runtime) | signed run id                                                                                                                                                                                                                                                       | `application/pdf` stream or 302 to a signed URL     | `not_ready`, `forbidden`, `expired`                   | —                           | 300/h                      |
| `POST /api/jobs/drain` (cron)         | —                                                                                                                                                                                                                                                                   | `{ processed }`                                     |                                                       |                             | —                          |
| `retryReportRun`                      | `{ runId }`                                                                                                                                                                                                                                                         | `ReportRun`                                         | `not_failed`                                          | per run + attempt           | 30/h                       |
| `cancelReportRun`                     | `{ runId }`                                                                                                                                                                                                                                                         | `ReportRun`                                         | `already_done`                                        |                             |                            |
| `upsertReportComment`                 | `{ studentId, examId, sectionSubjectId?, body }`                                                                                                                                                                                                                    | `ReportComment`                                     | `forbidden`, `too_long`                               | per key                     | 300/h                      |
| `generateReportCommentAI`             | `{ studentId, examId, sectionSubjectId?, tone }`                                                                                                                                                                                                                    | `ReportComment` (draft)                             | `insufficient_credits`, `ai_invalid_output`           | per key + prompt version    | 60/h/user                  |
| `approveReportComments`               | `{ ids[] }`                                                                                                                                                                                                                                                         | `{ approved: n }`                                   | `forbidden`                                           | per id                      | 300/h                      |
| `publishReports`                      | `{ reportRunId, visibleToParents }`                                                                                                                                                                                                                                 | `ReportPublication`                                 | `not_ready`, `forbidden`                              | per run                     | 30/h                       |
| `unpublishReports`                    | `{ publicationId }`                                                                                                                                                                                                                                                 | `ReportPublication`                                 |                                                       |                             |                            |
| `sendRunToPrintQueue`                 | `{ runId, copies?, printNotes? }`                                                                                                                                                                                                                                   | `PrintJob` (F-OP-04)                                | `not_ready`                                           | per run                     | 60/h                       |
| `GET /api/id/verify?token`            | signed token                                                                                                                                                                                                                                                        | `{ name, photoUrl, class/designation, validUntil }` | `invalid_token`, `revoked`                            | —                           | 600/h/IP                   |

Rendering runs in a **Node runtime route** (not Edge — `@react-pdf/renderer` needs Node APIs and the font buffers), with `maxDuration` raised, memory 1024 MB, and a hard 120 s cap per chunk.

## 8. Parts (build chunks)

**Part 1 — PDF foundation** · `packages/pdf`: document shell (header/footer/page numbers/watermark/signature block) reading `school_profiles`; Noto Sans Bengali + Inter registration and subsetting; `formatNumber`/`formatDate` per locale; hyphenation off for Bengali; the banned-strings CI test; a snapshot harness that renders each template to PNG for visual diffing.
_Demo:_ one throwaway "Hello" document renders with a Bengali school name, the school's logo, and "পৃষ্ঠা ১ / ২" in the footer — from two different school fixtures, producing two different headers.

**Part 2 — Run pipeline** · `report_runs` + `report_run_items` + RLS, `createReportRun` with the idempotency hash, the Node render route, storage write + `files` row, the cron drainer, Realtime progress, the runs list and run detail screens, Download with signed URLs and access logging.
_Demo:_ enqueue a stub report, watch the progress strip on a phone viewport, download the finished file; re-request the identical params and see the same run returned without a second render.

**Part 3 — Report card (single) + grading integration** · the report card template consuming `app.compute_exam_result` exclusively, attendance block, comment slots, draft watermark, parameters sheet with preview.
_Demo:_ a single report card for a seeded student matches, cell for cell, a hand-checked fixture — and changing the school's grade scale changes the letters on the next render with no template change.

**Part 4 — Report comments + AI + approval** · `report_comments` with the uniqueness constraint and RLS, the comments screen, AI generation with credit reserve/settle and Zod-validated structured output, approve/unapprove, draft-hides-from-parents rule.
_Demo:_ generate a comment with AI (credits visibly debited), edit it, approve it, and see it appear on the re-rendered card; un-approve and watch it disappear.

**Part 5 — Bulk report cards + publish** · chunked rendering with per-student items, merged + split output, ordering options, duplex padding, the publish/unpublish flow and the parent-side list.
_Demo:_ 34 report cards for a section render in one run under the budget; a parent account sees exactly their own child's card and cannot fetch another child's file id.

**Part 6 — Attendance register + exam mark sheet** · both templates with landscape switching, legends that print the school's own policy, column statistics, incomplete-data banners; **`attendance_register_signoffs` schema + RLS, the sign/countersign/reopen actions, the `PERIOD_LOCKED` guard on `attendance_records` writes for a countersigned month, and the re-render with both signature lines** (§3.1a, §4 W7, §5.2a).
_Demo:_ the register for a month with 26 sessions prints on one landscape page with per-day and per-student totals that match a SQL cross-check; sign as class teacher, countersign as admin, then attempt to edit an attendance record in that month and see `PERIOD_LOCKED`.

**Part 7 — Staff attendance summary + student profile sheet** · both templates, the cover-hours join, private-file listing rules.
_Demo:_ a monthly staff summary whose totals reconcile against `staff_attendance`, and a profile sheet for a transferring student that lists document names without embedding them.

**Part 8 — ID cards + QR + verify endpoint** · card template, 10-up A4 sheet with crop marks, per-workspace signing secret, `/api/id/verify`, re-issue and version bump, missing-photo handling.
_Demo:_ print a sheet, scan a card with a phone camera, and land on a verification page showing the right student; a tampered token is rejected.

## 9. Acceptance criteria

**Branding and fonts**

1. _Given_ a school whose name is "আদর্শ উচ্চ বিদ্যালয়", _when_ any report renders, _then_ the header shows that name in Bengali with correct conjuncts and the logo from `school_profiles`, and the string "TeachFlow" appears nowhere in the repository (CI grep).
2. _Given_ two different schools, _when_ the same report kind renders for each, _then_ the headers differ and no hardcoded address appears.
3. _Given_ `report_locale='bn'`, _when_ a report renders, _then_ page numbers and percentages use Bengali digits.
4. _Given_ a 3-page report, _then_ every page shows "Page i of 3" with the correct i.

**Report cards** 5. _Given_ a student with marks in 6 subjects and the school's BD default scale, _when_ the card renders, _then_ the letters, grade points, GPA and rank exactly equal `app.compute_exam_result`'s output. 6. _Given_ the school changes its grade scale, _when_ the card is re-rendered, _then_ the letters change accordingly with no code change. 7. _Given_ a student with an F in one subject and the BD rule on, _then_ the card shows GPA 0.00 and result _Fail_. 8. _Given_ a student missing one subject's mark, _then_ that row shows "—", the card still renders, and the run summary names the student as incomplete. 9. _Given_ attendance of 71 % and a 75 % minimum, _then_ the card prints a warning line and still renders.

**Bulk and publish** 10. _Given_ a section with 34 active enrolments, _when_ a bulk run is requested, _then_ 34 `report_run_items` exist before rendering starts and progress reports "n of 34". 11. _Given_ one student with no marks at all, _then_ their item is `failed` with `no_marks`, the other 33 render, and the merged PDF has 33 cards. 12. _Given_ split files on, _then_ 33 per-student files exist and the parent portal links to exactly one of them per child. 13. _Given_ a published run, _when_ a parent of student X requests student Y's file, _then_ the response is 403 and the attempt is logged. 14. _Given_ 8 unapproved comments, _when_ the class teacher publishes, _then_ the confirm sheet states that 8 comments will not appear, and the published PDFs do not contain them.

**Comments** 15. _Given_ a teacher of Physics in Class 9 – B, _when_ they try to approve the Chemistry comment for the same student, _then_ the server returns `forbidden`. 16. _Given_ an approved comment, _when_ its author edits the text, _then_ `status` returns to `draft` and it stops appearing on parent-visible renders. 17. _Given_ a workspace with zero AI credits, _when_ a teacher taps Generate with AI, _then_ the action is blocked with a "request credits" path and no LLM call is made. 18. _Given_ the model returns output that fails the Zod schema, _then_ no comment row is created, the reserved credits are released, and the user sees a clear error.

**Pipeline** 19. _Given_ an identical request within 10 minutes and unchanged data, _then_ the same `report_runs` row is returned and no second render occurs. 20. _Given_ a mark is edited after a render, _when_ the same report is requested, _then_ a new render occurs (the `data_version` changed). 21. _Given_ a render that throws, _then_ `status='failed'` with a non-empty `error_code`, the UI offers Retry, and nothing is silently swallowed. 22. _Given_ a `ready` run older than 30 days, _when_ the expiry cron runs, _then_ the file is deleted and `status='expired'`, and Download shows "This file expired — regenerate".

**Registers, mark sheets, ID cards** 23. _Given_ a month with 26 attendance sessions, _then_ the register's per-student totals equal a direct SQL count and the legend states the school's late-counts-as-present policy. 24. _Given_ a mark sheet with 14 subjects, _then_ the page is landscape and no column is clipped. 25. _Given_ an ID card, _when_ the QR is scanned, _then_ `/id/{token}` shows the right student's name, photo and class; _when_ one character of the token is altered, _then_ it returns `invalid_token`. 26. _Given_ a student with no photo, _then_ the card renders a placeholder and the student is named in the run summary.

**Register sign-off and lock (R1)** 26a. _Given_ a rendered October register for Class 6-A, _when_ the class teacher signs and then an admin countersigns, _then_ `attendance_register_signoffs.status='countersigned'`, both actor ids and timestamps are recorded, and the re-rendered PDF prints both names on the signature line. 26b. _Given_ a countersigned month, _when_ any role attempts to edit or insert an `attendance_records` row for that section and month, _then_ it is refused with `PERIOD_LOCKED` naming the class teacher, the head and the sign-off date. 26c. _Given_ an admin attempts to countersign before the class teacher has signed, _then_ it is refused with `NOT_YET_SIGNED`. 26d. _Given_ a countersigned month, _when_ an owner reopens it with a reason, _then_ `status` reverts to `open`, both signature fields clear, an audit event `attendance_register.reopened` is written with the reason, and `attendance_records` for that month are editable again until it is signed and countersigned afresh. 26e. _Given_ a teacher who is not the class teacher of Class 6-A, _when_ they attempt to sign that section's register, _then_ they get `FORBIDDEN`.

**Access and tenancy** 27. _Given_ a teacher who does not teach Class 6 – A, _when_ they request that section's register, _then_ the action returns `forbidden`. 28. _Given_ an admin of School A, _when_ they query `report_runs` with their JWT, _then_ zero School B rows are returned (pgTAP). 29. _Given_ a Free-plan workspace, _when_ any report run is requested, _then_ the server returns `plan_required`.

**Phone** 30. _Given_ a 360×800 viewport, _when_ a bulk run is in progress, _then_ the progress strip is visible above the bottom nav, the user can navigate away and back, and no horizontal scrolling exists on any reports screen.

## 10. Tests

- **Unit**: `formatNumber`/`formatDate` for `bn`/`en` (digits, dates, percentages, money); the idempotency hash (stable under key reordering in `params`); attendance percent with every policy combination; mark-sheet statistics (`average`, `pass_rate`, `appeared` excluding no-mark students); the QR token signer/verifier including tamper and version cases; page-range computation for bulk merges.
- **Visual regression**: each of the 8 templates rendered to PNG from a fixed fixture and diffed against a committed baseline (threshold 0.1 %), in both locales, plus a Bengali-conjunct string test.
- **DB (pgTAP)**: isolation on `report_runs`, `report_comments`, `report_publications`; a teacher approving another teacher's subject comment; a parent selecting another child's publication item; the comment uniqueness constraint.
- **Integration**: the full run pipeline against the dev branch (enqueue → drain → storage → file row → signed URL); chunk failure isolation in bulk; credit reserve/settle on AI generation including the failure refund path.
- **e2e (360×800 and 1280×800, axe)**: J1 single report card end-to-end with download; J2 bulk 34 → publish → parent sees only their child; J3 AI comment → edit → approve → appears on card; J4 attendance register download and open; J5 ID card sheet → scan simulation against `/api/id/verify`.
- **Performance budgets**: single report card p95 ≤ 1.5 s end-to-end; bulk 40 students ≤ 25 s; attendance register for 26 sessions × 40 students ≤ 4 s; PDF size ≤ 400 KB per report card and ≤ 6 MB for a 40-student bulk (font subsetting is what makes this achievable); the render route's memory stays under 1 GB for the 40-student case.

## 11. Open questions

1. **Term vs exam.** Base44's report card was per _term_; PRODUCT-DECISIONS §2.7 makes exams the unit and §2.4 allows weighting across exams. _Default assumed:_ a report card is rendered **per exam**, and a "Term/Annual" report card is an exam of type `aggregate` whose components are the weighted exams. Confirm with the academics area.
2. **Transcript / progress report across years** is not in the v1 list (PRODUCT-DECISIONS §6.6). Tracked for FUTURE.
3. **Who owns `data_version`?** It needs one SQL function per report kind returning `max(updated_at)` over the read set. Flagged to the data-model agent; if it is not provided, the fallback is a 10-minute time-boxed cache only.
4. **ID card size and material.** _Default assumed:_ CR80 (85.6×54 mm) portrait, printed 10-up on A4 with crop marks; schools that use a card printer get a single-card PDF option.
5. **Bengali font licence.** Noto Sans Bengali is OFL — safe to embed. Any school-supplied brand font must be checked before embedding; the branding UI accepts a font upload only in FUTURE.
6. **Parent download of the merged class PDF** must never be possible; this spec relies on split files. If split is off, publishing is refused for parent visibility.

### Addendum — Parts 1-2 as shipped (D-204, D-205)

7. **Font: Hind Siliguri, not Noto Sans Bengali (§3.6, §11 OQ5).** DESIGN-SYSTEM §1.6 (D-57) fixed Hind Siliguri as the one Bengali face this product uses everywhere, specifically to match acadigma-website — a report card should not be the one artefact in a different Bengali face than the rest of the product. Noto Sans Bengali's OFL licence note in OQ5 still applies to Hind Siliguri (also OFL). See D-204.
8. **No build-time font subsetting toolchain.** `@react-pdf/renderer`'s `fontkit`/`pdfkit` embedding subsets to the glyphs a rendered document actually uses, automatically, per PDF — §3.6's subsetting requirement is met by the pipeline itself. See D-204.
9. **`report_kind` ships with one value, `'sample'`, in Parts 1-2.** Every real kind needs exam/marks data (F-AC-0x) not yet on `main`. Real kinds are added with `alter type ... add value` as their Parts land — no shape change to `report_runs`. See D-205.
10. **No cron drainer or Realtime progress in Parts 1-2.** `'sample'` is always a single-item run; §4 W1 point 4 already allows an "immediate in-request kick for single-item runs," which is what Parts 1-2 build instead. The drainer and Realtime progress are deferred to Part 5 (bulk rendering, where they are actually needed). See D-205.
11. **No PDF is persisted to Storage in Parts 1-2.** `files`/Storage exists as config (bucket provisioned, `public.files` shipped) but has no consuming code anywhere yet — no `storage.objects` RLS, no `/api/files/[id]`. Building that from scratch was judged too large a decision for this Part alone (cross-cutting for every future file-handling feature). `report_runs.file_id` stays `null`; `GET /api/pdf/[runId]` re-renders the same deterministic bytes per authorized request instead of streaming a stored object. See D-205. Tracked for whichever Part or feature builds the files/storage dependency this spec's header table already names.
12. **Access logging (§4 W1 "Download... logged")** is deferred alongside item 11 — the existing `file_access_log` table is keyed to a real `files` row, which Parts 1-2 do not create.
13. **Plan gating (§9 AC29, `plan_required`)** reuses the already-shipped `plan_modules` "reports" entitlement (`starter`/`pro`/`enterprise`, not `free`) via `packages/domain/nav`'s entitlement engine, mapped onto the `payment_required` `ApiErrorCode` (this repo's error-code enum has no separate `plan_required` value).

### Addendum — Part 3 as shipped (D-206)

14. **The report card renders from a fixture, not `app.compute_exam_result`, until F-AC-06 marks entry lands.** §8 Part 3 names the real grading function; it depends on `marks`/`results` tables that are not on `main` yet (built in parallel in another lane). `ReportCardParams` already carries real `studentId`/`examId` uuids, and one function (`getReportCardData`, `apps/web/app/(school)/app/reports/report-card-data.ts`) is the only place any caller resolves a `ReportCardDto` — swapping the fixture for the real query touches that one function's body only. See D-206.
15. **Grading is #46/D-302's shipped `grade_scales`/`grade_bands` domain (`bandFor`, `BD_GRADE_BANDS`), not the spec §3's originally proposed `grade_scale_bands` shape.** D-302 already resolved that naming disagreement for F-AC-06 Part 1; this Part reuses the same TypeScript functions rather than inventing a second grading implementation. `packages/pdf` still contains no grade-band logic of its own (§5.1) — the fixture computes every letter/GPA before the DTO reaches the template.
16. **One A4 portrait layout only, no attendance register or mark sheet yet, no comments, no signature-label customisation from `school_profiles.signature_labels`** (owner instruction: keep it lazy). Signature labels are locale-default text ("Class Teacher"/"Guardian", "শ্রেণি শিক্ষক"/"অভিভাবক") baked into the template, not read from branding. Rank is computed within the fixture's own 40-student class, not from a real `results` table's section ranking.
17. **No bulk report cards, no publish-to-parent flow, no `report_run_items` rows.** This Part renders exactly one student's card per run, synchronously, the same "immediate in-request kick" pattern items 9-10 above already established for `'sample'`.
