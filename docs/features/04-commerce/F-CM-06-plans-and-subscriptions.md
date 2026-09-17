# F-CM-06 — Plans, subscriptions, limits, invoices and dunning

|                  |                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | billing                                                                                                                                       |
| Status           | in-progress (Parts 1-3)                                                                                                                       |
| Owner branch     | `feat/commerce-plans-subscriptions`                                                                                                           |
| Depends on       | F-CM-01 (orders/payments/receipts), F-AU-02 (workspaces, members), F-TE-0x (AI credits ledger), F-OP-0x (files, PDF)                          |
| Plan             | `docs/plan/ROADMAP.md` chunk — commerce, sixth (but **plans + limits land early**, see §8 note)                                               |
| Base44 reference | `docs/reference/base44-inventory/04-commerce-billing.md` §1 "Subscription / plan model", §3.6, §3.7, §5 rows 30–33, §7-A16, §7-C26, §8-Q9–Q13 |

> **Schema note.** Tables and columns are **proposed; `docs/architecture/DATA-MODEL.md` wins**.

---

## 1. Purpose

One plan model, one subscription per school workspace, real limits that the product actually enforces, a 14-day Pro trial, self-serve upgrade through SSLCommerz, and a VAT/BIN-bearing invoice PDF a Bangladeshi school's accountant will accept. Prices and limits are editable by platform staff from `/platform` without a deploy, because PRODUCT-DECISIONS 5.1 marks them as placeholders the owner will change.

**What Base44 had:** two incompatible subscription models simultaneously — per-teacher seat bands (`SchoolSubscription.plan_name = "6-10 Teachers"`) and named tiers (`SchoolSettings.subscription_plan = free|starter|pro|enterprise`) — and **no prices anywhere in the code for either**. No pricing page, no plan picker, no upgrade flow. Every signup path hardcoded `trial`/`free` and **nothing ever moved a workspace off it**: no trial length, no expiry check, no gate keyed to plan. Nothing ever _created_ a `SchoolSubscription` row, so every real workspace read `null` and the overview said _"No Active Plan"_. The only write in the entire billing surface was an auto-billing boolean toggle with no scheduler, no charge and no invoice behind it. `BillingRecord` — the invoice table — was never created by any code, so payment history was permanently empty and its per-row Download button had no handler. Storage was hardcoded as _"34 GB of 100 GB"_. Not one `module_*` flag was ever read.

**Done looks like:** a school owner sees _"Pro trial — 6 days left"_, taps Upgrade, picks Pro monthly, pays ৳7,999 through SSLCommerz, and gets an invoice PDF with the school's BIN on it. When the trial lapses on a school that does nothing, the school drops to Free, their 340 students stay in the database, and adding the 341st is blocked with a clear upgrade prompt — nothing is deleted, ever.

---

## 2. Roles and permissions

| Action                                     | Permission key                   | owner | admin | teacher/staff | parent | platform   |
| ------------------------------------------ | -------------------------------- | ----- | ----- | ------------- | ------ | ---------- |
| View plan + usage                          | `billing.plan.read`              | ✔     | ✔     | —             | —      | ✔          |
| Start upgrade / change plan                | `billing.plan.change`            | ✔     | —     | —             | —      | ✔ (assist) |
| Cancel subscription                        | `billing.subscription.cancel`    | ✔     | —     | —             | —      | ✔          |
| View invoices                              | `billing.invoice.read`           | ✔     | ✔     | —             | —      | ✔          |
| Edit school billing details (BIN, address) | `billing.details.write`          | ✔     | ✔     | —             | —      | ✔          |
| Edit plans, prices, limits                 | `platform.plans.write`           | —     | —     | —             | —      | ✔          |
| Grant a comp / extend a trial              | `platform.subscription.override` | —     | —     | —             | —      | ✔          |

Only the **owner** can change what the school pays. An admin can look at it and download invoices. That split is deliberate: admins are often office staff.

---

## 3. Data

### 3.1 `plans` _(new; proposed — platform-owned, global)_

| column                             | type                                    | notes                                                                              |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| `id`                               | uuid pk                                 |
| `code`                             | text unique not null                    | `free \| starter \| pro \| enterprise`                                             |
| `name`                             | text not null                           | display name                                                                       |
| `tagline`                          | text null                               |
| `sort`                             | int not null                            |
| `price_monthly_paisa`              | bigint not null                         | Free `0`; Starter `299900`; Pro `799900`; Enterprise `null`→ use `is_contact_only` |
| `price_yearly_paisa`               | bigint not null                         | `10 × monthly` by default (§5.2), stored not computed                              |
| `is_contact_only`                  | boolean not null default false          | Enterprise                                                                         |
| `is_public`                        | boolean not null default true           | hidden plans for grandfathering                                                    |
| `trial_days`                       | int not null default 0                  | Pro = 14                                                                           |
| `status`                           | `plan_status` not null default `active` | `active \| archived`                                                               |
| `effective_from`                   | timestamptz not null default now()      | §5.3                                                                               |
| `created_at/updated_at/updated_by` |                                         |                                                                                    |

### 3.2 `plan_limits` _(new; proposed)_ — one row per plan per limit key

`id`, `plan_id`, `limit_key` (`teachers | students | storage_gb | ai_credits_daily | sections | workspaces_admins | print_jobs_monthly`), `limit_value bigint` (`-1` = unlimited), `created_at`. Unique `(plan_id, limit_key)`.

A **table**, not columns, because PRODUCT-DECISIONS 5.1 says the matrix is the owner's to tune and new levers will appear. Adding a limit is a row plus one enforcement call, not a migration plus a deploy.

### 3.3 `plan_modules` _(new; proposed)_

