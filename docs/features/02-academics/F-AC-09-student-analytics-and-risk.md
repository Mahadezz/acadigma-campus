# F-AC-09 — Student analytics and risk scoring

|                  |                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | academics                                                                                                                                                 |
| Status           | planned                                                                                                                                                   |
| Owner branch     | `feat/academics-risk`                                                                                                                                     |
| Depends on       | F-AC-03 (attendance), F-AC-06 (results), F-AC-07 (missing submissions), F-AC-08 (behaviour points), F-AC-02 (students, flags), F-AC-11 (calendar windows) |
| Plan             | `docs/plan/ROADMAP.md` chunk 7                                                                                                                            |
| Base44 reference | `docs/reference/base44-inventory/02-academic-core.md` §3 features 58–64, §4.6, §5 (risk formulas), §6 items 7, 8, 45, 50, §7 Q10, Q11                     |

## 1. Purpose

Two audiences, one engine. A head teacher wants a dashboard that answers "how is the school doing?" from real tables — attendance trend, result distribution, assignment completion, behaviour — and a class teacher wants a short, honest list: "these four children need attention this week, and here is exactly why." This feature delivers the **deterministic, explainable risk score** mandated by PRODUCT-DECISIONS 2.10 — attendance %, mark trend, behaviour points and missing submissions, with configurable weights, computed by a **nightly job**, every component stored so the number can always be explained, a **human-set flag that is never auto-cleared**, and AI used **only to phrase a suggested intervention**. "Done": every morning the class teacher opens one card that says "Rakib — high risk (78). Attendance 61 % (down from 84 %), 5 missing assignments, 2 negative behaviour logs", taps to see the arithmetic, and records what they did about it.

**Base44 intent vs reality.** The screen was titled "**AI Risk Scoring**" and contained **no LLM call of any kind** — plain arithmetic labelled as AI. It read the last 1,000 marks and 1,000 behaviour logs plus every student into the browser and ran `filter` inside `map` (O(n·m)). Students with **fewer than 2 marks were excluded entirely**, so exactly the children most likely to be disengaged were invisible. **Attendance — the strongest dropout predictor — was not an input at all**, because the attendance table was never written to (F-AC-03). The combined score was computed and then used **only to sort a list**: never displayed, never stored, never explained. "Run Risk Scan" wrote `needs_attention` one sequential request at a time and **auto-cleared flags a human had set**, using _substring matching on the reason text_. The sibling "Student Analytics" page had five charts of which three were permanently empty for the same reason, never queried marks despite its name, and plotted holidays as 0 % days.

## 2. Roles and permissions

| Action                                         | Permission key            | owner | admin | teacher                                                     | staff | parent | platform |
| ---------------------------------------------- | ------------------------- | ----- | ----- | ----------------------------------------------------------- | ----- | ------ | -------- |
| View the school analytics dashboard            | `analytics.school.read`   | yes   | yes   | no                                                          | yes   | no     | no       |
| View section-level analytics                   | `analytics.section.read`  | yes   | yes   | own sections                                                | yes   | no     | no       |
| View a student's risk score and breakdown      | `risk.read`               | yes   | yes   | class teacher + teachers of that student's section_subjects | no    | no     | no       |
| View the school-wide risk list                 | `risk.read_all`           | yes   | yes   | no                                                          | yes   | no     | no       |
| Set / clear a human attention flag             | `risk.flag.write`         | yes   | yes   | class teacher                                               | no    | no     | no       |
| Acknowledge an alert / record an intervention  | `risk.intervention.write` | yes   | yes   | class teacher + subject teachers                            | no    | no     | no       |
| Configure risk weights, thresholds and windows | `risk.policy.write`       | yes   | yes   | no                                                          | no    | no     | no       |
| Request an AI-phrased intervention suggestion  | `risk.ai.suggest`         | yes   | yes   | yes (spends AI credits)                                     | no    | no     | no       |
| Export the risk list / analytics PDF           | `analytics.export`        | yes   | yes   | class teacher (own sections)                                | yes   | no     | no       |

**Parents never see a risk score in the portal.** It is an internal triage tool; what reaches a family day-to-day is a phone call or a message from a human, logged as an intervention. That is a deliberate decision — a predictive label about a child is not something a portal should surface unmediated. The one exception is a **subject-access / data-request export** (F-ID-03): when a guardian formally requests their child's data, `student_risk_scores` and `student_flags` **are included** in that export bundle, each score and flag accompanied by a plain-language explanation of what it means and how it was computed (the same explainability text as §4.2), because a formal data-subject request is a different legal footing from ordinary in-app visibility. A **DPIA must be written before the first score is ever computed** for a workspace — this is a hard precondition on Part 3 shipping, not a nice-to-have.

## 3. Data

> Proposed; **`docs/architecture/DATA-MODEL.md` wins.** Tenant key `workspace_id` on every table.

