# 03 — Teaching Intelligence, Curriculum, AI, Resources, Workload, Analytics

Product-intent inventory of the Base44 export at `F:\Acadigma Campus\Acadigma Campus Base44 Source Code`.
All paths below are relative to that root. Read-only audit — nothing was modified.

**Export caveat:** `src/components/layout/Sidebar.jsx` is **truncated at 1,134 bytes** (cuts off mid-`navGroups` declaration, file ends at `label: 'Overview',`). The desktop nav definitions are therefore not recoverable from this export; all nav/role visibility below is read from `src/components/layout/MobileNav.jsx`, which is complete. `export-report.json` also records a failed preview-iframe scan.

---

## 1. Area summary

The owner is building the "teacher brain" of a school SaaS: everything a teacher does between _what I'm supposed to teach_ and _what I actually taught_, plus the admin's view over it.

Five product bets are visible in the code:

1. **Lesson planning** — write a plan by hand, generate one with AI, or start from a saved template. Two separate, competing implementations exist (`/lesson-planner` and `/ai-planner`) writing to the same `LessonPlan` entity with two incompatible field sets.
2. **Curriculum engine** — a teaching journal (diary), a place to park the official syllabus PDF per class/term, and a shared school book library (softcopies + Drive links + covers).
3. **A structured curriculum spine that was designed but never wired up** — `Syllabus` (chapter → topic → sequence → estimated periods → status), `LessonLog` (planned vs. actually-covered, periods used), and an AI pacing planner that reads both. All three UIs exist and are **not imported anywhere**.
4. **Personal + school resource estate** — teachers upload worksheets/exams into colour-coded folders with auto-generated IDs (`WS-000214`), share with colleagues, and admins get a school-wide master table with orphan detection and reassignment when a teacher leaves.
5. **AI tooling + a credit economy** — 8 one-shot AI tools (worksheet, quiz, lesson plan, essay prompts, flashcards, notice, parent email, image), and an entity design for per-school AI billing (shared pool vs. per-teacher daily allocation, top-ups, teacher requests). **The economy is entirely cosmetic: no AI call anywhere in the app writes a usage log, reads a limit, or decrements a credit.**

Analytics sits on top: an "Academic Overview" that is mostly hardcoded mock arrays, an "Enterprise Dashboard" reading real entities but with several field-name mismatches that make its headline numbers permanently zero, a teacher burnout/workload balancer, and a student risk scanner.

---

## 2. Data model as implemented

### 2.1 `LessonPlan` — `base44/entities/LessonPlan.jsonc`

- **Purpose:** a single lesson plan. Carries _two generations_ of fields side by side.
- **Modern fields (AIPlanner):** `subject`, `topic`, `grade_level`, `duration`, `teaching_style`, `objectives` (newline-joined string), `materials` (newline-joined string), `starter`, `main_activity`, `practice`, `plenary`, `homework`, `assessment`, `differentiation`, `generated_by_ai` (bool, default false).
- **Legacy fields (LessonPlanner):** `content` (explicitly commented `"Full lesson plan content (legacy)"`, L84-87), `materials_needed` (L88), `homework_legacy` (L91).
- **Enums:** `status` = `draft | ready | taught`, default `draft` (L71-79).
- **Relationships:** `class_id` → Class (loose string, no FK enforcement). `date` (date).
- **Required:** `title` only (L95-97) — but **AIPlanner never sets `title`** (`AIPlanner.jsx:114-132`), so every AI-saved plan violates the required constraint.
- **Tenant field:** `workspace_id` (L5-8).
- **RLS: PRESENT** (L98-111) on read/create/update/delete, all keyed `data.workspace_id == {{user.data.active_workspace_id}}`.
- **⚠️ Critical:** neither writer sets `workspace_id` — `LessonPlanner.jsx:44` and `AIPlanner.jsx:61` both pass the raw form object. See §7.

### 2.2 `LessonLog` — `LessonLog.jsonc`

- **Purpose:** post-lesson record — what was planned vs. what was actually covered, and how many periods it burned. This is the entity that would make pacing/coverage analytics possible.
- **Fields:** `class_id`, `syllabus_id` (optional link to a `Syllabus` topic), `date`, `subject`, `chapter_title`, `topic_planned`, `topic_completed`, `notes`, `periods_used` (number, default 1).
- **Enum:** `status` = `complete | partial | skipped`, default `complete` (L34-43).
- **Required:** `class_id`, `date`, `topic_planned`.
- **Tenant field: NONE.** **RLS: ABSENT.**

### 2.3 `LessonTemplate` — `LessonTemplate.jsonc`

- **Purpose:** reusable lesson skeleton.
- **Fields:** `name` (required), `subject`, `objectives`, `content`, `materials_needed`, `homework`, `tags` (comma-separated string).
- Note `tags` is only ever _read_ (`TemplateLibrary.jsx:63-69`, dead file) and only ever _written_ by the dead `TemplateLibrary` dialog (`:93`). The live `LessonPlanner.saveAsTemplate` (`:98-107`) never sets `tags`.
- **Tenant field: NONE.** **RLS: ABSENT.**

### 2.4 `Syllabus` — `Syllabus.jsonc`

- **Purpose:** the structured curriculum spine. One row per topic.
- **Fields:** `subject`, `grade_number` (0–12, 0 = Play Group), `class_id` (optional), `chapter_number`, `chapter_title`, `topic`, `sequence_order` (global teaching order), `estimated_periods` (default 1).
- **Enum:** `status` = `pending | in_progress | completed`, default `pending`.
- **Required:** `subject`, `grade_number`, `chapter_title`, `topic`, `sequence_order`.
- **Tenant field: NONE.** **RLS: ABSENT.**
- **⚠️ No reachable UI creates a `Syllabus` row.** The only creator is `src/components/curriculum/SyllabusTab.jsx:41`, which is imported by nothing (verified by grep). Therefore every consumer of `Syllabus` is permanently empty.
- **Join inconsistency:** consumers disagree about how a class maps to syllabus rows. `LessonLogTab.jsx:41-45` and `PacingPlanTab.jsx:36-38` join on `grade_number + subject`; `QuickLessonLog.jsx:39` joins on `class_id`.

### 2.5 `SyllabusUpload` — `SyllabusUpload.jsonc`

- **Purpose:** the _document_ version of the syllabus — a PDF/DOC or Drive link pinned to a class + academic year + term. Completely unrelated to the structured `Syllabus` entity; nothing links the two.
- **Fields:** `class_id`, `academic_year` (free text, e.g. "2025–2026"), `title`, `file_url`, `drive_link`, `notes`, `uploaded_by`.
- **Enum:** `term` = `Full Year | Term 1 | Term 2 | Term 3 | Semester 1 | Semester 2`.
- **Required:** `class_id`, `academic_year`, `term`, `title`.
- **Tenant field: NONE.** **RLS: ABSENT.**

### 2.6 `SchoolBook` — `SchoolBook.jsonc`

- **Purpose:** school textbook library.
- **Fields:** `title` (required), `subject`, `class_id`, `author`, `publisher`, `academic_year`, `file_url`, `drive_link`, `cover_image_url`, `notes`, `added_by`.
- **No enums.** **Tenant field: NONE.** **RLS: ABSENT.**

### 2.7 `AcademicResource` — `AcademicResource.jsonc`

- **Purpose:** the central resource asset. Every teacher upload and every marketplace purchase lands here.
- **Ownership model (3 fields, deliberate):** `uploader_id` (original author, immutable), `assigned_to_id` (current owner after reassignment), `folder_id` (nullable = root).
- **Identity:** `resource_identifier` — "Auto-generated unique ID e.g. WS-000214".
- **Metadata:** `title` (req), `description`, `subject`, `grade_level`, `curriculum`, `language` (default "English"), `tags` (JSON array as string).
- **File:** `file_url`, `file_name`, `file_size_kb`, `cover_image_url`, `qr_code_url` ("QR thumbnail for print").
- **Counters:** `print_count` (default 0), `view_count` (default 0) — **neither is ever incremented anywhere in `src/`**.
- **Enums:**
  - `resource_type` (15): `worksheet, exam_paper, quiz, class_test, homework, notes, presentation, lab_sheet, project_work, resource_pack, handout, lesson_plan, book, question_bank, other`.
  - `status` = `active | orphaned | reassigned`, default `active`. Schema comment (L97): _"active = uploader still in school, orphaned = uploader left, reassigned = admin assigned new owner"_. **`orphaned` is never set by any code.**
  - `source` = `upload | marketplace_purchase`, default `upload`.
- **Sharing:** `is_shared` (bool), `shared_with` (string holding `JSON array of {user_id, permission: view|edit}`).
- **Required:** `school_id`, `uploader_id`, `title`, `resource_type`.
- **Tenant field:** `school_id` (not `workspace_id` — inconsistent with the rest of the app).
- **RLS: ABSENT.** `SchoolResourceLibrary.jsx:70` does a bare `.list()` with no filter.

### 2.8 `ResourceFolder` — `ResourceFolder.jsonc`

- **Purpose:** per-teacher folder tree.
- **Fields:** `school_id` (req), `owner_id` (req), `parent_folder_id` (null = root), `name` (req), `color` (hex), `is_default` (bool — auto-created system folders), `shared_with` (JSON string, **never read or written by any code**).
- **Tenant field:** `school_id`. **RLS: ABSENT.**

### 2.9 `AIUsageLog` — `AIUsageLog.jsonc`

- **Purpose:** per-call AI metering, bucketed daily.
- **Fields:** `school_id` (req), **`teacher_id`** (req), `date` (req), `tokens_used`, `credits_used` (req), `cost_generated` ("BDT"), `session_id`.
- **Enum:** `tool_type` (req) = `lesson_planner | quiz_generator | worksheet_generator | ai_writing | exam_generator | other`.
- **Tenant field:** `school_id`. **RLS: ABSENT.**
- **⚠️ Never written by anything.** Only reader is `EnterpriseAnalytics.jsx:24`, and it reads `l.user_id` (`:42`, `:57`) — a field that does not exist. See §7.

