# Acadigma Campus — Decision Log

Every non-obvious decision, with the reasoning at the time it was made.
Format: **D-nn — title** · status (PROPOSED / ACCEPTED / REJECTED / SUPERSEDED) · date.

---

## D-01 — Rebuild, do not patch the Base44 export · ACCEPTED (carried over from 2026-09-15) · 2026-09-17

**Why:** The security review shows the tenancy model is anchored to a client-writable field (`active_workspace_id`), 42/64 entities have no RLS, the marketplace has no payment processing, and the audit log is written from the browser. These are design-level, not bug-level. Patching RLS blocks one by one inside Base44 would leave the product dependent on a platform whose server behaviour we cannot see or test. The export stays untouched as the **product reference** (it tells us what was intended); the new app re-implements it.

## D-02 — Runtime stack · PROPOSED · 2026-09-17

**Context:** The 2026-09-15 spec chose a pnpm/Turbo monorepo with a Fastify API, Next.js web, Expo mobile, Tauri desktop, self-hosted Postgres + Redis + S3-compatible storage + SMTP, all via Docker. That skeleton was never run locally (pnpm was never installed, CI never placed, worktree never pushed).

**Recommendation:** **Next.js 15 (App Router) on Vercel + Supabase** (Postgres with RLS, Auth, Storage with signed URLs, Edge Functions for webhooks/jobs, Realtime for messaging/notifications, pg_cron for scheduled jobs). Server-side business rules live in Next.js route handlers / server actions using the Supabase **service role only on the server**, with RLS as the second wall.

**Why this over the Fastify design:**

1. The three non-negotiables of the spec (RLS + server policy + private files) are exactly what Supabase gives natively; the Fastify design would have us re-implement auth, storage signing, migrations tooling and job queues by hand.
2. Zero servers to run. The owner is one person shipping several products (Velora, Bengal Wireless, Nusrat Desire) on the same Vercel + Supabase pattern — operational consistency matters more than architectural purity.
3. Postgres is still Postgres: every RLS policy, trigger and audit function is plain SQL in versioned migrations; nothing locks us in.
4. Redis/queues: replaced by Postgres-backed job tables + pg_cron + Edge Functions, which is enough for print queues, credit renewal and notification fan-out at school scale (thousands, not millions, of rows per tenant).

**What we keep from the previous design:** the monorepo shape (`apps/web`, `packages/domain`, `packages/contracts`), Zod contracts, the role vocabulary, the three-layer authorization rule, the release ordering, tenant-isolation tests as a hard requirement.

**Cost of being wrong:** if the product later needs a long-running service (e.g. a real-time print agent broker), it can be added as a separate service talking to the same Postgres. Nothing in this choice prevents that.

## D-03 — Client scope for v1 · PROPOSED · 2026-09-17

**Recommendation:** Web (installable PWA, mobile-first layouts) only for v1. Expo mobile and the Tauri desktop print agent are deferred to after Release 3.

**Why:** Every feature in the Base44 app is a web feature. Mobile and desktop in the old spec are "boundary only" READMEs. Shipping three clients before one works is how projects die. The PWA covers attendance-on-phone for teachers and the parent portal; browser printing covers the print center until a local agent is justified.

## D-04 — Tenant context comes from the session, never from a client-writable field · ACCEPTED · 2026-09-17

**Why:** Root cause of the whole security review. Implementation: `workspace_members` is the only source of membership; the active workspace is selected per request (header/cookie) and **verified against membership** in a `SECURITY DEFINER` function that every RLS policy calls (`auth_workspace_id()` + `auth_role_in(workspace)`). Role is never read from the `users` row.

## D-05 — Audit events written by the database, not the client · ACCEPTED · 2026-09-17

**Why:** A client can skip a client-side call; it cannot skip a trigger. Every tenant table gets an `audit_events` trigger (actor from `auth.uid()`, before/after diff, correlation id from a request-scoped setting). Table is append-only (no UPDATE/DELETE grants).

## D-06 — Money is never computed in the browser · ACCEPTED · 2026-09-17

**Why:** The Base44 app lets the buyer write `MarketplaceTransaction` and `SellerEarnings` rows with self-chosen amounts and has two disagreeing commission rates. Prices, commission, earnings and entitlements are computed in one server function from a single `platform_settings` row; purchases only become entitlements after a verified payment webhook.

## D-07 — Existing repo, `main` as default branch · ACCEPTED · 2026-09-17

**Why:** `Mahadezz/acadigma-campus` already exists with `master` (docs only) and `main` pushed. Keeping one repo keeps history. `master` will be deleted after `main` becomes default. The unpushed `feat/production-foundation` worktree is superseded by D-02; its useful parts (domain policy tests, contracts) are ported, the rest is dropped.

## D-08 — AI provider · ACCEPTED · 2026-09-17

Claude API (`claude-sonnet-5` for planner generation, `claude-haiku-4-5` for cheap classification/extraction). Called only from server code with a per-workspace credit ledger checked **before** the call and debited **after**, in one transaction. Reason: the Base44 app never checks quota before `InvokeLLM` (`AIPlanner.jsx:88`); the credit model in the entities (AIBillingModel / CreditAllocation / CreditRequest / DailyAILimit) is the clear intent and is implemented server-side.

## Owner acceptance of D-02 and D-03 · 2026-09-17

Next.js on Vercel + Supabase; web PWA only for v1.

## D-09 — Payments: SSLCommerz (BDT) first, Stripe later · ACCEPTED by owner · 2026-09-17

**Why:** Bangladesh-first product; SSLCommerz covers cards + bKash + Nagad + Rocket through one gateway. Seller payouts are recorded as manual bank/bKash transfers via an admin payout queue (SSLCommerz has no Connect-style split payouts). The gateway sits behind a `PaymentProvider` interface so Stripe can be added without touching purchase/entitlement logic. All amounts stored as integer paisa (`bigint`), currency column present from day one.

