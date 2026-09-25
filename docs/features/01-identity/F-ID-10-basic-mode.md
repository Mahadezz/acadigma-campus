# F-ID-10 — Basic mode

|                  |                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | platform (school shell)                                                                                                                         |
| Status           | planned — owner walkthrough 2026-09-26, D-403                                                                                                   |
| Owner branch     | `feat/design-basic-mode`                                                                                                                        |
| Depends on       | F-ID-02 (preferences — only the two columns below are needed), F-ID-03 (shell, `WorkspaceContext`), F-AC-01 (sections), F-AC-03, F-AC-06 Part 3 |
| Offline          | follows F-ID-11: every tab is exactly as offline-capable as the screen it reuses                                                                |
| Plan             | `docs/plan/ROADMAP.md` — "Basic mode and offline" note: Parts 1–3 after marks entry (F-AC-06 P3), before the school demos                       |
| Base44 reference | none — new in Campus (owner request 2026-09-26)                                                                                                 |

## 1. Purpose

Many teachers in Bangladeshi schools are older, use a phone only for calls and a few apps, and need four things from Campus: take the roll, enter marks, see their students, and print. The full app is organised **feature by feature** (Attendance, Exams, Students, Reports…), which asks a teacher to hold the whole product in their head. **Basic mode** organises the same product **class by class**: the home screen is one big block per class the teacher is assigned to, and tapping a block opens that class's **hub**, where every job for that class lives with that class's data only. Everything is larger (text, icons, tap targets), every button says what it does in words, every save says what it will do in plain words first, and every screen has a Help button with a one-tap call to the school office.

Each user turns basic mode on or off **for themselves**; the choice is a per-user preference that follows them to every device (F-ID-02). Owners and admins can use it too. There is always a clear **Switch to full app** button. Basic mode is a different _layout_ over the same server actions, permissions and data — it never grants anything and never hides a rule.

"Done" from the teacher's chair: a 58-year-old Bangla teacher on a four-year-old Android switches basic mode on once, and from then on opens the app to "Good morning, Rahima Apa · 1 roll call not taken", taps the big "Class 6 – ক · Bangla" block, takes the roll, confirms "Save attendance for 6-ক? 38 present, 2 absent", and never sees a menu.

## 2. Roles and permissions

No new permission keys. Basic mode is a layout; each tab calls the existing actions and their existing checks.

| Action                                         | owner    | admin    | teacher  | staff | parent | platform |
| ---------------------------------------------- | -------- | -------- | -------- | ----- | ------ | -------- |
| Turn basic mode on/off for themselves          | yes      | yes      | yes      | no⁴   | no     | no       |
| Set text size (both modes)                     | yes      | yes      | yes      | yes   | yes    | yes      |
| See a class block / open a class hub           | yes¹     | yes¹     | own²     | —     | —      | —        |
| Use a hub tab (attendance, marks, students, …) | per tab³ | per tab³ | per tab³ | —     | —      | —        |
| Call school office from Help                   | yes      | yes      | yes      | —     | —      | —        |

¹ Owners/admins see the classes they are assigned to first, then an **All classes** block that opens a large, searchable list of every live section.
² A teacher's classes are: sections where they are the active `class_teacher_id` (D-102), plus — once F-AC-01's `section_subjects` ships — every (section, subject) they teach. **Prerequisite:** F-AC-01 Part 5 (`section_subjects`) ships before the basic-mode demo; without it a subject-only teacher sees the "no classes yet" state, which would be most teachers. Opening a hub for any other section returns `NOT_ASSIGNED` and shows "This class is not on your list" with a Home button.
⁴ Hidden for `staff`: they have no classes, so a class-by-class home has nothing to show them (D-403, lead decision under owner authorization 2026-09-26).
³ Each tab keeps its feature's own permission key and checks (`attendance.write`, `marks.write`, `students.read`, …); basic mode adds none and relaxes none.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** User-scoped, no `workspace_id` (DATA-MODEL §1.7).