### 2.10 `DailyAILimit` — `DailyAILimit.jsonc`

- **Purpose:** the per-school plan ceiling.
- **Fields:** `school_id` (req), `plan_name`, `daily_credits_per_teacher` ("For individual_allocation model"), `daily_credits_pool` ("For shared_pool model — total pool per day. **Unused credits expire at midnight.**").
- **RLS: ABSENT.** **Referenced by zero files in `src/`.** Completely unused.

### 2.11 `AIBillingModel` — `AIBillingModel.jsonc`

- **Fields:** `school_id` (req), `model_type` (req).
- **Enum:** `model_type` = `shared_pool | individual_allocation`, with the schema comment (L15): _"Set during onboarding. Never editable via UI. Only SchoolTroop support can modify via direct DB."_ This is mirrored in `src/lib/permissions.js:145` — `ai_billing_model_change: []` (empty allow-list, comment `// no one — contact support only`).
- **RLS: ABSENT.** **Referenced by zero files in `src/`.**

### 2.12 `CreditAllocation` — `CreditAllocation.jsonc`

- **Purpose:** the live daily balance record.
- **Fields:** `school_id` (req), `teacher_id` (_"null = school-wide shared pool"_ — this is how the two billing models share one table), `date` (req, daily record), `daily_limit` (req), `used_today` (default 0), `remaining_today`, `extra_credits_granted` (default 0, _"From admin top-up approval"_), `last_reset_at` (_"Midnight daily reset"_).
- **RLS: ABSENT.** Never created by any code — only `.list()` and `.update()`.

### 2.13 `CreditRequest` — `CreditRequest.jsonc`

- **Purpose:** teacher asks admin for more credits.
- **Fields:** `school_id` (req), `teacher_id` (req), `requested_credits` (req), `reason`, `reviewed_by`, `reviewed_at`.
- **Enum:** `status` = `pending | approved | rejected`, default `pending`.
- **RLS: ABSENT.** **Never created by any code** — the teacher-facing request form does not exist. Only `.list()` and `.update()` in `StaffAIPanel.jsx`.

### 2.14 Other entities this area touches