## D-10 — Brand and suite structure · ACCEPTED by owner · 2026-09-17

**Owner's words:** "There are 4 major parts to this suite: one for campus, one for students, one for parents and one for school admin (a finance app pulling data from the campus app). Separate repos. 100% focus on the campus app — it's the flagship. There is no Career or Market product; marketplace and hiring are parts inside Campus so sellers and teachers benefit from the platform."

**Resulting structure:**

- Parent brand **Acadigma**. Flagship app **Acadigma Campus** (this build). Later: Acadigma Students, Acadigma Parents, Acadigma Admin (finance).
- One repo per app. Campus = `Mahadezz/acadigma-campus`. The other three get repos when they start.
- One Supabase project shared by the suite, owned by Campus; the other apps consume it through the same RLS + contracts. (Decision: shared DB rather than per-app DBs, because Students/Parents/Admin are views over Campus data, not separate domains.)
- Marketplace, Seller Portal and Recruitment/Hiring remain **modules inside Campus** with their own nav areas.
- Local folder: `F:\Acadigma Suite\` with `acadigma-campus\` (clone of the repo, branch `main`), and placeholder folders for the other three.
- In Campus v1, the parent role keeps the read-only Parent Portal that exists in the Base44 app (it's already built and is the data source the future Parents app will replace). Not building more parent features in Campus.

## D-11 — The `F:\Acadigma Campus\acadigma-campus-production` folder is superseded · ACCEPTED · 2026-09-17

**Why:** Its worktree was built for the Fastify design (D-02 rejected). Not deleted — the owner can remove it. Its domain policy tests and Zod contract shape are ported into the new repo.

## D-13 — Native Android + Windows via wrappers around one mobile-first web app · ACCEPTED (owner requirement) · 2026-09-17

**Owner's words:** "this will be a native android and windows app since it's for teachers, so the versions should also support the phone and make the app optimized for the mobile phones so it feels like it was made for a phone."

**Decision:** One codebase. The Next.js app is designed phone-first (bottom tab bar, thumb-reach actions, 44px targets, sheets instead of modals, pull-to-refresh, offline-tolerant attendance). It ships as: (1) installable PWA, (2) **Android via Capacitor** (native shell loading the app, with native plugins for push, camera/QR, file download, share), (3) **Windows via Tauri 2** (native shell + local printer access for the print center). Same screens, same API, same Supabase session.

**Why wrappers, not React Native:** every feature already exists as web UI; RN would mean a second implementation of ~70 screens. Capacitor/Tauri give store-distributable binaries, push notifications and device APIs with one UI codebase. The cost is that some very native gestures won't be present; for a teacher-productivity app that trade is right.

**Sequencing:** the wrappers are added after the web app's Release 1 is green, but every screen is built and tested at 360×800 first from day one.

## D-14 — Git workflow, CI, releases · ACCEPTED (owner requirement) · 2026-09-17

**Owner's words:** "whenever you are working on a major feature push the files and create branches so it doesn't break the app; I need test reports; packages, releases, everything tracked properly."

**Decision:**

- `main` is protected and always deployable. Every feature = branch `feat/<area>-<feature>` → PR → CI green → squash-merge.
- CI on every PR: typecheck, lint, unit tests (Vitest), DB tests against a disposable Postgres (RLS + policy tests), Playwright e2e on a preview build, security scans (dependency audit + secret scan + Semgrep). Test reports are uploaded as PR artifacts and summarized in the PR via a job summary; `docs/test-reports/` keeps a markdown report per feature.
- Releases: Conventional Commits → Changesets → tagged releases `v0.x.y` with generated CHANGELOG; Vercel deploys `main` to production, PRs to previews. Supabase migrations are applied by CI on merge to `main` (never by hand).
- Definition of done per feature (no moving on without all): spec in `docs/features/<feature>.md` ✔ · migrations + RLS tests ✔ · server logic unit-tested ✔ · UI at 360×800 and 1280 ✔ · Playwright journey ✔ · a11y check ✔ · test report ✔ · PR merged ✔.

## D-15 — Commission 30 % platform / 70 % seller · ACCEPTED by owner · 2026-09-17

Single value in `platform_settings`, editable only by platform staff, applied server-side at purchase time, snapshotted onto each order line.

## D-16 — Moderation by Acadigma platform staff via an internal console · ACCEPTED by owner · 2026-09-17

`/platform` area inside Campus for accounts with `is_platform_admin`. Queues: listing review, KYC, payouts, refunds, plan changes, audit viewer. Listings publish only after approval.

## D-17 — Payouts monthly, min ৳1,000, 7-day hold · ACCEPTED by owner · 2026-09-17

Earnings state machine: `pending` (sale) → `available` (after 7 days, unless refunded) → `paid` (staff records transfer ref in payout queue on the 1st). Seller sees statement + payout method (bank / bKash / Nagad) stored on `seller_payout_methods`.

## D-18 — Plan matrix proposed by Claude with placeholder BDT prices · ACCEPTED by owner · 2026-09-17

Plans live in a `plans` table (limits + prices), editable from the platform console without deploy. Placeholder matrix is in `docs/product/PRODUCT-DECISIONS.md` §Billing.

## D-19 — Supabase project · SUPERSEDED by D-53 (2026-09-24) · 2026-09-17

`acadigma-suite`, ref `bvqzhrvcrxebawjusrxk`, region ap-south-1, URL `https://bvqzhrvcrxebawjusrxk.supabase.co`. Publishable key `sb_publishable_6POCbYjBAcrSiT1AlCPSVQ_SG3ohfsL` (safe for browser). Service-role key is never written to disk outside `.env.local`.

## D-20 — Single Supabase project for dev and prod until launch · ACCEPTED · 2026-09-17

**Context:** Supabase branching requires the Pro plan; Docker is not installed on the dev machine. The project holds no real data before launch.

