# Acadigma Campus — Product Requirements Document

Version 1.0 · 2026-09-17 · Owner: Mahadi (Acadigma) · Engineering lead: Claude

Companion documents: `PRODUCT-DECISIONS.md` (every resolved ambiguity with rationale) · `../architecture/ARCHITECTURE.md` · `../features/*` (per-feature specs) · `../plan/ROADMAP.md` (build order) · `FUTURE.md` (out of scope).

---

## 1. Vision

**Acadigma** is a suite of four connected apps for Bangladeshi education: **Campus** (schools — this product), **Students**, **Parents**, and **Admin** (finance). Campus is the flagship and the system of record; the other three are views over its data.

**Acadigma Campus** is the daily operating system for a private/English-medium K-12 school in Bangladesh, built phone-first because teachers run their day from an Android phone, and desktop-capable because the office runs on Windows PCs. It replaces paper registers, WhatsApp groups, Excel mark sheets and printed report cards with one place that is fast on a low-end phone, works in Bengali and English, and is secure enough to hold children's records.

Inside Campus, two platform-wide modules let the whole community benefit from the network: a **marketplace** where verified teachers sell digital teaching materials (BDT, SSLCommerz), and **hiring**, where schools recruit teachers who keep a portable profile. These are modules, not separate products.

## 2. Users and jobs to be done

| Persona                                 | Device            | Top jobs                                                                                                                                                                                                           |
| --------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **School owner** (proprietor/principal) | Windows PC, phone | Set up the school once; see attendance, results and staff at a glance; control billing, roles, modules; audit who changed what.                                                                                    |
| **Admin / office staff**                | Windows PC        | Admissions, timetable, exams, report cards, printing, staff attendance, cover teachers, hiring pipeline, expenses.                                                                                                 |
| **Teacher**                             | Android phone     | Take attendance in under a minute; enter marks; plan lessons (with AI); log what was taught; share resources; message parents/colleagues; see own timetable and workload; optionally sell materials and keep a CV. |
| **Parent**                              | Android phone     | See each child's attendance, results, timetable, homework, behaviour notes and announcements. Read-only.                                                                                                           |
| **Independent teacher / tutor**         | Android phone     | A personal workspace: tutoring students, attendance, files, diary, CV, job applications.                                                                                                                           |
| **Seller** (any verified user)          | Phone or PC       | List materials, get reviewed, sell, see earnings and payouts.                                                                                                                                                      |
| **Platform staff** (Acadigma)           | PC                | Review listings and KYC, run payouts and refunds, manage plans and schools, view audit trails.                                                                                                                     |

## 3. Goals and success metrics (first 6 months after launch)

1. **(amended per SYNTHESIS)** A teacher completes a 40-student section's attendance in **≤ 60 seconds**, measured end-to-end from **phone-out-of-pocket to register saved** — not just the roll-call tap time — on a 360 px phone (measured by e2e + field test). This is a more honest metric than timing the tap alone: it counts unlock, app open/resume, navigation to the correct section, and the save round-trip.
2. Report cards for a whole section generate in **≤ 2 minutes** with zero manual formatting.
3. **Zero cross-tenant data access** — proven by pgTAP isolation tests on every table and an authorized penetration test before launch.
4. **(amended per SYNTHESIS)** 10 schools onboarded; weekly teacher activity is split into two separate metrics rather than one blended number, because mandated and voluntary actions measure very different things: **≥ 70 % of teachers complete a MANDATED action weekly** (attendance, marks entry — required by the job) and **≥ X % of teachers use a VOLUNTARY action weekly** (lesson planner, AI tools — adopted by choice; target to be set once R1 baseline data exists). The old single "≥ 70 % active weekly" figure is deleted as a metric definition — a school forcing attendance to 100% would have silently satisfied it while telling us nothing about voluntary adoption.
5. ≥ 100 approved marketplace listings; first payouts executed from the queue without spreadsheet work.
6. App shell Lighthouse PWA ≥ 90; LCP < 2.5 s on a low-end Android over 3G-fast.

## 4. Scope — Release map