| Entity                                                                | Used by                                                   | Tenant         | RLS                                          |
| --------------------------------------------------------------------- | --------------------------------------------------------- | -------------- | -------------------------------------------- |
| `Class`                                                               | every page here                                           | `workspace_id` | **present**                                  |
| `DiaryEntry`                                                          | `CurriculumEngine.jsx:45,61`                              | `workspace_id` | **present** (writer doesn't set it — see §7) |
| `Assignment`                                                          | CurriculumEngine "Lessons" tab, WorkloadCalendar          | `workspace_id` | present                                      |
| `Exam`                                                                | CurriculumEngine "Exams" tab, WorkloadCalendar, Analytics | `workspace_id` | present                                      |
| `Student`                                                             | AttentionList, RiskScoring, Analytics                     | `workspace_id` | present                                      |
| `Mark`, `BehaviorLog`                                                 | RiskScoring                                               | —              | present                                      |
| `ScheduleSlot`                                                        | WorkloadBalancer                                          | `workspace_id` | present                                      |
| `TeacherAttendance`                                                   | WorkloadBalancer                                          | —              | absent                                       |
| `PrintQueue`                                                          | Analytics, EnterpriseAnalytics                            | `workspace_id` | present                                      |
| `MarketplaceTransaction`, `MarketplaceListing`, `CustomLabel`, `User` | EnterpriseAnalytics                                       | varies         | varies                                       |

### 2.15 `User` — `User.jsonc` (root cause of several failures)

- `role` enum is **only `['admin','user']`**, default `user`. There is **no `teacher`, `superadmin`, `staff` or `parent` role value in the schema**, yet `src/lib/permissions.js:134` declares `ALL_ROLES = ['superadmin','admin','teacher','staff','parent']`.
- There is **no `school_id` property** and **no `active_workspace_id` property**, yet:
  - `SchoolContext.jsx:56` writes `base44.auth.updateMe({ active_workspace_id })` (undeclared field; the RLS templates depend on it resolving),
  - `MyResources.jsx:92`, `FolderTree.jsx:101`, `UploadResourceDialog.jsx:35` all read `user?.school_id || 'default'`.
- `department` **does** exist (used by `EnterpriseAnalytics` dept breakdown). `has_seller_profile`, `staff_id`, `subjects`, `grade_levels`, `curriculum_focus` exist.

---

## 3. AI usage inventory

### 3.1 Every AI call in this area

There are **4 LLM calls and 1 image call** in the area (plus one out-of-area LLM call noted at the end). `base44/functions/` does not exist — **every AI call is client-side**, meaning prompts, schemas and any future quota logic all run in the browser.

---

#### (A) `src/pages/LessonPlanner.jsx:89-96` — "Generate with AI"

```js
const prompt = `Create a detailed lesson plan for: "${form.title}". Class: ${cls?.name || "unknown"}. Objectives: ${form.objectives || "not specified"}. Include: Introduction (5 min), Main Activity (30 min), Assessment (10 min), Wrap-up (5 min). Materials needed. Homework suggestion.`
const result = await base44.integrations.Core.InvokeLLM({ prompt })
setForm((prev) => ({ ...prev, content: result }))
```

- **Response schema requested:** none. Raw free text.
- **What is done with the output:** dumped verbatim into the `content` textarea (the _legacy_ field). The generated "Materials needed" and "Homework suggestion" are **not** parsed out into `materials_needed` / `homework` — they stay buried in the prose blob.
- **Quota/credits:** none. No `AIUsageLog` write, no limit check, no credit decrement.
- **Error handling:** none — no try/catch. A failed call leaves `generating` stuck at `true` forever (the `setGenerating(false)` on `:95` is unreachable on throw), permanently disabling the button.
- **Return-type risk:** `InvokeLLM` without `response_json_schema` may return an object rather than a string; `setForm({content: result})` would then put `[object Object]` (or crash the Textarea) rather than text.

---

#### (B) `src/pages/AIPlanner.jsx:21` (system prompt) + `:77-106` (call) — the flagship AI planner

System prompt (`:21`), verbatim:

> `You are an expert curriculum designer and teacher trainer. Generate a complete, detailed, classroom-ready lesson plan based on the teacher's inputs. Return ONLY a valid JSON object with the following keys: objectives (array of strings), materials (array of strings), starter (object with content string and duration string), main_activity (object with content string and duration string), practice (object with content string and duration string), plenary (object with content string and duration string), homework (string or null), assessment (string or null), differentiation_support (string), differentiation_extension (string). Do not include any text outside the JSON object.`

User prompt (`:77-86`), verbatim template:

> ```
> Create a lesson plan for:
> Subject: ${inputs.subject}
> Topic: ${inputs.topic}
> Grade: ${inputs.grade_level || selectedClass?.grade_label || 'Not specified'}
> Duration: ${inputs.duration}
> Teaching Style: ${inputs.teaching_style}
> ${inputs.objectives ? `Teacher's objectives: ${inputs.objectives}` : ''}
> ${inputs.notes ? `Special instructions: ${inputs.notes}` : ''}
> Include homework: ${inputs.include_homework ? 'Yes' : 'No'}
> Include assessment activity: ${inputs.include_assessment ? 'Yes' : 'No'}
> ```

- **Response schema requested** (`:91-105`): full JSON schema — `objectives: string[]`, `materials: string[]`, `starter|main_activity|practice|plenary: {content: string, duration: string}`, `homework: ['string','null']`, `assessment: ['string','null']`, `differentiation_support: string`, `differentiation_extension: string`.
- **What is done with the output:** rendered into a 4-colour section layout (`SECTION_CONFIG`, `:23-28`: Starter/Hook 🎯, Main Activity 📚, Practice ✏️, Plenary 🎓). On "Save Plan" (`:111-134`), arrays are flattened with `.join('\n')` and the two differentiation strings are concatenated into one field: `` `Support: ${plan.differentiation_support}\nExtension: ${plan.differentiation_extension}` `` (`:129`) — then re-parsed on load by string surgery at `:146-147`. `generated_by_ai: true` is set (`:130`).
- **Inputs offered:** class, subject*, topic*, grade level, duration (30/45/60/90 min), teaching style (Direct Instruction / Inquiry-Based / Collaborative / Project-Based / Mixed), objectives, include-homework toggle, include-assessment toggle, notes.
- **Quota/credits:** **none.** No log, no check, no decrement.
- **Error handling:** none — no try/catch (`:88`). A thrown error strands `generating === true` (the `setGenerating(false)` at `:107` is skipped), permanently freezing the page.

---

#### (C) `src/components/curriculum/PacingPlanTab.jsx:61-126` — AI pacing plan (**DEAD — file not imported anywhere**)

Prompt (`:61-92`), verbatim:

> ```
> You are an expert curriculum planner for schools. Create a practical weekly pacing plan.
>
> Class: ${selectedCls?.name}
> Subject: ${selectedCls?.subject}
> Grade: ${selectedCls?.grade_number}
> Start Date: ${startDate}
> Number of Weeks: ${weeksCount}
> Periods per week: ${periodsPerWeek}
> Total periods available: ${weeksCount * periodsPerWeek}
>
> Pending syllabus topics to cover (in order):
> ${topicsList}
>
> Recent lesson log (last 5 lessons):
> ${recentLogs || 'No lessons logged yet'}
>
> Generate a JSON pacing plan with this exact structure:
> { "weeks": [ { "week_number": 1, "dates": "Mon Apr 21 – Fri Apr 25", "days": [ { "day": "Monday", "date": "Apr 21", "topic": "...", "chapter": "...", "notes": "..." } ], "week_summary": "Brief summary of what will be covered this week" } ], "recommendations": ["tip1", "tip2", "tip3"] }
>
> Only return the JSON. Be practical and realistic. If a topic needs multiple periods, split it across days.
> ```

- `topicsList` is built at `:53-55`: `` `${i+1}. Ch.${t.chapter_number || '?'}: ${t.chapter_title} — ${t.topic} (${t.estimated_periods || 1} period(s))` ``, capped at `weeksCount * periodsPerWeek` pending topics.
- `recentLogs` is built at `:57-59`: `` `${l.date}: ${l.topic_planned} (${l.status})` `` for the 5 most recent logs of that class.
- **Response schema requested** (`:96-125`): `{ weeks: [{ week_number: number, dates: string, days: [{day, date, topic, chapter, notes}], week_summary: string }], recommendations: string[] }`.
- **What is done with the output:** rendered into week cards + an "AI Recommendations" panel. **Never persisted** — no entity write at all. Refresh loses it.
- **Quota/credits:** none. Also: unreachable (dead file) and would be permanently disabled anyway, because `pendingTopics.length === 0` always (no `Syllabus` rows can exist) and the button is `disabled` on that condition (`:189`).
- **This is the most product-valuable AI feature in the area and it is completely inert.**

---

#### (D) `src/pages/Tools.jsx:46-56` — 7 text tools, one dispatch table

One `InvokeLLM` call (`:55`) selects from a prompt map keyed by tool id. All are **plain-text, no `response_json_schema`**. Verbatim:

| tool id                | prompt (`Tools.jsx` line)                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worksheet` (`:47`)    | `Create a detailed printable worksheet for grade ${inputs.grade \|\| 'unknown'} students on the topic: "${inputs.topic}". Include ${inputs.num_questions \|\| 10} questions of types: ${inputs.question_types \|\| 'fill in the blank, short answer, multiple choice'}. Format it clearly with sections, question numbers, and answer spaces.` |
| `quiz` (`:48`)         | `Create a ${inputs.difficulty \|\| 'medium'} difficulty quiz for grade ${inputs.grade \|\| 'unknown'} on subject: ${inputs.subject}, topic: "${inputs.topic}". Include ${inputs.num_questions \|\| 10} ${inputs.quiz_type \|\| 'multiple choice'} questions with answer key at the end.`                                                       |
| `lesson_plan` (`:49`)  | `Create a detailed lesson plan for grade ${inputs.grade \|\| 'unknown'} on: "${inputs.topic}" for subject: ${inputs.subject}. Include: Learning Objectives, Materials Needed, Introduction (5 min), Main Activity (20 min), Practice (10 min), Closure (5 min), Homework, and Assessment criteria.`                                            |
| `essay` (`:50`)        | `Generate 3 creative essay prompts for grade ${inputs.grade \|\| 'unknown'} students on the topic: "${inputs.topic}". For each prompt include: the prompt text, suggested length, key points to address, and a basic rubric (4 criteria, each 0-25 points).`                                                                                   |
| `flashcard` (`:51`)    | `Create 15 study flashcards on: "${inputs.topic}" for grade ${inputs.grade \|\| 'unknown'}. Format each as:\nFRONT: [question/term]\nBACK: [answer/definition]\n---`                                                                                                                                                                           |
| `notice` (`:52`)       | `Write a formal school notice for: "${inputs.purpose}". School name: "${inputs.school_name \|\| 'Our School'}". Date: ${new Date().toLocaleDateString()}. Make it professional, clear, and suitable for printing or sending to parents.`                                                                                                       |
| `parent_email` (`:53`) | `Write a professional, empathetic email to the parent of a student named "${inputs.student_name}" regarding: "${inputs.context}". From: ${inputs.teacher_name \|\| 'Teacher'}. Keep it respectful, solution-focused, and end with a call to action.`                                                                                           |

- **Note `notice` asks the teacher to type the school name by hand** (`:140`) even though `useSchool()` has it — the file never imports `useSchool`.
- **What is done with the output:** rendered in a `<pre>` (`:183`) with a single "Copy" button (`:64-65`). **Nothing is ever saved.** No path from a generated worksheet → `AcademicResource`, no path from a generated lesson plan → `LessonPlan`, no path from a parent email → `SendEmail` or `Message`, no path from a notice → `PrintQueue`. Every output dies on navigate-away. The "Download" affordance (`Download` icon imported at `:10`) exists only for the image branch.
- **Quota/credits:** none.
- **Error handling:** this is the **only** AI call in the area with a try/catch (`:58-60`) → `toast.error('Generation failed. Please try again.')`.

#### (E) `src/pages/Tools.jsx:40-44` — Image Generator

```js
const res = await base44.integrations.Core.GenerateImage({
  prompt: `Educational illustration for classroom: ${inputs.description || "school classroom"}. Clean, colorful, child-friendly style.`,
})
setImageUrl(res.url)
```

- Output shown inline with a download anchor (`:188-190`). **Never uploaded to storage, never attached to a resource.** The returned URL is likely ephemeral.
- **Quota/credits:** none.

#### Out-of-area (cross-reference)

`src/components/reports/StudentReportCard.jsx:70` also calls `InvokeLLM` — same absence of metering. Whoever owns reports should confirm.

---

### 3.2 Quota / credit enforcement: verdict

**There is none.** Verified by exhaustive grep across `src/`:

| Mechanism                                                       | Expected                       | Found                                                                                                   |
| --------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `AIUsageLog.create(...)`                                        | after every AI call            | **0 occurrences**                                                                                       |
| `DailyAILimit` read anywhere                                    | before every AI call           | **0 occurrences in `src/`**                                                                             |
| `AIBillingModel` read anywhere                                  | to pick pool vs. per-teacher   | **0 occurrences in `src/`**                                                                             |
| `CreditAllocation.create(...)`                                  | nightly/on-demand provisioning | **0 occurrences**                                                                                       |
| `CreditAllocation.update(used_today/remaining_today)` on AI use | decrement per call             | **0** (only top-up/approve paths in `StaffAIPanel.jsx:204,240`)                                         |
| `CreditRequest.create(...)`                                     | teacher requests top-up        | **0 occurrences** — the teacher-side form does not exist                                                |
| Any gate on the Generate buttons                                | disable at 0 credits           | **0** — `AIPlanner.jsx:224`, `Tools.jsx:155`, `LessonPlanner.jsx:175` are disabled only while in-flight |

So: **a teacher can call the LLM an unlimited number of times, at unlimited cost, and nothing is recorded.** The entire credit UI shows `—` for every teacher (`StaffAIPanel.jsx:298-299`, because `allocations` is always empty) and `0 used / 0 limit` (`EnterpriseAnalytics.jsx:66-68`).

### 3.3 Reconstructed intended billing model

Piecing together the schemas and the `StaffAIPanel` UI, the design was:

1. **Per school, one `AIBillingModel` row** fixed at onboarding to either `shared_pool` or `individual_allocation`. Deliberately not self-serve — schema comment says support-only, and `permissions.js:145` gives the change permission to an **empty role list**. Product intent: prevent a school from flipping its own cost structure mid-cycle.
2. **Per school, one `DailyAILimit` row** derived from the subscription plan (`plan_name`), holding either `daily_credits_pool` (shared model — _"Unused credits expire at midnight"_) or `daily_credits_per_teacher` (individual model).
3. **Per day, `CreditAllocation` rows** are the running balance: `daily_limit`, `used_today`, `remaining_today`, `extra_credits_granted`, `last_reset_at`. The `teacher_id`-nullable trick (`"null = school-wide shared pool"`) is what lets one table serve both models — shared-pool schools get a single row per day with `teacher_id = null`; individual schools get one row per teacher per day. A midnight job resets `used_today = 0`, `remaining_today = daily_limit`, stamps `last_reset_at`.
4. **Per AI call, an `AIUsageLog` row** with `tool_type` (which is why the enum is `lesson_planner | quiz_generator | worksheet_generator | ai_writing | exam_generator | other` — it maps to the Tools page and AI Planner), `tokens_used`, `credits_used`, and `cost_generated` **in BDT** — i.e. the school is billed in local currency for AI consumption, on top of subscription.
5. **Top-up flow:** teacher hits their limit → creates a `CreditRequest` (`requested_credits` + `reason`) → admin sees a badge on the Billing tab (`Billing.jsx:56,92-94`) → opens the teacher drawer → Approve (`StaffAIPanel.jsx:199-219`: sets `status/reviewed_by/reviewed_at`, bumps `extra_credits_granted` and `remaining_today`, fires a `Notification`) or Reject (`:221-234`: status + Notification). Admins can also grant unilaterally via the Top-Up box (`:236-247`) with no `CreditRequest` at all.
6. **Governance:** `permissions.js:171-172` — `ai_analytics: ['superadmin','admin']`, `ai_credits_topup: ['superadmin','admin']`.

**Steps 1, 2 and 4 are unimplemented; step 3's rows are never created; step 5's request half is unimplemented.** Only the admin approval/top-up half of step 5 exists, and it operates on rows that can never exist. `StaffAIPanel`'s three charts (`:34-43`) are explicitly `Math.random()` — the code comment says `// Mock chart data`.

---

## 4. Feature table

Roles below are the route guards in `src/App.jsx` (nav visibility from `MobileNav.jsx`).

| #   | Feature                                                 | Route / location                                                    | Roles                             | Entities read → written                                                                                                      | Status                  | Evidence                                                                                                                                                                                                                                                                                                 | Intent                                                                                   |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | **Lesson Planner** (manual CRUD)                        | `/lesson-planner` (`App.jsx:115`)                                   | superadmin, admin, teacher        | R: LessonPlan, Class, LessonTemplate · W: LessonPlan, LessonTemplate                                                         | **BROKEN**              | `LessonPlanner.jsx:44` creates without `workspace_id`; `LessonPlan.jsonc:98-111` RLS filters reads on it. Also **not present in `MobileNav.jsx`** — no nav entry exists for it                                                                                                                           | Simple hand-written lesson plans with template reuse                                     |
| 1a  | ↳ Generate with AI                                      | `LessonPlanner.jsx:89-96`                                           | same                              | —                                                                                                                            | **PARTIAL**             | No schema, no error handling, output dumped into legacy `content` field                                                                                                                                                                                                                                  | One-click draft                                                                          |
| 1b  | ↳ Save as Template                                      | `LessonPlanner.jsx:98-107`                                          | same                              | W: LessonTemplate                                                                                                            | WORKS                   | `:200` button wired                                                                                                                                                                                                                                                                                      | Reuse a lesson skeleton                                                                  |
| 1c  | ↳ Apply Template                                        | `LessonPlanner.jsx:85-87, 151, 180-183`                             | same                              | R: LessonTemplate                                                                                                            | WORKS                   | two entry points (tab button + dropdown)                                                                                                                                                                                                                                                                 | —                                                                                        |
| 2   | **AI Lesson Planner**                                   | `/ai-planner` (`App.jsx:116`)                                       | superadmin, admin, teacher        | R: Class, LessonPlan · W: LessonPlan (delete too)                                                                            | **PARTIAL**             | Generation + render works; save omits required `title` (`:114-132`) and `workspace_id`; no try/catch (`:88`) → permanent freeze on error                                                                                                                                                                 | Flagship AI planning experience                                                          |
| 2a  | ↳ Saved Plans sidebar (load / delete / filter by class) | `AIPlanner.jsx:345-375`                                             | same                              | R/D: LessonPlan                                                                                                              | PARTIAL                 | Load works via lossy string re-parse (`:136-150`); nothing surfaces plans made in `/lesson-planner` (different fields)                                                                                                                                                                                   | Plan library                                                                             |
| 2b  | ↳ Print                                                 | —                                                                   | —                                 | —                                                                                                                            | **DEAD**                | `Printer` icon imported `:16`, never rendered                                                                                                                                                                                                                                                            | Print the plan                                                                           |
| 2c  | ↳ Inline section editing                                | —                                                                   | —                                 | —                                                                                                                            | **DEAD**                | `editingSection` state (`:43`) and `setEditingSection` never used                                                                                                                                                                                                                                        | Tweak an AI section in place                                                             |
| 3   | **Curriculum Engine — Diary**                           | `/curriculum` tab `diary` (`CurriculumEngine.jsx:101-195`)          | superadmin, admin, teacher        | R/W: DiaryEntry, R: Class                                                                                                    | **BROKEN**              | `:61` creates without `workspace_id`; `DiaryEntry.jsonc:64-77` RLS reads on it → entries vanish after save                                                                                                                                                                                               | Teaching journal w/ mood + class link                                                    |
| 4   | ↳ **Lessons tab**                                       | `CurriculumEngine.jsx:198-215`                                      | same                              | R: Assignment                                                                                                                | **BROKEN (mislabeled)** | Tab is called "Lessons" but lists `Assignment` rows (`:51-54, 204`). Does not show `LessonPlan` at all                                                                                                                                                                                                   | Presumably meant to list lesson plans                                                    |
| 5   | ↳ **Exams tab**                                         | `CurriculumEngine.jsx:218-238`                                      | same                              | R: Exam, Class                                                                                                               | WORKS (read-only)       | `:224-234`                                                                                                                                                                                                                                                                                               | At-a-glance exam list                                                                    |
| 6   | ↳ **Worksheets tab**                                    | `CurriculumEngine.jsx:241-249`                                      | same                              | none                                                                                                                         | **STUB**                | Hardcoded empty state: _"No worksheets yet / Upload worksheets from the Handouts section."_ No query, no data path                                                                                                                                                                                       | Worksheet browser                                                                        |
| 7   | ↳ **Syllabus Upload tab**                               | `CurriculumEngine.jsx:252-256` → `curriculum/SyllabusUploadTab.jsx` | same (delete: admin only, `:177`) | R/W/D: SyllabusUpload · Core.UploadFile                                                                                      | **PARTIAL**             | Upload/save/list/delete work; **preview broken** — `:191` passes `url=` but `FileViewer` takes `fileUrl`                                                                                                                                                                                                 | Park the official syllabus per class/year/term                                           |
| 8   | ↳ **Book Library tab**                                  | `CurriculumEngine.jsx:259-263` → `curriculum/BookLibraryTab.jsx`    | same (delete: admin only)         | R/W/D: SchoolBook · Core.UploadFile ×2                                                                                       | **PARTIAL**             | Add/list/group/search/delete work. **Edit is unreachable** — `openEdit` (`:60`) is passed to `BookCard`/`BookList` as `onEdit` but neither renders an edit control (`:207-235`, `:237-268`). Preview broken (`:202` `url=`). `onView` passes `b.file_url` even for Drive-only books (`:126`) → undefined | School textbook softcopy library                                                         |
| 9   | **My Resources**                                        | `/my-resources` (`App.jsx:133`)                                     | teacher, superadmin, admin        | R: ResourceFolder, AcademicResource · W: ResourceFolder, AcademicResource                                                    | **PARTIAL**             | Core upload/folder/move/share/search/filter work                                                                                                                                                                                                                                                         | Teacher's personal resource workspace                                                    |
| 9a  | ↳ Auto-create 6 default folders                         | `MyResources.jsx:88-99`                                             | —                                 | W: ResourceFolder ×6                                                                                                         | **PARTIAL**             | Fires whenever `folders.length === 0`; `school_id` is always `'default'` (`:92`, `user.school_id` undeclared). Duplicate-creation risk before invalidation lands                                                                                                                                         | Zero-config onboarding (`Worksheets, Exam Papers, Notes, Handouts, Lesson Plans, Books`) |
| 9b  | ↳ Folder tree (create/rename/delete/colour/nest)        | `components/resources/FolderTree.jsx`                               | —                                 | R/W/U/D: ResourceFolder, U: AcademicResource                                                                                 | WORKS                   | Delete reparents contents to root first, never deletes resources (`:26-33`) — good                                                                                                                                                                                                                       | Colour-coded nested folders                                                              |
| 9c  | ↳ **Shared With Me** tab                                | `MyResources.jsx:124-129, 264-282`                                  | —                                 | R: AcademicResource                                                                                                          | **BROKEN**              | Filters `resources`, which is already `filter({uploader_id: user.id})` (`:84`). Can only ever show resources you uploaded _and_ shared with yourself. Always empty                                                                                                                                       | Receive colleagues' shared resources                                                     |
| 9d  | ↳ Bulk Print / Download ZIP                             | `MyResources.jsx:131-138, 188-189`                                  | —                                 | none                                                                                                                         | **STUB**                | Both are `alert("Sending N resource(s) to print queue...")` / `alert("Downloading N ... as ZIP...")`                                                                                                                                                                                                     | Batch ops                                                                                |
| 9e  | ↳ Per-resource Print                                    | `MyResources.jsx:227,245,257`                                       | —                                 | none                                                                                                                         | **STUB**                | `alert(\`Print: ${r.title}\`)`— never touches`PrintQueue`                                                                                                                                                                                                                                                | Send to printer                                                                          |
| 9f  | ↳ Per-resource View                                     | `ResourceCard.jsx:273`                                              | —                                 | —                                                                                                                            | **DEAD**                | `onView` prop is never supplied by `MyResources` → eye button is a no-op                                                                                                                                                                                                                                 | Preview                                                                                  |
| 9g  | ↳ Share with colleague                                  | `components/resources/ShareResourceDialog.jsx`                      | —                                 | R: User · U: AcademicResource                                                                                                | **BROKEN**              | `:22` filters `u.role === 'teacher'`, but `User.jsonc` role enum is only `['admin','user']` → colleague dropdown is always empty → nothing can be shared                                                                                                                                                 | Peer sharing w/ view/edit permission                                                     |
| 10  | **School Resource Library**                             | `/resource-library` (`App.jsx:141`)                                 | superadmin, admin                 | R: AcademicResource, User · U: AcademicResource, W: AuditLog                                                                 | **PARTIAL**             | Master table, 6 filters, 4 KPI cards, 2 charts render                                                                                                                                                                                                                                                    | School-wide resource governance                                                          |
| 10a | ↳ Orphan detection + CTA                                | `SchoolResourceLibrary.jsx:126, 175-186`                            | —                                 | —                                                                                                                            | **DEAD**                | `status: 'orphaned'` is never written by any code in `src/` → count is permanently 0, banner never shows                                                                                                                                                                                                 | Catch resources stranded when a teacher leaves                                           |
| 10b | ↳ Reassign to another teacher                           | `SchoolResourceLibrary.jsx:26-53, 80-101`                           | —                                 | U: AcademicResource, W: AuditLog                                                                                             | **BROKEN**              | Teacher dropdown filters `u.role === 'teacher'` (`:31`) → always empty → Confirm always disabled. Also `logAudit` called with wrong signature (`:89`)                                                                                                                                                    | Transfer ownership                                                                       |
| 10c | ↳ Material Type filter                                  | `SchoolResourceLibrary.jsx:121, 259-265`                            | —                                 | —                                                                                                                            | **BROKEN**              | `filterMaterialType` is used inside the `useMemo` but omitted from its dep array (`:123`) → selecting a material type does nothing. Also matches `r.material_type`, a field absent from `AcademicResource.jsonc`                                                                                         | Filter by pedagogical material type                                                      |
| 10d | ↳ Export ZIP / Bulk Print                               | `SchoolResourceLibrary.jsx:276-281`                                 | —                                 | —                                                                                                                            | **DEAD**                | Both `<Button>`s have **no `onClick`**                                                                                                                                                                                                                                                                   | Batch admin ops                                                                          |
| 10e | ↳ Top 10 Most Printed                                   | `SchoolResourceLibrary.jsx:132, 204-215`                            | —                                 | R: AcademicResource                                                                                                          | **DEAD**                | Sorts by `print_count`, never incremented anywhere → all zeros                                                                                                                                                                                                                                           | Usage insight                                                                            |
| 10f | ↳ File preview                                          | `SchoolResourceLibrary.jsx:364-369`                                 | —                                 | —                                                                                                                            | **BROKEN**              | passes `url=`, `FileViewer` expects `fileUrl`                                                                                                                                                                                                                                                            | —                                                                                        |
| 11  | **My Workload**                                         | `/workload` (`App.jsx:122`)                                         | superadmin, admin, teacher        | —                                                                                                                            | WORKS (shell)           | `Workload.jsx` = 3 tabs + link to `/behavior`                                                                                                                                                                                                                                                            | Teacher's daily cockpit                                                                  |
| 11a | ↳ Assignment Deadlines calendar                         | `components/workload/WorkloadCalendar.jsx`                          | —                                 | R: Assignment, Exam, Class                                                                                                   | WORKS                   | Month grid + next-15 upcoming list                                                                                                                                                                                                                                                                       | See what's due                                                                           |
| 11b | ↳ Flagged Students                                      | `components/workload/AttentionList.jsx`                             | —                                 | R: Student, Class · U: Student                                                                                               | WORKS                   | Groups by class, "Resolve" clears `needs_attention` (`:226`)                                                                                                                                                                                                                                             | Act on at-risk students                                                                  |
| 11c | ↳ Quick Lesson Log                                      | `components/workload/QuickLessonLog.jsx`                            | —                                 | R: Class, LessonLog, Syllabus · W: LessonLog                                                                                 | **PARTIAL**             | Form + recent-logs list work. The **syllabus quick-fill chips (`:95-110`) never appear** — no reachable UI creates `Syllabus` rows                                                                                                                                                                       | 30-second post-lesson log                                                                |
| 12  | **AI Tools** (8 tools)                                  | `/tools` (`App.jsx:126`)                                            | superadmin, admin, teacher        | none (pure LLM)                                                                                                              | **PARTIAL**             | Generation works; **nothing is ever saved** — no entity write in the whole file                                                                                                                                                                                                                          | AI productivity suite                                                                    |
| 13  | **Analytics**                                           | `/analytics` (`App.jsx:128`)                                        | superadmin, admin (route)         | —                                                                                                                            | —                       | Note `Analytics.jsx:210` also branches on `userRole === 'teacher'`, unreachable behind the route guard                                                                                                                                                                                                   | Admin insight hub                                                                        |
| 13a | ↳ Academic Overview                                     | `Analytics.jsx:71-201`                                              | —                                 | R: Student, Class, Exam, PrintQueue                                                                                          | **STUB (mostly fake)**  | `mockAttendanceData` (`:22-25`), `mockGradeData` (`:26-29`), `mockPrintData` (`:30-35`) are literals. "Avg Attendance 91%" hardcoded (`:66`), "+3.2%" badge hardcoded (`:102`). Only Total Students, Total Exams, Print Jobs, and the Attention list are real                                            | School performance at a glance                                                           |
| 13b | ↳ Enterprise Dashboard                                  | `analytics/EnterpriseAnalytics.jsx`                                 | superadmin, admin                 | R: AIUsageLog, AcademicResource, PrintQueue, MarketplaceTransaction, MarketplaceListing, CreditAllocation, User, CustomLabel | **BROKEN**              | Reads `l.user_id` on `AIUsageLog` which has `teacher_id` (`:42,:57`); `AIUsageLog` has no rows at all; `j.handout_id` (`:86`) not in `PrintQueue.jsonc`. See §7                                                                                                                                          | Exec-level usage/spend dashboard                                                         |
| 13c | ↳ Risk Scoring                                          | `analytics/RiskScoring.jsx`                                         | superadmin, admin                 | R: Student, Mark, BehaviorLog · U: Student                                                                                   | **WORKS**               | Real math over real entities; "Run Risk Scan" writes back `needs_attention` + `attention_reason` (`:83-96`)                                                                                                                                                                                              | Find students slipping                                                                   |
| 13d | ↳ Workload Balancer                                     | `analytics/WorkloadBalancer.jsx`                                    | superadmin, admin                 | R: Class, ScheduleSlot, TeacherAttendance                                                                                    | **PARTIAL**             | Real math, but joins teachers **by display name string** (`Class.teacher_name`) not by user id (`:38-39`)                                                                                                                                                                                                | Spot teacher burnout                                                                     |
| 14  | **Syllabus Table** (structured)                         | `components/curriculum/SyllabusTab.jsx`                             | —                                 | R/W/U/D: Syllabus, R: Class                                                                                                  | **DEAD**                | Not imported by any file (verified by grep)                                                                                                                                                                                                                                                              | Chapter/topic curriculum spine with per-topic status                                     |
| 15  | **Lesson Log (full)**                                   | `components/curriculum/LessonLogTab.jsx`                            | —                                 | R/W/D: LessonLog, U: Syllabus, R: Class, Syllabus                                                                            | **DEAD**                | Not imported anywhere                                                                                                                                                                                                                                                                                    | Rich lesson log that auto-advances syllabus status                                       |
| 16  | **AI Pacing Plan**                                      | `components/curriculum/PacingPlanTab.jsx`                           | —                                 | R: Class, Syllabus, LessonLog · InvokeLLM                                                                                    | **DEAD**                | Not imported anywhere; also unusable (needs Syllabus rows) and never persists output                                                                                                                                                                                                                     | Multi-week AI pacing plan grounded in real progress                                      |
| 17  | **Template Library (rich)**                             | `components/lessonplanner/TemplateLibrary.jsx`                      | —                                 | R/W/D: LessonTemplate                                                                                                        | **DEAD**                | Not imported anywhere. Only place `tags` is authored                                                                                                                                                                                                                                                     | Card-grid template browser                                                               |
| 18  | **Staff AI Usage panel**                                | `/billing` tab `ai-usage` → `billing/StaffAIPanel.jsx`              | superadmin, admin                 | R: User, CreditAllocation, CreditRequest · U: CreditRequest, CreditAllocation · W: Notification                              | **STUB**                | Table always shows `—` (no allocations exist); all 3 drawer charts are `Math.random()` (`:34-43`, comment `// Mock chart data`)                                                                                                                                                                          | AI credit governance                                                                     |

---

## 5. Workflows

### 5.1 Lesson planning, end to end

There are **two parallel, non-interoperating** flows onto one entity.

**Flow A — `/lesson-planner` (manual):** New Plan → title / class / date / objectives → optionally _Generate with AI_ (free-text blob → `content`) or _Apply Template_ (fills `objectives`, `content`, `materials_needed`, `homework`) → status `draft|ready|taught` → Save. Optionally _Save as Template_ (writes `LessonTemplate` from the current form, subject inferred from the selected class, `LessonPlanner.jsx:98-107`). Cards list by `-date`, click to edit, Delete in the dialog footer.

**Flow B — `/ai-planner` (AI-first):** fill left panel → Generate → structured JSON rendered as Objectives / Materials / 4-part Breakdown / Homework / Assessment / Differentiation → Regenerate or Save Plan → appears in the right-hand "Saved Plans" rail, filterable by class, with Load and Delete.

**Where they diverge:** Flow A writes `title, content, materials_needed, homework, objectives, status, class_id, date`. Flow B writes `subject, topic, grade_level, duration, teaching_style, objectives, materials, starter, main_activity, practice, plenary, homework, assessment, differentiation, generated_by_ai, status` — **and no `title`**. So:

- Flow A's list renders `{plan.title}` → Flow B's plans appear as blank rows.
- Flow B's rail renders `{p.subject} — {p.topic}` → Flow A's plans appear as `" — "`.
- Flow A's edit dialog opens a Flow B plan with every field empty except status.
- `title` is `required` in the schema, so Flow B saves may be rejected outright by the platform.

**Neither writes `workspace_id`**, which `LessonPlan`'s RLS requires for read. If Base44 enforces that read predicate literally, saved plans are invisible immediately after creation.

### 5.2 AI planner (detail)

Covered in §3.1(B). Worth calling out the lossy round-trip: save flattens `objectives[]`/`materials[]` with `\n` and concatenates the two differentiation strings into one field (`AIPlanner.jsx:121-129`); load re-splits on `\n` and does `differentiation?.replace(/Support: /, '').split('\nExtension:')[0]` / `.split('Extension: ')[1]` (`:146-147`). Any teacher who types "Support:" or "Extension:" into their own text corrupts the parse. Section `duration` is lost entirely (not persisted; `:140-143` reload it as `''`).

### 5.3 Syllabus upload → curriculum mapping

**Intended:** upload the official syllabus doc, then map it to teachable units.
**Implemented:** only the upload half. `SyllabusUploadTab` requires class + academic year (free text) + term before revealing the form; accepts either a `Core.UploadFile` upload (`.pdf,.doc,.docx`) or a Drive link, plus notes. Lists per class sorted by year desc then term order (`:72-75`). Admin-only delete.
**Missing:** there is **no extraction step**. `Core.ExtractDataFromUploadedFile` is used in the app (`marketplace/BulkListingUpload.jsx:46`) but never here. Nothing converts a `SyllabusUpload` into `Syllabus` rows, and nothing links the two entities (`SyllabusUpload` has no `syllabus_id`, `Syllabus` has no `upload_id`). So "curriculum mapping" does not exist: the structured `Syllabus` table, the pacing planner that consumes it, and the lesson-log → syllabus-status advance are all dead code hanging off an entity with no data source.

### 5.4 Book library

Add Book dialog → title (req), subject, class level, author, publisher, academic year, softcopy upload, Drive link, cover image upload, notes → `SchoolBook.create({...form, added_by: user?.id})`. Browse in grid (cover-art cards) or table; filter by class; search title/subject; when "All Classes" is selected, rows are grouped by class name with "General" for unassigned (`:87-92`). Admin-only delete. **Edit is authored but unreachable** (no control renders `onEdit`). **Preview is broken** (`url=` vs `fileUrl`), and Drive-only books pass `url: undefined` to the viewer (`:126`). Download is `window.open(book.file_url)`.

### 5.5 Resource sharing (teacher → school library, folders, reassignment)

1. **Upload:** `UploadResourceDialog` → `Core.UploadFile` → `AcademicResource.create` with `school_id: user?.school_id || 'default'`, `uploader_id`, `assigned_to_id = uploader`, `folder_id` = currently-selected folder, generated `resource_identifier`, `file_name`, `file_size_kb`, `status: 'active'`, `source: 'upload'`.
2. **Organise:** folders auto-seeded (6 defaults, `is_default: true`) on first visit; create/rename/recolour/nest/delete in `FolderTree`; move a resource via `MoveFolderDialog`; deleting a folder reparents its resources to root rather than deleting them.
3. **Share (teacher → teacher):** `ShareResourceDialog` appends `{user_id, permission}` to the JSON string in `shared_with`, de-duplicating by user, and sets `is_shared: true`. **Recipient never sees it** — `MyResources` only queries resources where `uploader_id` is the current user, so the "Shared With Me" tab is structurally incapable of returning another teacher's resource. And the colleague picker is empty anyway (`role === 'teacher'` never matches).
4. **Teacher → school library:** there is **no explicit publish action**. Admins see everything automatically because `SchoolResourceLibrary.jsx:70` calls `AcademicResource.list()` with no filter — which also means **no tenant isolation**: every school's resources appear in every school's library.
5. **Reassignment (teacher leaves):** intended lifecycle is `active` → (teacher offboarded) → `orphaned` → admin reassigns → `reassigned` with `assigned_to_id` updated and an `AuditLog` entry. Implemented: only the last hop, and it is unreachable (empty teacher list) and its audit call is malformed. Nothing ever sets `orphaned`.

### 5.6 Workload calculation and balancing

- **Teacher-facing (`/workload`):** three read-mostly views — a month calendar merging ungraded `Assignment.due_date` + non-graded `Exam.exam_date` with an "Upcoming Deadlines" rail; a flagged-students list grouped by class with one-click Resolve; and a quick lesson-log form.
- **Admin-facing (Analytics → Workload Balancer):** counts weekly periods per teacher from `ScheduleSlot`, joined `ScheduleSlot.class_id → Class.teacher_name`, buckets into Healthy / Moderate / High Risk, renders a colour-coded bar chart and a detail list annotated with recent absences.
- **Key weakness:** the join key is a **display-name string** (`Class.teacher_name`), matched against `TeacherAttendance.teacher_name`. No user ids involved. Two "S. Rahman" spellings = two rows; a renamed teacher = orphaned history. There is also no co-teaching support (one `teacher_name` per class).
- **`LessonLog.periods_used` — the actual, ground-truth measure of teaching load — is not used by the balancer at all.** The balancer uses the _scheduled_ timetable only.

### 5.7 Analytics dashboards — what metrics, from what data

**Academic Overview (`Analytics.jsx`):**

| Metric                     | Source                                    | Real? |
| -------------------------- | ----------------------------------------- | ----- |
| Total Students             | `Student.list().length`                   | ✅    |
| Avg Attendance "91%"       | hardcoded string `:66`                    | ❌    |
| Total Exams                | `Exam.list().length`                      | ✅    |
| Print Jobs                 | `PrintQueue` where `status==='completed'` | ✅    |
| Attendance Rate line chart | `mockAttendanceData` `:22-25`             | ❌    |
| "+3.2%" trend badge        | hardcoded `:102`                          | ❌    |
| Grade Performance bars     | `mockGradeData` `:26-29`                  | ❌    |
| Print Volume pie           | `mockPrintData` `:30-35`                  | ❌    |
| Attention Required list    | `Student` where `needs_attention`         | ✅    |

**Enterprise Dashboard (`EnterpriseAnalytics.jsx`):** four sections — Usage Overview (most active teacher, AI credits today, marketplace spend, AI by department), Curriculum Activity (materials this vs. last month, curriculum pie, most-printed table), Marketplace (top-5 purchased, spend summary), Resource Tracking (QR activity, storage). Every card has a CSV export (`exportCSV`, `:15-21`). **All AI-derived numbers are permanently zero** (`AIUsageLog` empty _and_ wrong field name). "Most Printed" is permanently empty (`handout_id` not in `PrintQueue`). "QR Activity" is print-job counts relabelled (`:110-117`) — the code comment even says `// QR scans (fake 30-day line from print queue)`, and it renders 7 days under a "7 Days" title while the variable is named for 30. Storage is a made-up progress bar.

**Risk Scoring:** the only fully honest dashboard here — real marks, real behaviour logs, real write-back.

---

## 6. Calculations (exact, with file:line)

**Syllabus completion %**

- `components/curriculum/PacingPlanTab.jsx:42-44` — `Math.round((completedTopics.length / classSyllabus.length) * 100)`, where `completedTopics = classSyllabus.filter(s => s.status === 'completed')` (`:41`) and `classSyllabus = syllabus.filter(s => s.grade_number === selectedCls.grade_number && s.subject === selectedCls.subject)` (`:36-38`).
- `components/curriculum/SyllabusTab.jsx:105-107` — same formula per `subject__grade_number` group: `pct = Math.round((done/total)*100)`.

**Pacing plan capacity**

- `PacingPlanTab.jsx:69` — `Total periods available = weeksCount * periodsPerWeek` (fed to the LLM as a constraint).
- `PacingPlanTab.jsx:53` — topic window: `pendingTopics.slice(0, weeksCount * periodsPerWeek)`. Note this slices by _topic count_, ignoring each topic's `estimated_periods`, so a syllabus of multi-period topics over-fills the window.

**Teacher workload (periods/week)**

- `analytics/WorkloadBalancer.jsx:43-46` — `periodCounts[teacher_name] = count of ScheduleSlot rows whose class_id maps to that teacher_name`. One slot = one period; `period_number` is ignored except as a sort key.
- Thresholds `:10-11` — `BURNOUT_THRESHOLD = 25` periods/week, `WARN_THRESHOLD = 20`.
- Banding `:13-17` — `>= 25` → High Risk; `>= 20 && < 25` → Moderate; `< 20` → Healthy.
- Absences `:50-54` — `absenceCounts[teacher_name] = count of TeacherAttendance where status ∈ {'Absent','On Leave'}`. **Labelled "(last 30 days)" in the UI (`:136`) but there is no date filter** — the query is `TeacherAttendance.list('-date', 200)` (`:34`), i.e. the most recent 200 rows school-wide, over any time range.
- Sort `:64` — descending by periods.

**Student risk (`analytics/RiskScoring.jsx`)**

- `:16-17` — per-mark percentage: `pcts = sorted.map(m => (m.marks_obtained / m.max_marks) * 100)`, sorted ascending by `date`.
- `:17` — `avg = sum(pcts) / pcts.length`.
- `:20-23` — `trend = last3[last] - last3[0]` where `recent = pcts.slice(-3)`; `0` if fewer than 2 marks. (This is a first-vs-last delta of the last three, not a regression slope.)
- `:13` — students with `< 2` marks are excluded entirely (`return null`, filtered at `:63`).
- `:28-37` — behaviour: `points = positive - negative`, where each log contributes `log.points || 1` to `positive` if `log.type === 'positive'`, else to `negative`.
- `:59` — `behaviorPenalty = behavior.points < 0 ? Math.abs(behavior.points) * 2 : 0`.
- `:60` — **combined risk** = `(100 - (risk?.avg ?? 100)) + (risk && risk.trend < 0 ? Math.abs(risk.trend) : 0) + behaviorPenalty`.
- `:10-11` — `RISK_THRESHOLD = 50` (avg below → at-risk), `TREND_THRESHOLD = -10` (trend below → declining).
- `:67-69` — buckets: at-risk `avg < 50`; declining `avg >= 50 && trend < -10`; healthy otherwise.
- `:74-81` — flag condition: `hasLowAvg || hasFallingTrend || hasNegativeBehavior` where `hasNegativeBehavior = behavior.points < -2`; reason string = the matching parts joined with `' · '`.
- `:91` — un-flag guard: only clears `needs_attention` if the existing `attention_reason` contains `'score'`, `'trend'` or `'behavior'` (so manual flags survive a scan).

**Enterprise analytics aggregates (`analytics/EnterpriseAnalytics.jsx`)**

- `:38` (comment) + `:44` — **Most Active Teacher score** = `Math.round(credits * 0.6 + uploaded * 0.4)`, where `credits = Σ AIUsageLog.credits_used` for that user this month and `uploaded = count of AcademicResource` by that user this month. **`credits` is always 0** — the filter is `l.user_id === u.id` (`:42`) but the field is `teacher_id`.
- `:66` — `totalAlloc = Σ CreditAllocation.daily_limit` **across all rows, with no date filter** — since `CreditAllocation` is one row _per teacher per day_, this would sum the entire history, not today's ceiling.
- `:67` — `usedToday = Σ AIUsageLog.credits_used` where `created_date` starts with today's ISO date (uses `created_date`, not the entity's own `date` field).
- `:68` — `pctUsed = totalAlloc > 0 ? Math.round((usedToday / totalAlloc) * 100) : 0`.
- `:56-61` — department credits: `map[user.department] += l.credits_used`, falling back to `'Other'`; seeded from `CustomLabel` names (`:54`), filtered to `credits > 0` (`:62`).
- `:71-73` — materials this vs. last month: `resources.filter(r => r.created_date?.startsWith('YYYY-MM')).length`, month keys built at `:34-36`.
- `:76-80` — curriculum pie: count by `r.curriculum || 'Other'`.
- `:83-92` — most-printed: counts completed `PrintQueue` rows by `j.handout_id` — **field does not exist on `PrintQueue`** → always `{}`. Also `.slice(0,10)` is applied **before** `.sort()` (`:88`/`:91`), so even with data it would take an arbitrary 10 and then sort those.
- `:95-97` — marketplace spend = `Σ amount_paid` where `payment_method === 'school_funded'` and `purchased_at` starts with this month.
- `:100-107` — top purchased: counts by `listing_id`; same slice-before-sort bug (`:103`/`:106`).
- `:110-117` — "QR scans": count of `PrintQueue` rows created on each of the last 7 days. Not QR data.
- `:119` — `totalQRTagged` = count of completed print jobs. Not QR data.
- `:326` — storage bar: `Math.min(resources.length / 10, 100)` — resource _count_ divided by 10, presented as a percentage of "100 GB free". `file_size_kb` is stored on every resource and is not used.