**`user_preferences`** is not built yet (F-ID-02 Part 1 is open). This feature needs only two columns, so Part 1 creates the table with the columns below if it does not exist yet; F-ID-02 Part 1 later adds its own columns with `alter table` (theme, palette, density, notification channels). Language is **not** duplicated here: it stays where D-401 put it (`profiles.locale` + the `acadigma_locale` cookie).

| column                     | type               | default    | notes                                                  |
| -------------------------- | ------------------ | ---------- | ------------------------------------------------------ |
| `user_id`                  | uuid PK → profiles |            |                                                        |
| `ui_mode`                  | enum `ui_mode`     | `'full'`   | `full \| basic`                                        |
| `text_size`                | enum `text_size`   | `'normal'` | `normal \| large \| xlarge`; applies in **both** modes |
| `created_at`, `updated_at` | timestamptz        | now()      | `updated_at` = last-write-wins across devices          |

- **RLS** class U1: select/insert/update where `user_id = auth.uid()`; no delete grant; no platform read (F-ID-02 §3).
- **No row needed to read:** a missing row reads as the defaults, so no trigger change to `handle_new_user()`; the first change upserts.
- **Cookie mirrors** (non-httpOnly, written by the server on every change, same pattern as `acadigma_locale`): `acadigma_ui_mode`, `acadigma_text_size`. They give a no-flash first paint and work offline and before the preference read.
- Enums mirrored in `packages/contracts` (`UiMode`, `TextSize`) and covered by the enum-parity test.
- No audit rows (a person's layout is not a business event; same as the rest of `user_preferences`).

Everything else is read from existing tables through existing functions: sections (`class_teacher_id`), `public.attendance_day` (D-104) for "taken today", `student_roster`, exams/papers (F-AC-06), `school_profiles.phone` (F-OP-07) for the office number.

## 4. Workflows

**4.1 Turn basic mode on.** _Trigger:_ Settings → Display → "Basic mode" switch (full app), or the one-time prompt below. _Steps:_ the switch shows a picture of the basic home and one sentence ("Bigger buttons, one screen per class. You can switch back any time."); turning it on saves `ui_mode='basic'`, sets the cookie, and navigates to `/app/home`. _Outcome:_ every device the user signs in on opens basic mode. _Failure:_ offline → the cookie applies immediately on this device and the write joins the F-ID-11 outbox (before F-ID-11 ships: a retry toast; the cookie still holds).

**4.2 Switch to full app.** A labelled button ("Switch to full app", icon + text) sits on the basic home's bottom row and in basic Settings. One tap, no confirmation (nothing is lost; it is reversible the same way), saves `ui_mode='full'` and goes to `/app/dashboard`. The full app's Settings → Display has the reverse switch, and the full app's user menu has "Switch to basic mode" so an admin helping a teacher can find it.

**4.3 Open the app in basic mode.** `/app` resolves to `/app/home` when `ui_mode='basic'` (cookie first, then the preference), else to `/app/dashboard` as today. Deep links into full-app routes (a notification, a shared link) still open, rendered inside the basic shell with a big **Home** button; basic mode never 404s a link.

**4.4 Home screen** (owner-picked layout; phone, one column):

1. **Today strip** — greeting with the teacher's name and the date ("Good morning, Rahima Apa · Sunday 27 September"); the **next period** ("Next: Class 7 – খ · Maths · 10:40") **only once a timetable exists** (F-AC-05; before that the line is absent, not empty); **to-dos**, each a big tappable row that opens the right hub tab: "2 roll calls not taken" (school day, own sections without a session today — from `attendance_day`), later "Marks due for 1 paper" (F-AC-06 papers in entry state assigned to them), "3 changes waiting to send" (F-ID-11 outbox), "1 change needs your attention" (F-ID-11). No to-dos → one line "Nothing waiting. Well done." (no confetti).
2. **One big block per class** — section + subject ("Class 6 – ক · Bangla"; a class-teacher section without a subject reads "Class 6 – ক · Class teacher"), student count, and today's attendance mark: a **tick with "Taken 38/40"** or a **cross with "Not taken"** (icon + words, never colour alone). Blocks are full-width, ≥ 96 px tall, ordered by the timetable when one exists, else by grade then section name.
3. **Essentials row** at the bottom: **Profile**, **Settings**, **Help**, **Switch to full app**. Proposed and deliberately short: notifications join this row when F-ID-07 Part 3 ships its centre; nothing else (see §5.4 for what is hidden).

_Empty:_ no assigned classes → "You have no classes yet. Ask your school office to add you as a class teacher." with the **Call school office** button (§4.7). _Loading:_ skeleton blocks at final size. _Error:_ a full-width Retry block; cached data first when F-ID-11 is live.

**4.5 Class hub** — `/app/classes/[sectionId]` (+ `?subject=` once subjects are per teacher). A big header with the class name, student count and a **Home** button; below it a row of large **tabs, icon + label, only for features that are built** — no "coming soon" tab. Tab order, as they ship:

| Tab                             | Ships with                                           | Content (this class only)                                                                              |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Attendance                      | F-ID-10 P3 (F-AC-03 built)                           | Today's roll call — the existing roll-call screen, basic-sized, then "Earlier days" (the session list) |
| Marks                           | F-ID-10 P3 if F-AC-06 P3 is merged, else with it     | Papers of this section's exams → the existing marks entry screen for that paper                        |
| Students                        | F-ID-10 P3 (F-AC-02 built)                           | The section's roster (roll, name, photo); a student opens their profile read-only in the basic shell   |
| Routine                         | F-AC-05                                              | This section's week, today first                                                                       |
| Print                           | F-OP-03 / F-OP-04 (when a class-level report exists) | "Print attendance register", "Print mark sheet" for this class — needs internet (F-ID-11 §5.1)         |
| Handouts, Lesson plan, Homework | F-TE-05, F-TE-01, F-AC-07                            | Each feature's Part adds its tab to the registry when it ships                                         |

The registry is one typed list (`CLASS_HUB_TABS` in `packages/domain`) filtered by the same `IMPLEMENTED_NAV_ROUTES` rule D-400 used for the nav: a tab appears only when its page exists, and a unit test keeps the list and the pages in step. The first tab opens by default; the last-used tab per class is remembered in `localStorage` (a convenience only).

**4.6 Doing a job in a hub (mistake-proofing).** Every save first shows a **ConfirmSheet** that names the effect in plain words, with the counts: "Save attendance for 6-ক? 38 present, 2 absent" · "Save marks for Bangla 1st paper, 6-ক? 36 entered, 4 absent, 0 empty". Two big buttons: **Yes, save** (primary) and **Go back** (never "Cancel", which older users read as "delete"). **Undo** where the data allows (§5.3). Destructive actions (anything that deletes or unpublishes) are not reachable in basic mode at all.

**4.7 Help.** A **Help** button (icon + "Help") in the top bar of every basic screen opens a HelpSheet: two to four short plain-language sentences for _this_ screen (catalogue key per route, en and bn), then **Call school office** — a `tel:` link to `school_profiles.phone`, labelled with the number. No phone on the school profile → the button is replaced by "Your school office has not added a phone number yet", and owners/admins see a link to Settings → School to add it. Voice hints (4.8) appear here once Part 4 ships.

**4.8 Voice hints (Part 4).** A **Read aloud** button in the HelpSheet speaks the same help text with the browser's Web Speech `speechSynthesis`, in the user's language. It is shown **only** when `speechSynthesis.getVoices()` has a voice for that language (`bn-BD`/`bn-IN` for Bangla, `en-*` for English); otherwise the button is absent, not broken. **Quality risk:** many older Android phones ship no Bangla voice, or a robotic one, and some WebViews expose none at all; the voice list also loads asynchronously. Part 4 has a **go/no-go gate**: it ships only if a Bangla voice is available and understandable on a 2019-era Android test phone; otherwise the Part is dropped and the reason recorded in D-403 and the test report. No cloud TTS (it would need internet and a paid provider).

**4.9 Language.** Basic mode uses the user's own language choice (English by default, D-401 resolver). It never forces Bangla. Every basic string exists in `en` and `bn`; Western digits as everywhere (D-401).

**4.10 Phone specifics.** One column at every width. No bottom nav in basic mode (the home _is_ the nav); the top bar has only Home (when not home), the page title, the F-ID-11 pending chip and Help. All primary actions sit in the bottom thumb zone. **No gesture-only actions:** no swipe, no long-press, no pull-to-refresh as the only way to refresh (a Refresh button exists where data can go stale). The roll call's long-press popover (F-AC-03 §4.1 step 3) becomes a visible "More" button on the row in basic mode. At ≥1024 the same single column is centred at 640 px — basic mode is not a desktop dashboard.

## 5. Business rules and calculations

**5.1 Sizes in basic mode** (tokens in `packages/ui`, design lane):

| Thing                 | Full app (DESIGN-SYSTEM §3.5) | Basic mode                                           |
| --------------------- | ----------------------------- | ---------------------------------------------------- |
| Minimum tap target    | 44 × 44 px                    | **56 × 56 px**, 12 px apart                          |
| Class block           | —                             | full width, ≥ 96 px tall                             |
| Body text (at Normal) | 16 px                         | **18 px**; labels never below 16 px                  |
| Icons                 | 20 px                         | **28 px** in buttons and tabs, 40 px in class blocks |
| Buttons               | icon or label                 | **always icon AND label**; no icon-only button       |

**5.2 Text size** (Normal / Large / Extra large), in **both** modes: sets the root font size to 100 % / 112.5 % / 125 % via `<html data-text-size>` from the cookie on the server render (no flash). Every type and spacing token is `rem`-based so the whole layout scales; Part 1 audits and converts any `px` font size it finds. Basic mode's own sizes multiply with it (basic body at Extra large = 22.5 px). Rule: no screen may overflow horizontally at 360 px wide at Extra large in Bangla — the acceptance tests run that combination.

**5.3 Undo.** Before saving: every change on a screen can be undone ("Undo last change" button while the screen is dirty; "Mark all present" keeps its existing Undo, F-AC-03). After saving: attendance and marks show an **Undo** toast — **30 s in basic mode** (older users read slowly), 10 s in the full app (DESIGN-SYSTEM §5.4) — that re-saves the previous values through the same action (it is a normal edit, audited as one) — available only while inside the edit window and only when the save was an edit of existing values; a first save has nothing to go back to, so its guard is the ConfirmSheet. Anything else has no undo and therefore always confirms.

**5.4 What basic mode hides.** Anything not tied to a class a teacher teaches: audit trail, reports hub, exam setup, school settings, grade scales, calendar setup, staff directory, billing, invitations. Owners/admins keep an **All classes** block and reach everything else with **Switch to full app**. Features that are class-shaped move into hub tabs instead of being hidden (routine, printing for that class, handouts, lesson plan, homework).

**5.5 Performance budget (old Android).** Reference device: Android 8+, 2 GB RAM, 4-core entry CPU, Chrome/WebView 90+, "Slow 4G" (≈ 400 kbps down, 400 ms RTT) — CI runs Lighthouse on the basic home and a class hub with 4× CPU throttling.

| Metric                                    | Budget                                    |
| ----------------------------------------- | ----------------------------------------- |
| Basic home LCP, first visit               | < 3.5 s                                   |
| Basic home, repeat open (SW-cached shell) | < 1.5 s to the class blocks               |
| Hub tab switch (INP)                      | < 200 ms; tab content from cache < 500 ms |
| JS for `/app/home`                        | < 150 KB gzipped incl. shared chunks      |
| JS for a hub tab                          | < 200 KB gzipped (DESIGN-SYSTEM §7.2)     |
| Fonts                                     | DESIGN-SYSTEM §7.2 budget unchanged       |

No charts, animation libraries or images other than student photos (lazy, 48 px, WebP) on basic screens. Minimum supported: Android 8 Chrome/WebView 90, iOS 15 Safari.

**5.6 Accessibility** — DESIGN-SYSTEM §7.1 in full, plus: every basic button has a visible text label (so no `aria-label`-only buttons), confirmations name object and count, focus order follows the visual order, and 200 % zoom at Extra large still shows no horizontal scroll.

## 6. UI

| Screen           | Route                                | 360×800                                                                                               | ≥1024                       | Primary action        | Empty                                 | Loading         | Error                           |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------- | --------------------- | ------------------------------------- | --------------- | ------------------------------- |
| Basic home       | `/app/home`                          | Today strip, class blocks, essentials row (§4.4)                                                      | Same column, centred 640 px | Tap a class block     | "No classes yet" + Call school office | Skeleton blocks | Retry block (cached if F-ID-11) |
| Class hub        | `/app/classes/[sectionId]`           | Header + Home, big icon+label tabs, tab content                                                       | Same, centred               | The tab's own primary | Per tab                               | Tab skeleton    | Per tab; `NOT_ASSIGNED` screen  |
| Display settings | `/app/settings/display` (both modes) | Text size as three big radio cards showing sample text at each size; Basic mode switch with a picture | Same in the settings panel  | Applies immediately   | n/a                                   | none            | Toast + cookie keeps the choice |
| Basic settings   | `/app/settings` in basic mode        | Big rows: Text size, Language, Switch to full app, Sign out                                           | Same                        | —                     | n/a                                   | —               | —                               |
| HelpSheet        | sheet from every basic screen        | Help text, Read aloud (Part 4), Call school office                                                    | Same                        | Call school office    | "No phone yet" line                   | —               | —                               |
| ConfirmSheet     | sheet before every save              | Plain sentence with counts, **Yes, save** / **Go back**                                               | Dialog                      | Yes, save             | —                                     | Button spinner  | Error in the sheet, data kept   |

Components: existing `packages/ui` (`Button`, `Sheet`, `Tabs`, `RadioGroup`, `Switch`, `Skeleton`, `EmptyState`) with a basic size variant added by the design lane — no hand-rolled replacements. New compositions: `BasicShell`, `ClassBlock`, `TodayStrip`, `HelpSheet`, `ConfirmSheet` (DESIGN-SYSTEM §4.13 already lists `ConfirmSheet`).

## 7. Server contracts

| Action / loader                | Input (Zod)                                     | Output                                                                                                                                                               | Errors                              | Idempotency                     | Rate limit |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------- | ---------- |
| `updateUiPreferences`          | `UpdateUiPreferencesInput` {uiMode?, textSize?} | `UiPreferences` + sets both cookies                                                                                                                                  | `VALIDATION`                        | last write wins by `updated_at` | 120/h/user |
| `getUiPreferences` (server)    | —                                               | `UiPreferences` (defaults when no row)                                                                                                                               | —                                   | —                               | —          |
| `getBasicHome` (server loader) | — (context from `WorkspaceContext`)             | `{greeting, nextPeriod?, todos[], classes: [{sectionId, name, subject?, studentCount, attendanceToday: 'taken'\|'not_taken'\|'not_school_day', taken?, expected?}]}` | —                                   | —                               | —          |
| `getClassHub` (server loader)  | `ClassHubQuery` {sectionId, subjectId?}         | `{section, studentCount, tabs[]}`                                                                                                                                    | `SECTION_NOT_FOUND`, `NOT_ASSIGNED` | —                               | —          |

Every tab reuses its feature's existing actions (`saveAttendanceSession`, `saveMarks`, …) unchanged — basic mode adds no write path. `getBasicHome` is built from existing reads (`attendance_day`, sections, the roster count), one round trip per source, no N+1 over classes.

## 8. Parts (build chunks)

**Part 1 — Display preferences: text size everywhere, the basic-mode switch** · `user_preferences` (the two columns; creates the table if F-ID-02 P1 has not), enums + contracts, `updateUiPreferences` / `getUiPreferences`, cookie mirrors, `<html data-text-size data-ui-mode>` on the server render, rem audit of type/spacing tokens, `/app/settings/display`, "Switch to basic mode" in the full app's user menu, `/app` landing by mode (basic lands on a minimal `/app/home` listing the user's classes) · files: `supabase/migrations/*_user_preferences_ui.sql`, `supabase/tests/6x_user_preferences_ui.sql`, `packages/contracts`, `packages/db`, `apps/web/app/layout.tsx`, `(school)/app/settings/display` · tests: pgTAP U1 isolation (no cross-user read/write, no platform read, no delete), unit `resolveUiPrefs` (cookie → row → default), e2e: change text size, reload, no flash; Extra large + bn at 360 px no horizontal scroll on every shipped school page · **Demo:** set Extra large and basic mode on the phone, open the same account on a PC — it is large and basic there too; switch to full app in one tap.

