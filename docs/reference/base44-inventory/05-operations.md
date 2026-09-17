# 05 — Operations Inventory

### Recruitment / Hiring · Cover Teachers · Printing · Reports · Messaging

Source: `F:\Acadigma Campus\Acadigma Campus Base44 Source Code` (read-only)
Export date: `2026-09-14` (`export-report.json`)
All line numbers refer to files as exported.

---

## 1. Area summary — what the owner was trying to build

### 1.1 Recruitment — a two-sided teacher marketplace bolted onto a school SIS

The intent is legible from the entity set even where the code is missing. Three _separate_ recruitment concepts were started and never reconciled:

**(a) The marketplace concept.** Teachers publish a rich public profile (`TeacherPublicProfile` — bio, subjects, grade levels, curriculum expertise, salary expectations, preferred locations, languages, references, portfolio, intro video). CV/certificates/marksheets are explicitly **private** (`TeacherPublicProfile.jsonc:12-23`) and unlocked per-school via a consent handshake (`DocumentRequest` — school requests → candidate approves/declines with a reason). Schools browse profiles (`CandidateBrowse.jsx`), filter by availability/work type/subject, see trust badges (`verified_teacher`, `verified_degree`, `verified_certificate`, `verified_identity` — schema says "Set by SchoolTroop team ONLY", `TeacherPublicProfile.jsonc:112-131`) and a `profile_score` 0-100 "auto-calculated from completeness + verification" (`:132-136`). Schools then "Add to Pipeline" (`HiringPipeline`) and run a 6-stage flow ending in `hired`, at which point the candidate is auto-invited into the school workspace as a teacher (`HiringPipelinePage.jsx:94`).

**(b) The classic ATS concept.** Schools post `JobPosting` rows with configurable extra pipeline stages (`require_demo_lesson`, `require_background_check`). Applications arrive as `Applicant` rows carrying resume/documents URLs. Admins work a drag-and-drop Kanban (`KanbanBoard.jsx`), open a per-candidate **dossier** (profile summary + resume viewer + activity timeline + 5-criteria scorecard + templated email sender), schedule interviews (`InterviewSchedule`), and track post-offer onboarding in `HiredStaff` (contract signed / ID issued / orientation done / system access).

**(c) The teacher-facing job board.** `personal/CvJobs.jsx` lets a teacher in the "personal workspace" browse open `JobPosting`s and apply, producing a `JobApplication` row with a 200-char cover note and its own 4-state status (`submitted/viewed/shortlisted/rejected`).

**These three never connect.** (b) reads `Applicant`, (c) writes `JobApplication`, (a) writes `HiringPipeline` — and **no code anywhere creates an `Applicant`, a `HiredStaff`, or a `TeacherPublicProfile`.** See §7.

### 1.2 Cover teachers — absence → substitute → payroll

A clear and well-specified model: per class+subject+section, an admin pre-configures an **ordered priority list of up to 3 cover teachers** (`CoverTeacherConfig.cover_priority_list`). When a teacher is marked absent or misses an attendance punch (`CoverAssignment.trigger_reason: marked_absent | missed_punch`), the system creates a `CoverAssignment`, walks the priority list, notifies the cover teacher, and the assignment moves `notified → acknowledged → confirmed_by_admin → active → completed`. If the primary teacher was actually present (missed punch), an admin **overrides** with a mandatory written reason, which cancels the cover and notifies the substitute. Separately, a `PayrollImpactLog` proposes `+X BDT` for the cover teacher and `−Y BDT` for the absent teacher; the UI text is explicit that "Payroll changes are **never applied automatically**" (`PayrollImpactPanel.jsx:44`) — an admin applies or ignores each one and the decision is permanently logged.

**Nothing creates a `CoverAssignment` or a `PayrollImpactLog`.** The whole surface is read/update-only on data that can never arrive. See §7.

### 1.3 Printing — cloud queue + on-prem agent bridge

The most coherent design in the area, and the only one with a real multi-tenant story. Schools register physical `Printer` rows (name, location, IP, model, live status, paper level). Teachers/admins create `PrintQueue` jobs typed as `Handout | Report Card | Attendance Sheet | Exam Paper | Custom`, optionally targeting a class — **and copies auto-populate from the class's active student count** (`NewPrintJobDialog.jsx:44-48`). A job carries `document_url`, `copies`, `total_pages`, `notes`, `scheduled_at`. The intended executor is a **Print Agent**: a Python/Raspberry-Pi daemon that polls the Base44 REST API for `status:"queued"` jobs for its `printer_id`+`workspace_id`, claims them by flipping to `printing`, downloads `document_url`, pipes it to CUPS `lp`, then reports `completed`/`failed` (`PrintAgentSetup.jsx:127-162`). The Print Center UI's buttons are deliberately the _manual fallback_ for that same state machine.

Note: print quantity is **student-count-informed, not attendance-informed** — `Attendance` is never read by any print code.

### 1.4 Reports — PDF report cards + analytics exports

Two unrelated report engines:

- **`ReportGenerator.jsx` (`/reports`)** — a live, on-screen **Student Report Card**: pick term (Term 1/2/3/Annual) + student, aggregate `Mark` rows by subject, show per-component breakdown, letter grade, overall %, signature blocks — plus **AI teacher comments per subject** via `InvokeLLM`. "Download" is `window.print()`.
- **`src/lib/pdfReports.js`** — two hand-drawn jsPDF documents (`exportAnalyticsPDF`, `exportStudentReportPDF`) consumed by **other areas** (`StudentAnalytics.jsx:130`, `StudentDetail.jsx:149`), not by `/reports`.
- **`ProgressReportGenerator.jsx`** — a third, orphaned jsPDF report. Nothing imports it.

No `html2canvas` is used anywhere; PDFs are vector jsPDF or browser print.

### 1.5 Messaging — Slack-lite channels, twice, plus parent outreach

Four fixed channels (`general`, `resources`, `announcements`, `admin`), one flat `Message` table, 5-second polling, file attachments via `Core.UploadFile`. Built **twice**: `/messaging` (`Messaging.jsx`) and the "Internal Messages" tab of `/communication` (`Communication.jsx:39-191`). `Communication.jsx` adds two more tabs: **Parent Communication** (deep-links to `tel:`, `mailto:`, `wa.me` using parent contact fields on `Student`) and a read-only **Student Portal Feed**. Direct messages exist as a flag (`Message.is_direct`) used only by the recruitment candidate messenger. No SMS provider, no email send from messaging, no push.

---

## 2. Data model as implemented

### 2.1 Tenancy: three incompatible conventions coexist

| Convention                                                       | Entities in this area                                                                                                                                               | RLS                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `workspace_id` + full RLS on `{{user.data.active_workspace_id}}` | `PrintQueue`, `Printer`                                                                                                                                             | **YES**             |
| `school_id`, no RLS                                              | `JobApplication`, `HiringPipeline`, `CoverAssignment`, `CoverTeacherConfig`, `PayrollImpactLog`, `Notification`*, `ActivityFeedItem`, `AuditLog`, `DocumentRequest` | only `Notification` |
| **No tenant field at all**                                       | `JobPosting`, `Applicant`, `InterviewSchedule`, `HiredStaff`, `TeacherPublicProfile`, `Message`                                                                     | NO                  |

\* `Notification` RLS scopes on `data.recipient_id = {{user.id}}`, not on `school_id`.

Two structural problems follow:

1. **`user.school_id` does not exist.** `User.jsonc` properties are: `role, account_type, bio, phone, subject_specialty, department, photo_url, staff_id, subjects, grade_levels, curriculum_focus, years_experience, current_status, display_name, seller_type, professional_type, professional_link, has_seller_profile`. Every `user?.school_id || 'default'` in this area therefore writes the literal string **`'default'`**: `CandidateBrowse.jsx:52`, `CandidateProfile.jsx:52,60,87`, `CoverTeacherConfig.jsx:49`, `CoverAssignmentPanel.jsx:67`, `HiringPipelinePage.jsx:80,97`. `logAudit`/`logActivity` fall back to the string `'unknown'` (`auditLog.js:24`, `activityFeed.js:22`).
2. **`user.data.active_workspace_id` is also not a declared `User` property**, yet `PrintQueue`/`Printer`/`Class`/`Student`/`Mark`/`Attendance`/`WorkspaceMember` RLS all key on it. It is written blind via `base44.auth.updateMe({ active_workspace_id })` (`SchoolContext.jsx:56, 78`) inside a `try{}catch{}` that swallows failure with the comment "RLS may return empty until next sync". If that write is rejected, **every RLS-protected read returns empty** and the app silently shows a blank Print Center.

### 2.2 Entity reference

#### `JobPosting` — `base44/entities/JobPosting.jsonc`

Purpose: a vacancy. **No tenant field, no RLS — every school sees every school's vacancies.**
Fields: `title*`, `department*` (`Primary|Secondary|Early Years|Admin|Support|Other`), `employment_type*` (`Full-time|Part-time|Contract|Substitute`), `subjects` (comma-separated **string**, not array), `required_qualifications`, `preferred_qualifications`, `responsibilities`, `salary_min`, `salary_max`, `currency` (default `BDT`), `deadline` (date), `status` (`Draft|Open|Closed`, default `Draft`), `applicant_count` (number, default 0), `require_demo_lesson` (bool), `require_background_check` (bool).
Notes: `applicant_count` is **never written or read** — both UIs recompute counts client-side (`JobCenter.jsx:67-70`, `HiringPortal.jsx:174`). `require_*` flags drive optional Kanban columns (`KanbanBoard.jsx:108-115`).

#### `JobApplication` — `JobApplication.jsonc`

Purpose: teacher-side application record. Tenant: `school_id` (no RLS).
Fields: `teacher_id*`, `teacher_email`, `teacher_name`, `school_id*`, `school_name`, `job_posting_id*`, `job_title`, `status` (`submitted|viewed|shortlisted|rejected`, default `submitted`), `cover_note` (max 200), `submitted_at`.
Notes: written only by `CvJobs.jsx:128`. **Read by no school-side screen.** Its `status` is never updated by anything — a teacher's application is frozen at `submitted` forever.

#### `Applicant` — `Applicant.jsonc`

Purpose: school-side candidate in the ATS pipeline. **No tenant field, no RLS.**
Fields: `job_posting_id*`, `full_name*`, `email*`, `phone`, `cover_letter`, `resume_url`, `documents_url`, `status` (`new|shortlisted|demo_lesson|background_check|interview_scheduled|offered|rejected`, default `new`), `status_updated_at` ("used for time-in-stage calculation"), `notes`, `applied_at`.
Notes: **no `.create()` exists anywhere in `src/`** — only `.update()` at `KanbanBoard.jsx:119`, `ApplicantDossier.jsx:37`, `HiringPortal.jsx:93`. The intended ingress was a public `/apply/:jobId` page (`JobCenter.jsx:32` builds that link) which **is not in the router**.

#### `HiringPipeline` — `HiringPipeline.jsonc`