**Resource library aggregates (`SchoolResourceLibrary.jsx`)**

- `:126` — `orphanedCount = resources.filter(r => r.status === 'orphaned').length` → always 0.
- `:127-131` — type breakdown: count by `resource_type`, `name` de-underscored, sorted desc, charted top 8 (`:194`).
- `:132` — `topPrinted = [...resources].sort((a,b) => (b.print_count||0)-(a.print_count||0)).slice(0,10)` → all zeros.

**Resource identifier generation (`components/resources/UploadResourceDialog.jsx:106-109`)**

```js
const prefix =
  {
    worksheet: "WS",
    exam_paper: "EP",
    quiz: "QZ",
    notes: "NT",
    homework: "HW",
    handout: "HD",
    lesson_plan: "LP",
    book: "BK",
  }[type] || "RS"
return `${prefix}-${String(Math.floor(Math.random() * 900000 + 100000)).padStart(6, "0")}`
```

Random 6-digit suffix, **no uniqueness check**. ~0.5% collision chance at 70 resources of one type, ~50% at ~1,100 (birthday bound). The schema calls this field "Auto-generated unique ID". 7 of the 15 `resource_type` enum values have no prefix mapping and all collapse to `RS`.

**Analytics deadline countdown (`components/workload/WorkloadCalendar.jsx:121`)**