**Decision:** Until Release 1 launches, `acadigma-suite` is both dev and prod. Migrations are applied by CI from `main` only. Feature branches run pgTAP tests in CI against a throwaway Postgres 17 **service container** with the same migrations, so RLS tests never need the cloud project. Seed data is marked demo and wiped before launch. At launch: upgrade to Pro (backups, PITR, branching) and switch previews to Supabase branches — a `db.yml` config change only.

**Why:** Free tier while there is nothing to protect; CI independent of the cloud project; no rework later.

## D-21 — `main` protection is procedural until GitHub Pro · ACCEPTED · 2026-09-17

**Context:** Branch protection / rulesets on a private repo need GitHub Pro (API returned 403). Making the repo public is rejected (security-relevant source, school data platform).

**Decision:** `main` receives only squash-merged PRs with all seven CI checks green (`format`, `typecheck`, `lint`, `unit`, `build`, `e2e`, `security`). No direct pushes. The CI workflow additionally fails any push to `main` whose commit is not a merge of a PR (guard job). When the owner upgrades to GitHub Pro, the protection rule in `docs/engineering/CI.md` is applied verbatim.

## D-22 — Design-system rulings · ACCEPTED · 2026-09-17

Four points the design lead flagged (`docs/architecture/DESIGN-SYSTEM.md`):

1. **Attendance pre-fills every student as present** — ACCEPTED. It is what makes ≤2 taps/student true. Safeguards: the session is not saved until the teacher taps Submit; the submit sheet shows "N absent, M late" for confirmation; `attendance_sessions.defaulted_present = true` is recorded so analytics can distinguish "marked" from "defaulted" if a school worries about data quality.
2. **Rules (dividers) instead of cards for record lists** — ACCEPTED. Denser on 360 px; documented as a lint rule so implementers don't revert to cards.
3. **`--warning` fill carries ink text, not white** (3.25:1) — ACCEPTED as a documented exception.
4. **Custom numeric pad for phone marks entry** — DEFERRED. v1 uses a native `<input inputmode="decimal">` with next/previous-cell controls above the keyboard; the custom pad becomes a later part only if field testing shows the OS keyboard is unusable. Reason: custom input UI is a maintenance and accessibility cost we should not pay before evidence.

Fonts: Inter + Hind Siliguri (measured subset sizes; Bengali loads on demand). Tokens live in `packages/ui/tokens/tokens.css`; no feature code may introduce colours or spacing outside them.

## D-23 — Operations-spec rulings · ACCEPTED · 2026-09-17

From `docs/features/05-operations/*` conflicts: (1) staff pay lives in period-versioned `staff_compensation` (owner/admin-only) + `app.staff_hourly_rate()` — never on `staff_records`; (2) recruiter↔candidate DMs are out of v1 (candidates are not workspace members) — templated email + application notes instead; (3) report cards are per exam; Term/Annual use an `aggregate` exam kind with weighted components; (4) academics owns `academic_years/terms/holidays/grade_scales` tables, settings screens live in F-OP-07; (5) school policy blobs are jsonb validated by Zod, resolved by one `resolve()`; (6) report files expire at 30 days, print jobs keep a `file expired` state with Regenerate; (7) staff attendance records which half for half-day absences; (8) `exam_paper` print jobs visible only to owner/admin/staff + creator; (9) no fake printer telemetry columns — live status only from the future agent's table.

## D-24 — Commerce-spec rulings · ACCEPTED · 2026-09-17

From `docs/features/04-commerce/*`: (1) seller data is **user-scoped** (documented exception to D-04/1.6; selling is a user capability); buyer data is workspace- or user-scoped by buyer type; (2) SSLCommerz facts adopted as design constraints: validation-API + exact integer amount + tran_id + currency before capture; prices ৳0 or ≥ ৳10, ≤ ৳500k; ৳0 orders bypass the gateway; refunds async via `bank_tran_id` with a poll job; subscriptions renew by invoice-and-pay + 7-day grace + dunning (no card tokens exist); reconciliation job via transaction-query API; `store_amount` never used for commission; (3) `listing_pending_changes` keeps a live listing buyable while edits await review; (4) `rating_avg_milli` (×1000) naming; (5) plans/limits engine (F-CM-06 Parts 1–3) ships in Release 0 because every area gates on `assertWithinLimit`/`hasModule`; (6) malware scanning + DOCX/PPTX previews deferred (no container in the architecture) — recorded honestly as `scan_status='skipped'` and cover-only previews; owner question OQ-6; (7) AIT withholding and VAT registration → owner questions OQ-1/OQ-2 (`docs/product/OWNER-QUESTIONS.md`).

## D-25 — Identity-spec rulings · ACCEPTED · 2026-09-17

From `docs/features/01-identity/*`: (1) shell = workspace type ∧ role (parents → `/family`); PRODUCT-DECISIONS 1.1 amended; (2) `audit_events`/`notifications.workspace_id` nullable + `app.log_audit_event()` writer; ARCHITECTURE §4 amended; (3) **SMS**: `adapters/sms` with a console driver behind a feature flag; v1 launch = email invites + copyable/WhatsApp-shareable invite links; phone OTP and SMS invites switch on when a provider is chosen (owner question added); (4) platform-admin access is narrow and enumerated, no impersonation — `support_access_grants` (owner-granted, ≤24 h, read-only, logged); (5) personal workspaces carry an implicit `personal_free` plan; (6) custom label via `workspace_members.custom_label_id`; (7) durations: 30-day account-deletion grace, invitation expiry 14 days (email) / 30 days (join-code approval).

## D-26 — Teaching-spec rulings · ACCEPTED · 2026-09-17

