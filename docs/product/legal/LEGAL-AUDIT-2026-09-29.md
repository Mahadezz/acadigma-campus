# Legal and compliance audit — 2026-09-29

> **This is a starting-point checklist written by an engineering agent. It is not legal advice.** It compares what the code, docs, config and the marketing website actually do against the owner's shared "App Legal Checklist" and against `COMPLIANCE-PDPA.md`. Every legal conclusion here needs a Bangladeshi lawyer before anyone relies on it. Where a law is cited, the section says whether it was read from a primary source.

Scope: `acadigma-campus` at `origin/main` 13a15ebd (2026-09-29) and `acadigma-website` at ec4f8ba. Read-only: no code, config, vendor dashboard or database was changed or queried.

---

## 0. Summary in five lines

1. **The public website makes claims the product does not support**, the worst being "One-tap attendance with NFC and **biometric** support — Live". The owner decided never to collect biometrics. Other examples: 8 AI tools, a Students app, real-time parent alerts, "Built around FERPA rules", and prices and founding terms that contradict D-78 (§3.4, §3.5).
2. **No privacy policy, terms of service or DPA is published anywhere**, but the sign-up form makes every user tick "I agree to the Terms of Service and Privacy Policy". That acceptance is thrown away rather than recorded (§3.3).
3. **Guardian linking (D-108) ships without the consent-of-record design that D-34 adopted as P0.** It writes no `consent_records` row and shows no consent text, and the link is a bearer credential. The consent tables exist but nothing writes to them (§3.8).
4. **Users have no in-app way to delete an account or a school, export data, or make a data request** (§3.9). This blocks the planned Capacitor Play Store app, and it is the rights tooling that `PRIVACY-POLICY-DRAFT.md` promises.
5. **The third-party inventory in the drafts does not match the code.** Resend is listed but not wired. The real email sender is unknown. WhatsApp is missing from the list. The Sentry `beforeSend` scrubber the docs describe does not exist. The website waitlist writes into the campus production database (§3.6).

No real school holds data on production yet (D-80). Most items are therefore **"fix before the first real school"**, not live incidents. The website items are the exception: they are live and public today.

---

## 1. What was checked, and what was not

**Checked (with evidence below):** all 53 campus migrations, looking for personal-data columns and consent/legal tables. Every route under `apps/web/app`. The register, invite and create-school flows. `instrumentation*.ts`, `next.config.ts` (CSP), `vercel.json`, `supabase/config.toml`, `apps/web/package.json`, fonts and PDF font licences. `packages/domain/src/ai/redact.ts`. The billing cron. `COMPLIANCE-PDPA.md`, `PRIVACY-POLICY-DRAFT.md`, `DPA-DRAFT.md`, `PRICE-PROPOSAL.md`, `DEMO-SCRIPT.md`, D-34/D-62/D-78/D-80/D-108, `OWNER-QUESTIONS.md`. In the website repo: every file under `src/`, the waitlist route and its migration, and `package.json`.

**Not checked (and what would settle it):**

- **Vendor dashboards.** These cover the Supabase project region and Auth SMTP provider, the HaveIBeenPwned setting, whether a Sentry DSN is set in Vercel production, Vercel analytics and OTel drains, and the website's Vercel project. Settle them by reading each dashboard; no secret values need to be opened.
- **Contracts.** No signed DPA, ToS, LOI, vendor DPA (Supabase, Vercel, Sentry, Anthropic) or bKash/SSLCommerz merchant agreement is in either repo.
- **Company facts.** The legal entity, its country of incorporation, trade licence, BIN/VAT status (OQ-1) and headcount are not in the repos.
- **The live acadigma.com page as rendered.** The audit read the source; copy may differ if the deployed commit is older.
- **Social media pages** (Facebook, Instagram, LinkedIn) and any sales decks or LOIs sent to schools.
- **The statutory text of the PDPA 2026.** `COMPLIANCE-PDPA.md` §0 already records that nobody has read the gazette. This audit did not either.

---

## 2. Data map (collection points, third parties, communication flows)

### 2.1 Personal data the code collects today

| Where                                        | What                                                                                                                                   | Evidence                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Register (`/register`)                       | full name, email, password (Supabase Auth); IP → throttle key                                                                          | `apps/web/app/(auth)/actions.ts:85-99`                                                                                |
| Students (child data subjects)               | first/last name, Bengali name, gender, student code; **DOB** in `student_private_details`                                              | `supabase/migrations/20260925300306_students_and_guardians.sql:52-107`                                                |
| Guardians                                    | name, relation, **phone**                                                                                                              | same file `:119-140`                                                                                                  |
| Guardian ↔ account link                      | `guardian_users`, invitation token hash                                                                                                | `20260926065723_guardian_linking.sql`                                                                                 |
| Staff records                                | phones, emergency contact, **blood group, DOB, gender, full NID number**, address, qualifications, notes                               | `20260925000900_staff_schema.sql:45-90`, NID comment `:107-109`                                                       |
| Staff compensation                           | pay data                                                                                                                               | `staff_compensation` (same migration)                                                                                 |
| Staff documents                              | table exists; **no upload path or `/api/files` route yet**                                                                             | `20260925000900_staff_schema.sql:477-498`; no `apps/web/app/api/files`                                                |
| Attendance, marks, results, report-card PDFs | child records                                                                                                                          | attendance/exam migrations; `/api/pdf/[runId]`, `/api/family/report-card`                                             |
| Messaging (schema only)                      | channels, messages                                                                                                                     | `20260929041934_messaging_schema.sql`                                                                                 |
| Audit                                        | before/after row diffs, secrets pattern-redacted                                                                                       | `app.audit_secret_pattern()`; purge 7 y `20260924000100_audit_substrate.sql:978-990`                                  |
| Website waitlist                             | email + source, stored in **the campus production project** (`acadigma-suite`) in `public.waitlist`, which no campus migration defines | `acadigma-website/supabase/migrations/20260917020000_marketing_waitlist.sql:1-28`; `src/app/api/waitlist/route.ts:27` |

