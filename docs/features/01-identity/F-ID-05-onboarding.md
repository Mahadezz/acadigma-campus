# F-ID-05 — Onboarding

|                  |                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Area             | auth                                                                                                                                                   |
| Status           | planned                                                                                                                                                |
| Owner branch     | `feat/identity-onboarding`                                                                                                                             |
| Depends on       | F-ID-01, F-ID-03, F-ID-04                                                                                                                              |
| Plan             | `docs/plan/ROADMAP.md` chunk 1                                                                                                                         |
| Base44 reference | `docs/reference/base44-inventory/01-auth-tenancy-personal.md` §3 rows 11–16; §4.1–4.3; §5.1 B14, B17; §5.3 W16; §7.3 (Welcome.jsx's off-system design) |

## 1. Purpose

The ninety seconds between "I just made an account" and "I am looking at my school". Onboarding owns the auto-created personal workspace, the choice between **creating a school** and **joining one with a code**, the school-creation wizard (name, EIIN, board, timezone, working days, academic year, grade levels), and the decision about which shell the user is dropped into at the end. "Done" from the user's chair: a principal in Rajshahi who has never used a school system before goes from a verification email to a working school with Class 6–10 set up, on her phone, without calling anyone.

The Base44 prototype had the shape and none of the wiring. Registration created a personal workspace inside a swallowed `try/catch`, so a silent failure left an account with no workspace at all; the onboarding screen **still offered "Personal Workspace"**, so a teacher who chose it ended up with two (inventory Q2). All three entry points disagreed on where to land — login sent teachers to `/personal`, registration sent them to `/`, and the onboarding personal branch also went to `/`, meaning a personal-only teacher stared at an empty school dashboard (W16). The create-school wizard collected name, logo and a few preferences but no EIIN, no board, no academic year and no grade levels, so every downstream academic feature started from zero. "You can add a logo later in Settings" was false (B14). The join-with-code path ended on a screen whose only button was **Sign Out**, and nothing notified the admin. And `Welcome.jsx` was written in a completely separate design language — hardcoded `#040916`, drifting blurred orbs, always dark, ignoring every design token (§7.3). The rebuild deletes the third option, fixes the landing logic, makes the wizard produce a school that actually works, and uses the design system.

## 2. Roles and permissions

Onboarding runs before a role exists, so permissions are about account state, not workspace role.

| Action                                 | Signed-out    | Signed in, unverified                     | Signed in, verified, 0 school memberships | Signed in with ≥1 school membership                 | Platform staff |
| -------------------------------------- | ------------- | ----------------------------------------- | ----------------------------------------- | --------------------------------------------------- | -------------- |
| See `/onboarding`                      | ❌ → `/login` | ❌ → `/verify`                            | ✅                                        | ✅ (reachable from the switcher's "Create or join") | ✅             |
| Get an auto-created personal workspace | —             | ✅ (at registration, before verification) | already has one                           | already has one                                     | ✅             |
| Create a school workspace              | ❌            | ❌                                        | ✅ (becomes `owner`)                      | ✅ (up to the limit)                                | ✅             |
| Join a school with a code              | ❌            | ❌                                        | ✅                                        | ✅                                                  | ✅             |
| Skip onboarding                        | —             | —                                         | ✅ → `/personal`                          | ✅                                                  | ✅             |
| Be forced through onboarding           | —             | —                                         | only on first sign-in after registration  | never                                               | never          |

Permission keys involved once a workspace exists: `workspace.settings.write` (the wizard writes `school_profiles`), `members.approve` (the other side of a code join, F-ID-03).

## 3. Data

Tenant key: rows created here all carry `workspace_id`. This feature creates no tables of its own except a small progress record. Columns **proposed; DATA-MODEL.md wins**.

Tables written: `workspaces`, `school_profiles`, `workspace_members`, `workspace_join_codes`, `grade_levels`, `academic_years`, `profiles.onboarding_completed_at`, `subscriptions` (the 14-day Pro trial, PRODUCT-DECISIONS §5.2), `id_counters`, `audit_events`.

**`onboarding_progress`** (proposed; DATA-MODEL.md wins) — one row per user, so a wizard abandoned on a bus can be resumed on a laptop:

| column                                     | type                   | notes                                                                                                        |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `user_id`                                  | uuid PK FK profiles    |                                                                                                              |
| `path`                                     | enum `onboarding_path` | `undecided \| create_school \| join_school`                                                                  |
| `step`                                     | smallint               | 1–5                                                                                                          |
| `draft`                                    | jsonb                  | the partially filled wizard payload, validated against the same Zod schema on resume; never contains secrets |
| `started_at`, `updated_at`, `completed_at` | timestamptz            |                                                                                                              |

RLS: select/insert/update where `user_id = app.current_user_id()`; no delete grant (the row is cleared by setting `completed_at` and nulling `draft`); platform staff may read for support.

**`grade_levels`** (owned by the academic area, seeded here): `id`, `workspace_id`, `name` (`Class 6`), `name_bn` (`ষষ্ঠ শ্রেণি`), `level_order` smallint, `stage` enum (`primary|junior|secondary|higher_secondary`), `is_active`. Unique `(workspace_id, lower(name))`.

**`academic_years`** (academic area, seeded here): `id`, `workspace_id`, `name` (`2026`), `starts_on`, `ends_on`, `is_current`. Exactly one `is_current` per workspace (partial unique).

RLS for everything else is as defined in F-ID-03 §3 — this feature introduces no new policy patterns, which is deliberate: onboarding is the first thing a user touches and the last place to invent a special case.

## 4. Workflows

### 4.1 Registration creates the personal workspace — always, exactly one

**Trigger:** a successful `auth.users` insert (F-ID-01 §4.1).

The `handle_new_user()` trigger runs in the **same transaction** as the account creation and does four things: insert `profiles`, insert `user_preferences` with defaults, insert `workspaces{type:'personal', name:"{full_name}'s workspace"}`, insert `workspace_members{role:'owner', status:'active', joined_at:now()}`. A partial unique index on `workspaces(created_by) where type='personal'` guarantees "exactly one, ever" (PRODUCT-DECISIONS §1.2).

**Outcome:** no account can exist without a personal workspace — the prototype's swallowed-catch orphan is impossible by construction.
**Audit:** `workspace.created` with `source='registration'`.
**Failure case:** if the trigger raises, the whole signup rolls back and the user sees a retryable error rather than a broken half-account.

### 4.2 The onboarding chooser

**Trigger:** first sign-in after verification when `profiles.onboarding_completed_at is null`, or the switcher's "Create or join a workspace".

`/onboarding` presents **exactly two cards** — the third ("Personal Workspace") is gone because you already have one (PRODUCT-DECISIONS §1.2):

1. **Create a school** — "Set up your school, invite your teachers, start taking attendance." Sub-line: "You'll be the owner. 14-day Pro trial, no card needed."
2. **Join a school** — "Your school already uses Acadigma? Enter the code they gave you."

Below them, a quiet third affordance: **"I'm tutoring on my own — take me to my personal workspace"**, which sets `onboarding_completed_at` and routes to `/personal`. It is a text link, not a card, because it is an exit rather than a setup path.

A user who already has memberships sees the same two cards plus a "Back to {current workspace}" link.

**Phone layout:** two stacked cards, each 120 px tall with an icon, a title and one line; both fully within thumb reach; no horizontal scroll, no carousel. Uses the design system's tokens — the prototype's bespoke dark marketing page with drifting orbs is not rebuilt; `/` (marketing) keeps that job.

### 4.3 Create a school — the wizard

**Route:** `/onboarding/create-school`. Five steps, each a full screen at 360×800 with a progress bar and a persistent back affordance; on desktop the same steps render inside a 640 px card with a step rail on the left. Every step saves to `onboarding_progress.draft` on advance, so closing the browser loses nothing.

**Step 1 — Identity.** School name (required), EIIN (optional, 6 digits, with a "What's this?" helper explaining it is the government's school identifier and can be added later), school type/medium (Bangla / English version / English medium / Madrasah), and the board select (Dhaka, Chattogram, Rajshahi, Khulna, Barishal, Sylhet, Rangpur, Mymensingh, Madrasah, Technical, Cambridge, Edexcel, IB, Other). Board defaults from nothing — it is a deliberate choice because grading and report cards depend on it.

**Step 2 — Where and when.** Timezone (defaulted to `Asia/Dhaka`, detected from the browser as a suggestion only), working days as a seven-chip row **starting Saturday** with Sat–Thu preselected (PRODUCT-DECISIONS §2.5), and the academic year: a name (defaulted to the current calendar year) with start and end dates (defaulted 1 Jan – 31 Dec, adjustable). One line of help explains that attendance and timetables use these.

**Step 3 — Classes.** Grade levels as a multi-select of presets — **Class 1–5**, **Class 6–10**, **Class 11–12 (HSC)**, plus individual chips for each of Class 1…12, Play/Nursery/KG, and O-Level/A-Level for English-medium schools. A "Add your own" field appends a custom level. The selection produces `grade_levels` rows with `level_order` and Bangla names from a bundled map. Sections are **not** created here — the academic area's setup does that, and the completion screen links to it.

**Step 4 — Logo (skippable).** Upload or skip. The copy says "You can add this later in Settings → Workspace" **and that is true**, because F-ID-03 §4.10 provides the field (fixing prototype B14).

**Step 5 — Review and create.** A summary card of everything, an explicit "14-day Pro trial starts now — no card required" line, and the primary button **Create school**.

**On submit:** `createSchoolWorkspace` runs one transaction — `workspaces` (+ `short_code` from `app.next_id`) → `school_profiles` → `workspace_members{owner, active}` → `academic_years{is_current:true}` → `grade_levels[]` → `workspace_join_codes` (active, `default_role='teacher'`) → `subscriptions{plan:'pro', status:'trialing', trial_ends_at: now()+14 days}` → `profiles.onboarding_completed_at` → `acx_ws` cookie set to the new workspace.

**Outcome:** the user lands on `/app` with a **first-run checklist** card pinned at the top of the dashboard: _Invite your teachers · Add students · Create sections · Set up your timetable_ — each linking to the owning feature, each disappearing as it is done, the whole card dismissible. This is the handover to every other area.
**Notifications:** none (no one else exists yet).
**Audit:** `workspace.created`, `school_profile.created`, `academic_year.created`, `grade_levels.seeded`, `join_code.created`, `subscription.trial_started`.
**Failure cases:** the EIIN is already registered to another school → step 1 shows an inline error and a "This is my school — contact support" link (an EIIN collision is either a typo or a duplicate school and must not be silently allowed); a network failure on submit → the idempotency key makes a retry safe and never creates two schools; three schools created in a day by one user → `RATE_LIMITED` (anti-abuse).

### 4.4 Join a school with a code

**Route:** `/onboarding/join`. This is F-ID-04 §4.4 rendered inside the onboarding shell: the code field → confirmation card → request → the pending status screen with **"Go to my personal workspace"** as the primary action. `onboarding_completed_at` is set at this point, because the user has finished what they came to do; the pending membership lives on independently.

When the admin approves, the joiner receives `join_request.approved` with an `action_url` to `/app`; opening it switches the active workspace automatically.

### 4.5 Landing shell resolution after onboarding

Every exit from onboarding calls `resolveLandingRoute()` (F-ID-03 §4.4) rather than hardcoding a path. Concretely:

| Exit                                     | Lands on                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Created a school                         | `/app` (as `owner`) with the first-run checklist                         |
| Joined with a code (pending)             | `/personal` with a "Waiting for {school}" card                           |
| Chose "I'm tutoring on my own"           | `/personal`                                                              |
| Accepted an invitation instead (F-ID-04) | that school's `/app`, or `/family` if the invitation was `role='parent'` |
| Signed in later with memberships         | last-used → default → first active                                       |

The three contradictory redirects in the prototype are replaced by this one function, which is unit-tested as a matrix.

### 4.6 Re-entering onboarding later

A user with memberships can always reach `/onboarding` from the workspace switcher. It behaves identically except that "Back" returns to the current workspace and the personal-workspace exit link is hidden (they already have one). `onboarding_completed_at` is not cleared.

### 4.7 Abandonment and resume

If the user leaves mid-wizard, `onboarding_progress` keeps `path`, `step` and `draft`. Returning to `/onboarding` shows "Continue setting up {draft name}" as the primary card with a "Start over" secondary. Drafts older than 30 days are cleared by the nightly job. No notifications, no nagging emails in v1.

## 5. Business rules and calculations

| Rule                             | Value                                                                                                                                                         | Where                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Personal workspaces per user     | exactly 1, enforced by a partial unique index; created at registration, never offered again                                                                   | migration + `createPersonalWorkspace`       |
| Personal workspace name          | `"{full_name}'s workspace"`, renameable afterwards                                                                                                            | `handle_new_user()`                         |
| Schools created per user per day | 3                                                                                                                                                             | `auth_throttle`                             |
| Active memberships per user      | soft cap 20 (F-ID-03 §5)                                                                                                                                      | `packages/domain/workspace/limits.ts`       |
| EIIN                             | optional; if present, exactly 6 digits and unique across the platform                                                                                         | `packages/contracts/src/identity/school.ts` |
| Board                            | required; drives the default grade scale (PRODUCT-DECISIONS §2.4) and report-card layout                                                                      | `school_profiles.board`                     |
| Timezone default                 | `Asia/Dhaka`; the browser's timezone is offered as a suggestion chip, never silently applied                                                                  | `packages/domain/time/timezones.ts`         |
| Working days default             | Sat, Sun, Mon, Tue, Wed, Thu; the picker always starts the week on Saturday                                                                                   | `school_profiles.working_days`              |
| `first_day_of_week`              | derived as the first selected day in Sat-first order                                                                                                          | trigger on `school_profiles`                |
| Academic year default            | current calendar year, 1 Jan – 31 Dec; must be 1–730 days and `ends_on > starts_on`; exactly one `is_current` per workspace                                   | `packages/domain/academic/year.ts`          |
| Grade-level presets              | Play, Nursery, KG, Class 1…12, O-Level, A-Level, plus custom; `level_order` assigned from a canonical ordering map so `Class 10` always sorts after `Class 9` | `packages/domain/academic/gradeLevels.ts`   |
| Bangla names                     | bundled map for every preset (`Class 6` → `ষষ্ঠ শ্রেণি`); custom levels get the same string in both fields until edited                                       | same                                        |
| Trial                            | 14 days of Pro, no card; at expiry → Free with over-limit data read-only (PRODUCT-DECISIONS §5.2)                                                             | billing area, triggered here                |
| Wizard draft retention           | 30 days                                                                                                                                                       | nightly `jobs` sweep                        |
| Onboarding completion            | `onboarding_completed_at` is set on **any** exit, including the personal-workspace exit and a pending join                                                    | `completeOnboarding`                        |
| Idempotency                      | `createSchoolWorkspace` requires an `idempotency_key` minted when the wizard is opened, so a double submit or a retry creates one school                      | `idempotency_keys`                          |
| First-run checklist              | four items, computed live from real counts (members > 1, students > 0, sections > 0, timetable slots > 0) — never a stored boolean, so it cannot lie          | `packages/domain/onboarding/checklist.ts`   |

## 6. UI

Components: `OnboardingShell` (progress bar + back + step title), `ChoiceCard`, `FormSheet` fields rendered inline (the wizard uses full screens, not sheets), `SegmentedControl`, `ChipMultiSelect`, `DayPickerRow`, `DateField`, `LogoUploader`, `ReviewCard`, `CodeInput`, `ChecklistCard`, `EmptyState`, `Banner`.

| Screen / route                              | 360×800                                                                                                                                             | ≥1024                                                                         | Primary action              | Empty                                      | Loading                                                         | Error                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------- | ------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Chooser — `/onboarding`                     | Two stacked `ChoiceCard`s (icon, title, one line), the tutoring text link below, the account menu top-right; no orbs, all tokens                    | Both cards side by side in a 720 px container with an illustration band above | Create a school             | n/a                                        | Cards render instantly (server component)                       | Full-width `InlineAlert` if the membership query fails, with retry                      |
| Wizard step 1 — `/onboarding/create-school` | Progress bar (1 of 5) pinned under the header; fields stacked; the board select opens a searchable sheet; sticky **Continue**                       | 640 px card with a left step rail; same fields                                | Continue                    | n/a                                        | Field skeletons on resume                                       | Inline per field; EIIN collision gets its own message + support link                    |
| Wizard step 2                               | Timezone select + a "Use Asia/Dhaka" suggestion chip; the 7-day chip row wraps to two lines at 360 px and stays 44 px tall; two date fields stacked | Same in one column, dates side by side                                        | Continue                    | n/a                                        | skeleton                                                        | inline; invalid date range blocks Continue with a reason                                |
| Wizard step 3                               | Preset chips in a wrap grid, then individual class chips; a live count ("8 classes selected"); "Add your own" as the last chip                      | Same with a wider grid                                                        | Continue                    | "Pick at least one" blocks Continue        | skeleton                                                        | inline                                                                                  |
| Wizard step 4                               | Logo dropzone with a camera/gallery picker; a big **Skip for now** text button under it                                                             | Same at 480 px                                                                | Upload / Skip               | n/a                                        | upload progress ring                                            | inline upload error, never blocking                                                     |
| Wizard step 5                               | A `ReviewCard` per section with an Edit link that jumps back; the trial line; sticky **Create school**                                              | Same in the card                                                              | Create school               | n/a                                        | Button spinner with "Setting up your school…" and a step ticker | A single `InlineAlert` naming the failed step; the draft is preserved and retry is safe |
| Join — `/onboarding/join`                   | Large `CodeInput`, help text ("Ask your school admin — it looks like ACD-4K2P-9XQ7"), Continue                                                      | Centred 420 px card                                                           | Continue                    | n/a                                        | button spinner                                                  | Uniform "That code isn't valid"; throttle countdown                                     |
| Join confirm                                | School logo + name card, role line, **Request to join**                                                                                             | Same                                                                          | Request to join             | n/a                                        | spinner                                                         | inline                                                                                  |
| Pending status                              | Clock illustration, school name, one paragraph, **Go to my personal workspace**, "Cancel request" text link                                         | Centred card                                                                  | Go to my personal workspace | n/a                                        | —                                                               | —                                                                                       |
| First-run checklist (on `/app`)             | A card at the top of the dashboard, four rows with tick circles, each row tappable, a dismiss `×`                                                   | Same card spanning the first dashboard column                                 | Invite your teachers        | Disappears entirely when all four are done | row skeletons                                                   | row shows "couldn't check" rather than a false tick                                     |

Accessibility: the progress bar is `role="progressbar"` with `aria-valuenow`; each step's `<h1>` changes and receives focus on navigation so screen-reader users hear where they are; the day-chip row is a labelled checkbox group; nothing in the wizard relies on colour alone.

## 7. Server contracts

Schemas in `packages/contracts/src/identity/onboarding.ts` and `.../school.ts`. Actions in `apps/web/app/(onboarding)/actions.ts`.

| Action / handler                                             | Input schema                                                                                                                                                                                                                                           | Output                                                                 | Errors                                                                                                             | Idempotency                                         | Rate limit                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------- |
| `getOnboardingState`                                         | `GetOnboardingStateInput` {}                                                                                                                                                                                                                           | `{ path, step, draft, memberships: MembershipSummary[], completedAt }` | `UNAUTHENTICATED`                                                                                                  | n/a                                                 | 120/min                                                 |
| `saveOnboardingDraft`                                        | `SaveOnboardingDraftInput` {path, step, draft: `CreateSchoolDraft` (all fields optional)}                                                                                                                                                              | `{ savedAt }`                                                          | `VALIDATION`                                                                                                       | last write wins                                     | 120/h                                                   |
| `createSchoolWorkspace`                                      | `CreateSchoolWorkspaceInput` {name 2–120, eiin?: /^\d{6}$/, board, medium, timezone (IANA), working_days: int[1..7], academic_year: {name, starts_on, ends_on}, grade_levels: {name, name_bn?, level_order, stage}[1..30], logo_url?, idempotency_key} | `{ workspace, landingRoute: '/app' }`                                  | `VALIDATION`, `EIIN_TAKEN`, `INVALID_TIMEZONE`, `INVALID_ACADEMIC_YEAR`, `RATE_LIMITED`, `WORKSPACE_LIMIT_REACHED` | key required; replay returns the original workspace | 3/day per user                                          |
| `completeOnboarding`                                         | `CompleteOnboardingInput` {exit: 'personal' \| 'created' \| 'joined'}                                                                                                                                                                                  | `{ landingRoute }`                                                     | `UNAUTHENTICATED`                                                                                                  | idempotent                                          | 20/h                                                    |
| `getFirstRunChecklist`                                       | `ChecklistInput` {}                                                                                                                                                                                                                                    | `{ items: {key, done, href, label}[] , dismissed }`                    | `FORBIDDEN`                                                                                                        | n/a                                                 | 60/min                                                  |
| `dismissFirstRunChecklist`                                   | `DismissChecklistInput` {}                                                                                                                                                                                                                             | `{ ok: true }`                                                         | —                                                                                                                  | idempotent                                          | 10/h                                                    |
| `lookupJoinCode`, `requestJoinWithCode`, `cancelJoinRequest` | —                                                                                                                                                                                                                                                      | —                                                                      | —                                                                                                                  | —                                                   | defined in F-ID-04 §7; onboarding reuses them unchanged |
| `POST /api/jobs/onboarding-drafts` (cron)                    | —                                                                                                                                                                                                                                                      | `{ cleared: n }`                                                       | —                                                                                                                  | idempotent                                          | daily                                                   |

`createSchoolWorkspace` is one database function (`app.create_school_workspace(jsonb)`) called by the action so the eight inserts share a transaction and a single `correlation_id` in the audit trail.

## 8. Parts (build chunks)

**Part 1 — Auto personal workspace at registration** · Extend `handle_new_user()` to create `workspaces` + `workspace_members` + `user_preferences` in the signup transaction; the partial unique index; `workspace.created` audit; remove any notion of a user-triggered personal-workspace creation. · Files: `supabase/migrations/*_handle_new_user.sql`. · Tests: pgTAP — a signup produces exactly one personal workspace with one `owner` member; a forced trigger failure rolls back the whole signup; a second personal workspace insert is rejected by the index. · **Demo:** register a new account and show the three rows in psql, then show the index rejecting a duplicate.

**Part 2 — Onboarding shell, chooser and state** · `/onboarding` route group, `OnboardingShell`, the two `ChoiceCard`s, the tutoring exit link, `onboarding_progress` table + RLS, `getOnboardingState`, `saveOnboardingDraft`, `completeOnboarding`, the forced-onboarding redirect for `onboarding_completed_at is null`. · Tests: redirect matrix (signed out / unverified / no membership / has membership), draft round-trip, axe. · **Demo:** a fresh account is taken to the chooser after verifying; choosing the tutoring exit lands on `/personal` and never returns to onboarding.

**Part 3 — Create-school wizard, steps 1–2** · Identity and Where-and-when steps, board and medium enums, EIIN validation and uniqueness check, timezone list, the Sat-first day picker, academic-year fields and validation, draft persistence between steps. · Tests: unit tests for the year validator and `first_day_of_week` derivation; integration test for `EIIN_TAKEN`; e2e resume-after-reload at 360×800. · **Demo:** fill two steps on a phone, kill the tab, reopen — the draft is there.

**Part 4 — Wizard steps 3–5 and the create transaction** · Grade-level presets with the Bangla name map and ordering, logo step, review step, `app.create_school_workspace` transaction (workspace, school profile, owner membership, academic year, grade levels, join code, trial subscription, short code), idempotency, the audit fan-out. · Tests: a transaction test asserting all-or-nothing under an injected failure at each insert; idempotency replay; grade-level ordering unit tests; e2e create-a-school journey at both viewports. · **Demo:** create "Ideal School & College" on a phone with Class 6–10 and watch every row appear in one correlated audit group.

**Part 5 — Join path, landing resolution and the first-run checklist** · `/onboarding/join` reusing F-ID-04's actions, the non-dead-end pending screen, `resolveLandingRoute` wired into every onboarding exit, the live first-run checklist and its dismissal. · Tests: the landing-route matrix as a unit test; e2e join-then-approve showing the joiner's shell switch; a checklist test proving each item reflects a real count. · **Demo:** two devices — a teacher joins with a code on a phone, the owner approves on a laptop, the teacher's notification opens straight into `/app`.

## 9. Acceptance criteria

1. **Given** a brand-new registration, **when** the account is created, **then** exactly one `workspaces` row with `type='personal'` and one `workspace_members{role:'owner',status:'active'}` row exist, created in the same transaction as the account.
2. **Given** a forced failure inside `handle_new_user()`, **when** signup runs, **then** no `auth.users` row survives and the user sees a retryable error — never an account without a workspace.
3. **Given** a verified user with no school membership, **when** they sign in for the first time, **then** they are routed to `/onboarding` and see exactly two cards: Create a school and Join a school — no "Personal Workspace" option.
4. **Given** the onboarding chooser at 360×800, **when** the page renders, **then** every element uses design-system tokens (no hardcoded hex), the page respects light and dark mode, and both cards are within the bottom two-thirds of the screen.
5. **Given** a user mid-wizard at step 3, **when** they close the browser and return the next day, **then** the chooser offers "Continue setting up {name}" and the wizard resumes at step 3 with the draft intact.
6. **Given** an EIIN already registered to another school, **when** step 1 is submitted, **then** an inline error names the collision and the wizard does not advance.
7. **Given** a completed wizard, **when** **Create school** is pressed, **then** in one transaction the workspace, school profile, owner membership, current academic year, the selected grade levels, an active join code, a short code and a 14-day Pro trial all exist, sharing one `correlation_id` in `audit_events`.
8. **Given** the create submission fails after the workspace insert, **when** the transaction rolls back, **then** no partial school exists and pressing Create again with the same idempotency key produces exactly one school.
9. **Given** a school created with "Class 6–10", **when** the academic area reads `grade_levels`, **then** there are five rows ordered `Class 6 … Class 10` with Bangla names populated.
10. **Given** a newly created school, **when** the owner lands on `/app`, **then** the first-run checklist shows four items computed from live counts, and ticking one off (e.g. inviting a teacher) updates the card without a stored flag.
11. **Given** a user who chooses "I'm tutoring on my own", **when** they continue, **then** `onboarding_completed_at` is set, they land on `/personal`, and signing in later never forces onboarding again.
12. **Given** a user who joins with a code, **when** the request is created, **then** `onboarding_completed_at` is set, they land on the pending screen whose primary button goes to `/personal`, and owners/admins have a `join_request.received` notification.
13. **Given** a pending joiner, **when** an admin approves them, **then** their `join_request.approved` notification's `action_url` opens `/app` with that school already the active workspace.
14. **Given** a user whose only workspace is personal, **when** they navigate directly to `/app/dashboard` at any time, **then** they are redirected to `/personal` — the prototype's empty-school-dashboard bug does not occur.
15. **Given** the working-days picker, **when** it renders in any locale, **then** the week starts on Saturday and Sat–Thu are preselected.
16. **Given** a user who has created three schools today, **when** they try a fourth, **then** `RATE_LIMITED` is returned with a support contact line.

## 10. Tests

- **Unit:** `resolveLandingRoute` matrix (every exit × membership state); academic-year validator; `gradeLevels` ordering and Bangla mapping; `first_day_of_week` derivation from an arbitrary working-day set; EIIN format; timezone allow-list; `checklist` computation from counts.
- **DB (pgTAP):** `handle_new_user` atomicity; the one-personal-workspace index; `app.create_school_workspace` all-or-nothing with an injected failure at each of the eight inserts; exactly one `is_current` academic year; `onboarding_progress` cross-user isolation and no-delete grant; the new owner's membership satisfies `app.has_role(ws,'{owner}')` immediately.
- **Integration:** `createSchoolWorkspace` for every named error; idempotency-key replay; `saveOnboardingDraft` schema tolerance (a partially filled draft never fails validation); `completeOnboarding` idempotency.
- **E2E (360×800 and 1280×800):** `register-to-school-in-one-session` (the full funnel: register → verify → chooser → wizard → `/app` with the checklist), `wizard-resume-after-reload`, `join-with-code-and-get-approved` (two contexts), `tutoring-exit-to-personal`, `personal-only-user-cannot-see-app-shell`.
- **A11y:** axe on the chooser and all five wizard steps; keyboard-only completion of the whole wizard; the step heading receives focus on each transition; the day-chip group is operable with arrow keys.
- **Performance budgets:** the full funnel from chooser to `/app` is ≤ 6 interactions on a phone; each wizard step's TTI ≤ 1.5 s on simulated 3G; `app.create_school_workspace` p95 ≤ 600 ms; the chooser is a server component shipping < 25 KB of JS.
- **Content:** a copy review test that no screen in this feature contains "School Troop", "TeachFlow" or "Print Box" (PRODUCT-DECISIONS §1.18), and that every promise made in the wizard's copy ("add a logo later in Settings") maps to a real, reachable screen.

## 11. Open questions

- **OQ-1: sections during onboarding.** The wizard creates grade levels but not sections; PRODUCT-DECISIONS §2.3 makes sections the enrolment unit, so a school is not usable until they exist. **Default assumed:** the first-run checklist drives the owner into the academic area's section setup immediately after creation; adding a sixth wizard step is rejected because it would double the wizard's length for a screen the academic area already owns. Academic-area spec to confirm the handover point.
- **OQ-2: grade-level presets for English-medium and madrasah schools.** **Default assumed:** the preset list includes Play/Nursery/KG, Class 1–12, O-Level and A-Level, plus free-text custom entries; madrasah stages (Ebtedayee/Dakhil/Alim) are added as presets when the board is `madrasah`. Owner to confirm the madrasah naming.
- **OQ-3: EIIN uniqueness.** Treating EIIN as globally unique blocks the legitimate case of a school re-registering after abandoning an old workspace. **Default assumed:** unique, with a support path; platform staff can release an EIIN from an archived workspace (F-ID-08).
- **OQ-4: trial start.** PRODUCT-DECISIONS §5.2 says the trial starts "on school creation". **Default assumed:** exactly that, and the trial is not restarted by creating a second school under the same owner — a per-owner anti-abuse check that the billing area must own. Flagged for billing.
- **OQ-5: onboarding for invited users.** A user who arrives via an invitation link (F-ID-04) bypasses the chooser entirely and lands in the school. **Default assumed:** they still get a personal workspace at registration, and `onboarding_completed_at` is set by the redemption. Confirmed here so the two features do not both claim the flag.