Purpose: marketplace-sourced candidate track. Tenant: `school_id` (no RLS).
Fields: `school_id*`, `candidate_id*` (→User), `status` (`screening|interview_scheduled|interview_completed|offer_sent|hired|not_selected`), `added_by*`, `interviewer_id`, `interview_type` (`google_meet|in_person`), `interview_link`, `interview_location`, `interview_date`, `interview_time`, `notes`.
Notes: created at `CandidateBrowse.jsx:51` and `CandidateProfile.jsx:86`; the only screen that _advances_ it (`HiringPipelinePage.jsx`) is **not imported by anything**. `interviewer_id` and `notes` are never written. Stage vocabulary is a third, incompatible one vs. `Applicant.status` and `JobApplication.status`.

#### `InterviewSchedule` — `InterviewSchedule.jsonc`

Fields: `applicant_id*`, `date*`, `time*`, `format` (`in-person|video`, default `video`), `notes`, `created_by`. **No tenant field.**
Notes: created at `HiringPortal.jsx:98`; the list query at `HiringPortal.jsx:77-80` is assigned to `interviews` and **never referenced again**. `created_by` is never set. Not surfaced on the Kanban, the dossier, or any calendar.

#### `HiredStaff` — `HiredStaff.jsonc`

Fields: `name*`, `position*`, `department`, `join_date`, `contract_signed`, `id_issued`, `orientation_done`, `system_access` (all bool, default false), `notes`. **No tenant field.**
Notes: `.update()` only (`HiringPortal.jsx:108`). **No `.create()` anywhere** → the Onboarding Tracker tab is permanently empty. No link back to `Applicant` or `User`.

#### `TeacherPublicProfile` — `TeacherPublicProfile.jsonc`

Purpose: the teacher's marketplace listing. **No tenant field (correct — it's cross-school), no RLS (incorrect — `cv_url`/`certificate_urls`/`marksheet_urls` are documented PRIVATE but nothing enforces it).**
Fields: `user_id*`, `profile_photo_url`, `cv_url`, `certificate_urls`, `marksheet_urls` (JSON-array-in-string), `bio` (≤500), `subjects`, `grade_levels`, `curriculum_expertise`, `languages`, `preferred_locations`, `references`, `portfolio_urls` (all JSON-in-string), `years_experience`, `education_qualifications` (JSON `{degree, institution, year}[]`), `preferred_work_type` (`full_time|part_time|cover_teacher|tutor|any`), `salary_min/max` (BDT), `preferred_school_type` (`government|private|international|madrasa|any`), `intro_video_url`, `availability_status` (`available_now|available_30_days|not_looking`), `profile_visibility` (`active|paused`, **default `paused`**), `verified_teacher/degree/certificate/identity` (bool), `profile_score` (0-100).
Notes: **read-only across the entire codebase** (`CandidateBrowse.jsx:34` is the only reference). Teacher profile editors write to the `User` entity instead (`TeacherProfile.jsx:58`, `personal/Profile.jsx:42` both call `base44.auth.updateMe`). `profile_score` is never computed. Verification flags are never set. Default `paused` + no publisher = `CandidateBrowse` filters `profile_visibility:'active'` and always returns **zero rows**.

#### `CoverAssignment` — `CoverAssignment.jsonc`