**Not collected today** (good, and it matches the minimisation plan): no student NID/birth-certificate numbers or scans, no health, religion or medical files, no photos, no uploads of any kind, no location, and no biometrics. **Children have no accounts**: `member_role` is `owner|admin|teacher|staff|parent` (`20260917010100_identity.sql:32`).

### 2.2 Third parties actually in the code

| Party                        | Code evidence                                                                                                                                                                                                        | In privacy-policy/DPA drafts?                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase (DB, Auth, Storage) | `@supabase/ssr`, `supabase/config.toml`                                                                                                                                                                              | Yes (Mumbai)                                                                                                                             |
| Vercel (hosting, cron, OTel) | `apps/web/vercel.json:3` `regions: ["bom1"]`; `@vercel/otel` registered unconditionally (`instrumentation.ts`)                                                                                                       | Yes. OTel/tracing export is not mentioned                                                                                                |
| Sentry                       | `@sentry/nextjs`, opt-in by `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`; `sendDefaultPii: false`; **no `beforeSend`** (`instrumentation-client.ts:7-13`, `instrumentation.ts:33-41`)                                     | Yes, but the drafts claim a `beforeSend` scrubber (`COMPLIANCE-PDPA.md:489`) that is not in the code                                     |
| Supabase Auth email (SMTP)   | Auth sends verify/reset mail "via whatever SMTP the project has configured" (`apps/web/lib/email-log.ts:6-15`)                                                                                                       | **No.** The drafts name Resend (`PRIVACY-POLICY-DRAFT.md:160`, `DPA-DRAFT.md:146,274`), which is not wired. The real provider is unknown |
| WhatsApp (Meta)              | Guardian invite "Send on WhatsApp" builds a `wa.me` link carrying the child's name and the invite URL (`apps/web/app/(school)/app/students/[id]/guardian-access.tsx:101-106`; text `apps/web/messages/en.json:1545`) | **No**                                                                                                                                   |
| SSLCommerz                   | `supabase/functions/sslcommerz-ipn` (IPN only; no checkout UI)                                                                                                                                                       | Yes. PRICE-PROPOSAL §5 now makes bKash the default rail and defers SSLCommerz, which the drafts do not reflect                           |
| Anthropic                    | **No SDK, no call site.** `redactForAI()` exists, unused (`packages/domain/src/ai/redact.ts`)                                                                                                                        | Yes (future)                                                                                                                             |
| Google Fonts                 | `next/font/google`, **self-hosted at build**, so browsers never contact Google (`apps/web/app/fonts.ts:1-8`)                                                                                                         | Not needed                                                                                                                               |
| Analytics / pixels / ads     | **None** in the app or the website (`grep` for gtag/posthog/plausible/pixel/`@vercel/analytics`: none)                                                                                                               | Correctly none                                                                                                                           |
| Website: Vercel geo header   | `x-vercel-ip-country` sets a 1-year `acadigma-region` cookie (`acadigma-website/src/proxy.ts:6-17`)                                                                                                                  | No website privacy notice exists                                                                                                         |

### 2.3 Communication flows

- **Transactional email:** Supabase Auth confirmation and reset only. The subject is honest ("Confirm your Acadigma Campus account", `supabase/config.toml:99-100`). No marketing email is sent from either repo.
- **SMS:** none. OQ-10 (provider) is open. Guardian invites go by copy-link or WhatsApp.
- **Marketing:** the website waitlist collects emails with no notice of purpose and no privacy link (`acadigma-website/src/components/site/waitlist-form.tsx:47-102`). There is no sending pipeline in the repo.

---

## 3. The checklist, item by item

Status key: **FAIL** (a gap with evidence) · **PARTIAL** · **OK** · **N/A** (with the reason) · **CAN'T TELL** (with what would settle it).

### 3.1 Marketing email: unsubscribe, honest sender and subject — **N/A today, PARTIAL for the waitlist**

No marketing email is sent from code. The waitlist form collects emails without saying what they will be used for, and there is no privacy link (`waitlist-form.tsx:47-102`, `site-footer.tsx:75-82`). Before the first newsletter or "early access" blast, the form needs a one-line purpose statement and a policy link, and every email needs a working unsubscribe that stops sending.

US CAN-SPAM is **not triggered** as long as sends go to Bangladeshi schools from a Bangladeshi sender. The US-region site (§3.12) could change that. **Bangladesh equivalent:** we know of no dedicated anti-spam email statute, and we did not verify one. PDPA consent/withdrawal duties (`COMPLIANCE-PDPA.md` §1.4) are the likely hook, so ask counsel.

### 3.2 SMS consent separate from OTP, STOP honoured — **N/A (not built)**

No SMS provider is chosen (OQ-10) and no OTP exists. The ledger site already advertises "Fee due reminders by SMS and WhatsApp" (`acadigma-website/src/lib/site.ts:84`). When SMS ships, a reminder SMS is a school-to-parent message sent as the school's processor, so the school's instruction is the lawful basis. The parent still needs a way to opt out, and any **promotional** SMS from Acadigma needs its own opt-in.