**Part 2 — Basic home, basic shell and Help** · `BasicShell` (top bar: Home, title, Help; no bottom nav), `TodayStrip` (greeting, to-dos: roll calls not taken; next period hidden until F-AC-05), `ClassBlock` list from `getBasicHome`, essentials row, `HelpSheet` with per-route catalogue text (en/bn) and Call school office, 56 px / 18 px / 28 px basic tokens, the Lighthouse budget job for `/app/home` · tests: unit for to-do derivation (non-school day → no roll-call to-do; taken → none), e2e at 360×800 and 1280×800 with axe, tap-target size assertion (every interactive element ≥ 56 px), `tel:` link present iff `school_profiles.phone` · **Demo:** a teacher with two classes opens the app: "Good morning … · 1 roll call not taken", two big blocks with a tick and a cross; Help → Call school office dials the office.

**Part 3 — Class hub with the built tabs, plain confirmations and undo** · `/app/classes/[sectionId]`, `CLASS_HUB_TABS` registry + implemented-routes test, Attendance tab (existing roll call in basic sizes, row "More" button instead of long-press, `ConfirmSheet` "Save attendance for 6-ক? 38 present, 2 absent", post-save Undo), Students tab (section roster), Marks tab if F-AC-06 P3 is merged (else it lands in that Part), `NOT_ASSIGNED` screen · tests: e2e "take the roll in basic mode" (open → block → mark → confirm → saved, home block flips to a tick), confirm text unit tests (en/bn, counts), undo re-save produces one audited edit, a teacher opening another teacher's section gets `NOT_ASSIGNED`, Lighthouse budget on a hub · **Demo:** from home, open Class 6 – ক, take the roll with one "Mark all present" and two absentees, confirm the plain sentence, undo, redo — and never see a menu.