| Release                      | Theme                    | Modules (feature specs)                                                                                                                                                                                                                                                                                                                                                                  | Exit criteria                                                                                                                                                                          |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R0 Foundation**            | Secure multi-tenant base | Auth, profiles, workspaces/membership, invitations, onboarding, notifications shell, audit, files, plans table, design system, CI/CD, platform console shell                                                                                                                                                                                                                             | A school can be created, staff invited, roles enforced by RLS + policy tests; PWA shell installable; CI green with test reports.                                                       |
| **R1 Campus core**           | Run the school day       | Academic structure, students & admission, attendance (student + staff), timetable, exams & marks with BD GPA, assignments, behaviour, calendar, parent portal, messaging, school settings, staff directory, reports/PDF (report card, registers, mark sheets, ID cards), print queue (browser), **Web Push notifications for the installed PWA (amended per SYNTHESIS — moved from R4)** | A real school runs a full month: attendance daily, one exam cycle to report cards, parents see results; installed users get push notifications without waiting for the native wrapper. |
| **R2 Teaching intelligence** | Teach better             | Lesson planner + AI, curriculum & pacing (incl. syllabus PDF extraction), AI credits, AI tools, resources & library, workload, analytics dashboards, student risk                                                                                                                                                                                                                        | Teachers plan and log lessons; AI use is metered and billed to plans; dashboards show real numbers.                                                                                    |
| **R3 Commerce & operations** | Grow and operate         | Payments core (SSLCommerz), seller onboarding/KYC, listings & moderation, browse & purchase (personal + school-funded), earnings & payouts, plans & subscriptions with trial and limits, school billing, hiring, cover teacher + payroll impact, platform queues                                                                                                                         | Money flows end to end in sandbox then live; a hire and a cover assignment happen in a real school.                                                                                    |
| **R4 Native & automation**   | Everywhere               | Android (Capacitor) with QR scan + offline attendance + native push (FCM, on top of the R1 Web Push baseline); Windows (Tauri) with print agent; gate-scan attendance input; scheduled digests                                                                                                                                                                                           | Apps in Play Store / installer; local printing from the queue.                                                                                                                         |

Everything listed in `FUTURE.md` is explicitly not in these releases.

**Amendment 2026-09-17 (D-27, market research):** a **Release 1.5** sits between R1 and R2 — student **fee collection** with the school as merchant of record (F-CM-08), the SSLCommerz payments core (F-CM-01), **metered SMS**, the platform console, and hiring (scope per D-28). The marketplace portion of R3 is **gated by a paid pilot** (20 listings / 200 teachers). Milestone-level detail is in `../plan/ROADMAP.md`.

## 5. Functional requirements (summary — details in feature specs)

### 5.1 Identity & tenancy (F-ID-01…09)

- Email+password, phone OTP, magic link; verified email; device list; account deletion with 30-day grace.
- Workspace types `school` and `personal`; roles `owner|admin|teacher|staff|parent`; membership status `pending|active|removed`; multiple owners; ownership transfer; custom labels (e.g. Principal) map to base roles.
- Invitations by email/SMS and by rotating join code + admin approval; expiry, resend, audit.
- Onboarding: register → personal workspace auto-created → create school (wizard) or join with code → land in the right shell.
- Notifications: event-typed, in-app realtime, preferences, action links; push/email via wrappers/digests.
- Append-only audit of every write, viewable by owners (own school) and platform staff.

### 5.2 Academics (F-AC-01…11)

- Academic years/terms; grade levels (Play–Class 12); sections with class teacher; subjects; section-subject teacher assignments (primary + assistants).
- Student record with minimal required fields, draft admissions, guardians, private documents, sequential IDs, enrollment per year, promotion/transfer, CSV import with validation, ID cards with QR.
- Attendance: per-section daily roll-call (period optional), one-thumb marking, late/excused/half-day, edit window, monthly register, % rules (late counts present by default; 75 % threshold), alerts, offline replay.
- Staff attendance and leave; feeds cover-teacher.
- Timetable: bell schedule, working days (Sat–Thu default), clash detection, teacher/room views, ICS export, print.
- Exams: term exams → exam subjects → marks grid; BD grade scale (A+…F, GPA 5.0, F ⇒ GPA 0, pass 33) configurable; rank; publish to parents; mark sheets.
- Assignments with submissions and scores; behaviour logs with points per term; school calendar with holidays and overrides.
- Student analytics + deterministic, explainable risk score with human override.
- Parent portal strictly scoped to linked children.

### 5.3 Teaching intelligence (F-TE-01…07)

- One structured lesson planner with "Generate with AI"; curriculum spine (syllabus → units → topics; lesson logs; pacing vs periods remaining; syllabus PDF → AI extraction → review → commit).
- AI credit ledger: plan grants, daily reset (Asia/Dhaka), shared pool or per-teacher allocation, fixed price per action, reserve/settle, hard block at zero, credit requests, top-up packs.
- AI tools (worksheet, quiz, parent message, notice, rubric, differentiation, image) — every output persisted; no student PII beyond first name + grade in prompts.
- Resources: personal + school library, folders, sequential per-type IDs, sharing, private files with signed URLs, orphaning + reassignment, real storage meter.
- Workload (scheduled vs logged periods) and analytics dashboards computed from SQL views — no mock data anywhere.

### 5.4 Commerce & billing (F-CM-01…07)

