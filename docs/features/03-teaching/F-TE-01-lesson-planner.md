# F-TE-01 — Lesson planner

|                  |                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | teaching                                                                                                                                                                              |
| Status           | planned                                                                                                                                                                               |
| Owner branch     | `feat/teaching-lesson-planner`                                                                                                                                                        |
| Depends on       | F-TE-02 (syllabus topics, optional link) · F-TE-03 (AI credits — hard dependency for "Generate with AI") · F-AC-03 (sections & `section_subjects`) · F-OP-04 (print queue, for Print) |
| Plan             | `docs/plan/ROADMAP.md` chunk — teaching, position 4                                                                                                                                   |
| Base44 reference | `docs/reference/base44-inventory/03-teaching-intelligence.md` §2.1, §2.3, §3.1(A), §3.1(B), §4 rows 1–2c, §5.1, §5.2, §7 items 1, 5, 16, §8 Q1                                        |

## 1. Purpose

A teacher opens **/app/lessons** the night before (or five minutes before) a class, picks the section-subject and the date, and gets a lesson plan they can actually teach from: objectives, a timed activity breakdown, materials, assessment, homework and differentiation. They can type it, generate it with AI into the _same_ structure, or start from a template. When it is ready they mark it `ready`, and after the class `taught` — which is what turns a plan into a pacing signal (F-TE-02). They can share it with a colleague and print it.

**What Base44 intended, and what was broken.** The prototype shipped _two_ planners writing to one `LessonPlan` entity with incompatible field sets: `/lesson-planner` (manual, wrote `title`/`content`/`materials_needed`) and `/ai-planner` (AI-first, wrote `subject`/`topic`/`starter`/`main_activity`/… and **never wrote the required `title`**). Each list rendered the other's rows as blank. Neither writer set `workspace_id`, which `LessonPlan`'s own RLS required for read — so saved plans disappeared. The AI planner flattened `objectives[]` and `materials[]` into newline strings and concatenated two differentiation fields into one, then re-parsed them by string surgery on load (`differentiation.replace(/Support: /,'')…`) — any teacher who typed "Support:" corrupted their own plan. Neither AI call had a `try/catch`, so a network blip left the spinner spinning and the button permanently disabled. Print was imported and never rendered; inline section editing was declared and never wired.

**Done looks like:** one route, one canonical row shape, arrays stored as arrays, AI as a button inside the form (not a separate product), every failure visible and recoverable, and a plan that survives a refresh in the workspace that created it. Per PRODUCT-DECISIONS 3.1, the legacy free-text fields (`content`, `materials_needed`, `homework_legacy`) are **not migrated**.

## 2. Roles and permissions

`packages/domain/permissions.ts` keys. All checks are `can(ctx.role, key)` on the server _and_ an RLS policy.

| Action                                 | permission key                        | owner | admin | teacher  | staff | parent | platform         |
| -------------------------------------- | ------------------------------------- | ----- | ----- | -------- | ----- | ------ | ---------------- |
| List/read own plans                    | `lesson_plan.read.own`                | ✓     | ✓     | ✓        | —     | —      | —                |
| Read a plan shared with me             | `lesson_plan.read.shared`             | ✓     | ✓     | ✓        | —     | —      | —                |
| Read **any** plan in the workspace     | `lesson_plan.read.any`                | ✓     | ✓     | —        | —     | —      | read-only bypass |
| Create a plan                          | `lesson_plan.write`                   | ✓     | ✓     | ✓        | —     | —      | —                |
| Update a plan I own                    | `lesson_plan.write`                   | ✓     | ✓     | ✓        | —     | —      | —                |
| Update a plan shared to me with `edit` | `lesson_plan.write`                   | ✓     | ✓     | ✓        | —     | —      | —                |
| Delete a plan                          | `lesson_plan.delete`                  | ✓     | ✓     | own only | —     | —      | —                |
| Generate with AI                       | `ai.generate` + credit balance > cost | ✓     | ✓     | ✓        | —     | —      | —                |
| Share to a colleague                   | `lesson_plan.share`                   | ✓     | ✓     | ✓ (own)  | —     | —      | —                |
| Save as / manage templates             | `lesson_template.write`               | ✓     | ✓     | ✓        | —     | —      | —                |
| Publish a template school-wide         | `lesson_template.publish`             | ✓     | ✓     | —        | —     | —      | —                |
| Print / export PDF                     | `lesson_plan.print`                   | ✓     | ✓     | ✓        | —     | —      | —                |