**Part 4 — Voice hints** · "Read aloud" in HelpSheet via `speechSynthesis`, shown only when a matching voice exists, stops on sheet close, respects the language · tests: unit for voice selection (bn-BD → bn-IN → none), e2e with a stubbed `speechSynthesis` (button absent without a voice), a manual device check on one iPhone, and the **go/no-go gate**: ship only if a Bangla voice is available and understandable on a 2019-era Android test phone, otherwise drop the Part and record why · **Demo:** on a phone with a Bangla voice, Help → Read aloud speaks the screen's help in Bangla; on one without, the button is not shown.

After Part 4, new tabs are not F-ID-10 Parts: each feature Part that ships a class-shaped screen (routine, print, handouts, lesson plan, homework) adds its registry entry and its basic-mode e2e step in its own PR.

## 9. Acceptance criteria

1. **Given** a teacher in the full app, **when** they turn on basic mode in Settings → Display, **then** they land on `/app/home`, and **given** they then sign in on a second device, **then** `/app` opens `/app/home` there too.
2. **Given** basic mode, **when** the teacher taps **Switch to full app** on the home screen, **then** they land on `/app/dashboard` with no confirmation, and the preference reads `full` on every device.
3. **Given** text size Extra large and language বাংলা, **when** any shipped school page renders at 360×800 in either mode, **then** there is no horizontal scroll and no text is clipped.
4. **Given** a teacher who is class teacher of 6 – ক (attendance not taken) and 7 – খ (taken, 38/40), **when** the basic home loads on a school day, **then** it shows "1 roll call not taken", a 6 – ক block with a cross and "Not taken", and a 7 – খ block with a tick and "Taken 38/40".
5. **Given** no timetable exists, **when** the home renders, **then** no "Next period" line or empty slot is shown.
6. **Given** a class hub, **when** it renders, **then** it shows only tabs whose pages exist (Attendance and Students today; Marks once F-AC-06 P3 is merged) and no "coming soon" tab.
7. **Given** the Attendance tab with 38 present and 2 absent, **when** the teacher taps Save, **then** a sheet reads "Save attendance for 6-ক? 38 present, 2 absent" with **Yes, save** and **Go back**, and nothing is written until **Yes, save**.
8. **Given** an edited, saved session inside the edit window, **when** the teacher taps **Undo** within 30 s (basic mode), **then** the previous statuses are saved back through `saveAttendanceSession` as one audited edit.
9. **Given** any basic screen at 360×800, **when** measured, **then** every interactive element is ≥ 56 × 56 px, has a visible text label, and no action needs a swipe or a long-press.
10. **Given** `school_profiles.phone` is set, **when** Help is opened on any basic screen, **then** a **Call school office** link with `href="tel:<phone>"` is present; **given** it is not set, **then** the link is absent and the "not added yet" line shows.
11. **Given** a teacher not assigned to 9 – খ, **when** they open `/app/classes/<9-খ id>`, **then** they see "This class is not on your list" and no student data is sent to the browser.
12. **Given** the reference device profile (4× CPU, Slow 4G), **when** Lighthouse runs on `/app/home`, **then** LCP < 3.5 s and route JS < 150 KB gzipped.
13. **Given** a phone with no Bangla voice, **when** a বাংলা user opens Help, **then** no Read aloud button is shown (Part 4).

