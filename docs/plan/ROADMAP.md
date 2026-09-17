# Acadigma Campus — Build Roadmap

Version 1.0 · 2026-09-17 · Lead: Claude · Owner: Mahadi

This is the plan the build follows. It merges the build orders of the five feature areas (`docs/features/*/README.md`) into milestones, states what must be true before a milestone counts as done, and defines how work is staffed and verified. The unit of work is a **part** (≤ ~2 days for one engineer; agents move faster but the granularity is what matters). Every part is defined in a feature spec (§8 of each `F-*.md`).

**Totals:** 46 feature specs · **275 parts** · identity 54 · academics 64 · teaching 42 · commerce 67 · operations 48.

Related: `docs/product/PRD.md` (release map) · `docs/product/PRODUCT-DECISIONS.md` · `docs/architecture/ARCHITECTURE.md` · `docs/engineering/HANDBOOK.md` (DoD) · `docs/decisions/DECISION-LOG.md` (D-27 moved fees/SMS earlier; D-28 hiring timing pending) · `docs/product/research/` (why the order changed).

---

## 1. Principles that shaped the order

1. **Security substrate before any tenant data.** Tenancy resolution, the RLS template, the audit trigger and the plans/limits engine land before a single student row exists. Retrofitting any of them across 60+ tables is the most expensive mistake available.
2. **Something demoable every chunk.** Each chunk ends with a journey a human can click through on a 360×800 phone.
3. **One feature at a time, proven before moving on.** A chunk is one branch, one PR, one test report. Nothing merges without the seven-gate DoD (§6).
4. **Denominators before numerators.** Calendar (`is_school_day`) before attendance; timetable before staff attendance and cover; exams before report cards; the credit ledger before any AI call; the notification catalogue before anything emits.
5. **Sell-blockers before bets.** Market research (D-27) moved fee collection and SMS into Release 1.5 and put the marketplace behind a pilot gate: schools switch systems for fees and messages; the marketplace is our strongest idea with the weakest evidence.
6. **Parallel streams, not parallel files.** Streams are defined so two agents never write the same folder. Each stream owns its route group + feature folders + migrations.

## 2. Milestones

Indicative durations assume **4 parallel streams**; with more agents they compress, with fewer they stretch. Parts are the truth; dates are not.

| Milestone                           | Release   |     Parts | Exit criterion (demo)                                                                                                                                                                            |
| ----------------------------------- | --------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M0 Secure foundation**            | R0        |        24 | Register, sign in, create a school; RLS + policy + audit proven by pgTAP; plans/limits engine live; PWA shell installs; CI green with test reports.                                              |
| **M1 People in the school**         | R0 → R1   |        30 | Principal onboards 12 teachers by email + join code; roles, labels, removal, ownership transfer; notifications centre; account settings.                                                         |
| **M2 The school day**               | R1        |        41 | Sections, calendar, students, one-thumb attendance with correct %, timetable, staff attendance + leave, messaging channels.                                                                      |
| **M3 Results and paper**            | R1 launch |        54 | Exam → marks → BD GPA → report cards in Bengali (single + bulk) → parents see results; homework, behaviour, print queue, personal workspace, Bangla UI parity. **R1 launch gate.**               |
| **M4 Money and hiring for schools** | R1.5      |        62 | School collects fees by student ID (school as merchant), SSLCommerz payments core, SMS reminders metered, staff records/offboarding, platform console, hiring (scope per D-28 debate).           |
| **M5 Teaching intelligence**        | R2        |        55 | Lesson planner + AI on credits, curriculum spine with PDF extraction, resources library, workload, cover-teacher engine with payroll impact, analytics dashboards from real views, student risk. |
| **M6 Marketplace (pilot-gated)**    | R3        |       ~45 | Pilot slice → 20 listings / 200 teachers → go/no-go → full seller KYC, moderation, purchase, earnings, payouts, subscriptions with dunning, billing hub.                                         |
| **M7 Native and automation**        | R4        | new specs | Android (Capacitor) with push + QR scan + offline default-on; Windows (Tauri) with print agent; gate-scan attendance; digests.                                                                   |

Parts in M0–M6 sum to 275 plus a handful of new "glue" parts called out below (SMS adapter, pilot slice, OTel wiring).

## 3. Milestone detail

### M0 — Secure foundation (24 parts)

Sequential spine, then two streams.