From `docs/features/03-teaching/*`: (1) Claude has no image generation → the "image" tool produces **sanitised SVG illustrations**; photoreal images need a new vendor (future); (2) `syllabus.extract` uses `claude-sonnet-5` (accuracy over cost — a bad topic list poisons every downstream number); D-08 amended: Haiku only for low-stakes classification/rewrites; (3) credit prices corrected to cover model cost at ৳120/USD: syllabus.extract `10 + ceil(max(0,pages−10)/2)` capped at 40; worksheet 4, quiz 4, rubric 3, differentiation 3, illustration 5 (lesson plan 5, parent message 1, pacing 8 unchanged); (4) Free plan limited to haiku-backed actions via `ai_actions.min_plan_tier`; (5) CI rule: only `packages/adapters/ai` may import `@anthropic-ai/sdk`; anti-mock grep fails CI on numeric/array literals in analytics routes; (6) eligibility ranking shared between cover-teacher and workload in `packages/domain/eligibility.ts`.

## Amendment to D-21 — required checks are the eleven in `docs/engineering/CI.md`

`CI / lint, typecheck, unit, contracts, db, build, security, e2e, lighthouse, changeset, docs-sync` (+ `guard`). Supersedes the seven names listed earlier.

## D-27 — Market-research-driven scope changes · ACCEPTED (lead; owner may override) · 2026-09-17

Source: `docs/product/research/COMPETITORS.md`. (1) **Fee collection joins Campus** as F-CM-08, Release 1.5, school as merchant of record via school-owned SSLCommerz/bKash credentials; supersedes FUTURE.md "fee management belongs to Admin app" — Admin app does accounting/analysis on top. Reason: every BD competitor leads with fees; a school will not switch to a system that cannot collect money. (2) **SMS moves to R1** as metered pass-through with per-school sender-ID paperwork in onboarding (provider still OQ-10). (3) **Pricing = feature tier × student band** + one-time onboarding fee; `plan_prices` table added now. (4) **PDPA 2026 compliance** is an R0/R1 workstream: `COMPLIANCE-PDPA.md`, DPA acceptance in school creation, consent capture in guardian invitations, data-request tooling; no biometrics ever (marketing point). (5) **Marketplace pilot gate**: a 20-listing / 200-teacher paid pilot precedes the full R3 commerce stack. (6) 4th-subject GPA rule added to F-AC-06. (7) Rename settled; "Acadigma" trademark search → OQ-12. (8) Market sizing corrected: English-medium segment is small (137–300 schools); Bangla-medium private schools, kindergartens and coaching centres enter the ICP earlier than planned.

## D-28 — Research-driven product rules (pricing + teacher-side) · PROVISIONAL until debate synthesis · 2026-09-17

Adopted now: (1) `plan_prices` expresses band + per-student overage so either pricing model fits; SMS included-count per plan + metered unit price; (2) every AI output is a **draft the teacher explicitly approves** before it persists or becomes visible to anyone — universal, not report-card-only; (3) `teacher_profiles.open_to_work` is private-by-default with selective disclosure to named schools; (4) offline attendance replay is baseline correctness (35 % of BD mobile connections are 2G); (5) performance NFR reworded: the constraint is CPU/RAM on low-end Android, not data cost (৳33/GB); (6) PLG artefacts: instant badge/certificate issuance and 1080×1080 Bangla-capable share images are roadmap items; (7) marketplace is treated as retention/network value, not a revenue line, until ~5,000 schools; (8) never bundle hardware; AI is not sold as a separate SKU; sold schools get an 8–12-week paid pilot spanning one exam cycle instead of a 14-day trial (self-serve keeps the trial).
Pending debate: exact plan prices/shape; hiring release timing (OQ-16); payout minimum (OQ-15, owner).

## D-29 — Workflow-doc rulings · ACCEPTED · 2026-09-17

From `docs/workflows/README.md §4`: (1) new route group `(account)/account/*` for user-level settings (security, devices, sessions, language, data requests, delete) — ARCHITECTURE §2 amended; (2) read-only-over-limits = `workspaces.access_mode` (normal|read_only) checked by server actions (`PLAN_READ_ONLY`), set by trial-expiry/dunning jobs, cleared on upgrade payment; (3) settings named: `attendance_policy.mode ∈ daily|period`, `cover_policy{missed_punch_grace_minutes, cover_credited, unpaid_absence}`; (4) handout distribution reuses the announcements audience resolver (no second fan-out); (5) parent portal owner = F-AC-10 (academics area), view contract per WF-02 stage D.

## D-30 — Observability is OpenTelemetry-first; backend chosen at R1 launch · ACCEPTED · 2026-09-17

**Context:** owner pointed at `tracewayapp/traceway` (MIT, OTel-native, includes AI-call tracing per tenant and on-call paging). `OBSERVABILITY.md` assumed Sentry.
**Decision:** the app emits OTLP via `@vercel/otel` (traces, logs with `correlation_id`/`workspace_id`, AI spans with `gen_ai.*` + `user.id = workspace_id`). The backend is a deploy-time choice: Sentry (managed, immediate) vs Traceway Cloud vs self-hosted Traceway on a small VPS once one exists. Decide at Release 1 launch with real pricing. `OBSERVABILITY.md` to be amended to describe the OTel contract and list both backends.
**Why:** vendor neutrality costs nothing now; Traceway's per-tenant AI cost view matches the credit ledger exactly, but we have no host for it today.

## D-31 — Fee-collection rulings · ACCEPTED · 2026-09-17

From `docs/features/04-commerce/F-CM-08-fee-collection.md` (14 parts): school is merchant of record, enforced structurally (per-workspace pgsodium-encrypted credentials readable by no human role); fee money never enters Acadigma's `orders/payments` tables (`fee_payments`/`fee_transactions` instead; 0 % commission asserted by CI); `PaymentProvider` factory becomes scope-aware (platform | workspace merchant); `inbound_events` gains nullable `workspace_id`/`merchant_account_id`; fee refunds are owner/admin with no time window; split payments for > ৳500k; per-merchant reconciliation reporting to the school; bKash callback shape supported; counters unified into `document_counters`; `workspace_member_capabilities` (first: `fees.cashier`); late fees recomputed absolutely (default off); discounts never compound; public `/pay/[schoolSlug]` requires guardian phone last-4 and is rate-limited; Bengali SMS counted as UCS-2 70-char segments with mandatory cost estimate. Build order: fees ahead of the whole selling chain (fees are a mid-market ship-blocker; marketplace is the unproven assumption). `fees` module on Starter+; Free sees it locked with an upgrade prompt, not hidden.

