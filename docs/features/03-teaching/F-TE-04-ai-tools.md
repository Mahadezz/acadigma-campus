# F-TE-04 — AI tools and the prompt catalogue

|                  |                                                                                                                                                                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | teaching                                                                                                                                                                                                                                                                                                 |
| Status           | planned                                                                                                                                                                                                                                                                                                  |
| Owner branch     | `feat/teaching-ai-tools`                                                                                                                                                                                                                                                                                 |
| Depends on       | **F-TE-03 (credits — hard blocker, nothing here runs without it)** · F-TE-05 (resources — where worksheets, quizzes, rubrics and illustrations are persisted) · F-OP-07 (messaging — parent message drafts) · F-OP-04 (print queue — notices) · F-AC-04 (students/sections, for first-name-only context) |
| Plan             | `docs/plan/ROADMAP.md` chunk — teaching, position 5                                                                                                                                                                                                                                                      |
| Base44 reference | `docs/reference/base44-inventory/03-teaching-intelligence.md` §3.1(B)(C)(D)(E), §3.2, §4 row 12, §7 items 16, 27, 28, 48, §8 Q7                                                                                                                                                                          |

## 1. Purpose

Seven one-shot AI tools that produce something a teacher can use in the next hour: a **worksheet**, a **quiz**, a **parent message**, a **notice**, a **marking rubric**, a **differentiation pack**, and a **classroom illustration**. Each one starts from a short form, costs a known number of credits, returns structured data (never a prose blob), and **is saved** — into `resources`, a message draft, or a print job. This file is also the **prompt catalogue** for the whole area: every versioned prompt used by F-TE-01, F-TE-02 and the tools here is defined in §4, because a prompt scattered across feature files is a prompt nobody can version.

**What Base44 intended, and what was broken.** `Tools.jsx` shipped 7 text tools plus an image generator behind a single `InvokeLLM` dispatch table. Every text prompt was **plain text with no response schema**, so every output was an unparseable blob rendered into a `<pre>` with one "Copy" button. **Nothing was ever saved** — the file contained zero entity writes: a generated worksheet never became a resource, a generated lesson plan never became a lesson plan, a parent email never reached an email sender, a notice never reached the print queue. Every output died on navigate-away. The notice tool asked the teacher to _type the school name by hand_ while the school context sat one import away. The image generator stored the provider's ephemeral URL directly with no upload round-trip, so links expired. Every prompt lived in the browser, readable and tamperable. Three of the five AI calls in the area had no `try/catch` at all. And none of it was metered.

**Done looks like:** the prompts live on the server in versioned modules, the outputs are typed and validated, every artefact lands in a table, every call passes through the credit ledger, and every failure is a specific, recoverable message.

## 2. Roles and permissions

| Action                                                     | permission key                  | owner | admin | teacher | staff | parent | platform |
| ---------------------------------------------------------- | ------------------------------- | ----- | ----- | ------- | ----- | ------ | -------- |
| Open the AI tools hub                                      | `ai_tools.read`                 | ✓     | ✓     | ✓       | —     | —      | —        |
| Worksheet / quiz / rubric / differentiation / illustration | `ai.generate` + credits         | ✓     | ✓     | ✓       | —     | —      | —        |
| Parent message                                             | `ai.generate` + `message.write` | ✓     | ✓     | ✓       | —     | —      | —        |
| Notice                                                     | `ai.generate` + `notice.write`  | ✓     | ✓     | —       | —     | —      | —        |
| Send a parent message                                      | `message.send`                  | ✓     | ✓     | ✓       | —     | —      | —        |
| Publish a notice / queue it for print                      | `notice.publish`                | ✓     | ✓     | —       | —     | —      | —        |
| Read a colleague's generated artefact                      | via F-TE-05 sharing             | —     | —     | —       | —     | —      | —        |
| Read `ai_generations` for the workspace                    | `ai_credits.analytics`          | ✓     | ✓     | —       | —     | —      | ✓        |

Notices are admin/owner only because a notice goes to parents under the school's name. A teacher who needs one drafts it as a message and an admin publishes it.

## 3. Input safety and redaction

**The rule (PRODUCT-DECISIONS-aligned, and non-negotiable): no student PII reaches a prompt beyond a first name and a grade-level label.**

**Allowed in any prompt:** subject, topic, grade-level label ("Class 6"), section label ("A") _without_ a roster, period/duration, teacher-typed free text, school name, school type, language, difficulty, question counts, syllabus topic titles, a student's **first name only**, and an aggregate ("18 of 34 students scored below 40 %").

**Forbidden, in every prompt, always:** full student names, student ids or roll numbers, dates of birth, addresses, guardian names, phone numbers, email addresses, national ID numbers, health or medical notes, behaviour log text, photographs, and any raw roster.

**Enforcement, in three independent layers:**

1. **Schema.** Every prompt input is a `.strict()` Zod object in `packages/contracts/ai-tools.ts` with only the allowed fields. There is no `extra` or `context` free-slot that could smuggle a payload; `notes` fields are typed and length-capped.
2. **`assertNoPII(input)`** in `packages/domain/ai/redaction.ts`, called by `adapters/ai/invoke()` **before any network call** (F-TE-03 §4.1 step 6). It scans every string value for: Bangladeshi mobile numbers `/\b01[3-9]\d{8}\b/`, international `+880` forms, email addresses, 10/13/17-digit NID patterns, and dates of birth in common formats. A hit throws `PII_BLOCKED`; the reservation is released and **no credits are charged**.
3. **Name check.** For any action carrying `studentFirstName`, the server verifies it against `students.first_name` for a student the caller can access and rejects anything containing whitespace or more than 40 characters — so "Rahim Uddin Ahmed, Roll 14" cannot be typed into the first-name box. For every other action, the server loads the caller's accessible student surnames and rejects an exact surname match in free text (a cheap, high-value guard against a teacher pasting a roster into "notes").