Notes. A teacher never sees another teacher's plan unless it was explicitly shared (per PRODUCT-DECISIONS 3.5, the share target list comes from `workspace_members` where `role ∈ {teacher, admin, owner}` and `status='active'` — never from a `users.role` column, which is exactly what made Base44's colleague picker permanently empty). Admin/owner read-any exists so a head of department can review planning; it is a **read** grant, not an edit grant. Parents never touch this feature.

## 3. Data

Tables per `docs/architecture/DATA-MODEL.md`. Columns below are **proposed; DATA-MODEL.md wins** if it differs.

### 3.1 `lesson_plans` (canonical shape)

Tenant key `workspace_id`. Replaces Base44's `LessonPlan` entirely; the legacy columns are dropped, not carried.

| column                                     | type                                                 | notes                                                                           |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `id`                                       | uuid pk                                              |                                                                                 |
| `workspace_id`                             | uuid not null → `workspaces`                         | tenant key, **set server-side from `WorkspaceContext`, never from the form**    |
| `section_subject_id`                       | uuid null → `section_subjects`                       | the class this is for; null allowed for a personal-workspace / unassigned draft |
| `syllabus_topic_id`                        | uuid null → `syllabus_topics`                        | the curriculum link (F-TE-02). Null = off-syllabus                              |
| `title`                                    | text not null                                        | required, always set by every path including AI (see 5.2)                       |
| `planned_date`                             | date null                                            | calendar date in workspace tz                                                   |
| `period_number`                            | smallint null                                        | which period, if the teacher pins it to a timetable slot                        |
| `duration_minutes`                         | smallint not null default 45                         |                                                                                 |
| `teaching_style`                           | `lesson_teaching_style` enum null                    | `direct \| inquiry \| collaborative \| project \| mixed`                        |
| `objectives`                               | text[] not null default '{}'                         | **array, not a joined string**                                                  |
| `materials`                                | text[] not null default '{}'                         | array                                                                           |
| `activities`                               | jsonb not null default '[]'                          | ordered array of `{ phase, title, content, duration_minutes }` — see 5.1        |
| `assessment`                               | text null                                            |                                                                                 |
| `homework`                                 | text null                                            |                                                                                 |
| `differentiation_support`                  | text null                                            | **two separate columns**, never concatenated                                    |
| `differentiation_extension`                | text null                                            |                                                                                 |
| `notes`                                    | text null                                            | free-text teacher notes, never sent to AI                                       |
| `status`                                   | `lesson_plan_status` enum not null default `'draft'` | `draft \| ready \| taught`                                                      |
| `taught_at`                                | timestamptz null                                     | stamped when status → `taught`                                                  |
| `generated_by_ai`                          | boolean not null default false                       | true if any AI generation produced the current body                             |
| `ai_prompt_version`                        | text null                                            | e.g. `lesson_plan.v1` — which prompt produced it                                |
| `ai_generation_id`                         | uuid null → `ai_generations`                         | link to the F-TE-04 generation record for audit/appeal                          |
| `source_template_id`                       | uuid null → `lesson_templates`                       |                                                                                 |
| `created_by`                               | uuid not null → `profiles`                           | the author; immutable                                                           |
| `created_at` / `updated_at` / `deleted_at` | timestamptz                                          | soft delete (teachers expect undo)                                              |

Indexes (proposed): `(workspace_id, created_by, planned_date desc)`, `(workspace_id, section_subject_id, planned_date desc)`, `(workspace_id, status)`, `(workspace_id, syllabus_topic_id)`, and a `gin` index on `to_tsvector('simple', title)` for search.

**RLS in words.** SELECT: active member of the workspace AND (`created_by = app.current_user_id()` OR the row has a matching `lesson_plan_shares` row for me OR `app.has_role(workspace_id,'{owner,admin}')`). INSERT: `app.has_role(workspace_id,'{owner,admin,teacher}')` WITH CHECK `created_by = app.current_user_id()` and `workspace_id = app.current_workspace_id()`. UPDATE: author, or a share row with `permission='edit'`, or owner/admin; WITH CHECK forbids changing `workspace_id` or `created_by`. DELETE: author or owner/admin. Platform admin: read-only bypass, no write.

### 3.2 `lesson_plan_shares`

