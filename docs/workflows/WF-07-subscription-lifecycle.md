# WF-07 — Subscription lifecycle: trial → limit warnings → upgrade → invoice → renewal/dunning → downgrade

|                  |                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journey          | The school's commercial relationship with Acadigma, from day 0 to a lapsed plan that never destroys data                                                                                           |
| Primary actor    | School owner                                                                                                                                                                                       |
| Secondary actors | Admin (sees limits, cannot buy) · Platform staff (plan editor, manual adjustments) · pg_cron (the whole clock)                                                                                     |
| Features         | F-CM-06 (plans & subscriptions) · F-CM-01 (payments core) · F-CM-07 (school billing, credit packs & expenses) · F-ID-03 (seat limits) · F-ID-07 (notifications) · F-ID-08 (platform console shell) |
| Money rules      | BDT paisa · **yearly = 10 × monthly** · gateway min ৳10 / max ৳500,000 · Enterprise is contact-only                                                                                                |
| Exit state       | `subscriptions` in `trialing                                                                                                                                                                       | active | past_due | cancelled | expired`, `workspaces.plan_id`always the single source of entitlement, invoices in`files`, over-limit data **read-only, never deleted** |

---

## 1. Actors and preconditions

| Actor              | Device               | Needs                                                                 |
| ------------------ | -------------------- | --------------------------------------------------------------------- |
| **Owner**          | Windows PC (usually) | `billing.manage` — the only role that can start a checkout for a plan |
| **Admin**          | Windows PC           | `billing.read` — sees usage and invoices, cannot change the plan      |
| **Platform staff** | Windows PC           | `/platform/plans` — edits limits and prices **without a deploy**      |

**Preconditions**

- `plans` seeded with the placeholder matrix (PRODUCT-DECISIONS §5.1):

| Plan           | ৳/month | Teachers  | Students | Storage | AI credits/day | Adds                                                                         |
| -------------- | ------- | --------- | -------- | ------- | -------------- | ---------------------------------------------------------------------------- |
| **Free**       | 0       | 5         | 150      | 1 GB    | 20             | academics, attendance, lessons, messaging                                    |
| **Starter**    | 2,999   | 20        | 600      | 10 GB   | 100            | + resources library, reports, print queue                                    |
| **Pro**        | 7,999   | 75        | 2,500    | 50 GB   | 400            | + hiring, cover teacher, analytics, school-funded marketplace, custom labels |
| **Enterprise** | contact | unlimited | —        | 250 GB  | 1,500          | priority support                                                             |

- Prices are **placeholders until the owner sets them in `/platform/plans`**; nothing in the app hardcodes a price or a limit.
- Payments core (WF-06 stages C/H) already live: `orders`, `payments`, IPN, reconciliation.

---

## 2. Sequence

```mermaid
sequenceDiagram
    autonumber
    actor O as Owner
    participant C as Client
    participant SA as Server Actions
    participant DB as Postgres + RLS
    participant CR as pg_cron
    participant GW as SSLCommerz
    participant EF as Edge Fn (IPN)
    participant JOB as jobs / Resend

    Note over DB: WF-01 created subscriptions(status='trialing', plan=Pro, trial_ends_at=+14d)

    CR->>DB: nightly limits.evaluate (per workspace tz)
    DB->>DB: workspace_usage refreshed (teachers, students, storage, credits)
    DB->>DB: notifications: billing.limit_warning at 80% / 100%
    CR->>JOB: email 3 days before trial end
    JOB-->>O: "Your Pro trial ends on 1 Oct"

    O->>C: /app/billing → Upgrade → Pro monthly
    C->>SA: createOrder({kind:'subscription', funding:'workspace', items:[{planId, period}], idempotencyKey})
    SA->>DB: re-reads plans.price_monthly_paisa; orders + order_lines(commission_bps=0)
    C->>SA: startCheckout → payments + gateway session
    SA-->>C: full-page redirect
    O->>GW: pays
    GW->>EF: IPN (authoritative)
    EF->>GW: validation API
    EF->>DB: BEGIN → payments.captured → orders.paid → fulfilment(kind='subscription')
    DB->>DB: subscriptions(active, period_start, period_end, plan_id) + workspaces.plan_id
    DB->>DB: invoices row + jobs invoice.render → files(private) → email_log
    DB->>DB: audit_events: subscription.activated · notifications: billing.upgraded

    CR->>DB: daily renewal.due (period_end <= today)
    alt Auto-charge not stored (v1)
        DB->>DB: subscriptions.status='past_due', grace_ends_at=+7d
        DB->>DB: notifications billing.renewal_due (day 0, 3, 6)
        O->>C: Pay now → same checkout → active, period extended
    else No payment by grace end
        CR->>DB: subscriptions.status='expired' → workspaces.plan_id = Free
        DB->>DB: over-limit data flagged read_only (never deleted)
        DB->>DB: notifications billing.downgraded + banner
    end
```