## D-32 — Academics-spec rulings · ACCEPTED · 2026-09-17

From `docs/features/02-academics/*` (64 parts): (1) PWA offline attendance queue (IndexedDB + idempotent replay) is **in v1** (F-AC-03 Part 7) — ARCHITECTURE §6 wins over the FUTURE.md wording; only "default-on background sync" is wrapper-phase; (2) two "optional" concepts kept distinct (elective vs BD 4th subject); (3) identifiers use American English (`behavior_*`); (4) trigger-maintained rollups for attendance-% and behavior term scores; (5) risk weights must sum to 1.00 (blocked otherwise) while exam component weights renormalise with a warning — deliberate: risk flags a child, marks are audited by humans; (6) calendar (F-AC-11) builds second in the area because `app.is_school_day` is the denominator for attendance, leave and analytics; (7) `grading.show_rank_to_parents` defaults **on** → OQ-17 for the owner.

## D-33 — GSAP is the animation library · ACCEPTED (owner request) · 2026-09-17

`gsap` + `@gsap/react` in `packages/ui`, curated plugin registration (ScrollTrigger, Flip, Observer, Draggable, SplitText, TextPlugin, ScrollToPlugin, MotionPath, DrawSVG, CustomEase/Bounce/Wiggle, EasePack; dev-only GSDevTools/MotionPathHelper; excluded: Pixi, Easel, Physics2D/Props, MorphSVG, ScrollSmoother). Lazy-loaded, reduced-motion aware, CSS transitions remain the default in the core app. No framer-motion.

## D-34 — PDPA 2026 compliance rulings · ACCEPTED · 2026-09-17

Source `docs/product/COMPLIANCE-PDPA.md` (verified: Act 2026 current; enforcement ≈ 13 May 2027; localisation of "confidential/restricted" data inside Bangladesh; fines and CDO requirements conflict across sources). Adopted P0/P1: `consent_records` with the guardian invitation as consent of record (+ paper path); `legal_acceptances` and a blocking DPA/Terms/Privacy step in school creation; `redactForAI()` enforced by Semgrep + Vercel functions pinned to `bom1`, no personal data in edge middleware; `data_requests` + `exportBundle()` + `app.erase_subject()` with legal holds and a CI-checked `personal_data_map`; minimisation (NID/birth-cert scans purged 90 days after admission, religion off by default and admin-only, health restricted to owner/admin/class teacher/first-aid staff, KYC purged 2 years after last payout); audit retention 7 years rolling; sellers 18+, under-18 candidates need a guardian step; risk score documented as a transparent formula, never "AI prediction"; personal-workspace tutor students carry a restricted field set (Acadigma is controller there). **Localisation**: unresolved — depends on counsel's classification answer (OQ-18); options costed by Q1 2027 (in-country synchronised replica on a BD VPS vs self-hosted Supabase in a BD DC). Marketing: never "PDPA compliant" or "all data stays in Bangladesh".

## D-35 — Voice-of-customer rulings · ACCEPTED · 2026-09-17