`plan_id`, `module_key`, `enabled boolean`, pk `(plan_id, module_key)`. Module keys: `academics, attendance, lessons, messaging, resources, reports, print, fees, hiring, cover, analytics, marketplace_school_funded, custom_labels, ai`. This is the **entitlement** half of PRODUCT-DECISIONS 1.12; the owner's per-school _visibility_ toggles live on `workspaces` / `school_profiles` and are ANDed with it.

**`fees`** gates F-CM-08 (student fee collection) and is **Starter and above**. The market research (COMPETITORS.md §1.1, §7a rec 1) shows fee collection is the anchor module every BD competitor leads with, so it is the single strongest reason for a Free school to upgrade; putting it on Free would give away the one thing the mid-market actually buys. A Free school sees the Fees nav item with a lock and an upgrade prompt rather than a 404, because here the _existence_ of the feature is the sales message — the one deliberate exception to the 404-not-403 rule in §4.6. A school that downgrades keeps every fee row, readable and exportable, and simply cannot publish new invoice runs (§5.6 read-only over-limit semantics apply to modules too).

### 3.4 Seeded matrix (placeholders — the owner will change these)

|                  | Free ৳0                                   | Starter ৳2,999                        | Pro ৳7,999                                                           | Enterprise (contact)   |
| ---------------- | ----------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- | ---------------------- |
| teachers         | 5                                         | 20                                    | 75                                                                   | −1                     |
| students         | 150                                       | 600                                   | 2,500                                                                | −1                     |
| storage_gb       | 1                                         | 10                                    | 50                                                                   | 250                    |
| ai_credits_daily | 20                                        | 100                                   | 400                                                                  | 1,500                  |
| modules          | academics, attendance, lessons, messaging | + resources, reports, print, **fees** | + hiring, cover, analytics, marketplace_school_funded, custom_labels | all + priority support |
| yearly           | ৳0                                        | ৳29,990                               | ৳79,990                                                              | quoted                 |

Stored as `plans` + `plan_limits` + `plan_modules` rows in `supabase/seed`, not as constants in code. A test asserts the seed matches this table so a silent drift is caught.

### 3.5 `subscriptions` _(new; proposed)_ — one per school workspace

| column                                        | type                                  | notes                                                                      |
| --------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- |
| `id`                                          | uuid pk                               |
| `workspace_id`                                | uuid **unique** not null → workspaces | one subscription per workspace, enforced by the index                      |
| `plan_id`                                     | uuid not null → plans                 |
| `period`                                      | `billing_period` not null             | `monthly \| yearly`                                                        |
| `status`                                      | `subscription_status` not null        | §5.1                                                                       |
| `current_period_start` / `current_period_end` | timestamptz not null                  |                                                                            |
| `trial_ends_at`                               | timestamptz null                      |                                                                            |
| `cancel_at_period_end`                        | boolean not null default false        |
| `cancelled_at`                                | timestamptz null                      |
| `scheduled_plan_id` / `scheduled_period`      | uuid / enum null                      | a downgrade queued for period end (§5.5)                                   |
| `grace_ends_at`                               | timestamptz null                      | dunning window (§5.7)                                                      |
| `last_order_id`                               | uuid null → orders                    |
| `price_paisa_snapshot`                        | bigint not null                       | what this school actually pays — insulates them from a price change (§5.3) |
| `auto_renew`                                  | boolean not null default true         |
| `comp_reason`                                 | text null                             | set when platform staff grant a free upgrade                               |
| `created_at/updated_at`                       |                                       |                                                                            |

`workspaces.plan_id` remains the denormalised fast path used by RLS and nav (PRODUCT-DECISIONS 1.20); a trigger keeps it equal to `subscriptions.plan_id`, and a nightly job asserts they never diverge. Personal workspaces have **no** subscription row and are always treated as Free for limits that apply to them.

### 3.6 `subscription_events` _(new; proposed)_

Append-only: `id`, `subscription_id`, `workspace_id`, `event` (`trial_started | trial_ending_soon | trial_expired | activated | renewed | upgraded | downgrade_scheduled | downgraded | cancelled | reactivated | payment_failed | grace_started | lapsed | comped`), `from_plan_id`, `to_plan_id`, `order_id`, `actor_id`, `metadata jsonb`, `created_at`. No update or delete grants. This is the billing history a support conversation actually needs.

### 3.7 `invoices` _(new; proposed)_

| column                                                         | type                             | notes                                                      |
| -------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `id`                                                           | uuid pk                          |
| `workspace_id`                                                 | uuid not null                    |
| `invoice_no`                                                   | text unique not null             | `INV-2026-000318` — a **gapless** per-year sequence (§5.8) |
| `order_id`                                                     | uuid null → orders               | null for a ৳0 record                                       |
| `kind`                                                         | `invoice_kind` not null          | `subscription \| marketplace \| credit_pack \| adjustment` |
| `issued_at`                                                    | date not null                    |
| `due_at`                                                       | date null                        | v1 is pay-now, so equal to `issued_at`                     |
| `subtotal_paisa` / `vat_paisa` / `total_paisa`                 | bigint not null                  |
| `vat_rate_bps`                                                 | int not null default 0           |
| `currency`                                                     | char(3) not null default `'BDT'` |
| `status`                                                       | `invoice_status` not null        | `issued \| paid \| void \| credited`                       |
| `buyer_name` / `buyer_address` / `buyer_bin` / `buyer_vat_reg` | text null                        | snapshot from `billing_profiles` at issue                  |
| `seller_bin` / `seller_address`                                | text not null                    | Acadigma's, snapshot from `platform_settings`              |
| `file_id`                                                      | uuid null → files                | the rendered PDF (private)                                 |
| `credit_note_of`                                               | uuid null → invoices             | for refunds                                                |
| `created_at`                                                   |                                  |                                                            |

Indexes: unique `(invoice_no)`, `(workspace_id, issued_at desc)`, `(order_id)`.

### 3.8 `billing_profiles` _(new; proposed)_ — the school's own billing identity

