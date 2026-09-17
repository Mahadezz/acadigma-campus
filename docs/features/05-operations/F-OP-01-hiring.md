# F-OP-01 — Hiring

|                  |                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | ops                                                                                                                                                                                                                                                                                                                                                                           |
| Status           | planned                                                                                                                                                                                                                                                                                                                                                                       |
| Owner branch     | `feat/ops-hiring`                                                                                                                                                                                                                                                                                                                                                             |
| Depends on       | F-ID-01 (auth/profiles), F-ID-02 (workspaces + memberships + invitations), F-OP-06 (staff records), F-OP-05 (notifications/email), F-PL-0x (platform verification console)                                                                                                                                                                                                    |
| Plan             | `docs/plan/ROADMAP.md` M4 4.6, **resolved by the research-debate synthesis (D-28/OQ-16, H-01/H-02): minimal scope, apply-only — postings, public apply, pipeline, and verified profile only, in M4/R1.5.** Candidate browse is deleted (§3.5/§3.6, §11); dossier, interviews and scorecards (this file's internal Parts 5–7) stay **behind M6**, not part of the R1.5 launch. |
| Base44 reference | `docs/reference/base44-inventory/05-operations.md` §1.1, §2.2 (`JobPosting`, `JobApplication`, `Applicant`, `HiringPipeline`, `InterviewSchedule`, `HiredStaff`, `TeacherPublicProfile`, `DocumentRequest`), §3 rows 1–31, §4.1, §4.2, §5 (Recruitment), §6.3, §7.5, §7.6, §8 Q1–Q4, Q16–Q18                                                                                  |

---

## 1. Purpose

A school needs to fill a vacancy: publish it, collect real applications, work the candidates through one pipeline, interview them, score them fairly, ask for documents with the candidate's consent, and — when they say yes — turn the candidate into a member of the workspace with a staff record, without retyping anything. A teacher needs the mirror of that: one public profile they own, an "open to work" switch, and a list of applications they can track. That is **Hiring**: one module at `/app/hiring` (school side), `/personal/applications` + `/personal/cv` + `/personal/requests` (teacher side), and `/jobs/[slug]` + `/jobs/[slug]/apply` (public).

**What Base44 intended and what was fake.** The prototype started _three_ disconnected recruitment products (inventory §1.1): an ATS on `Applicant`, a teacher-initiated board on `JobApplication`, and a marketplace on `HiringPipeline` — three tables, three incompatible status enums, no shared tenant column. **Nothing anywhere created an `Applicant`, a `HiredStaff` or a `TeacherPublicProfile`** (§7.5), so the Kanban, the dossier, the onboarding tracker and Browse Candidates were permanently empty screens over tables with no writer. The advertised public ingress `/apply/:jobId` was never added to the router (§3 row 18). "Schedule Interview" wrote a row nobody ever read (§7.12). The scorecard was stored _inside_ `AuditLog` and **updated in place**, so a second interviewer silently overwrote the first (§7.3). `DocumentRequest` had no candidate-side screen, so every consent request stayed `pending_candidate_response` forever (§3 row 14). `profile_score` was displayed but never computed (§5). Hiring's only genuinely working piece was the templated candidate email (§6.3).

**Done looks like:** an admin posts a job, copies one public link, and applications arrive from strangers and from Acadigma teachers into the same list; they move through one stage enum on a kanban (desktop) or a list with a stage sheet (phone); interviews are scheduled with a real email and a real calendar invite; each interviewer files their own scorecard and the panel sees a weighted average; documents are only ever seen after the candidate taps Approve in their own personal area; and pressing **Hire** produces a workspace invitation and a staff record that is waiting when the person accepts.

## 2. Roles and permissions

`packages/domain/permissions` keys. Roles are workspace membership roles (`owner | admin | teacher | staff | parent`) plus `platform` (`profiles.is_platform_admin`) and `public` (unauthenticated / non-member).

| Action                                                                                  | Permission key                 | owner | admin | teacher | staff | parent | platform |                       public                       |
| --------------------------------------------------------------------------------------- | ------------------------------ | :---: | :---: | :-----: | :---: | :----: | :------: | :------------------------------------------------: |
| View hiring module                                                                      | `hiring.view`                  |  ✅   |  ✅   |    —    |   —   |   —    |   read   |                         —                          |
| Create/edit/close job posting                                                           | `hiring.posting.write`         |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| Publish job posting (makes it public)                                                   | `hiring.posting.publish`       |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| View applications + dossier                                                             | `hiring.application.view`      |  ✅   |  ✅   |    —    |   —   |   —    |   read   |                         —                          |
| Move application stage                                                                  | `hiring.application.stage`     |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| Add internal note to application                                                        | `hiring.application.note`      |  ✅   |  ✅   |   ✅¹   |   —   |   —    |    —     |                         —                          |
| Schedule / reschedule / cancel interview                                                | `hiring.interview.manage`      |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| Be an interviewer (read own interview)                                                  | —                              |  ✅   |  ✅   |   ✅¹   |  ✅¹  |   —    |    —     |                         —                          |
| Submit / edit **own** scorecard                                                         | `hiring.scorecard.write`       |  ✅   |  ✅   |   ✅¹   |  ✅¹  |   —    |    —     |                         —                          |
| See all scorecards + panel average                                                      | `hiring.scorecard.viewAll`     |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| Send templated candidate email                                                          | `hiring.email.send`            |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| Request candidate documents                                                             | `hiring.documents.request`     |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| Open an approved candidate document                                                     | `hiring.documents.open`        |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| ~~Browse opted-in teacher profiles~~ **(deleted — no school-side directory; see §3.5)** | —                              |   —   |   —   |    —    |   —   |   —    |    —     |
| Hire (invite + staff record)                                                            | `hiring.hire`                  |  ✅   |  ✅   |    —    |   —   |   —    |    —     |                         —                          |
| Apply to a job                                                                          | —                              |   —   |   —   |    —    |   —   |   —    |    —     | ✅ (any signed-in user; public page signs them up) |
| Edit **own** teacher profile / `open_to_work`                                           | `profile.teacher.write`        |  own  |  own  |   own   |  own  |  own   |    —     |                         —                          |
| Approve / decline / revoke a document request                                           | `profile.documents.consent`    |  own  |  own  |   own   |  own  |  own   |    —     |                         —                          |
| Verify degree / certificate / identity                                                  | `platform.verification.decide` |   —   |   —   |    —    |   —   |   —    |    ✅    |                         —                          |

¹ Only when the member is listed on that application's interview panel (`interviews.interviewer_id` or `interview_panelists`). Enforced by RLS, not only by UI.

**Plan entitlement.** The hiring module is a **Pro** entitlement (PRODUCT-DECISIONS §5.1). Free/Starter workspaces see an upgrade card at `/app/hiring`; the public `/jobs/[slug]` page 404s for a workspace without the entitlement. Teacher-side profile + applications are **not** gated (they belong to the user, not a school plan).

## 3. Data

> **All columns below are _proposed; `docs/architecture/DATA-MODEL.md` wins_.** Every school-owned table carries the tenant key `workspace_id uuid not null references workspaces` plus the standard `id / created_at / updated_at / created_by` from ARCHITECTURE §4. User-owned tables (`teacher_profiles`, `profile_verifications`) carry `user_id` and **no** `workspace_id` — they are deliberately cross-tenant.

### 3.1 `job_postings` (workspace-owned)

| Column                                             | Type                   | Notes                                                                                          |
| -------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| `workspace_id`                                     | uuid                   | tenant key                                                                                     |
| `code`                                             | text                   | `JOB-2026-0007` via `app.next_id(workspace_id,'job')`                                          |
| `slug`                                             | text                   | globally unique, `{workspace-slug}-{title-slug}-{code-suffix}`; public URL segment             |
| `title`                                            | text not null          |                                                                                                |
| `department`                                       | text                   | free text, suggested list from `custom_labels`                                                 |
| `employment_type`                                  | enum `employment_type` | `full_time \| part_time \| contract \| substitute \| volunteer`                                |
| `subject_ids`                                      | uuid[]                 | FK-ish to `subjects` (array, **not** a comma string as in Base44)                              |
| `grade_level_ids`                                  | uuid[]                 |                                                                                                |
| `description_md`                                   | text                   |                                                                                                |
| `required_qualifications`                          | text                   |                                                                                                |
| `preferred_qualifications`                         | text                   |                                                                                                |
| `responsibilities`                                 | text                   |                                                                                                |
| `salary_min_paisa` / `salary_max_paisa`            | bigint                 | money = paisa (ARCHITECTURE §4); `currency char(3) default 'BDT'`                              |
| `salary_visible`                                   | bool default true      | hides the range on the public page                                                             |
| `openings`                                         | int default 1          | how many hires close this posting                                                              |
| `location`                                         | text                   |                                                                                                |
| `closes_on`                                        | date                   | deadline; null = open-ended                                                                    |
| `status`                                           | enum `posting_status`  | `draft \| open \| paused \| closed \| filled`                                                  |
| `published_at` / `closed_at`                       | timestamptz            |                                                                                                |
| `require_demo_lesson` / `require_background_check` | bool default false     | drive optional checklist items on the application, **not** extra pipeline stages               |
| `screening_questions`                              | jsonb                  | `[{id, label, type: short_text\|long_text\|single_select\|yes_no, options?, required}]`, max 8 |
| `application_count`                                | int                    | maintained by trigger (Base44's was never written, §2.2)                                       |

Indexes: `(workspace_id, status)`, unique `(slug)`, unique `(workspace_id, code)`.
RLS: select for `has_role(workspace_id,'{owner,admin}')`; **plus an anonymous select policy limited to `status='open' and published_at is not null`** exposing only the public columns through a view `public_job_postings` (never the base table).

### 3.2 `applications` (workspace-owned) — **the one pipeline**

| Column                                         | Type                       | Notes                                                                                                     |
| ---------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `workspace_id`                                 | uuid                       | tenant key = the hiring school                                                                            |
| `job_posting_id`                               | uuid not null              |                                                                                                           |
| `applicant_user_id`                            | uuid not null → `profiles` | **always a real user** (public page creates one)                                                          |
| `source`                                       | enum `application_source`  | `public_page \| personal_area \| admin_entry` (`invited_from_browse` removed with candidate browse, §3.5) |
| `stage`                                        | enum `application_stage`   | `applied \| screening \| interview \| offer \| hired \| rejected \| withdrawn`                            |
| `stage_entered_at`                             | timestamptz not null       | time-in-stage math; set by trigger on stage change                                                        |
| `rejection_reason`                             | text                       | required when stage → `rejected`                                                                          |
| `withdrawn_reason`                             | text                       | set by the candidate                                                                                      |
| `cover_note`                                   | text                       | max 2000 (Base44's 200 was too small for a real letter)                                                   |
| `answers`                                      | jsonb                      | responses to `screening_questions`                                                                        |
| `cv_file_id`                                   | uuid → `files`             | private; snapshot of the CV at apply time                                                                 |
| `expected_salary_paisa`                        | bigint                     | optional                                                                                                  |
| `available_from`                               | date                       |                                                                                                           |
| `demo_lesson_done` / `background_check_done`   | bool                       | checklist, only shown when the posting requires them                                                      |
| `rating`                                       | int                        | 1–5 quick admin star, independent of scorecards                                                           |
| `hired_at`, `invitation_id`, `staff_record_id` |                            | filled by the hire action                                                                                 |

Constraints: **unique `(job_posting_id, applicant_user_id)`** — one application per person per job (re-application requires the admin to reopen). Indexes `(workspace_id, stage, stage_entered_at)`, `(applicant_user_id)`.
RLS: school side `has_role(workspace_id,'{owner,admin}')`; **candidate side** `applicant_user_id = app.current_user_id()` for `select` and for `update` limited to `stage='withdrawn'` + `withdrawn_reason` (a candidate may withdraw, nothing else). Interviewers get select through a join policy on `interviews`.

`application_events` (append-only, one row per stage change / note / email / interview action): `(workspace_id, application_id, actor_id, kind ∈ stage_change|note|email|interview|document_request|system, from_stage, to_stage, body, metadata jsonb, created_at)`. **Notes and the activity timeline live here, not in `audit_events`** — `audit_events` remains the generic, trigger-filled, non-user-visible trail (fixes §7.3 where Base44 kept scorecards and notes inside `AuditLog`).

### 3.3 `interviews`

`(workspace_id, application_id, kind ∈ phone|video|in_person|demo_lesson, starts_at timestamptz, duration_minutes int default 45, location text, meeting_url text, organiser_id, status ∈ scheduled|rescheduled|completed|cancelled|no_show, cancel_reason, candidate_confirmed_at, ics_uid text, created_by)`.
`interview_panelists (interview_id, user_id, is_lead bool)` — the panel; each panelist owes one scorecard.
Index `(workspace_id, starts_at)`. RLS: owner/admin full; panelists select their own interviews.

### 3.4 `scorecards` — **one per interviewer**

`(workspace_id, application_id, interview_id nullable, interviewer_id, ratings jsonb, recommendation enum strong_no|no|yes|strong_yes, strengths text, concerns text, submitted_at, template_id)`.
**Unique `(application_id, interview_id, interviewer_id)`** — the constraint that Base44's in-place `AuditLog.update` violated. Once `submitted_at` is set the row is editable by its author for 24 h, then locked (admin can unlock with an audit event).
`scorecard_templates (workspace_id, name, is_default, criteria jsonb)` where `criteria = [{key, label, weight_percent, help}]`, weights must sum to 100.

### 3.5 `teacher_profiles` (user-owned, cross-tenant)

`(user_id pk, headline, bio (≤1500), subject_ids uuid[], grade_level_ids uuid[], curriculum_expertise text[], languages text[], years_experience int, education jsonb [{id, degree, institution, board, year, result}], certifications jsonb, preferred_work_types text[], preferred_locations text[], preferred_school_types text[], salary_min_paisa, salary_max_paisa, photo_file_id, cv_file_id, certificate_file_ids uuid[], marksheet_file_ids uuid[], intro_video_url, portfolio_urls text[], references jsonb, open_to_work bool default false, availability enum available_now|available_30_days|available_60_days|not_looking, visibility enum active|paused default 'paused', profile_score int default 0, profile_score_updated_at, last_active_at)`.

**Candidate browse is deleted entirely (research-debate synthesis, H-03/H-04; `docs/product/research/DECISION-CHANGES.md` §2): there is no school-side directory of teacher profiles, at any plan tier, full stop.** `open_to_work` and `visibility` remain on this table only because a teacher's own `/personal/cv` still uses them (a personal readiness signal to themselves, and — once a candidate has applied — the visible state on their own application in a school's pipeline), but **no code path lets a school enumerate, filter or search teacher profiles who have not applied to one of that school's own postings.** Files listed here are `files.visibility='private'`; nothing but an approved `document_requests` row unlocks them for a school (§5.6), and that request can only be raised against a candidate who already has an `applications` row with that school.

RLS: owner of the row has full access; a school may `select` **only** the projection joined through its own `applications` row for that candidate (i.e. `exists (select 1 from applications a where a.candidate_user_id = teacher_profiles.user_id and a.workspace_id = current_workspace)`) — never an unscoped select, never a directory query, never a `security definer` browse function. **The prior `app.browse_teacher_profiles(filters)` function and the Pro-plan `hiring.candidates.browse` entitlement gate are removed from this spec.** If candidate browse is ever restored in a future spec, **a prerequisite must land first: an `employer_exclusion` array on `teacher_profiles` letting a candidate block specific schools from ever seeing their profile even if browse returns** — building browse again without that control first is explicitly out of bounds (§11).

### 3.6 `profile_verifications` (platform-owned)

`(user_id, kind ∈ identity|degree|certificate, target_ref text (education entry id / certificate file id / 'self'), evidence_file_ids uuid[], status ∈ pending|approved|rejected, submitted_at, reviewed_by, reviewed_at, note)`.
Reviewed in the same `/platform` console as seller KYC, same **2 business day SLA** (PRODUCT-DECISIONS §4.5). Approval is what sets the badges; nothing in a school workspace can write this table.

### 3.7 `document_requests` (consent handshake)

`(workspace_id, application_id nullable, requested_by, candidate_user_id, document_kinds text[] ∈ cv|nid|degree|certificate|marksheet|reference|police_clearance, message, status ∈ pending|approved|declined|revoked|expired, responded_at, decline_reason, approved_until timestamptz, revoked_at, revoked_by)`.
The candidate-side half **exists** at `/personal/requests` (PRODUCT-DECISIONS §1.15) — this is the fix for §3 row 14.
RLS: school side `has_role(workspace_id,'{owner,admin}')` for select/insert; candidate `candidate_user_id = app.current_user_id()` for select + the approve/decline/revoke update.

### 3.8 Tables touched but owned elsewhere

`profiles`, `workspaces`, `workspace_members`, `workspace_invitations` (F-ID-02) · `staff_records`, `staff_compensation` (F-OP-06) · `files`, `file_access_log` (platform files) · `notifications`, `email_log` (F-OP-05) · `jobs` (render/email/cron) · `audit_events` · `plans` (entitlement `hiring`).

## 4. Workflows

### W1 — Publish a vacancy

Trigger: admin taps **New job** at `/app/hiring` (tab _Jobs_).

1. Sheet (phone) / dialog (desktop): title, department, employment type, subjects, openings, salary range, closing date, description, up to 8 screening questions, the two optional checks. Saved as `draft` at every step (autosave every 3 s, no "lost work").
2. **Publish** → validation: title, employment type, ≥1 subject or department, closing date ≥ today. `status='open'`, `published_at=now()`, slug generated.
3. Outcome: a **Copy public link** button gives `https://…/jobs/{slug}` (a real, routed page — this is inventory §3 row 18 made real). The link is also a QR in the share sheet, for printing on a notice board.
4. Audit: `audit_events` insert (generic trigger). No notification.
   Failures: slug collision → append `-2`; workspace lacks the `hiring` entitlement → publish blocked with an upgrade sheet; closing a posting with active applications warns "12 candidates are still in progress".

### W2 — Public application (the ingress Base44 never built)

Trigger: anyone opens `/jobs/{slug}` and taps **Apply**.

1. `/jobs/{slug}/apply` step 1 — **Are you already on Acadigma?** → _Sign in_ (returns to the same step) or _Continue as new_.
2. Step 2 — **lightweight account creation**: full name, email, phone, password (or "email me a link"). Turnstile challenge. On submit: Supabase Auth user + `profiles` row + **exactly one personal workspace** (PRODUCT-DECISIONS §1.2) + an empty `teacher_profiles` row. Email verification is sent but **does not block** the application (an unverified applicant is flagged in the dossier).
3. Step 3 — **the application**: CV upload (pdf/doc/docx ≤ 10 MB → `files`, private), cover note, expected salary, available-from, screening questions.
4. Step 4 — review + consent checkbox: _"I agree that {School} may view this application and the documents I attach to it."_ Submit.
5. Outcome: `applications` row `stage='applied'`, `source='public_page'`; `application_events` `kind='system'`; confirmation email to the candidate; in-app notification `hiring.application.received` to owner+admin; `job_postings.application_count` incremented by trigger.
   Phone flow: four **full-screen steps** (not a sheet — this is a stranger on a phone, sheets are for members), a persistent progress bar, a sticky bottom primary button, file picker via the OS sheet, and a resume-later link emailed after step 2 so a dropped connection does not lose the CV.
   Failures: duplicate `(job, user)` → "You already applied on 3 Sep" + link to `/personal/applications`; posting closed between load and submit → friendly closed state with "See other jobs at {School}"; upload over quota → the _school's_ storage quota is not charged, the file counts against the platform's applicant bucket (see §11 Q4).

### W3 — Application from the personal area

Trigger: a signed-in teacher at `/personal/jobs` (browse open postings across all schools).
Same as W2 from step 3, but the CV defaults to `teacher_profiles.cv_file_id` and the profile is attached by reference: `source='personal_area'`. The "your CV will be sent automatically" claim that was fake in Base44 (§7.12) is true here because the file id is copied onto the application row.

### W4 — Work the pipeline

Trigger: admin opens `/app/hiring` tab _Pipeline_ (per posting, or "All jobs").

1. **Desktop ≥1024: kanban.** Seven columns — Applied, Screening, Interview, Offer, Hired, Rejected, Withdrawn — with the three terminal columns collapsed behind a "Closed (14)" toggle by default. Drag to move; optimistic update; server confirms.
2. **Phone 360: list + sheet.** One vertical list, grouped by stage with sticky group headers and a stage filter chip row at the top (one-thumb reachable, scrolls horizontally). Tapping a card opens a **stage sheet**: candidate summary, current stage, and a vertical list of legal next stages as 44 px rows. No drag-and-drop on touch.
3. Each move writes `application_events{kind:'stage_change', from_stage, to_stage, actor_id}` and updates `stage_entered_at`. Moving to `rejected` requires a reason (sheet with 5 canned reasons + free text). Moving to `offer` or `rejected` offers "send the {offer|rejection} email now?" pre-filled from a template.
4. Outcome: candidate sees their own stage at `/personal/applications` as a 3-state summary (**In review / Interviewing / Decision made**) — the internal stage vocabulary is never shown to the candidate.
   Failures: concurrent move → last write wins but the loser's toast reads "Rafiq moved this to Interview 2 s ago" and the board refetches; a move on an archived posting is rejected.

### W5 — Schedule an interview

Trigger: **Schedule interview** from the dossier or from the stage sheet when moving into `interview`.

1. Form: kind, date+time (workspace timezone), duration, panel (multi-select of active members), location or meeting URL, note to candidate.
2. On save: `interviews` + `interview_panelists`; an **ICS invite** (`ics_uid`, method REQUEST) is emailed to the candidate and every panelist through `adapters/email` (logged in `email_log`); in-app notification `hiring.interview.scheduled` to panelists; `application_events{kind:'interview'}`.
3. The candidate's confirmation link sets `candidate_confirmed_at` (no account action needed beyond the signed link).
4. Reschedule re-sends an ICS with a bumped `SEQUENCE`; cancel sends METHOD:CANCEL.
5. A `jobs` row reminds panelists and the candidate **24 h and 1 h** before (notification + email).
   Failures: panelist has a timetable period at that time → non-blocking warning "Ms. Nadia teaches Class 7 – B at 10:30"; past datetime rejected; email send failure is retried 3× by the job runner and surfaced on the interview card (never silently swallowed as Base44's `logAudit` did, §7.1).

### W6 — Scorecards

Trigger: interview `starts_at` passes → each panelist gets "Score Ayesha Rahman" in their notifications and on `/app/hiring` → _My scorecards_.

1. Sheet: five criteria (from the workspace's default template) as 1–5 segmented controls with an explicit **N/A**, a recommendation selector, strengths, concerns.
2. Submit → `scorecards` row (unique per interviewer). Editable for 24 h.
3. The dossier shows each interviewer's score, the **panel average** (§5.4), and the recommendation tally. **An interviewer cannot see another's scorecard until they have submitted their own** (anti-anchoring; enforced in the query, not the UI).
   Failures: a panelist who leaves the workspace keeps their submitted scorecard (attributed, immutable); an unsubmitted one is dropped from the panel average and the panel shows "2 of 3 filed".

### W7 — Request documents (consent)

Trigger: admin taps **Request documents** on a candidate's dossier within one of the school's own applications (browse is deleted, §3.5).

1. Sheet: tick the document kinds, optional message. Creates `document_requests{status:'pending'}`; notification + email to the candidate with a deep link to `/personal/requests`.
2. Candidate at `/personal/requests` sees _who_ is asking, _which school_, _which documents_, and two 44 px buttons: **Approve for 30 days** / **Decline** (decline asks for an optional reason).
3. Approve → `status='approved'`, `approved_until = now() + interval '30 days'`. Decline → `status='declined'`.
4. The school's dossier then shows the documents as **thumbnails behind a signed-URL fetch** (`/api/files/{id}`, 5 min, logged to `file_access_log`). Every open is logged and shown back to the candidate as "Viewed by {School} on 12 Sep".
5. Candidate may **Revoke** at any time → `revoked_at`, access dies on the next signed-URL request.
6. A `jobs` row expires approvals nightly (`status='expired'` when `approved_until < now()`).
   Failures: a request to a candidate who has no such document shows "Not uploaded yet" to the school and prompts the candidate to upload.

### W8 — ~~Browse candidates~~ (deleted)

**Removed in full** (research-debate synthesis, H-03/H-04). There is no admin tab, no cross-school profile search, no "Invite to apply" from an unsolicited profile view, and no `Pro`-entitlement gate for it — none of that exists in this spec. A school's only way to see a teacher's profile is through an `applications` row that teacher created themselves (public apply, W3). See §3.5 for the prerequisite (`employer_exclusion`) a future restoration would need.

### W9 — Hire

Trigger: admin moves an application to **Hired** (only legal from `offer`).

1. Confirm sheet: workspace role (`teacher` or `staff`), designation (a `custom_labels` entry, e.g. Principal), department, employment type, start date, and — if the actor has `staff.compensation.view` — hourly rate and/or monthly salary.
2. Transaction:
   a. `applications.stage='hired'`, `hired_at=now()`;
   b. `workspace_invitations` row (email = the candidate's, role as chosen, `source='hire'`, expires in 14 days) + invitation email;
   c. `staff_records` row with `employment_status='pending_join'`, `user_id` set, `staff_code` from `app.next_id(workspace_id,'staff')`, linked back via `applications.staff_record_id`;
   d. optional `staff_compensation` row (F-OP-06 §3);
   e. `job_postings.openings` decremented; when it reaches 0 → `status='filled'` and the remaining candidates are offered a bulk "send rejection" action (never automatic).
3. On invitation accept: `workspace_members` becomes `active`, `staff_records.employment_status='active'`, `joined_on` = accept date, and the new member lands in `/app` with a welcome checklist.
   Failures: the email already has an **active** membership in this workspace → skip the invitation, just create/attach the staff record; invitation expires → the staff record stays `pending_join` and `/app/staff` shows a "Resend invitation" action; the transaction is idempotent on `idempotency_key` so a double-tap cannot create two invitations.

### W10 — Platform verification

Trigger: a teacher taps **Get verified** on `/personal/cv`.

1. They pick what to verify (identity / a specific degree row / a certificate) and attach evidence files (private).
2. `profile_verifications{status:'pending'}`; appears in the `/platform` queue beside seller KYC with the same 2-business-day SLA.
3. Platform staff approve or reject with a note. Approval sets the badge and triggers a `profile_score` recompute (§5.1). Rejection notifies the teacher with the note and allows re-submission.
   No school role can ever write this table — that is the whole point of the badge.

## 5. Business rules and calculations

### 5.1 `profile_score` (0–100, integer)

Pure function `computeProfileScore(profile, verifications)` in `packages/domain/hiring/profileScore.ts`. Recomputed on: profile save, file attach/detach, verification decision, `open_to_work` toggle. Stored on `teacher_profiles.profile_score` with `profile_score_updated_at`. **Never computed in the browser.**

**Completeness — 70 points max**

| Signal          | Condition                                 | Points |
| --------------- | ----------------------------------------- | ------ |
| Photo           | `photo_file_id` not null                  | 5      |
| Bio             | `length(trim(bio)) >= 120`                | 10     |
| Subjects        | `array_length(subject_ids) >= 1`          | 10     |
| Education       | `jsonb_array_length(education) >= 1`      | 10     |
| CV              | `cv_file_id` not null                     | 10     |
| Experience      | `years_experience` not null               | 5      |
| Grade levels    | `array_length(grade_level_ids) >= 1`      | 5      |
| Work preference | `array_length(preferred_work_types) >= 1` | 5      |
| Locations       | `array_length(preferred_locations) >= 1`  | 5      |
| Languages       | `array_length(languages) >= 1`            | 5      |

**Verification — 30 points max**

| Signal                       | Condition                                                  | Points |
| ---------------------------- | ---------------------------------------------------------- | ------ |
| Identity verified            | an approved `profile_verifications` with `kind='identity'` | 10     |
| Degree verified              | ≥1 approved `kind='degree'`                                | 10     |
| Certificate verified         | ≥1 approved `kind='certificate'`                           | 5      |
| Teacher verified (composite) | identity approved **and** ≥1 degree approved               | 5      |

`profile_score = LEAST(100, completeness + verification)`. No partial credit, no decay, no hidden weights. The UI shows the score **with its missing items** ("+10 — add your CV"), because an unexplained score is what made Base44's version useless.

### 5.2 Stage machine

Active stages in order: `applied (1) → screening (2) → interview (3) → offer (4)`. Terminal: `hired`, `rejected`, `withdrawn`.

- Forward: to any higher active stage, or to `hired` **only from `offer`**.
- Backward: to any lower active stage (allowed, logged — hiring is not a ratchet).
- `rejected`: from any active stage; requires `rejection_reason`.
- `withdrawn`: written **only by the candidate**; from any active stage.
- Reopen: `rejected|withdrawn → screening` by owner/admin only, with an audit event; `hired` is final (undo = offboarding, F-OP-06).
- `stage_entered_at` is reset by a trigger on every change. **Time in stage** = `now() - stage_entered_at`, displayed in the workspace timezone; the badge is amber at ≥ 3 days, red at ≥ 7 days in `applied|screening`, and ≥ 5 / ≥ 10 days in `interview|offer` (settings `hiring_policy.stale_days`, defaults as listed).

### 5.3 Scorecard score (one interviewer)

Criteria weights come from the workspace's default `scorecard_templates.criteria`; the shipped default:

| Criterion              | Weight |
| ---------------------- | ------ |
| `subject_knowledge`    | 30     |
| `communication`        | 20     |
| `classroom_management` | 20     |
| `culture_fit`          | 15     |
| `overall_impression`   | 15     |

Ratings are integers 1–5 or `null` (N/A).

```
rated   = criteria where rating is not null
score   = Σ(rating_i × weight_i for i in rated) / Σ(weight_i for i in rated)     // 1.00 – 5.00
```

Weights **renormalise** over the rated set (this is Base44's behaviour, §5, made explicit). To stop a single 5★ from reading as a perfect panel score, a scorecard is **`incomplete`** and excluded from the panel average when `Σ(weight_i for i in rated) < 60`. `score` is `null`, not `0`, when nothing is rated. Rounded to 1 decimal for display, stored unrounded (`numeric(4,3)`).

### 5.4 Panel average

```
panel_average = mean(score of every submitted, non-incomplete scorecard for the application)
```

Unweighted across interviewers — **each interviewer counts once** regardless of how many interviews they sat. Displayed to 1 dp with "n of m filed". The recommendation tally (`strong_no/no/yes/strong_yes`) is shown as counts and is **never** mapped to a number — a hiring decision is not an arithmetic mean.

### 5.5 Copy and counts

- `application_count` per posting is maintained by an insert/delete trigger on `applications` (Base44 recomputed it client-side across the whole table, §5).
- "Open positions" = `count(job_postings where status='open')`; "In progress" = `count(applications where stage in (applied,screening,interview,offer))`.
- **Today** for every deadline and time-in-stage is computed in `school_profiles.timezone` (default `Asia/Dhaka`), in SQL — the UTC-`toISOString()` bug of §5 is banned by a lint rule against `new Date().toISOString().split('T')[0]`.

### 5.6 Document access rule (the single gate)

A school may fetch a candidate's private file **iff** all of:

1. an `applications` row links that candidate to that workspace, **or** the candidate has an approved `document_requests` from that workspace; **and**
2. for anything other than the CV attached to the application itself, a `document_requests` row exists with `status='approved'`, `revoked_at is null`, `now() < approved_until`; **and**
3. the requester has `hiring.documents.open` in that workspace.

Implemented once in `app.can_open_candidate_file(file_id)` and called by `/api/files/[id]`. The CV the candidate deliberately attached to _that_ application is readable without a separate request (they attached it); everything else needs consent. Approvals last **30 days**, are revocable instantly, and every open is written to `file_access_log` and shown to the candidate.

### 5.7 Email templates

Stored as React Email templates with a workspace-editable subject/body override (`email_templates(workspace_id, key, subject, body_md)`), keys: `application.received`, `interview.invite`, `interview.reminder`, `offer`, `rejection`, `document.request`, `hire.invitation`. Interpolation tokens: `{{candidate_first_name}}`, `{{job_title}}`, `{{school_name}}`, `{{interview_when}}`, `{{interview_where}}`, `{{sender_name}}`. Attachments are real file links (signed, 7-day link for offer letters) — no "see the attachment" with no attachment (§7.12).

## 6. UI

| Screen            | Route                             | 360×800                                                                                                        | ≥1024                                                            | Primary action                              | Empty / loading / error                                                                                |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Hiring home       | `/app/hiring`                     | Tab bar (Jobs · Pipeline · Candidates · Interviews) as a scrollable chip row; cards                            | Sidebar section + tabs; two-pane                                 | **New job** (FAB, bottom-right, thumb zone) | Empty: "No jobs yet — post your first vacancy" + sample-JD link · Skeleton cards · Inline retry banner |
| Job list / editor | `/app/hiring/jobs`, `…/jobs/[id]` | Full-screen editor, sticky save bar                                                                            | Dialog + live public preview                                     | Publish                                     | Draft badge; autosave indicator                                                                        |
| Pipeline          | `/app/hiring/pipeline`            | Stage chips + grouped list + **stage sheet**                                                                   | **Kanban**, 7 columns, drag-and-drop, terminal columns collapsed | Move stage                                  | "No applications yet — share the public link" + copy button                                            |
| Dossier           | `/app/hiring/applications/[id]`   | Full-screen with a segmented control (Profile · CV · Timeline · Scorecards · Emails); sticky bottom action bar | Two-pane: left detail, right timeline                            | Advance stage                               | Missing CV state; document-locked state with "Request documents"                                       |
| My scorecards     | `/app/hiring/scorecards`          | List of pending scorecards                                                                                     | Same list, wider                                                 | Score                                       | "Nothing to score"                                                                                     |
| Interviews        | `/app/hiring/interviews`          | Agenda list by day                                                                                             | Week calendar + agenda rail                                      | Schedule                                    | Today-empty state                                                                                      |
| Public job        | `/jobs/[slug]`                    | One column, hero + details + sticky **Apply**                                                                  | Centred 720 px                                                   | Apply                                       | 404 for closed/unpublished; "Applications closed" state                                                |
| Public apply      | `/jobs/[slug]/apply`              | 4 full-screen steps, progress bar, sticky CTA                                                                  | Centred card, same steps                                         | Continue / Submit                           | Resume-later link; upload progress; duplicate-application state                                        |
| Teacher CV        | `/personal/cv`                    | Sections as accordions; `open_to_work` switch at top                                                           | Two-column with live preview                                     | Save                                        | Score card with "what's missing"                                                                       |
| My applications   | `/personal/applications`          | List with 3-state status                                                                                       | Table                                                            | Withdraw                                    | "You haven't applied to anything yet" + job board link                                                 |
| Document requests | `/personal/requests`              | Card per request, two 44 px buttons                                                                            | List                                                             | Approve / Decline                           | "No requests"; expired + revoked sections                                                              |

Components from `packages/ui`: `AppShell`, `DataList`, `FormSheet`, `Sheet`/`Dialog`, `SegmentedControl`, `StageChip`, `Avatar`, `FileDropzone`, `SignedFileViewer` (**one** prop name, `fileId` — Base44 shipped two components with `url` vs `fileUrl` and a blank viewer, §7.8), `EmptyState`, `Skeleton`, `ConfirmSheet`, `StepperPage` (public flows).
Accessibility: kanban drag has a keyboard equivalent (select card → `M` → stage menu); all stage moves are reachable from the sheet on every viewport; star/segmented ratings are radio groups with labels.

## 7. Server contracts

All in `apps/web/app/(school)/app/hiring/_actions/*` and `/api` handlers; schemas in `packages/contracts/hiring`. Every action: `parse → permissions.can → repository → Result<T, ApiError>`.

| Name                                      | Input schema                                                                                                         | Output                                | Errors                                                                      | Idempotency                             | Rate limit              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------- | ----------------------- |
| `createJobPosting`                        | `CreateJobPostingInput`                                                                                              | `JobPosting`                          | `forbidden`, `plan_required`, `validation`                                  | key on client draft id                  | 60/h/workspace          |
| `publishJobPosting`                       | `{ id }`                                                                                                             | `JobPosting`                          | `not_found`, `already_published`, `plan_required`                           | natural                                 | 30/h                    |
| `closeJobPosting`                         | `{ id, reason? }`                                                                                                    | `JobPosting`                          |                                                                             |                                         |                         |
| `submitPublicApplication`                 | `PublicApplicationInput` (name, email, phone, password?, coverNote, answers, cvFileId, turnstileToken)               | `{ applicationId }`                   | `duplicate_application`, `posting_closed`, `captcha_failed`, `rate_limited` | key = `(job_posting_id, email)`         | **5/h/IP, 3/day/email** |
| `submitApplication` (signed-in)           | `ApplicationInput`                                                                                                   | `Application`                         | `duplicate_application`, `posting_closed`                                   | `(job_posting_id, user_id)`             | 20/day/user             |
| `moveApplicationStage`                    | `{ applicationId, toStage, reason? }`                                                                                | `Application`                         | `illegal_transition`, `reason_required`, `stale_stage` (optimistic token)   | key per move                            | 300/h                   |
| `addApplicationNote`                      | `{ applicationId, body }`                                                                                            | `ApplicationEvent`                    |                                                                             |                                         | 120/h                   |
| `scheduleInterview`                       | `ScheduleInterviewInput`                                                                                             | `Interview`                           | `in_the_past`, `panelist_not_member`                                        | client draft id                         | 60/h                    |
| `cancelInterview` / `rescheduleInterview` | `{ interviewId, … }`                                                                                                 | `Interview`                           |                                                                             |                                         |                         |
| `submitScorecard`                         | `ScorecardInput` (ratings map, recommendation, text)                                                                 | `Scorecard`                           | `already_locked`, `not_a_panelist`                                          | `(application, interview, interviewer)` | 60/h                    |
| `sendCandidateEmail`                      | `{ applicationId, templateKey, subject, body, attachments[] }`                                                       | `{ emailLogId }`                      | `send_failed`                                                               | key per send                            | 30/h/workspace          |
| `requestDocuments`                        | `{ candidateUserId, applicationId?, kinds[], message? }`                                                             | `DocumentRequest`                     | `duplicate_open_request`                                                    |                                         | 30/day                  |
| `respondToDocumentRequest`                | `{ requestId, decision: approve\|decline, reason? }`                                                                 | `DocumentRequest`                     | `forbidden` (not the candidate)                                             |                                         | 60/h                    |
| `revokeDocumentApproval`                  | `{ requestId }`                                                                                                      | `DocumentRequest`                     |                                                                             |                                         |                         |
| `hireApplicant`                           | `HireInput` (role, designationLabelId, department, employmentType, startDate, hourlyRatePaisa?, monthlySalaryPaisa?) | `{ invitationId, staffRecordId }`     | `not_in_offer_stage`, `already_member`, `seat_limit_reached`                | **required**                            | 30/day                  |
| `updateTeacherProfile`                    | `TeacherProfileInput`                                                                                                | `TeacherProfile` (+ recomputed score) |                                                                             |                                         | 120/h                   |
| `submitVerification`                      | `{ kind, targetRef, evidenceFileIds[] }`                                                                             | `ProfileVerification`                 | `duplicate_pending`                                                         |                                         | 10/day                  |
| `decideVerification` (platform)           | `{ id, decision, note? }`                                                                                            | `ProfileVerification`                 | `forbidden`                                                                 |                                         |                         |
| `GET /api/files/[id]`                     | —                                                                                                                    | 302 → signed URL                      | `forbidden` via `app.can_open_candidate_file`                               | —                                       | 300/h/user              |
| `GET /api/hiring/interviews/[id].ics`     | signed token                                                                                                         | `text/calendar`                       |                                                                             |                                         |                         |

## 8. Parts (build chunks)

**Part 1 — Schema + RLS + domain primitives** · `job_postings`, `applications`, `application_events`, `interviews`, `interview_panelists`, `scorecards`, `scorecard_templates`, `teacher_profiles`, `profile_verifications`, `document_requests` with enums, indexes, RLS policies and the `public_job_postings` view; `packages/domain/hiring` skeleton (`stageMachine.ts`, `profileScore.ts`, `scorecard.ts`) fully unit-tested; `packages/contracts/hiring` Zod schemas. Files: `supabase/migrations/*_hiring.sql`, `supabase/tests/hiring_rls.sql`, `packages/domain/hiring/**`, `packages/contracts/hiring/**`.
_Demo:_ pgTAP proves a member of School A cannot read School B's applications, and a candidate can read only their own; `pnpm test` shows stage-machine and score tables green.

**Part 2 — Job postings CRUD + public job page** · admin list/editor/publish/close, slug generation, entitlement gate, public `/jobs/[slug]` page with SEO metadata and a share sheet.
_Demo:_ an admin publishes a job, opens the public link in a private window at 360×800, and sees the real posting; a Free-plan workspace sees the upgrade card instead.

**Part 3 — Public apply flow + lightweight account creation** · 4-step `/jobs/[slug]/apply`, Turnstile, account + personal workspace + empty teacher profile creation, CV upload to private storage, duplicate guard, confirmation email, resume-later link.
_Demo:_ a stranger on a phone applies end-to-end in under 2 minutes and the application appears in the school's list; a second attempt is refused with the friendly duplicate state.

**Part 4 — Pipeline: kanban (desktop) + list/sheet (phone)** · stage machine wired, optimistic moves, rejection reasons, stale badges, time-in-stage, `application_events` timeline, admin note composer, quick star rating.
_Demo:_ at 1280×800 drag a card Applied → Screening → Interview; at 360×800 do the same three moves through the stage sheet; the timeline shows all six events with the right actor.

**Part 5 — Dossier + candidate email** · profile summary, CV/document viewer (`SignedFileViewer`, one prop name), timeline tab, templated email sender with real attachments and `email_log`, workspace-editable templates.
_Demo:_ send a real interview-invite email from the dossier; the sent copy is on the timeline and in `email_log`.

**Part 6 — Interviews + calendar + reminders** · schedule/reschedule/cancel, panel selection, ICS generation and delivery, candidate confirm link, timetable-conflict warning, 24 h/1 h reminder jobs, interviews agenda + week calendar.
_Demo:_ schedule an interview; the ICS lands in Gmail and Outlook and opens with the right time in Asia/Dhaka; cancelling removes it from the calendar.

**Part 7 — Scorecards** · template editor, per-interviewer sheet, 24 h edit lock, anti-anchoring query, weighted score + panel average + recommendation tally, "n of m filed".
_Demo:_ two interviewers each file a scorecard; neither sees the other's until submitted; the panel average matches the hand-computed weighted number in the test fixture.

**Part 8 — Teacher profile, `open_to_work`, profile score (browse deleted)** · `/personal/cv` editor with live score and "what's missing", visibility/availability switches for the teacher's own reference. **No cross-school browse projection, filters, pagination or invite-to-apply ship** — candidate browse is removed from scope entirely (§3.5, §11); a school only ever sees a `teacher_profiles` row through that candidate's own `applications` row.
_Demo:_ a teacher fills their profile to 85 and flips `open_to_work`; nothing in any other school's UI changes as a result, because no browse surface exists to show it in.

**Part 9 — Document requests + platform verification + hire** · `/personal/requests` approve/decline/revoke, 30-day expiry job, `app.can_open_candidate_file` + access logging + "viewed by" feedback, `/platform` verification queue, the `hireApplicant` transaction (invitation + staff record + openings/filled) and the accept path.
_Demo:_ a school requests an NID, the candidate approves on their phone, the school opens it once (logged), the candidate revokes, and the next open 403s. Then: hire → invitation email → accept → the new teacher appears in `/app/staff` with a staff record.

## 9. Acceptance criteria

**Postings**

1. _Given_ an admin of a Pro workspace, _when_ they publish a job posting, _then_ `/jobs/{slug}` returns 200 to a signed-out browser and shows the school name from `school_profiles`, never a hardcoded name.
2. _Given_ a Free-plan workspace, _when_ an admin opens `/app/hiring`, _then_ they see an upgrade card and no posting can be published.
3. _Given_ a posting with `status='closed'`, _when_ anyone opens `/jobs/{slug}`, _then_ they see "Applications closed" and the apply route 404s.

**Public application** 4. _Given_ a stranger with no Acadigma account, _when_ they complete `/jobs/{slug}/apply`, _then_ an auth user, a `profiles` row, exactly one personal workspace, an empty `teacher_profiles` row and one `applications` row at `stage='applied'` exist, and the school receives a notification. 5. _Given_ a candidate who already applied to that posting, _when_ they submit again, _then_ the server returns `duplicate_application` and no second row is created. 6. _Given_ 6 submissions from one IP within an hour, _when_ the 6th is attempted, _then_ it is rate-limited and no user is created. 7. _Given_ an application in progress, _when_ the browser is closed after step 2, _then_ the emailed resume link returns the applicant to step 3 with the account already created.

**Pipeline** 8. _Given_ an application at `applied`, _when_ an admin drags it to `offer` on desktop, _then_ the stage is `offer`, `stage_entered_at` is now, and one `application_events{kind:'stage_change'}` row exists. 9. _Given_ the same application on a 360×800 viewport, _when_ the admin opens the stage sheet and taps Rejected, _then_ a reason is required and the move is refused without one. 10. _Given_ an application at `screening`, _when_ an admin attempts to move it directly to `hired`, _then_ the server returns `illegal_transition`. 11. _Given_ an application at `interview`, _when_ the candidate taps Withdraw at `/personal/applications`, _then_ the stage becomes `withdrawn` and the school's board updates on the next fetch. 12. _Given_ an application that entered `applied` 8 days ago, _when_ the pipeline renders, _then_ its badge is red and the tooltip reads "8 days in Applied" computed in Asia/Dhaka.

**Interviews** 13. _Given_ an interview scheduled for tomorrow 10:30 Asia/Dhaka, _when_ the panelist opens the emailed ICS, _then_ their calendar shows 10:30 local Dhaka time and the organiser is the school. 14. _Given_ a panelist who teaches Class 7 – B at that period, _when_ the admin picks the slot, _then_ a non-blocking conflict warning names the class and the save still succeeds. 15. _Given_ a scheduled interview, _when_ it is cancelled, _then_ a METHOD:CANCEL ICS is emailed and the interview status is `cancelled`.

**Scorecards** 16. _Given_ two panelists, _when_ the first submits, _then_ the second sees no ratings from the first until their own is submitted. 17. _Given_ one scorecard with `subject_knowledge=5` and everything else N/A, _when_ the panel average is computed, _then_ that scorecard is `incomplete` (weight 30 < 60) and is excluded, and the panel shows "0 of 2 filed". 18. _Given_ a scorecard with `subject_knowledge=4, communication=5, classroom_management=3` and two N/A, _then_ the score is `(4×30+5×20+3×20)/(30+20+20) = 4.0`. 19. _Given_ a submitted scorecard older than 24 h, _when_ its author edits it, _then_ the server returns `already_locked`.

**Documents and consent** 20. _Given_ no approved request, _when_ a school requests `/api/files/{nid_file_id}`, _then_ the response is 403 and a `file_access_log` denial row exists. 21. _Given_ an approved request, _when_ the school opens the file, _then_ a 5-minute signed URL is issued, an access row is logged, and the candidate's `/personal/requests` shows "Viewed by {School}". 22. _Given_ an approval made 31 days ago, _when_ the school opens the file, _then_ the request reads `expired` and access is 403. 23. _Given_ an approved request, _when_ the candidate taps Revoke, _then_ the next school request is 403 within one second.

**Teacher profile (browse deleted)** 24. _Given_ a profile with photo, 150-char bio, 2 subjects, 1 education entry, CV, experience, 1 grade level, 1 work type, 1 location, 1 language and an approved identity verification, _then_ `profile_score = 70 + 10 = 80`. 25. _Given_ any workspace, _when_ its RLS-scoped role queries `teacher_profiles` for a `user_id` with no `applications` row against that workspace, _then_ zero rows are returned regardless of `open_to_work` or `visibility` — there is no browse path to reach it. 26. _Given_ a candidate's dossier surfaced through their own application, _when_ the network payload is inspected, _then_ it contains no email, phone or `file_id` outside what §5.6/`document_requests` explicitly approved.

**Hire** 27. _Given_ an application at `offer`, _when_ an admin hires with role `teacher`, _then_ a `workspace_invitations` row, a `staff_records` row with `employment_status='pending_join'` and an invitation email all exist, and the application links to both. 28. _Given_ that invitation, _when_ the candidate accepts, _then_ `workspace_members.status='active'`, `staff_records.employment_status='active'` and `joined_on` is the accept date. 29. _Given_ a double-tap on Hire, _when_ both requests arrive, _then_ the idempotency key yields exactly one invitation. 30. _Given_ a posting with `openings=1`, _when_ the first hire completes, _then_ `status='filled'` and the remaining candidates are **not** auto-rejected.

**Tenancy** 31. _Given_ an admin of School A, _when_ they query `applications` directly with their JWT, _then_ they receive zero rows belonging to School B (pgTAP). 32. _Given_ a `parent` member, _when_ they open `/app/hiring`, _then_ they are redirected and the server action returns `forbidden`.

## 10. Tests

- **Unit (`packages/domain`, ≥ 80 %)**: `stageMachine` (every legal/illegal transition, including reopen and the candidate-only `withdrawn`), `profileScore` (table-driven over all 14 signals plus the 100 clamp), `scorecard` (renormalisation, the 60-weight incompleteness rule, null vs zero, panel average with mixed completeness), slug generation, stale-badge thresholds, ICS payload builder.
- **DB (pgTAP)**: isolation and escalation per table — a School A admin reading School B's `applications`/`interviews`/`scorecards`/`document_requests`; a candidate updating anything but `withdrawn`; a teacher writing `profile_verifications`; a non-panelist selecting an `interviews` row; the anonymous role selecting `job_postings` directly (must be denied) versus `public_job_postings` (allowed, open only).
- **Integration (server actions)**: `hireApplicant` transaction rollback on seat-limit failure; idempotency on double submit; `submitPublicApplication` under duplicate + captcha failure; `app.can_open_candidate_file` truth table (7 combinations).
- **e2e (Playwright, 360×800 and 1280×800, axe on every page)**: J1 publish → public apply → appears in pipeline; J2 phone stage sheet moves through all four active stages; J3 schedule interview → two scorecards → panel average; J4 request documents → approve on phone → open → revoke → 403; J5 hire → accept invitation → staff record visible.
- **a11y**: kanban keyboard path; all sheets trap focus and restore it; rating groups are labelled radio groups; contrast ≥ 4.5:1 on stage chips.
- **Performance budgets**: `/jobs/[slug]` LCP ≤ 1.8 s on Slow 4G (it is a public, SEO-relevant page); pipeline first render ≤ 1.2 s p95 for 200 applications. (`browseCandidates` budget removed — the endpoint is deleted.)

## 11. Open questions

1. **Recruiter ↔ candidate DM.** PRODUCT-DECISIONS §6.7 scopes messaging to workspace members; a candidate is not a member. _Default assumed:_ candidate communication is **templated email + application notes only** until they are hired. Base44's DM leaked into `#general` (§7.13), so nothing is lost. Flagged to F-OP-05.
2. **Where do applicant CVs count against storage?** They are uploaded by a non-member. _Default assumed:_ they are billed to the **hiring workspace's** quota (the school benefits), counted from `applications.cv_file_id`, and deleted 12 months after the application reaches a terminal stage.
3. **Offer letters.** No offer-letter template/PDF is in scope for v1; the offer email carries a manually attached file. Flagged for FUTURE.
4. **Background check / demo lesson.** Modelled as checklist booleans on the application, not as stages (PRODUCT-DECISIONS §6.1 fixes the stage list at seven). If a school needs them as stages, that is a v2 "custom stages" feature.
5. **Re-application cooldown.** _Default assumed:_ none; the admin reopens a rejected application instead.
6. **`teacher_profiles` and `seller_profiles`** are both per-user capability tables. _Default assumed:_ separate tables, both 1:1 with `profiles`; the platform verification console handles both queues. Confirm with the marketplace area.
7. **Candidate browse — deleted, not deferred (research-debate synthesis, H-03/H-04).** This spec previously let any Pro-plan school run `app.browse_teacher_profiles(filters)` over every opted-in teacher nationwide. That directory is **removed entirely**: no school-side search, no `hiring.candidates.browse` permission, no `/app/hiring/candidates` route, no `browseCandidates` contract (§3.5, §4 W8, §6, §7, §8 Part 8). **If a future spec proposes restoring candidate browse, the prerequisite that must land first is an `employer_exclusion` array on `teacher_profiles`** — letting a candidate name specific schools (a current or former employer, a school they had a bad experience with) that must never see their profile even when browse is otherwise open to them. Restoring browse without that control first is out of scope, not merely unscheduled.