| column                | type                                              | notes                                                                                                        |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`                  | uuid pk                                           |                                                                                                              |
| `workspace_id`        | uuid not null                                     | tenant key, denormalised for RLS                                                                             |
| `lesson_plan_id`      | uuid not null → `lesson_plans` on delete cascade  |                                                                                                              |
| `shared_with_user_id` | uuid not null → `profiles`                        | must be an **active** `workspace_members` row in the same workspace (checked in a trigger, not just the app) |
| `permission`          | `share_permission` enum not null default `'view'` | `view \| edit`                                                                                               |
| `shared_by`           | uuid not null                                     |                                                                                                              |
| `created_at`          | timestamptz                                       |                                                                                                              |

Unique `(lesson_plan_id, shared_with_user_id)`. This is a real table, not Base44's `shared_with` JSON-string column — that design is why sharing could never be queried from the recipient's side.

### 3.3 `lesson_templates`

| column                                            | type                                               | notes                                                                                                                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id` / `workspace_id` / `created_by` / timestamps |                                                    |                                                                                                                                                                                                                   |
| `name`                                            | text not null                                      |                                                                                                                                                                                                                   |
| `subject_id`                                      | uuid null → `subjects`                             |                                                                                                                                                                                                                   |
| `grade_level_id`                                  | uuid null → `grade_levels`                         |                                                                                                                                                                                                                   |
| `scope`                                           | `template_scope` enum not null default `'private'` | `private \| school` — `school` requires `lesson_template.publish`                                                                                                                                                 |
| `body`                                            | jsonb not null                                     | the same shape as a plan minus `title`/`planned_date`/`status`: `{objectives, materials, activities, assessment, homework, differentiation_support, differentiation_extension, duration_minutes, teaching_style}` |
| `tags`                                            | text[] not null default '{}'                       | authored in the template editor (in Base44 `tags` was only ever written by a dead file)                                                                                                                           |
| `use_count`                                       | integer not null default 0                         | incremented server-side when a template is applied — a real counter, unlike Base44's never-incremented `print_count`                                                                                              |

### 3.4 Private files

A lesson plan has no attachments of its own in v1; a teacher attaches **resources** (F-TE-05) by reference. Proposed join table `lesson_plan_resources(workspace_id, lesson_plan_id, resource_id, created_at)` — the plan's print/PDF lists them but does not embed their files.

### 3.5 Tables read, not written