`workspace_id pk`, `legal_name`, `address_line1/2`, `city`, `postcode`, `country default 'Bangladesh'`, `bin` (Business Identification Number), `vat_reg_no`, `contact_email`, `contact_phone`, `updated_by`, `updated_at`. Editable by owner/admin; snapshotted onto every invoice at issue so a later edit never rewrites history.

### 3.9 `usage_counters` _(new; proposed)_ — materialised, not counted on every request

`workspace_id`, `limit_key`, `current_value bigint`, `computed_at timestamptz`, pk `(workspace_id, limit_key)`. Maintained by triggers for cheap keys (`teachers`, `students`, `sections`) and by a 15-minute job for expensive ones (`storage_gb` from `sum(files.size_bytes)`). Enforcement reads this table; a hard check against the source table runs only at the moment a write would cross a limit (§5.6).

### 3.10 RLS policies — in words

**`plans`, `plan_limits`, `plan_modules`**: _select_ to `public` — the pricing page is public and must render signed-out. _insert/update/delete_: platform staff only. `is_public=false` rows are filtered by the marketing query, not by RLS (platform staff must still see them).

**`subscriptions`**: _select_ `app.has_role(workspace_id,'{owner,admin}')` or platform staff. _insert/update/delete_: denied to every role — subscriptions are written by server actions with the service role (activation, renewal, trial expiry) and by platform staff overrides. An owner "changing plan" is an order, not an update.

**`subscription_events`**: _select_ owner/admin of the workspace + platform staff. _insert_ service role. _update/delete_ denied to all.

**`invoices`**: _select_ `app.has_role(workspace_id,'{owner,admin}')` or platform staff. _insert/update/delete_: denied to all roles; issued by the invoicing service. **`invoice_no` is never reused and a paid invoice is never mutated** — corrections are credit notes.

**`billing_profiles`**: _select_ owner/admin + platform staff. _insert/update_: owner/admin, with `workspace_id` forced by `with check`. _delete_: denied.

**`usage_counters`**: _select_ owner/admin (their workspace) + platform staff. No client writes.

### 3.11 Files

Invoice and credit-note PDFs: **private** bucket, `invoices/<workspace_id>/<invoice_no>.pdf`, `files.visibility='private'`, 5-minute signed URLs via `/api/files/[id]` after the `invoices.select` check, logged.

---

## 4. Workflows

### 4.1 Trial start (school creation)

**Trigger:** a school workspace is created (F-AU-02 onboarding).

1. In the same transaction: insert `subscriptions` with `plan_id = Pro`, `period='monthly'`, `status='trialing'`, `trial_ends_at = now() + 14 days`, `current_period_start = now()`, `current_period_end = trial_ends_at`, `price_paisa_snapshot = Pro monthly price`, `auto_renew = false` (a trial with no card cannot auto-renew).
2. `workspaces.plan_id` = Pro by trigger. Full Pro limits and modules apply immediately.
3. `subscription_events`: `trial_started`. Email + in-app: _"You're on a 14-day Pro trial. No card needed."_
4. **No payment method is collected.** PRODUCT-DECISIONS 5.2.

### 4.2 Trial nudges and expiry

- **T−3 days** (daily job, 09:00 Asia/Dhaka): banner + email _"Your Pro trial ends in 3 days"_ with a usage summary showing which limits they are over on Free. `trial_ending_soon`.
- **T−0**: the job moves the subscription to `plan=Free`, `status='active'`, `current_period_end = null` (Free has no period), and recomputes limits. `trial_expired`.
- **Over-limit data is never deleted.** The workspace enters **read-only over-limit mode** for the affected resources (§5.6): existing students, teachers and files stay readable and exportable; creating more is blocked.
- A persistent, dismissible-per-session banner explains exactly what is limited and by how much: _"You have 340 students; Free includes 150. You can view and export everything, but you can't add students until you upgrade."_

### 4.3 Upgrade (self-serve)

1. `/app/billing/plans` (or the public `/pricing`) → plan cards with the current plan marked. Owner taps **Upgrade to Pro**.
2. A **change summary sheet** shows, before any payment: new plan, period, price, what changes today, the proration amount with its arithmetic spelled out (§5.4), and the new period end.
3. `createOrder({kind:'subscription', items:[{type:'plan', planId, period}], funding:'workspace'})` → F-CM-01 checkout. The order line's `gross_paisa` is the **prorated** amount for an in-period upgrade, or the full price for a new/lapsed subscription.
4. On capture, the subscription fulfilment handler runs inside the capture transaction: set `plan_id`, `period`, `status='active'`, `price_paisa_snapshot`, extend or keep `current_period_end` per §5.4, clear `grace_ends_at` and `scheduled_*`, bump `workspaces.plan_id`, recompute `usage_counters` limits, lift read-only mode.
5. Issue an invoice (§5.8), render the PDF, email it, notify the owner and admins. `subscription_events`: `upgraded` (or `activated`).
6. Audit: `subscription.changed` with from/to plan and the order id.

**Phone flow.** Plan cards are full-width, one per screen-and-a-bit, with the price large and the three most relevant limits listed; a horizontal _Compare all features_ link opens a table in a full page (a feature matrix does not belong in a bottom sheet at 360 px). The change summary is a sheet with a sticky **Pay ৳X** button.

### 4.4 Downgrade and cancellation

- **Downgrade** (Pro → Starter, or yearly → monthly): **no refund, no immediate change** (§5.5). `scheduled_plan_id`/`scheduled_period` are set, the UI shows _"Changing to Starter on 1 July"_, and a job applies it at `current_period_end`. Before scheduling, a sheet lists what they will lose and any limit they will then exceed: _"You'll be over the student limit by 190. Those students stay, but you won't be able to add more."_
- **Cancel**: `cancel_at_period_end = true`; access continues to `current_period_end`; then the workspace becomes Free with read-only over-limit mode. Reactivating before period end just clears the flag with no charge.
- **Undo** is available for both until the period ends, one tap.
- `subscription_events`: `downgrade_scheduled`, `downgraded`, `cancelled`, `reactivated`.