Tenant: `school_id` (no RLS).
Fields: `school_id*`, `date*`, `primary_teacher_id*`, `cover_teacher_id`, `class_id*`, `subject`, `section`, `trigger_reason*` (`marked_absent|missed_punch`), `trigger_time`, `status` (`notified|acknowledged|confirmed_by_admin|active|overridden|completed`), `admin_confirmed_by`, `admin_confirmed_at`, `duties_transferred` (bool), `overridden_by`, `override_reason`, `override_at`, `payroll_extra_hours` ("Only populated if payroll enabled").
Notes: only `.list()` and `.update()` exist (`CoverAssignmentPanel.jsx:31,48,59`). **No creator.** `acknowledged` (the teacher's own ack) has no UI. `completed` is never set. `payroll_extra_hours` is never written.

#### `CoverTeacherConfig` — `CoverTeacherConfig.jsonc`

Fields: `school_id*`, `class_id*`, `subject`, `section`, `primary_teacher_id` ("read-only, set in timetable"), `cover_priority_list` (JSON array of User FKs, ordered).
Notes: the only cover entity that is genuinely written (`cover/CoverTeacherConfig.jsx:36`). But `Class` has **no teacher FK** — only `teacher_name` (string) — so line 53 stores a _display name_ into the `primary_teacher_id` FK field.

#### `PayrollImpactLog` — `PayrollImpactLog.jsonc`

Fields: `school_id*`, `cover_assignment_id*`, `cover_teacher_id*`, `primary_teacher_id*`, `extra_hours_logged`, `hourly_rate_cover` ("from teacher's configured hourly rate at time of log"), `hourly_rate_primary`, `cover_teacher_addition_suggested`, `primary_teacher_deduction_suggested`, `admin_decision` (`pending|applied|ignored`), `decided_by`, `decided_at`.
Notes: **no creator.** No hourly-rate field exists on `User` or anywhere else, so `hourly_rate_cover/primary` have no possible source. `SchoolSettings.payroll_enabled` / `module_payroll` exist (`SchoolSettings.jsonc:95-104`) but are never read by cover code.

#### `PrintQueue` — `PrintQueue.jsonc` ← **has full RLS**

Fields: `workspace_id`, `title*`, `print_type*` (`Handout|Report Card|Attendance Sheet|Exam Paper|Custom`), `class_id`, `printer_id*`, `document_url`, `copies` (default 1), `status*` (`queued|printing|completed|failed|cancelled`), `total_pages`, `notes`, `scheduled_at`, `completed_at`.
RLS: read/create/update/delete all gated on `data.workspace_id == {{user.data.active_workspace_id}}`.
Notes: `NewPrintJobDialog.jsx:188` posts the whole form object, which includes a **`handout_id` key that is not in the schema**. `scheduled_at` is documented in the agent spec (`PrintAgentSetup.jsx:116`) but has **no UI field**. No `created_by`/`requested_by` — you cannot tell who queued a job.

#### `Printer` — `Printer.jsonc` ← **has full RLS**

Fields: `workspace_id`, `name*`, `location*`, `ip_address`, `model`, `status` (`online|offline|busy|error`), `paper_level` (`full|medium|low|empty`), `last_checked` (date), `notes`.
Notes: `status` and `paper_level` are **manually typed by humans** (`PrinterDashboard.jsx:149-153`, `:203-211`) — nothing polls the printer. The pulsing green dot is decoration.

#### `Message` — `Message.jsonc`

Fields: `sender_email*`, `sender_name`, `recipient_email` ("empty = broadcast"), `channel*` (`general|resources|announcements|admin`), `subject`, `body*`, `file_url`, `file_name`, `is_direct` (bool), `thread_id`.
Notes: **no tenant field and no RLS — every message in the product is visible to every user of every school.** `thread_id` is never written or read (threading is designed, not built). The `admin` channel has no role gate.

#### `Notification` — `Notification.jsonc` ← has RLS

Fields: `school_id*`, `recipient_id*`, `sender_id`, `title*`, `message`, `type*` (`info|warning|action_required|approval_request|system|marketplace|recruitment|cover_teacher|ai_credits|billing`), `read`, `action_url`, `expires_at`.
Notes: `NotificationCenter.jsx:9-17` keys its icon map on **`print_ready|print_failed|attendance_anomaly|message|exam_reminder|system_alert|recovery_modal`** — _none of which are in the enum_, so every notification falls through to `system_alert` (`:93`). It renders `n.body` (`:105`) but the field is `message` → **notification bodies never display**. `action_url` and `expires_at` are never used; `Link` is imported and unused.

#### `ActivityFeedItem` — `ActivityFeedItem.jsonc`

Fields: `school_id*`, `actor_id*`, `action_description*`, `entity_type`, `entity_id`.
Notes: written only by `logActivity()` (`activityFeed.js:19`) — which has **zero call sites**. Entity is inert.

#### `AuditLog` — `AuditLog.jsonc`

Fields (**`required: []`** — nothing is mandatory): `school_id`, `user_id`, `action_type` ("entity.action"), `action` ("short key e.g. note, status_change"), `entity_type`, `entity_id`, `actor_id`, `actor_name`, `note`, `timestamp`, `previous_value`, `new_value`, `ip_address`, `user_agent`.
Notes: the schema is a **union of two designs** — the `logAudit` helper writes `{school_id, user_id, action_type, previous_value(JSON), new_value(JSON), ip_address, user_agent}`; the recruitment dossier writes `{entity_type, entity_id, action, actor_id, actor_name, note, timestamp, previous_value(raw), new_value(raw)}`. Recruitment additionally repurposes `AuditLog` as a **scorecard store** (`DossierScorecard.jsx:72-80`, `action:'scorecard'`, `new_value` = JSON of star ratings) and **updates rows in place** (`:66`) — directly contradicting `auditLog.js:4` ("AuditLog is read-only (no edit, no delete)"). There is **no AuditLog viewer page** anywhere in the app despite `PERMISSIONS.audit_log_view` existing.

#### `DocumentRequest` — `DocumentRequest.jsonc` (touched by this area)

Fields: `school_id*`, `requesting_superadmin_id*`, `candidate_id*`, `status` (`pending_candidate_response|approved_by_candidate|declined_by_candidate`), `candidate_decline_reason`, `requested_at`, `responded_at`.
Notes: created by `CandidateProfile.jsx:51`. **No candidate-side approve/decline UI exists** → every request is permanently `pending_candidate_response`; `responded_at` is never written.

---

## 3. Feature table

Roles below are the _effective_ route guard (`App.jsx`) — note these diverge from `permissions.js` (§7.11).

| #   | Feature                                           | Route / location                                          | Roles                                 | Entities R / W                                                                                                             | Status                             | Evidence                                                                                                                                                                                                 | Intent                                                                             |
| --- | ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | **Hiring Office** shell (3 tabs)                  | `/recruitment` → `Recruitment.jsx`                        | superadmin, admin                     | —                                                                                                                          | WORKS                              | `App.jsx:152-154`; `Recruitment.jsx:44-68`                                                                                                                                                               | Single hiring workspace                                                            |
| 2   | Pipeline Kanban (7 cols, DnD, optimistic)         | tab `pipeline` → `KanbanBoard.jsx`                        | superadmin, admin                     | R `Applicant`,`JobPosting`; W `Applicant.status`, `AuditLog`                                                               | **DEAD (no data)**                 | `KanbanBoard.jsx:95-119`; no `Applicant.create` in `src/`                                                                                                                                                | Drag candidates through stages; audit every move                                   |
| 3   | Kanban drag permission gate                       | `KanbanBoard.jsx:93,151`                                  | —                                     | —                                                                                                                          | **BROKEN**                         | `isAdmin = user?.role === 'admin' \|\| 'superadmin'` uses the raw Base44 `User.role`, **not** `useEffectiveRole()`. A workspace owner whose Base44 role is `user` sees "Only admins can move candidates" | Should use `useEffectiveRole()` like the rest of the app                           |
| 4   | Time-in-stage badge (3d amber / 7d red)           | `KanbanBoard.jsx:22-33`                                   | —                                     | R `Applicant.status_updated_at`                                                                                            | WORKS (given data)                 | `:25-26`                                                                                                                                                                                                 | Surface stalled candidates                                                         |
| 5   | Optional stages Demo Lesson / Background Check    | `KanbanBoard.jsx:108-115`, `JobCenter.jsx:250-274`        | superadmin, admin                     | R/W `JobPosting.require_*`                                                                                                 | PARTIAL                            | Columns appear if **any** posting sets the flag — not per-candidate's own posting                                                                                                                        | Per-role custom stages                                                             |
| 6   | Applicant Dossier shell + status dropdown         | `ApplicantDossier.jsx`                                    | superadmin, admin                     | W `Applicant`, `AuditLog`                                                                                                  | PARTIAL                            | `:34-55`; audit row omits `actor_id`/`actor_name` → timeline shows "System"                                                                                                                              | 360° candidate view                                                                |
| 7   | Dossier → Profile summary                         | `DossierProfileSummary.jsx`                               | —                                     | R `Applicant`,`JobPosting`                                                                                                 | WORKS                              | whole file                                                                                                                                                                                               | Header card                                                                        |
| 8   | Dossier → Resume/Docs viewer                      | `DossierResumeViewer.jsx`                                 | —                                     | R `Applicant.resume_url/documents_url`                                                                                     | WORKS                              | `:52-53`; correctly passes `fileUrl`                                                                                                                                                                     | Inline preview of PDF/img/md/txt                                                   |
| 9   | Dossier → Activity timeline + internal notes      | `DossierActivityTimeline.jsx`                             | —                                     | R/W `AuditLog`                                                                                                             | WORKS                              | `:66-85`; tabs All/Notes/Pipeline/Emails                                                                                                                                                                 | Hiring-team collaboration log                                                      |
| 10  | Dossier → Hiring Scorecard (5×5 stars)            | `DossierScorecard.jsx`                                    | —                                     | R/W `AuditLog` (`action:'scorecard'`)                                                                                      | PARTIAL / abuse                    | `:63-87`; **updates an AuditLog row in place**; one scorecard per applicant total, not per interviewer                                                                                                   | Structured evaluation                                                              |
| 11  | Dossier → Email candidate (3 templates)           | `DossierEmailSender.jsx`                                  | —                                     | `Core.SendEmail`; W `AuditLog`                                                                                             | **WORKS (real send)**              | `:34-49`                                                                                                                                                                                                 | Interview invite / offer / rejection                                               |
| 12  | Browse Candidates (marketplace)                   | tab `browse` → `CandidateBrowse.jsx`                      | superadmin, admin                     | R `TeacherPublicProfile`,`User`,`HiringPipeline`; W `HiringPipeline`                                                       | **DEAD (no data)**                 | `:34`; nothing writes `TeacherPublicProfile`; default `paused`                                                                                                                                           | Search the teacher pool                                                            |
| 13  | Candidate Profile detail                          | `CandidateProfile.jsx`                                    | superadmin, admin                     | R `TeacherPublicProfile`,`User`,`DocumentRequest`,`Message`; W `DocumentRequest`,`Notification`,`Message`,`HiringPipeline` | PARTIAL                            | whole file                                                                                                                                                                                               | Full profile + consent + DM                                                        |
| 14  | Request Documents (consent handshake)             | `CandidateProfile.jsx:49-70`                              | superadmin, admin                     | W `DocumentRequest`,`Notification`                                                                                         | **STUB**                           | No candidate-side approve/decline UI exists anywhere → stuck `pending` forever                                                                                                                           | Per-school private-doc unlock                                                      |
| 15  | DM a candidate                                    | `CandidateProfile.jsx:72-83`                              | superadmin, admin                     | W `Message(is_direct)`                                                                                                     | PARTIAL/BROKEN                     | Query at `:44-47` is not `enabled`-gated on `candidate?.email` → first fetch filters on `undefined`; sent DMs then **leak into `#general`** in `Communication.jsx` (see #34)                             | Private recruiter↔teacher thread                                                   |
| 16  | Add to Pipeline                                   | `CandidateBrowse.jsx:50-58`, `CandidateProfile.jsx:85-93` | superadmin, admin                     | W `HiringPipeline`                                                                                                         | PARTIAL                            | writes `school_id: 'default'`                                                                                                                                                                            | Shortlist a teacher                                                                |
| 17  | Job Center (list/create/edit postings)            | tab `jobs` → `JobCenter.jsx`                              | superadmin, admin                     | R/W `JobPosting`; R `Applicant`                                                                                            | WORKS                              | `:57-108`                                                                                                                                                                                                | Vacancy CRUD                                                                       |
| 18  | "Copy Public Link" `/apply/:jobId`                | `JobCenter.jsx:30-49`                                     | superadmin, admin                     | —                                                                                                                          | **DEAD**                           | Route `/apply/:jobId` does not exist in `App.jsx` → link 404s                                                                                                                                            | Public application page (never built)                                              |
| 19  | **Hiring Portal** (parallel, older ATS)           | `/hiring` → `HiringPortal.jsx`                            | superadmin, admin                     | R `JobPosting`,`Applicant`,`HiredStaff`,`InterviewSchedule`; W `JobPosting`,`Applicant`,`HiredStaff`,`InterviewSchedule`   | PARTIAL / duplicate                | whole file                                                                                                                                                                                               | Superseded by `/recruitment` but still routed & in nav                             |
| 20  | HP → Post a Job                                   | `HiringPortal.jsx:82-90, 309-357`                         | superadmin, admin                     | W `JobPosting`                                                                                                             | WORKS                              | —                                                                                                                                                                                                        | Duplicate of #17, but **missing** `require_demo_lesson`/`require_background_check` |
| 21  | HP → Applicants list + detail + notes             | `HiringPortal.jsx:207-260, 359-412`                       | superadmin, admin                     | W `Applicant.status/notes`                                                                                                 | DEAD (no data)                     | —                                                                                                                                                                                                        | Simple list ATS                                                                    |
| 22  | HP → View Resume                                  | `HiringPortal.jsx:379-383, 444`                           | —                                     | —                                                                                                                          | **BROKEN**                         | `FileViewer` is passed `url=` but its prop is `fileUrl` (`FileViewer.jsx:34`) → viewer opens blank                                                                                                       | Preview resume                                                                     |
| 23  | HP → Schedule Interview                           | `HiringPortal.jsx:97-105, 414-442`                        | superadmin, admin                     | W `InterviewSchedule`, `Applicant.status`                                                                                  | **STUB**                           | Writes a row + flips status. No email, no calendar event, no candidate notification, and the created row is **never displayed** (`:77-80` unused)                                                        | "Schedule an interview"                                                            |
| 24  | HP → Hired Staff onboarding tracker               | `HiringPortal.jsx:262-306`                                | superadmin, admin                     | R/W `HiredStaff`                                                                                                           | **DEAD (no data)**                 | No `HiredStaff.create` anywhere                                                                                                                                                                          | Contract/ID/orientation/access checklist                                           |
| 25  | HP → staff "View" button                          | `HiringPortal.jsx:51, 297`                                | —                                     | —                                                                                                                          | **DEAD**                           | `editingStaff` state is set but never rendered — button does nothing                                                                                                                                     | Staff detail drawer                                                                |
| 26  | Hiring Pipeline stage board (marketplace)         | `recruitment/HiringPipelinePage.jsx`                      | —                                     | R/W `HiringPipeline`, W `Notification`                                                                                     | **DEAD (orphan file)**             | Not imported anywhere (grep)                                                                                                                                                                             | 6-stage screening→hired board with Meet links                                      |
| 27  | Hire → auto workspace invite                      | `HiringPipelinePage.jsx:91-106`                           | —                                     | `base44.users.inviteUser`                                                                                                  | **DEAD + unverified API**          | Orphan file; `base44.users.*` is not a documented SDK namespace (only other use: `TeamManagement.jsx:59`)                                                                                                | Hired candidate becomes a staff member                                             |
| 28  | Teacher job board + apply                         | `/personal/cv-jobs` → `CvJobs.jsx`                        | any (personal layout)                 | R `JobPosting`,`JobApplication`; W `JobApplication`                                                                        | PARTIAL / disconnected             | `:128-139`                                                                                                                                                                                               | Teacher applies to a school                                                        |
| 29  | ↳ "Your CV will be sent automatically"            | `CvJobs.jsx:172`                                          | —                                     | —                                                                                                                          | **FAKE**                           | Nothing is attached; no CV URL is written to the application                                                                                                                                             | Attach profile as CV                                                               |
| 30  | ↳ School attribution on application               | `CvJobs.jsx:132-133`                                      | —                                     | —                                                                                                                          | **BROKEN**                         | `job.workspace_id \|\| job.school_id` — `JobPosting` has neither → `school_id: ''`; `school_name: ''`                                                                                                    | Route the application to the right school                                          |
| 31  | ↳ "Download as PDF" for CV                        | `CvJobs.jsx:64`                                           | —                                     | —                                                                                                                          | **FAKE**                           | `window.print()` on the whole app page                                                                                                                                                                   | Export CV                                                                          |
| 32  | **Cover Teacher** shell (3 tabs)                  | `/cover-teacher` → `CoverTeacher.jsx`                     | superadmin, admin                     | —                                                                                                                          | WORKS                              | `App.jsx:148-150`                                                                                                                                                                                        | Cover management hub                                                               |
| 33  | Cover Assignments (today + history + confirm)     | `cover/CoverAssignmentPanel.jsx`                          | superadmin, admin                     | R `CoverAssignment`,`User`,`Class`; W `CoverAssignment`                                                                    | **DEAD (no data)**                 | `:29-32`; no `CoverAssignment.create` in `src/`                                                                                                                                                          | Daily cover ops                                                                    |
| 34  | Cover auto-suggest from priority list             | —                                                         | —                                     | —                                                                                                                          | **MISSING**                        | No code walks `cover_priority_list`                                                                                                                                                                      | Try cover 1→2→3, else alert admin (`CoverTeacherConfig.jsx:150` promises this)     |
| 35  | Cover Override (+ reason + notify)                | `CoverAssignmentPanel.jsx:57-81`                          | superadmin, admin                     | W `CoverAssignment`,`Notification`; `logAudit`                                                                             | PARTIAL / **broken audit**         | `logAudit('cover.override', user?.id, {...})` — wrong argument order (§7.1)                                                                                                                              | Cancel cover when teacher was present                                              |
| 36  | Cover Config (priority list per class)            | `cover/CoverTeacherConfig.jsx`                            | superadmin, admin                     | R `Class`,`CoverTeacherConfig`,`User`; W `CoverTeacherConfig`                                                              | PARTIAL                            | `:33-56`                                                                                                                                                                                                 | Pre-assign substitutes                                                             |
| 37  | ↳ `primary_teacher_id` write                      | `cover/CoverTeacherConfig.jsx:53`                         | —                                     | —                                                                                                                          | **BROKEN**                         | Stores `class.teacher_name` (a display string) into an FK field; `Class` has no teacher FK                                                                                                               | Link the class's primary teacher                                                   |
| 38  | ↳ Fallback "— None —" option                      | `cover/CoverTeacherConfig.jsx:141`                        | —                                     | —                                                                                                                          | **BROKEN**                         | `<SelectItem value={null}>` — Radix Select rejects empty/null item values, throws at render                                                                                                              | Clear a fallback slot                                                              |
| 39  | Payroll Impact review (apply/ignore)              | `cover/PayrollImpactPanel.jsx`                            | superadmin, admin                     | R `PayrollImpactLog`,`User`; W `PayrollImpactLog.admin_decision`                                                           | **DEAD (no data) + STUB**          | `:25-32`; "Apply to Payroll" only flips an enum — no payroll system exists                                                                                                                               | Human-in-the-loop payroll adjustment                                               |
| 40  | **Print Center** shell (3 tabs)                   | `/print` → `PrintCenter.jsx`                              | superadmin, admin, teacher            | —                                                                                                                          | WORKS                              | `App.jsx:120`                                                                                                                                                                                            | Print hub                                                                          |
| 41  | Printer Dashboard (CRUD + offline banner)         | `components/print/PrinterDashboard.jsx`                   | superadmin, admin, teacher            | R/W/D `Printer`; R `PrintQueue`                                                                                            | **WORKS**                          | `:47-60`; correctly stamps `workspace_id` from `useSchool()` (`:48`)                                                                                                                                     | Register + monitor printers                                                        |
| 42  | ↳ Live printer status / paper level               | `PrinterDashboard.jsx:149-153`                            | —                                     | W `Printer.status`                                                                                                         | **FAKE**                           | Manually clicked "Set online/offline/busy/error"; nothing polls the device                                                                                                                               | Real device telemetry                                                              |
| 43  | ↳ Delete printer                                  | `PrinterDashboard.jsx:120`                                | teacher too                           | D `Printer`                                                                                                                | **BROKEN (authz)**                 | No confirm dialog; `/print` allows teachers, so a teacher can delete any printer. `PERMISSIONS.printer_management` = admin only but is never consulted                                                   | Admin-only device management                                                       |
| 44  | New Print Job dialog                              | `components/print/NewPrintJobDialog.jsx`                  | superadmin, admin, teacher            | R `Class`,`Printer`,`Handout`,`Student`; W `PrintQueue`                                                                    | WORKS                              | `:26-33`, `workspace_id` stamped at `:27`                                                                                                                                                                | Queue a job                                                                        |
| 45  | ↳ Auto-copies from class roster                   | `NewPrintJobDialog.jsx:44-48`                             | —                                     | R `Student`                                                                                                                | **WORKS**                          | counts `status==='active'` students, falls back to `Class.total_students`, then 1                                                                                                                        | Right number of copies                                                             |
| 46  | ↳ Handout picker → `document_url`                 | `NewPrintJobDialog.jsx:50-60`                             | —                                     | R `Handout`                                                                                                                | WORKS                              | prefers `file_url`, falls back to `google_doc_link`                                                                                                                                                      | Print an existing material                                                         |
| 47  | ↳ Offline / low-paper warnings                    | `NewPrintJobDialog.jsx:153-168`                           | —                                     | —                                                                                                                          | WORKS (on fake data, #42)          | —                                                                                                                                                                                                        | Don't queue into a dead printer                                                    |
| 48  | ↳ "No specific class" / "Select manually" options | `NewPrintJobDialog.jsx:98, 118`                           | —                                     | —                                                                                                                          | **BROKEN**                         | `<SelectItem value={null}>` — Radix throws                                                                                                                                                               | Clear the selection                                                                |
| 49  | ↳ Schema drift on submit                          | `NewPrintJobDialog.jsx:188`                               | —                                     | W `PrintQueue`                                                                                                             | BROKEN (minor)                     | posts `handout_id`, not in `PrintQueue.jsonc`                                                                                                                                                            | —                                                                                  |
| 50  | Print Queue panel (stats, filter, lifecycle)      | `components/print/PrintQueuePanel.jsx`                    | superadmin, admin, teacher            | R `PrintQueue`,`Printer`,`Class`; W/D `PrintQueue`                                                                         | **PARTIAL — manual state machine** | `:126-143`                                                                                                                                                                                               | Human "Print"/"Mark Done"/"Retry"/"Cancel"                                         |
| 51  | ↳ "Print" button                                  | `PrintQueuePanel.jsx:126-128`                             | —                                     | —                                                                                                                          | **STUB**                           | Sets `status:'printing'`. **Nothing is sent to a printer.** No `window.print()`, no fetch, no agent call                                                                                                 | Actually print                                                                     |
| 52  | Print Agent Setup (REST docs + Python)            | `components/print/PrintAgentSetup.jsx`                    | superadmin, admin, teacher            | —                                                                                                                          | **DOCS ONLY**                      | Static JSX; no agent binary/repo ships with the export                                                                                                                                                   | Bridge cloud queue → CUPS                                                          |
| 53  | ↳ "Copy Python" button                            | `PrintAgentSetup.jsx:163`                                 | —                                     | —                                                                                                                          | FRAGILE                            | `document.querySelector('pre:last-of-type')` — DOM-order dependent                                                                                                                                       | Copy the sample                                                                    |
| 54  | **Report Generator**                              | `/reports` → `ReportGenerator.jsx`                        | superadmin, admin, teacher            | —                                                                                                                          | WORKS                              | `App.jsx:121`                                                                                                                                                                                            | Report-card workbench                                                              |
| 55  | ↳ Student/term selector                           | `components/reports/ReportStudentSelector.jsx`            | —                                     | R `Student`,`Class`                                                                                                        | WORKS (one bug)                    | `:43` `<SelectItem value={null}>` → Radix throws                                                                                                                                                         | Pick who + which term                                                              |
| 56  | ↳ Student Report Card render                      | `components/reports/StudentReportCard.jsx`                | —                                     | R `Student`,`Mark`(by term),`Class`                                                                                        | WORKS                              | `:27-66`                                                                                                                                                                                                 | On-screen report card                                                              |
| 57  | ↳ Hardcoded school name                           | `StudentReportCard.jsx:123`                               | —                                     | —                                                                                                                          | **BROKEN**                         | Prints literal **"TeachFlow Academy"**; `useSchool()` is not used                                                                                                                                        | School's own branding                                                              |
| 58  | ↳ AI teacher comments (per subject / all)         | `StudentReportCard.jsx:68-89`                             | —                                     | `Core.InvokeLLM`                                                                                                           | PARTIAL                            | Real LLM call. Comments live in `useState` only — **never persisted**, lost on navigate. `InvokeLLM` return shape unguarded (`setComments(result)` would crash React if an object)                       | Auto-drafted teacher remarks                                                       |
| 59  | ↳ "Print / PDF"                                   | `StudentReportCard.jsx:91-93, 111`                        | —                                     | —                                                                                                                          | PARTIAL                            | `window.print()`; there is **no `@media print` CSS anywhere** (`src/index.css`, `tailwind.config.js`) → sidebar/nav print too                                                                            | Clean printable report card                                                        |
| 60  | Bulk / class-wide report generation               | —                                                         | —                                     | —                                                                                                                          | **MISSING**                        | One student at a time only                                                                                                                                                                               | Print a whole class's reports                                                      |
| 61  | `exportAnalyticsPDF`                              | `src/lib/pdfReports.js:31-205`                            | (called from `/student-analytics`)    | —                                                                                                                          | **WORKS**                          | consumed at `StudentAnalytics.jsx:130`                                                                                                                                                                   | School analytics PDF                                                               |
| 62  | `exportStudentReportPDF`                          | `src/lib/pdfReports.js:210-398`                           | (called from `/students/:id`)         | —                                                                                                                          | **WORKS**                          | consumed at `StudentDetail.jsx:149`                                                                                                                                                                      | Parent-facing student PDF                                                          |
| 63  | `ProgressReportGenerator` (3rd PDF engine)        | `components/reports/ProgressReportGenerator.jsx`          | —                                     | R `Student`,`Mark`,`Attendance`,`Class`                                                                                    | **DEAD (orphan file)**             | Not imported anywhere; `reportRef` (`:15`) also unused                                                                                                                                                   | Progress-report PDF                                                                |
| 64  | **Staff Messaging**                               | `/messaging` → `Messaging.jsx`                            | **ANY authenticated user — no guard** | R/W `Message`; R `User`; `Core.UploadFile`                                                                                 | WORKS (unguarded)                  | `App.jsx:123` has no `RoleGuard`; `MobileNav.jsx:54` has no `roles`                                                                                                                                      | Staff chat                                                                         |
| 65  | ↳ `#admin` channel                                | `Messaging.jsx:18`                                        | any                                   | R/W `Message`                                                                                                              | **BROKEN (authz)**                 | Channel list is not role-filtered; a `parent` can open `/messaging` and read+post in `#admin`                                                                                                            | "Admin & admin only" (its own description)                                         |
| 66  | ↳ Cross-tenant message visibility                 | `Messaging.jsx:51`                                        | —                                     | R `Message`                                                                                                                | **BROKEN (tenancy)**               | `Message` has no `workspace_id`/`school_id` and no RLS → every school reads every other school's channels                                                                                                | Per-school channels                                                                |
| 67  | ↳ Attachments                                     | `Messaging.jsx:77-84`                                     | —                                     | `Core.UploadFile`                                                                                                          | WORKS                              | —                                                                                                                                                                                                        | Share files                                                                        |
| 68  | ↳ Threading                                       | `Message.thread_id`                                       | —                                     | —                                                                                                                          | **MISSING**                        | Field exists; never written or read                                                                                                                                                                      | Threaded replies                                                                   |
| 69  | **Communication** shell (3 sub-tabs)              | `/communication` → `Communication.jsx`                    | superadmin, admin, teacher            | —                                                                                                                          | WORKS                              | `App.jsx:124`                                                                                                                                                                                            | Comms hub                                                                          |
| 70  | ↳ Internal Messages (2nd chat impl.)              | `Communication.jsx:39-191`                                | superadmin, admin, teacher            | R/W/D `Message`; R `User`                                                                                                  | PARTIAL / duplicate                | Duplicates #64 with different sorting, delete-own-message, and Enter-to-send                                                                                                                             | Same thing, again                                                                  |
| 71  | ↳ DM leak into `#general`                         | `Communication.jsx:52`                                    | —                                     | R `Message`                                                                                                                | **BROKEN**                         | `filter({ channel })` omits `is_direct:false` (which `Messaging.jsx:51` includes) → recruiter↔candidate DMs (#15) appear in the public channel                                                           | Keep DMs private                                                                   |
| 72  | ↳ Parent Communication (call/WA/email)            | `Communication.jsx:194-328`                               | superadmin, admin, teacher            | R `Student`,`Class`                                                                                                        | PARTIAL (honest)                   | `tel:`, `https://wa.me/`, `mailto:` deep links only                                                                                                                                                      | Contact a parent                                                                   |
| 73  | ↳ Parent contact logging                          | —                                                         | —                                     | —                                                                                                                          | **MISSING**                        | Nothing is recorded — no `Message`, no `AuditLog`, no `ActivityFeedItem`                                                                                                                                 | Audit trail of parent contact                                                      |
| 74  | ↳ Student Portal Feed                             | `Communication.jsx:331-382`                               | superadmin, admin, teacher            | R `Handout`,`Assignment`,`DiaryEntry`,`Class`                                                                              | **FAKE**                           | `_visible` is a hardcoded literal (`:339-341`: Handout/Assignment `true`, Diary `false`). Caption says "toggle visibility to control what students see" (`:354`) — **there is no toggle**                | Control what students see                                                          |
| 75  | Notification Center bell                          | `components/layout/NotificationCenter.jsx`                | all                                   | R/W `Notification`                                                                                                         | PARTIAL / BROKEN                   | `:9-17` type map matches no enum value; `:105` renders `n.body` but field is `message`; `action_url` never used                                                                                          | In-app notifications                                                               |
| 76  | Activity Feed                                     | `src/lib/activityFeed.js`                                 | —                                     | W `ActivityFeedItem`                                                                                                       | **DEAD**                           | `logActivity` has **zero call sites**; no feed UI exists despite `PERMISSIONS.activity_feed_view`                                                                                                        | Ops visibility stream for admins                                                   |
| 77  | Audit Log viewer                                  | —                                                         | —                                     | R `AuditLog`                                                                                                               | **MISSING**                        | `PERMISSIONS.audit_log_view: ['superadmin']` exists (`permissions.js:55`) but no page reads `AuditLog` except the per-applicant dossier                                                                  | SuperAdmin audit trail                                                             |
| 78  | `useScopedEntity` tenancy helper                  | `src/lib/useScopedEntity.js`                              | —                                     | —                                                                                                                          | **DEAD**                           | 92 lines, documented "ZERO data leakage between workspaces", **zero importers**                                                                                                                          | The intended tenancy layer                                                         |
| 79  | Desktop sidebar                                   | `components/layout/Sidebar.jsx`                           | —                                     | —                                                                                                                          | **BROKEN — file truncated**        | File ends at line 27 mid-`navGroups` array; no `export default`. `AppLayout.jsx:3,26` imports and renders it → desktop build fails                                                                       | Nav                                                                                |

---

## 4. Workflows — intended vs. as-built

### 4.1 Post job → applicants → dossier → interview → hire

**Intended:** admin creates `JobPosting` (Open) → shares `/apply/:jobId` public link → candidate submits → `Applicant{status:'new'}` + `resume_url` → appears in Kanban "New" → admin drags through Shortlisted → (Demo Lesson) → (Background Check) → Interview → Offered → each move writes `AuditLog{action:'status_change'}` → dossier: read resume, add internal notes, fill 5-criteria scorecard, send templated email → Schedule Interview writes `InterviewSchedule` and notifies → on offer accept, a `HiredStaff` row is created and the onboarding checklist runs → candidate is invited into the workspace.

**As built:**

```
JobPosting.create           ✅  JobCenter.jsx:75 / HiringPortal.jsx:83
  → public /apply/:jobId    ❌  route absent (App.jsx)
  → Applicant.create        ❌  DOES NOT EXIST ANYWHERE
  → Kanban drag             ✅  KanbanBoard.jsx:150-156 (but gate bug, #3)
  → AuditLog status_change  ✅  KanbanBoard.jsx:136-146
  → Dossier notes           ✅  DossierActivityTimeline.jsx:71-85
  → Scorecard               ⚠️  DossierScorecard.jsx:63  (stored in AuditLog, updated in place)
  → Email candidate         ✅  DossierEmailSender.jsx:34  (real Core.SendEmail)
  → InterviewSchedule       ⚠️  HiringPortal.jsx:98 — row only, never read back, no invite
  → HiredStaff.create       ❌  DOES NOT EXIST ANYWHERE
  → workspace invite        ❌  only in the orphan HiringPipelinePage.jsx:94
```

**Net: the ATS can be configured but can never be fed.** Every candidate-facing screen is dead until an ingress is built.

### 4.2 Teacher publishes profile → approval → school discovers

**Intended:** teacher fills `TeacherPublicProfile` (default `profile_visibility:'paused'`) → flips to `active` when ready → SchoolTroop staff verify identity/degree/certificate → `profile_score` recomputes → profile becomes discoverable in Browse Candidates → school requests documents → candidate approves/declines per-school → school sees `cv_url`.

**As built:** the teacher profile editors (`TeacherProfile.jsx:58`, `personal/Profile.jsx:42`) write to the **`User`** entity via `auth.updateMe`, not to `TeacherPublicProfile`. `TeacherPublicProfile` has **no writer at all**. There is no verification console, no `profile_score` calculator, no candidate-side `DocumentRequest` response screen. `CandidateBrowse` therefore always renders "No candidates found".

### 4.3 Cover teacher: absence → suggest → assign → override → payroll

**Intended (fully specified in the schemas + UI copy):**

```
teacher marked absent / missed punch
  → CoverAssignment.create {trigger_reason, trigger_time, status:'notified'}
  → read CoverTeacherConfig.cover_priority_list
  → try cover 1 → 2 → 3; if none available, alert Admin   (CoverTeacherConfig.jsx:150)
  → Notification to chosen cover teacher (type:'cover_teacher')
  → teacher acknowledges                → status:'acknowledged'
  → admin confirms                      → status:'active', duties_transferred:true
  → (if teacher was actually present) admin overrides w/ reason → status:'overridden'
  → end of day                          → status:'completed'
  → if SchoolSettings.payroll_enabled:
       PayrollImpactLog.create {extra_hours, rates, suggested +/-}
  → admin applies or ignores; decision permanently logged
```

**As built:** only the four _middle_ steps have code — `confirm` (`CoverAssignmentPanel.jsx:47-55`), `override` (`:57-81`), config CRUD, and the payroll decide button. The trigger, the priority-list walk, the acknowledge step, the completion step, the payroll-log creation, and the rate lookup are **all absent**. There is no hourly-rate field on any entity to compute from.

### 4.4 Print: pick template → quantities → queue → printer

```
New Print Job → pick print_type (5 templates)           ✅
             → pick Target Class                         ✅
             → copies auto = active students in class    ✅  NewPrintJobDialog.jsx:44-48
             → pick Handout → document_url               ✅  :50-60
             → pick Printer (offline/low-paper warnings) ✅  :153-168
             → enter Est. pages per copy                 ✅
             → PrintQueue.create {workspace_id}          ✅  :27
─────────────────────────────────────────────────────────────
Queue → [Print]  → status:'printing'                     ⚠️ STUB — nothing is sent anywhere
      → [Mark Done] → status:'completed', completed_at   ⚠️ human-driven
      → [Retry] / [Cancel] / [Delete]                    ✅
─────────────────────────────────────────────────────────────
Print Agent (poll → claim → download → lp → report)      📄 DOCUMENTED ONLY — no agent exists
```

Gaps: no `scheduled_at` UI despite the field and the agent spec; no `created_by` on a job; the summary "copies × pages" is shown but the product is never stored (only per-copy `total_pages` is saved, and `PrintQueuePanel.jsx:116` re-multiplies at display time).

### 4.5 Report: pick type → data → PDF

There is **no report _type_ picker**. `/reports` offers exactly one artifact — the per-student, per-term report card — rendered to screen and exported via `window.print()`. The three genuine jsPDF documents live elsewhere (`pdfReports.js`, reached from Student Analytics and Student Detail) or are orphaned (`ProgressReportGenerator.jsx`).

### 4.6 Messaging: channels / roles / notifications

```
pick channel (general|resources|announcements|admin)  ✅ — but no role filtering at all
type message (+ optional subject, + file upload)      ✅
Message.create                                        ✅ — no tenant field written
poll every 5s                                         ✅ refetchInterval:5000
→ Notification to anyone                              ❌ never fires for messages
→ SMS / email fan-out                                 ❌ does not exist
→ threading (thread_id)                               ❌ never written
```

Parent outreach is `mailto:` / `tel:` / `wa.me` deep links that hand off to the OS — nothing is sent by the app and nothing is logged.

---

## 5. Calculations — every formula, precisely

### Recruitment

| Formula                     | Location                     | Definition                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scorecard average           | `DossierScorecard.jsx:89-93` | `avg = sum(v for v in [subject_knowledge, communication, classroom_mgmt, culture_fit, overall_impression] if truthy) / count(truthy)` → `.toFixed(1)`, out of 5. **All five criteria are equally weighted — there are no weights.** Unrated (0/undefined) criteria are excluded from both numerator and denominator, so scoring one criterion 5★ yields an average of 5.0. |
| Time in stage               | `KanbanBoard.jsx:25`         | `differenceInDays(now, status_updated_at ?? created_date)`                                                                                                                                                                                                                                                                                                                 |
| Stage-age colour            | `KanbanBoard.jsx:26`         | `days >= 7 → red; days >= 3 → amber; else muted`                                                                                                                                                                                                                                                                                                                           |
| Applicants per job          | `JobCenter.jsx:67-70`        | client-side reduce over all `Applicant` rows by `job_posting_id` (the `JobPosting.applicant_count` column is ignored)                                                                                                                                                                                                                                                      |
| Applicants per job (portal) | `HiringPortal.jsx:174`       | `applicants.filter(a => a.job_posting_id === p.id).length`                                                                                                                                                                                                                                                                                                                 |
| Onboarding completion       | `HiringPortal.jsx:127-132`   | `done = count(true among [contract_signed, id_issued, orientation_done, system_access])`; `done===4 → "Complete"`, `done===0 → "Not Started"`, else `"{done}/4 Done"`                                                                                                                                                                                                      |
| Open positions count        | `HiringPortal.jsx:162`       | `postings.filter(p => p.status === 'Open').length`                                                                                                                                                                                                                                                                                                                         |
| `profile_score`             | —                            | **NOT IMPLEMENTED.** Schema says "0-100, auto-calculated from completeness + verification" (`TeacherPublicProfile.jsonc:132-136`); it is only _displayed_ (`CandidateBrowse.jsx:154`, `CandidateProfile.jsx:172`) and defaults to 0.                                                                                                                                       |

### Cover / payroll

| Formula                   | Location                                        | Definition                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover-teacher addition    | _display only_ — `PayrollImpactPanel.jsx:62-63` | Renders `cover_teacher_addition_suggested` and the caption `{extra_hours_logged}h × ৳{hourly_rate_cover}/hr`. **The multiplication is never performed in code** — the field is read from a row nothing creates. |
| Primary-teacher deduction | _display only_ — `:70-71`                       | Same: `{extra_hours_logged}h × ৳{hourly_rate_primary}/hr`.                                                                                                                                                      |
| Pending/resolved split    | `PayrollImpactPanel.jsx:34-35`                  | `pending = admin_decision === 'pending'`; `resolved = everything else`                                                                                                                                          |
| "Today's assignments"     | `CoverAssignmentPanel.jsx:83-84`                | `a.date === new Date().toISOString().split('T')[0]` — **UTC date**, not the school's timezone; a Bangladesh school (UTC+6) sees the next day's list from 06:00 local.                                           |
| Cover priority resolution | —                                               | **NOT IMPLEMENTED.** `cover_priority_list` is written and displayed; nothing reads it to choose a substitute.                                                                                                   |

### Print

| Formula               | Location                      | Definition                                                                                                    |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Auto copies           | `NewPrintJobDialog.jsx:46-47` | `copies = count(Student where class_id === selected && status === 'active') \|\| Class.total_students \|\| 1` |
| Print summary         | `NewPrintJobDialog.jsx:174`   | `copies × total_pages` (displayed, **not persisted**)                                                         |
| Queue total pages     | `PrintQueuePanel.jsx:116`     | `total_pages × (copies ?? 1)` (recomputed at render)                                                          |
| Queue stats           | `PrintQueuePanel.jsx:56-61`   | counts of `queued`/`printing`/`completed`/`failed`                                                            |
| Paper-level → %       | `PrinterDashboard.jsx:29`     | `{full:100, medium:55, low:20, empty:0}` — arbitrary constants for the bar width                              |
| Active jobs / printer | `PrinterDashboard.jsx:101`    | `status ∈ {queued, printing}`                                                                                 |

### Reports

| Formula                                           | Location                            | Definition                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject % (report card)                           | `StudentReportCard.jsx:58`          | `round(Σ marks_obtained / Σ max_marks × 100)` per subject, **totals-based (weighted by max_marks)**                                                                                 |
| Overall % (report card)                           | `StudentReportCard.jsx:62-66`       | `round(Σ_all totalObtained / Σ_all totalMax × 100)` — again totals-based                                                                                                            |
| Grade bands (report card)                         | `StudentReportCard.jsx:11-19`       | `≥90 A+ · ≥80 A · ≥70 B+ · ≥60 B · ≥50 C · ≥40 D · else F` (7 bands)                                                                                                                |
| Subject fallback                                  | `StudentReportCard.jsx:49`          | `m.subject ?? studentClass.subject ?? 'General'`                                                                                                                                    |
| Component %                                       | `StudentReportCard.jsx:195`         | `round(marks_obtained / max_marks × 100)`                                                                                                                                           |
| Grade bands (`pdfReports.js`)                     | `pdfReports.js:12-20`               | **identical 7 bands** — `≥90 A+ … else F`                                                                                                                                           |
| Grade bands (`ProgressReportGenerator`)           | `ProgressReportGenerator.jsx:129`   | **DIFFERENT — 6 bands:** `≥90 A+ · ≥80 A · ≥70 B+ · ≥60 B · ≥50 C · else F` (**no D**)                                                                                              |
| Avg score (`ProgressReportGenerator`)             | `ProgressReportGenerator.jsx:33-35` | `round(mean over marks of (marks_obtained / max_marks × 100))` — **mean-of-percentages, unweighted**, which disagrees with the totals-based method used by the live report card (#) |
| Attendance % (`ProgressReportGenerator`)          | `:29-31`                            | `round(present / total_records × 100)`; `late` counts as **not present**                                                                                                            |
| Subject % (`ProgressReportGenerator`)             | `:133`                              | `round(total / max × 100)` (totals-based — inconsistent with its own `avgScore`)                                                                                                    |
| Attendance colour thresholds                      | `pdfReports.js:122, 153`            | `rate < 60 → RED; < 80 → AMBER; else GREEN`                                                                                                                                         |
| Attendance-rate flag (student PDF)                | `pdfReports.js:284`                 | `attendancePct < 75 → RED` (**a third threshold**)                                                                                                                                  |
| Avg-score flag (student PDF)                      | `pdfReports.js:285`                 | `avgScore < 40 → RED`                                                                                                                                                               |
| Mark-row colour (student PDF)                     | `pdfReports.js:376`                 | `pct < 40 → RED; pct ≥ 80 → GREEN; else DARK`                                                                                                                                       |
| Attendance thresholds (`ProgressReportGenerator`) | `:92-93`                            | `avg ≥ 80 green, ≥ 50 blue, else red`; `attendance ≥ 85 green else red` (**a fourth set**)                                                                                          |
| Attendance log cap                                | `pdfReports.js:333`                 | `attendance.slice(0, 60)` — silently truncates to 60 rows                                                                                                                           |

> **Four different grade/threshold vocabularies coexist across three report engines.** Any two reports for the same student can disagree.

---

## 6. Report & print templates

### 6.1 `PrintQueue.print_type` — 5 "templates"

`Handout · Report Card · Attendance Sheet · Exam Paper · Custom` (`PrintQueue.jsonc:14-23`, offered at `NewPrintJobDialog.jsx:14`).

These are **labels only**. No template renders anything. The only one wired to a data source is `Handout` (which reveals the material picker at `NewPrintJobDialog.jsx:112-123` and copies `Handout.file_url ?? google_doc_link` into `document_url`). For `Report Card`, `Attendance Sheet`, `Exam Paper` and `Custom` the user must paste a `document_url` by hand. Nothing generates a report-card PDF into the print queue, and no attendance-sheet generator exists anywhere in the repo.

### 6.2 Report templates

| Template                                   | File                                 | Data pulled                                                                                                                                                    | Layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Student Report Card** (live, `/reports`) | `StudentReportCard.jsx`              | `Student` (by id), `Mark.filter({student_id, term})`, `Class.list()`                                                                                           | HTML. Primary-colour header band with hardcoded **"TeachFlow Academy"** + term + generated date → 4-up student info strip (name, student ID, class, academic year = `new Date().getFullYear()`) → overall performance bar + grade pill → per-subject cards (header row `obtained/max` + grade pill; 2-3 col component grid; AI comment box) → footer with Class Teacher + Principal signature rules and a large overall grade letter. Export = `window.print()` with **no print stylesheet**.   |
| **Student Analytics Overview**             | `pdfReports.js:31-205`               | passed in from `StudentAnalytics.jsx:130-144`: `schoolName` (`school?.name`), 6 summary stats, `dailyAttendance[]`, `attendanceByClass[]`, `assignmentStats[]` | jsPDF A4 pt. Indigo 70pt header band (school name, "Student Analytics Overview", timestamp right) → "Summary" 3×2 grid of rounded stat cards → "Daily Attendance — Last 7 Days" table (Date/Present/Absent/Late/Rate, last column colour-coded) → "Attendance Rate by Class" → "Assignment Status Breakdown" → per-page centred footer `{school} — Student Analytics — Page i of n`. Auto page-breaks at `y > pageH-60`. `studentStatusData` is accepted as a parameter and **never rendered**. |
| **Student Progress & Attendance Report**   | `pdfReports.js:210-398`              | passed in from `StudentDetail.jsx:149-157`: `student`, `cls`, `attendance[]`, `marks[]`, `avgScore`, `attendancePct`                                           | jsPDF A4 pt. Same header band → "Student Information" 3×2 cards (name, ID, class, roll, section, status) → 3×2 summary cards (attendance rate, avg score, days present, absences, lates, total assessments) with conditional colour → "Attendance Log" table (Date/Status/Notes, **capped at 60 rows**) → "Assessment History" table (Assessment ≤30 chars/Component/Term/Date/Score/Grade) → footer `{school} — {student} Report — Page i of n`. Filename `{slug}-report-{yyyy-MM-dd}.pdf`.    |
| **Student Progress Report** (orphan)       | `ProgressReportGenerator.jsx:45-173` | `Student`, `Mark`, `Attendance`, `Class` — all fetched in-component                                                                                            | jsPDF A4 mm. Navy 40mm header, hardcoded **"School Troop"** → "Student Information" label/value list → 4 coloured summary boxes (overall avg, attendance rate, assessments, days recorded) → "Subject Performance" table (Subject / Marks Obtained / Percentage / Grade) → "Attendance Summary" (present/absent/late/total) → grey footer "School Troop · Confidential Student Record · Page 1" (page number is **hardcoded to 1**). **Unreachable — no importer.**                             |

### 6.3 Email templates (recruitment)

`DossierEmailSender.jsx:9-16` — three plain-text templates, interpolated with `{firstName}` and `{jobPosting.title ?? 'the position'}`, all signed "Hiring Team":

- `interview` — invitation, asks the candidate to reply with availability
- `offer` — offer letter, references "the offer details in the attachment" (**no attachment mechanism exists**)
- `reject` — rejection

Subject line is always `Re: {jobPosting.title ?? 'Your Application'}` (`:36`). Sent via `Core.SendEmail` with `from_name = user.full_name ?? 'Hiring Team'`. This is the **only genuine outbound email in the whole operations area.**

### 6.4 Notification "templates"

Three hardcoded message strings: document-access request (`CandidateProfile.jsx:64`), interview scheduled with Meet link/location (`HiringPipelinePage.jsx:84`, orphan), cover assignment cancelled (`CoverAssignmentPanel.jsx:71`). All are English-only string literals; there is no i18n or template store.

---

## 7. Broken / fake / dead list

### 7.1 `logAudit` called with the wrong arguments — **both call sites**

Signature (`auditLog.js:21`):

```js
logAudit(
  user,
  action_type,
  entity_type,
  entity_id,
  previous_value,
  new_value,
  school_id
)
```

Call sites:

- `cover/CoverAssignmentPanel.jsx:74` → `logAudit('cover.override', user?.id, { assignment_id, teacher_id, reason })`
- `SchoolResourceLibrary.jsx:89` → `logAudit('resource.reassigned', user?.id, {...})` _(outside this area, same defect)_

Resulting `AuditLog` row: `user_id: 'system'` (a string has no `.id`), `action_type: <the actor's user id>`, `entity_type: <a raw object>`, `entity_id: ''`, `school_id: 'unknown'`, `previous_value: null`, `new_value: null`. **The override reason — the entire point of the audit — is silently discarded.** No error surfaces because `logAudit` swallows everything in a `catch` (`:34-37`).

### 7.2 `logActivity` has zero call sites

`src/lib/activityFeed.js` is a complete, documented helper (usage example and all) that **nothing imports**. `ActivityFeedItem` therefore has no writer, and no screen reads it. `PERMISSIONS.activity_feed_view: ['superadmin','admin']` (`permissions.js:56`) guards a feature that does not exist.

### 7.3 `AuditLog` rows updated in place

`DossierScorecard.jsx:63-71` — if a `scorecard` row already exists it calls `AuditLog.update(existingLog.id, { new_value, actor_name, timestamp })`, overwriting the previous evaluation and its author. This directly contradicts `auditLog.js:4` ("AuditLog is read-only (no edit, no delete)") and destroys the evidence trail. It also means **one scorecard per applicant for the whole panel** — a second interviewer overwrites the first.

Related: the two other direct `AuditLog.create` sites omit `school_id` entirely (`KanbanBoard.jsx:136`, `ApplicantDossier.jsx:42`, `DossierEmailSender.jsx:41`), and `ApplicantDossier.jsx:42-49` omits `actor_id`/`actor_name` so the timeline attributes the move to "System" (`DossierActivityTimeline.jsx:38`).

### 7.4 `/messaging` is completely unguarded

`App.jsx:123`: `<Route path="/messaging" element={<Messaging />} />` — the only route inside `AppLayout` with no `RoleGuard` other than `/`, `/schedule`, `/calendar`, `/profile`, `/marketplace`, `/seller-portal`. `MobileNav.jsx:54` and `:96` also list it with no `roles` key. Consequences:

- a `parent` can read and post in **every** channel, including `#admin` (`Messaging.jsx:18`, described in-product as "Admin & admin only")
- combined with `Message` having no tenant field and no RLS (§2.1), **any authenticated user of any school can read every message in the entire product**.

### 7.5 Entities with no creator (features that can never hold data)

| Entity                 | Only operations in `src/`        | Consequence                                                           |
| ---------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `Applicant`            | `update` ×3                      | Kanban, dossier and HiringPortal applicant list are permanently empty |
| `HiredStaff`           | `list`, `update`                 | Onboarding Tracker permanently empty                                  |
| `TeacherPublicProfile` | `filter` ×1                      | Browse Candidates permanently empty                                   |
| `CoverAssignment`      | `list`, `update` ×2              | Cover Assignments tab permanently empty                               |
| `PayrollImpactLog`     | `list`, `update`                 | Payroll Impact tab permanently empty                                  |
| `ActivityFeedItem`     | (`create` in an uncalled helper) | Inert                                                                 |

### 7.6 Orphaned / unreachable files

| File                                                 | Lines | Note                                                                                                                                         |
| ---------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/recruitment/HiringPipelinePage.jsx`       | 217   | Not imported anywhere. Contains the only "hire → workspace invite" logic in the repo (`:91-106`) and the only interview-with-Meet-link flow. |
| `src/components/reports/ProgressReportGenerator.jsx` | 224   | Not imported anywhere. A complete third PDF engine.                                                                                          |
| `src/lib/useScopedEntity.js`                         | 92    | Not imported anywhere. The intended workspace-isolation layer.                                                                               |

### 7.7 `Sidebar.jsx` is truncated — the desktop app cannot build

`src/components/layout/Sidebar.jsx` is 1,134 bytes / 26 lines and ends mid-literal:

```js
const navGroups = [
  {
    label: 'Overview',      ← EOF
```

There is no closing brace and **no `export default`**. `AppLayout.jsx:3` does `import Sidebar from './Sidebar'` and renders it at `:26`. This is almost certainly an export artifact (the run logged `"exportState": "BUILDING_FILE_TREE"` and a cross-origin scan failure in `export-report.json`), but as shipped the desktop layout is unbuildable. The mobile nav (`MobileNav.jsx`, 270 lines) is intact and is the only reliable record of the intended navigation + per-item role visibility.

### 7.8 `FileViewer` prop mismatch — resume preview is blank

`FileViewer.jsx:34` destructures `{ open, onClose, fileUrl, fileName }`. `HiringPortal.jsx:444` passes `url={viewerFile?.url}`. `fileUrl` is `undefined`, so `getExt()` returns `''` → category `unsupported`. (`DossierResumeViewer.jsx:35` passes `fileUrl` correctly.)

### 7.9 `<SelectItem value={null}>` — Radix throws on render

Radix Select rejects items with an empty/nullish value. Four occurrences in this area:

- `cover/CoverTeacherConfig.jsx:141` — "— None —" fallback option
- `NewPrintJobDialog.jsx:98` — "No specific class"
- `NewPrintJobDialog.jsx:118` — "Select manually"
- `reports/ReportStudentSelector.jsx:43` — "All Classes"

Each will error the moment its dropdown opens.

### 7.10 Tenancy defects (summary)

1. `user.school_id` does not exist → 7 write sites persist the literal `'default'` (§2.1).
2. `logAudit`/`logActivity` persist `'unknown'` as `school_id`.
3. `JobPosting`, `Applicant`, `InterviewSchedule`, `HiredStaff`, `Message` have **no tenant column at all** — cross-school leakage by construction.
4. `CvJobs.jsx:132` writes `school_id: ''` because it reads `job.workspace_id || job.school_id` from a `JobPosting` that has neither field.
5. `PrintQueue`/`Printer` RLS depends on `user.data.active_workspace_id`, which is not a declared `User` property and is written through a failure-swallowing `updateMe` (`SchoolContext.jsx:56`). If that write is rejected, Print Center renders empty with no error.
6. `useScopedEntity` — the helper designed to fix all of this — is dead code.

### 7.11 Permission matrix vs. actual guards

**None of the `PERMISSIONS` keys for this area are ever consulted** — `grep` for `recruitment_portal|cover_teacher_config|cover_teacher_override|payroll_impact_view|print_job_submit|printer_management|audit_log_view|activity_feed_view` outside `permissions.js` returns nothing. Enforcement is entirely via hardcoded `allowed={[...]}` arrays, which disagree with the matrix:

| Feature              | `permissions.js`                 | `App.jsx` route                                        | `MobileNav.jsx`                                                                              |
| -------------------- | -------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `recruitment_portal` | `['superadmin']` (`:38`)         | `['superadmin','admin']` (`:153`)                      | `['superadmin']` (`:77`) — **admins can reach `/recruitment` by URL but never see the link** |
| `printer_management` | `['superadmin','admin']` (`:50`) | `/print` = `['superadmin','admin','teacher']` (`:120`) | same — **teachers can add and delete printers**                                              |
| `audit_log_view`     | `['superadmin']` (`:55`)         | no route exists                                        | no nav entry                                                                                 |
| `activity_feed_view` | `['superadmin','admin']` (`:56`) | no route exists                                        | no nav entry                                                                                 |
| messaging            | not in the matrix at all         | **no guard** (`:123`)                                  | **no roles** (`:54`, `:96`)                                                                  |

Also: `getUserRole()` (`permissions.js:77-83`) falls back to `'teacher'` for any unknown role, and `KanbanBoard.jsx:93` bypasses `useEffectiveRole()` entirely.

### 7.12 Stubs — writes a row and claims more

| Claim                                                  | Reality                                                                                                                     | Evidence                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| "Schedule Interview"                                   | `InterviewSchedule` row + `Applicant.status`. No email, no calendar event, no notification, and the row is never displayed. | `HiringPortal.jsx:97-105`; `:77-80` result unused |
| "Apply to Payroll"                                     | Flips `admin_decision` to `'applied'`. No payroll module is touched.                                                        | `PayrollImpactPanel.jsx:25-32`                    |
| "Print"                                                | Flips `PrintQueue.status` to `'printing'`. Nothing is sent to any device.                                                   | `PrintQueuePanel.jsx:126-128`                     |
| "Request Documents"                                    | `DocumentRequest` + `Notification` rows. The candidate has no screen to respond on.                                         | `CandidateProfile.jsx:49-70`                      |
| "Your CV (profile) will be sent automatically"         | Nothing is attached to the `JobApplication`.                                                                                | `CvJobs.jsx:172` vs `:128-139`                    |
| "Download as PDF" (CV)                                 | `window.print()`.                                                                                                           | `CvJobs.jsx:64`                                   |
| "toggle visibility to control what students see"       | `_visible` is a hardcoded literal; there is no toggle.                                                                      | `Communication.jsx:339-341, 354`                  |
| Printer `status` / `paper_level`                       | Typed by a human via "Set online / Set offline…"; nothing polls the printer.                                                | `PrinterDashboard.jsx:149-153`                    |
| Offer email "find the offer details in the attachment" | No attachment mechanism exists.                                                                                             | `DossierEmailSender.jsx:13`                       |

### 7.13 Other concrete bugs

| Bug                                                                                                                                                                                                                                                                                                           | Location                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Hardcoded school name **"TeachFlow Academy"** on every report card                                                                                                                                                                                                                                            | `StudentReportCard.jsx:123`                                              |
| Hardcoded **"School Troop"** in the orphan PDF                                                                                                                                                                                                                                                                | `ProgressReportGenerator.jsx:62, 168`                                    |
| No `@media print` CSS anywhere → `window.print()` prints sidebar + nav                                                                                                                                                                                                                                        | `src/index.css`, `tailwind.config.js` (grep for `print` returns nothing) |
| AI report comments never persisted (local `useState` only)                                                                                                                                                                                                                                                    | `StudentReportCard.jsx:22, 79`                                           |
| `InvokeLLM` result assigned straight into JSX-rendered state without a shape guard                                                                                                                                                                                                                            | `StudentReportCard.jsx:79, 211`                                          |
| Notification bodies never display (`n.body` vs field `message`)                                                                                                                                                                                                                                               | `NotificationCenter.jsx:105` vs `Notification.jsonc:21`                  |
| Every notification renders the `system_alert` icon (type map matches no enum value)                                                                                                                                                                                                                           | `NotificationCenter.jsx:9-17, 93`                                        |
| `action_url` never used; `Link` imported and unused                                                                                                                                                                                                                                                           | `NotificationCenter.jsx:7`                                               |
| DMs leak into `#general` (missing `is_direct:false`)                                                                                                                                                                                                                                                          | `Communication.jsx:52` vs `Messaging.jsx:51`                             |
| `messages` query fires with `recipient_email: undefined` (no `enabled` gate)                                                                                                                                                                                                                                  | `CandidateProfile.jsx:44-47`                                             |
| `primary_teacher_id` receives a display name                                                                                                                                                                                                                                                                  | `cover/CoverTeacherConfig.jsx:53`                                        |
| "Today" computed in UTC, not school time                                                                                                                                                                                                                                                                      | `CoverAssignmentPanel.jsx:83`                                            |
| `handout_id` written to `PrintQueue` (not in schema)                                                                                                                                                                                                                                                          | `NewPrintJobDialog.jsx:188`                                              |
| Printer delete has no confirmation and is teacher-reachable                                                                                                                                                                                                                                                   | `PrinterDashboard.jsx:120`                                               |
| `editingStaff` set but never rendered — "View" is a no-op                                                                                                                                                                                                                                                     | `HiringPortal.jsx:51, 297`                                               |
| `interviews` query loaded and never used                                                                                                                                                                                                                                                                      | `HiringPortal.jsx:77-80`                                                 |
| `reportRef` created, never attached                                                                                                                                                                                                                                                                           | `StudentReportCard.jsx:25`, `ProgressReportGenerator.jsx:15`             |
| Copy-button reads the DOM by `pre:last-of-type`                                                                                                                                                                                                                                                               | `PrintAgentSetup.jsx:163`                                                |
| `base44.users.inviteUser` — undocumented SDK namespace                                                                                                                                                                                                                                                        | `HiringPipelinePage.jsx:94`, `TeamManagement.jsx:59`                     |
| `Applicant.notes` edited in a controlled field on a _copy_ of the row; concurrent status change in the same dialog can clobber                                                                                                                                                                                | `HiringPortal.jsx:387, 406`                                              |
| Unused imports (dead UI intent): `MessageSquare/FileText/Star` (`CandidateBrowse.jsx:11`), `Badge/Separator` (`JobCenter.jsx:10-11`), `ShieldCheck/AlertTriangle/Clock` (`CoverAssignmentPanel.jsx:11`), `Plus/X/Badge` (`cover/CoverTeacherConfig.jsx:9-10`), `Users/Plus/Search/Trash2` (`Messaging.jsx:9`) | various                                                                  |

---

## 8. Open questions for the owner

1. **Which recruitment model is the product?** `Applicant` (ATS, no tenancy), `JobApplication` (teacher-initiated, `school_id`), and `HiringPipeline` (marketplace, `school_id`) are three separate tracks with three incompatible status vocabularies. Is the target one unified `Application` entity with one stage enum, or genuinely two products (in-school ATS + cross-school marketplace)?
2. **How do candidates get in?** `JobCenter.jsx:32` advertises a public `/apply/:jobId` page that does not exist. Should the ingress be (a) that public page, (b) `JobApplication` from a teacher's personal workspace, (c) manual entry by an admin, or (d) all three converging on one record?
3. **Is `TeacherPublicProfile` still the plan, or did it get folded into `User`?** Both profile editors write to `User` via `auth.updateMe`. If the marketplace is real, who writes `TeacherPublicProfile`, who computes `profile_score` (what's the exact formula?), and who sets `verified_teacher/degree/certificate/identity` — is there a SchoolTroop-staff back-office?
4. **`DocumentRequest` needs a second half.** Candidates have no screen to approve or decline. Should it live in `/personal/profile`, and should approval be per-school, time-limited (`expires_at` exists on `Notification` but not here), and revocable?
5. **What triggers a `CoverAssignment`?** `trigger_reason` is `marked_absent | missed_punch`. Should this fire from `TeacherAttendance` / `PersonalAttendance` writes, from a scheduled backend job at a cutoff time, or manually by an admin? And what is the "missed punch" grace window?
6. **Where do hourly rates live?** `PayrollImpactLog.hourly_rate_cover/primary` have no source — no rate field exists on `User`, `WorkspaceMember`, or `SchoolSettings`. And what is the actual deduction policy: is the absent teacher docked the same hours the substitute gains, or a different rate/fraction?
7. **What produces `extra_hours_logged`?** Period length × periods covered from `ScheduleSlot`? A manual admin entry? Is a half-day absence pro-rated?
8. **Does the Print Agent exist?** `PrintAgentSetup.jsx` documents a complete REST contract and ships sample Python, but no agent is in the repo. Is it built, planned, or should the queue be manual-only (in which case "Print" should be relabelled and the agent tab removed)?
9. **Should the print queue generate its own documents?** Four of the five `print_type` values (`Report Card`, `Attendance Sheet`, `Exam Paper`, `Custom`) require the user to paste a URL by hand. Should `/reports` and Attendance be able to push a generated PDF straight into `PrintQueue`?
10. **Which grading scale is canonical?** Three engines use three different band sets (7-band with D, 6-band without D) and two different averaging methods (weighted-by-max-marks vs. mean-of-percentages). Same for attendance thresholds (60/80, 75, 85).
11. **`/reports` has one report type.** What else was intended — class-wide report cards, attendance registers, exam mark sheets, staff reports? And should report cards be bulk-generated per class rather than one student at a time?
12. **Should AI teacher comments be persisted and approved?** Today they vanish on navigate. Should they be stored (on `Mark`? a new `ReportComment`?) and pass through a teacher edit/approve step before appearing on a parent-facing document?
13. **`Messaging.jsx` or `Communication.jsx`?** Two full chat implementations with different semantics. Which survives, and does the survivor need per-school scoping, per-role channel access, threading (`thread_id` is already in the schema), read receipts, and message-triggered notifications?
14. **Should parent contact be logged?** Today WhatsApp/email/phone are OS hand-offs with zero record. Is a contact log required for safeguarding/compliance? And is a real SMS/WhatsApp Business provider in scope?
15. **Who may see the audit trail?** `audit_log_view` is defined for superadmin but there is no viewer page. Is a SuperAdmin audit console in scope, and should `AuditLog` be genuinely append-only (which the scorecard-in-AuditLog design currently prevents)?
16. **Should the scorecard be per-interviewer?** Today a second evaluator overwrites the first. Do you want multiple independent scorecards with weights and a panel average?
17. **`HiringPortal` vs `Recruitment` — keep both?** `/hiring` (admin) and `/recruitment` (superadmin) are overlapping ATS implementations, both routed and both in the nav, with different feature sets (HiringPortal has HiredStaff + InterviewSchedule; Recruitment has the Kanban + dossier + marketplace).
18. **What happens on "hire"?** The only implementation is in an orphaned file and calls an undocumented `base44.users.inviteUser`. Should hiring create a `HiredStaff` row, a `WorkspaceMember` invite, both, and should it copy the candidate's profile into a staff record?
19. **`Sidebar.jsx` is truncated in this export** — please confirm the live app has a complete version, and share it; it is the authoritative record of desktop navigation and per-item role visibility.
20. **Tenancy convention:** `workspace_id` + RLS (used by Print and the academic core) or `school_id` (used by all of HR/recruitment/cover, with no RLS)? Should `useScopedEntity` become the mandatory access path, and should `Message` / `JobPosting` / `Applicant` / `InterviewSchedule` / `HiredStaff` gain a tenant column?

---

## 9. Cross-area dependencies

**This area reads from (owned elsewhere):**

| Entity                     | Used by                                                                                                                                                                                                                                         | For                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                     | `CandidateBrowse.jsx:39`, `CandidateProfile.jsx:33`, `CoverAssignmentPanel.jsx:36`, `cover/CoverTeacherConfig.jsx:30`, `PayrollImpactPanel.jsx:20`, `Messaging.jsx:57`, `Communication.jsx:58`                                                  | name resolution, role badges, teacher lists, member roster. **Note:** `CandidateProfile.jsx:33` fetches the _entire_ user table to find one record.   |
| `Class`                    | `NewPrintJobDialog.jsx:21`, `PrintQueuePanel.jsx:35`, `PrinterDashboard` (indirect), `cover/CoverTeacherConfig.jsx:20`, `CoverAssignmentPanel.jsx:41`, `StudentReportCard.jsx:39`, `ReportStudentSelector.jsx:17`, `Communication.jsx:206, 332` | class names, `total_students`, `subject`/`section`, `teacher_name`. **`Class` has no teacher FK** — this is what breaks cover-teacher config (§7.13). |
| `Student`                  | `NewPrintJobDialog.jsx:24` (copy count), `ReportStudentSelector.jsx:16`, `Communication.jsx:202` (parent contacts)                                                                                                                              | print quantities, report subject, parent phone/email fields (`father_mobile`, `mother_email`, `parent_contact`, …)                                    |
| `Handout`                  | `NewPrintJobDialog.jsx:23`, `Communication.jsx:334`                                                                                                                                                                                             | `document_url` source for print jobs; portal feed                                                                                                     |
| `Mark`                     | `StudentReportCard.jsx:33`, `ProgressReportGenerator.jsx:18`                                                                                                                                                                                    | report-card aggregation (`marks_obtained`, `max_marks`, `subject`, `component`, `assessment_title`, `term`)                                           |
| `Attendance`               | `ProgressReportGenerator.jsx:19` (orphan) only                                                                                                                                                                                                  | attendance summary. **Not used by print** despite the "attendance-informed quantities" idea.                                                          |
| `Assignment`, `DiaryEntry` | `Communication.jsx:335-336`                                                                                                                                                                                                                     | Student Portal Feed                                                                                                                                   |
| `SchoolSettings`           | `useSchool()` → `school?.name` in `StudentAnalytics.jsx:131` / `StudentDetail.jsx:150` for PDF branding                                                                                                                                         | **Not used by `StudentReportCard.jsx`** (hardcoded name)                                                                                              |
| `WorkspaceMember`          | via `useSchool()` → `currentRole` → `useEffectiveRole()`                                                                                                                                                                                        | every role guard in the area                                                                                                                          |

**This area writes to (consumed elsewhere):**

| Entity                   | Written by                                                                                                                                                                                   | Consumed by                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Notification`           | `CandidateProfile.jsx:59`, `CoverAssignmentPanel.jsx:66`, `HiringPipelinePage.jsx:79,96` (orphan)                                                                                            | `components/layout/NotificationCenter.jsx` (bell) — **partially broken, §7.13**                                   |
| `AuditLog`               | `KanbanBoard.jsx:136`, `ApplicantDossier.jsx:42`, `DossierActivityTimeline.jsx:72`, `DossierEmailSender.jsx:41`, `DossierScorecard.jsx:66,72`, `logAudit` from `CoverAssignmentPanel.jsx:74` | only `DossierActivityTimeline` / `DossierScorecard`, filtered by `entity_id`. **No global audit viewer.**         |
| `Message`                | `Messaging.jsx:64`, `Communication.jsx:62`, `CandidateProfile.jsx:73`                                                                                                                        | the two chat UIs + the recruitment DM box. Cross-contaminating (§7.13).                                           |
| `JobPosting`             | `JobCenter.jsx:75`, `HiringPortal.jsx:83`                                                                                                                                                    | `personal/CvJobs.jsx:21` (teacher job board) — **cross-area, cross-tenant**                                       |
| `JobApplication`         | `personal/CvJobs.jsx:128`                                                                                                                                                                    | **nothing**                                                                                                       |
| `PrintQueue` / `Printer` | Print Center                                                                                                                                                                                 | the (non-existent) Print Agent; `NotificationCenter` expects `print_ready`/`print_failed` types that nobody emits |

**Shared infrastructure this area depends on:**
`src/lib/SchoolContext.jsx` (`activeWorkspaceId` — only Print uses it), `src/lib/AuthContext.jsx` (`user`), `src/lib/RoleGuard.jsx` + `permissions.js` (route guards; the matrix itself is unused), `src/components/shared/FileViewer.jsx` (resume/document preview — prop-name trap, §7.8), `src/components/shared/PageHeader.jsx`, `base44.integrations.Core.SendEmail` (recruitment email — the only real send) / `UploadFile` (message attachments) / `InvokeLLM` (report comments), `@tanstack/react-query` with shared cache keys (`['classes']`, `['students']`, `['users']`, `['applicants']`, `['job-postings']`) that collide with other areas' queries — the same key is fetched with different sorts/limits in different files (e.g. `['applicants']` is `list()` in `JobCenter.jsx:64` but `list('-created_date', 200)` in `KanbanBoard.jsx:97`), so whichever mounts first wins.

**Downstream areas blocked by this one:**

- Payroll cannot consume cover-teacher data (nothing creates `PayrollImpactLog`).
- Staff/HR cannot consume hiring outcomes (nothing creates `HiredStaff`; no hire → `WorkspaceMember` path outside an orphan file).
- Any "activity feed" dashboard is blocked on `logActivity` having no callers.