- `daysAway = Math.ceil((ev.date - new Date()) / 86400000)` — millisecond diff, so a deadline 2 hours away rounds to `1d`/"Tomorrow".

---

## 7. Broken / fake / dead list

### 🔴 Critical — data loss or tenancy

1. **`LessonPlan` writes omit `workspace_id` while its RLS requires it.** `LessonPlanner.jsx:44`, `AIPlanner.jsx:61` vs. `LessonPlan.jsonc:98-111`. Other pages in the app do set it explicitly (`Dashboard.jsx:43-51`, `PrinterDashboard.jsx:48`, `NewPrintJobDialog.jsx:27`), so this is an omission, not a platform default. Symptom: saved lesson plans disappear.
2. **Same for `DiaryEntry`** — `CurriculumEngine.jsx:61` creates without `workspace_id`; `DiaryEntry.jsonc:64-77` has RLS on it.
3. **No tenant isolation on the entire resource estate.** `AcademicResource`, `ResourceFolder`, `LessonLog`, `LessonTemplate`, `Syllabus`, `SyllabusUpload`, `SchoolBook`, `AIUsageLog`, `CreditAllocation`, `CreditRequest`, `DailyAILimit`, `AIBillingModel` **all have no `rls` block**. `SchoolResourceLibrary.jsx:70` does a bare `.list()`, `BookLibraryTab.jsx:40` does a bare `.list()`, `QuickLessonLog.jsx:34` does a bare `.list()`. **School A's admin sees School B's resources and books.**
4. **`school_id` is always the literal string `'default'`.** `MyResources.jsx:92`, `FolderTree.jsx:101`, `UploadResourceDialog.jsx:35` all read `user?.school_id`, but `User.jsonc` declares no such property. Every resource and folder in the product shares one tenant key.
5. **`AIPlanner` never sets `title`, which `LessonPlan.jsonc:95-97` marks required.** Saves may be rejected by the platform; if accepted, plans render blank in `/lesson-planner`.