### 4.5 Renewal and dunning

There is **no stored card** — SSLCommerz hosted checkout in v1 does not give us a reusable token we are willing to rely on. So renewal is **invoice-and-pay**, not auto-charge:

1. **T−7 days** before `current_period_end` (daily job): email + banner _"Your Pro plan renews on 1 July — ৳7,999"_ with a **Renew now** button that creates the renewal order.
2. **T−1 day**: reminder.
3. **T+0**, unpaid: `status='past_due'`, `grace_ends_at = now() + 7 days`. All features stay on during grace. Banner: _"Payment due — 7 days to renew before your school moves to Free."_ `payment_failed` / `grace_started`.
4. **Daily during grace**: one email at T+1, T+3, T+6. Never more than one a day.
5. **Grace end**: `status='lapsed'`, plan → Free, read-only over-limit mode, `lapsed` event, a final email explaining that nothing was deleted.
6. Paying at any point during grace or after lapse reactivates immediately from the payment date (a lapsed school does not pay for the gap).

`auto_renew` exists on the schema and is shown as an _"Auto-renew"_ toggle only when a future provider supports tokenised recurring charges; in v1 the UI shows _"Renewal reminders"_ instead of a toggle that does nothing — the prototype's dead auto-billing switch is not recreated.

### 4.6 Limit enforcement at the point of the write

Every guarded mutation calls one function before it writes:

```ts
await assertWithinLimit(ctx, "students", { adding: 1 }) // throws LIMIT_EXCEEDED with a structured payload
```

The payload carries `{limitKey, limit, current, planCode, suggestedPlanCode}` so the UI can render a specific message and a direct upgrade link, not a generic error. Guarded keys and their write sites:

| limit_key            | blocked action                                                      | where                                                      |
| -------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `teachers`           | accepting/creating a membership with role `teacher`/`admin`/`staff` | F-AU-02                                                    |
| `students`           | admitting a student, importing a roster                             | F-AC-0x                                                    |
| `storage_gb`         | any file upload                                                     | F-OP-0x                                                    |
| `ai_credits_daily`   | any AI action                                                       | F-TE-0x (its own ledger; this feature supplies the number) |
| `sections`           | creating a section                                                  | F-AC-0x                                                    |
| `print_jobs_monthly` | queueing a print job                                                | F-OP-0x                                                    |

Module gating is separate: `hasModule(ctx,'hiring')` decides nav visibility **and** returns 404 from the route, so a deep link to a module you do not pay for is not a 403 that confirms it exists.

### 4.7 Platform staff operations

`/platform/plans`: edit names, prices (monthly and yearly independently), limits per key, modules per plan, publish/archive. Changing a price shows _"N schools are on this plan; their price is snapshotted and will not change"_ (§5.3) and requires a confirm.
`/platform/workspaces/[id]/billing`: see the subscription, events, invoices, usage; extend a trial; grant a comp plan with a required reason; force a plan change; void an invoice and issue a credit note. Every one writes `subscription_events` and `audit_events`.

---

## 5. Business rules and calculations

### 5.1 `subscriptions.status` state machine

```
trialing ──(pay)──► active ──(period end, unpaid)──► past_due ──(grace end)──► lapsed
    │                 │  ▲                                │                      │
    │                 │  └────────────(pay)───────────────┴──────────────────────┘
    └──(trial end, unpaid)──► lapsed*        (*plan becomes Free; see §5.6)
active ──(cancel)──► active with cancel_at_period_end ──(period end)──► lapsed
```

`lapsed` always means **plan = Free**, never "no access". There is no state in which a school loses their data.

### 5.2 Prices

- Yearly is seeded at `10 × monthly` (PRODUCT-DECISIONS 5.1) but **stored independently** in `price_yearly_paisa`, so the owner can break the ratio without a code change. A seed test asserts the 10× relationship at v1 and will fail loudly if the owner changes it — at which point the test is updated, deliberately.
- All prices are whole taka (`price_paisa % 100 = 0`, check constraint).
- Every priced plan must satisfy `price_paisa >= 1000` (the SSLCommerz ৳10.00 minimum, F-CM-01 §5.8) — trivially true, but constrained.
- Yearly Enterprise would breach the ৳500,000 gateway ceiling only above ৳500k; `is_contact_only` keeps it off self-serve anyway.

### 5.3 Price snapshotting (grandfathering)

`subscriptions.price_paisa_snapshot` is what the school pays at every renewal. A platform price change applies to **new** subscriptions and to any school that changes plan or period. A school is told their price at renewal in the reminder email. Platform staff can re-snapshot a school to the current price with a reason (`subscription_events.metadata`), which is the only way an existing school's price changes.

### 5.4 Proration on upgrade (exact)

Definitions, all in the workspace timezone (`school_profiles.timezone`, default Asia/Dhaka):

```
cycle_days     = date_part('day', current_period_end - current_period_start)      -- 30, 31, 365…
elapsed_days   = date_part('day', now() - current_period_start)
remaining_days = greatest(cycle_days - elapsed_days, 0)
old_price      = subscriptions.price_paisa_snapshot          -- what they are actually paying
new_price      = target plan's price for the target period
```

**Upgrade within a period (same period length):**

```
unused_credit_paisa = floor(old_price * remaining_days / cycle_days)
new_charge_paisa    = ceil (new_price * remaining_days / cycle_days)
amount_due_paisa    = max(new_charge_paisa - unused_credit_paisa, 0)
```

`current_period_end` is **unchanged**; `price_paisa_snapshot` becomes `new_price`, so the next renewal is the full new price.