US TCPA is not triggered for BD numbers. **Bangladesh equivalent:** BTRC regulates sender IDs and bulk-SMS operators. We did not verify any BTRC rule on promotional SMS consent or STOP handling, so ask counsel and the chosen gateway.

### 3.3 Privacy policy exists, is linked, and matches reality — **FAIL**

- No `/legal/*` route exists in the app (full route list: `apps/web/app/**/page.tsx`: 44 pages, none legal). The website has no privacy, terms or legal link (`site-footer.tsx:75-82`).
- **The register form requires "I agree to the Terms of Service and Privacy Policy"** (`apps/web/messages/en.json:102`, `bn.json:102`; `register-form.tsx:200-216`). Neither document exists or is linked. The server then discards the flag: `void termsAccepted` (`apps/web/app/(auth)/actions.ts:92`). `legal_acceptances` exists (`20260917010200_audit_and_files.sql:675`) but **no code writes to it**. This is D-34 / COMPLIANCE P8–P9, both P0.
- The school-creation wizard has **no DPA step** (`onboarding/create-school/wizard.tsx`: no DPA, terms or legal step), which is also P0 under D-34.
- **Draft-versus-reality mismatches** to fix before the policy is published:
  - Resend is named but not used (§2.2).
  - WhatsApp is missing.
  - SSLCommerz is named as the payment rail, but PRICE-PROPOSAL §5 makes bKash the default.
  - The "90-day ID-scan purge" appears in `PRIVACY-POLICY-DRAFT.md:276`, but `COMPLIANCE-PDPA.md` §4.1 and OQ-18 say **14 days** and D-34 says **90 days** (`DECISION-LOG.md:255`). Three documents give two numbers.
  - The policy says Sentry reports carry "identifiers only". That is only true if a scrubber exists; with none, a thrown error message or breadcrumb can carry a name.
  - The cookie table (`PRIVACY-POLICY-DRAFT.md` §12) says "Up to 30 days, or 24 hours if you do not tick 'remember this device'". The login form has a remember checkbox, on by default (`apps/web/app/(auth)/login/login-form.tsx:63,168-177`), and Auth sets a 720 h timebox and a 168 h inactivity timeout (`supabase/config.toml:102-105`). Confirm the 24-hour figure against the code before publishing.
- No store listing exists yet, so there is no store privacy link to check (see §3.10).

### 3.4 No fake reviews, testimonials or invented schools — **PARTIAL**

- No testimonials, star ratings or customer logos in either repo. **OK.**
- **"Most schools" badge** on the Professional plan (`acadigma-website/src/components/sections/pricing.tsx:66`), plus "The complete platform. Most schools choose this." (`src/lib/regions.ts:113,197`). No school has chosen any plan yet: D-80 says "No real school is on production yet". This is unsubstantiated social proof, so remove it.
- FAQ heading "Asked by principals." (`pricing.tsx:161`) implies real principals asked these questions. Low severity; reword if they were not.
- Mock screens and the film use invented schools, students and figures ("Lincoln Middle School", `regions.ts:225`). The only "sample data" label is a code comment (`src/components/mocks/mocks.tsx:11`, `src/remotion/panels.tsx:4`). Add a visible "Sample data" caption.
- The campus demo school (D-80) is fictional, clearly named "Acadigma Demo School (ডেমো)", and uses `example.com` accounts. **OK**, as long as it is never presented as a customer.

### 3.5 AI capability claims substantiated — **FAIL (website), OK (demo script)**

The product has **no AI features**: no Anthropic SDK and no call site. PRICE-PROPOSAL §2 lists "all AI teaching tools" as not live (`PRICE-PROPOSAL.md:29`). The website nonetheless says:

- "Eight AI tools for teachers … ready in seconds" (`site.ts:65`; `features.tsx:202`) and "All 8 AI tools" / "3 AI tools" in plan features (`regions.ts:108,117,193,202`).
- "Notices typed from scratch → Drafted by AI in seconds" (`site.ts:203`).
- AI features for **students** ("Study tips based on weaker subjects", `site.ts:115`) and a parent "Weekly digest" (`site.ts:148,157`). A student-facing, performance-based recommender is the kind of profiling of minors that `COMPLIANCE-PDPA.md` §1.5 reports as prohibited or restricted.

`DEMO-SCRIPT.md` makes no AI claim and says "Say only what is on screen" (`:37`). **OK.**

The same problem extends beyond AI. The website tags as **"Live"**: "One-tap attendance with NFC and biometric support" (`site.ts:48`) and "Real-time attendance alerts" (`site.ts:140`). It also advertises a **Students app** for learners (`site.ts:99-130`) and the hero "Made for … students." (`hero.tsx:68`). No student accounts exist, and PRODUCT-DECISIONS §1.22 / COMPLIANCE P26 keep it that way. Printing, NFC, gate scanners and Ledger payroll do not exist either.

The **campus app's own landing page** (`apps/web/app/(marketing)/page.tsx:25-40,57`) promises "timetables", "online payment through bKash, Nagad, Rocket and cards" and "One thread per family". None of these is live (`PRICE-PROPOSAL.md:29`).

**Law, verified from primary source:** the Consumer Rights Protection Act 2009 (ভোক্তা-অধিকার সংরক্ষণ আইন, ২০০৯) treats "deceiving buyers by untrue or false advertisement to sell a product or service" as an anti-consumer act (s.2(20)(ঘ)). Section 44 makes it an offence punishable by up to 1 year's imprisonment, a fine up to ৳2 lakh, or both (bdlaws.minlaw.gov.bd/act-1014). **Whether it applies to us is uncertain:**

