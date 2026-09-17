# F-TE-03 — AI credits: ledger, grants, pricing and enforcement

|                  |                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | teaching (cost control for the whole product)                                                                                                   |
| Status           | planned                                                                                                                                         |
| Owner branch     | `feat/teaching-ai-credits`                                                                                                                      |
| Depends on       | F-AU-02 (workspaces, memberships) · F-BI-01 (plans, subscriptions) · F-BI-02 (SSLCommerz checkout — for top-up packs) · F-OP-07 (notifications) |
| Depended on by   | **every AI call in the product**: F-TE-01, F-TE-02, F-TE-04, and the report-card comment generator in F-OP-06                                   |
| Plan             | `docs/plan/ROADMAP.md` chunk — teaching, position 2                                                                                             |
| Base44 reference | `docs/reference/base44-inventory/03-teaching-intelligence.md` §2.9–2.13, §3.2, §3.3, §4 row 18, §7 items 17–18, §8 Q5–Q6                        |

## 1. Purpose

Every AI call in Acadigma Campus costs the business money. This feature is the single gate that decides whether a call happens, records what it cost, and shows a school what it has spent. It is not a feature teachers ask for — it is the reason the product can have AI at all.

A workspace has a **monthly credit allowance** from its plan, **pooled** across the workspace (not a per-day drip). Credits are spent by named actions at fixed prices. A teacher sees their balance before they press Generate. At zero, generation is **hard-blocked** with a one-tap "Request credits" to the owner. Owners can grant extra credits, switch between a shared pool and per-teacher allocations, buy top-up packs with bKash/card through SSLCommerz, and see exactly where the month went.

**Superseded by the research-debate synthesis (D-39, M0-0.5): allowances moved from daily to monthly, pooled.** Trial is **100 actions, lifetime** (not renewing); Starter **200 credits/month**; Pro **600 credits/month, pooled**; Enterprise **contractual**. A top-up pack is **৳1,200 / 500 credits**, and total monthly spend (allowance + top-ups) is capped at a **hard ceiling of 3× the monthly allowance** (§5.1).

**What Base44 intended, and what was broken.** The prototype shipped five entities for this — `DailyAILimit`, `AIBillingModel`, `CreditAllocation`, `CreditRequest`, `AIUsageLog` — a full admin approval UI, a permissions entry, and **zero enforcement**. Verified by exhaustive grep: `AIUsageLog.create` appeared 0 times; `DailyAILimit` and `AIBillingModel` were referenced by 0 files; `CreditAllocation` was never created, only listed and updated; `CreditRequest` was never created because the teacher-facing form did not exist. No Generate button in the app was ever disabled for lack of credits — only while in flight. A teacher could call the LLM an unlimited number of times, at unlimited cost, and nothing was recorded. The admin panel that governed all this showed `—` for every teacher (because no allocation row could exist) and its three charts were literally `Math.random()` with the comment `// Mock chart data`. Every prompt lived in the browser, so any quota check placed there would have been trivially bypassed.

**Done looks like:** no code path anywhere in the repo can call Anthropic except through `adapters/ai/invoke()`, which cannot run without a settled reservation; a CI rule enforces it; and the ledger balances to the paisa.

## 2. Roles and permissions

| Action                                       | permission key              | owner | admin | teacher | staff | parent | platform           |
| -------------------------------------------- | --------------------------- | ----- | ----- | ------- | ----- | ------ | ------------------ |
| See my own balance                           | `ai_credits.read.own`       | ✓     | ✓     | ✓       | ✓     | —      | —                  |
| See the workspace balance & ledger           | `ai_credits.read.workspace` | ✓     | ✓     | —       | —     | —      | read bypass        |
| Spend credits (implicit in every AI action)  | `ai.generate`               | ✓     | ✓     | ✓       | —     | —      | —                  |
| Request credits                              | `ai_credits.request`        | ✓     | ✓     | ✓       | —     | —      | —                  |
| Approve/reject a request                     | `ai_credits.request.review` | ✓     | ✓     | —       | —     | —      | —                  |
| Grant extra credits directly                 | `ai_credits.grant`          | ✓     | ✓     | —       | —     | —      | —                  |
| Change the billing model (pool ↔ individual) | `ai_credits.billing_model`  | ✓     | —     | —       | —     | —      | —                  |
| Set per-teacher monthly caps                 | `ai_credits.allocate`       | ✓     | ✓     | —       | —     | —      | —                  |
| Buy a top-up pack                            | `ai_credits.topup`          | ✓     | —     | —       | —     | —      | —                  |
| View AI usage analytics                      | `ai_credits.analytics`      | ✓     | ✓     | —       | —     | —      | ✓ (all workspaces) |
| Edit the `ai_actions` price list             | `platform.ai_pricing`       | —     | —     | —       | —     | —      | ✓ only             |

**Deliberate change from the prototype.** Base44 made the billing model support-only (`ai_billing_model_change: []`, an empty allow-list). PRODUCT-DECISIONS 5.3 overrules that: **the owner can change it themselves**. Owners should not need to open a support ticket for a toggle. The change is audited and takes effect at the next monthly reset, not mid-month (§5.9).

## 3. Data

**Proposed; `docs/architecture/DATA-MODEL.md` wins.**

### 3.1 `ai_actions` — the price list (global, platform-owned)

Not tenant-scoped. One row per named AI action in the product.

| column                                   | type                                           | notes                                                                                |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `key`                                    | text pk                                        | e.g. `lesson_plan.generate`                                                          |
| `label`                                  | text not null                                  | "Generate a lesson plan"                                                             |
| `category`                               | `ai_action_category` enum                      | `planning \| curriculum \| assessment \| communication \| media`                     |
| `credit_cost`                            | integer not null check > 0                     | the price                                                                            |
| `model_id`                               | text not null                                  | e.g. `claude-sonnet-5` — the model is a property of the action, never of the request |
| `prompt_version`                         | text not null                                  | e.g. `lesson_plan.v1`                                                                |
| `max_output_tokens`                      | integer not null                               | hard ceiling, also a cost ceiling                                                    |
| `timeout_ms`                             | integer not null                               |                                                                                      |
| `est_input_tokens` / `est_output_tokens` | integer                                        | for the cost-basis report (§5.12)                                                    |
| `language_risk`                          | `ai_language_risk` not null default `standard` | `standard \| bangla_or_parent_facing` — drives model routing, §5.12; **not** a gate  |
| `enabled`                                | boolean not null default true                  | a kill switch per action, per platform                                               |
| `updated_at`, `updated_by`               |                                                |                                                                                      |