---

## 3. Steps

### Stage A — Trial (PRODUCT-DECISIONS §5.2)

1. Creating a school (WF-01 stage B) writes `subscriptions` in the **same transaction** as the workspace: `status='trialing'`, `plan_id` = Pro, `trial_ends_at = now() + 14 days`, `provider=null`. **No card is required.** `workspaces.plan_id` points at Pro from minute one, so every entitlement check — nav visibility, hiring, cover teacher, analytics, school-funded marketplace — resolves through the one source.
2. `/app/billing` renders a trial card: days remaining, what Pro gives them, and **Upgrade** / **See plans**. Every gated module shows its real UI during the trial, not a teaser.

### Stage B — Usage and limit warnings

3. A nightly pg_cron job per workspace refreshes a `workspace_usage` view/table from real rows:
   - `teachers` = `count(workspace_members where status='active' and role in ('owner','admin','teacher','staff'))`
   - `students` = `count(enrollments where status='active' and academic_year_id = current)`
   - `storage_bytes` = `Σ files.size_bytes for the workspace` — a **real** meter, not a resource count
   - `ai_credits_today` = from `ai_credit_ledger`
4. `/app/billing` shows four meters with the number, the limit and the percentage. At **80 %** and at **100 %** the job writes `notifications`: `billing.limit_warning` (event payload names the limit) to owner + admins, plus an email per `notification_preferences`.
5. **Over a limit while on a paid plan** does not break anything mid-cycle: writes that would push further past the limit are refused at the action with a named error and an upgrade sheet — `SEAT_LIMIT_REACHED` (invite), `STUDENT_LIMIT_REACHED` (admission), `QUOTA_EXCEEDED` (upload). Existing data is untouched.
6. Three days before `trial_ends_at`, a job emails and banners: _"Your Pro trial ends on 1 Oct. After that your school moves to Free and anything over the Free limits becomes read-only."_ The banner names the specific overage ("You have 38 teachers; Free allows 5").

### Stage C — Upgrade (through the one payment substrate)

7. **`/app/billing` → Choose a plan.** A comparison table on desktop; a vertically stacked card per plan on phone with the current plan pinned first. Monthly / yearly toggle, **yearly = 10 × monthly** (two months free), stated as such.
8. **Upgrade** calls `createOrder({kind:'subscription', funding:'workspace', items:[{type:'plan', planId, period}], idempotencyKey})`. The server re-reads `plans.price_monthly_paisa` / `price_yearly_paisa`. Plan lines are **platform-sold**: `commission_bps = 0`, `commission_paisa = gross_paisa`, `seller_paisa = 0`, `seller_user_id = null`.
9. `startCheckout` → SSLCommerz hosted page → **full-page redirect**. The IPN path, the validation API, the amount comparison and the idempotency layers are **identical to WF-06** — one substrate, not a second payment code path.
10. **Fulfilment for `kind='subscription'`** (in the capture transaction):
    - `subscriptions`: `status='active'`, `plan_id`, `period='monthly'|'yearly'`, `current_period_start=now()`, `current_period_end = start + 1 month|1 year`, `provider_payment_id`;
    - `workspaces.plan_id` updated — **this is the flip that changes entitlements**;
    - `invoices` row (`invoice_no` from `app.next_id(workspace_id,'invoice')`, `order_id`, `total_paisa`, `vat_bin`, `vat_rate_bps`, `issued_at`);
    - a `jobs{type:'invoice.render'}` → `/api/pdf/invoice` → `files` (private, `invoices/{workspace_id}/{invoice_no}.pdf`) → Resend → `email_log`.
      _Events:_ `audit_events`: `subscription.activated`, `plan.changed` (before/after), `invoice.issued`. `notifications`: `billing.upgraded` to owner + admins, `action_url=/app/billing/invoices`.
11. **Upgrading mid-cycle** (Starter → Pro) charges the **full new-period price** and resets the period; v1 does **not** prorate, and the checkout sheet says so in one line. Downgrading is scheduled for `current_period_end`, never immediate (the school keeps what it paid for).