Source `docs/product/research/VOICE-OF-CUSTOMER.md` (26k reviews). (1) M0/M1 exit criteria gain measurable reliability numbers: zero forced re-authentications in a 30-day soak (sessions persist; refresh silently), ≥ 99 % measured in-app notification delivery within 60 s, ≥ 90 % self-serve credential recovery (email/phone reset with no school-office dependency), cold start < 3 s on a 2 GB-RAM Android, no "server down" false positives (distinguish offline vs API error in UI). (2) Onboarding: the join flow offers **search by school name + district** and "my school isn't listed" alongside the join code. (3) Attendance is always visible to the affected person (parent sees the day's mark and the %; teacher sees what was saved). (4) Fees inside the same app and login (already D-27/D-31). (5) No hidden post-trial pricing: price page public; trial end date shown from day one. (6) Speed and login reliability are the year-one moat, ahead of feature breadth.

## D-36 — Data-model interpretations · ACCEPTED · 2026-09-17

From `docs/architecture/DATA-MODEL.md` (129 tables; 29 in foundation migrations 0001–0004): (1) UPDATE policy = role predicate in `with check` + `app.tg_freeze_workspace()` BEFORE UPDATE trigger (ARCHITECTURE §3 corrected — the earlier template was degenerate); (2) guard triggers are `security invoker` so `current_user` distinguishes client statements from server-owned paths (`app.is_privileged_context()`), which a `set_config` flag could not; (3) append-only tables (`audit_events`, `consent_records`, `legal_acceptances`) have **no foreign keys** — history outlives what it describes; (4) `UserLabel` merged into `workspace_members.label_id`; (5) `document_counters` uniqueness via `(coalesce(workspace_id, uuid_nil), kind, year)`; (6) audit reads = owner + platform staff, not admins; (7) `subscriptions.billing_interval`; (8) default grade scale id lives in `school_profiles.academic_settings` until R1 creates `grade_scales`; (9) pgTAP cross-tenant UPDATE/DELETE assert zero rows affected, `throws_ok` only where Postgres genuinely raises. Migration-from-Base44: 21 kept / 6 split / 20 merged / 17 dropped; memberships import `pending` floored at `teacher`; transactions `unverified_legacy`; earnings recomputed and landed `reversed`; prototype `AuditLog` not imported.

## D-37 — Model mix and token discipline · ACCEPTED (owner: "make sure I don't spend tokens on unnecessary stuff") · 2026-09-17

**Model routing:** Opus only for architecture, security review, research synthesis, and reviewing money/RLS code. **Sonnet** for every well-specified implementation part (builders and testers — the specs are precise enough). **Haiku** for mechanical work (renames, fixture generation, doc index updates, lint fixes). Reviewer agents (`typescript-reviewer`, `react-reviewer`, `security-reviewer`) run once per PR, not per commit.
**Token rules for agents:** read only the spec part + DATA-MODEL section + DESIGN-SYSTEM section they need (never whole inventories); write files in ≤400-line chunks; no re-reading files they just wrote; one final report ≤ 40 lines; no exploratory browsing unless the task is research. Lead messages stay short; status updates only on completions.
**Local infra:** Docker Desktop + WSL2 installed so `supabase start` runs pgTAP locally (fewer CI round-trips = fewer wasted cycles).

## D-38 — Parent identity is provider-agnostic from M0 · ACCEPTED · 2026-09-17

**Context (CFO critique, `debate/04-cfo.md`):** every parent holding a Supabase Auth identity counts toward MAU billing (~$0.00325/MAU above the included tier ≈ ৳1.3 lakh/yr at 1,000 schools); a magic link is still an auth event, so it is not a mitigation.
**Decision:** `packages/db` exposes `ParentSessionProvider`; RLS policies key on `auth.uid()`/JWT claims only, never on `auth.users` rows, so parent sessions can be issued either by Supabase Auth (M0–launch, inside the included MAU) or by **server-minted Supabase-compatible JWTs** (phone-OTP/email-link verified by us, signed with the project JWT secret, `sub` = guardian user id) once parent MAU approaches the included tier. No parent-facing feature may assume an `auth.users` row exists. Decision point: MAU > 50 % of included tier.

## D-39 — AI allowances are per MONTH, not per day · ACCEPTED · 2026-09-17

PRODUCT-DECISIONS §3.3/§5.1 said "credits/day"; costed at ৳1.45/action that makes every tier negative-margin on AI. All plan allowances are restated as **AI actions per month** with pooled use (burst-friendly for Thursday-night planning), hard cap, and top-ups priced above cost (placeholder ৳1,200 / 500 actions, ceiling 3× allowance/month). Exact per-plan numbers set by the debate synthesis; the plans seed in migration 0004 must be updated before M0 0.5 builds on it.

## D-12 — Node 24 + pnpm 10 · ACCEPTED · 2026-09-17

**Why:** Node 24.19 is what's installed. The old plan pinned pnpm 11.19.0 which does not exist on this machine's corepack; pnpm 10 (current stable) is used and pinned via `packageManager`.

---

## Research-debate synthesis, adopted · 2026-09-17

Source: `docs/product/research/debate/SYNTHESIS.md` and `docs/product/research/DECISION-CHANGES.md`. The lead adopts the synthesis verdicts as defaults: Free school plan abolished pending owner sign-off, the MARKET-STRATEGY §c price list as given, attendance default unmarked, fees offline P1–6 inside the R1 gate, hiring M4 apply-only, marketplace gate immediately after M3, the listed PLG loops killed, compliance MUSTs accepted. Amendments to previously-numbered decisions are appended below rather than rewritten in place, to keep the original reasoning intact; brand-new rules are numbered D-40 onward.

## Amendment to D-22 — Attendance no longer pre-fills present · AMENDED · 2026-09-17

**Amends:** D-22 point 1 (`defaulted_present = true`, pre-fill present + confirm).
**New rule:** Default `unmarked`. "সবাই উপস্থিত / Mark all present" ships as **one explicit header tap writing an audited bulk action** carrying the actor's user id, surfaced in the monthly register. `defaulted_present` is dropped; `bulk_marked_by` / `bulk_marked_at` are recorded instead. The undo toast is retained.
**Why:** A default that fabricates attendance records poisons every downstream number (%, risk score, health score, GPA denominators) and cannot be fixed retroactively once schools rely on the history. Read-back audits catch a bad _action_ fast; a bad _default_ is invisible until it is load-bearing (SYNTHESIS X-01). Priority: R1, before M2 2.4.

## Amendment to D-27 (finalized) · 2026-09-17

**Amends:** D-27 points (1), (2), (3), (8).

1. **Fees:** offline recording (F-CM-08 P1–6) moves inside the **R1 launch gate** (M3, not M4); online payment (P7–14) stays R1.5. The CFO's objection was to the online rail's unbudgeted cost, not to recording fees at all — separating them satisfies both critics.
2. **SMS:** priced per UCS-2 segment (৳0.75) with margin, and recognised as a **legal-entity dependency** (BTRC enlistment needs a company name, trade licence, TIN, NID), not two engineering glue parts.
3. **Pricing:** band + overage confirmed as the shape; **teacher caps are deleted** on every plan.
4. **Market sizing:** BANBEIS 2022 (137 schools / 71,456 students) is the number of record; BEMA's "300+/300,000+" is a labelled trade-body claim; Eduman, ClassTune and IEIMS/EMIS are added to the competitive map as the real incumbents.
   **Why:** Fees are the market's anchor module — a school will not switch to a system that cannot collect money — and the offline half has no gateway dependency, so there is no reason to hold it for M4. SMS lead time is regulatory, not engineering, and treating it as "2 glue parts" hid a company-formation dependency from the schedule. Per-seat pricing was suppressing our own north-star metric (login frequency) by making schools ration accounts.

## Resolution of D-28 — RESOLVED from PROVISIONAL · 2026-09-17

1. Plan shape and numbers are final (MARKET-STRATEGY §c; migration `20260917010300_plans_and_notifications.sql`).
2. AI approval is universal **except that parent-facing text may never be bulk-approved** — a per-student edit or typed sentence before `parent_visible`, teacher's name on the comment.
3. `open_to_work` is a private preference; **candidate browse is deleted; hiring is apply-only.**
4. Pilot = 8–10 weeks paid, spanning one terminal exam; self-serve trial = **30 days**. **Hiring timing resolved: M4, minimal 4 parts (P1–4), apply-only.**
   **Why:** The debate round closed every item D-28 left provisional. "Approve all" for forty children at 9pm is one tap and the first wrong comment costs the school; a browsable teacher directory is safe only for the unemployed in a city where forty principals share a WhatsApp group (SYNTHESIS A-05, H-03).

## Completion of D-39 · 2026-09-17

**Completes** the D-39 entry above (allowances restated as per-MONTH). Final numbers: **trial 100 AI actions lifetime · Starter 200/month · Pro 600/month, pooled · Enterprise contractual cap.** Top-up **৳1,200 / 500 actions**, hard ceiling **3× plan allowance / month**. COGS planning at **৳1.45/action**, budgeted at **cost + 30%**.
**Why:** Pooling matches how teachers actually work — Thursday-night bursts, not daily quotas — and a hard ceiling with a priced top-up keeps an uncapped top-up from becoming an unsecured credit line against a monthly invoice-and-pay subscription (MARKET-STRATEGY §h).

## Supersession of D-26(4) · 2026-09-17

**Supersedes:** `ai_actions.min_plan_tier` gating (Free limited to haiku-backed actions).
**New rule:** Model routing is **by language risk, not plan tier.** Any Bangla, parent-facing output uses the stronger model on every plan; cost is controlled by _which actions_ a tier may call, never by degrading Bangla.
**Why:** `min_plan_tier` gates by cost, cost tracks model size, and model size determines Bangla quality — so the old rule guaranteed the worst Bengali went to the schools least able to notice the errors, directly contradicting "never ship unreviewed Bangla to parents" (SYNTHESIS A-04).

## Amendment to D-34 — Minimisation strengthened · AMENDED · 2026-09-17

**Amends:** D-34's minimisation clause.
**New rule:** **Student/guardian NID and birth-certificate _numbers_, and `monthly_income_bdt`, are dropped entirely** — replaced by an attestation record `{type, last4, verified_at, verified_by}`. Scans purge at **admission decision + 14 days** (not 90). KYC images retained **180 days** (F-CM-02 wins over COMPLIANCE §4.4's "2 years"). `redactForAI()` moves to M0/M1 and **fails closed**. Localisation gains a roadmap item, a named owner and a decision gate at M6.
**Why:** A number we never store cannot leak, be subpoenaed wrongly, or need a retention clock at all; "we don't archive" is only a true claim once the numbers themselves are gone, not just the scans. Priority: MUST.

## Update to D-17 — OPEN to the owner, recommendation attached · 2026-09-17

Current rule: payout minimum ৳1,000, monthly on the 1st. **Recommendation: ৳300, weekly auto-payout, instant-on-request with the fee stated**, bKash cash-out cost shown honestly in the earnings screen. ৳1,000 **stands until the owner rules** (OQ-15).
**Why:** Median new marketplace sellers earn ~$32 in month 2; at ৳1,000 most first-cohort sellers never cash out and never make a second product — the 29-day wait to a first payout is the retention event we are currently failing. Priority: later (M6).

## D-40 — Attendance is never fabricated by default · ADDED · 2026-09-17

The full rule is D-22 (amended) above. **Why:** a default that fabricates records poisons every downstream number and cannot be fixed later (SYNTHESIS X-01). Priority: R1.

## D-41 — One price list · ADDED · 2026-09-17

The grid in `MARKET-STRATEGY.md` §c is the **only** price list. `OUTREACH-TEMPLATES.md` and the pricing page quote it verbatim; no document may state a different number.
**Why:** Three research documents were quoting three different prices (৳2,999/৳7,999, ৳1,500/৳3,500, and the new ৳2,200/৳4,900 grid); a prospect who sees two numbers trusts neither. Priority: M0-0.5.

## D-42 — The Free school plan is abolished · ADDED · 2026-09-17

The free teacher personal workspace (zero AI) replaces it, plus a capped NGO/madrasa programme. Cash effect ≈ **+৳87,000/month at 100 free schools** (removed burn). **Pending owner confirmation (OQ-22)** — the plans seed removes the `free` row now; `personal_free` is kept.
**Why:** ৳870/school/month of burn against a ~5% free-to-paid conversion is 19 loss-making schools per convert; it also anchors the market at ৳0 and is trivially matched by an incumbent bundling free hardware (MARKET-STRATEGY §c). Priority: M0-0.5.

## D-43 — Hiring is apply-only and is not an acquisition channel · ADDED · 2026-09-17

Candidate browse is deleted; `open_to_work` is a private preference that surfaces jobs to the teacher, never the teacher to schools; the verification badge is renamed "Documents checked by Acadigma on {date}" with the method stated.
**Why:** The 3.7M-membership NTRCA cluster waits for a central government recommendation a school cannot post against, so hiring cannot be the acquisition engine; a browsable availability directory in a city where forty principals share a WhatsApp group is safe only for the unemployed (MARKET-STRATEGY §f). Priority: later.

## D-44 — No child-scoped data on an unauthenticated surface · ADDED · 2026-09-17

Covers the parent invite loop (it sends an **invitation**, never a view), OG/share images (school-mark only, never a child's name/photo/marks/attendance), and QR codes on student-facing artefacts (none, ever).
**Why:** An unauthenticated single-child URL is fetched and cached by link-preview crawlers before any consent exists; a marketing QR code on a report card or ID card is a second, uncontrolled distribution channel for a child's record (SYNTHESIS G-09, G-10, G-11). Priority: MUST.

## D-45 — Company formation is on the critical path · ADDED · 2026-09-17

RJSC + trade licence + TIN + VAT BIN gate BTRC sender ID, bKash merchant, SSLCommerz eligibility, Mushak 6.3 invoicing and DPA signature. Added as roadmap item 0.
**Why:** It was on nobody's critical path despite blocking five other workstreams and taking 6–10 weeks; starting it late is a pure schedule tax with no offsetting benefit (SYNTHESIS F-06). Priority: MUST, owner action this fortnight (OQ-20).

## D-46 — The roadmap is anchored to the BD school calendar · ADDED · 2026-09-17

Pilot-ready **1 Sep 2027**; base closes **January 2028**; proof on the **April–May 2028 terminal exam**. **Sep 2026 and January 2027 are already lost** — stated plainly so nobody plans against them.
**Why:** R1 needs 149 parts and today is 17 Sep 2026; pretending an already-passed window is still open produces a schedule nobody can hit and a funnel nobody can trust (MARKET-STRATEGY §i, G-01, G-02). Priority: R1.

## D-47 — Teacher metrics are not management surveillance · ADDED · 2026-09-17

Admins see **scheduled periods only**; workload variance is teacher-private by default (per-teacher opt-in to share); thresholds are BD-calibrated (26/30/32 periods/week, not 20/24/25); a first-run disclosure page states plainly what the school can and cannot see.
**Why:** BD private-school teachers routinely teach 28–32 periods/week, so the old thresholds flagged normal load as burnout on day one; and a workload dashboard that reads as surveillance is how `lesson_logs` fills with fiction (SYNTHESIS T-01, T-02). Priority: R1.

## D-49 — Dependency release-age cooldown is 2 days, security patches exempt · ACCEPTED · 2026-09-17

**Context:** Semgrep's supply-chain rules led to `minimumReleaseAge: 7 days` in `pnpm-workspace.yaml`. With every dependency pinned exactly, that rejected `@turbo/linux-64@2.10.13` (published 3 days earlier) and aborted every install — which silently prevented the postcss/browserslist security overrides from applying.
**Decision:** `minimumReleaseAge: 2880` (2 days) — still blocks same-day malicious publishes, which is the threat the rule targets — plus `minimumReleaseAgeExclude` for packages being patched for a published advisory, and `overrides` in `pnpm-workspace.yaml` (not `package.json`) with exact versions. Rule for the future: when pinning a dependency released < 2 days ago, add it to the exclude list in the same commit, and remove it in the next.
**Why:** a supply-chain control that breaks installs gets disabled; one that costs nothing stays on.

## D-50 — Client-callable RPCs live in `public`; `app.*` stays server-internal · ACCEPTED · 2026-09-17

**Context (F-ID-01 build):** Supabase exposes only the `public` schema (and schemas explicitly added to PostgREST) as RPC. Functions in `app.*` — designed as the SECURITY DEFINER helper layer — cannot be called from the browser or from `supabase-js`, so `app.redeem_invitation`, `app.request_join_with_code` and the auth throttle helpers were unreachable as written.
**Decision:** every function a client must call gets a thin `public.<name>()` wrapper that validates arguments and delegates to the `app.*` implementation; `public` wrappers are the only functions granted `EXECUTE` to `authenticated`/`anon`. `app.*` keeps the logic, is granted to no client role, and is the only layer tests target for behaviour. RLS helpers used inside policies remain in `app`. Each feature spec that names an RPC (F-ID-03, F-ID-04, F-CM-08 …) must list its `public` wrapper.
**Why:** keeps the security-definer surface auditable and the PostgREST surface minimal; the alternative (exposing `app` to PostgREST) would publish every helper.

## D-53 — Campus moves to its own Supabase project on a separate account · ACCEPTED · 2026-09-24

> Numbering note: D-51 (PR #6, audit) and D-52 (PR #12, tenancy follow-ups) are on open PRs at the time of writing. This entry takes the next number after both.

**Context:** the owner created a separate Supabase account (organisation `Acadigma Suite`) for the Campus app. The old project `acadigma-suite` (`bvqzhrvcrxebawjusrxk`) never had the Campus migrations applied (OQ-26 secrets were never set), so it holds only the marketing site's `public.waitlist` table.

**Decision:** Campus uses project **`Acadigma Campus`**, ref **`kekfmibwjejdhxjkmezo`**, region ap-south-1 (same as before), URL `https://kekfmibwjejdhxjkmezo.supabase.co`, publishable key `sb_publishable_VbUqiEvQiuObUZMf5IGYOA_P_EiiyGy` (safe for browser). The service-role/secret key is never written to disk outside `apps/web/.env.local`, Vercel and GitHub secrets. D-20 (one project for dev and prod until launch) still applies, to this project. The marketing website **stays** on the old project for its waitlist; the two apps no longer share a database.

**Consequences:** Vercel and Claude Code keep the owner's existing accounts; only Supabase changed. Every dashboard-only Supabase setting must be (re)applied to the new project — `supabase/config.toml` auth settings via `supabase config push`, plus the dashboard items in OWNER-QUESTIONS (OQ-25 recovery email template, breached-password protection, SMTP, redirect URLs). Historical test reports keep the old ref because that is what they ran against.

## D-55 — Generated types come from the PR's migrations in CI, not from the live project · ACCEPTED · 2026-09-24

> Numbering note: D-51 (PR #6) and D-52 (PR #12) are on open PRs; D-54 is reserved by the in-progress default-grants security PR. This entry takes D-55.

**Context:** `CI / contracts` regenerated `types.generated.ts` from the live Supabase project and byte-compared it with the committed file. The check was skipped until the Supabase secrets existed (OQ-26); once they did, it exposed that the design cannot work: the live project only receives a PR's migrations after merge (D-20), so any PR that changes the `public` schema (PR #6 adds `set_correlation_id` and audit columns) generates types without its own changes and fails, while committing types that include them also fails.

**Decision:** the freshness check moves to `CI / db`, after the PR's migrations are applied to the CI Postgres: `supabase gen types typescript --db-url <ci postgres> --schema public`, Prettier-formatted, byte-compared. The live-based check is removed from `contracts`. On a mismatch the job uploads the correct file as the `types-generated` artifact, so a developer (or agent) with no local Docker fixes it with `gh run download`.

**Consequences:** the committed file is in `--db-url` output format. Drift between the live project and `main` is a deployment concern (the `push` job applies `main`'s migrations), not a per-PR type check.