Worked example. Pro ৳7,999 from Starter ৳2,999, monthly, 30-day cycle, 12 days elapsed → `remaining = 18`.

```
unused_credit = floor(299900 * 18 / 30) = floor(179940)  = 179940   (৳1,799.40)
new_charge    = ceil (799900 * 18 / 30) = ceil (479940)  = 479940   (৳4,799.40)
amount_due    = 479940 - 179940 = 300000                            (৳3,000.00)
```

The sheet shows exactly those four lines, in taka, before the owner pays. **Floor the credit, ceil the charge** — the platform never loses a paisa to rounding, and the discrepancy is at most ৳0.01.

**Monthly → yearly upgrade:** the unused monthly credit is computed as above and deducted from the full yearly price; `current_period_end = now() + 1 year`.

```
amount_due_paisa = max(price_yearly_paisa - unused_credit_paisa, 0)
```

**Upgrade while `trialing`:** no credit (they have paid nothing). `amount_due = new_price` for a full period, `current_period_end = now() + period`, trial ends immediately. The days they had left on the trial are not lost value — the trial was free.

**Upgrade while `past_due` or `lapsed`:** no credit; full price; new period starts at payment.

**Amounts are computed on the server inside the order transaction** and the sheet's displayed numbers are a _preview_ returned by `previewPlanChange`, re-computed (and re-checked) at `createOrder`. If the preview is more than 5 minutes old or the numbers differ, the order is refused with `PRORATION_STALE` and the sheet reloads — no client-supplied amount is ever trusted (F-CM-01 §5.1).

### 5.5 Downgrade (no proration, no refund)

Downgrades and period shortenings take effect at `current_period_end`. No credit is issued and no money is returned. Stated in the confirm sheet in one sentence: _"You keep Pro until 1 July. No refund is given for the remaining days."_ This is the standard SaaS rule and it removes an entire class of refund arithmetic.

A scheduled downgrade is cancellable until it applies.

### 5.6 Read-only over-limit mode (exact semantics)

When `current_value > limit` for a key, the workspace is **over-limit on that key only**. Rules:

- **Read: always allowed.** Every existing row stays visible to whoever could see it before.
- **Export: always allowed** (CSV/PDF), specifically so a school that stops paying can leave with its data.
- **Update of an existing row: allowed.** Editing a student's phone number does not make the overage worse.
- **Create that increases the counter: blocked** with `LIMIT_EXCEEDED`.
- **Delete: allowed**, and it reduces the counter — a school can come back under a limit by cleaning up.
- **Storage:** uploads blocked; downloads and deletes allowed.
- **AI credits:** the daily grant becomes the new plan's number from the next reset; the current day's remaining balance is not clawed back.
- **Modules removed by the downgrade:** their routes return 404 and their nav entries disappear; the **data is untouched** and returns intact on re-upgrade.
- Nothing is ever deleted, archived, or hidden by a plan change. A pgTAP + integration test asserts row counts are identical before and after a downgrade.

The banner text is generated from the structured `LIMIT_EXCEEDED` payload, so it always names the real number.

### 5.7 Dunning schedule

`T−7` reminder · `T−1` reminder · `T+0` past_due, grace 7 days · emails at `T+1`, `T+3`, `T+6` · `T+7` lapsed. At most one dunning email per workspace per day, enforced by a check against `email_log`. All times 09:00 in the workspace timezone.

### 5.8 Invoice numbering and VAT

- `invoice_no = 'INV-' || year || '-' || lpad(seq::text, 6, '0')`, from `app.next_document_no(workspace_id, 'invoice')` — a **gapless** per-year series held in the shared `document_counters` table (F-CM-01 §5.8a, per **D-31 (8)**), taking a row lock inside the issuing transaction. Not a Postgres `sequence`, because sequences gap on rollback and a gap in an invoice series is an audit problem in Bangladesh.
- A **paid invoice is immutable.** Corrections are `credit_note` invoices referencing the original via `credit_note_of`, with negative amounts and their own number.
- VAT: `vat_paisa = floor(subtotal_paisa * vat_rate_bps / 10000)`, with `vat_rate_bps` from `platform_settings` (default `0`). At 0 % the PDF still prints a VAT row and Acadigma's BIN, because that is what an accountant looks for. When the owner registers for VAT, one settings change makes every future invoice correct.
- The PDF carries: Acadigma legal name, address, BIN; the school's `billing_profiles` snapshot including their BIN and VAT registration; invoice no; issue date; period covered; line items; subtotal; VAT; total in figures **and in words** (a Bangladeshi invoice convention: _"Taka Seven Thousand Nine Hundred Ninety Nine Only"_); payment reference (`bank_tran_id`); and _"This is a computer-generated invoice."_
- Amount-in-words is implemented in `packages/domain/money.ts` with a test covering 0, 1, 19, 100, 1,00,000 and the **lakh/crore** grouping used in Bangladesh (`৳12,34,567` not `৳1,234,567`) — `formatBDT` uses the `en-IN`-style grouping for BDT.

### 5.9 One subscription per workspace, schools only

- The unique index on `subscriptions.workspace_id` is the guarantee. There is no seat-band model, no second table, and no `SchoolSettings.subscription_plan` — the prototype's two competing models collapse into this one.
- **Personal workspaces have no subscription.** They are Free for anything plan-gated, they may buy marketplace items and credit packs (PRODUCT-DECISIONS 5.5), and the billing UI for them shows purchases and credit packs only.

### 5.10 Comps and trial extensions

Platform staff may set `comp_reason` and a plan/period with no order. Such a subscription has `price_paisa_snapshot = 0` and does not enter dunning. Trial extension sets `trial_ends_at` forward and writes an event. Both require a reason and are audited.

---

## 6. UI