RLS: SELECT to every authenticated user (the client needs prices to render). INSERT/UPDATE/DELETE only `app.is_platform_admin()`. **The client never sends a price, a model id, or a prompt version** — it sends an action key, and the server reads this row. **No plan-tier gating exists on this table or anywhere in this feature** (research-debate synthesis, D-26(4)/A-04, M0-0.5): the prototype-era `min_plan_tier` column that restricted the Free tier to haiku-backed actions is deleted outright, not deprecated. Every plan, including Free/Trial, can call every enabled action; what varies by plan is the monthly credit allowance (§5.1), not which actions are reachable. The replacement control is **model routing by language risk** (§5.12): `language_risk='bangla_or_parent_facing'` actions always call the strongest available model, on every plan, regardless of tier.

### 3.2 `ai_credit_ledger` — append-only, the source of truth

| column             | type                                 | notes                                                                                                                                                                 |
| ------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | uuid pk                              |                                                                                                                                                                       |
| `workspace_id`     | uuid not null                        | tenant key                                                                                                                                                            |
| `user_id`          | uuid null                            | the spender; null for workspace-level entries (grants, resets, purchases)                                                                                             |
| `entry_type`       | `ai_ledger_entry_type` enum not null | `monthly_grant \| plan_change_grant \| trial_grant \| topup_purchase \| admin_grant \| reservation \| settlement \| release \| expiry \| adjustment \| refund`        |
| `credits`          | integer not null                     | **signed**: positive adds spendable credits, negative removes. A `reservation` is negative, a `release` is positive, a `settlement` is the net correction (usually 0) |
| `balance_after`    | integer not null                     | materialised running balance for the bucket, written inside the same transaction under a row lock                                                                     |
| `bucket`           | `ai_credit_bucket` enum not null     | `pool` or `individual` — which balance this entry moves                                                                                                               |
| `action_key`       | text null → `ai_actions`             | on reservation/settlement/release                                                                                                                                     |
| `ai_generation_id` | uuid null → `ai_generations`         |                                                                                                                                                                       |
| `reservation_id`   | uuid null                            | self-reference: settlement/release point at their reservation                                                                                                         |
| `expires_on`       | date null                            | on `monthly_grant` — the date after which unused credits expire (month-end, not day-end)                                                                              |
| `reason`           | text null                            | required for `admin_grant` and `adjustment`                                                                                                                           |
| `idempotency_key`  | text null                            | unique per workspace                                                                                                                                                  |
| `correlation_id`   | uuid                                 | request tracing                                                                                                                                                       |
| `created_by`       | uuid null                            |                                                                                                                                                                       |
| `created_at`       | timestamptz not null default now()   |                                                                                                                                                                       |

Constraints: **no UPDATE and no DELETE grants for any role**, including service role (enforced by revoking the privileges, like `audit_events`). Unique `(workspace_id, idempotency_key)` where not null. Index `(workspace_id, user_id, created_at desc)`, `(workspace_id, entry_type, created_at desc)`, partial index on open reservations.

### 3.3 `ai_credit_balances` — the fast read, rebuilt from the ledger

A table, not a view, because the balance is read on every page render and locked on every spend.

`workspace_id`, `user_id` (null row = the shared pool), `bucket`, `granted_this_month` integer, `reserved` integer, `spent_this_month` integer, `carryover` integer (top-ups and admin grants that do **not** expire monthly), `balance` integer generated as `granted_this_month + carryover - reserved - spent_this_month`, `as_of_month` date (first of the month), `updated_at`. Primary key `(workspace_id, coalesce(user_id, '00000000-…'))`.

Invariant, asserted by a nightly reconciliation job and by a pgTAP test: `ai_credit_balances.balance` equals the ledger's `balance_after` on the latest entry for that bucket. If they diverge, the job writes an `adjustment` entry with a reason and alerts platform staff — it never silently rewrites the ledger.

### 3.4 `ai_credit_requests`

`id`, `workspace_id`, `requested_by`, `credits_requested` integer check between 1 and 500, `reason` text not null (min 10 chars — "more pls" is not a business case), `status` enum `credit_request_status` (`pending | approved | rejected | cancelled | expired`), `reviewed_by`, `reviewed_at`, `review_note`, `granted_credits` integer null (an approver may grant fewer than requested), `expires_at` (48 h → `expired` by job), timestamps. Index `(workspace_id, status, created_at desc)`. One `pending` request per user at a time (partial unique index).

### 3.5 `ai_credit_topups`

`id`, `workspace_id`, `pack_id` → `ai_credit_packs`, `credits` integer, `amount_paisa` bigint, `currency` char(3) default 'BDT', `order_id` → `orders`, `status` enum (`pending | paid | failed | refunded`), `granted_ledger_id` uuid null, `created_by`, timestamps. Credits are granted **only** from a validated SSLCommerz IPN (ARCHITECTURE §5: entitlements are granted only from a processed, validated event), never from the browser returning to a success URL.

### 3.6 `ai_credit_packs` (platform-owned)

`id`, `name`, `credits`, `price_paisa`, `currency`, `active`, `sort_order`. Placeholder v1 row per PRODUCT-DECISIONS 3.3: **500 credits for ৳499**. Platform-editable from `/platform`.

### 3.7 `ai_generations` — one row per model call (shared with F-TE-04)