- The Act's "consumer" (s.2(19)) excludes buying for resale or commercial purposes, and a school buying software may fall outside it.
- Its "service" (s.2(22)) is a closed list (transport, telecom, water, power, health, etc.) that does not name software.

Counsel must say whether a school or parent is a "consumer" of Acadigma. Independently of that, a contract signed on the strength of website claims invites misrepresentation claims under the Contract Act 1872 (not verified here). The fix is cheap: label every unbuilt item "Coming" with no date, or remove it.

### 3.6 SDK / pixel / third-party inventory matched to the policy — **PARTIAL**

See §2.2. Good news: there are **no pixels, no ad SDKs, no analytics** and no runtime font CDN. Gaps:

1. **The email sender is unknown.** If production Auth still uses Supabase's built-in SMTP, that is Supabase (already listed). If it uses a custom SMTP, that vendor must be listed. Check the Supabase Auth → SMTP dashboard.
2. **WhatsApp/Meta** carries the child's name, the school context and a live access link (§2.2). The school's staff member sends it from their own WhatsApp, so the school is arguably the sender, but the product designs that flow. Either disclose it in the DPA and the school notice, or drop the child's name from the prefilled text.
3. **Sentry has no `beforeSend` scrubber and no route-based replay rule**, despite `COMPLIANCE-PDPA.md:489` and `OBSERVABILITY.md:163`. Replay is off simply because the integration is not added. Whether a DSN is set in production is **CAN'T TELL** (check the Vercel env var names only). Before a DSN goes live, add the scrubber the docs describe.
4. **`@vercel/otel` is registered unconditionally.** Spans carry route paths (UUIDs) to Vercel or any configured OTLP endpoint. That is low risk but should be named in the DPA ("Vercel: hosting, logs and traces").
5. **Health and financial data:** no health data exists yet. Staff blood group and staff compensation are sent to no third party beyond Supabase and Vercel. **OK.**
6. **The website waitlist lives in the campus production project** in a table no campus migration defines. That is schema drift, and marketing data is co-mingled with children's data under one project. It is outside `personal_data_map`, has no retention period, and no privacy notice was shown at collection. Move it to its own project, or at minimum record it in `DATA-MODEL.md` and the data map.

### 3.7 Biometrics — **OK in code, FAIL on the website**

There are no biometric columns, no camera capture and no face or fingerprint SDK. QR/NFC hardware does not exist. But the website says "**One-tap attendance with NFC and biometric support**", tagged **Live** (`acadigma-website/src/lib/site.ts:48`). That contradicts the owner's standing decision (D-27 item (4): "no biometrics ever"), the privacy-policy promise (`PRIVACY-POLICY-DRAFT.md` §4.7) and the §10.1 marketing claim "We hold no biometric data of children". **Remove "and biometric" today.** Also check whether any sales conversation has promised it.

### 3.8 Children's data: guardian consent, minimisation, retention — **FAIL on consent, OK on minimisation so far, PARTIAL on retention**

**Consent:**

- D-34 adopted "`consent_records` with the guardian invitation as consent of record" as **P0**. The table and its writer `app.record_consent` exist (`20260917010200_audit_and_files.sql:565-670`).
- The shipped guardian flow (D-108, `20260926065723_guardian_linking.sql`) **writes no consent row**. There is no call to `record_consent` anywhere except its own definition and a grant revoke (`20260926215147_security_audit_p2.sql:305`).
- The accept screen shows **no consent text**; `grep consent` in `apps/web/app/(auth)/invite/*` finds nothing.
- "The link itself is the credential — whoever holds it may accept" (`guardian_linking.sql:33-38`). A forwarded WhatsApp link therefore produces a "parent" who may not be the guardian. D-108 records this as a deliberate demo-cut deviation from F-ID-04 §4.2 step 4.
- **Consequence:** there is no record that any parent agreed to anything. This is fine for the fictional demo, but it must be closed before a real school invites real parents.
- **Fix:** the consent panel (COMPLIANCE §3.2), a `record_consent` call inside `accept_guardian_invitation`, and either phone-OTP binding or the `school_attested` assurance level shown honestly. The paper path (COMPLIANCE P6) matters most in the BD reality.

**The school's own lawful basis** for the student records it enters (admission) is the school's responsibility as fiduciary. The product has no per-school privacy-notice hook yet (COMPLIANCE P38).

**Minimisation:** **OK for students so far.** There are no NID or birth-certificate numbers, no scans, and no health or religion fields. DOB is split into a restricted table (`students_and_guardians.sql:93-107`). **Staff, however: `staff_records.nid_number` stores the full NID** (`staff_schema.sql:65,107-109`). It is masked in the UI and removed from audit rows, but it is self-editable (`:213`) and kept whole. This is not the "last-4 only" rule COMPLIANCE §4.1 and F-CM-02 apply to sellers, students and guardians. Decide: last-4, or a documented reason why the school needs the full number, such as payroll or tax filing.

**Retention:**

- Audit events purge after 7 years (`audit_substrate.sql:978-990`). **OK.**
- No other purge job exists for students (soft delete only), guardians, `email_log`, `auth_throttle` beyond its own cleanup, or `device_registrations`.
- There is no workspace-deletion purge (§3.9).
- The inconsistent ID-scan figure (14 versus 90 days, §3.3) needs one answer before any upload feature ships.