### 🔴 Broken — the feature cannot work

6. **`FileViewer` prop mismatch — all file previews are dead.** `components/shared/FileViewer.jsx:34` signature is `({ open, onClose, fileUrl, fileName })`. Three call sites pass `url=` instead: `curriculum/SyllabusUploadTab.jsx:191`, `curriculum/BookLibraryTab.jsx:202`, `SchoolResourceLibrary.jsx:364-369`. Every "View"/"Preview" button opens an empty viewer.
7. **`User.role` enum makes every teacher picker empty.** `User.jsonc` role enum = `['admin','user']`. `ShareResourceDialog.jsx:22` and `SchoolResourceLibrary.jsx:31` both filter `u.role === 'teacher'`. Consequence: **resource sharing is impossible** and **resource reassignment is impossible**. This also means `permissions.js`'s whole 5-role matrix has no schema backing (`getUserRole` at `:195-201` falls everyone through to `TEACHER`).
8. **"Shared With Me" can never show anything.** `MyResources.jsx:124-129` filters the array produced by `filter({uploader_id: user.id})` (`:84`).
9. **`logAudit` called with the wrong signature.** `lib/auditLog.js:21` is `logAudit(user, action_type, entity_type, entity_id, previous_value, new_value, school_id)`. `SchoolResourceLibrary.jsx:89` calls `logAudit('resource.reassigned', user?.id, {resource_id, previous_owner, new_owner})` → writes `user_id: undefined`, `action_type: <the user id>`, `entity_type: <an object>`. (`cover/CoverAssignmentPanel.jsx:74` has the same bug — likely a copy-paste pair.)
10. **`AIUsageLog` field-name mismatch.** `EnterpriseAnalytics.jsx:42,57` read `l.user_id`; the schema field is `teacher_id`. Even if logs existed, the Most Active Teacher score and department chart would read zero.
11. **`PrintQueue.handout_id` does not exist.** `EnterpriseAnalytics.jsx:86`. "Most Printed Resources (Top 10)" is structurally always empty.
12. **`filterMaterialType` missing from `useMemo` deps.** `SchoolResourceLibrary.jsx:107-123` — the dep array at `:123` omits it, so the Material Type dropdown has no effect. It also tests `r.material_type`, a field not in `AcademicResource.jsonc`.
13. **"Lessons" tab shows Assignments, not lesson plans.** `CurriculumEngine.jsx:51-54, 204`.
14. **`<SelectItem value={null}>`** in `components/curriculum/LessonLogTab.jsx:74,148` and `SyllabusTab.jsx:84,91,199`. Radix `Select` (v2.x per `package.json:19-45`) requires a non-empty string value; `null` at minimum breaks controlled-value round-tripping and likely throws. Both files are dead, so this is latent rather than live.
15. **`invalidateQueries` called with the TanStack v4 array signature under v5** (`@tanstack/react-query ^5.84.1`, `package.json:48`). In v5 the first argument is a filters _object_; an array has no `queryKey` property, so the call degenerates to "invalidate everything" — silent over-refetching. Occurrences: `LessonPlanner.jsx:45,50,55,60,65`; `MyResources.jsx:97`; `FolderTree.jsx:22,32,107`; `MoveFolderDialog.jsx:172`; `ShareResourceDialog.jsx:34`; `UploadResourceDialog.jsx:139`; `SchoolResourceLibrary.jsx:97`; `StaffAIPanel.jsx:218,233,246`; `Billing.jsx:53`.
16. **No error handling on 3 of the 5 AI calls** — `LessonPlanner.jsx:93`, `AIPlanner.jsx:88`, `PacingPlanTab.jsx:94`. A network blip or a refusal leaves the spinner spinning forever and the button permanently disabled. Only `Tools.jsx:58-60` has a `catch`.