`id`, `workspace_id`, `user_id`, `action_key`, `prompt_version`, `model_id`, `status` enum `ai_generation_status` (`reserved | succeeded | failed | refused | timeout | schema_invalid | cancelled`), `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost_usd_micros` bigint (computed server-side from the model's published rates), `latency_ms`, `attempts` smallint, `credits_charged` integer, `reservation_ledger_id`, `error_code` text null, `stop_reason` text null, `refusal_category` text null, `input_digest` text (sha256 of the redacted input — for dedupe and support, **not** the input itself), `raw_output` jsonb null (**kept only on failure**, purged after 30 days), `correlation_id`, `created_at`, `completed_at`.

**`ai_generations` never stores the rendered prompt or the model's successful output.** The output lives in the feature's own table (a lesson plan, a resource, a message draft). Storing prompts would mean storing whatever a teacher typed into "notes", which can contain student information.

### 3.8 Workspace settings (columns on `school_profiles` / `workspaces`)

`ai_billing_model` enum `ai_billing_model` (`shared_pool | individual_allocation`) default `shared_pool`; `ai_monthly_credits_override` integer null (platform-set, overrides the plan); `ai_enabled` boolean default true (an owner can switch AI off entirely for their school).

### 3.9 `ai_teacher_allocations`

Used only when `ai_billing_model = 'individual_allocation'`. `workspace_id`, `user_id`, `monthly_credits` integer not null, `updated_by`, `updated_at`. Primary key `(workspace_id, user_id)`. Members without a row get `plans.default_teacher_monthly_credits` (proposed column).

### 3.10 RLS in words

- `ai_credit_ledger`: SELECT for owner/admin on the whole workspace; a teacher sees only rows where `user_id = app.current_user_id()` or `bucket='pool'` entries of type `monthly_grant`/`admin_grant` (so they can see what the school got). **No INSERT/UPDATE/DELETE policy for anyone** — every write goes through `SECURITY DEFINER` functions called by the server (`app.ai_reserve`, `app.ai_settle`, `app.ai_release`, `app.ai_grant`), which is what makes "append-only" true rather than aspirational.
- `ai_credit_balances`: SELECT as above; no client write.
- `ai_credit_requests`: teacher SELECT/INSERT own; owner/admin SELECT/UPDATE all in the workspace; nobody may UPDATE `requested_by`, `workspace_id` or `credits_requested` after insert.
- `ai_generations`: teacher SELECT own; owner/admin SELECT all; platform read bypass. No client write.
- `ai_actions`, `ai_credit_packs`: read to all, write to platform only.

## 4. Workflows

### 4.1 The reserve → call → settle flow (the core)

Every AI action in the product, without exception, runs this sequence inside `adapters/ai/invoke()`:

```
1. resolve   ctx        -> WorkspaceContext (workspaceId, userId, role, plan)
2. load      action     -> ai_actions[key]; 404 if missing, 403 if !enabled (no plan-tier check — deleted, §5.12)
2b. route    model      -> language-risk override (§5.12): if action.language_risk='bangla_or_parent_facing',
                           force the strongest current model regardless of workspace plan
3. guard     ai_enabled -> 403 AI_DISABLED if the owner switched AI off
4. rate      limit      -> per-user and per-workspace token bucket; 429 RATE_LIMITED
5. reserve              -> app.ai_reserve(workspace, user, key, idempotency_key)
                           * SELECT ... FOR UPDATE on the balance row (pool or individual)
                           * if balance < credit_cost -> raise INSUFFICIENT_CREDITS (nothing written)
                           * else insert ledger entry (reservation, -cost) + bump balances.reserved
                           * insert ai_generations (status='reserved')
                           * returns { reservationId, generationId }
6. redact               -> assertNoPII(input) (F-TE-04 §3); throws PII_BLOCKED before any network call
7. invoke               -> Anthropic call, streaming, structured output, timeout from ai_actions
8a. success             -> app.ai_settle(reservationId, usage) : settlement entry, reserved -> spent_today,
                           ai_generations updated with tokens/cost/latency/status='succeeded'
8b. failure             -> app.ai_release(reservationId, errorCode) : release entry (+cost),
                           reserved decremented, ai_generations status set, NOTHING charged
9. return               -> { output, generationId, creditsCharged }
```

Steps 5, 8a and 8b are single `SECURITY DEFINER` functions, each one transaction. A crash between 5 and 8 leaves an open reservation, which the **reaper job** (every 5 minutes) releases after `timeout_ms + 60 s`, writing a `release` entry with `error_code='ORPHANED_RESERVATION'`. This is why reservations exist at all: without them, two simultaneous generations by the same teacher at 3 credits with 4 remaining would both pass a naive balance check.

**Settlement is not "debit the actual cost".** Credits are a fixed retail price per action, not a token pass-through — so the settlement entry is normally `0` credits and exists to close the reservation and record real usage. The only case where settlement moves credits is a **partial refund**: if the model returned `stop_reason='max_tokens'` and the feature declares the result unusable, the action refunds in full (release path). Recording real tokens on `ai_generations` is what lets the owner reprice later with data rather than guesses.

### 4.2 Monthly reset (superseded from a daily reset — D-39, M0-0.5)

A `pg_cron` job at **00:00 Asia/Dhaka on the 1st of each month** (and the job reads the workspace's own timezone, so a future non-Dhaka school resets on its own month boundary):

1. For every active workspace with `ai_enabled`, compute this month's allowance: `ai_monthly_credits_override ?? plans.ai_monthly_credits` (Starter 200, Pro 600, Enterprise contractual — §5.1). Trial workspaces do **not** run through this monthly grant at all: the trial's 100-action allowance is a **lifetime** cap granted once, not renewed each month (§5.1).
2. Write an `expiry` entry for last month's unused `granted_this_month` (monthly credits **do not** carry over — this keeps the plan's monthly number meaningful, the same rationale Base44's daily design had, now at month granularity).
3. Write a `monthly_grant` entry with `expires_on = end of this month` and reset `granted_this_month`, `spent_this_month = 0`, `reserved = 0` (any reservation still open at the boundary is first released by the reaper).
4. `carryover` (top-ups, admin grants) is untouched — **purchased credits never expire**, but total spend in any month is still bounded by the **hard ceiling of 3× the monthly allowance** (§5.1), which the reserve function enforces against `granted_this_month + carryover` for that month regardless of how large `carryover` has grown.
5. In `individual_allocation` mode, step 1–3 run per member with an `ai_teacher_allocations` row or the plan default; in `shared_pool` mode they run once for the workspace with `user_id = null`.

Failure of the cron job is an alert, not a silent zero: if no `monthly_grant` exists for this month by 00:30 on the 1st, the `ai_reserve` function falls back to computing the allowance inline and writes the grant itself (idempotent on `(workspace_id, user_id, 'monthly_grant', month)`), so a cron outage cannot block a whole country's teachers.

### 4.3 Hitting zero

1. The client renders every Generate button with a `CreditBadge` showing `cost / balance`. Below cost, the button is `disabled` with helper text "Not enough credits".
2. Pressing the adjacent "Request credits" opens a sheet: amount (stepper, default = the shortfall rounded up to 10) and reason (required).
3. `aiCredits.request` inserts `ai_credit_requests` → notification `ai_credits.requested` to every owner and admin with `action_url=/app/settings/ai`.
4. Owner opens it, sees who, how much, why, and that member's last-7-day usage, then Approve (optionally with a different amount) / Reject with a note.
5. Approve → `app.ai_grant` writes an `admin_grant` entry into `carryover` for that bucket → notification `ai_credits.granted` to the requester → the Generate button re-enables on their next poll/refresh.
6. **Hard block, always.** There is no soft warning, no overdraft, no "we'll bill you later". PRODUCT-DECISIONS 5.4: no metered overage invoices.
7. Failure cases: a second `pending` request returns `REQUEST_PENDING`; requests auto-expire after 48 h.

### 4.4 Top-up purchase

1. Owner opens `/app/settings/ai` → "Buy credits" → pack list from `ai_credit_packs`.
2. `aiCredits.startTopup` creates an `orders` row and an `ai_credit_topups` row (`pending`), returns the SSLCommerz hosted-checkout URL (F-BI-02).
3. Buyer pays. The **IPN Edge Function** validates the transaction against SSLCommerz's validation API, writes `inbound_events`, then — idempotently on the provider event id — marks the topup `paid` and calls `app.ai_grant(..., entry_type='topup_purchase', bucket=pool, credits=pack.credits)` into `carryover`.
4. Notification `ai_credits.topup_completed`; receipt PDF via F-BI-04.
5. **The browser return URL grants nothing.** A user who closes the tab still gets their credits; a user who forges a success URL gets nothing.
6. Refund (platform staff, F-BI §4.8) writes a negative `refund` entry; if the balance would go negative, it goes negative and the next monthly grant absorbs it — the ledger never lies to make a screen look tidy.

### 4.5 Switching billing model

Owner toggles in `/app/settings/ai`. A confirm dialog explains the effect in plain words ("Every teacher gets their own 50 credits a month instead of sharing one pool of 600"). The change writes `workspaces.ai_billing_model` + an audit event and is **effective at the next monthly reset**; this month's balances are untouched. Switching to `individual_allocation` opens the allocation table pre-filled with the plan default so the owner can adjust before it takes effect.

### 4.6 Usage analytics

`/app/settings/ai` → Usage tab. Real numbers only, from `ai_generations` and `ai_credit_ledger` (§5.11): credits used this month, by teacher, by action, by day; the workspace's 30-day trend; average latency; failure rate by error code; and — the number the owner cares about — "credits left this month". Every chart reads a SQL view defined in F-TE-07 §4.5. Platform staff get the same across all workspaces plus `cost_usd_micros`, which schools never see.

### 4.7 Phone flow

- The `CreditBadge` is a compact pill (e.g. `5 ▸ 37`) sitting immediately left of every Generate button, so cost and balance are read in the same glance as the action.
- `/app/settings/ai` on phone is a **stack**: balance card (big number), then Model toggle, then Requests (with a badge count), then Allocations, then Buy credits, then Usage. No tabs — tabs at 360 px hide the thing the owner came for.
- The request sheet is short: stepper, reason, Send. Approve/Reject on the owner's side are two large buttons in a sheet opened from the request card, both in the thumb arc.
- The usage charts are **bar lists with inline values**, not hover charts.

## 5. Business rules and calculations

**5.1 Plan allowances — monthly, pooled** (supersedes the earlier daily placeholders; research-debate synthesis D-39, M0-0.5): **Trial 100 actions, lifetime** (not renewing, not time-sliced by the 14-day trial window — it is a hard lifetime cap independent of how many days the trial has run) · **Starter 200 credits/month** · **Pro 600 credits/month, pooled** · **Enterprise contractual**. **Top-up pack: ৳1,200 / 500 credits.** A **hard ceiling of 3× the monthly allowance** applies to total spend in any calendar month — base allowance plus any top-ups combined — enforced by `app.ai_reserve`, which is what stops an unbounded top-up spiral from turning into unbounded model spend. Stored on `plans.ai_monthly_credits`, editable from `/platform`. (D-39 does not restate a Free-plan number here — see PRODUCT-DECISIONS and OQ-22 for the separate Free-plan-retirement question, which this feature does not decide.)

**5.2 Price list** (PRODUCT-DECISIONS 3.3 placeholders, plus the actions this area adds):

| `ai_actions.key`           | credits | model              | spec                                                            |
| -------------------------- | ------- | ------------------ | --------------------------------------------------------------- |
| `lesson_plan.generate`     | 5       | `claude-sonnet-5`  | F-TE-01                                                         |
| `syllabus.extract`         | 10      | `claude-sonnet-5`  | F-TE-02                                                         |
| `pacing.generate`          | 8       | `claude-sonnet-5`  | F-TE-02                                                         |
| `worksheet.generate`       | 3       | `claude-sonnet-5`  | F-TE-04                                                         |
| `quiz.generate`            | 3       | `claude-sonnet-5`  | F-TE-04                                                         |
| `rubric.generate`          | 2       | `claude-sonnet-5`  | F-TE-04                                                         |
| `differentiation.generate` | 2       | `claude-sonnet-5`  | F-TE-04                                                         |
| `parent_message.generate`  | 1       | `claude-haiku-4-5` | F-TE-04                                                         |
| `notice.generate`          | 1       | `claude-haiku-4-5` | F-TE-04                                                         |
| `illustration.generate`    | 4       | `claude-sonnet-5`  | F-TE-04 (see the image conflict in §11)                         |
| `report_comment.generate`  | 1       | `claude-haiku-4-5` | F-OP-06 — listed here because it must route through this ledger |

**5.3 Balance resolution.** `shared_pool` → one balance row per workspace (`user_id is null`), every member draws from it. `individual_allocation` → one balance row per member; a member with no allocation row gets `plans.default_teacher_monthly_credits`. Owners and admins draw from their own allocation in individual mode, from the pool in pool mode. `carryover` (top-ups, grants) always lands in the **pool** bucket and is spendable by anyone in pool mode; in individual mode an admin grant may target a specific member's carryover.

**5.4 Nothing is charged for our failures.** A reservation is released in full — no partial charge — for: timeout, connection error, HTTP 5xx, `stop_reason='refusal'`, schema validation failure after the configured retries, `PII_BLOCKED`, and orphan reaping. A charge stands for: a successful generation the user dislikes, a successful generation the user then discards, and a regeneration.

**5.5 Retries.** One automatic retry on `AI_SCHEMA_INVALID` (with a repair instruction appended) and up to two on connection/5xx errors with exponential backoff (500 ms, 1500 ms, full jitter). Retries reuse **the same reservation** — a user is never charged twice for one press. `ai_generations.attempts` records how many. No retry on refusal, on `PII_BLOCKED`, or on timeout (the user pressing Retry is a new reservation).

**5.6 Timeouts** come from `ai_actions.timeout_ms`: 60 s for generation actions, 180 s for `syllabus.extract` (which runs as a background job so the request budget is not the limit), 30 s for the haiku-backed short actions. Every call streams (ARCHITECTURE and the SDK guidance) so a long generation cannot die on an HTTP idle timeout.

**5.7 Rate limits**, independent of credits, to bound abuse and blast radius: **10 generations/minute and 200/day per user**; **60/minute and 2,000/day per workspace**; `syllabus.extract` 5/hour/user and 30/day/workspace. Implemented as a Postgres token bucket keyed on `(workspace_id, user_id, window)`, checked before the reservation. Exceeding returns `RATE_LIMITED` with a `retry_after` seconds field; nothing is reserved.

**5.8 Concurrency.** `app.ai_reserve` takes `SELECT … FOR UPDATE` on the single balance row. Two simultaneous 3-credit reservations against a balance of 4 serialise: the first succeeds, the second raises `INSUFFICIENT_CREDITS`. There is no "check then write" window. This is the specific failure the prototype could not even have, because it never checked at all.

**5.9 Billing-model changes take effect at the next reset** (§4.5), so a mid-month switch cannot double-grant. Enforced by making the reset job the only writer of `monthly_grant`.

**5.10 Expiry.** Monthly grants expire at the next reset (`expiry` entry) — unused credits do not carry into the following month. `carryover` (top-ups, admin grants) never expires on its own, but is still bounded within any given month by the 3× hard ceiling (§5.1). Expiry is recorded, not silent — the usage view can show "you let 180 credits expire unused this month", which is the strongest possible argument for a school to downgrade honestly or use the product more.

**5.11 Analytics definitions** (each a SQL view, exact text in F-TE-07 §4.5): `analytics_ai_usage_daily`, `analytics_ai_usage_by_teacher`, `analytics_ai_usage_by_action`, `analytics_ai_failures`, `analytics_ai_balance_now`. No client-side aggregation of raw ledger rows.

**5.12 Cost basis** (for repricing, not shown to schools). `cost_usd_micros` per generation = `input_tokens × in_rate + output_tokens × out_rate + cache_read_tokens × cache_read_rate`, rates from a `model_rates` table seeded from the published Claude API pricing: `claude-sonnet-5` $2.00/MTok in, $10.00/MTok out; `claude-haiku-4-5` $1.00 / $5.00; `claude-opus-5` $5.00 / $25.00. At ৳120/USD and a retail value of ৳1.00/credit (the ৳499/500 top-up pack), the expected cost per action is:

| action                     | model     | est. in / out tokens | est. cost | ≈ BDT      | credits | margin         |
| -------------------------- | --------- | -------------------- | --------- | ---------- | ------- | -------------- |
| `lesson_plan.generate`     | sonnet-5  | 1,800 / 3,000        | $0.034    | ৳4.03      | 5       | **+৳0.97**     |
| `pacing.generate`          | sonnet-5  | 3,500 / 4,000        | $0.047    | ৳5.64      | 8       | **+৳2.36**     |
| `worksheet.generate`       | sonnet-5  | 1,200 / 2,500        | $0.027    | ৳3.29      | 3       | **−৳0.29** ⚠   |
| `quiz.generate`            | sonnet-5  | 1,200 / 2,200        | $0.024    | ৳2.93      | 3       | +৳0.07 ⚠       |
| `rubric.generate`          | sonnet-5  | 900 / 1,500          | $0.017    | ৳2.02      | 2       | −৳0.02 ⚠       |
| `differentiation.generate` | sonnet-5  | 1,200 / 1,400        | $0.016    | ৳1.97      | 2       | +৳0.03 ⚠       |
| `illustration.generate`    | sonnet-5  | 400 / 3,500          | $0.036    | ৳4.30      | 4       | −৳0.30 ⚠       |
| `parent_message.generate`  | haiku-4-5 | 700 / 500            | $0.0032   | ৳0.38      | 1       | +৳0.62         |
| `notice.generate`          | haiku-4-5 | 600 / 700            | $0.0041   | ৳0.49      | 1       | +৳0.51         |
| `syllabus.extract` (40 pp) | sonnet-5  | ~70,000 / 4,000      | $0.180    | **৳21.60** | 10      | **−৳11.60** ⚠⚠ |

Findings for the owner, carried to the README's conflicts list:

- **`syllabus.extract` at 10 credits loses money on any document over ~18 pages.** Recommendation: price it **10 credits + 1 credit per 2 pages beyond 10**, computed from the real page count at upload (known before the reservation), capped at 40 credits. The `ai_actions` table gains a nullable `credit_cost_formula` column for this one case.
- **The 3-credit and 2-credit actions sit on or below cost.** Recommendation: worksheet 4, quiz 4, rubric 3, differentiation 3, illustration 5.
- **Plan-tier action gating is deleted (research-debate synthesis, D-26(4)/A-04, M0-0.5).** The earlier recommendation to restrict the Free plan's `ai_actions` to the haiku-backed set via `min_plan_tier` is **superseded, not adopted** — `min_plan_tier` no longer exists (§3.1). The replacement mechanism is **routing by language risk**: any action whose output is Bangla or parent-facing (`parent_message.generate`, `notice.generate`, `report_comment.generate` today; anything a guardian reads tomorrow) always calls the strongest available model, **on every plan including Free/Trial**, because a mistranslated or badly-toned message to a Bangladeshi parent is a worse outcome than the marginal cost difference between models. Free-plan cost exposure is instead bounded by the **monthly, pooled allowance** (§5.1) — a hard ceiling in credits, not a menu of which actions a cheaper plan may reach.
- **Stated assumption — AI COGS budget.** Cost planning assumes **৳1.45/action** today, **budgeted at cost + 30%** for the next tokenizer/model generation (rates go stale as Anthropic revises pricing and tokenization), **with a 1.1× contingency multiplier on top of that if data-residency requirements ever force regional inference pinning** (a dedicated region typically carries a premium over the default routing this feature assumes). This assumption feeds the price list (§5.2) and the plan-allowance sizing (§5.1) and should be revisited whenever `model_rates` is next refreshed (§11 item 7).

**The placeholder prices in PRODUCT-DECISIONS 3.3 remain canonical until the owner decides** on the repricing recommendations above (the plan-tier-gating deletion is decided, not a recommendation). The `ai_actions` table makes any repricing a one-row edit from `/platform`.

**5.13 Prompt caching.** Every prompt's system block and the stable school-context block carry `cache_control: {type:'ephemeral'}`, so repeat generations within the cache window read those tokens at the cached rate instead of full price. The volatile per-request fields go after the last breakpoint. `ai_generations.cache_read_tokens` records the effect; if it is persistently zero, something in the "stable" prefix is not stable and the nightly report flags it. This does not change credit prices — it changes our cost.

**5.14 One entry point, enforced by CI.** `packages/adapters/ai` is the only module allowed to import `@anthropic-ai/sdk`. An ESLint `no-restricted-imports` rule plus a CI grep fails the build if any other file imports it, and a second check fails if `invoke()` is called without a reservation id in scope. This is the mechanical answer to the prototype's failure mode, which was entirely a discipline failure.

## 6. UI

| Screen          | Route                          | 360×800                                                                                        | ≥1024                          | Primary      | Empty                                            | Loading                                      | Error                                                                                                                     |
| --------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------ | ------------ | ------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Credit badge    | inline, everywhere             | Pill `cost ▸ balance`, tappable → balance sheet                                                | Same + tooltip breakdown       | —            | "—" while unknown, never "0"                     | Skeleton pill (never renders a wrong number) | Pill shows "?" and the Generate button stays enabled — a balance-read failure must not block work; the server is the gate |
| AI settings     | `/app/settings/ai`             | Vertical stack: Balance card · Billing model · Requests(n) · Allocations · Buy credits · Usage | Two-column with a left sub-nav | Buy credits  | n/a                                              | Skeleton cards                               | Inline `Alert`                                                                                                            |
| Request credits | sheet                          | Stepper + reason + Send                                                                        | Dialog                         | Send request | n/a                                              | Button spinner                               | Inline; `REQUEST_PENDING` shows the existing request                                                                      |
| Requests inbox  | `/app/settings/ai#requests`    | Card per request: who, how much, why, their 7-day usage, Approve/Reject                        | Table + drawer                 | Approve      | "No pending requests."                           | Skeletons                                    | Inline                                                                                                                    |
| Allocations     | `/app/settings/ai#allocations` | Member rows with an inline stepper, "Apply to all" at top                                      | Table with bulk edit           | Save         | "Switch to per-teacher allocations to set caps." | Skeletons                                    | Inline                                                                                                                    |
| Buy credits     | `/app/settings/ai#topup`       | Pack cards, price in ৳, Buy → SSLCommerz                                                       | Same                           | Buy          | "No packs available."                            | Skeletons                                    | `Alert` + Retry                                                                                                           |
| Usage           | `/app/settings/ai#usage`       | Stat tiles, then bar lists (by teacher, by action, by day)                                     | Charts + table + CSV           | Export CSV   | "No AI usage yet this month."                    | Skeletons                                    | Inline                                                                                                                    |
| Ledger          | `/app/settings/ai/ledger`      | Grouped-by-day entry list with signed amounts and running balance                              | Table + filters                | Export CSV   | "No entries yet."                                | Skeletons                                    | Inline                                                                                                                    |

Components: `CreditBadge`, `StatTile`, `BarList`, `Stepper`, `SegmentedControl`, `DataList`, `DataTable`, `AlertDialog`, `EmptyState`, `Skeleton`. Money always via the shared `formatBdt(paisa)` helper; credits are integers and never formatted with decimals.

## 7. Server contracts

| Name                                                               | Input                                                                           | Output                                                                                 | Errors                                                                                                      | Idempotency                | Rate limit   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- | ------------ |
| `aiCredits.balance`                                                | `{}`                                                                            | `{ bucket, balance, grantedThisMonth, spentThisMonth, carryover, reserved, resetsAt }` | —                                                                                                           | —                          | 240/min      |
| `aiCredits.prices`                                                 | `{}`                                                                            | `AiAction[]` (key, label, cost, category, enabled-for-my-plan)                         | —                                                                                                           | —                          | cached 5 min |
| `aiCredits.ledger`                                                 | `{ from?, to?, userId?, entryType?, cursor, limit<=100 }`                       | `{ items, nextCursor }`                                                                | `FORBIDDEN`                                                                                                 | —                          | 60/min       |
| `aiCredits.request`                                                | `{ credits: 1..500, reason: string(10..500) }`                                  | `CreditRequest`                                                                        | `REQUEST_PENDING`, `VALIDATION`, `FORBIDDEN`                                                                | key                        | 5/hour/user  |
| `aiCredits.reviewRequest`                                          | `{ id, decision: 'approve'\|'reject', grantedCredits?, note? }`                 | `CreditRequest`                                                                        | `NOT_FOUND`, `ALREADY_REVIEWED`, `FORBIDDEN`                                                                | key **required**           | 60/min       |
| `aiCredits.grant`                                                  | `{ userId?, credits: 1..5000, reason: string(10..500) }`                        | `{ ledgerId, balance }`                                                                | `FORBIDDEN`, `VALIDATION`                                                                                   | key **required**           | 30/hour      |
| `aiCredits.setBillingModel`                                        | `{ model: 'shared_pool'\|'individual_allocation' }`                             | `{ effectiveFrom }`                                                                    | `FORBIDDEN` (owner only)                                                                                    | key                        | 10/day       |
| `aiCredits.setAllocations`                                         | `{ rows: [{ userId, monthlyCredits: 0..5000 }] }`                               | `{ updated: n }`                                                                       | `FORBIDDEN`, `MEMBER_NOT_ACTIVE`                                                                            | key                        | 60/min       |
| `aiCredits.setEnabled`                                             | `{ enabled: boolean }`                                                          | `{ ok }`                                                                               | `FORBIDDEN` (owner only)                                                                                    | key                        | 10/day       |
| `aiCredits.packs`                                                  | `{}`                                                                            | `AiCreditPack[]`                                                                       | —                                                                                                           | —                          | cached       |
| `aiCredits.startTopup`                                             | `{ packId }`                                                                    | `{ orderId, checkoutUrl }`                                                             | `FORBIDDEN`, `PROVIDER_ERROR`                                                                               | key **required**           | 10/hour      |
| `aiCredits.usage`                                                  | `{ range: 'today'\|'7d'\|'30d'\|'month', groupBy: 'teacher'\|'action'\|'day' }` | rows from the analytics views                                                          | `FORBIDDEN`                                                                                                 | —                          | 60/min       |
| **internal** `app.ai_reserve(workspace, user, actionKey, idemKey)` | SQL `SECURITY DEFINER`                                                          | `(reservation_id, generation_id, credit_cost)`                                         | raises `INSUFFICIENT_CREDITS`, `ACTION_DISABLED` (`PLAN_TIER` removed — plan-tier gating is deleted, §5.12) | key                        | —            |
| **internal** `app.ai_settle(reservationId, usage jsonb)`           | SQL                                                                             | `void`                                                                                 | raises `RESERVATION_NOT_OPEN`                                                                               | —                          | —            |
| **internal** `app.ai_release(reservationId, errorCode)`            | SQL                                                                             | `void`                                                                                 | idempotent                                                                                                  | —                          | —            |
| **internal** `app.ai_grant(...)`                                   | SQL                                                                             | `ledger_id`                                                                            | —                                                                                                           | key                        | —            |
| Edge Function `sslcommerz-ipn`                                     | provider payload                                                                | 200                                                                                    | signature/validation failure → 400, logged                                                                  | provider event id          | —            |
| Cron `ai_monthly_reset` (pg_cron, 00:00 Asia/Dhaka on the 1st)     | —                                                                               | —                                                                                      | alert on failure                                                                                            | `(workspace, user, month)` | —            |
| Cron `ai_reservation_reaper` (every 5 min)                         | —                                                                               | —                                                                                      | —                                                                                                           | per reservation            | —            |
| Cron `ai_request_expiry` (hourly)                                  | —                                                                               | —                                                                                      | —                                                                                                           | —                          | —            |
| Cron `ai_ledger_reconcile` (nightly)                               | —                                                                               | —                                                                                      | writes `adjustment` + platform alert on drift                                                               | —                          | —            |

## 8. Parts (build chunks)

**Part 1 — Ledger schema and SQL functions (≤2 days).**
Scope: every enum and table in §3; `app.ai_reserve/settle/release/grant` as `SECURITY DEFINER` functions with row locking; revoked UPDATE/DELETE grants on `ai_credit_ledger`; RLS policies; `model_rates` seed; `ai_actions` seed with the §5.2 price list.
Files: `supabase/migrations/*_ai_credits.sql`, `supabase/tests/ai_credits_rls.sql`, `supabase/seed/ai_actions.sql`.
Tests: pgTAP — cross-workspace ledger read returns 0 rows; a teacher cannot INSERT into the ledger by any means; UPDATE/DELETE on the ledger fail for every role including service role; two concurrent reservations against an insufficient balance serialise correctly (two sessions, `FOR UPDATE`); `ai_settle` on a closed reservation raises.
**Demo:** a psql session where two concurrent transactions try to reserve 3 credits against a balance of 4 and exactly one succeeds.

**Part 2 — `adapters/ai` invoke pipeline (≤2 days).**
Scope: the §4.1 pipeline in TypeScript; `invoke()` with model/timeout/max-tokens from `ai_actions`, streaming, structured output via `zodOutputFormat`, `output_config.effort`, prompt caching breakpoints, retry policy, error taxonomy, `ai_generations` writes, `cost_usd_micros` computation; the ESLint/CI rule from §5.14.
Files: `packages/adapters/ai/{client,invoke,errors,pricing}.ts`, `packages/contracts/ai.ts`, `.eslintrc` rule, `.github/workflows/ci.yml` grep step.
Tests: unit with a mocked Anthropic client for every branch in the error taxonomy; assert the ledger after each; assert the CI rule fails a fixture file that imports the SDK directly.
**Demo:** a script that runs a fake action 5 times — success, timeout, refusal, schema-invalid-then-recovered, insufficient — and prints the resulting ledger, showing exactly two debits.

**Part 3 — Monthly reset, reaper, reconciliation (≤1 day).**
Scope: `pg_cron` jobs, timezone-correct **monthly** reset, expiry entries, carryover preservation, orphan reaping, nightly reconciliation with the drift alert, the inline fallback grant, the 3×-allowance hard ceiling enforcement.
Tests: a fixture clock advancing across a Dhaka month boundary; unused monthly credits expire and carryover survives; a workspace with the cron disabled still gets a grant on first reserve of the new month; drift injected into `ai_credit_balances` is detected and corrected with an `adjustment` entry, never by editing history; spend attempting to exceed the 3× monthly ceiling is refused.
**Demo:** move the fixture clock past the month boundary; balances reset, top-up credits remain.

**Part 4 — Balance UI and enforcement in one caller (≤1 day).**
Scope: `aiCredits.balance` / `.prices`, the `CreditBadge` component, the disabled-below-cost state, the balance sheet, and wiring exactly one real caller (F-TE-01's `lessonPlan.generate`) end to end.
Tests: e2e at 360×800 — generate with credits, then with none; the badge never renders a stale balance after a successful generation.
**Demo:** a teacher with 6 credits generates a lesson plan (5) and the badge drops to 1 and the button disables.

**Part 5 — Requests and grants (≤1 day).**
Scope: `ai_credit_requests` CRUD, the request sheet, the owner inbox with the requester's 7-day usage, approve with a different amount, reject with a note, notifications both ways, 48-hour expiry job, one-pending-request rule.
Tests: pgTAP on the partial unique index; integration on `ALREADY_REVIEWED` under a double-tap; e2e two-user journey.
**Demo:** teacher requests 20, owner approves 10, teacher's button re-enables.

**Part 6 — Billing model, allocations, and the settings screen (≤1 day).**
Scope: the owner-only model toggle with the plain-words confirm and next-reset semantics, the allocation table with "apply to all", `ai_enabled` kill switch, the whole `/app/settings/ai` stack.
Tests: an admin (not owner) gets `FORBIDDEN` on the toggle; switching mid-month does not change this month's balances; allocations cannot target a `removed` member.
**Demo:** switch a school to per-teacher allocations, set three caps, advance the clock past midnight, see three separate balances.

**Part 7 — Top-up packs and usage analytics (≤2 days).**
Scope: `ai_credit_packs`, `aiCredits.startTopup` through SSLCommerz, the IPN grant path with idempotency, the receipt link, the five analytics views and the Usage tab, CSV export, the ledger screen.
Tests: a replayed IPN grants once; a forged success return grants nothing; a refund produces a negative entry; the views' numbers equal a hand-computed fixture.
**Demo:** buy a 500-credit pack in the SSLCommerz sandbox; credits appear only after the IPN, and appear exactly once when the IPN is replayed.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7. **Parts 1–4 are a hard prerequisite for every AI part in F-TE-01, F-TE-02 and F-TE-04.**

## 9. Acceptance criteria

1. **Given** any file in the repo other than `packages/adapters/ai`, **when** it imports `@anthropic-ai/sdk`, **then** CI fails.
2. **Given** a teacher with 4 credits and an action costing 5, **when** the server action runs, **then** it returns `INSUFFICIENT_CREDITS`, no ledger row is written, and no request reaches Anthropic.
3. **Given** a teacher with 4 credits, **when** two 3-credit generations are submitted simultaneously, **then** exactly one succeeds and the other returns `INSUFFICIENT_CREDITS`; the final balance is 1.
4. **Given** a successful generation costing 5, **when** it settles, **then** the ledger contains a `reservation` of −5 and a `settlement` of 0, `spent_today` is +5, `reserved` is back to 0, and `ai_generations` records real token counts.
5. **Given** the Anthropic call times out, **when** the action fails, **then** a `release` entry of +5 exists, the balance equals its pre-call value exactly, and `ai_generations.status='timeout'`.
6. **Given** the model returns `stop_reason='refusal'`, **when** the action fails, **then** nothing is charged, `refusal_category` is recorded, and the user sees a refusal message rather than a crash.
7. **Given** the model returns output failing the Zod schema, **when** the single repair retry also fails, **then** nothing is charged, `raw_output` is stored on `ai_generations`, and the user never sees the raw text.
8. **Given** a server crash between reservation and settlement, **when** the reaper runs 5 minutes later, **then** a `release` entry with `ORPHANED_RESERVATION` restores the balance.
9. **Given** a teacher, **when** they attempt any INSERT, UPDATE or DELETE on `ai_credit_ledger` through the browser client, **then** it is refused by RLS and by the absent grants.
10. **Given** a service-role connection, **when** it attempts UPDATE or DELETE on `ai_credit_ledger`, **then** Postgres refuses — append-only is a grant, not a convention.
11. **Given** a workspace in school A, **when** a member of school B queries balances, ledger, requests or generations, **then** zero rows are returned.
12. **Given** a workspace with 40 unused monthly credits and 100 purchased credits at 23:59 Asia/Dhaka on the last day of the month, **when** the clock passes into the new month, **then** the 40 expire (with an `expiry` entry), 100 remain, and the new month's grant is added.
13. **Given** the monthly reset cron fails, **when** a teacher generates on the 1st, **then** the reserve function creates that month's grant inline and the generation proceeds.
14. **Given** `shared_pool` mode, **when** three teachers each spend 10 credits, **then** the workspace balance drops by 30 and every teacher sees the same remaining number.
15. **Given** `individual_allocation` mode with caps of 20/20/50, **when** teacher one exhausts 20, **then** teachers two and three are unaffected.
16. **Given** an owner switches billing model mid-month, **when** the change saves, **then** this month's balances are unchanged and the new model applies from the next monthly reset; an audit event records who changed it.
17. **Given** an admin (not owner), **when** they call `aiCredits.setBillingModel`, **then** they get `FORBIDDEN`.
18. **Given** a teacher at zero credits, **when** they open any AI action, **then** the button is disabled with "Not enough credits" and a "Request credits" affordance, and no AI call is possible even via a crafted request.
19. **Given** a pending request, **when** the same teacher requests again, **then** they get `REQUEST_PENDING` and exactly one request row exists.
20. **Given** a request for 20 credits, **when** the owner approves 10, **then** an `admin_grant` of +10 lands in carryover, the requester is notified, and `granted_credits=10` is recorded.
21. **Given** an unreviewed request older than 48 hours, **when** the expiry job runs, **then** its status becomes `expired` and it leaves the owner's inbox.
22. **Given** a top-up checkout, **when** the browser returns to the success URL but no IPN has arrived, **then** no credits are granted.
23. **Given** an SSLCommerz IPN delivered twice for the same transaction, **when** both are processed, **then** exactly one `topup_purchase` entry exists.
24. **Given** a refunded top-up, **when** the refund is processed, **then** a negative `refund` entry exists and the balance may go negative rather than being silently floored at zero.
25. **Given** an owner with `ai_enabled=false`, **when** any member triggers any AI action, **then** the server returns `AI_DISABLED` before any reservation.
26. **Given** a user makes 11 generation requests in one minute, **when** the 11th arrives, **then** it returns `RATE_LIMITED` with `retry_after`, and no reservation was made.
27. **Given** `ai_credit_balances` is manually corrupted, **when** the nightly reconciliation runs, **then** an `adjustment` ledger entry restores agreement, the ledger's history is unmodified, and platform staff are alerted.
28. **Given** the usage view for a month, **when** compared against a hand-summed fixture of the ledger, **then** every number matches exactly — no chart in this feature is populated by anything other than a SQL view.
29. **Given** a Free-plan (or Trial) workspace and any enabled action, **when** a teacher triggers it, **then** it is never blocked by plan tier — `PLAN_TIER` does not exist as an error code — and is only blocked by `INSUFFICIENT_CREDITS` if the monthly allowance is exhausted. **Given** an action with `language_risk='bangla_or_parent_facing'` (e.g. `parent_message.generate`), **when** it is triggered on any plan from Free through Enterprise, **then** it is routed to the strongest available model every time, never a cheaper model chosen because of plan tier.
30. **Given** two repeated generations of the same action within the cache window, **when** the second completes, **then** `cache_read_tokens > 0` on the second `ai_generations` row.

## 10. Tests

- **Unit (`packages/domain` + `adapters/ai`, ≥90 % — this module is the money):** `resolveBucket()`, `creditCostFor(action, context)` including the proposed page formula, the retry policy state machine, the error taxonomy mapper, `costUsdMicros()` against the published rate table, `nextResetAt(timezone)`.
- **DB (pgTAP):** isolation + escalation on all six tables; append-only enforcement (UPDATE/DELETE fail for `authenticated`, `anon` and `service_role`); concurrent reservation serialisation using two sessions; the partial unique index on pending requests; reset/expiry/carryover across a timezone boundary; reconciliation drift detection.
- **Integration:** the full `invoke()` pipeline against a mocked Anthropic covering success, timeout, 429, 500, refusal, schema-invalid×2, PII-blocked, orphan-then-reap — each asserting the exact ledger rows produced; IPN replay; request double-review.
- **e2e (360×800 + 1280×800, axe):** J1 generate and watch the badge drop; J2 hit zero and request credits; J3 owner approves and the teacher recovers; J4 buy a top-up in the SSLCommerz sandbox; J5 switch billing models; J6 usage tab numbers match the ledger screen.
- **a11y:** the credit badge has an accessible name reading "costs 5 credits, you have 37"; disabled Generate buttons expose the reason via `aria-describedby`, not only as colour.
- **Performance budgets:** `app.ai_reserve` p95 < 15 ms; `aiCredits.balance` p95 < 50 ms; the reset job completes for 1,000 workspaces in < 60 s; the usage views p95 < 400 ms for a workspace with 50,000 generations.
- **Security:** an `appsec-review` pass covering the IPN handler, the `SECURITY DEFINER` functions' `search_path` pinning, and the absence of any client-writable price/model/prompt field.

## 11. Open questions

1. **Page-weighted pricing for `syllabus.extract`** (§5.12). Default assumed until the owner rules: flat 10 credits, losing money on long PDFs. Recommended: `10 + ceil(max(0, pages − 10) / 2)`, capped at 40.
2. **Repricing the thin actions** (worksheet, quiz, rubric, differentiation, illustration). Default assumed: PRODUCT-DECISIONS placeholders stand.
3. ~~**Free-plan AI scope** (§5.12 third finding).~~ **Resolved by the research-debate synthesis (D-26(4)/A-04, M0-0.5):** `min_plan_tier` gating is deleted outright. All actions are available on every plan; cost is bounded by the monthly pooled allowance (§5.1), and Bangla/parent-facing actions always route to the strongest model regardless of tier (§5.12).
4. **Do credits roll over for paid plans?** Superseded from daily to monthly (D-39, M0-0.5): allowances are now granted and expired **monthly**, not at each midnight. Whether unused monthly credits should roll over is still open; a rolling multi-month bucket would smooth an uneven usage pattern across the term. Default assumed: monthly expiry, no rollover, because it is what the new plan matrix communicates — revisit if schools report the same "I planned my whole term on day one" friction the old daily cadence had within a day.
5. **Personal workspaces.** PRODUCT-DECISIONS 5.5 says personal workspaces can buy credit packs but have no subscription. What is a personal workspace's free monthly allowance? Default assumed: **0/month, purchased credits only** — a teacher's personal tutoring space does not get free AI.
6. **Per-teacher caps in shared-pool mode.** An owner may want a pool _and_ a per-teacher ceiling so one teacher cannot drain it on day one. Not in v1. Default assumed: pool mode is genuinely first-come-first-served, and the usage view is the control.
7. **`model_rates` maintenance.** Rates are seeded from published pricing and go stale silently. Default assumed: a platform screen showing rate age with a warning past 90 days; no automatic fetch.