| Route                                   | Who         | 360×800                                                                                                   | ≥1024                                       | Primary action               | Empty                         | Loading                  | Error                |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------- | ----------------------------- | ------------------------ | -------------------- |
| `/pricing` (public)                     | anyone      | One plan card per screen in a vertical stack, current plan marked when signed in, _Compare features_ link | 4 cards in a row + full feature table below | Start free / Upgrade         | n/a                           | Static (server-rendered) | Static fallback copy |
| `/app/billing`                          | owner/admin | Plan card + usage meters + next renewal + invoice list preview                                            | Two-column overview                         | Upgrade                      | n/a                           | Skeleton meters          | Retry                |
| `/app/billing/plans`                    | owner       | Plan cards, change summary sheet                                                                          | Cards + comparison table                    | Upgrade / Schedule downgrade | n/a                           | Skeleton                 | Alert                |
| `/app/billing/invoices`                 | owner/admin | Invoice cards: no, date, total, status, download                                                          | Table                                       | Download                     | _"No invoices yet"_           | Skeleton                 | Retry                |
| `/app/billing/details`                  | owner/admin | Form sheet: legal name, address, BIN, VAT reg                                                             | Two-column form                             | Save                         | Prefilled from school profile | Skeleton                 | Inline               |
| `/app/settings/*` (any limited surface) | all         | Over-limit banner with the real numbers + Upgrade                                                         | Same, inline                                | Upgrade                      | n/a                           | —                        | —                    |
| `/platform/plans`                       | staff       | Plan list → edit sheet with limit rows                                                                    | Table + editor panel                        | Save plan                    | n/a                           | Skeleton                 | Alert                |
| `/platform/workspaces/[id]/billing`     | staff       | Subscription card, events timeline, invoices, override sheet                                              | 3-panel                                     | Override                     | n/a                           | Skeleton                 | Alert                |

Components: `AppShell`, `PlanCard`, `UsageMeter`, `LimitBanner`, `ChangeSummarySheet`, `MoneyText`, `DataList`, `FormSheet`, `Timeline`, `StatusChip`, `EmptyState`.

**Phone specifics.** Usage meters are horizontal bars with `label · 340 / 150` text (never colour alone; over-limit gets a pattern fill plus an icon). The change summary sheet is scrollable with the four proration lines as a small table and a sticky pay button. The trial countdown lives in the top bar as a compact chip (`Pro trial · 6d`) that opens the billing page — it must not eat vertical space on every screen.

---

## 7. Server contracts

| Name                                            | Kind                                    | Input                                                                       | Output                                                                                                                                                                                   | Errors                                                                     | Idempotency | Rate limit        |
| ----------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------- | ----------------- |
| `listPublicPlans`                               | RSC query                               | —                                                                           | `{plans[] with limits and modules}`                                                                                                                                                      | —                                                                          | n/a         | cached 300 s      |
| `getSubscription`                               | RSC query                               | ctx                                                                         | `{plan, status, periodEnd, trialEndsAt, scheduled, priceSnapshot, graceEndsAt}`                                                                                                          | —                                                                          | n/a         | 60/min            |
| `getUsage`                                      | RSC query                               | ctx                                                                         | `{[limitKey]: {current, limit, overBy}}`                                                                                                                                                 | —                                                                          | n/a         | 60/min            |
| `previewPlanChange`                             | action                                  | `{planId, period}`                                                          | `{kind:'upgrade'\|'downgrade'\|'new', amountDuePaisa, unusedCreditPaisa, newChargePaisa, remainingDays, cycleDays, effectiveAt, newPeriodEnd, losses[], previewToken, previewExpiresAt}` | `PLAN_NOT_AVAILABLE`, `CONTACT_ONLY_PLAN`                                  | n/a         | 30/min/user       |
| `changePlan`                                    | action                                  | `{planId, period, previewToken, idempotencyKey}`                            | `{orderId?, scheduled?}`                                                                                                                                                                 | `PRORATION_STALE`, `NOT_OWNER`, `DOWNGRADE_SCHEDULED`, `CONTACT_ONLY_PLAN` | key         | 10/hour/workspace |
| `cancelSubscription` / `reactivateSubscription` | actions                                 | `{reason?}`                                                                 | `{cancelAtPeriodEnd}`                                                                                                                                                                    | `NOT_OWNER`                                                                | key         | 10/hour/workspace |
| `cancelScheduledChange`                         | action                                  | —                                                                           | `{ok}`                                                                                                                                                                                   | `NOTHING_SCHEDULED`                                                        | key         | 10/hour           |
| `updateBillingProfile`                          | action                                  | `BillingProfileInput`                                                       | `{ok}`                                                                                                                                                                                   | `VALIDATION`                                                               | key         | 20/hour           |
| `listInvoices`                                  | RSC query                               | `{cursor?}`                                                                 | `{items[], nextCursor}`                                                                                                                                                                  | —                                                                          | n/a         | 60/min            |
| `renderInvoice`                                 | route `GET /api/pdf/invoice?invoiceId=` | id                                                                          | PDF (from `files` if already rendered)                                                                                                                                                   | `FORBIDDEN`, `NOT_FOUND`                                                   | cached      | 20/min            |
| `assertWithinLimit`                             | domain fn (server-only)                 | `{limitKey, adding}`                                                        | void \| throws `LIMIT_EXCEEDED{limitKey, limit, current, planCode, suggestedPlanCode}`                                                                                                   | —                                                                          | n/a         | —                 |
| `runSubscriptionJobs`                           | route `POST /api/cron/billing/tick`     | —                                                                           | `{trialsExpired, remindersSent, pastDue, lapsed, downgradesApplied}`                                                                                                                     | `FORBIDDEN`                                                                | run key     | daily 09:00       |
| `upsertPlan` / `setPlanLimit` / `setPlanModule` | actions                                 | platform inputs                                                             | `{planId}`                                                                                                                                                                               | `FORBIDDEN`, `PRICE_INVALID`                                               | key         | 50/day/staff      |
| `overrideSubscription`                          | action                                  | `{workspaceId, planId?, period?, trialEndsAt?, compReason, idempotencyKey}` | `{status}`                                                                                                                                                                               | `FORBIDDEN`, `REASON_REQUIRED`                                             | key         | 50/day/staff      |

