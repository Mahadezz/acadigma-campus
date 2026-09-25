# F-OP-07 — School Settings

|                  |                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | ops                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Status           | in-progress — M0: `resolve()` + defaults + policy-blob read/patch. **Part 1 (PR #39, D-200):** settings home + search, read-only overview, school profile form with optimistic concurrency, branding with live header preview, inline audit trail (owner). Deferred from Part 1: logo upload/variants, `school_public_settings` view, F-OP-03-rendered preview, key-parity/lint rules. Part 2 not started (needs academics tables). |
| Owner branch     | `feat/ops-school-settings`                                                                                                                                                                                                                                                                                                                                                                                                          |
| Depends on       | F-ID-02 (workspaces, memberships, plans/entitlements), F-AC-0x (academic years, terms, grade scales, attendance policy consumers, timetable periods), F-OP-03 (branding consumer), F-OP-02 (cover policy consumer), F-OP-05 (messaging policy consumer), F-OP-06 (labels, offboarding template)                                                                                                                                     |
| Plan             | `docs/plan/ROADMAP.md` chunk TBD                                                                                                                                                                                                                                                                                                                                                                                                    |
| Base44 reference | `docs/reference/base44-inventory/05-operations.md` §2.2 (`SchoolSettings` references), §7.13 (hardcoded school name), §8 Q10, Q20; PRODUCT-DECISIONS §1.7, §1.12, §2.2, §2.4, §2.5, §2.6, §6.3, §6.6, §6.10                                                                                                                                                                                                                         |

---

## 1. Purpose

Almost every rule in Acadigma Campus is configurable, and every one of those settings has to live somewhere a principal can find in under thirty seconds. **School Settings** is that place: the school's identity and logo (which every PDF header reads), the academic year and terms, the attendance policy that decides whether "late" counts as present, the grade scale that decides whether 79 % is an A or an A−, the working week and bell times, which modules the staff can see, how printed documents are branded, and the four irreversible actions (transfer ownership, archive, export, delete) behind a door marked danger.

**What Base44 intended and what was fake.** `SchoolSettings` existed and carried ~20 columns on the same row as every workspace, including personal ones (PRODUCT-DECISIONS §1.7). Settings that existed were **never read** by the code that needed them: `payroll_enabled` and `module_payroll` were declared and never consulted by any cover-teacher code (§2.2); the report card printed the literal **"TeachFlow Academy"** while `useSchool()` sat unused two files away (§7.13); four grade-band vocabularies lived in four source files instead of one table (§5); "today" was computed in UTC even though every school in the product is at UTC+6 (§5, §7.13); and the work week was hardcoded three different ways (PRODUCT-DECISIONS §2.5). There was no settings _surface_ for most of it — the rules were in the code.

**Done looks like:** a principal opens Settings on a phone, changes the pass mark from 33 to 40, and every mark sheet, report card and eligibility warning rendered after that uses 40 — with the results already published unchanged, because a scale change never rewrites history.

## 2. Roles and permissions

| Action                                                      | Permission key               | owner | admin | teacher | staff | parent |     platform     |
| ----------------------------------------------------------- | ---------------------------- | :---: | :---: | :-----: | :---: | :----: | :--------------: |
| Open settings                                               | `settings.view`              |  ✅   |  ✅   |  read¹  | read¹ |   —    |       read       |
| Edit school profile (name, address, EIIN, contacts)         | `settings.school.write`      |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Upload logo / edit PDF branding                             | `settings.branding.write`    |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Edit academic settings (years, terms, weighting, pass mark) | `settings.academic.write`    |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Edit attendance policy                                      | `settings.attendance.write`  |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Edit grade scale                                            | `settings.grade_scale.write` |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Edit working days / timezone / bell times / holidays        | `settings.calendar.write`    |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Edit module visibility                                      | `settings.modules.write`     |  ✅   |  — ²  |    —    |   —   |   —    |        —         |
| Edit cover policy                                           | `settings.school.write`      |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Edit messaging policy                                       | `settings.school.write`      |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Edit ID pattern / counters                                  | `settings.ids.write`         |  ✅   |  ✅   |    —    |   —   |   —    |        —         |
| Transfer ownership                                          | `workspace.transfer`         |  ✅   |   —   |    —    |   —   |   —    |        —         |
| Archive workspace                                           | `settings.danger`            |  ✅   |   —   |    —    |   —   |   —    |        —         |
| Export all data                                             | `settings.danger`            |  ✅   |   —   |    —    |   —   |   —    |      assist      |
| Delete workspace                                            | `settings.danger`            |  ✅   |   —   |    —    |   —   |   —    |        —         |
| Edit plans / prices                                         | —                            |   —   |   —   |    —    |   —   |   —    | ✅ (`/platform`) |

¹ Teachers and staff see a **read-only "How this school works"** page: grade scale, attendance policy, working days, term dates, pass mark. They cannot change anything, but they must be able to answer a parent's question without asking the office. Compensation, danger-zone and module settings are not on it.
² Module _visibility_ is an owner decision (PRODUCT-DECISIONS §1.12) because it changes what the whole staff can see. Admins can request a change; the UI shows the owner's name.

## 3. Data

> **Proposed; `docs/architecture/DATA-MODEL.md` wins.** `school_profiles` is 1:1 with `workspaces` where `type='school'` (PRODUCT-DECISIONS §1.7). Personal workspaces have no row here at all.

### 3.1 `school_profiles`

| Column                                                           | Type                                     | Notes                                                                                  |
| ---------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `workspace_id`                                                   | uuid **pk**                              | 1:1, also the tenant key                                                               |
| `legal_name`, `short_name`                                       | text                                     | `legal_name` prints on certificates; `short_name` in the app chrome                    |
| `logo_file_id`                                                   | uuid → `files` (public bucket)           |                                                                                        |
| `address_line1`, `address_line2`, `city`, `district`, `postcode` | text                                     |                                                                                        |
| `eiin`, `board`, `school_type`, `medium`                         | text / enum                              | `board ∈ dhaka                                                                         | rajshahi | comilla | jessore | chittagong | barisal | sylhet | dinajpur | mymensingh | madrasah | technical | other`; `school_type ∈ government | private | mpo | international | madrasa | kindergarten | other`; `medium ∈ bangla | english | english_version | both` |
| `phone`, `alt_phone`, `email`, `website`                         | text                                     |                                                                                        |
| `bin`, `vat_reg_no`                                              | text                                     | for invoices (PRODUCT-DECISIONS §4.9)                                                  |
| `established_year`                                               | int                                      |                                                                                        |
| `timezone`                                                       | text not null default `'Asia/Dhaka'`     |                                                                                        |
| `working_days`                                                   | int[] not null default `'{6,0,1,2,3,4}'` | ISO-ish day numbers, default **Sat–Thu**                                               |
| `first_day_of_week`                                              | int generated                            | `min(working_days)` in display order                                                   |
| `attendance_policy`                                              | jsonb                                    | §3.2                                                                                   |
| `academic_settings`                                              | jsonb                                    | §3.3                                                                                   |
| `cover_policy`                                                   | jsonb                                    | F-OP-02 §3.4                                                                           |
| `messaging_policy`                                               | jsonb                                    | §3.4                                                                                   |
| `branding`                                                       | jsonb                                    | §3.5                                                                                   |
| `report_locale`                                                  | enum `bn \| en` default `bn`             |                                                                                        |
| `id_patterns`                                                    | jsonb                                    | `{student:"STU-{YYYY}-{#####}", staff:"TCH-{YYYY}-{###}", …}` (PRODUCT-DECISIONS §2.6) |
| `module_visibility`                                              | jsonb                                    | `{hiring:true, cover:false, …}` — owner's hide switches                                |
| `onboarding_completed_at`                                        | timestamptz                              |                                                                                        |

RLS: select for every active member of the workspace **through the view** `school_public_settings` (the subset teachers need) and for `{owner,admin}` on the base table; update `{owner,admin}` with a trigger rejecting changes to owner-only keys (`module_visibility`) from an admin. Platform admins read-only.

### 3.2 `attendance_policy` (jsonb)

```jsonc
{
  "late_counts_present": true, // PRODUCT-DECISIONS §2.2
  "half_day_factor": 0.5,
  "excused_counts_present": true,
  "min_attendance_percent": 75, // warning, never a hard block
  "edit_window_days": 7, // how long a teacher may edit a past session
  "admin_edit_window_days": 90,
  "who_can_edit_past": "admin", // teacher | admin | owner
  "require_note_on_absent": false,
  "session_mode": "daily", // daily | per_period  (PRODUCT-DECISIONS §2.1)
  "auto_mark_holidays": true,
  "staff_self_checkin": false,
  "staff_checkin_geofence": null,
}
```

### 3.3 `academic_settings` (jsonb) + related tables

```jsonc
{
  "current_academic_year_id": "uuid",
  "pass_mark_percent": 33,
  "fail_any_subject_zeroes_gpa": true, // the BD rule, configurable (PRODUCT-DECISIONS §2.4)
  "rank_scope": "section", // section | grade_level
  "rank_tie_breaker": "total_marks",
  "promotion_rule": {
    "min_gpa": 1.0,
    "min_attendance_percent": 60,
    "manual_override": true,
  },
  "exam_weighting_mode": "per_year", // weights live on academic_year_exam_weights
  "show_rank_to_parents": true,
  "show_gpa_to_parents": true,
}
```

Supporting tables (owned by the academics area, edited from this screen):
`academic_years(workspace_id, name, starts_on, ends_on, is_current)` · `terms(academic_year_id, name, starts_on, ends_on, order)` · `academic_year_exam_weights(academic_year_id, exam_id, weight_percent)` (must sum to 100 per year when the aggregate report card is used) · `holidays(workspace_id, name, starts_on, ends_on, is_recurring, applies_to)`.

### 3.4 `messaging_policy` (jsonb)

```jsonc
{
  "teacher_can_create_channels": true,
  "staff_channel_includes_teachers": false,
  "broadcast_mentions_per_day": 3,
  "attachment_max_mb": 25,
  "announcement_publishers": ["owner", "admin", "class_teacher"],
  "contact_log_required_after_call": true,
}
```

### 3.5 `branding` (jsonb) — what every PDF reads

```jsonc
{
  "accent_colour": "#1F4E79",
  "header_lines": [
    "{address_line1}, {city}",
    "EIIN {eiin} · {board} Board",
    "Phone {phone}",
  ],
  "footer_note": "This is a computer-generated document.",
  "signature_labels": {
    "class_teacher": "Class Teacher",
    "principal": "Principal",
    "guardian": "Guardian",
    "examiner": "Examiner",
  },
  "watermark_text": null,
  "show_logo_on_every_page": true,
  "paper_size": "a4",
  "duplex_friendly": false,
}
```

`header_lines` supports `{token}` interpolation from `school_profiles` columns; unknown tokens render as empty and are flagged in the preview. **No PDF template contains a literal school name** (F-OP-03 §3.4, enforced by a CI grep).

### 3.6 `grade_scales` — versioned, because history must not move

`grade_scales(workspace_id, name, version int, status enum draft|active|retired, effective_from date, created_by, retired_at)`
`grade_scale_bands(grade_scale_id, letter, min_percent, max_percent, grade_point numeric(3,2), is_pass bool, sort_order)`.

- A workspace has exactly one `active` scale at a time; editing an active scale **creates a new version** rather than mutating it.
- Published exam results snapshot `grade_scale_id` (the academics area stores it on the exam result row), so re-rendering last year's report card yields last year's letters.
- Seeded on school creation with the **Bangladesh default** (PRODUCT-DECISIONS §2.4): A+ 80–100 → 5.00, A 70–79 → 4.00, A− 60–69 → 3.50, B 50–59 → 3.00, C 40–49 → 2.00, D 33–39 → 1.00, F 0–32 → 0.00.
  RLS: `{owner,admin}` write; all active members read.

### 3.7 `settings_audit`

Not a new table — every settings write goes through the generic `audit_events` trigger, which stores `before`/`after` JSON. The settings UI renders that history inline ("Pass mark changed 33 → 40 by Rafiq, 12 Sep") because a rule change nobody can trace is how schools end up in arguments they cannot settle.

### 3.8 `workspace_exports` (danger zone)

`(workspace_id, requested_by, requested_at, status enum queued|running|ready|failed|expired, file_id, size_bytes, includes jsonb, expires_at)` — a full data export as a zip of CSVs plus the private files manifest. Files themselves are included only when `includes.files = true` and the export is under 2 GB; otherwise the manifest carries signed URLs valid for 7 days.

## 4. Workflows

### W1 — Find a setting

Trigger: a member taps Settings.

1. **Phone:** `/app/settings` is a single column of **grouped rows** (icon, title, one-line current-value summary) — "Attendance policy · Late counts as present · 75 % minimum". Tapping opens a full-screen sub-page. A search field at the top filters across every setting's title, description and synonyms ("holiday", "weekend", "Friday" all find Working days).
2. **Desktop:** a left rail of groups with the detail pane on the right; the same search.
3. Teachers/staff land on the read-only _How this school works_ page with the same groups and no edit affordances.

### W2 — School profile and branding

1. Profile form: identity, address, board/EIIN, contacts, BIN/VAT. Logo upload with a crop tool (square + wide variants generated server-side).
2. **Branding sub-page shows a live PDF preview** of a report-card header rendered by the real F-OP-03 renderer against the current values — the only honest way to edit a header.
3. Changing `legal_name` or `logo_file_id` invalidates cached report renders (`data_version`, F-OP-03 §5.8), so the next render picks it up.
   Failures: a logo over 2 MB or not PNG/JPG/SVG is rejected with the limits named; an EIIN that is not 6 digits warns but saves (schools have odd cases).

### W3 — Academic settings

1. **Academic years**: list with start/end, a "Set current" action, and a create flow that offers to copy last year's terms and exam weighting. Only one `is_current` per workspace (partial unique index).
2. **Terms**: ordered rows with dates; validation forbids gaps and overlaps inside a year and dates outside the year.
3. **Exam weighting**: rows of exam → weight %, with a live sum; saving is blocked unless the sum is 100 (or weighting is off).
4. **Pass mark, GPA rule, rank scope, promotion rule, parent visibility**: plain form fields with the default printed next to each.
   Failures: changing the current academic year asks for confirmation naming what changes (enrolments, timetable, reports default to the new year) and is audited.

### W4 — Attendance policy

A single form with every key from §3.2, each showing its default and a **plain-English effect line** that updates live: _"With these settings, a student marked Late is counted present, and a Half-day counts as 0.5. Ayesha's September attendance would be 92 % instead of 88 %."_ The example is computed from a real recent month for a real section — a policy you cannot see the effect of is a policy nobody sets correctly.
Changing the policy **does not rewrite stored attendance records**; it changes how percentages are computed from them, everywhere, from the next query onward. The screen says so.

### W5 — Grade scale editor

1. The active scale renders as a table of bands with a **visual 0–100 strip** beneath it showing coverage and colour per band.
2. Editing any band opens the editor in **draft** mode on a new version: add/remove bands, drag boundaries, set grade points and the pass flag.
3. **Validation, enforced before save:** bands are contiguous with no gaps and no overlaps; they cover 0–100 inclusive; exactly one band contains the pass mark boundary; grade points are 0.00–5.00 and monotonically non-increasing as percentages fall; the lowest band has `is_pass = false`.
4. **Activate** asks for an effective date and confirms: _"New results will use version 3. The 412 results already published keep version 2."_ On activate the previous scale becomes `retired`.
5. A **"Compare"** view shows a sample of 20 real students' letters under the old and new scales side by side before activation.
   Failures: any validation failure names the exact gap ("nothing covers 33.0–39.9"); activating with an effective date before the last published exam is refused.

### W6 — Working days, timezone, bell times, holidays

1. **Working days**: a 7-chip row (Sat…Fri) with Sat–Thu preselected. Deselecting a day warns if timetable slots or attendance sessions exist on it (they are not deleted; they are flagged).
2. **Timezone**: a picker defaulted to Asia/Dhaka, with a confirmation explaining that "today" and every report boundary move forward from now and that stored timestamps are unchanged.
3. **Bell times / periods**: an ordered list of periods with start/end times and break flags; duration is computed and shown, because F-OP-02 turns those minutes into money (`extra_hours = period minutes / 60`). Editing a period **does not** change already-completed cover assignments (they snapshot `extra_minutes`).
4. **Holidays**: a calendar with single days and ranges, recurring annual entries, and an `applies_to` scope (whole school / a grade level). Holidays suppress attendance sessions, cover triggers and timetable expectations.

### W7 — Modules

Owner-only. A list of every module with three states rendered honestly:

- **Included in your plan · shown** (toggle on),
- **Included in your plan · hidden** (toggle off; nav hides it for everyone),
- **Not in your plan** (toggle disabled, upgrade link with the plan that includes it).
  Availability = `plan_entitlement ∧ module_visibility ∧ role_allowed` (PRODUCT-DECISIONS §1.12). Hiding a module never deletes its data; a hidden module's routes 404 for non-owners and show a "hidden by your school" note to owners.

### W8 — Danger zone

Owner-only, at the bottom of settings, visually separated, each action behind a confirmation that requires typing the school's short name.

1. **Transfer ownership** — pick an active admin, confirm; the actor becomes `admin`, the target becomes `owner`; both are notified; audited. Refused if the target is not an active member.
2. **Export all data** — creates a `workspace_exports` row; a job produces a zip of CSVs (one per table the workspace owns) plus a `files.csv` manifest; the owner is emailed a 7-day link. Always available, never gated by plan — data portability is not a feature to sell.
3. **Archive workspace** — sets `workspaces.status='archived'`: everything becomes read-only, billing stops at the period end, nav shows a banner, and the owner can unarchive within 12 months.
4. **Delete workspace** — a **30-day grace**: `status='pending_deletion'`, `deletion_scheduled_at = now() + 30 days`, daily banner, cancellable by the owner at any point; a cron performs the deletion after 30 days and writes a final platform-level audit record. Deletion is refused while an active subscription or an unpaid balance exists, and the confirmation states plainly what is destroyed.
   Failures: any danger action by an admin returns `forbidden`; deletion with an active subscription names the subscription and offers to cancel it first.

### W9 — Phone flow (explicit)

At 360×800 every settings sub-page is **full screen**, never a sheet — settings forms are long and a sheet fights the keyboard. Each sub-page has a back chevron, a sticky **Save** bar that appears only when the form is dirty, and inline validation under each field. The grade-scale editor's 0–100 strip is horizontally laid out but **fits the viewport** (no horizontal scroll); band editing opens a sheet over it. The danger zone requires two deliberate actions (open the section, then type the school name), so no destructive action is one thumb-tap from the settings list.

## 5. Business rules and calculations

### 5.1 Setting resolution (one rule, everywhere)

Every consumer reads a setting through `packages/domain/settings/resolve.ts`, which merges **shipped default ← school value**. There is no third source. A missing key resolves to the documented default, and a CI test asserts that every key referenced anywhere in the codebase exists in the defaults object with a type. This is what makes "the setting existed and nothing read it" (§2.2's `payroll_enabled`) impossible: a consumer that does not go through `resolve()` fails lint.

### 5.2 Grade scale validation

For bands sorted by `min_percent` ascending:

```
b[0].min_percent == 0
b[n-1].max_percent == 100
for i in 1..n-1:  b[i].min_percent == b[i-1].max_percent + step      // step = 1 for integer scales
no overlap:       b[i].min_percent > b[i-1].max_percent
grade points:     b[i].grade_point >= b[i-1].grade_point             // higher band, higher point
pass flag:        exactly one boundary where is_pass flips false→true, and it equals pass_mark_percent
```

Percent comparisons use integers (0–100); schools that mark in halves round before banding (documented on the screen).

### 5.3 Attendance percentage (the definition every screen uses)

```
present_equivalent = present
                   + (late_counts_present   ? late   : 0)
                   + (excused_counts_present? excused: 0)
                   + half_day × half_day_factor
attendance_percent = round(present_equivalent / session_count × 100, 0)
eligible_for_exam  = attendance_percent >= min_attendance_percent    // warning only
```

Implemented once in SQL and once in `packages/domain` (both tested against the same fixture table). F-OP-03's register prints the policy sentence generated from these settings so a reader can reproduce the number.

### 5.4 Working days and "today"

```
is_working_day(d) = extract(isodow-ish from d) ∈ working_days AND no holiday covers d
today(workspace)  = (now() at time zone school_profiles.timezone)::date
```

Every cron window, month boundary, "due today", attendance date and report date uses `today(workspace)`. A lint rule bans `new Date().toISOString().split('T')[0]` in application code — the exact line that shifted Base44's cover list by a day (§5).

### 5.5 Period duration

```
period_minutes(p) = extract(epoch from (p.end_time - p.start_time)) / 60
```

Consumed by F-OP-02 (`extra_hours = period_minutes / 60`) and by the pacing planner. Editing a period is allowed at any time; consumers that already snapshotted a duration (completed cover assignments) are unaffected by design.

### 5.6 Module availability

```
module_available(m, role) = plan_entitlements[m] AND module_visibility[m] != false AND role_allowed(m, role)
```

Nav, route guards and server actions all call the same function. A route for an unavailable module returns 404 (not 403) to non-owners, so a hidden module does not advertise itself.

### 5.7 ID patterns

`id_patterns` values are templates over `{YYYY}` (academic year start), `{YY}`, `{#}`…`{#####}` (zero-padded counter width) and literal text. Changing a pattern does **not** renumber existing records; the counter continues. A preview shows the next three ids that would be issued. `app.next_id(workspace_id, kind)` (ARCHITECTURE §4) advisory-locks and formats from this template.

### 5.8 Change safety rules (the ones that prevent data damage)

1. A **grade scale** change never alters published results — results snapshot their scale version.
2. An **attendance policy** change never alters stored records — it changes derived percentages from now on, and the screen says so.
3. A **working-days** change never deletes sessions or timetable slots on a newly non-working day — they are flagged for the admin to resolve.
4. A **timezone** change never rewrites stored `timestamptz` values.
5. A **period time** change never re-prices completed cover assignments.
6. **Archiving** never deletes; **deleting** waits 30 days and is cancellable.
7. Every settings write is audited with before/after and rendered as history on the setting's own screen.

## 6. UI

| Screen                | Route                       | 360×800                                                                                    | ≥1024                              | Primary action   | Empty / loading / error                                                      |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| Settings home         | `/app/settings`             | Search + grouped rows with value summaries                                                 | Left rail + detail pane            | (navigate)       | Onboarding checklist card when `onboarding_completed_at` is null             |
| How this school works | `/app/settings/overview`    | Read-only grouped cards                                                                    | Same                               | —                | —                                                                            |
| School profile        | `/app/settings/school`      | Full-screen form; logo crop sheet                                                          | Two-column                         | Save             | Upload errors inline with limits named                                       |
| Branding              | `/app/settings/branding`    | Form + **live PDF header preview** below                                                   | Side-by-side preview               | Save             | Unknown-token warnings on the preview                                        |
| Academic              | `/app/settings/academic`    | Sub-rows: Years · Terms · Weighting · Rules                                                | Tabs                               | Save             | "No academic year yet — create one" blocks dependent modules with a link     |
| Attendance            | `/app/settings/attendance`  | Form + live plain-English effect line                                                      | Two-column                         | Save             | Sample computed from a real recent month; "not enough data yet" fallback     |
| Grade scale           | `/app/settings/grade-scale` | Band table + 0–100 strip; band editor as a sheet; Compare view                             | Two-pane with Compare side by side | Activate version | Validation errors name the exact gap/overlap                                 |
| Calendar              | `/app/settings/calendar`    | Day chips · timezone picker · periods list · holidays calendar                             | Two-pane                           | Save             | Warning when disabling a day that has data                                   |
| Modules               | `/app/settings/modules`     | Rows with three honest states                                                              | Same                               | Toggle           | "Not in your plan" rows link to pricing                                      |
| Cover policy          | `/app/settings/cover`       | Grouped form (F-OP-02 §3.4)                                                                | Two-column                         | Save             | Disabled with an upgrade card on non-Pro                                     |
| Messaging policy      | `/app/settings/messaging`   | Form                                                                                       | Two-column                         | Save             | —                                                                            |
| Labels                | `/app/settings/labels`      | (F-OP-06)                                                                                  |                                    |                  |                                                                              |
| IDs                   | `/app/settings/ids`         | Pattern fields + next-three preview                                                        | Two-column                         | Save             | Invalid template named                                                       |
| Danger zone           | `/app/settings/danger`      | Collapsed section; each action opens a full-screen confirm requiring the school short name | Same                               | (per action)     | Refusals explain the blocker (active subscription, not an admin, last owner) |

Components: `AppShell`, `SettingsGroupRow` (new), `FormSheet`, `FullScreenForm` (new), `StickySaveBar` (new), `GradeBandStrip` (new), `PdfHeaderPreview` (new, wraps F-OP-03's renderer), `DayChips` (new), `ConfirmTypeName` (new), `EmptyState`, `AuditTrail` (new, inline history).
Every field shows its **default** as helper text, and every group's header shows "Last changed by {name}, {date}".

## 7. Server contracts

| Name                                                    | Input                                    | Output                                                                      | Errors                                                                                   | Idempotency           | Rate limit |
| ------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------- | ---------- |
| `getSchoolSettings` (route, GET)                        | —                                        | `SchoolSettings` (full for owner/admin, `school_public_settings` otherwise) | `forbidden`                                                                              | —                     | 600/h      |
| `updateSchoolProfile`                                   | `SchoolProfileInput`                     | `SchoolProfile`                                                             | `forbidden`, `validation`                                                                | per section + version | 120/h      |
| `updateBranding`                                        | `BrandingInput`                          | `SchoolProfile`                                                             | `unknown_token`, `forbidden`                                                             | per version           | 120/h      |
| `uploadLogo`                                            | `{ fileId }`                             | `{ logoFileId, variants }`                                                  | `invalid_type`, `too_large`                                                              | per file              | 30/h       |
| `updateAttendancePolicy`                                | `AttendancePolicyInput`                  | `SchoolProfile`                                                             | `validation`                                                                             | per version           | 120/h      |
| `previewAttendancePolicy`                               | `AttendancePolicyInput`                  | `{ sampleStudent, before, after }`                                          | `no_data`                                                                                | —                     | 300/h      |
| `updateAcademicSettings`                                | `AcademicSettingsInput`                  | `SchoolProfile`                                                             | `weights_not_100`, `validation`                                                          | per version           | 120/h      |
| `upsertAcademicYear` / `setCurrentAcademicYear`         | `{ … }`                                  | `AcademicYear`                                                              | `overlapping_year`, `forbidden`                                                          | per id                | 60/h       |
| `upsertTerms`                                           | `{ academicYearId, terms[] }`            | `Term[]`                                                                    | `gap_or_overlap`, `outside_year`                                                         | per year + version    | 60/h       |
| `saveGradeScaleDraft`                                   | `{ bands[] }`                            | `GradeScale` (draft)                                                        | `gap`, `overlap`, `not_covering_0_100`, `non_monotonic_points`, `pass_boundary_mismatch` | draft id              | 120/h      |
| `compareGradeScale`                                     | `{ draftId, sampleSize }`                | `{ rows: [{student, oldLetter, newLetter}] }`                               |                                                                                          | —                     | 60/h       |
| `activateGradeScale`                                    | `{ draftId, effectiveFrom }`             | `GradeScale` (active)                                                       | `effective_before_published_exam`, `forbidden`                                           | per draft             | 30/h       |
| `updateCalendar`                                        | `{ workingDays?, timezone?, periods?, }` | `SchoolProfile`                                                             | `has_data_on_removed_day` (warning payload, not a block)                                 | per version           | 120/h      |
| `upsertHoliday` / `deleteHoliday`                       | `{ … }`                                  | `Holiday`                                                                   | `overlapping_holiday`                                                                    | per id                | 120/h      |
| `updateModuleVisibility`                                | `{ module, visible }`                    | `SchoolProfile`                                                             | `forbidden` (owner only), `not_entitled`                                                 | per module            | 120/h      |
| `updateIdPatterns`                                      | `{ patterns }`                           | `SchoolProfile`                                                             | `invalid_template`                                                                       | per version           | 60/h       |
| `transferOwnership`                                     | `{ toMembershipId, confirmName }`        | `{ ok }`                                                                    | `forbidden`, `not_active_member`, `name_mismatch`                                        | **required**          | 5/day      |
| `requestWorkspaceExport`                                | `{ includeFiles }`                       | `WorkspaceExport`                                                           | `already_running`                                                                        | per workspace + day   | 3/day      |
| `archiveWorkspace` / `unarchiveWorkspace`               | `{ confirmName }`                        | `Workspace`                                                                 | `forbidden`, `name_mismatch`                                                             | per workspace         | 5/day      |
| `scheduleWorkspaceDeletion` / `cancelWorkspaceDeletion` | `{ confirmName }`                        | `Workspace`                                                                 | `active_subscription`, `name_mismatch`, `forbidden`                                      | per workspace         | 5/day      |

All writes use optimistic concurrency (`updated_at` as the version) so two admins editing settings on two devices cannot silently clobber each other; a conflict returns `stale_version` with the current value.

## 8. Parts (build chunks)

**Part 1 — Settings foundation + school profile + branding** · `school_profiles` columns/jsonb defaults and RLS, `school_public_settings` view, `packages/domain/settings/resolve.ts` with the full defaults object and the CI key-parity + lint rules, the settings shell (search, groups, sticky save bar, inline audit history), the profile form, logo upload with variants, branding with the live PDF header preview.
_Demo:_ change the school name and logo on a phone; the next report card header (F-OP-03) shows them, and the string "TeachFlow" exists nowhere in the repo.

**Part 2 — Academic settings** · academic years with the single-current constraint, terms with gap/overlap validation, exam weighting with the 100 % rule, pass mark / GPA rule / rank scope / promotion rule / parent visibility, the current-year change confirmation.
_Demo:_ create 2026–27, copy last year's terms, set the weighting 30/70, switch the current year, and see the audit entry with before/after.

**Part 3 — Attendance policy + the live effect preview** · the full policy form, `previewAttendancePolicy` computing a real student's before/after from a recent month, the shared SQL + domain implementations of `attendance_percent` tested against one fixture, the "records are not rewritten" messaging.
_Demo:_ flip `late_counts_present` off and watch the preview line change Ayesha from 92 % to 88 % before saving — then save and confirm the register (F-OP-03) reports the new number and prints the new policy sentence.

**Part 4 — Grade scale editor** · versioned `grade_scales` + `grade_scale_bands`, the band table and 0–100 strip, drafts, the six validation rules with precise errors, the Compare view over 20 real students, activation with effective date and the retire transition, the BD default seeder.
_Demo:_ add a band, get a precise gap error, fix it, compare 20 students, activate — and confirm a previously published result still renders its old letters.

**Part 5 — Calendar: working days, timezone, periods, holidays** · day chips with the data warning, timezone change with confirmation, the periods editor with computed durations, the holiday calendar with ranges/recurrence/scope, `is_working_day` + `today(workspace)` helpers and the UTC-date lint rule.
_Demo:_ add Friday as a working day and remove Thursday with a warning naming the affected sessions; add Eid as a 3-day holiday and watch F-OP-02 create no cover proposals on those days.

**Part 6 — Modules, ID patterns, danger zone** · owner-only module visibility with the three honest states and 404 routing, ID pattern templates with the next-three preview, transfer ownership, the export job producing a CSV zip + file manifest, archive/unarchive, 30-day cancellable deletion with the blockers.
_Demo:_ hide the Hiring module and confirm it disappears from nav and 404s for an admin; transfer ownership to a colleague; request an export and download the zip; schedule deletion and cancel it, with every step audited.

## 9. Acceptance criteria

**Foundation and profile**

1. _Given_ a school with no value for a setting, _when_ a consumer resolves it, _then_ the documented default is returned and typed (CI asserts every referenced key exists in the defaults object).
2. _Given_ any consumer that reads a setting without `resolve()`, _when_ CI runs, _then_ lint fails.
3. _Given_ an admin changes the school name and logo, _when_ the next report card renders, _then_ the header shows the new values and no cached render is served.
4. _Given_ a teacher, _when_ they open `/app/settings`, _then_ they see the read-only overview and `updateSchoolProfile` returns `forbidden`.
5. _Given_ two admins editing the profile concurrently, _when_ the second saves a stale version, _then_ the server returns `stale_version` with the current value and nothing is clobbered.
6. _Given_ any settings change, _then_ the setting's screen shows "changed X → Y by {name}, {date}" from `audit_events`.

**Academic** 7. _Given_ two academic years, _then_ exactly one has `is_current = true` (partial unique index), and switching asks for confirmation naming the consequences. 8. _Given_ terms with a 3-day gap inside a year, _when_ saved, _then_ the server returns `gap_or_overlap` naming the dates. 9. _Given_ exam weights summing to 90, _when_ saved with weighting on, _then_ the server returns `weights_not_100`. 10. _Given_ `pass_mark_percent` changed 33 → 40, _when_ a mark sheet renders afterwards, _then_ pass/fail uses 40 while already-published results keep their stored scale version.

**Attendance** 11. _Given_ `late_counts_present = true` and `half_day_factor = 0.5`, a student with 18 present, 2 late, 2 half-days over 24 sessions, _then_ `attendance_percent = round((18+2+1)/24×100) = 88`. 12. _Given_ the same data with `late_counts_present = false`, _then_ the percentage is 79. 13. _Given_ a policy change, _then_ no `attendance_records` row is modified (asserted by a row-hash comparison before and after). 14. _Given_ a student at 71 % with a 75 % minimum, _then_ the report card and eligibility screens show a **warning**, never a block. 15. _Given_ the preview, _when_ the form changes, _then_ the plain-English effect line updates with a real student's before/after numbers.

**Grade scale** 16. _Given_ bands that leave 33–39 uncovered, _when_ the draft is saved, _then_ the error names "nothing covers 33–39". 17. _Given_ bands that overlap at 70, _then_ the error names the overlap. 18. _Given_ a band with a higher grade point than the band above it, _then_ `non_monotonic_points` is returned. 19. _Given_ a pass mark of 33 and a pass flag that flips at 40, _then_ `pass_boundary_mismatch` is returned. 20. _Given_ an activated version 3, _when_ a report card for an exam published under version 2 is re-rendered, _then_ the letters are version 2's. 21. _Given_ the Compare view, _then_ it shows 20 real students with their letters under both versions before activation. 22. _Given_ an effective date before the most recent published exam, _when_ activation is attempted, _then_ it is refused.

**Calendar** 23. _Given_ working days Sat–Thu, _then_ `is_working_day` is false for Friday and no attendance session, cover trigger or timetable expectation is created for it. 24. _Given_ a 3-day Eid holiday, _then_ no cover proposals are created on those days (F-OP-02) and the attendance register shows them as holidays. 25. _Given_ Thursday is removed from working days while 40 attendance sessions exist on Thursdays, _then_ the save succeeds with a warning naming the 40 sessions and **no session is deleted**. 26. _Given_ timezone Asia/Dhaka, _when_ the app computes "today" at 06:30 local, _then_ it returns the current local date, not the next UTC date (asserted in SQL and in the UI). 27. _Given_ a period of 08:00–08:45, _then_ its duration shows as 45 minutes and F-OP-02 computes `extra_hours = 0.75` for a cover in it. 28. _Given_ that period is later changed to 50 minutes, _then_ an already-completed cover assignment still reports 0.75.

**Modules and IDs** 29. _Given_ an owner hides the Hiring module, _when_ an admin opens `/app/hiring`, _then_ the route 404s and the nav item is absent; _when_ the owner opens it, _then_ they see a "hidden by your school" note. 30. _Given_ a Free plan, _when_ the owner tries to show the Hiring module, _then_ the toggle is disabled with an upgrade link naming Pro. 31. _Given_ an admin tries `updateModuleVisibility`, _then_ the server returns `forbidden` (owner only). 32. _Given_ an ID pattern change from `STU-{YYYY}-{#####}` to `S{YY}{####}`, _then_ existing student ids are unchanged and the preview shows the next three ids in the new format.

**Danger zone** 33. _Given_ an admin, _when_ they open the danger zone, _then_ every action is absent or returns `forbidden`. 34. _Given_ an owner transfers ownership to an active admin, _then_ roles swap, both are notified, and an `audit_events` row records it; _given_ the target is not an active member, _then_ it is refused. 35. _Given_ an export request, _then_ a zip of CSVs plus a files manifest is produced and emailed as a 7-day link, regardless of plan. 36. _Given_ an archived workspace, _then_ every write returns read-only and the data is intact; unarchiving within 12 months restores it. 37. _Given_ a deletion request with an active subscription, _then_ it is refused naming the subscription. 38. _Given_ a scheduled deletion, _then_ a daily banner shows the date, the owner can cancel at any point in 30 days, and nothing is destroyed before then. 39. _Given_ any danger action, _then_ the confirmation requires typing the school's short name and a mismatch refuses with `name_mismatch`.

**Tenancy and phone** 40. _Given_ an admin of School A, _when_ they query `school_profiles` or `grade_scales` with their JWT, _then_ zero School B rows are returned (pgTAP). 41. _Given_ a 360×800 viewport, _when_ any settings sub-page is open, _then_ it is full screen with a sticky save bar that appears only when dirty, there is no horizontal scroll (including the grade-scale strip), and no danger action is reachable in fewer than two deliberate steps.

## 10. Tests

- **Unit**: `resolve()` merge and defaults completeness; grade-scale validation (all six rules, table-driven, including 1-point bands and the 0/100 edges); `attendance_percent` across every policy combination (compared cell-for-cell with the SQL implementation over one fixture); `is_working_day` and `today(workspace)` across the Asia/Dhaka midnight and a DST-having timezone; ID template parsing (padding widths, unknown tokens, literal text); `module_available` truth table.
- **DB (pgTAP)**: isolation on `school_profiles`, `grade_scales`, `grade_scale_bands`, `holidays`, `workspace_exports`; the owner-only `module_visibility` trigger under an admin JWT; the single-current-academic-year partial unique index; the teacher's read through `school_public_settings` excluding owner-only keys.
- **Integration**: optimistic concurrency returning `stale_version`; grade-scale activation with a published-exam blocker; ownership transfer including the last-owner guard; the export job end-to-end against the dev branch; the deletion scheduler and its cancellation.
- **e2e (360×800 and 1280×800, axe)**: J1 change name + logo → report header updates; J2 attendance policy preview → save → register reflects it; J3 grade-scale edit → gap error → compare → activate → old results unchanged; J4 add a holiday → no cover proposals that day; J5 hide a module → 404 for an admin; J6 danger zone: transfer ownership, schedule deletion, cancel it.
- **Static/CI**: the settings-key parity test; the `resolve()` lint rule; the UTC-date lint rule; the banned-hardcoded-school-name grep (shared with F-OP-03).
- **a11y**: every setting has a programmatic label and a description referencing its default; the grade-band strip has a table equivalent for screen readers; the day chips are a labelled checkbox group; the danger confirmations announce their consequences before the input.
- **Performance budgets**: settings load p95 ≤ 400 ms; `previewAttendancePolicy` ≤ 500 ms; `compareGradeScale` over 20 students ≤ 400 ms; the settings resolve path adds ≤ 5 ms to any request (cached per request in `WorkspaceContext`).

## 11. Open questions

1. **Where do academic years and terms live?** They are edited here but owned by the academics area. _Default assumed:_ tables `academic_years` / `terms` owned by academics; this feature owns only the screens and the `current_academic_year_id` pointer. Flagged to the data-model agent.
2. **jsonb vs columns for the policy blobs.** This spec uses jsonb for `attendance_policy`, `academic_settings`, `cover_policy`, `messaging_policy` and `branding` because they are read as a unit and change shape often, with Zod as the schema of record. If DATA-MODEL.md prefers typed columns, `resolve()` is the only place that changes. **Flagged.**
3. **Per-grade-level grade scales** (a madrasa stream with a different scale) are out of v1; one active scale per workspace. Tracked for FUTURE.
4. **Half marks.** _Default assumed:_ percentages band on integers; schools marking in halves round half-up before banding, stated on the editor.
5. **Multi-campus settings inheritance** is out of scope (one workspace = one campus, PRODUCT-DECISIONS §7).
6. **Who may see the read-only overview?** _Default assumed:_ teachers and staff, not parents. A parent-facing "how grading works" page is a good idea and is tracked for FUTURE.
7. **Part 1 deviations (D-200, PR #39).** (a) Logo upload deferred until a files pipeline exists; the preview shows initials. (b) No `school_public_settings` view: DATA-MODEL §1.3 widens SELECT to members and no owner-only column lives on `school_profiles`. (c) The branding preview is HTML from `renderHeaderLine()` (`packages/domain/settings/header.ts`), not the F-OP-03 renderer, which does not exist yet; F-OP-03 should reuse the function. (d) `stale_version` is the envelope's `conflict` code; the UI offers a reload. (e) EIIN stays strictly 6 digits (F-ID-05 §5 and the wizard) instead of "warns but saves". (f) Admins see no inline change history: `audit_events` is owner-readable only (F-ID-09 OQ-2). (g) The §5.1 key-parity CI test and `resolve()` lint rule are still open. (h) Board/medium use the wizard's enums (F-ID-03 §3), not the board list in §3.1 here.
8. **Overlap with F-ID-03 Part 8** (`/app/settings/workspace`, identity lane): both screens edit name/EIIN/address/contacts. Open for the lead: one screen should own these fields.