| Order | Work                                                                                                                                                                                                                         |    Parts | Stream | Notes                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 0.1   | Foundation migrations 0001–0004 (app schema helpers, identity, audit/files/counters/jobs, plans/notifications) + pgTAP bootstrap suite + seed                                                                                |        — | lead   | Written by the data-model agent; verified in CI against a Postgres service container (D-20).                                   |
| 0.2   | **F-ID-01 P1–4** Supabase Auth wiring, `profiles`, register + verify, sign in/out, reset                                                                                                                                     |        4 | A      | P1 establishes `withServiceRole`, middleware, generated types.                                                                 |
| 0.3   | **F-ID-03 P1–3** tenancy tables, RLS template, `WorkspaceContext`, permission matrix, nav engine                                                                                                                             |        3 | A      | Highest-risk work in the repo; lands while the codebase is small. pgTAP proves the four security-review attack paths are dead. |
| 0.4   | **F-ID-09 P1–3** append-only audit substrate, generic trigger, `app.log_audit_event`, owner viewer, correlation id                                                                                                           |        3 | B      | Moved ahead of the identity area's own order: triggers must exist before any tenant table is created by later chunks.          |
| 0.5   | **F-CM-06 P1–3** plans, subscriptions + trial, limits engine (`assertWithinLimit`, `hasModule`, `access_mode`)                                                                                                               |        3 | B      | Every area gates on it (commerce README chunk 0). `plan_prices` bands + overage (D-28).                                        |
| 0.6   | **F-ID-02 P1–3** `user_preferences`, no-flash theming, profile, appearance                                                                                                                                                   |        3 | A      | Unblocks design-token work; theme decision made before layouts proliferate.                                                    |
| 0.7   | **F-OP-07 P1** `resolve()` settings + defaults (timezone Asia/Dhaka, working days, policies as jsonb)                                                                                                                        |        1 | B      | Cross-feature gate #1 (operations README).                                                                                     |
| 0.8   | **F-ID-07 P1** notification event catalogue skeleton + CI parity test                                                                                                                                                        |        1 | B      | Catalogue starts small and grows; the parity test is the contract.                                                             |
| 0.9   | Design system into code: `packages/ui` primitives (AppShell, TopBar, BottomNav, FormSheet, DataList, EmptyState, StatusChip, MoneyText) per `DESIGN-SYSTEM.md`; GSAP motion module (D-33); OTel wiring `@vercel/otel` (D-30) | 3 (glue) | C      | Scaffold already has skeletons; this makes them match the spec exactly, at 360×800 first.                                      |

**Exit:** a user registers, verifies, creates a school through the wizard's first step, lands in `/app`; a forged `x-workspace-id` 403s and writes a `tenancy.context_rejected` audit row; `pnpm test:db` shows isolation + escalation suites green; Lighthouse PWA ≥ 90 on the shell.

### M1 — People in the school (30 parts)