`section_subjects`, `sections`, `grade_levels`, `subjects`, `academic_years`, `syllabus_topics`, `workspace_members`, `profiles`, `ai_credit_ledger` (balance display only), `print_jobs` (written by the Print action via F-OP-04's server action, not directly).

## 4. Workflows

### 4.1 Create a plan manually

**Trigger:** FAB "New plan" on `/app/lessons` (bottom-right, thumb-reachable) or "Plan this" from a `syllabus_topics` row (F-TE-02).

1. A `FormSheet` opens (full-height sheet on phone, dialog ≥1024). Step-free single form, sections collapsible.
2. Header fields: title (required), section-subject (a `Combobox` defaulted to the teacher's most-used), date (defaults today in workspace tz), duration, teaching style, syllabus topic (optional, filtered to the section-subject's syllabus).
3. Body sections: Objectives (chip list, add-on-Enter), Materials (chip list), Activities (ordered cards: phase, title, content, minutes; drag handles ≥44 px; a "+ activity" row), Assessment, Homework, Differentiation → Support / Extension, Notes.
4. Save → `lessonPlan.create`. Optimistic insert via TanStack Query; the server action returns the canonical row and replaces it.
5. **Outcome:** row in `lesson_plans` with `status='draft'`, `workspace_id` from context, `created_by = auth.uid()`.
6. **Audit:** `audit_events` insert by the generic trigger (`lesson_plans.INSERT`). No notification.
7. **Failures:** validation errors render inline on the offending field and the sheet does not close. A 403 (not a member / wrong role) shows "You no longer have access to this school" and routes to the workspace switcher. A network failure keeps the sheet open with the draft intact and offers Retry; nothing is silently lost.

### 4.2 Generate with AI

**Trigger:** the "Generate with AI" button in the plan form header. Enabled only when title **or** topic and a section-subject are set.

1. Client shows the cost first: "Uses 5 credits · you have 37". If balance < cost the button is disabled with "Not enough credits — Request credits" (deep link to F-TE-03's request sheet). The UI check is convenience; the server check is authoritative.
2. `lessonPlan.generate` server action → `ai.reserve(workspace, user, 'lesson_plan.generate')` (F-TE-03 §5) → prompt `lesson_plan.v1` (F-TE-04 §4.1) → structured output validated by `LessonPlanAIOutput` Zod schema → `ai.settle(...)` → `ai_generations` row.
3. The action returns the parsed object **plus** a `generation_id`. The client merges it into the open form — it does **not** save yet. Fields the teacher already typed are preserved unless they tick "replace my text" (default: AI fills empty fields, appends to non-empty arrays).
4. A "Generated by AI" pill appears with an Undo (restores the pre-generation form snapshot held in component state) and a "What was sent?" link that shows the exact redacted prompt inputs.
5. Teacher edits, then Saves normally. On save, `generated_by_ai=true`, `ai_prompt_version='lesson_plan.v1'`, `ai_generation_id` set.
6. **Failures** (all shown as an inline alert inside the sheet, never a bare toast, and the button always re-enables — the Base44 bug was a `setGenerating(false)` unreachable after a throw, so the mutation's `onSettled` is what resets state here, not `onSuccess`):
   - `INSUFFICIENT_CREDITS` → "You have 2 of 5 credits. Ask your school owner for more." + Request button. No credits consumed.
   - `AI_TIMEOUT` (60 s) → "Claude took too long. Nothing was charged." Reservation released. Retry button.
   - `AI_SCHEMA_INVALID` (output failed Zod after 1 retry) → "The generated plan came back malformed. Nothing was charged." Reservation released; the raw output is stored on the `ai_generations` row for debugging, never shown to the user.
   - `AI_REFUSAL` (`stop_reason === 'refusal'`) → "Claude declined this request." Reservation released, `ai_generations.status='refused'`, category logged.
   - `RATE_LIMITED` → "Too many generations right now. Try again in a minute."

### 4.3 Apply a template

Trigger: "Start from template" in the empty form, or the Templates tab. Picker lists private templates then school templates, searchable by name/tag/subject. Applying fills every body field, sets `source_template_id`, increments `use_count`, and leaves title/date/section for the teacher. Applying over a partly-filled form warns first.

### 4.4 Save as template

Trigger: overflow menu on an open plan → "Save as template". Name (defaults to the plan title), scope (private / school — school only with `lesson_template.publish`), tags. Writes `lesson_templates` with the current body. Audit event `lesson_template.created`.

### 4.5 Share with a colleague

1. Overflow → Share. A sheet lists active workspace members with role `teacher|admin|owner`, excluding me, searchable, each with a view/edit segmented control.
2. Confirm → `lessonPlan.share` inserts/updates `lesson_plan_shares` rows.
3. **Outcome:** recipient gets an in-app notification `lesson_plan.shared` with `action_url = /app/lessons/{id}`, and the plan appears under their "Shared with me" filter — which works because the filter queries `lesson_plan_shares`, not a JSON blob on the row.
4. Unshare removes the row and emits no notification.
5. **Failure:** sharing to a `removed` member is rejected by the trigger with `MEMBER_NOT_ACTIVE`.

### 4.6 Status lifecycle

`draft → ready → taught`. `ready` is a manual toggle. `taught` can be set manually, or — the useful path — is set as a side effect of logging the lesson in F-TE-02 (`lesson_logs` row referencing this plan sets `status='taught'`, `taught_at=now()`). Moving back from `taught` to `ready` is allowed and clears `taught_at` (teachers mis-tap). Every transition is audited.

### 4.7 Print

Overflow → Print. Calls `POST /api/pdf/lesson-plan` with the plan id → React-PDF renders an A4 sheet with the school header from `school_profiles` (never a hardcoded academy name), stores it in `files`, and either opens the browser print dialog or, if the teacher chose "Send to print queue", creates a `print_jobs` row (F-OP-04) with `copies=1`. Both outcomes are real rows — Base44's print buttons were `alert()` calls.

### 4.8 Phone flow (360×800), explicitly

- `/app/lessons` is a **`DataList`** of cards: title, section-subject chip, date, status dot, AI pill. Segmented filter at top: **Mine · Shared · All** (All only for owner/admin). A month/date scroller sits under the filter and is horizontally scrollable.
- The **FAB** is bottom-right above the `BottomNav`, one-thumb reachable.
- The plan form is a **full-height `Sheet`** with a sticky footer holding `Save` (primary, right) and `Generate with AI` (secondary, left) — both ≥44 px, both inside the thumb arc.
- Activity cards are **collapsed to one line by default**; tapping expands. Reordering on phone uses up/down buttons in the card's overflow, not drag (drag at 360 px with a soft keyboard open is unusable); drag handles appear at ≥1024.
- The plan detail view is a **route**, not a sheet (`/app/lessons/[id]`), so it is shareable and back-button-correct.
- Share, Template picker and Print are **sheets**; Delete is an `AlertDialog`.

## 5. Business rules and calculations

**5.1 Activity shape.** `activities` is an ordered JSON array. Each element: `{ phase: 'starter'|'main'|'practice'|'plenary'|'other', title: string, content: string, duration_minutes: integer >= 0 }`. The four named phases come from the Base44 AI planner's section config and are what the AI prompt is asked to produce; `other` exists so a teacher can add a fifth block. Order is array order, not a stored index. Base44 stored these as four fixed columns _and_ lost the durations on save (`AIPlanner.jsx:140-143` reloaded them as `''`); the array keeps them.

**5.2 Title is always set.** If an AI generation runs and the title field is empty, the server sets `title = «Topic» — «Subject»` from the prompt inputs before returning, and the field is pre-filled in the form. `title` is `not null` in the schema. This closes the Base44 defect where every AI-saved plan violated its own required constraint.

**5.3 Duration consistency.** `Σ activities[].duration_minutes` is shown next to the header duration with a soft warning when it differs by more than 5 minutes ("Your activities add up to 55 min but the lesson is 45 min"). It is **never** a save blocker.

**5.4 Default section-subject.** The form defaults to the teacher's most frequently used `section_subject_id` over the last 30 days; ties broken by most recent. Computed in SQL, not in the client.

**5.5 "Today".** `planned_date` defaults to `(now() at time zone school_profiles.timezone)::date`, default `Asia/Dhaka`. Never `new Date()` in the browser.

**5.6 AI credit cost.** `lesson_plan.generate` = **5 credits** (PRODUCT-DECISIONS 3.3). The price is read from the `ai_actions` table at call time, never hardcoded in the client; the client only displays what the server returns.

**5.7 Regeneration is a new charge.** Each "Generate" press reserves and settles independently. There is no free retry — except when the failure is ours (timeout, schema-invalid, refusal, 5xx), in which case the reservation is released and nothing is debited (F-TE-03 §5.4).

**5.8 AI never sees student PII.** The lesson-plan prompt receives subject, topic, grade-level **label** (e.g. "Class 6"), duration, style, teacher-typed objectives and notes. It receives no student names, no section roster, no guardian data. Enforced by the `LessonPlanAIInput` schema (F-TE-04 §3).

**5.9 Soft delete.** Deleting sets `deleted_at`; the list hides it; an "Recently deleted" view under Settings restores within 30 days, after which a nightly job hard-deletes. Shares are cascade-deleted on hard delete only.

**5.10 Template `use_count`** increments once per apply, server-side, in the same transaction as the plan create/update. It is displayed as "used N times" and is the sort key for the school template list.

## 6. UI

| Screen      | Route                    | 360×800                                                      | ≥1024                                                               | Primary action | Empty                                                                                                                     | Loading                                                    | Error                                                |
| ----------- | ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| Plan list   | `/app/lessons`           | `DataList` of cards + segmented filter + date scroller + FAB | Two-pane: filter sidebar + table (`DataTable`) with a preview panel | New plan       | "No plans yet. Plan your first lesson — or generate one in about 20 seconds." + two buttons (New plan / Generate with AI) | 6 skeleton cards, no spinner                               | Inline `Alert` with Retry; list keeps last good data |
| Plan detail | `/app/lessons/[id]`      | Stacked sections, sticky action bar                          | Two-column: body left, meta/actions right                           | Edit           | n/a                                                                                                                       | Skeleton body                                              | Full-page `ErrorState` with Back                     |
| Plan form   | sheet over either route  | Full-height `Sheet`, sticky footer                           | `Dialog` 720 px                                                     | Save           | Prefilled defaults                                                                                                        | Disabled fields + skeleton on the section-subject combobox | Inline field errors + top-of-sheet `Alert`           |
| Templates   | `/app/lessons/templates` | Card list, tabs Private/School                               | Grid 3-up                                                           | New template   | "Templates save you retyping. Save any plan as a template."                                                               | Skeletons                                                  | Inline                                               |
| Share sheet | over detail              | `Sheet`, search + member rows                                | `Dialog`                                                            | Share          | "No colleagues to share with yet."                                                                                        | Skeleton rows                                              | Inline                                               |

Components from `packages/ui`: `AppShell`, `DataList`, `DataTable`, `FormSheet`, `Sheet`, `Dialog`, `Combobox`, `ChipInput`, `SortableCardList`, `SegmentedControl`, `StatusDot`, `CreditBadge` (from F-TE-03), `AiGenerateButton` (from F-TE-04), `EmptyState`, `ErrorState`, `AlertDialog`, `Skeleton`. No ad-hoc colours or spacing.

Accessibility: every action ≥44 px; the generate button announces its busy state via `aria-busy` and an `aria-live="polite"` region reads "Generating lesson plan…" then "Lesson plan ready, review before saving"; activity reordering buttons carry `aria-label="Move activity N up"`.

## 7. Server contracts

All in `apps/web/app/(school)/app/lessons/_actions.ts`, schemas in `packages/contracts/lessons.ts`. Every action: `parse input → can(role, key) → repository call with WorkspaceContext → Result<T, ApiError>`.

| Name                                                                 | Input schema                                                                                                                                                         | Output                                                         | Errors                                                                                               | Idempotency                                                                               | Rate limit                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `lessonPlan.list`                                                    | `LessonPlanListInput` `{ filter: 'mine'\|'shared'\|'all', sectionSubjectId?, status?, from?, to?, q?, cursor?, limit<=50 }`                                          | `{ items: LessonPlan[], nextCursor }`                          | `FORBIDDEN`                                                                                          | n/a                                                                                       | 120/min/user                                               |
| `lessonPlan.get`                                                     | `{ id: uuid }`                                                                                                                                                       | `LessonPlanDetail` (plan + shares + resources + template name) | `NOT_FOUND`, `FORBIDDEN`                                                                             | n/a                                                                                       | 240/min                                                    |
| `lessonPlan.create`                                                  | `LessonPlanCreateInput` (all body fields; **no** `workspace_id`, **no** `created_by`)                                                                                | `LessonPlan`                                                   | `VALIDATION`, `FORBIDDEN`, `PLAN_LIMIT`                                                              | `idempotency_key`                                                                         | 60/min                                                     |
| `lessonPlan.update`                                                  | `LessonPlanUpdateInput` `{ id, ...partial body }`                                                                                                                    | `LessonPlan`                                                   | `NOT_FOUND`, `FORBIDDEN`, `VALIDATION`, `CONFLICT` (stale `updated_at`)                              | `idempotency_key`                                                                         | 120/min                                                    |
| `lessonPlan.setStatus`                                               | `{ id, status: 'draft'\|'ready'\|'taught' }`                                                                                                                         | `LessonPlan`                                                   | as above                                                                                             | `idempotency_key`                                                                         | 60/min                                                     |
| `lessonPlan.delete`                                                  | `{ id }`                                                                                                                                                             | `{ ok: true }`                                                 | `NOT_FOUND`, `FORBIDDEN`                                                                             | `idempotency_key`                                                                         | 30/min                                                     |
| `lessonPlan.generate`                                                | `LessonPlanAIInput` `{ sectionSubjectId?, subject, topic, gradeLabel, durationMinutes, teachingStyle, objectivesHint?, notes?, includeHomework, includeAssessment }` | `{ generationId, creditsCharged, output: LessonPlanAIOutput }` | `INSUFFICIENT_CREDITS`, `AI_TIMEOUT`, `AI_SCHEMA_INVALID`, `AI_REFUSAL`, `RATE_LIMITED`, `FORBIDDEN` | `idempotency_key` **required** — a replayed key returns the first result and charges once | 10/min/user, 100/hour/workspace (also enforced in F-TE-03) |
| `lessonPlan.share`                                                   | `{ id, targets: [{ userId, permission }] }`                                                                                                                          | `{ shares: Share[] }`                                          | `MEMBER_NOT_ACTIVE`, `FORBIDDEN`                                                                     | `idempotency_key`                                                                         | 30/min                                                     |
| `lessonPlan.unshare`                                                 | `{ id, userId }`                                                                                                                                                     | `{ ok: true }`                                                 | `NOT_FOUND`                                                                                          | —                                                                                         | 30/min                                                     |
| `lessonTemplate.list` / `.create` / `.update` / `.delete` / `.apply` | `LessonTemplate*Input`                                                                                                                                               | template rows / applied body                                   | `FORBIDDEN`, `VALIDATION`                                                                            | `idempotency_key` on writes                                                               | 60/min                                                     |
| `POST /api/pdf/lesson-plan` (route handler)                          | `{ id, mode: 'download'\|'queue' }`                                                                                                                                  | `{ fileId, url? , printJobId? }`                               | `NOT_FOUND`, `FORBIDDEN`, `PDF_FAILED`                                                               | `idempotency_key`                                                                         | 20/min                                                     |

`lessonPlan.generate` never accepts a client-supplied credit cost, model id or prompt. It accepts only the typed fields above; anything else is stripped by `.strict()` on the Zod object.

## 8. Parts (build chunks)

**Part 1 — Schema, contracts, repository (≤1 day).**
Scope: migration for `lesson_plan_status`, `lesson_teaching_style`, `share_permission`, `template_scope` enums, `lesson_plans`, `lesson_plan_shares`, `lesson_templates`, indexes, RLS policies, audit trigger. `packages/contracts/lessons.ts` Zod schemas. `packages/db/repositories/lessonPlans.ts`.
Files: `supabase/migrations/*_lesson_plans.sql`, `supabase/tests/lesson_plans_rls.sql`, `packages/contracts/lessons.ts`, `packages/db/src/repositories/lessonPlans.ts`.
Tests: pgTAP — cross-workspace SELECT returns 0 rows; a teacher cannot SELECT a colleague's unshared plan; a teacher cannot UPDATE `workspace_id` or `created_by`; a `removed` member loses SELECT; contract/enum parity test.
**Demo:** `psql` transcript showing teacher A's plan invisible to teacher B and to school B, and visible after a share row is inserted.

**Part 2 — Manual CRUD + list (≤2 days).**
Scope: `/app/lessons` list with filters and cursor pagination, `/app/lessons/[id]` detail, create/update/delete/setStatus actions, `FormSheet` with chip inputs and the activity card list (up/down reorder), soft delete + restore.
Files: route group under `app/(school)/app/lessons/`, `_actions.ts`, `_components/PlanForm.tsx`, `PlanCard.tsx`, `ActivityEditor.tsx`.
Tests: unit on the domain `planTotals()` and default-section resolver; integration on each action incl. `CONFLICT` on stale update; e2e "create → appears in list → edit → status ready → delete → restore" at 360×800 and 1280×800.
**Demo:** a teacher creates, edits and marks a plan `ready` on a 360 px viewport without horizontal scroll.

**Part 3 — Templates (≤1 day).**
Scope: `lesson_templates` CRUD, save-as-template from a plan, apply-template with the overwrite warning, `use_count`, school scope gated by `lesson_template.publish`.
Tests: teacher cannot create a `school`-scoped template; apply increments `use_count` exactly once under a replayed idempotency key.
**Demo:** save a plan as a template, start a new plan from it, see "used 1 time".

**Part 4 — Sharing + notifications (≤1 day).**
Scope: `lesson_plan_shares`, the member-picker sheet fed from `workspace_members`, the "Shared" filter, `lesson_plan.shared` notification with `action_url`, unshare, the active-member trigger.
Tests: pgTAP — a share to a `pending` or `removed` member is rejected; recipient's SELECT works only through the share; e2e two-user journey.
**Demo:** teacher A shares with teacher B; B sees it under "Shared" and, with `edit`, can save a change.

**Part 5 — Generate with AI + print (≤2 days).** _Requires F-TE-03 Parts 1–4 and F-TE-04 Part 1._
Scope: `lessonPlan.generate` wired to `adapters/ai` with the `lesson_plan.v1` prompt, reserve/settle, the merge-into-form UX with Undo and "What was sent?", every failure state from 4.2, the cost/balance badge; `POST /api/pdf/lesson-plan` with the school header, download and queue modes.
Tests: integration with a mocked Anthropic client covering success, timeout, schema-invalid-then-retry-then-fail, refusal, insufficient credits — asserting the ledger is unchanged on every failure; e2e for the disabled-at-zero state; a11y check on the busy announcement.
**Demo:** generate a plan with 5 credits deducted and visible in the balance chip; then force a timeout and show the balance unchanged and the button re-enabled.

Order: 1 → 2 → 3 → 4 → 5. Parts 3 and 4 are independent of each other.

## 9. Acceptance criteria

1. **Given** I am a teacher in school A, **when** I create a lesson plan, **then** the row's `workspace_id` equals school A and `created_by` equals my user id, regardless of what the client sent.
2. **Given** a plan exists in school A, **when** a teacher in school B lists plans, **then** it is not returned and no error leaks its existence.
3. **Given** teacher B has not been shared a plan, **when** B opens its URL directly, **then** B gets a not-found page, not the plan.
4. **Given** I generate a plan with AI and my title field is empty, **when** the generation returns, **then** the title field is pre-filled as "«Topic» — «Subject»" and saving succeeds.
5. **Given** I have 4 credits and a lesson-plan generation costs 5, **when** I open the plan form, **then** the Generate button is disabled, shows "Not enough credits", and offers "Request credits".
6. **Given** the Claude call times out at 60 s, **when** the generation fails, **then** an inline alert says nothing was charged, my credit balance is unchanged in the ledger, and the Generate button is enabled again.
7. **Given** the model returns output that fails the Zod schema twice, **when** the generation fails, **then** no credits are debited, the raw output is stored on the `ai_generations` row, and the user sees "came back malformed", never the raw text.
8. **Given** I typed my own objectives, **when** I generate with AI without ticking "replace my text", **then** my objectives are preserved and AI objectives are appended.
9. **Given** a generated plan, **when** I press Undo on the "Generated by AI" pill, **then** every field returns to its pre-generation value and no credits are refunded (the charge already happened).
10. **Given** an activity list totalling 55 minutes on a 45-minute lesson, **when** I save, **then** the plan saves and a soft warning is shown — saving is never blocked.
11. **Given** a plan with objectives `['A','B']`, **when** I save and reload, **then** I get exactly `['A','B']` as an array — no newline joining, no string re-parsing.
12. **Given** a plan whose differentiation support text contains the word "Extension:", **when** I save and reload, **then** both differentiation fields are byte-identical to what I typed.
13. **Given** I share a plan with teacher B as `view`, **when** B opens it, **then** B can read it and every edit control is absent; **and when** I change the share to `edit`, B can save.
14. **Given** teacher B is removed from the workspace, **when** B opens a plan previously shared with them, **then** access is denied by RLS on the next request.
15. **Given** a plan marked `ready`, **when** a `lesson_logs` row referencing it is created in F-TE-02, **then** the plan's status becomes `taught` and `taught_at` is stamped in workspace time.
16. **Given** I press Print → Send to queue, **when** it completes, **then** a `print_jobs` row exists with the rendered PDF in `files` and the school's name from `school_profiles` on page 1.
17. **Given** the list at 360×800, **when** I scroll, **then** there is no horizontal scrollbar, the FAB never overlaps the bottom nav, and every tap target is ≥44 px.
18. **Given** I delete a plan, **when** I open "Recently deleted", **then** it is listed and restorable, and the list view does not show it.
19. **Given** I submit the same `lessonPlan.generate` idempotency key twice, **when** the second request runs, **then** it returns the first result and the ledger shows exactly one debit.
20. **Given** I am an admin, **when** I filter "All", **then** I see every teacher's plans read-only and the Edit control is absent on plans I do not own.

## 10. Tests

- **Unit (`packages/domain`, ≥80 %):** `planTotalMinutes()`, `mergeAiOutputIntoForm()` (preserve vs replace), `defaultTitleFromPrompt()`, `canEditPlan(role, plan, shares)`, status transition table, `todayInWorkspaceTz()`.
- **DB (pgTAP):** isolation and escalation on `lesson_plans`, `lesson_plan_shares`, `lesson_templates` — cross-workspace read/write, self-share escalation, `workspace_id`/`created_by` immutability, share-to-inactive-member rejection, soft-delete visibility.
- **Integration (Vitest + test DB):** every server action, including idempotency replay, stale-update conflict, and all five AI failure branches with a mocked Anthropic client asserting ledger state.
- **e2e (Playwright, 360×800 + 1280×800, axe):** J1 create→edit→ready→delete→restore; J2 generate-with-AI happy path with credit deduction; J3 generate at zero credits; J4 two-user share (view then edit); J5 apply template; J6 print to queue.
- **a11y:** axe clean on list, detail, form sheet; keyboard-only path through the form; `aria-live` generation announcements asserted.
- **Performance budgets:** list first contentful paint < 1.5 s on a simulated 3G phone profile; `lessonPlan.list` p95 < 200 ms for 500 plans; the generate action's own overhead (excluding the model call) < 150 ms.

## 11. Open questions

1. **Should `ready` be automatic?** Assumed manual. Alternative: a plan with ≥1 objective and ≥1 activity auto-promotes to `ready`. Default taken: manual, because status is a teacher's own signal.
2. **Co-teaching.** A `section_subject` may have a primary + assistant teachers (PRODUCT-DECISIONS 3.8). Should assistants automatically see the primary's plans for that section-subject? Default assumed: **no** — sharing stays explicit. Cheap to change to an implicit share later.
3. **Plan count limits per plan tier.** Not in the plan matrix (§5.1 of PRODUCT-DECISIONS lists teachers/students/storage/credits only). Default assumed: unlimited plans; `PLAN_LIMIT` error code is reserved but unused.
4. **Bulk "plan a week".** Generating five plans for a week from five topics is an obvious next step and five times the credit cost. Deferred; noted in `docs/product/FUTURE.md`.
5. **Attachment model.** `lesson_plan_resources` is proposed here but may belong to F-TE-05's schema section. DATA-MODEL.md decides which spec owns it.