### Stage D — Invoices

12. **`/app/billing/invoices`** — `DataList` of invoice cards on phone, a table at ≥1024: number, date (Asia/Dhaka), plan, period, total, **Download**. The PDF carries the school header from `school_profiles`, the school's own **BIN/VAT fields**, a `0 %` VAT line when `platform_settings.vat_bin` is set (v1 **displays** VAT, does not add it), the payment instrument (`card_brand`/`card_type`, masked), `bank_tran_id`, and a footer from `platform_settings.receipt_footer`. Re-rendering the same invoice is byte-identical, asserted by a test.
13. Download goes through `/api/files/[id]` → policy check (`orders.select` visibility) → 5-minute signed URL → `file_access_log`.

### Stage E — Renewal and dunning

14. A daily pg_cron job selects `subscriptions` where `current_period_end <= today(workspace tz)` and `status='active'`. Because v1 stores **no card on file** (SSLCommerz hosted checkout, no vault), there is no silent auto-charge. The job:
    - sets `status='past_due'`, `grace_ends_at = now() + 7 days`;
    - writes `notifications`: `billing.renewal_due` and enqueues an email on **day 0, day 3 and day 6** of the grace window;
    - renders a persistent banner for owner + admins with a **Pay now** button that opens the same checkout.
      Entitlements are **unchanged during the grace window** — a school is not locked out of attendance because an invoice is three days late.
15. **Paying during grace** returns `status='active'` and extends `current_period_end` from the **original** end date (not from the payment date), so the school does not lose the days it paid for.

### Stage F — Downgrade to Free, read-only over limits (the rule that never destroys data)

16. At `grace_ends_at` with no payment, or at `trial_ends_at` with no upgrade, the job sets `subscriptions.status='expired'` and `workspaces.plan_id` = **Free**.
17. `packages/domain/plans/overLimit.ts` then computes, per resource, what is over the Free limit and marks it **read-only** — never deleted:
    - **Teachers** — memberships beyond `max_teachers`, ordered by `joined_at desc`, get `workspace_members.access='read_only'`. They keep signing in and reading; every write action returns `PLAN_READ_ONLY`. Owners are never read-only.
    - **Students** — enrolments beyond `max_students` are readable and printable; new admissions return `STUDENT_LIMIT_REACHED`.
    - **Storage** — uploads return `QUOTA_EXCEEDED`; **nothing is ever deleted**, and existing files stay downloadable.
    - **Modules** — hiring, cover teacher, analytics, school-funded marketplace and custom labels disappear from the nav and their routes render an **upgrade card**, not a 404, with the data behind them still exportable.
    - **AI credits** — the daily grant drops to the Free number at the next 00:00 Asia/Dhaka reset.
      _Events:_ `audit_events`: `plan.changed`, `workspace.read_only_applied` with counts. `notifications`: `billing.downgraded` to owner + admins with an itemised list.
18. A sticky banner on every route reads: _"Your school is on Free. 33 staff accounts and 1,850 student records are read-only until you upgrade. Nothing has been deleted."_ One tap goes to the plan picker.
19. **Upgrading again clears every read-only flag in one transaction** and writes `workspace.read_only_cleared`. Nothing needs re-entering.

### Stage G — Platform side

20. **`/platform/plans`** lets platform staff edit names, prices, limits and module entitlements **without a deploy** (D-18). Every edit is audited (`plan.updated`, before/after) and takes effect at the next entitlement resolution; **existing subscriptions keep their snapshotted price** until renewal, so a price rise never silently re-bills a school.
21. **Enterprise** is contact-only. `createOrder` refuses a plan line over `50,000,000` paisa with `ORDER_EXCEEDS_GATEWAY_LIMIT` and routes to the contact path — a yearly Enterprise self-serve could otherwise exceed the ৳500,000 gateway ceiling (F-CM-01 §11.1).
22. **`/app/billing` → Expenses** is the school's own ledger (`expenses`: category ∈ utility/printing/maintenance/salary/misc, `amount_paisa`, `date`, `receipt_file_id`, soft delete with a real 30-day purge job). It is the one money feature the prototype actually got right, now tenant-scoped like everything else.

---

## 4. Failure and edge cases