## 10. Tests

- **Unit (`packages/domain`)**: `resolveUiPrefs` precedence; to-do derivation; confirm-sentence builders (en/bn, pluralisation, Western digits); `CLASS_HUB_TABS` filtered by implemented routes (both directions, like `implemented-routes.test.ts`); voice selection.
- **DB (pgTAP, `6x_` design range)**: `user_preferences` U1 isolation and escalation, no delete grant, enum values.
- **Integration**: `updateUiPreferences` sets both cookies and upserts; `getBasicHome` returns only the caller's sections; `getClassHub` → `NOT_ASSIGNED`.
- **E2E (360×800 and 1280×800, axe, en and bn)**: `basic-mode-toggle-sync`, `basic-take-attendance`, `basic-help-call-office`, `text-size-xl-no-overflow`; the 56 px target assertion on every basic screen.
- **Performance**: Lighthouse CI on `/app/home` and one hub with the §5.5 profile; bundle-size check per route.
- **Manual**: one old Android (8–10) and one iPhone, recorded in the Part's test report, for text size, voice (Part 4) and repeat-open speed.

## 11. Open questions

- **OQ-1 — Prompting basic mode.** Default assumed: no automatic switch; a one-time dismissible card on the full dashboard for teachers ("Prefer bigger buttons? Try basic mode"). Should admins be able to switch it on _for_ a teacher (e.g. while helping them)? Default: no — each user decides for themselves, as the owner said.