**What is logged:** `ai_generations.input_digest` is a SHA-256 of the canonicalised redacted input. **The prompt text itself is never stored.** The "What was sent?" affordance in the UI re-renders the prompt from the stored input fields at display time for the current user only; it does not read a log.

**PII in _outputs_.** The model is instructed, in every system prompt, never to invent or request student personal details. Outputs are rendered as text, never as HTML; React escaping plus a CSP with no `unsafe-inline` covers the injection surface. An SVG illustration is additionally sanitised (§4.7).

## 4. The prompt catalogue

Every prompt is a module in `packages/domain/ai/prompts/<name>.<version>.ts` exporting:

```ts
export const worksheetV1 = {
  key: "worksheet.generate",
  version: "worksheet.v1",
  model: "claude-sonnet-5",
  maxOutputTokens: 4000,
  timeoutMs: 60_000,
  effort: "medium",
  system: SYSTEM, // cached prefix
  user: (i: WorksheetInput) => string,
  output: WorksheetOutput, // Zod schema -> zodOutputFormat()
} satisfies PromptDefinition
```

Calls use `client.messages.parse({ model, max_tokens, output_config: { format: zodOutputFormat(schema), effort }, thinking: { type: 'adaptive' }, system: [...cached...], messages })` over `.stream()`, per ARCHITECTURE §5 and the Claude API guidance. **`parsed_output` is null on a parse failure and is always guarded, never asserted.** Model ids are `claude-sonnet-5` and `claude-haiku-4-5` per D-08; they come from `ai_actions.model_id`, and the prompt module's `model` field is checked against it by a startup assertion so the two cannot drift.

A version is **immutable once shipped**. Changing a prompt means `worksheet.v2` and a new `ai_actions.prompt_version`; `v1` stays in the repo so `ai_generations` rows remain interpretable. Prompt modules have snapshot tests so a wording change cannot land silently.

### 4.1 `lesson_plan.v1` — used by F-TE-01

**Model** `claude-sonnet-5` · **effort** `medium` · **max output** 4,000 · **timeout** 60 s · **cost** 5 credits.

**System** (cached):

> You are an experienced secondary-school teacher and curriculum designer working in a Bangladeshi school. You write lesson plans that a real teacher can pick up and teach from, with realistic timings for a class of 35–50 students and low-cost, locally available materials. Be concrete: name the activity, say what the teacher does and what the students do. Never invent student names or personal details, and never ask for them. Write in the language requested; default to English. Return only the structured object requested — no preamble, no commentary.

**User template**:

```
Plan one lesson.
Subject: {subject}
Topic: {topic}
Grade level: {gradeLabel}
Lesson length: {durationMinutes} minutes
Teaching style: {teachingStyle}
{objectivesHint ? `The teacher's own objectives: ${objectivesHint}` : ''}
{syllabusContext ? `This lesson sits in the unit "${syllabusContext.unitTitle}". Previously covered: ${syllabusContext.previousTopics.join('; ')}.` : ''}
{notes ? `Teacher's notes: ${notes}` : ''}
Include homework: {includeHomework ? 'yes' : 'no'}
Include an assessment activity: {includeAssessment ? 'yes' : 'no'}
Language: {language}