| Order | Work                                                                                                                                                                          |    Parts | Stream |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ------ |
| 1.1   | **F-ID-05 P1 + F-ID-03 P4 + F-ID-05 P2–5** auto personal workspace, switcher, landing resolution (type ∧ role), school wizard (seeds grade levels + academic year), join path |        6 | A      |
| 1.2   | **F-ID-03 P5–8** roster, role changes, custom labels, removal (`status=removed`, instant revoke), ownership transfer, module visibility                                       |        4 | A      |
| 1.3   | **F-ID-04 P1–6** invitations by email + shareable link, rotating join code + approval, expiry, resend, audit                                                                  |        6 | A      |
| 1.4   | **F-ID-07 P2–4** `app.notify`, notification centre, realtime, preferences                                                                                                     |        3 | B      |
| 1.5   | **F-OP-07 P2–3** school profile + academic settings screens                                                                                                                   |        2 | B      |
| 1.6   | **F-OP-06 P1–2** staff directory, `staff_records`, `staff_compensation` + `app.staff_hourly_rate`                                                                             |        2 | B      |
| 1.7   | **F-OP-05 P1–3** channels (auto #general/#staff), messages, realtime, **notification event registry** (gate #3)                                                               |        3 | C      |
| 1.8   | `(account)/account/*` security, devices, sessions (part of **F-ID-01 P7**)                                                                                                    |        1 | C      |
| 1.9   | **F-CM-06 P4** trial expiry job → `access_mode=read_only` banner                                                                                                              |        1 | B      |
| 1.10  | PDPA consent capture in invitations + DPA acceptance in school wizard (from `COMPLIANCE-PDPA.md`)                                                                             | 2 (glue) | A      |

**Exit:** WF-01 end to end on a phone: register → create school → invite 12 teachers (email + code) → they accept → roles enforced → removed teacher loses access on next request → every step visible in the audit viewer.

### M2 — The school day (41 parts)

| Order | Work                                                                                                                                                              | Parts | Stream |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ------ |
| 2.1   | **F-AC-01 P1–6** academic years/terms, grade levels, sections, subjects, section_subjects (primary + assistants), rooms, bulk wizard                              |     6 | A      |
| 2.2   | **F-AC-11 P1–4** calendar, holidays, working-day overrides, `app.is_school_day`                                                                                   |     4 | B      |
| 2.3   | **F-AC-02 P1–8** students, draft admission, guardians, private docs, sequential ids, enrollments, promotion/transfer, CSV import, ID card + signed QR             |     8 | A      |
| 2.4   | **F-AC-03 P1–7** attendance sessions/records, one-thumb roll call (pre-fill present + confirm, D-22), edit window, register, alerts, **offline queue**, scan hook |     7 | B      |
| 2.5   | **F-AC-05 P1–6** bell schedule, timetable versions, slots, clash detection, teacher/room views, ICS, print                                                        |     6 | C      |
| 2.6   | **F-AC-04 P1–5** staff self check-in, admin grid, leave requests/balances (with `day_half`), monthly summary, `cover.trigger`                                     |     5 | C      |
| 2.7   | **F-OP-07 P4–5** attendance policy, grade-scale editor (versioned), calendar/bell settings                                                                        |     2 | D      |
| 2.8   | **F-OP-06 P3–4** custom-label display, staff records completion                                                                                                   |     2 | D      |
| 2.9   | **F-OP-05 P4** section channels auto-created from F-AC-01                                                                                                         |     1 | D      |

**Exit:** WF-03 on a phone — teacher marks a 40-student section in ≤ 60 s, offline then replays, % is correct against `is_school_day`, guardian gets a low-attendance notification; timetable shows "now / next period"; a leave request shows "affects 7 periods".

### M3 — Results and paper (54 parts) — **Release 1 launch gate**

| Order | Work                                                                                                                                                                                                                                               |    Parts | Stream |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ------ |
| 3.1   | **F-AC-06 P1–8** grade scales (BD default + 4th-subject rule), exams (regular + aggregate), marks grid (phone: native decimal input, D-22), GPA + rank in SQL, publishing, mark sheet                                                              |        8 | A      |
| 3.2   | **F-OP-03 P1–6** PDF foundation (react-pdf + Hind Siliguri/Noto), render-as-job, report card single, comments with approval, bulk cards, register, mark sheet                                                                                      |        6 | B      |
| 3.3   | **F-OP-04 P1–3** print queue from report runs, roster copy counts, browser print/download                                                                                                                                                          |        3 | B      |
| 3.4   | **F-AC-07 P1–5** assignments/homework (handouts as `kind='handout'`), submissions, distribution via announcement resolver                                                                                                                          |        5 | C      |
| 3.5   | **F-AC-08 P1–4** behaviour categories/logs/follow-ups, term scores, leaderboard, parent-visible flag                                                                                                                                               |        4 | C      |
| 3.6   | **F-OP-05 P5–8** DMs, announcements to parents of sections, attachments, contact log, moderation                                                                                                                                                   |        4 | C      |
| 3.7   | **F-AC-10 P1–6** parent portal `/family`: child switcher + 13 guardian-scoped views (WF-02 stage D)                                                                                                                                                |        6 | D      |
| 3.8   | **F-ID-06 P1–7** personal workspace (tutoring students, personal attendance, files, diary, requests, CV)                                                                                                                                           |        7 | D      |
| 3.9   | **F-ID-07 P5–6 + F-ID-02 P4** email digest, broadcast, retention, **Bangla parity** across catalogues                                                                                                                                              |        3 | A      |
| 3.10  | **F-OP-06 P5** offboarding checklist (revoke transaction + orphaning hook)                                                                                                                                                                         |        1 | A      |
| 3.11  | **SMS adapter** (`adapters/sms`, console driver, provider behind flag, sender-ID onboarding checklist) + announcement SMS fallback for parents without the app                                                                                     | 2 (glue) | B      |
| 3.12  | PLG loops from GTM §5 that must ship in R1: parent invite loop instrumentation, teacher pull-through card, `lead_source`/`referral_code`, "powered by Acadigma" footer on Free-plan PDFs, 1080×1080 Bangla share image for notices                 | 3 (glue) | D      |
| 3.13  | **Launch hardening**: authorized DAST against preview with the Claude-Red skills (`SECURITY.md` §9), Lighthouse + axe on every route, PDPA data-request tooling (`data_requests`), privacy/terms pages, restore drill, Supabase Pro upgrade (OQ-8) | 2 (glue) | lead   |

**Exit (R1 launch):** WF-04 end to end — exam created → marks entered on phone and desktop → GPA/rank computed with the 4th-subject rule → section report cards rendered in Bengali in ≤ 2 min → printed from the queue → parent sees results on `/family`; pentest report has no open high/critical; a real school runs a full month on it.

### M4 — Money and hiring for schools (62 parts) — Release 1.5

| Order | Work                                                                                                                                                                                                                                                  |    Parts | Stream                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ------------------------------------------- |
| 4.1   | **F-CM-01 P1–10** payments core: money primitives, SSLCommerz adapter, hosted checkout, IPN Edge Function → validation API → capture, orders/lines/payments, refunds (async), reconciliation, receipts, **scoped provider factory** (D-31)            |       10 | A                                           |
| 4.2   | **F-CM-08 P1–6** fee heads/structures, assignments/discounts/approvals, invoice runs, invoice PDF + notification, cashier + allocation + receipts, overdue/late fees                                                                                  |        6 | B (parallel to 4.1 — no gateway dependency) |
| 4.3   | **F-CM-08 P7–14** merchant account (encrypted, no human reader), online fee payment per workspace, bKash adapter, parent portal pay + public `/pay/[slug]`, defaulters + reports, metered SMS reminders, refunds/adjustments/reconciliation/retention |        8 | B after 4.1                                 |
| 4.4   | **F-ID-08 P1–6 + F-ID-09 P4** platform console shell, schools list, support grants, flags, plans editor, audit export                                                                                                                                 |        7 | C                                           |
| 4.5   | **F-ID-01 P5–6, P8** phone OTP (when OQ-10 answered), magic link, deletion + hardening                                                                                                                                                                |        3 | C                                           |
| 4.6   | **F-OP-01** hiring — scope decided by the research debate (D-28/OQ-16): either minimal (P1–4: postings, public apply, pipeline, verified profile) now and the rest in M6, or all 9 here                                                               |      4–9 | D                                           |
| 4.7   | **F-OP-07 P6** module toggles + PDF branding + danger zone                                                                                                                                                                                            |        1 | D                                           |
| 4.8   | **F-CM-06 P5–8** plan change with proration, invoices (BIN/VAT), dunning ladder, overrides                                                                                                                                                            |        4 | A after 4.1                                 |
| 4.9   | **F-CM-07 P1** manual expense ledger (no dependency; filler)                                                                                                                                                                                          |        1 | D                                           |
| 4.10  | Authorized DAST pass on payments + fees (IDOR, business-logic, race-condition checklists)                                                                                                                                                             | 1 (glue) | lead                                        |

**Exit:** a school configures fee structures, runs a monthly invoice, a parent pays by student ID through the school's own merchant account, the cashier records a cash payment, the defaulter list and collection report are right to the paisa, and not one row lands in Acadigma's revenue tables; a school upgrades Starter → Pro via SSLCommerz and receives a VAT invoice PDF.

### M5 — Teaching intelligence and operations depth (55 parts) — Release 2

| Order | Work                                                                                                                                                                                             | Parts | Stream              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----: | ------------------- |
| 5.1   | **F-TE-05 P1–3** resources schema, identifiers, upload, quota meter, browse                                                                                                                      |     3 | A                   |
| 5.2   | **F-TE-03 P1–4** credit ledger, `invoke()` pipeline (reserve → Claude → settle → log), daily reset cron, balance UI — **the AI gate**                                                            |     4 | A                   |
| 5.3   | **F-TE-04 P1** prompt catalogue, output schemas, PII redaction, CI rule "only adapters/ai imports the SDK"                                                                                       |     1 | A                   |
| 5.4   | **F-TE-02 P1–4** syllabi/units/topics, editor, lesson logs, pacing maths                                                                                                                         |     4 | B (parallel to 5.2) |
| 5.5   | **F-TE-01 P1–5** lesson planner manual → AI generate (first reserve/settle proof; teacher approves every AI draft, D-28)                                                                         |     5 | A                   |
| 5.6   | **F-TE-02 P5–7** syllabus PDF import → extraction (sonnet) → review → commit; AI pacing plan                                                                                                     |     3 | B                   |
| 5.7   | **F-TE-04 P2–6** seven tools, SVG illustration hardening, history                                                                                                                                |     5 | A                   |
| 5.8   | **F-TE-05 P4–7** sharing, previews/downloads, orphaning + reassignment, bulk jobs                                                                                                                |     4 | B                   |
| 5.9   | **F-OP-02 P1–7** cover engine: triggers (absence/leave/missed-punch), ranking (`domain/eligibility.ts` shared with workload), assign/override/ack/auto-complete, payroll impact + monthly report |     7 | C                   |
| 5.10  | **F-OP-03 P7–8 + F-OP-04 P4–5** staff summary, profile sheet, ID cards; uploads + bulk print                                                                                                     |     4 | C                   |
| 5.11  | **F-TE-06 P1–4** workload views, cockpit, balance suggestions, variance                                                                                                                          |     4 | D                   |
| 5.12  | **F-AC-09 P1–5** analytics views, deterministic risk (weights sum to 1.00), nightly job, explainability, flags, AI-phrased suggestion                                                            |     5 | D                   |
| 5.13  | **F-TE-07 P1–6** metric dictionary (~22 SQL views), five dashboards, anti-mock CI grep                                                                                                           |     6 | D after 5.12        |
| 5.14  | **F-TE-03 P5–7** credit requests, billing model + allocations, top-up packs, usage analytics                                                                                                     |     3 | A                   |

**Exit:** WF-05 and WF-09 — a teacher uploads a syllabus PDF, reviews extracted topics, generates a lesson plan on credits, teaches it, logs it, sees pacing; an absent teacher's periods are covered by the ranked suggestion and the payroll impact report is right; every dashboard number traces to a view.

### M6 — Marketplace, pilot-gated (~45 parts) — Release 3

| Order | Work                                                                                                                                                                                                                                                                                |    Parts | Stream |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ------ |
| 6.0   | **Pilot slice**: F-CM-02 P1–3 (seller profile + KYC submission + staff review), F-CM-03 P1–3 (taxonomy, listing editor, review queue), F-CM-04 P1–3 (browse, detail, personal purchase + entitlement + signed download) — enough for **20 listings / 200 teachers** with real money |        9 | A      |
| gate  | **Go/no-go** on pilot metrics (`GO-TO-MARKET.md` §6): paid conversion, repeat purchase, seller retention. No-go → marketplace stays a free resource-sharing layer; parts below are shelved.                                                                                         |          | owner  |
| 6.1   | **F-CM-02 P4–7, F-CM-03 P4–7, F-CM-04 P4–8** verified badge + payout methods, bulk upload, pending-changes, school-funded purchases, watermarking, reviews                                                                                                                          |       13 | A/B    |
| 6.2   | **F-CM-05 P1–7** earnings state machine, hold job, payout queue, statements, clawbacks (minimum per OQ-15)                                                                                                                                                                          |        7 | B      |
| 6.3   | **F-CM-07 P2–6** billing hub, credit packs, exports                                                                                                                                                                                                                                 |        5 | C      |
| 6.4   | **F-OP-01** remaining hiring parts (if M4 shipped the minimal set)                                                                                                                                                                                                                  |      0–5 | C      |
| 6.5   | Malware scanning + DOCX/PPTX previews via a small container service (OQ-6)                                                                                                                                                                                                          | 2 (glue) | C      |

### M7 — Native and automation — Release 4

New specs written when M3 is live: `apps/android` (Capacitor: push, camera QR scan → `attendance_scan_events`, filesystem/share, deep links, offline default-on), `apps/windows` (Tauri 2: shell + Rust print agent polling `print_jobs`, real `printers` status), gate-scan attendance input, scheduled digests, Play Store / installer pipelines in CI.

## 4. Streams and ownership (no two agents write the same folder)

| Stream | Owns (routes · feature folders · migrations prefix)                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | identity, academics core, payments core, teaching AI · `(auth)`, `(onboarding)`, `(school)/app/{students,attendance,exams,marks,lessons,ai}`    |
| B      | audit, plans/limits, calendar, attendance, reports/print, fees, curriculum · `(school)/app/{reports,print,billing,fees,curriculum,resources}`   |
| C      | messaging, timetable, staff, cover, platform console · `(school)/app/{messages,timetable,staff,cover}`, `(platform)`                            |
| D      | settings, parent portal, personal workspace, workload, analytics, hiring · `(parent)`, `(personal)`, `(school)/app/{settings,analytics,hiring}` |
| lead   | migrations sequencing, `packages/ui` primitives, CI, releases, security passes, docs index                                                      |

Each **chunk** = one git worktree on branch `feat/<area>-<slug>` = one **builder agent** (backend + UI for that chunk; split into two agents when a chunk has ≥ 6 parts) + one **tester agent** (writes/extends pgTAP, Vitest, Playwright journeys at both viewports, produces `docs/test-reports/<chunk>.md`) + automated reviewers (`typescript-reviewer`, `react-reviewer`, `security-reviewer`; `engineering-database-optimizer` on any migration). The lead merges.

## 5. Gates that block everything behind them

| Gate                                                   | Delivered by    | Blocks                                      |
| ------------------------------------------------------ | --------------- | ------------------------------------------- |
| `WorkspaceContext` + RLS template + pgTAP suite        | M0 0.3          | every tenant feature                        |
| Audit trigger + `app.log_audit_event`                  | M0 0.4          | every tenant table                          |
| Plans/limits engine (`assertWithinLimit`, `hasModule`) | M0 0.5          | students, files, AI, nav                    |
| `resolve()` settings                                   | M0 0.7          | attendance, timetable, cover, reports       |
| Notification catalogue + parity test                   | M0 0.8 / M1 1.7 | every emitter                               |
| `app.is_school_day`                                    | M2 2.2          | attendance %, leave, ICS, pacing, analytics |
| `app.staff_hourly_rate`                                | M1 1.6          | cover payroll                               |
| Credit ledger `invoke()`                               | M5 5.2          | every AI call                               |
| Payments core + scoped provider                        | M4 4.1          | fees online, subscriptions, marketplace     |
| Marketplace pilot go/no-go                             | M6 gate         | M6 6.1–6.5                                  |

## 6. Definition of done — per chunk (from `HANDBOOK.md`)

1. Spec §8 part(s) implemented exactly; deviations recorded in the spec's §11 and, if architectural, in the decision log.
2. Migrations forward-only; **pgTAP isolation + escalation tests for every new tenant table**, asserting zero rows affected on cross-tenant UPDATE/DELETE.
3. `packages/domain` logic unit-tested (≥ 80 % on domain).
4. Server actions integration-tested against real Postgres.
5. UI verified at **360×800 and 1280×800**, screenshots in the PR; axe clean.
6. Playwright journey(s) for the spec's §9 acceptance criteria, both viewports.
7. `docs/test-reports/<chunk>.md` written from the template; feature spec status updated; `docs/README.md` index still complete.
8. All eleven CI checks green; squash-merged PR with a Changeset.

## 7. Risks to this plan and their mitigations

| Risk                                             | Mitigation                                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parallel streams drift on shared tables          | DATA-MODEL.md is authoritative; migrations are sequenced by the lead; a stream that needs a table it does not own files a one-line request in the decision log first. |
| Connection drops / usage limits interrupt agents | Agents write in small chunks, files are on disk incrementally, resumes carry context (proven three times on 2026-09-17).                                              |
| Bengali PDF rendering issues                     | F-OP-03 P1 proves font embedding before any report is built.                                                                                                          |
| SMS provider not chosen                          | Email + shareable links everywhere in R0–R1; SMS adapter behind a flag; OQ-10.                                                                                        |
| Fee module scope creep                           | F-CM-08 parts 1–6 are school-side and ship first; online payment follows; transport/hostel fees excluded.                                                             |
| Marketplace demand unproven                      | Pilot gate before ~36 parts of commerce work.                                                                                                                         |
| Owner questions unanswered                       | Defaults in `OWNER-QUESTIONS.md` apply; none block M0–M3.                                                                                                             |

## 8. What happens next (immediately)

1. Scaffold agent finishes its green run → lead commits `chore/foundation` → PR → merge to `main`.
2. Data-model agent finishes → migrations reviewed → included in the foundation PR (CI runs pgTAP in the service container).
3. Research debate → synthesis → D-28 items finalised (pricing numbers, hiring timing).
4. **M0 starts**: streams A, B, C dispatched as builder + tester agent pairs in worktrees.