### 🟡 Fake / stubbed

17. **The entire AI credit economy.** No `AIUsageLog` write, no `DailyAILimit` read, no `AIBillingModel` read, no `CreditAllocation.create`, no `CreditRequest.create`, no pre-call gate. Unlimited free LLM use.
18. **`StaffAIPanel` drawer charts are `Math.random()`** — `billing/StaffAIPanel.jsx:33-43`, comment `// Mock chart data`. Daily usage bars, 6-month trend, and tool-breakdown donut are all random each render.
19. **Analytics "Academic Overview" is mostly literals** — `Analytics.jsx:22-35` (three mock arrays), `:66` (`'91%'`), `:102` (`+3.2%`).
20. **Bulk print / download are `alert()`** — `MyResources.jsx:133` `alert(\`Sending ${selected.length} resource(s) to print queue...\`)`, `:137` `alert(\`Downloading ${selectedIds.length} resource(s) as ZIP...\`)`, and per-resource `:227,245,257` `alert(\`Print: ${r.title}\`)`. None touches `PrintQueue`.
21. **"Export ZIP" and "Bulk Print" buttons have no `onClick`** — `SchoolResourceLibrary.jsx:276-281`.
22. **Worksheets tab is a hardcoded empty state** — `CurriculumEngine.jsx:241-249`. No query, no data path.
23. **`AcademicResource.print_count` and `view_count` are never incremented** anywhere in `src/`, yet two UI surfaces rank by `print_count` (`SchoolResourceLibrary.jsx:132,211,330`).
24. **`status: 'orphaned'` is never written** — the entire orphan-detection story (KPI card, red banner, filter, per-row Reassign button) is inert.
25. **`qr_code_url` is never written or read** anywhere; "QR Activity" in EnterpriseAnalytics is print-job counts relabelled (`:110-119`); code comment admits `// fake`.
26. **Storage usage is invented** — `EnterpriseAnalytics.jsx:322-327`: "100 GB free", `Math.min(resources.length/10, 100)`, "Upgrade to Enterprise for 250 GB". `file_size_kb` is captured on upload and never summed.
27. **Tools output is never persisted.** `Tools.jsx` has zero `base44.entities.*` calls. Generated worksheets/quizzes don't become `AcademicResource`; generated lesson plans don't become `LessonPlan`; parent emails never reach `SendEmail`; notices never reach `PrintQueue`.
28. **Generated images are never uploaded** — `Tools.jsx:43` stores the provider URL directly; no `Core.UploadFile` round-trip, so links likely expire.

### ⚫ Dead code