**Age handling:** `/register` asks for no DOB or age, so a minor can create a teacher/personal account, while the draft policy says "only adults sign in" (`PRIVACY-POLICY-DRAFT.md` §1, §13). The cheap fix is an "I am 18 or older" line on the register form, plus counsel's view on teachers under 18 (COMPLIANCE P23–P25).

**US COPPA does not apply** to the Bangladesh service. It covers operators of sites or services directed to children **under 13**, or with actual knowledge of collecting from them (15 U.S.C. §6501(1),(2), verified). Here children have no accounts, and the service is not directed to US children. **It would become relevant** if the US-region site's "Students app" were ever launched to US under-13s (§3.12). **The Bangladesh equivalent is the PDPA 2026's parental-consent rule for under-18s** (`COMPLIANCE-PDPA.md` §1.5, secondary sources only).

### 3.9 Subscription terms, cancellation, account/workspace deletion, export — **FAIL**

**Subscriptions:**

- The only billing that exists is the 30-day Pro trial, no card (`plans_and_notifications.sql:176`), shown before creation ("Your 30-day Pro trial starts now — no card required", `en.json:226`; `wizard.tsx:1341`). After the trial, the school becomes read-only, not charged (D-62; `api/cron/billing/tick/route.ts`). **This is fair: nothing auto-bills.**
- There is no checkout, no price shown in-app, no renewal or cancellation screen and no ToS.
- The notification text "Add a payment method to keep access" (`en.json:751`) promises a path that does not exist.
- Before the first paid invoice, a school must be shown the price, the billing interval, the renewal method (PRICE-PROPOSAL §5: invoice-and-pay, 7-day grace), and how to stop.
- The **paid pilot "auto-converting … unless the school opts out"** (`PRICE-PROPOSAL.md:37`) must be written into the LOI or contract with an opt-out date the school can see.

**Website pricing contradicts D-41/D-78** (`PRICE-PROPOSAL.md:9-21,45-46`):

| Term           | Website says                                                                                    | D-78 says                                              |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Starter        | ৳3,999/mo, ৳2,999 annual; 300 students (`regions.ts:105-108`)                                   | ৳2,200; 150 students                                   |
| Professional   | ৳6,599 / ৳4,999; unlimited students (`regions.ts:114-117`)                                      | Pro ৳4,900; 300 students                               |
| Founding offer | "Setup fee waived", "Founding rate kept for life" (`regions.ts:131-133`; `early-access.tsx:75`) | ৳15,000 onboarding "never waived"; 24-month price lock |
| Cancellation   | "Billed monthly, cancel anytime" (`pricing.tsx:93`)                                             | No cancellation mechanism exists                       |

A school that joins the waitlist on "rate for life, setup fee waived" has a documented expectation that contradicts the price list. Pick one list and publish it.

**Account deletion:** none. `/account/security` only changes the password. F-ID-01 Part 7 is queued (`F-ID-01-authentication.md:267`). Google Play requires apps that allow account creation to offer in-app and web deletion. Apple guideline 5.1.1(v) says the same (not re-verified here). This blocks the Capacitor Android app (ROADMAP M7, `ROADMAP.md:50`). There is also **no workspace (school) deletion** and **no data export**. `data_requests` and `personal_data_map` exist in the schema with no UI or writer (`packages/domain/src/audit/catalog.ts:600` is the only app reference).

**Store privacy labels:** **N/A until M7.** When the Android wrapper ships, the Play Data-safety form must reflect Sentry, push (FCM) and camera, if added.

### 3.10 Terms of service, refund and liability — **FAIL (none exist)**

There is no ToS draft in `docs/product/legal/`. The DPA draft covers processing, not commercial terms. The refundable ৳5,000 LOI deposit (`PRICE-PROPOSAL.md:48`) and the pilot terms need written refund terms. The Digital Commerce Operation Guidelines 2021 (Ministry of Commerce) may impose refund timelines on digital sales. We did **not verify** them or whether they cover B2B SaaS, so ask counsel.

### 3.11 Cross-border transfer disclosure (data in India) — **FAIL (nothing published), design OK**

The drafts disclose Mumbai honestly (`PRIVACY-POLICY-DRAFT.md` §7), and Vercel is pinned to `bom1` (`apps/web/vercel.json:3`). None of it is published. The Bengali "where your data lives" page required at R1 (`COMPLIANCE-PDPA.md` §5.5 item 1) does not exist. The localisation question (OQ-18, gate M6) remains the largest structural legal risk and is unchanged by this audit.

### 3.12 Jurisdiction and entity — **CAN'T TELL, flagged**

- The website says "Built in the USA & Bangladesh", publishes a **US phone/WhatsApp number** (`site.ts:12-13`), and serves a **US-region version** to every non-BD visitor (`regions.ts:10-16`).
- That version shows US prices and "Built around FERPA rules" (`regions.ts:165,220`). There is no FERPA work anywhere in the repo, which makes it an unsubstantiated compliance claim.
- It also publicly renders the developer note **"Placeholder US pricing. Replace the numbers in src/lib/regions.ts before you promote this page."** (`regions.ts:185`, rendered at `pricing.tsx:129`).
- If the contracting entity is (or includes) a US company, or US schools are solicited, US law comes into play for that activity: FTC Act §5 on deceptive claims, COPPA/FERPA and state student-privacy laws. The brief's premise of "Bangladesh-only" no longer holds.
- **Decide:** turn the US region off until it is a real offer, or scope it properly.