- SSLCommerz hosted checkout; IPN + validation before any entitlement; orders/lines/payments in paisa; refunds; receipts.
- Seller profiles with KYC (private docs, platform review, 2-business-day SLA), verified badge, encrypted payout methods.
- Listings lifecycle with platform moderation; private files; previews; bulk upload; reviews by buyers only.
- Purchase: personal or school-funded (request → approve → school pays); entitlements; watermarked signed downloads; download log.
- Earnings: 30 % commission (basis points, snapshotted), pending → available (7-day hold) → paid; monthly payout queue, min ৳1,000; statements.
- Plans (Free/Starter/Pro/Enterprise placeholders) editable in platform console; 14-day Pro trial; limits enforced with read-only over-limit; invoices with BIN/VAT; school billing overview; expense ledger.

### 5.5 Operations (F-OP-01…07)

- Hiring: job postings, public apply page, single pipeline, interviews, per-interviewer scorecards, document consent, hire → invitation + staff record; teacher profiles with open-to-work; candidate browse.
- Cover teacher: absence/leave/missed-punch triggers, ranking from timetable, assign/override/acknowledge/complete, payroll impact from staff hourly rates and configurable policy.
- Reports as server-rendered PDFs with Bengali fonts (report card single + bulk, attendance register, mark sheet, staff summary, profile sheet, ID cards); stored AI comments with teacher approval.
- Print queue of generated PDFs and uploads (browser print/download in v1; local agent in R4).
- Messaging: channels, DMs, announcements to parents, realtime, receipts, attachments, contact log.
- Staff directory and records; offboarding checklist; school settings incl. grade scale editor and PDF branding.

### 5.6 Platform console

- Schools and users overview, plans editor, listing review, KYC review, payout queue, refunds, audit viewer, feature flags, support tools without impersonation.

## 6. Non-functional requirements

| Area                                              | Requirement                                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security                                          | RLS on every table; server policy checks; tenant context from membership only; signed URLs for private files; server-computed money; validated webhooks; append-only audit; Zod on every input; CSP; secrets never in clients. Authorized pentest before launch. |
| Privacy                                           | Children's data minimised in logs; PII scrubbed in error reports; data export and deletion for schools on request; consent for candidate documents.                                                                                                              |
| Data residency **(added, amended per SYNTHESIS)** | Minimised now (no NID/birth-cert numbers stored, scans purge at +14 days); a Bangladesh-resident encrypted replica of the sensitive subset ships from month 18; the decision on a full in-country replica gates at M6.                                           |
| Performance                                       | LCP < 2.5 s (3G-fast, low-end Android); JS < 200 KB per route; lists paginated server-side; attendance save < 300 ms p95.                                                                                                                                        |
| Availability                                      | Vercel + Supabase managed; health endpoint; uptime monitor; daily backups (Pro plan at launch); rollback playbook.                                                                                                                                               |
| Accessibility                                     | WCAG 2.1 AA targets: 44 px touch targets, contrast ≥ 4.5:1, keyboard navigation, screen-reader labels; axe in e2e.                                                                                                                                               |
| Localisation                                      | English and Bengali UI strings; Bengali-capable fonts in UI and PDFs; Asia/Dhaka timezone; BDT formatting (৳, paisa).                                                                                                                                            |
| Offline                                           | App shell cached (PWA); attendance queued offline and replayed idempotently (default in Android wrapper).                                                                                                                                                        |
| Observability                                     | Structured logs with correlation ids; Sentry; Supabase advisors weekly; audit retention indefinite.                                                                                                                                                              |
| Quality                                           | Every feature part ships with unit + DB + e2e tests and a test report; CI gates on main; releases tagged with changelog.                                                                                                                                         |

## 7. Constraints and assumptions

- One workspace = one campus (multi-campus grouping is future).
- Students do not have accounts in Campus v1 (Students app later).
- SSLCommerz sandbox available for development; live keys provided by the owner before R3 launch.
- Plan prices are placeholders until the owner sets them in the console.
- Supabase free tier until launch; upgrade to Pro at R1 launch for backups and branching.

## 8. Risks

| Risk                                        | Mitigation                                                          |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Scope of ~40 features                       | Strict release map; one feature at a time with DoD; parts ≤ 2 days. |
| Tenant isolation regressions                | Policy template + pgTAP tests generated per table; CI blocks merge. |
| Payment edge cases (IPN delays, duplicates) | Inbound events table, idempotency, reconciliation job, sandbox e2e. |
| Low-end device performance                  | Phone-first design, budgets in CI (Lighthouse), server pagination.  |
| Bengali rendering in PDFs                   | Font embedding verified in R1 report-card part 1.                   |
| Owner availability for decisions            | PRODUCT-DECISIONS defaults apply until overridden.                  |