`previewToken` is an HMAC over `{workspaceId, planId, period, amountDuePaisa, issuedAt}` with a 5-minute lifetime; `changePlan` verifies it and recomputes, so the displayed number and the charged number are provably the same or the order is refused.

---

## 8. Parts (build chunks)

> **Ordering note.** Parts 1–3 are needed by _every other area_ (limits gate students, files, AI). They should ship in the platform foundation chunk, ahead of the rest of commerce. Parts 4–8 depend on F-CM-01 and follow it.

**Part 1 — `plans`, `plan_limits`, `plan_modules` + seed + `/platform/plans`** _(2 days)_
Scope: migrations, public-read RLS, the seeded matrix from §3.4, the platform editor with price/limit/module rows, the seed-matches-doc test.
Tests: public anonymous read works; non-staff writes denied; the yearly = 10× monthly assertion; enum/keys parity with `packages/contracts`.
**Demo:** change the Pro student limit in `/platform` and see it reflected in the app without a deploy.

**Part 2 — `subscriptions` + trial on school creation + `workspaces.plan_id` sync** _(1.5 days)_
Scope: table, RLS, unique index, the onboarding hook creating the 14-day Pro trial, the sync trigger and its nightly assertion, `subscription_events`, `/app/billing` overview reading real values.
Tests: pgTAP isolation; one subscription per workspace enforced; trial dates correct in Asia/Dhaka; a personal workspace gets no subscription.
**Demo:** create a school and see _"Pro trial — 14 days left"_ with real Pro limits.

**Part 3 — Limits engine + usage counters + read-only over-limit mode** _(2 days)_
Scope: `usage_counters` with triggers and the 15-minute storage job, `assertWithinLimit` with the structured error, `hasModule` + 404 routing, `LimitBanner` and `UsageMeter`, the six guarded write sites wired.
Tests: each guarded action blocked at the boundary (`limit`, `limit+1`); reads/updates/deletes/exports still allowed while over; a downgrade deletes nothing (row-count assertion); `-1` means unlimited.
**Demo:** downgrade a seeded school from Pro to Free and show all 340 students still visible and exportable while adding the 341st is blocked with a specific message.

**Part 4 — Trial expiry, reminders and the daily billing tick** _(1 day)_
Scope: `/api/cron/billing/tick`, T−3 nudge, expiry to Free, scheduled-downgrade application, one-email-per-day guard, banners.
Tests: job idempotency (running twice in a day sends one email); timezone correctness; expiry applies read-only mode.
**Demo:** fast-forward a seeded trial and watch the nudge, then the expiry, land correctly.

**Part 5 — Plan change: preview, proration, checkout, activation** _(2 days)_
Scope: `previewPlanChange` with the exact §5.4 arithmetic, `previewToken` HMAC, `changePlan` → `createOrder(kind:'subscription')`, the subscription fulfilment handler on capture, `/app/billing/plans` cards and the change summary sheet, scheduled downgrade and cancel/reactivate/undo.
Tests: proration unit tests including the worked example, day-0 and last-day edges, trial upgrade, lapsed upgrade, monthly→yearly; `PRORATION_STALE`; downgrade issues no refund; capture activates exactly once on a replayed IPN.
**Demo:** upgrade Starter→Pro mid-month on a phone, paying exactly ৳3,000 for a 30-day cycle with 18 days left.

**Part 6 — Invoices: numbering, PDF, list, billing profile** _(2 days)_
Scope: `invoices`, gapless numbering via the shared `document_counters` / `app.next_document_no()` (F-CM-01 §5.8a), `billing_profiles` + form, React-PDF invoice with BIN/VAT and amount-in-words, credit notes, `/app/billing/invoices`, email on issue.
Tests: gapless numbering under concurrency and rollback; amount-in-words across the lakh/crore boundaries; a paid invoice cannot be mutated; another workspace's invoice is 403.
**Demo:** download a ৳7,999 invoice showing both BINs, a 0 % VAT line, and _"Taka Seven Thousand Nine Hundred Ninety Nine Only"_.

**Part 7 — Renewal and dunning** _(1.5 days)_
Scope: renewal reminders, `past_due` + 7-day grace, the dunning email cadence, `lapsed` transition, pay-anytime reactivation, banners for each state.
Tests: the full T−7…T+7 timeline on a fast-forwarded clock; at most one email per day; paying in grace clears everything; paying after lapse starts a fresh period from the payment date.
**Demo:** walk a seeded school through the whole dunning ladder in one test run.

**Part 8 — Platform overrides and billing support view** _(1 day)_
Scope: `/platform/workspaces/[id]/billing`, comp plans, trial extension, forced plan change, void + credit note, the events timeline.
Tests: every override requires a reason and writes an event + audit row; a comped subscription never enters dunning.
**Demo:** extend a school's trial by 7 days and see the event, the audit row, and the new banner.

---

## 9. Acceptance criteria