**`risk_policies`** — weights and thresholds, versioned so a stored score can always be reproduced: `name text`, `is_default bool`, `version int`, `weights jsonb` (§5.1), `thresholds jsonb`, `window_days int default 30`, `min_data_points int default 3`, `effective_from date`, `is_active bool`.
Index: `unique (workspace_id, name, version)`, partial `unique (workspace_id) where is_default and is_active`.

**`student_risk_scores`** — one row per student per run date, so trend is real: `student_id`, `enrollment_id`, `section_id`, `academic_year_id`, `term_id`, `as_of date`, `score numeric(5,2)` (0–100, higher = more risk), `band risk_band` (`low|watch|elevated|high`), `previous_score numeric(5,2) null`, `delta numeric(5,2) null`, `risk_policy_id`, `policy_version int`, `components jsonb` (**the explainability payload**, §5.4), `data_completeness numeric(5,2)`, `computed_at timestamptz`, `job_run_id uuid`.
Indexes: `unique (student_id, as_of)`, `index (workspace_id, as_of desc, score desc)`, `index (workspace_id, section_id, as_of desc)`.

**`student_flags`** — the human layer, kept strictly separate from the computed layer (the fix for the prototype's substring-matching auto-clear): `student_id`, `kind flag_kind` (`attention|safeguarding|academic|attendance|behaviour|financial|other`), `source flag_source` (`human|system`), `severity flag_severity` (`info|warning|urgent`), `reason text`, `set_by uuid null` (null for system), `set_at timestamptz`, `status flag_status` (`open|acknowledged|resolved|dismissed`), `resolved_by`, `resolved_at`, `resolution_note text`, `risk_score_id uuid null`, `auto_clear_allowed bool` (**always `false` when `source = 'human'`**, enforced by a check constraint).
Indexes: `index (workspace_id, student_id, status)`, partial `index (workspace_id, status) where status = 'open'`.

**`risk_interventions`** — what a human actually did: `student_id`, `risk_score_id null`, `flag_id null`, `kind intervention_kind` (`call_guardian|meeting|counselling|extra_class|homework_plan|referral|other`), `note text`, `ai_suggestion_id uuid null`, `outcome text null`, `follow_up_on date null`, `contact_log_id uuid null`, `created_by`, `created_at`.
Index: `index (workspace_id, student_id, created_at desc)`.

**`ai_suggestions`** — the AI layer, deliberately narrow: `student_id`, `risk_score_id`, `prompt_version text`, `body text`, `model text`, `credits_spent int`, `accepted bool null`, `created_by`, `created_at`.
Index: `index (workspace_id, student_id, created_at desc)`. Every row corresponds to an `ai_credit_ledger` debit (PRODUCT-DECISIONS 3.3).

**Analytics views** (SQL views, no stored copies, no mock arrays — PRODUCT-DECISIONS 3.9): `analytics_attendance_daily` (section × date × rate, `null` on non-school days), `analytics_attendance_monthly`, `analytics_result_distribution` (exam × section × band × count), `analytics_gpa_trend` (student/section × exam × gpa), `analytics_assignment_completion` (section_subject × window × rate), `analytics_behaviour_summary` (section × term × net points), `analytics_risk_summary` (section × band × count). Each is a plain view over the owning feature's tables, so there is exactly one definition of every number.

**Enums**: `risk_band`, `flag_kind`, `flag_source`, `flag_severity`, `flag_status`, `intervention_kind`.

**RLS in words.** `student_risk_scores`: SELECT for owner/admin/staff across the workspace, and for a **teacher** only where the score's `section_id` is a section they teach; **no parent policy at all** — a parent cannot reach a risk row by any path. Writes only by the nightly job or an admin-triggered recompute — **and critically, the job does not run as the Postgres service role**, because the service role bypasses RLS entirely, which would make every predicate below decorative rather than enforced. Instead the job runs under a dedicated, non-bypassing database role (`app_risk_job`, `nobypassrls`) that the job function switches to with `SET LOCAL ROLE app_risk_job` for the duration of its transaction, so it is subject to the same RLS the rest of the system is; no client may INSERT or UPDATE a score. `student_flags`: read by owner/admin/staff and by teachers for their sections; INSERT/UPDATE by owner/admin and by the class teacher of the student's current section; **the `app_risk_job` role may only insert or update rows where `source = 'system'`** — a real, enforced RLS predicate now that the job cannot bypass it, not merely a policy that looks like protection — and a check constraint forbids `source = 'human' and auto_clear_allowed = true` as a second, independent line of defence. Flags of kind `safeguarding` are restricted to owner/admin (the most sensitive row in the product) and platform admin gets **no** bypass on them. `risk_interventions`: read/write by owner/admin and by teachers of that student's sections; never parent-visible. `ai_suggestions`: read/write by the requester and owner/admin. `risk_policies`: read by owner/admin/teacher, write by owner/admin. `workspace_id` immutable everywhere.

**Private files.** None. Exported risk PDFs are `visibility='private'`, admin-only, and every download is logged — a list of at-risk children is not a workspace-wide document.

## 4. Workflows

**4.1 Nightly risk job.**
_Trigger:_ pg_cron at 01:30 Asia/Dhaka (after F-AC-03's alert job at 01:00 and F-AC-08's rollup reconcile), enqueuing one `jobs` row per workspace so a slow tenant cannot starve the others. The job function itself runs `SET LOCAL ROLE app_risk_job` before touching any table — a dedicated, **non-bypassing** database role, not the Postgres service role — so its writes are subject to the same RLS as every other caller (§3, RLS in words).
_Steps:_ for each active student with an active enrollment in the current academic year, gather the component inputs over the policy window (§5.2) from the owning features' selectors, normalise each to 0–100 (§5.3), weight and sum (§5.1), band it, write one `student_risk_scores` row with the full `components` payload and the policy version, then open or update **system** flags per §5.6.
_Outcome:_ every student has exactly one score for that date; teachers' dashboards refresh in the morning.
_Notifications:_ `risk.flagged` to the class teacher when a student enters `high` or rises a band; a single `risk.digest` per section per day rather than one per child; `risk.improved` when a flagged student drops two bands (schools want the good news too).
_Audit:_ `risk.job.completed` with counts and duration; `risk.flag.opened` / `.closed` per system flag.
_Failures:_ a missing input (no marks yet) does not abort — the component is marked `insufficient_data`, excluded from the weighted sum, and the remaining weights renormalise (§5.3). Idempotent on `(student_id, as_of)`: re-running the same night updates rather than duplicates.

**4.2 Explainability — "why is this child flagged?"**
_Trigger:_ tapping a risk score anywhere.
_Steps:_ a sheet shows, for each component, its raw value ("attendance 61 %"), its normalised 0–100 value, its weight, its contribution in points, a sparkline over the last four runs, and a plain-English sentence ("attendance is 34 points below the 95 % target"). Underneath, the arithmetic is shown as a sum that visibly adds up to the score, plus "computed 01:34, policy v3".
_Outcome:_ nobody has to trust the number; anyone can check it. This is the whole reason the formula is deterministic (PRODUCT-DECISIONS 2.10: "schools must be able to explain why a child is flagged").
_Failures:_ a component with `insufficient_data` says so explicitly and shows what data would be needed.

**4.3 Human flag — set and clear.**
_Trigger:_ a class teacher or admin taps "Flag for attention" on a student.
_Steps:_ choose kind and severity, type a reason (required), save.
_Outcome:_ a `student_flags` row with `source = 'human'` and `auto_clear_allowed = false`. **No job, no recompute and no admin bulk action can ever clear it** — only a human explicitly resolving or dismissing it, with a note.
_Notifications:_ `student.flagged` to the class teacher and admins.
_Audit:_ `student.flag.set` / `.resolved` with the reason and note.
_Failures:_ an attempt by the job to touch a human flag is refused by the RLS predicate and is asserted by a pgTAP test.

**4.4 Intervention.**
_Trigger:_ from a flag or a risk card, "Record what you did".
_Steps:_ kind (call guardian / meeting / extra class / referral…), a note, an optional follow-up date, and an optional "create a contact-log entry" that hands off to the messaging module (PRODUCT-DECISIONS 6.7). Optionally **"Suggest with AI"** first: the server checks credits, calls Claude with a **structured, anonymised prompt** (the student's _components_, not their name or any identifying field), validates the response with Zod, stores it in `ai_suggestions`, debits credits, and drops the text into the note field for the teacher to edit. The teacher always sends or acts — the AI never contacts anyone.
_Outcome:_ an intervention row; the flag can be resolved with it as the resolution note.
_Notifications:_ `risk.intervention.recorded` to admins for `urgent` flags.
_Audit:_ `risk.intervention.created`, `ai.suggestion.generated` with credits spent.
_Failures:_ zero credits → hard block with "request credits" (PRODUCT-DECISIONS 3.3), and the manual path still works; an AI response failing Zod validation is discarded and never shown.

**4.5 Risk list and triage.** `/app/analytics/risk` — students sorted by score descending, filter chips (My sections · Band · Rising · Flagged · Unacknowledged), each card showing the score, band, delta arrow and the top two contributing components. Bulk "acknowledge" marks system flags `acknowledged` (never `resolved` — acknowledgement is not action).

**4.6 School analytics dashboard.** `/app/analytics` — real numbers only, from the views in §3: attendance trend (holidays as gaps, not zeros), attendance by section, result distribution by band for the last exam, GPA trend across exams, assignment completion by subject, behaviour net points by section, risk band counts, and a "needs attention" count. Every chart has an explicit empty state ("no exams published yet") rather than an empty axis. Export to PDF for the board.

**4.7 Recompute on demand.** An admin can recompute a section or the school ("Run now") — same code path as the job, rate-limited, audited, and **still unable to touch human flags**.

**4.8 Phone specifics.** The risk list is the primary surface and is a card list; the explainability sheet is a bottom sheet with the breakdown stacked vertically; dashboard charts are single-metric cards with a sparkline, one per screen width, rather than a squeezed multi-series chart. The intervention form is a sheet with a sticky Save.

## 5. Business rules and calculations

**5.1 Weights** — `risk_policies.weights`, defaults summing to 1.00:

```
attendance        0.35    // the strongest single predictor
academic_level    0.20    // how far below expectation the latest results are
academic_trend    0.15    // direction of travel between the last two results
missing_work      0.15    // missing submission rate (F-AC-07)
behaviour         0.15    // net behaviour points this term (F-AC-08)
```

Every weight is editable per school; the settings screen shows a sum indicator and **refuses to save a set that does not sum to 1.00** — unlike weights elsewhere in the product, this one is blocked, because a non-normalised risk score is meaningless rather than merely odd.

**5.2 Windows.** `window_days` default 30 for attendance and missing work; behaviour uses the **current term** (F-AC-08 is term-scoped by PRODUCT-DECISIONS 2.13); academic level uses the most recent published result, and trend compares it with the one before.

**5.3 Component normalisation** — each returns 0–100 (100 = maximum risk) or `insufficient_data`:

```
attendance:      att   = attendance_pct(student, last window_days)       [F-AC-03 §5.4]
                 R_att = clamp(0, 100, (target_pct - att) * k)
                 target_pct = 95, k = 2.5      ->  95 % => 0, 55 % => 100
                 insufficient_data when fewer than min_data_points attendance records

academic_level:  avg   = latest published result percentage
                         (or the mean subject pct if no result is published yet)
                 R_lvl = clamp(0, 100, (baseline_pct - avg) * 2)
                 baseline_pct = 60             ->  60 % => 0, 10 % => 100
                 insufficient_data when there is no published result and fewer than
                 min_data_points marks

academic_trend:  delta   = avg(latest result) - avg(previous result)     // percentage points
                 R_trend = clamp(0, 100, -delta * 5)                     // improving => 0
                                                                         // -20 pts   => 100
                 insufficient_data when fewer than two published results

missing_work:    rate   = missing_rate(student, last window_days)        [F-AC-07 §5.4]
                 R_miss = clamp(0, 100, rate * 2)                        // 50 % missing => 100
                 insufficient_data when the denominator is 0

behaviour:       net   = net_points(student, current term)               [F-AC-08 §5.3]
                 R_beh = clamp(0, 100, -net * 5)                         // net >= 0 => 0
                                                                         // net = -20 => 100
                 never insufficient_data (no logs means net = 0 means no behaviour risk)
```

**Renormalisation.** Let `A` be the set of components with data:

```
score             = round( Σ_{c ∈ A} weight_c * R_c / Σ_{c ∈ A} weight_c , 2 )
data_completeness = round( 100 * Σ_{c ∈ A} weight_c , 2 )
```

so a student with no marks yet is still scored on attendance, missing work and behaviour — the exact opposite of the prototype, which **excluded** any student with fewer than two marks.

**5.4 Explainability payload** — `components` jsonb, written on every run:

```json
{
  "attendance": {
    "raw": 61.0,
    "unit": "%",
    "normalised": 85.0,
    "weight": 0.35,
    "contribution": 29.75,
    "status": "ok",
    "explain": "attendance is 34 points below the 95% target"
  },
  "academic_level": {
    "raw": 48.5,
    "normalised": 23.0,
    "weight": 0.2,
    "contribution": 4.6,
    "status": "ok",
    "explain": "…"
  },
  "academic_trend": {
    "status": "insufficient_data",
    "needed": "two published results"
  },
  "missing_work": {
    "raw": 41.7,
    "normalised": 83.4,
    "weight": 0.15,
    "contribution": 12.51,
    "status": "ok",
    "explain": "…"
  },
  "behaviour": {
    "raw": -6,
    "normalised": 30.0,
    "weight": 0.15,
    "contribution": 4.5,
    "status": "ok",
    "explain": "…"
  }
}
```

Stored `contribution` values are **pre-renormalisation**; the UI shows both the raw sum and the renormalised score so the arithmetic on screen always closes.

**5.5 Bands** (`risk_policies.thresholds`, defaults):

```
score <  30   -> low
score <  55   -> watch
score <  75   -> elevated
score >= 75   -> high
```

**5.6 System flags.** The job opens a `student_flags` row with `source = 'system'`, `kind = 'attention'`, `auto_clear_allowed = true` when a student's band is `elevated` or `high` and no open system flag exists for them. It **resolves its own flag** automatically when the score falls below the `watch` threshold for **two consecutive runs** (hysteresis, so a child does not flicker on and off). It **never** touches a row with `source = 'human'` — enforced by the RLS predicate on the non-bypassing `app_risk_job` role (the job never runs as the Postgres service role, which would bypass RLS and make the predicate meaningless), by the check constraint, and by an explicit pgTAP test that exercises the production `SET LOCAL ROLE app_risk_job` code path rather than a shortcut. This is the single most important behavioural difference from the prototype, which cleared teacher-set flags by substring-matching their reason text.

**5.7 Delta and trend.** `delta = score(as_of) − score(previous run)`. "Rising" means `delta >= rise_threshold` (default 10) or a band increase. The "Rising" filter uses that, not the absolute score, because a child going from 20 to 45 is often more urgent than one who has sat at 60 all term.

**5.8 Attendance charting rule** (inherited from F-AC-03 §5.5, repeated here because the prototype broke it on this very screen): a day with no session is `null` and plots as a **gap**; a holiday is a gap; only a day with sessions and zero present students plots as 0 %.

**5.9 Assignment completion** on the dashboard is the per-student-derived rate from F-AC-07 §5.3 aggregated over the section — never a class-level count attributed to individuals (the prototype's overdue-alert bug).

**5.10 AI boundary.** AI does **exactly one thing**: turn a components payload into a suggested intervention paragraph. It never computes, adjusts or overrides a score; it never sees a student's name, guardian details or any identifier; its output is Zod-validated, stored, credited and always editable before use. A screen may only be labelled "AI" where an actual model call occurs — the prototype's "AI Risk Scoring" title over pure arithmetic is exactly what this rule exists to prevent.

**5.11 Reproducibility.** Because `risk_policy_id` + `policy_version` + `components` are stored on every score, any historical score can be re-derived exactly. Changing weights creates a **new policy version**; existing scores are never retro-fitted.

**5.12 Timezone.** Windows are computed in `school_profiles.timezone`; `as_of` is the school-local date of the run.

**5.13 Subject-access export.** `student_risk_scores` and `student_flags` stay out of the parent portal, unchanged, but **are** included in the subject-access/data-request export bundle (F-ID-03) with a plain-language explanation of what the score and each flag mean, generated from the same `components`/`explain` text the class teacher sees (§4.2). The export is produced by an audited admin-triggered action, never a self-serve parent-facing endpoint, and every such export is logged. A DPIA covering this feature must exist **before the first score is computed** in a workspace.

## 6. UI

| Screen               | Route                                    | 360×800                                                                                                                     | ≥1024                                                   | Primary action                    | Empty                                                  | Loading                     | Error                                                   |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------- | ------------------------------------------------------ | --------------------------- | ------------------------------------------------------- |
| Risk list            | `/app/analytics/risk`                    | Cards: name, score ring, band chip, delta arrow, top-2 component chips; filter chips                                        | Sortable table + right detail panel                     | Acknowledge / Record intervention | "No scores yet — the first run is tonight, or Run now" | 6 skeleton cards            | Retry banner                                            |
| Explainability sheet | sheet from any score                     | Stacked component rows (raw · normalised · weight · contribution · sparkline), then the sum and "policy v3, computed 01:34" | Side panel, same content                                | Record intervention               | n/a                                                    | Skeleton rows               | Retry; the score still displays                         |
| Student risk tab     | `/app/students/[id]?tab=risk`            | Score ring + 8-run trend + flags + intervention history                                                                     | Two-column                                              | Flag / Intervene                  | "No risk data yet"                                     | Skeleton                    | Retry                                                   |
| Flags                | `/app/analytics/flags`                   | Cards grouped by severity; human flags visually distinct from system ones                                                   | Table with a source column                              | Resolve                           | "No open flags"                                        | Skeleton                    | Retry                                                   |
| Intervention sheet   | sheet                                    | Kind chips, note, "Suggest with AI" showing the credit cost, follow-up date, contact-log toggle, sticky Save                | Dialog                                                  | Save                              | n/a                                                    | AI spinner with credit cost | AI failure falls back to the manual note, never blocks  |
| School dashboard     | `/app/analytics`                         | One metric card per screen width, each with a sparkline; tap for the full chart                                             | Chart grid with a shared date-range control             | Export PDF                        | Per card ("no exams published yet")                    | Per-card skeleton           | Per-card retry; one failing chart never blanks the page |
| Section analytics    | `/app/classes/[sectionId]?tab=analytics` | Attendance, completion, behaviour, risk counts as cards                                                                     | Two-column charts                                       | Export                            | Per card                                               | Skeleton                    | Retry                                                   |
| Risk policy settings | `/app/settings/academics/risk`           | Weight sliders with a live sum indicator and a worked example; threshold steppers                                           | Two-column with a live preview against a sample student | Save (new version)                | "Use the default weights"                              | Skeleton                    | `WEIGHTS_NOT_1` blocks save                             |

`packages/ui`: `ScoreRing`, `BandChip`, `DeltaArrow`, `ComponentBreakdown`, `Sparkline`, `MetricCard`, `ChartCard` (with its own empty/loading/error states), `FlagCard`, `InterventionSheet`, `CreditCostButton`, `FilterChips`, `EmptyState`.

## 7. Server contracts

| Action / handler                                                               | Input schema (Zod)                                                                                                        | Output                                                                 | Errors                                                                   | Idempotency                    | Rate limit       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------ | ---------------- |
| `runRiskScoringJob` (cron, runs `SET LOCAL ROLE app_risk_job` — non-bypassing) | `RunRiskJobInput` {workspaceId?, asOf?, sectionIds?}                                                                      | `RiskJobSummary` {scored, flagged, resolved, insufficient, durationMs} | —                                                                        | idempotent on (student, as_of) | 1/night + manual |
| `recomputeRisk`                                                                | `RecomputeRiskInput` {sectionIds?, studentIds?}                                                                           | `RiskJobSummary`                                                       | `NO_POLICY`, `YEAR_CLOSED`                                               | key required                   | 10/h             |
| `GET /api/risk/list`                                                           | `RiskListQuery` {sectionId?, band?, rising?, flagged?, asOf?, cursor?, limit ≤ 50}                                        | `Page<RiskCard>`                                                       | —                                                                        | —                              | 600/h            |
| `GET /api/risk/student`                                                        | `StudentRiskQuery` {studentId, limit ≤ 30}                                                                                | `{current, history[], flags[], interventions[]}`                       | `FORBIDDEN`                                                              | —                              | 600/h            |
| `setStudentFlag`                                                               | `SetStudentFlagInput` {studentId, kind, severity, reason}                                                                 | `StudentFlag`                                                          | `REASON_REQUIRED`, `SAFEGUARDING_REQUIRES_ADMIN`, `NOT_TEACHING_STUDENT` | key required                   | 120/h            |
| `resolveStudentFlag`                                                           | `ResolveFlagInput` {flagId, status: 'resolved'\|'dismissed', note}                                                        | `StudentFlag`                                                          | `NOTE_REQUIRED`, `SYSTEM_FLAG_NOT_RESOLVABLE_BY_TEACHER`                 | key required                   | 120/h            |
| `acknowledgeRiskFlags`                                                         | `AckFlagsInput` {flagIds[]}                                                                                               | `{updated: number}`                                                    | —                                                                        | key required                   | 120/h            |
| `recordIntervention`                                                           | `RecordInterventionInput` {studentId, riskScoreId?, flagId?, kind, note, followUpOn?, createContactLog?, aiSuggestionId?} | `RiskIntervention`                                                     | `NOT_TEACHING_STUDENT`                                                   | key required                   | 300/h            |
| `suggestIntervention` (AI)                                                     | `SuggestInterventionInput` {studentId, riskScoreId}                                                                       | `AiSuggestion`                                                         | `INSUFFICIENT_CREDITS`, `AI_VALIDATION_FAILED`, `AI_UNAVAILABLE`         | key required                   | 30/h/user        |
| `upsertRiskPolicy`                                                             | `RiskPolicyInput` {name, weights, thresholds, windowDays, minDataPoints}                                                  | `RiskPolicy` (new version)                                             | `WEIGHTS_NOT_1`, `THRESHOLDS_NOT_ORDERED`                                | —                              | 30/h             |
| `GET /api/analytics/school`                                                    | `SchoolAnalyticsQuery` {from, to, sectionIds?}                                                                            | `SchoolAnalytics` (one object per view in §3)                          | —                                                                        | —                              | 600/h            |
| `GET /api/analytics/section`                                                   | `SectionAnalyticsQuery` {sectionId, from, to}                                                                             | `SectionAnalytics`                                                     | `FORBIDDEN`                                                              | —                              | 600/h            |
| `POST /api/pdf/analytics`                                                      | `AnalyticsPdfInput` {scope, from, to}                                                                                     | `{fileId}`                                                             | —                                                                        | key required                   | 20/h             |
| `POST /api/pdf/risk-list`                                                      | `RiskPdfInput` {sectionId?, band?}                                                                                        | `{fileId}` (private, admin-only, download logged)                      | `FORBIDDEN`                                                              | key required                   | 10/h             |

The component inputs come from the owning features' exported selectors — `attendancePct` (F-AC-03), `resultHistory` (F-AC-06), `missingSubmissionStats` (F-AC-07), `behaviourPoints` (F-AC-08) — so this feature owns **no** duplicate arithmetic. A test asserts that `packages/domain/risk` imports those selectors and defines no attendance or GPA maths of its own.

## 8. Parts (build chunks)

**Part 1 — Analytics views and the dashboard** · the seven SQL views in §3 over the real tables, `GET /api/analytics/school` and `/section`, phone-first metric cards and the desktop chart grid with per-card empty/loading/error states, the holidays-as-gaps rule, PDF export · tests: view correctness fixtures (holiday gap vs zero day, mid-month transfers, exempt subjects); a lint rule forbidding hardcoded chart data in `apps/web` so **no mock array can ship** (PRODUCT-DECISIONS 3.9) · **Demo:** a head teacher opens `/app/analytics` on a phone and every number traces to a row, with holidays showing as gaps rather than 0 % dips.

**Part 2 — Risk policy and the scoring domain** · `risk_policies` with versioning, the five normalisation functions and the renormalising weighted sum in `packages/domain/risk`, the settings screen with a live worked example and the blocking sum check · tests: unit matrix over every component including all `insufficient_data` paths, renormalisation correctness, band boundaries, a property test that `0 ≤ score ≤ 100` for all inputs · **Demo:** move the attendance weight from 0.35 to 0.50 and watch the worked example recompute; a set that does not sum to 1.00 cannot be saved.

**Part 3 — Nightly job, scores and explainability** · `student_risk_scores` with RLS (no parent policy at all), the `app_risk_job` non-bypassing database role and its `SET LOCAL ROLE` wiring so the job is actually subject to RLS (not the service role), pg_cron + `jobs` fan-out, the components payload, the risk list, the explainability sheet with visible arithmetic, delta/rising, `risk.flagged` / `risk.digest` / `risk.improved` notifications · tests: job idempotency on (student, as_of); a student with zero marks still scored; pgTAP proving a parent cannot read a score by any path and a teacher only for their sections; an assertion that displayed components sum to the displayed score · **Demo:** the job runs on a 2,000-student fixture; a teacher taps a score of 78 and sees five rows of arithmetic that add up to 78.

**Part 4 — Flags and interventions** · `student_flags` with the `source` separation, the check constraint and the `app_risk_job` role's RLS predicate; hysteresis on system-flag resolution; human flag set/resolve with mandatory reason and note; safeguarding restricted to admins; `risk_interventions` with contact-log hand-off; the flags screen · tests: **the headline pgTAP test — run as `app_risk_job` via the same `SET LOCAL ROLE` the production job uses (never a shortcut that merely asserts against the policy definition), the role attempts to update a human flag and is refused**; hysteresis over a simulated eight-run sequence; safeguarding visibility · **Demo:** a teacher flags a child; the nightly job runs twice with the child's score falling to 12; the human flag is still open.

**Part 5 — AI-phrased intervention suggestion** · `ai_suggestions`, the anonymised structured prompt in `packages/domain/ai/prompts` with a version, the reserve → invoke → validate → debit → log flow through `adapters/ai`, the credit-cost button, graceful degradation to the manual path · tests: a test asserting the outbound prompt payload contains **no** student name, guardian field or identifier (regex over the serialised request); Zod rejection of a malformed response; zero-credit hard block; credit-ledger balance after a run · **Demo:** a teacher taps "Suggest with AI" for 1 credit, edits the paragraph, and records it as a guardian call with a contact-log entry — and with credits at zero the manual path still works.

## 9. Acceptance criteria

1. **Given** a student with 61 % attendance over the window and the default policy, **when** the job runs, **then** their attendance component is `clamp(0,100,(95−61)×2.5) = 85.00`, contributing `0.35 × 85 = 29.75` points, and both numbers appear in the explainability sheet.
2. **Given** a student with **no marks at all**, **when** the job runs, **then** they are still scored from attendance, missing work and behaviour, the two academic components are marked `insufficient_data`, the weights renormalise over `0.35 + 0.15 + 0.15 = 0.65`, and `data_completeness = 65.00` — the prototype excluded exactly this student.
3. **Given** any inputs, **when** the score is computed, **then** `0 ≤ score ≤ 100` (property test) and the component contributions shown on screen sum to the displayed score.
4. **Given** a score of 78, **when** it is banded with the default thresholds, **then** the band is `high` and a system flag opens; **when** the score falls below 55 for **two** consecutive runs, **then** the system flag resolves itself; **when** it falls below 55 for only one run, **then** the flag stays open.
5. **Given** a human flag set by a class teacher, **when** the nightly job runs any number of times and the student's score falls to 5, **then** the flag remains `open` — enforced by RLS on the non-bypassing `app_risk_job` role (never the Postgres service role, which would bypass RLS entirely) and asserted by a pgTAP test that runs `SET LOCAL ROLE app_risk_job` — the production job's own code path — and attempts the update, which is refused.
6. **Given** a human flag, **when** anyone tries to create it with `auto_clear_allowed = true`, **then** the check constraint refuses the row.
7. **Given** a parent, **when** they query `student_risk_scores`, `student_flags` or `risk_interventions` by any id **through the ordinary app/RLS path**, **then** nothing is returned — there is no parent policy on any of the three, asserted by querying `pg_policies`, not merely by behaviour. This is unchanged by the subject-access export (§5.13), which is a separate, audited, admin-triggered bundle a parent must formally request — never a row a parent's own session can select.
8. **Given** a teacher who does not teach a student, **when** they open that student's risk tab, **then** it is refused by both the permission check and RLS.
9. **Given** the nightly job run twice for the same `as_of`, **when** it completes, **then** exactly one score row exists per student and the second run updated rather than duplicated.
10. **Given** a school with 2,000 students, **when** the job runs, **then** it completes in under 90 seconds and issues no per-student round trip (set-based SQL, not the prototype's N+1 loop).
11. **Given** weights that sum to 0.95, **when** an admin saves the policy, **then** it is refused with `WEIGHTS_NOT_1`.
12. **Given** a policy change, **when** it is saved, **then** a new `risk_policies` version is created and previously stored scores keep their original `policy_version` and remain reproducible from their `components` payload.
13. **Given** a "Suggest with AI" request, **when** the outbound payload is inspected, **then** it contains the components and no student name, guardian name, phone, email or identifier — asserted by a test over the serialised request.
14. **Given** a workspace with zero AI credits, **when** a teacher taps "Suggest with AI", **then** it is hard-blocked with `INSUFFICIENT_CREDITS` and a "request credits" action, and the manual intervention note still saves.
15. **Given** a model response that fails Zod validation, **when** it returns, **then** nothing is shown or stored, the teacher sees "suggestion unavailable — write your own", and credits are refunded by the adapter's settle step.
16. **Given** a declared holiday, **when** the attendance trend chart renders on the analytics dashboard, **then** that day is a gap — not a 0 % point (the exact prototype bug on this exact screen).
17. **Given** no published exams, **when** the result-distribution card renders, **then** it shows "no exams published yet" rather than an empty axis.
18. **Given** a section with 4 students at `high`, **when** notifications dispatch, **then** the class teacher receives one `risk.digest`, not four `risk.flagged` notifications.
19. **Given** any component labelled "AI" in this area, **when** CI runs, **then** a rule asserts it calls `adapters/ai` — the prototype's "AI Risk Scoring" title over pure arithmetic would fail the build.

## 10. Tests

- **Unit (`packages/domain/risk`, ≥ 80 %)**: each of the five normalisation functions across its full range and its `insufficient_data` path; `weightedScore` with every subset of available components (32 cases) including all-missing; `band(score, thresholds)` at every boundary; `hysteresis(runs, thresholds)` over simulated sequences; `delta`/`rising`; the explainability payload builder (its contributions must sum to the pre-renormalisation total); a property test over 10,000 random inputs asserting `0 ≤ score ≤ 100` and monotonicity (a worse input never lowers the score).
- **Architecture test**: `packages/domain/risk` imports the four selectors and defines no attendance, GPA or completion arithmetic of its own (AST check) — one formula, one owner.
- **DB (pgTAP)**: isolation and escalation for `student_risk_scores`, `student_flags`, `risk_interventions`, `ai_suggestions`, `risk_policies`; **no parent policy exists on the first three** (asserted against `pg_policies`); running as `app_risk_job` via `SET LOCAL ROLE` (the production job's own code path, never the Postgres service role, which bypasses RLS), the role can write only `source = 'system'` flags and is refused on a human flag; the `auto_clear_allowed` check constraint; safeguarding flags invisible to teachers and to platform admin; `workspace_id` immutability.
- **Integration**: job idempotency on `(student, as_of)`; renormalisation end-to-end for a student with no marks; system-flag open/resolve hysteresis across eight simulated runs; `suggestIntervention` credit reserve/debit/refund paths; `upsertRiskPolicy` versioning.
- **Privacy test**: serialise the AI request and assert by regex that it contains no `name`, `phone`, `email`, `nid`, `student_code` or guardian field; assert `ai_suggestions.body` is never returned to a parent-scoped query.
- **E2E (360×800 and 1280×800, axe)**: `risk-list-and-explain` (asserting the on-screen contributions sum to the score), `human-flag-survives-job`, `record-intervention-with-ai`, `analytics-dashboard-holiday-gap`. Axe clean on the risk list, the explainability sheet and the dashboard.
- **Performance budgets**: nightly job < 90 s for 2,000 students, set-based with no per-student round trip; risk list p95 < 300 ms; explainability sheet < 150 ms (it reads the stored payload and computes nothing); each analytics view < 500 ms over a year of data; dashboard first paint < 1.5 s on a mid-range Android over 3G.

## 11. Open questions

1. **Should a rising score alone raise a flag**, even below the `elevated` band? Default: no — only `elevated`/`high` opens a system flag, and "Rising" is a filter. Flagged for the owner, since a child falling from 10 to 45 may deserve a look.
2. **Positive recognition.** The engine only surfaces risk. Assumed: "most improved" lives in F-AC-08 and a low-risk student needs no card. Worth revisiting — schools respond well to a weekly "three children who turned it around" list.
3. **Predictive validation.** The weights are reasoned, not fitted. Assumed: after a year of data the school can review whether flagged students actually disengaged; any move toward fitted weights must keep the formula deterministic and explainable (PRODUCT-DECISIONS 2.10 forbids a black box, not arithmetic tuning).
4. **Safeguarding flags** are modelled as a flag kind with admin-only visibility. Assumed adequate for v1, but safeguarding may warrant its own feature with its own retention, access log and disclosure rules — flagged to the owner as a compliance question, not a product one.
5. **Whether staff should see a school-wide risk list.** Currently yes (office roles chase attendance). Flagged: some schools will want it owner/admin only, which is a one-line permission change.
6. **Exam-eligibility interaction.** F-AC-03's 75 % rule and this feature's attendance component are independent — one is a school regulation, the other a triage signal. Assumed correct, but the risk card should link to the eligibility warning so a teacher sees both at once.