### 3.13 Security basics — **OK, with two gaps**

**OK:**

- Only publishable keys are exposed client-side (`NEXT_PUBLIC_SUPABASE_URL`, `…PUBLISHABLE_KEY`, `…SENTRY_DSN`, `…VERCEL_ENV`), and no service-role reference exists in any `.tsx`.
- gitleaks runs in CI (`.github/workflows/ci.yml:543`).
- RLS with pgTAP isolation and escalation tests is the stated and tested pattern.
- The CSP is **report-only** (`apps/web/next.config.ts:8,42`).
- A disclosure policy exists (`SECURITY.md`; `docs/engineering/SECURITY.md` §9).
- A breach plan exists on paper (`COMPLIANCE-PDPA.md` §7; `SECURITY.md` §7).

**Gaps:**

- The HaveIBeenPwned leaked-password check is **off** (`supabase/config.toml:85-87`, OQ-19 in F-ID-01).
- The `privacy@` and `security@` mailboxes (COMPLIANCE P37, P0) could not be confirmed to exist.
- There is no `/.well-known/security.txt` (`apps/web/public` has only `icons/`).

### 3.14 Trademark "Acadigma" (OQ-12) — **FAIL (not searched)**

`OWNER-QUESTIONS.md:45`: "Not searched". The brand is public on a website, social accounts and OG images. The Trademarks Act 2009 exists (bdlaws act-1010, located via the official index; sections not read). Run a DPDT (Bangladesh) and WIPO Global Brand Database search, then file, before spending more on the brand.

### 3.15 Font, image and open-source licences — **PARTIAL**

- **App fonts:** Inter, Hind Siliguri and JetBrains Mono are SIL OFL, self-hosted. PDF-embedded fonts ship with their licence files (`packages/pdf/assets/fonts/LICENSE-Inter.txt`, `OFL-HindSiliguri.txt`). **OK.**
- **App dependencies** (MIT/Apache family: Next, React, Supabase, pdfkit, fontkit, papaparse, read-excel-file, lucide) raise no copyleft issue for a hosted service. `"license": "UNLICENSED"` is correct for private code. **OK.**
- **Website uses Remotion** (`remotion`, `@remotion/player` in `acadigma-website/package.json`). Its licence allows free use only by individuals, non-profits and **for-profit organisations with up to 3 employees**; larger companies need a paid Company License (verified: `remotion-dev/remotion` `LICENSE.md`). Fine today if headcount ≤ 3. Buy a licence before hiring a fourth person, or replace the film with a pre-rendered video.
- **Website images:** only generated brand assets, no stock photos. **OK.**

### 3.16 Accessibility — **OK as engineering practice; legal duty CAN'T TELL**

WCAG-style gates are a binding engineering rule: axe clean, 44 px targets, contrast ≥ 4.5:1 (CLAUDE.md rule 12). We found no Bangladeshi statute that imposes a specific web-accessibility standard on private software, and verified none. The Rights and Protection of Persons with Disabilities Act 2013 is the general law to ask counsel about.

### 3.17 Tax on web payments — **CAN'T TELL (OQ-1 open)**

The company is not VAT-registered (`PRICE-PROPOSAL.md:58`, OQ-1), and invoices print a placeholder BIN. This must be answered before the first live invoice, including the ৳15,000 onboarding fee and the ৳5,000 deposit. The VAT and Supplementary Duty Act 2012 was not read.

### 3.18 Regulated features: payments, children's health data — **mostly N/A today**