1. **Given** a new school workspace **when** it is created **then** a `subscriptions` row exists with plan Pro, `status='trialing'`, `trial_ends_at = created_at + 14 days`, and the school immediately has Pro limits and modules — with no card collected.
2. **Given** a trial with 3 days left **when** the daily tick runs **then** exactly one email and one in-app banner are produced, naming the limits the school would exceed on Free.
3. **Given** a trial that expires **when** the tick runs **then** the plan becomes Free, `subscription_events` records `trial_expired`, and a row-count comparison before and after shows **zero** rows deleted in any table.
4. **Given** a Free school with 340 students **when** an admin opens the student list **then** all 340 are visible and exportable; **when** they tap _Add student_ **then** it is blocked with _"You have 340 students; Free includes 150."_ and an Upgrade link.
5. **Given** the same school **when** they edit an existing student or delete one **then** it succeeds, and deleting reduces the counter.
6. **Given** a Free school **when** a member deep-links to `/app/hiring` **then** the route returns 404, not 403.
7. **Given** a Starter school on day 12 of a 30-day cycle **when** the owner previews an upgrade to Pro **then** the sheet shows unused credit ৳1,799.40, new charge ৳4,799.40, amount due ৳3,000.00, and the unchanged period end.
8. **Given** that preview **when** the owner pays **then** the order total is exactly ৳3,000.00, computed server-side, and a tampered client value is ignored.
9. **Given** a preview older than 5 minutes **when** `changePlan` is called with its token **then** it fails with `PRORATION_STALE` and the sheet reloads with fresh numbers.
10. **Given** an upgrade payment is captured **when** the handler runs **then** the plan, `price_paisa_snapshot` and limits update once, read-only mode lifts, an invoice is issued, and a replayed IPN changes nothing further.
11. **Given** a Pro school **when** the owner schedules a downgrade to Starter **then** nothing changes today, the UI shows the effective date, no refund is issued, and the change applies on the period end; cancelling the schedule before then restores Pro silently.
12. **Given** a subscription reaching its period end unpaid **when** the tick runs **then** `status='past_due'` with a 7-day grace, features stay on, and one email is sent per scheduled day and no more.
13. **Given** grace expires **when** the tick runs **then** `status='lapsed'`, plan Free, read-only over-limit mode, and a final email stating that nothing was deleted.
14. **Given** a lapsed school pays **when** the capture lands **then** a fresh period starts from the payment date and no charge is made for the lapsed gap.
15. **Given** an invoice is issued **then** `invoice_no` continues the year's sequence with **no gap**, even if a concurrent transaction rolled back; **and** the PDF shows Acadigma's BIN, the school's BIN from `billing_profiles`, a VAT line at the configured rate, and the total in words.
16. **Given** a paid invoice **when** anyone attempts to modify it **then** it is refused; a correction is issued as a credit note referencing it.
17. **Given** platform staff change the Pro price **when** an existing Pro school renews **then** they are charged their snapshotted price, and a new school is charged the new price.
18. **Given** an admin (not owner) **when** they open `/app/billing/plans` **then** the Upgrade actions are absent and a direct `changePlan` call returns `NOT_OWNER`.
19. **Given** a school owner and another school's subscription/invoice ids **when** they query them **then** RLS returns zero rows.
20. **Given** `/app/billing` at 360×800 **then** the plan card, usage meters and renewal date are readable without horizontal scroll, over-limit state is conveyed by text and icon as well as colour, and axe reports no serious violations.

---

## 10. Tests

- **Unit (domain):** proration across upgrade/downgrade/trial/lapsed/monthly→yearly and both boundary days; limit evaluation including `-1`; amount-in-words with lakh/crore; BDT grouping; dunning schedule generator; subscription transition table.
- **DB (pgTAP):** isolation and escalation on `subscriptions`, `invoices`, `billing_profiles`, `subscription_events`, `usage_counters`; insert/update denial on `subscriptions` and `invoices` for every role; the unique `workspace_id`; gapless invoice numbering under a concurrent rollback; public read on `plans` as anonymous.
- **Integration:** trial → expiry → over-limit → upgrade → invoice, end to end; downgrade schedule and application; dunning timeline on a controlled clock; plan-price change grandfathering; the six guarded write sites.
- **e2e (360×800 and 1280×800):** owner upgrades and pays in sandbox and downloads the invoice; admin is correctly barred from changing the plan; over-limit banner and blocked create; axe on all billing screens.
- **Security:** cross-workspace invoice and subscription IDOR; `renderInvoice` for another workspace 403; a forged `previewToken` rejected; a tampered `amountDuePaisa` ignored.
- **Data-safety (the one that matters most):** a snapshot of every tenant table's row count before a downgrade, compared after — must be identical. Run for Pro→Free, Pro→Starter, and trial expiry.
- **Performance:** `getUsage` p95 < 120 ms (reads `usage_counters`, never `count(*)`); `/app/billing` p95 < 400 ms; invoice render p95 < 2 s.

---

## 11. Open questions

1. **Recurring charges.** SSLCommerz does offer tokenised/recurring products, but the v4 hosted-checkout flow researched here does not give us a card token we control. _Default assumed:_ invoice-and-pay renewal with reminders, as specified. If the owner obtains a recurring-billing agreement with SSLCommerz, `auto_renew` becomes real and dunning shifts from "unpaid invoice" to "failed charge" — a change in Part 7 only.
2. **VAT rate and registration.** _Default assumed:_ `vat_rate_bps = 0` with the BIN printed. The owner must confirm Acadigma's VAT status before the first live invoice; until then the 0 % line is honest, not decorative.
3. **Enterprise flow.** _Default assumed:_ `is_contact_only` → a contact form and a platform-staff comp/override with a manually agreed price. No self-serve Enterprise checkout.
4. **Seat-based pricing.** The prototype had per-teacher bands. _Default assumed:_ dropped entirely in favour of flat tiers with teacher **limits**. If the owner wants seats back, it is a new `plan.pricing_model` and a quantity on the order line.
5. **Do personal workspaces ever get a paid plan?** _Default assumed:_ no in v1 (PRODUCT-DECISIONS 5.5).
6. **Proration when the owner upgrades on the final day of a cycle.** `remaining_days = 0` → `amount_due = 0` and the plan changes free for zero days, then renews at the new price. _Default assumed:_ acceptable; guarded by a test so it is a decision rather than a surprise.
7. **Partial-month refunds on cancellation.** _Default assumed:_ none, ever (§5.5).