| Case                                                 | Detection                                             | Behaviour                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner double-taps Upgrade                            | `idempotency_keys` on `createOrder` + `startCheckout` | One order, one payment attempt, one subscription change                                                                                                                 |
| Payment succeeds but the IPN is delayed              | Reconciliation job (WF-06 stage H)                    | The order page polls and shows "Confirming…"; the plan flips when the validated capture lands, within 24 h at worst                                                     |
| IPN amount mismatch on a plan                        | Exact integer compare                                 | Payment `disputed`, **plan not changed**, platform staff notified                                                                                                       |
| Plan price edited between order creation and capture | Amounts snapshotted on `order_lines`                  | The school is charged what they saw                                                                                                                                     |
| Two admins upgrade at once                           | Fulfilment is idempotent on `(order_line_id)`         | One period extension; the second order's capture is a no-op with an audit note                                                                                          |
| Downgrade while over the seat limit                  | Read-only marking                                     | Memberships are marked, never removed; the owner chooses whom to remove, or upgrades                                                                                    |
| Trial expires during the exam week                   | Read-only rule                                        | Marks already entered stay readable and printable; report cards already in `files` stay downloadable; new marks entry is blocked with a named error and an upgrade link |
| Grace period spans a month end                       | `grace_ends_at` is absolute                           | Unaffected by month boundaries                                                                                                                                          |
| Schoolwide sign-in during `past_due`                 | Entitlements unchanged in grace                       | Full function plus a banner; no surprise lockout                                                                                                                        |
| Free school tries a Pro module by URL                | `WorkspaceContext.plan` + server policy + nav filter  | Upgrade card, action returns `PLAN_REQUIRED`; RLS is unaffected (plan is an entitlement, not a security boundary — the tenant boundary is separate, WF-13)              |
| Refund of a subscription payment                     | Platform staff, 7-day window                          | `subscriptions` reverts to the prior plan for the remainder of the period; `plan.changed` audited both ways                                                             |
| `SSLCOMMERZ_MODE=sandbox` reaches `main`             | CI guard                                              | Production deploy fails                                                                                                                                                 |
| Invoice requested for another workspace              | `orders.select` policy + `/api/files/[id]`            | 403 + a `file_access_log` denial row                                                                                                                                    |

---

## 5. What the Base44 prototype did instead

Two incompatible subscription models coexisted and neither worked. `SchoolSubscription` modelled per-teacher seat bands (`plan_name` as free text, e.g. `"6-10 Teachers"`, plus `monthly_cost_per_teacher` and `total_monthly_cost`), while `SchoolSettings` carried a named-tier enum `free|starter|pro|enterprise` with a `trial|active|expired|cancelled` status. **No price for either model existed anywhere in the code** — no pricing page, no plan picker, no upgrade flow. Every signup path hardcoded `subscription_status:'trial'` and `subscription_plan:'free'`, and **nothing ever moved a workspace off them**: no trial length, no expiry check, no conversion path, and not one line of code anywhere was conditional on the plan. `SchoolSubscription` was never created by any code, so for every real workspace the billing overview read "No Active Plan / —", and its only write was an auto-billing boolean toggle with no scheduler, no charge and no invoice behind it. `BillingRecord` — the unified invoice line — was likewise **never created by anything**, which is why both the payment-history table and the school-funded marketplace approvals queue (which read it by the author's own admitted mistake) were permanently empty. `PaymentMethod` stored hand-typed brand, last-four, expiry and cardholder name with **no PSP token field at all**, confirming it was a decorative record; its per-row Download invoice button had no `onClick`. The billing overview's headline numbers were literals — _"AI Usage Cost ৳ 0"_, _"Marketplace Spending ৳ 0"_, _"Storage Used **34 GB** of 100 GB"_ — and the AI-model badge read `subscription.ai_model_type`, a field that lives on a different entity, so it always rendered "Shared Pool". The storage meter elsewhere in the app was `Math.min(resources.length / 10, 100)` — a resource **count** divided by ten, presented as a percentage of "100 GB free" — while `file_size_kb` was captured on every upload and never summed. Import/Export emitted the literal string `[{note:'Export functionality — connects to entity data in production'}]` as the downloaded file. The `module_*` feature flags that were meant to gate everything were persisted by the settings screen and **read by no nav code, no route and no component**. And because none of `SchoolSubscription`, `BillingRecord`, `PaymentMethod`, `ManualExpense` or `CreditAllocation` had RLS, and every one of them was written with `school_id: user?.school_id || 'default'` against a field that does not exist on the User schema, **all schools shared one billing dataset** under the literal tenant key `'default'`.