The activity timings must sum to {durationMinutes} minutes.
```

**Output schema** `LessonPlanAIOutput`:

```ts
z.object({
  title: z.string().min(3).max(120),
  objectives: z.array(z.string().min(3)).min(2).max(6),
  materials: z.array(z.string()).max(12),
  activities: z
    .array(
      z.object({
        phase: z.enum(["starter", "main", "practice", "plenary", "other"]),
        title: z.string().min(3).max(80),
        content: z.string().min(10),
        duration_minutes: z.number().int().min(1).max(180),
      })
    )
    .min(3)
    .max(6),
  assessment: z.string().nullable(),
  homework: z.string().nullable(),
  differentiation_support: z.string(),
  differentiation_extension: z.string(),
}).strict()
```

**Persisted:** merged into the open `lesson_plans` form; saved to `lesson_plans` on Save with `generated_by_ai`, `ai_prompt_version`, `ai_generation_id`. **Note the schema requires `title`** — the exact field Base44's AI planner never produced.

### 4.2 `worksheet.v1`

**Model** `claude-sonnet-5` · effort `medium` · max output 4,000 · timeout 60 s · **cost 3 credits** (repricing recommendation in F-TE-03 §5.12).

**System** (cached):

> You write printable classroom worksheets for Bangladeshi schools. Questions must be answerable from the stated topic alone, ordered easiest to hardest, and phrased in plain language for a second-language English reader unless another language is requested. Leave realistic working space. Provide a complete answer key. Never reference a named student. Return only the structured object requested.

**User template**:

```
Create a worksheet.
Subject: {subject}
Topic: {topic}
Grade level: {gradeLabel}
Number of questions: {questionCount}
Question types: {questionTypes.join(', ')}
Difficulty: {difficulty}
{instructionsNote ? `Additional instruction: ${instructionsNote}` : ''}
Language: {language}
Include an answer key: yes
```

**Output** `WorksheetOutput`:

```ts
z.object({
  title: z.string().max(120),
  instructions: z.string(),
  estimated_minutes: z.number().int().min(5).max(120),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        questions: z
          .array(
            z.object({
              number: z.number().int().positive(),
              type: z.enum([
                "mcq",
                "short_answer",
                "fill_blank",
                "true_false",
                "long_answer",
                "matching",
              ]),
              prompt: z.string(),
              options: z.array(z.string()).max(6).nullable(),
              answer_space_lines: z.number().int().min(0).max(20),
              marks: z.number().int().min(1).max(20),
            })
          )
          .min(1),
      })
    )
    .min(1)
    .max(6),
  answer_key: z.array(
    z.object({
      number: z.number().int().positive(),
      answer: z.string(),
      marking_note: z.string().nullable(),
    })
  ),
  total_marks: z.number().int().positive(),
}).strict()
```

**Persisted:** a `resources` row of `resource_type='worksheet'` with a sequential identifier `WS-000214` (F-TE-05 §5.2), rendered to PDF by `/api/pdf/worksheet` (answer key on a separate page, toggleable), the PDF stored in `files`, linked to the resource. Metadata: subject, grade, tags `['ai-generated', topic]`, `source='ai'`, `ai_generation_id`.

### 4.3 `quiz.v1`

**Model** `claude-sonnet-5` · effort `medium` · max output 3,500 · timeout 60 s · **cost 3 credits**.

**System** (cached):

> You write classroom quizzes for Bangladeshi schools. Every question must have exactly one defensible correct answer. Distractors must be plausible and wrong for a stated reason, never joke options. Cover the stated topic evenly rather than clustering on one sub-skill. Never reference a named student. Return only the structured object requested.

**User template**:

```
Create a quiz.
Subject: {subject}
Topic: {topic}
Grade level: {gradeLabel}
Number of questions: {questionCount}
Format: {quizType}          // mcq | short_answer | true_false | mixed
Difficulty: {difficulty}
Time limit: {timeLimitMinutes} minutes
Language: {language}
```

**Output** `QuizOutput`: `{ title, instructions, time_limit_minutes, questions: [{ number, type, prompt, options: string[]|null, correct_answer: string, explanation: string, marks, difficulty: 'easy'|'medium'|'hard' }], total_marks }` — with a refinement asserting that for `type='mcq'`, `options` has 3–5 entries and `correct_answer` is one of them. A violation is a schema failure and triggers the repair retry, which is precisely the class of bug a plain-text prompt cannot even detect.

**Persisted:** a `resources` row `resource_type='quiz'`, identifier `QZ-`, PDF with an optional separate answer key. A future path turns a quiz into an `exams`/`exam_subjects` row; out of scope for v1 and recorded in FUTURE.md.

### 4.4 `parent_message.v1`

**Model** `claude-haiku-4-5` · effort n/a (Haiku takes `budget_tokens`; this action runs without thinking) · max output 800 · timeout 30 s · **cost 1 credit**.

**System** (cached):

> You write short, warm, professional messages from a teacher to a parent at a Bangladeshi school. Be specific about what happened and what you are asking for, never judgemental about the child or the family. Two to four short paragraphs, no bullet lists, no emoji. End with one clear next step. Use only the child's first name. Never invent details, dates, marks, or incidents that were not given to you. If the situation is serious, recommend a meeting rather than describing consequences. Return only the structured object requested.

**User template**:

```
Write a message to a parent.
Child's first name: {studentFirstName}
Grade level: {gradeLabel}
Reason for writing: {purpose}      // praise | concern_academic | concern_behaviour | absence | meeting_request | general
What happened (teacher's words): {context}
Desired outcome: {desiredOutcome}
Tone: {tone}                        // warm | neutral | formal
Teacher's name: {teacherName}
School: {schoolName}
Language: {language}                // en | bn
```

**Output** `ParentMessageOutput`: `{ subject: z.string().max(120), body: z.string().min(80).max(2000), suggested_next_step: z.string().max(200), tone_used: z.enum(['warm','neutral','formal']) }`.

**Persisted:** a **draft** in the messaging module (`messages` with `status='draft'`, F-OP-07), addressed to the linked guardian(s) of the selected student, never sent automatically. The teacher edits and presses Send themselves. `ai_generation_id` is stored on the draft. Base44 generated these and dropped them on the floor.

**Extra safety here:** this is the only tool that takes a student reference at all, and it takes **a first name and a grade label only**. The guardian recipient is resolved server-side from the student id the teacher selected in the UI — the student id is _never_ placed in the prompt.

### 4.5 `pacing_plan.v1` — used by F-TE-02

**Model** `claude-sonnet-5` · effort `high` · max output 6,000 · timeout 60 s · **cost 8 credits**.

**System** (cached):

> You are a curriculum planner for schools. You are given a list of topics with estimated period counts and an exact list of available teaching dates and periods. Schedule the topics across the given dates in the order supplied, splitting a topic across consecutive periods when its estimate exceeds one. Never schedule anything on a date that is not in the supplied list. Never invent dates, holidays or topics. If the topics cannot fit in the available periods, schedule what fits and say plainly in the recommendations how many periods short the plan is. Return only the structured object requested.

**User template**:

```
Build a pacing schedule.
Class: {gradeLabel} section {sectionLabel} — {subject}
Window: {startDate} to {endDate} ({weeksCount} weeks)
Total teaching periods available in this window: {totalPeriodsAvailable}
Available dates and periods (each line is one usable period):
{availableSlots.map(s => `${s.date} (${s.weekday}) period ${s.periodNumber}`).join('\n')}

Topics still to cover, in teaching order:
{topics.map((t,i) => `${i+1}. [${t.unitTitle}] ${t.title} — ${t.estimatedPeriods} period(s)`).join('\n')}

Recent teaching history (most recent 5 lessons):
{recentLogs.length ? recentLogs.map(l => `${l.date}: ${l.topicTitle} (${l.coverage}, ${l.periodsUsed} period(s))`).join('\n') : 'No lessons logged yet.'}
Observed pace: {actualPeriodsPerTopic ?? 'unknown'} periods per topic against an estimate of {estimatedPeriodsPerTopic}.
Language: {language}
```

**Output** `PacingPlanOutput`:

```ts
z.object({
  weeks: z
    .array(
      z.object({
        week_number: z.number().int().positive(),
        starts_on: z.string(), // ISO date, refined: must be in availableSlots
        ends_on: z.string(),
        days: z.array(
          z.object({
            date: z.string(),
            period_number: z.number().int().positive(),
            topic_index: z.number().int().nullable(), // index into the supplied topic list, not a free string
            topic_title: z.string(),
            unit_title: z.string(),
            notes: z.string().nullable(),
          })
        ),
        summary: z.string(),
      })
    )
    .min(1)
    .max(16),
  recommendations: z.array(z.string()).min(1).max(6),
  periods_short: z.number().int().min(0),
}).strict()
```

A **post-validation** step (not a model instruction) rejects the output if any `(date, period_number)` is absent from `availableSlots`, or if `topic_index` is out of range — this is a schema failure and triggers the repair retry. The calendar is arithmetic; the model is not trusted with it.

**Persisted:** `pacing_plans` (F-TE-02 §3.7). Base44 never persisted this at all.

### 4.6 `syllabus_extract.v1` — used by F-TE-02

**Model** `claude-sonnet-5` _(deviation from D-08's haiku-for-extraction — see F-TE-02 §11.3 and the README conflicts)_ · effort `high` · max output 8,000 · timeout 180 s (background job) · **cost 10 credits**.

**System** (cached):

> You extract curriculum structure from official school syllabus documents. Reproduce the document's own chapter and topic wording exactly; do not paraphrase, translate, summarise or add topics that are not in the document. If the document states a period, class or lecture count for a topic, use it; otherwise estimate from the topic's scope and mark your confidence as low. Preserve the document's order. If the document contains no identifiable topic list, return an empty units array rather than inventing one. Return only the structured object requested.

**User content:** a `document` content block carrying the PDF (base64, read server-side from the private bucket — the model never receives a URL), followed by:

```
Extract the unit and topic structure from this syllabus.
Subject: {subject}
Grade level: {gradeLabel}
Academic year: {academicYear}
Document language: {language}
```

**Output** `SyllabusExtractionOutput`:

```ts
z.object({
  detected_subject: z.string().nullable(),
  detected_grade: z.string().nullable(),
  units: z
    .array(
      z.object({
        unit_number: z.number().int().positive().nullable(),
        title: z.string().min(1).max(200),
        topics: z
          .array(
            z.object({
              title: z.string().min(1).max(300),
              description: z.string().nullable(),
              estimated_periods: z.number().int().min(1).max(20),
              confidence: z.enum(["high", "medium", "low"]),
              source_page: z.number().int().positive().nullable(),
            })
          )
          .max(60),
      })
    )
    .max(30),
  notes: z.string().nullable(),
}).strict()
```

`confidence: 'low'` rows drive the amber "check this" flags in the review table — the whole point of the human review step.

**Persisted:** `syllabus_extractions.raw_output` and `.draft`; committed rows land in `syllabus_units`/`syllabus_topics` only after a human presses Commit.

### 4.7 `notice.v1`

**Model** `claude-haiku-4-5` · max output 1,200 · timeout 30 s · **cost 1 credit**.

**System** (cached):

> You write formal school notices for a Bangladeshi school. Structure: a clear subject line, the notice body in short paragraphs, then any dated or numbered details as a compact list. Use formal but plain English (or Bangla if requested). State dates, times and venues exactly as given; never invent them. Do not name individual students. Return only the structured object requested.

**User template**:

```
Write a school notice.
School: {schoolName}
Notice about: {purpose}
Details given by the school: {details}
Audience: {audience}                 // parents | students | staff | all
Effective date(s): {effectiveDates ?? 'not specified'}
Notice date: {noticeDate}
Signed by: {signatory} ({signatoryTitle})
Language: {language}
```

**The school name and date come from `school_profiles` and the workspace clock, server-side.** Base44 asked the teacher to type the school name while the context sat one import away — a small thing that tells you the tool was never wired to the app.

**Output** `NoticeOutput`: `{ reference_hint: z.string().nullable(), subject: z.string().max(140), body: z.string().min(80), details: z.array(z.string()).max(10), closing: z.string() }`.

**Persisted:** a `notices` draft (F-OP-04) plus, on "Send to print", a `print_jobs` row whose copies default to the audience count (enrolled students for a section, active members for staff). Rendered by `/api/pdf/notice` with the school letterhead from `school_profiles`.

### 4.8 `rubric.v1`

**Model** `claude-sonnet-5` · effort `medium` · max output 3,000 · timeout 60 s · **cost 2 credits**.

**System** (cached):

> You write marking rubrics for school teachers. Each criterion must be observable in the student's work, described at every band in terms of what the work shows rather than what the student is. Band descriptors must be distinguishable from one another. Marks must sum to the stated total. Never reference a named student. Return only the structured object requested.

**User template**:

```
Create a marking rubric.
Subject: {subject}
Task being marked: {taskDescription}
Grade level: {gradeLabel}
Total marks: {totalMarks}
Number of criteria: {criteriaCount}
Band scale: {bandScale}            // four_band | five_band | bd_letter (A+, A, A-, B, C, D, F)
Language: {language}
```

**Output** `RubricOutput`: `{ title, total_marks, criteria: [{ name, weight_marks, bands: [{ label, min_marks, max_marks, descriptor }] }] }`, refined so `Σ weight_marks === total_marks` and bands within a criterion do not overlap. The `bd_letter` scale's bands come from the school's `grade_scales` (PRODUCT-DECISIONS 2.4) and are supplied in the prompt, not invented.

**Persisted:** a `resources` row `resource_type='rubric'` with identifier `RB-`, plus optional attachment to an `assignments` row.

### 4.9 `differentiation.v1`

**Model** `claude-sonnet-5` · effort `medium` · max output 3,000 · timeout 60 s · **cost 2 credits**.

**System** (cached):

> You help teachers adapt one lesson for a wide-ability class of 40+ students in a Bangladeshi school, where extra materials and extra adult help are usually unavailable. Give adaptations the same teacher can run in the same room in the same period. Be specific about what changes: the task, the scaffold, the grouping, or the success criterion. Never reference a named student and never label children. Return only the structured object requested.

**User template**:

```
Differentiate a lesson.
Subject: {subject}
Topic: {topic}
Grade level: {gradeLabel}
Core task all students will do: {coreTask}
Class profile (aggregate only): {classProfile}   // e.g. "about a quarter read below grade level; five are well ahead"
Constraints: {constraints}                       // e.g. "no printing, 45 minutes, one blackboard"
Language: {language}
```

**Output** `DifferentiationOutput`: `{ support: [{ strategy, how_to_run, success_criterion }], core: [...], extension: [...], grouping_suggestion, checkpoint_questions: string[] }` — three to five entries per tier.

**Persisted:** written back into the source `lesson_plans` row's `differentiation_support` / `differentiation_extension` when launched from a plan, or saved as a `resources` row `resource_type='notes'` when launched standalone.

### 4.10 `illustration.v1` ⚠ (see §5 and the README conflicts)

**Claude has no image-generation API.** The Base44 tool used its platform's `GenerateImage` integration; ARCHITECTURE names Anthropic Claude as the only AI vendor. This spec therefore implements the tool as a **vector illustration generator**: Claude returns sanitised, self-contained SVG. It is honest about what it is — clean diagram-style classroom art, not a photoreal image — and it adds no vendor, no new secret, and no new data-processing agreement.

**Model** `claude-sonnet-5` · effort `medium` · max output 8,000 · timeout 60 s · **cost 4 credits**.

**System** (cached):

> You produce simple, printable educational illustrations as self-contained SVG for classroom handouts. Use flat shapes, clear outlines and a small palette that prints legibly in black and white. Label parts with short text where labelling helps. Output must be a single `<svg>` element with an explicit `viewBox`, no scripts, no external references, no embedded raster data, no fonts other than generic families. Keep it under 60 KB. Never depict identifiable real people. Return only the structured object requested.

**User template**:

```
Draw an educational illustration.
Subject: {subject}
Grade level: {gradeLabel}
What to show: {description}
Style: {style}                 // diagram | labelled_diagram | scene | icon_set
Orientation: {orientation}     // landscape | portrait | square
Include labels: {includeLabels ? 'yes' : 'no'}
Label language: {language}
```

**Output** `IllustrationOutput`: `{ title, alt_text: z.string().min(20), svg: z.string().max(60_000), palette_note: z.string().nullable() }`.

**Server-side sanitisation before anything is stored or rendered** — this is a security boundary, not a formality. The SVG is parsed and rebuilt with an allow-list: permitted elements (`svg, g, path, rect, circle, ellipse, line, polyline, polygon, text, tspan, defs, linearGradient, radialGradient, stop, title, desc`) and attributes (geometry, `fill`, `stroke`, `stroke-width`, `opacity`, `transform`, `viewBox`, `font-family`, `font-size`, `text-anchor`). Everything else is dropped: `script`, `foreignObject`, `image`, `use`, `a`, every `on*` handler, every `href`/`xlink:href`, every `style` attribute and `<style>` block, every `data:` URI. A file failing to parse is a schema failure. Stored SVG is served from the **private** bucket via `/api/files/[id]` with `Content-Type: image/svg+xml`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`, `X-Content-Type-Options: nosniff`, and `Content-Disposition: inline` — and is rendered in the app inside an `<img>`, never inlined into the DOM.

**Persisted:** a `files` row (the `.svg`) plus a `resources` row `resource_type='other'` with identifier `IL-`, `alt_text` stored on the resource for accessibility. A PNG rendition for pasting into other documents is produced on demand by `/api/pdf/illustration?format=png`. Base44 stored the provider's ephemeral URL and nothing else; every generated image it produced is by now a dead link.

## 5. Business rules and calculations

**5.1 Costs and models** are read from `ai_actions` at call time (F-TE-03 §3.1, §5.2). Neither the client nor the prompt module is authoritative; the startup assertion in §4 guarantees they agree.

**5.2 Every tool persists.** A generation that the user abandons still cost credits, but the _artefact_ is only written on Save. The one exception: the hub keeps the last successful generation per tool in `sessionStorage` for the current session so a mis-tap on Back does not lose work — it is a client convenience, never a source of truth, and it is cleared on sign-out.

**5.3 Regeneration** is a new reservation at full price, with the previous output kept side-by-side so the teacher can choose. Maximum 3 retained variants in the UI.

**5.4 Language.** `language ∈ {'en','bn'}`, defaulting from `user_preferences.language`. Bangla output requires the Bengali font already embedded for PDF rendering (ARCHITECTURE §5); the PDF route asserts the font is available before rendering rather than silently producing tofu.

**5.5 Retries and timeouts** follow F-TE-03 §5.5–5.6 exactly: one repair retry on schema failure, up to two on connection/5xx, none on refusal or `PII_BLOCKED`, and all retries share one reservation.

**5.6 Failure presentation (uniform across all seven tools).** Failures render as an inline `Alert` in the tool panel — never a toast that can be missed, never a silent reset — with: a plain sentence, whether credits were charged (always "No credits were used." on our failures), and a Retry button. The form keeps every input. The Generate button is re-enabled in the mutation's `onSettled`, which is the structural fix for the Base44 bug where a throw skipped `setGenerating(false)` and permanently froze the page.

| error                  | message                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INSUFFICIENT_CREDITS` | "You have {n} of {cost} credits. No credits were used." + Request credits                                                                                                              |
| `AI_TIMEOUT`           | "That took too long. No credits were used." + Retry                                                                                                                                    |
| `AI_SCHEMA_INVALID`    | "The result came back in a form we couldn't read. No credits were used." + Retry                                                                                                       |
| `AI_REFUSAL`           | "Claude declined to answer this one. Try rephrasing what you asked for. No credits were used."                                                                                         |
| `PII_BLOCKED`          | "For safety, student personal details can't be sent to AI. Remove phone numbers, full names or ID numbers and try again. No credits were used." — with the offending field highlighted |
| `RATE_LIMITED`         | "Too many generations just now. Try again in {retryAfter}s."                                                                                                                           |
| `AI_DISABLED`          | "Your school has AI features switched off."                                                                                                                                            |
| `PLAN_TIER`            | "This tool is available on {plan} and above." + Upgrade                                                                                                                                |

**5.7 Output rendering is never raw HTML.** Text outputs render as escaped text with a small allow-listed markdown subset (bold, lists) parsed to React elements, not `dangerouslySetInnerHTML`.

**5.8 Prompt caching.** The system block and the school-context block of each prompt carry `cache_control: {type:'ephemeral'}`; all volatile fields go after it. This is measured via `ai_generations.cache_read_tokens` (F-TE-03 §5.13).

**5.9 Determinism is not promised.** No temperature knob is exposed to users (and current models reject sampling parameters anyway); "Regenerate" is the only variation control.

## 6. UI

`/app/ai` is the tools hub.

| Screen             | Route             | 360×800                                                                                                | ≥1024                                              | Primary  | Empty                       | Loading                                                                                       | Error                                    |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------- | --------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Tools hub          | `/app/ai`         | Balance card at top, then a 2-column grid of 7 tool tiles (icon, name, cost pill)                      | 3-column grid + a right rail of recent generations | —        | n/a                         | Skeleton tiles                                                                                | Inline `Alert`                           |
| Tool panel         | `/app/ai/[tool]`  | Full-page: form (collapsible after first generate), sticky footer `Generate · 3 credits`, result below | Two-pane: form left 380 px, result right           | Generate | Form with sensible defaults | **Streaming skeleton** of the result's real shape (question rows, week cards) — not a spinner | Inline `Alert` per §5.6, inputs retained |
| Result actions     | within panel      | Sticky bar: Save · Print · Copy · Regenerate                                                           | Same                                               | Save     | n/a                         | Per-button spinners                                                                           | Inline                                   |
| Recent generations | `/app/ai/history` | Card list: tool, date, credits, status, link to the artefact                                           | Table                                              | —        | "Nothing generated yet."    | Skeletons                                                                                     | Inline                                   |

Phone specifics: the form collapses to a one-line summary after a successful generation so the result owns the screen; tapping the summary re-expands it. The result is scrollable with the action bar pinned above the bottom nav. Long results (a 20-question worksheet) render progressively as the stream arrives, so the teacher sees question 1 within two seconds.

Components: `ToolTile`, `CreditBadge`, `AiGenerateButton`, `StreamingResult`, `QuestionList`, `RubricTable`, `SvgPreview`, `FormSheet`, `Alert`, `EmptyState`, `Skeleton`.

Accessibility: `aria-live="polite"` announces "Generating…", then "Ready, 10 questions". The SVG preview always carries the model-supplied `alt_text`, and the Save action refuses an empty `alt_text` (the schema requires ≥20 characters).

## 7. Server contracts

All under `apps/web/app/(school)/app/ai/_actions.ts`; schemas in `packages/contracts/ai-tools.ts`. Every one goes through `adapters/ai/invoke()` and therefore through F-TE-03's reserve/settle.

| Name                                                        | Input schema                                                                                                                                                                                        | Output                                                         | Errors                                                        | Idempotency      | Rate limit  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- | ---------------- | ----------- |
| `aiTools.list`                                              | `{}`                                                                                                                                                                                                | `AiToolSummary[]` (key, label, cost, enabled for my plan/role) | —                                                             | —                | cached      |
| `aiTools.worksheet`                                         | `WorksheetInput` `{ subject, topic, gradeLabel, questionCount 5..40, questionTypes[], difficulty, instructionsNote?, language }` `.strict()`                                                        | `{ generationId, creditsCharged, output: WorksheetOutput }`    | `INSUFFICIENT_CREDITS`, `AI_*`, `PII_BLOCKED`, `RATE_LIMITED` | key **required** | 10/min/user |
| `aiTools.quiz`                                              | `QuizInput`                                                                                                                                                                                         | `{ … QuizOutput }`                                             | same                                                          | key              | 10/min      |
| `aiTools.parentMessage`                                     | `ParentMessageInput` `{ studentId, purpose, context(≤1000), desiredOutcome, tone, language }` — **`studentId` is resolved server-side to a first name and grade label; it never enters the prompt** | `{ … ParentMessageOutput, draftId }`                           | same + `STUDENT_NOT_ACCESSIBLE`                               | key              | 10/min      |
| `aiTools.notice`                                            | `NoticeInput` `{ purpose, details(≤2000), audience, effectiveDates?, signatory, language }`                                                                                                         | `{ … NoticeOutput, noticeId }`                                 | same + `FORBIDDEN`                                            | key              | 10/min      |
| `aiTools.rubric`                                            | `RubricInput`                                                                                                                                                                                       | `{ … RubricOutput }`                                           | same                                                          | key              | 10/min      |
| `aiTools.differentiation`                                   | `DifferentiationInput`                                                                                                                                                                              | `{ … DifferentiationOutput }`                                  | same                                                          | key              | 10/min      |
| `aiTools.illustration`                                      | `IllustrationInput`                                                                                                                                                                                 | `{ … IllustrationOutput }` (SVG already sanitised)             | same + `SVG_UNSAFE`                                           | key              | 5/min       |
| `aiTools.save`                                              | `{ generationId, target: 'resource'\|'lesson_plan'\|'message_draft'\|'notice', ...targetFields }`                                                                                                   | `{ id, identifier? }`                                          | `NOT_FOUND`, `QUOTA_EXCEEDED`, `FORBIDDEN`                    | key **required** | 30/min      |
| `aiTools.history`                                           | `{ cursor, limit<=50 }`                                                                                                                                                                             | `{ items, nextCursor }`                                        | —                                                             | —                | 60/min      |
| `POST /api/pdf/worksheet` / `/quiz` / `/notice` / `/rubric` | `{ id, includeAnswerKey?, mode }`                                                                                                                                                                   | `{ fileId, url? , printJobId? }`                               | `PDF_FAILED`, `FONT_MISSING`                                  | key              | 20/min      |
| `GET /api/files/[id]` (SVG path)                            | —                                                                                                                                                                                                   | the sanitised SVG with the §4.10 headers                       | `FORBIDDEN`, `NOT_FOUND`                                      | —                | 120/min     |

Every input schema is `.strict()`. None accepts a model id, a prompt version, a credit cost, a system-prompt override, or a free-form `context` object.

## 8. Parts (build chunks)

**Part 1 — Prompt catalogue, schemas, redaction (≤2 days).** _Requires F-TE-03 Parts 1–2._
Scope: `packages/domain/ai/prompts/*` for all ten prompts in §4 (including the three owned by F-TE-01/02), the Zod output schemas with their refinements, `assertNoPII()` with the BD-specific patterns, the surname check, the prompt↔`ai_actions` startup assertion, prompt snapshot tests.
Tests: unit — every schema accepts a good fixture and rejects a realistic bad one (MCQ whose `correct_answer` is not in `options`; rubric whose weights do not sum; pacing plan with an unavailable date); `assertNoPII` catches BD mobile, `+880`, email, NID, DOB, and a pasted roster line, and does **not** false-positive on "Class 10" or a marks list.
**Demo:** a test run showing a pasted roster blocked before any network call, with the ledger untouched.

**Part 2 — Tools hub and two tools: worksheet + quiz (≤2 days).**
Scope: `/app/ai` hub, the tool-panel layout with streaming render, `aiTools.worksheet` and `.quiz` end to end, persistence to `resources` with sequential identifiers, `/api/pdf/worksheet` and `/quiz` with the answer-key toggle, all failure states from §5.6.
Tests: integration for both actions across every error branch; e2e generate→save→open the resource→print at 360×800.
**Demo:** a teacher generates a 10-question worksheet on a phone, saves it as `WS-000001`, and prints it with the answer key on page 2.

**Part 3 — Parent message + notice (≤1 day).**
Scope: `aiTools.parentMessage` with server-side student resolution and guardian addressing, draft creation in messaging; `aiTools.notice` with school context injected server-side, notice draft, print-queue hand-off with audience-derived copies.
Tests: the prompt for a parent message contains the first name and no student id (asserted on the rendered prompt in a unit test); a teacher cannot generate a notice; a draft is never auto-sent.
**Demo:** generate a parent message about a child's improvement, edit one sentence, send; the contact appears in the message thread.

**Part 4 — Rubric + differentiation (≤1 day).**
Scope: both actions, rubric persistence with band validation against `grade_scales`, differentiation write-back into an open lesson plan or a standalone resource.
Tests: a rubric whose weights do not sum triggers the repair retry then succeeds; the `bd_letter` scale uses the school's own bands, not hardcoded ones.
**Demo:** attach a generated rubric to an assignment and print it.

**Part 5 — Illustration with SVG sanitisation (≤2 days).**
Scope: `aiTools.illustration`, the allow-list sanitiser, private storage, the hardened `/api/files/[id]` SVG response, `<img>`-only rendering, PNG rendition, `alt_text` enforcement.
Tests: **security-focused** — a returned SVG containing `<script>`, an `onload` attribute, a `foreignObject`, an external `href`, a `data:` URI and a `<style>` block is stripped of all six and still renders; the response headers are asserted; an unparseable SVG is a schema failure charging nothing; the page CSP blocks inline execution even if the sanitiser were bypassed.
**Demo:** a hostile fixture SVG is neutralised and the rendered page shows no network request and no script execution.

**Part 6 — History, streaming polish, a11y (≤1 day).**
Scope: `/app/ai/history` from `ai_generations` joined to the artefacts, progressive streaming skeletons per tool, `aria-live` announcements, the session-scoped last-result cache, Regenerate with up to 3 retained variants.
Tests: axe clean on hub, each tool panel and history; a Playwright run asserting the first question renders within 2 s of stream start against a mocked stream.
**Demo:** generate a 20-question worksheet and watch questions appear progressively rather than after a 25-second blank spinner.

Order: 1 → 2 → 3 → 4 → 5 → 6. Parts 3, 4 and 5 are independent once Part 2 establishes the panel.

## 9. Acceptance criteria

1. **Given** any tool input containing a Bangladeshi phone number, **when** I press Generate, **then** I get `PII_BLOCKED` with the field highlighted, no request reaches Anthropic, and my balance is unchanged.
2. **Given** I paste a full student name matching a student in my workspace into a free-text field, **when** I press Generate, **then** the request is blocked before the network call.
3. **Given** a parent message for student "Rahim", **when** the prompt is rendered, **then** it contains "Rahim" and "Class 6" and contains no student id, guardian name, phone number or surname.
4. **Given** a successful worksheet generation, **when** I press Save, **then** a `resources` row exists with a sequential identifier of the form `WS-000001`, a PDF in `files`, and `ai_generation_id` set.
5. **Given** a generated quiz whose MCQ `correct_answer` is not among its `options`, **when** validation runs, **then** the repair retry fires; if it fails again, nothing is charged and I see "came back in a form we couldn't read".
6. **Given** a rubric whose criterion weights sum to 45 on a 50-mark task, **when** validation runs, **then** it is rejected by the schema refinement, not accepted and silently wrong.
7. **Given** a pacing plan output containing a date that is a school holiday, **when** post-validation runs, **then** the output is rejected as schema-invalid — the model is never trusted with the calendar.
8. **Given** a notice generation, **when** the prompt is rendered, **then** the school name comes from `school_profiles` and I was never asked to type it.
9. **Given** a teacher role, **when** I open `/app/ai/notice`, **then** the tool is not offered and a direct call returns `FORBIDDEN`.
10. **Given** an illustration whose SVG contains `<script>`, `onload=`, `<foreignObject>`, an external `href` and a `data:` URI, **when** it is sanitised, **then** all five are removed, the file stores only allow-listed elements, and the rendered page executes no script.
11. **Given** a stored SVG, **when** it is served, **then** the response carries `Content-Security-Policy: default-src 'none'`, `X-Content-Type-Options: nosniff`, and it is rendered via `<img>`, never inlined.
12. **Given** an illustration with fewer than 20 characters of alt text, **when** I press Save, **then** saving is refused with an accessibility message.
13. **Given** the AI call fails for any reason on our side, **when** the error renders, **then** it says "No credits were used", my balance is provably unchanged in the ledger, and the Generate button is enabled again.
14. **Given** a failed generation, **when** the error is shown, **then** every field I filled in is still filled in.
15. **Given** I press Generate twice rapidly, **when** both requests carry the same idempotency key, **then** exactly one reservation and one generation exist.
16. **Given** I press Regenerate, **when** the second result arrives, **then** two credits' worth of charges exist (one per press) and both variants are shown side by side.
17. **Given** a 20-question worksheet streaming, **when** 2 seconds have passed, **then** at least the first question is visible.
18. **Given** any tool output, **when** it renders, **then** no `dangerouslySetInnerHTML` is used anywhere in the render path (asserted by a lint rule scoped to `app/(school)/app/ai`).
19. **Given** a client crafting a request with `model: 'claude-opus-5'` or `creditCost: 0`, **when** the server parses it, **then** the extra keys are rejected by `.strict()` and the action runs with the `ai_actions` values.
20. **Given** a prompt module whose `model` disagrees with its `ai_actions.model_id`, **when** the app boots, **then** the startup assertion fails loudly rather than silently using the wrong model.
21. **Given** Bangla is selected and the Bengali font is unavailable to the PDF renderer, **when** I print, **then** I get `FONT_MISSING` rather than a page of tofu.
22. **Given** a generated parent message, **when** it is created, **then** it exists as a `draft` and no message is delivered until I press Send.
23. **Given** my workspace's `ai_enabled` is false, **when** I open `/app/ai`, **then** every tool is disabled with a single explanatory banner.
24. **Given** the history page, **when** I open it, **then** every row's credits and status come from `ai_generations` and link to the saved artefact where one exists.

## 10. Tests

- **Unit (`packages/domain`):** every output schema against good and adversarial fixtures; `assertNoPII` precision and recall over a fixture corpus (must not block "Class 10", "2026-2027", "45 marks"); the SVG sanitiser against an OWASP-style hostile SVG corpus; prompt snapshot tests; prompt↔`ai_actions` consistency.
- **DB (pgTAP):** `ai_generations` isolation; a teacher cannot read another teacher's generations; saved artefacts inherit the correct `workspace_id`.
- **Integration:** each of the seven actions against a mocked Anthropic across success / timeout / refusal / schema-invalid×1-then-ok / schema-invalid×2 / PII-blocked, asserting ledger state and persisted rows each time; `aiTools.save` idempotency.
- **e2e (360×800 + 1280×800, axe):** J1 worksheet generate→save→print; J2 quiz with answer key; J3 parent message draft→edit→send; J4 notice→print queue; J5 rubric attached to an assignment; J6 illustration generate→save→render; J7 every failure banner at 360 px.
- **Security:** the Part 5 SVG corpus as a standing test; a CSP regression test; the `no dangerouslySetInnerHTML` lint rule; an `appsec-review` pass over the file-serving route.
- **a11y:** axe on all seven panels; `aria-live` assertions; alt-text enforcement.
- **Performance budgets:** time-to-first-rendered-item < 2 s from stream start; sanitiser < 50 ms for a 60 KB SVG; PDF render p95 < 3 s for a 20-question worksheet.

## 11. Open questions

1. **The image tool (§4.10).** ⚠ The brief asks for an "image" tool; Claude does not generate raster images and ARCHITECTURE names no other AI vendor. This spec delivers **SVG illustrations via Claude**. If the owner wants photoreal images, that is a new vendor (and a new DECISION-LOG entry, new secret, new data-processing consideration, and a new cost basis). **Default assumed: SVG only.**
2. **`syllabus_extract.v1` on `claude-sonnet-5`** rather than D-08's haiku. Needs a DECISION-LOG entry. Default assumed: sonnet-5.
3. **Bangla output quality** has not been evaluated. An eval set (`shared/evals` workflow) over 30 real BD teacher prompts, scored by a rubric, should run before Bangla is advertised. Default assumed: Bangla available and labelled "beta" in the UI.
4. **Quiz → exam.** Turning a generated quiz into an `exams`/`exam_subjects` row with marks entry is obvious and out of scope for v1.
5. **Essay prompts and flashcards**, two of Base44's eight tools, are **not** in this spec (the brief names seven). Both are cheap to add as `essay_prompts.v1` and `flashcards.v1` once the catalogue exists. Default assumed: dropped from v1, recorded in FUTURE.md.
6. **Sharing a generated artefact at generation time.** Currently you save, then share via F-TE-05. A "save and share to my department" shortcut is a small addition and is deferred.