29. `src/components/curriculum/SyllabusTab.jsx` — not imported anywhere. **The only creator of `Syllabus` rows.**
30. `src/components/curriculum/LessonLogTab.jsx` — not imported anywhere. The only code that advances `Syllabus.status` from lesson logs (`:53-57`).
31. `src/components/curriculum/PacingPlanTab.jsx` — not imported anywhere. The most sophisticated AI feature in the area.
32. `src/components/lessonplanner/TemplateLibrary.jsx` — not imported anywhere. The only authoring path for `LessonTemplate.tags`.
33. **`DailyAILimit` and `AIBillingModel` entities** — zero references in `src/`.
34. **`ResourceFolder.shared_with`** — declared, never read or written.
35. **`AcademicResource.description` and `.tags`** — declared; `UploadResourceDialog` never collects either.
36. **Book edit** — `BookLibraryTab.jsx:60` `openEdit` is threaded to `BookCard`/`BookList` as `onEdit` but neither component renders a control for it (`:207-235`, `:237-268`).
37. **`ResourceCard` "View" button** — `:273` calls `onView`, never supplied by `MyResources` (`:222-231`, `:240-249`).
38. **AIPlanner dead state/imports** — `editingSection`/`setEditingSection` (`:43`) unused; `useRef` (`:1`), `Printer`, `BookOpen`, `ChevronRight` (`:16-17`) imported and unused (the Print button was clearly planned).
39. **`/lesson-planner` has no nav entry** in `MobileNav.jsx` (only `/ai-planner` at `:46,:95`). Reachable only by typing the URL. Note `/ai-planner` is listed **twice** in `MobileNav.jsx` (`:46` and `:95`).
40. **Unused imports elsewhere:** `CurriculumEngine.jsx:12` `Layers`; `WorkloadCalendar.jsx:8` `Link`; `SchoolResourceLibrary.jsx:17` `Cell`; `Analytics.jsx:11` `Download`, `:9` `Legend`.
41. **`Analytics.jsx:210` branches on `userRole === 'teacher'`** — unreachable, the route guard (`App.jsx:128`) allows only superadmin/admin.

### ⚠️ Design smells worth flagging

42. **`Syllabus` join key is inconsistent across consumers** — `grade_number + subject` (`LessonLogTab.jsx:41-45`, `PacingPlanTab.jsx:36-38`) vs. `class_id` (`QuickLessonLog.jsx:39`).
43. **Two unrelated entities both called "syllabus"** — `Syllabus` (structured topics) and `SyllabusUpload` (a PDF). No link between them.
44. **Workload joins teachers by display-name string**, not user id (`WorkloadBalancer.jsx:38-39,51`).
45. **"Absences (last 30 days)" has no date filter** (`WorkloadBalancer.jsx:34,50-54,136`).
46. **`MyResources` default-folder effect can duplicate** — `:88-99` fires on `folders.length === 0`; the `create` calls are not guarded against a second run before the invalidation resolves.
47. **`ResourceFolder.filter({owner_id: undefined})`** when `user` hasn't loaded (`MyResources.jsx:79`) — no `enabled` guard, likely returns all folders.
48. **All prompts are client-side**, so a user can read and tamper with them, and any future quota check placed there is trivially bypassed.
49. **`MoveFolderDialog` initialises from `resource?.folder_id` in `useState`** (`:168`) — captured on first mount only; if the component isn't remounted per target the dialog shows a stale folder. (`MyResources.jsx:288` does gate on `{moveTarget && ...}`, so this is currently safe but fragile.)

---

## 8. Open questions for the owner

1. **`/lesson-planner` vs `/ai-planner`:** both write `LessonPlan` with incompatible field sets, and `/lesson-planner` isn't even in the nav. Is the manual planner deprecated, or is the intent one page with a "generate" affordance? If both survive, `LessonPlan` needs one canonical shape (the `content` / `materials_needed` / `homework_legacy` fields are already marked "legacy").
2. **The structured curriculum spine (`Syllabus` + `LessonLog` + pacing planner) is fully built but unwired.** Was it cut deliberately, or did the tab wiring get lost? It's the single biggest piece of latent value in this area — the pacing planner is the only AI feature grounded in the school's real data.
3. **How should a class map to syllabus topics** — by `grade_number + subject` (curriculum shared across sections) or by `class_id` (per-class curriculum)? The code does both.
4. **Should `SyllabusUpload` (the PDF) feed `Syllabus` (the topic rows)?** `Core.ExtractDataFromUploadedFile` is already used in the marketplace. Upload-PDF → extract chapters/topics → review → commit as `Syllabus` rows would close the biggest gap in the whole area.
5. **AI credit economy: build it or cut it?** Five entities and a full admin approval UI exist for a system with zero enforcement. If you're building it: who deducts credits (server function, or trusted client)? What's the credit-per-tool price list? Who creates the daily `CreditAllocation` rows and resets them at midnight? What happens at zero — hard block, soft warning, or auto-charge? `cost_generated` is in BDT — is AI billed on top of subscription?
6. **Where's the teacher side of the credit flow?** `CreditRequest` is never created. Teachers currently have no way to see their own balance or ask for more.
7. **Tools outputs are thrown away.** Should a generated worksheet become an `AcademicResource` (with file + `resource_identifier`), a generated lesson plan become a `LessonPlan`, a parent email go through `Core.SendEmail`, a notice go to `PrintQueue`? This is probably the single highest-leverage change for perceived product value.
8. **Tenancy key: `workspace_id` or `school_id`?** Classes/Students/LessonPlan use `workspace_id` with RLS; AcademicResource/ResourceFolder/AIUsageLog use `school_id` with none. And `User` declares neither, so `school_id` resolves to `'default'` everywhere. Which wins?
9. **`User.role` enum is `['admin','user']` but the app assumes 5 roles.** Is the real role source `WorkspaceMember.role` (which `SchoolContext` reads) with `User.role` vestigial? If so, every `u.role === 'teacher'` filter needs to go through `WorkspaceMember` — that's what's breaking sharing and reassignment.
10. **Resource identifiers** are random 6-digit numbers with no uniqueness check, and 7 of 15 resource types share the `RS` prefix. Do you want true sequential per-type IDs (`WS-000214`, as the schema comment describes)?
11. **Who marks a resource `orphaned`?** The whole orphan/reassign story hangs on a status transition that nothing performs. Should offboarding a `WorkspaceMember` sweep their `AcademicResource` rows?
12. **Workload: scheduled periods or actual periods?** The balancer counts `ScheduleSlot` rows; `LessonLog.periods_used` captures what actually happened and is ignored. Also: should a class support more than one teacher? `Class.teacher_name` is a single free-text string.
13. **Does "avg attendance 91%" need to become real** before launch, or is the Academic Overview tab being replaced wholesale by the Enterprise Dashboard?
14. **QR codes** — `qr_code_url` is in the schema, "QR Activity" is in the dashboard, and `permissions.js:175` has a `barcode_dashboard` permission. Is there a QR/barcode product intent here that was never built?
15. **Storage quotas** — is "100 GB free / 250 GB Enterprise" a real plan limit? `file_size_kb` is already captured per resource, so a real meter is cheap.

---

## 9. Cross-area dependencies

**This area depends on:**

- **Classes & Scheduling** — `Class` (`name`, `subject`, `grade_number`, `grade_label`, `teacher_name`) is the join key for virtually every feature here. `ScheduleSlot` is the sole input to the Workload Balancer. `Class.teacher_name` being a free-text string is the weak link.
- **Auth & tenancy** — `lib/AuthContext.jsx` (`user`), `lib/SchoolContext.jsx` (`school`, `activeWorkspaceId`, `currentRole`), `lib/RoleGuard.jsx`, `lib/permissions.js`. **None of the pages in this area import `useSchool()`** — that is the root of the `workspace_id`/`school_id` failures.
- **Students & assessment** — `Student.needs_attention` / `.attention_reason` / `.average_score` are written by Risk Scoring and read by AttentionList, Analytics and (per §7) StudentDetail. `Mark` and `BehaviorLog` are Risk Scoring's only inputs.
- **Assignments & Exams** — `Assignment` and `Exam` feed the Workload Calendar and two CurriculumEngine tabs.
- **Print** — `PrintQueue` feeds Analytics print-job counts and the (broken) most-printed table. All the "print" buttons in this area are `alert()`s that should be creating `PrintQueue` rows.
- **Marketplace** — `MarketplaceTransaction` / `MarketplaceListing` feed the Enterprise Dashboard's spend section. `marketplace/ListingDetail.jsx:97` **creates `AcademicResource` rows** with `source: 'marketplace_purchase'` — purchased resources land in this area's library, so any change to `AcademicResource` shape must be coordinated with marketplace.
- **Billing** — `/billing` → `billing/StaffAIPanel.jsx` and `billing/BillingOverview.jsx` own the AI credit UI. The credit entities are documented here because the enforcement belongs to the AI calls in this area, but the admin UI lives in Billing.
- **Audit** — `lib/auditLog.js` (called incorrectly from `SchoolResourceLibrary.jsx:89`).
- **Shared components** — `components/shared/FileViewer.jsx` (prop mismatch), `SubjectBadge.jsx`, `PageHeader.jsx`.
- **Labels** — `CustomLabel` drives the Enterprise Dashboard's department buckets, cross-referenced against `User.department`.

**This area is depended on by:**

- **Handouts / Assignments / Exams / Print** import `MATERIAL_TYPES` from `src/lib/materialTypes.js` (`Assignments.jsx`, `Exams.jsx`, `Handouts.jsx`, `SchoolResourceLibrary.jsx`) — a 16-value list that **does not match** `AcademicResource.resource_type`'s 15-value enum. Two competing taxonomies.
- **Students area** consumes `needs_attention` / `attention_reason` written by Risk Scoring.
- **Reports** (`components/reports/StudentReportCard.jsx:70`) makes an `InvokeLLM` call that should be metered by whatever credit system this area ends up implementing.
- **Marketplace** writes into `AcademicResource`, so the resource library is a shared surface.