- **Payments:** none live. The model (school as merchant of record for fees, Acadigma 0 %; bKash for Acadigma's own invoices) keeps Acadigma out of holding third-party funds. Whether routing school fees through school-owned gateway credentials needs any Bangladesh Bank or Payment and Settlement Systems approval on our side is a question for counsel (not verified).
- **Health data:** none stored yet. When it arrives it is sensitive data under the PDPA (`COMPLIANCE-PDPA.md` §1.6) and needs COMPLIANCE P29 (restricted roles) and the §5.5 localisation answer first.

---

## 4. Prioritised issue table

Severity:

- **Critical**: live and public, or a legal promise with no substance, and it contradicts a standing owner decision.
- **High**: blocks the first real school or the first paid invoice.
- **Medium**: fix before R1.
- **Low**: tidy-up.

| #   | Sev          | Item                                                                                                                          | Evidence                                                                                                  | Fix                                                                                                                           | Owner decision?                      |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | **Critical** | Website advertises "NFC and **biometric** support" as Live                                                                    | `acadigma-website/src/lib/site.ts:48`                                                                     | Delete "and biometric"; drop the "Live" tag                                                                                   | No (D-27 already decided)            |
| 2   | **Critical** | Website presents unbuilt features as the product (8 AI tools, Students app, real-time alerts, print engine, payroll, "FERPA") | `site.ts:48-65,84,99-160,203`; `regions.ts:108,117,165,220`; `hero.tsx:68`                                | Mark each as "Coming" or remove; remove "FERPA"; remove the student-facing AI recommender                                     | Yes: which items to show as "coming" |
| 3   | **High**     | Website prices and founding terms contradict D-78; "cancel anytime" with no mechanism                                         | `regions.ts:105-133`; `early-access.tsx:75`; `pricing.tsx:93`; vs `PRICE-PROPOSAL.md:9-21,45-46`          | Publish one price list; align founding terms; state the real cancellation terms                                               | **Yes**                              |
| 4   | **High**     | Sign-up requires agreeing to a ToS and Privacy Policy that do not exist; acceptance discarded                                 | `en.json:102`; `register-form.tsx:200-216`; `(auth)/actions.ts:92`                                        | Publish reviewed `/legal/privacy` + `/legal/terms` (bn + en); link them from the checkbox; write `legal_acceptances` (P9)     | Counsel review                       |
| 5   | **High**     | Guardian linking records no consent and shows no consent text; the link is a bearer credential                                | `20260926065723_guardian_linking.sql:33-38`; no `record_consent` caller; `(auth)/invite/*`                | Consent panel + `record_consent` in `accept_guardian_invitation`; paper path; honest assurance level (COMPLIANCE §3.2, P3–P6) | No (D-34), but a spec Part is needed |
| 6   | **High**     | No DPA acceptance in school creation                                                                                          | `onboarding/create-school/wizard.tsx`                                                                     | Blocking DPA step writing `legal_acceptances` (P8), after counsel reviews `DPA-DRAFT.md`                                      | Counsel review                       |
| 7   | **High**     | Campus landing page promises fees/bKash/Nagad/Rocket/cards, timetables, messaging                                             | `apps/web/app/(marketing)/page.tsx:25-40,57`                                                              | Rewrite to what is live (attendance, marks, results, report cards)                                                            | No                                   |
| 8   | **High**     | No account, workspace deletion, export or data-request UI                                                                     | `/account/security` only; `F-ID-01` Part 7 queued; `data_requests` unused                                 | Ship F-ID-01 Part 7 before any store app; add a "contact privacy@" route meanwhile                                            | Order in roadmap                     |
| 9   | **High**     | No ToS / commercial terms; pilot auto-renewal and the ৳5,000 deposit refund are unwritten                                     | `docs/product/legal/` has no ToS; `PRICE-PROPOSAL.md:37,48`                                               | Lawyer-drafted ToS / order form: price, renewal, cancellation, refund, liability cap                                          | Counsel                              |
| 10  | **High**     | Nothing published about data in Mumbai / US; localisation unresolved                                                          | no `/legal` routes; `COMPLIANCE-PDPA.md` §5.5                                                             | Publish the policy and the Bengali "where your data lives" page; get counsel's OQ-18 answer                                   | Counsel (OQ-18)                      |
| 11  | Medium       | Sub-processor list is wrong (Resend listed and unused; WhatsApp, OTel missing; real SMTP unknown)                             | `PRIVACY-POLICY-DRAFT.md:160`; `DPA-DRAFT.md:146,274`; `guardian-access.tsx:101-106`; `email-log.ts:6-15` | Check Supabase SMTP; correct both drafts; consider dropping the child's name from the WhatsApp text                           | No                                   |
| 12  | Medium       | Sentry `beforeSend` scrubber documented but absent                                                                            | `instrumentation-client.ts:7-13`; `instrumentation.ts:33-41`; `COMPLIANCE-PDPA.md:489`                    | Add the scrubber from `OBSERVABILITY.md:163` before any DSN is set in production                                              | No                                   |
| 13  | Medium       | Website waitlist: no notice or policy link; stored in the campus production DB, undocumented                                  | `waitlist-form.tsx:47-102`; `marketing_waitlist.sql`; `route.ts:27`                                       | One-line purpose + policy link; move to its own project or document it in `DATA-MODEL.md` + the data map                      | Yes (where it lives)                 |
| 14  | Medium       | US-region site: "Built around FERPA", US phone, placeholder-pricing note rendered publicly                                    | `regions.ts:165,185,220`; `pricing.tsx:129`; `site.ts:12-13`                                              | Disable the US region until it is real; settle the contracting entity                                                         | **Yes**                              |
| 15  | Medium       | Staff full NID stored and self-editable                                                                                       | `staff_schema.sql:65,107-109,213`                                                                         | Last-4 only, or record why the full number is needed                                                                          | Yes                                  |
| 16  | Medium       | ID-scan purge period inconsistent (14 v 90 days)                                                                              | `COMPLIANCE-PDPA.md:403,875`; `DECISION-LOG.md:255`; `PRIVACY-POLICY-DRAFT.md:276`                        | New decision entry superseding one of them before uploads ship                                                                | Yes                                  |
| 17  | Medium       | "Acadigma" trademark unsearched                                                                                               | `OWNER-QUESTIONS.md:45` (OQ-12)                                                                           | DPDT + WIPO search, then file                                                                                                 | Yes (budget)                         |
| 18  | Medium       | VAT/BIN unknown before the first invoice                                                                                      | `PRICE-PROPOSAL.md:58`; OQ-1                                                                              | Register or confirm exemption with a tax adviser                                                                              | Yes                                  |
| 19  | Medium       | No age gate at sign-up while the policy says "only adults sign in"                                                            | `register-form.tsx`; `PRIVACY-POLICY-DRAFT.md` §1, §13                                                    | "I am 18 or older" confirmation; counsel on under-18 teachers                                                                 | Counsel                              |
| 20  | Low          | "Most schools" badge / "Most schools choose this" with zero customers                                                         | `pricing.tsx:66`; `regions.ts:113,197`                                                                    | Remove until true                                                                                                             | No                                   |
| 21  | Low          | Mock screens and film lack a visible "sample data" label                                                                      | `mocks.tsx:11`; `panels.tsx:4` (comments only)                                                            | Add a caption                                                                                                                 | No                                   |
| 22  | Low          | Remotion company licence needed above 3 employees                                                                             | `acadigma-website/package.json`; Remotion `LICENSE.md`                                                    | Track headcount; buy a licence or pre-render the film                                                                         | Yes (at hire #4)                     |
| 23  | Low          | HIBP leaked-password check off; `privacy@`/`security@` unconfirmed; no `security.txt`                                         | `supabase/config.toml:85-87`; `apps/web/public/`                                                          | Enable in the dashboard; create the mailboxes; add `/.well-known/security.txt`                                                | No                                   |
| 24  | Low          | "Add a payment method to keep access" with no payment path                                                                    | `en.json:751`                                                                                             | Reword to "Contact us to continue" until checkout exists                                                                      | No                                   |

---

## 5. Questions for a Bangladeshi lawyer

`COMPLIANCE-PDPA.md` §11 already lists 14 PDPA questions; ask those first, starting with localisation (Q2). These are additional:

1. **Consumer law reach.** Is a private school, or a parent, a "consumer" of a B2B school SaaS under the Consumer Rights Protection Act 2009 s.2(19)? Does "service" in s.2(22) (a closed list) cover software? If not, what governs false or misleading advertising of software to businesses?
2. **Website claims already published** (biometrics, AI tools, "rate for life", setup fee waived). What exposure do they create towards waitlist schools, and does correcting them now cure it?
3. **Guardian consent.** Is a parent accepting a link sent by the school over WhatsApp, with a consent screen, sufficient "verifiable" consent under the PDPA? Is the school's paper consent form the stronger basis? What words must the form contain?
4. **WhatsApp as a delivery channel** for a message naming a child: who is responsible, the school or Acadigma, and does it need to be in the DPA's sub-processor list?
5. **Staff NID numbers.** May a school keep the full NID of its employees (payroll, tax, labour law), and is Acadigma holding it for the school a sensitive-data transfer issue given the Mumbai storage?
6. **Terms of service.** What must a Bangladeshi SaaS order form include on auto-renewal, cancellation, refunds of deposits and onboarding fees, liability caps and governing law? Do the Digital Commerce Operation Guidelines 2021 apply to B2B SaaS?
7. **Payments.** If schools collect fees through their own bKash/SSLCommerz merchant accounts using our software, does Acadigma need any Bangladesh Bank licence or registration (Payment and Settlement Systems Act / regulations)?
8. **VAT.** Is VAT due on subscriptions, the onboarding fee and the refundable deposit, and from which turnover threshold must Acadigma register?
9. **Entity and jurisdiction.** Given a US phone number and "Built in the USA & Bangladesh", which entity should contract with schools, and which country's law should govern? What changes if a US entity exists?
10. **SMS.** What BTRC rules govern reminder and promotional SMS (sender ID masking, consent, opt-out, time-of-day), and does a school-initiated fee reminder count as promotional?
11. **Minors as users.** May a person under 18 hold a teacher or personal account, and what must the sign-up ask?
12. **Trademark.** Is "Acadigma" registrable in Class 9/41/42 in Bangladesh, and should we also file via Madrid?

---

## 6. Information gaps (to close before the next audit)

| Gap                                                                                                              | Where to look                                 | Who     |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| Supabase production: region, Auth SMTP provider, HIBP setting, whether PITR/backups hold data outside ap-south-1 | Supabase dashboard (project `acadigma-suite`) | Owner   |
| Whether a Sentry DSN is set in production and the Sentry org's data region                                       | Vercel env var **names**; Sentry org settings | Owner   |
| Vercel analytics, log drains, OTel exporter configured for either project                                        | Vercel dashboard                              | Owner   |
| Signed vendor DPAs: Supabase, Vercel, Sentry, Anthropic (zero-retention request, COMPLIANCE §5.2)                | Vendor accounts                               | Owner   |
| Legal entity, incorporation country, trade licence, BIN, headcount                                               | Company records                               | Owner   |
| What LOIs, decks and WhatsApp sales messages have promised (biometrics, AI, prices)                              | Sales folder                                  | Owner   |
| Deployed acadigma.com commit (does live copy match `ec4f8ba`?)                                                   | Vercel deployment for the website             | Owner   |
| The gazetted PDPA 2026 text                                                                                      | Counsel                                       | Counsel |
| Whether `privacy@` / `security@acadigma.com` exist and are monitored                                             | Mail provider                                 | Owner   |

---

## 7. Method and sources

**Method:**

- Grep and read of both repos at the commits above.
- File and line citations were taken from those exact commits; the `acadigma-website` repo is a separate checkout at `F:\Acadigma Suite\acadigma-website`.
- **No live system was queried.**

**Legal sources read by this audit:**

- Consumer Rights Protection Act 2009, full Bengali text: http://bdlaws.minlaw.gov.bd/act-print-1014.html (ss.2(19), 2(20)(ঘ), 2(22), 44).
- 15 U.S.C. §6501 (COPPA definitions): https://www.law.cornell.edu/uscode/text/15/6501
- Remotion licence: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md

**Not read, only named** (so counsel can check them):

- Trademarks Act 2009 (bdlaws act-1010).
- VAT and Supplementary Duty Act 2012.
- Digital Commerce Operation Guidelines 2021.
- Payment and Settlement Systems Act.
- Rights and Protection of Persons with Disabilities Act 2013.
- BTRC SMS rules.
- Contract Act 1872.
- Google Play and Apple account-deletion policies.

Every PDPA 2026 statement relies on `COMPLIANCE-PDPA.md` and its secondary sources.

_Not legal advice. For review by a qualified Bangladeshi lawyer._
