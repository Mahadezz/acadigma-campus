# F-CM-05 — Seller earnings, holds, adjustments and monthly payouts

|                  |                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Area             | market                                                                                                                       |
| Status           | planned                                                                                                                      |
| Owner branch     | `feat/commerce-earnings-payouts`                                                                                             |
| Depends on       | F-CM-01 (payments, refunds), F-CM-02 (seller profiles, payout methods), F-CM-04 (entitlement grant = the sale event)         |
| Plan             | `docs/plan/ROADMAP.md` chunk — commerce, fifth                                                                               |
| Base44 reference | `docs/reference/base44-inventory/04-commerce-billing.md` §3.2, §3.4, §5 rows 16, 17, 21, 22, 23, §7-A2, §7-A3, §7-A4, §7-E46 |

> **Schema note.** Tables and columns are **proposed; `docs/architecture/DATA-MODEL.md` wins**.

---

## 1. Purpose

Turn validated sales into money a seller actually receives. Each paid marketplace line creates a `seller_earnings` row with amounts snapshotted at the sale; a 7-day hold releases it to `available`; on the 1st of each month every seller with ≥ ৳1,000 available is put into a payout run that platform staff execute manually over bank/bKash/Nagad and mark paid with a transfer reference; refunds reverse or claw back. The seller sees one honest ledger and can download a monthly statement PDF.

**What Base44 had:** two competing earning-creation paths at two different commission rates (30 % in `ListingDetail`, an admin-typed 0–50 % in `CommissionEngine`) writing the same `commission_rate` column in **two different units** (`0.30` and `15`). `SellerEarnings.status` had a `pending_payout | paid | on_hold` enum that **nothing ever moved off `pending_payout`** — no code anywhere set `paid`, and `MarketplaceTransaction.payout_processed` stayed `false` forever. The "Process N Payouts" button inserted rows and reported _"N payouts processed successfully"_: row insertion mislabelled as money movement. There was no payout destination stored at all (the wizard collected bank/bKash details and discarded them), no schedule, no minimum, no hold, no statement, and no refund clawback. Two seller-facing components hardcoded `* 0.7`, so they would silently lie the day the rate changed. `processed_at` was set by one path and not the other, so organic sales vanished from the revenue chart.

**Done looks like:** a seller opens `/sell/earnings` on her phone and sees _Available ৳3,240 · On hold ৳860 · Paid to date ৳21,500_, with each line tied to a listing, an order and a date; on 1 June she gets a notification that ৳3,240 is queued; on 3 June the status reads _Paid · bKash · ref BK-2406-0034_; and her May statement PDF reconciles to the taka.

---

## 2. Roles and permissions

| Action                                   | Permission key          | seller (own) | school roles | platform staff |
| ---------------------------------------- | ----------------------- | ------------ | ------------ | -------------- |
| View own earnings ledger                 | `earnings.read.own`     | ✔            | —            | ✔              |
| View own payouts + statements            | `payouts.read.own`      | ✔            | —            | ✔              |
| Download own statement PDF               | `payouts.statement.own` | ✔            | —            | ✔              |
| Generate a payout run                    | `payouts.run.generate`  | —            | —            | ✔              |
| Mark a payout paid / failed              | `payouts.mark`          | —            | —            | ✔              |
| Create a manual adjustment               | `earnings.adjust`       | —            | —            | ✔              |
| Freeze a seller's payouts                | `payouts.freeze`        | —            | —            | ✔              |
| View platform earnings/commission totals | `platform.finance.read` | —            | —            | ✔              |

A school admin has **no** visibility of a member's selling income. Nothing in this feature is workspace-scoped.

---

## 3. Data

Seller-scoped, not tenant-scoped (same exception as F-CM-02 §3). Key is `seller_user_id`.

### 3.1 `seller_earnings` _(new; proposed)_ — one row per paid marketplace order line

| column                            | type                                        | notes                                                            |
| --------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| `id`                              | uuid pk                                     |
| `seller_user_id`                  | uuid not null → profiles                    |
| `seller_profile_id`               | uuid not null → seller_profiles             |
| `order_id`                        | uuid not null → orders                      |
| `order_line_id`                   | uuid not null **unique** → order_lines      | one earning per line, structurally                               |
| `listing_id`                      | uuid not null → listings                    |
| `listing_title_snapshot`          | text not null                               | so a deleted/renamed listing still reads correctly in the ledger |
| `gross_paisa`                     | bigint not null                             | = `order_lines.gross_paisa`                                      |
| `commission_bps`                  | int not null                                | snapshot from the line                                           |
| `commission_paisa`                | bigint not null                             | snapshot from the line                                           |
| `net_paisa`                       | bigint not null                             | snapshot from the line's `seller_paisa`                          |
| `currency`                        | char(3) not null default `'BDT'`            |
| `status`                          | `earning_status` not null default `pending` | §5.1                                                             |
| `hold_until`                      | timestamptz not null                        | `paid_at + interval '7 days'` (§5.2)                             |
| `available_at`                    | timestamptz null                            | when the hold released                                           |
| `payout_id`                       | uuid null → payouts                         | set when included in a run                                       |
| `reversed_at` / `reversal_reason` | timestamptz / text null                     | refund before payout                                             |
| `sale_at`                         | timestamptz not null                        | = `orders.paid_at` (this is the date every report buckets by)    |
| `created_at/updated_at`           |                                             |                                                                  |

Indexes: unique `(order_line_id)`, `(seller_user_id, status, sale_at desc)`, `(status, hold_until) where status='pending'` (the release job), `(payout_id)`, `(sale_at)`.

**`processed_at` does not exist.** Every report buckets by `sale_at`, which is always set, because the prototype's charts silently dropped rows whose `processed_at` was null.

### 3.2 `seller_adjustments` _(new; proposed)_ — everything that is not a sale

| column                  | type                                        | notes                                                                                                                        |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | uuid pk                                     |
| `seller_user_id`        | uuid not null                               |
| `kind`                  | `adjustment_kind` not null                  | `refund_clawback \| chargeback \| correction_debit \| correction_credit \| bonus \| payout_fee \| transfer_failure_reversal` |
| `amount_paisa`          | bigint not null                             | **signed**: negative reduces what we owe the seller, positive increases it                                                   |
| `currency`              | char(3) not null default `'BDT'`            |
| `related_earning_id`    | uuid null → seller_earnings                 |
| `related_refund_id`     | uuid null → refunds                         |
| `related_payout_id`     | uuid null → payouts                         |
| `reason_note`           | text not null                               | required, ≥ 10 chars, shown to the seller verbatim                                                                           |
| `status`                | `adjustment_status` not null default `open` | `open \| settled` — `settled` when applied to a payout                                                                       |
| `payout_id`             | uuid null → payouts                         | the run that absorbed it                                                                                                     |
| `created_by`            | uuid not null → profiles                    | platform staff or `system` for automatic clawbacks                                                                           |
| `created_at/updated_at` |                                             |                                                                                                                              |

Indexes: `(seller_user_id, status)`, `(payout_id)`, `(related_refund_id)`.

Signed amounts in one table (rather than debit/credit tables) keeps the balance formula a single `SUM` — see §5.3.

### 3.3 `payouts` _(new; proposed)_ — one row per seller per run

| column                       | type                                      | notes                                                   |
| ---------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| `id`                         | uuid pk                                   |
| `payout_run_id`              | uuid not null → payout_runs               |
| `seller_user_id`             | uuid not null                             |
| `payout_method_id`           | uuid not null → seller_payout_methods     | snapshotted at generation                               |
| `method_type_snapshot`       | `payout_method_type` not null             | `bank\|bkash\|nagad` at the time                        |
| `account_ref_last4_snapshot` | text not null                             | display only                                            |
| `account_name_snapshot`      | text not null                             |
| `earnings_paisa`             | bigint not null                           | Σ of included earnings' `net_paisa`                     |
| `adjustments_paisa`          | bigint not null                           | Σ of included adjustments (signed)                      |
| `amount_paisa`               | bigint not null                           | `earnings_paisa + adjustments_paisa`, always ≥ 0 (§5.4) |
| `currency`                   | char(3) not null default `'BDT'`          |
| `status`                     | `payout_status` not null default `queued` | §5.1                                                    |
| `transfer_reference`         | text null                                 | bank/bKash/Nagad reference — **required** to mark paid  |
| `transfer_note`              | text null                                 |
| `paid_at` / `failed_at`      | timestamptz null                          |
| `failure_reason`             | text null                                 |
| `statement_file_id`          | uuid null → files                         | the statement PDF for this payout's period              |
| `marked_by`                  | uuid null → profiles                      | which staff member marked it                            |
| `created_at/updated_at`      |                                           |                                                         |

Indexes: `(payout_run_id, status)`, `(seller_user_id, created_at desc)`, unique `(payout_run_id, seller_user_id)`.

### 3.4 `payout_runs` _(new; proposed)_

`id`, `period_start date`, `period_end date` (the month being paid), `cutoff_at timestamptz` (when availability was frozen), `status` (`draft|approved|executing|completed|cancelled`), `seller_count int`, `total_paisa bigint`, `minimum_paisa_snapshot bigint`, `generated_by`, `approved_by`, `approved_at`, `completed_at`, `notes`, `created_at`. Unique `(period_start, period_end)`.

### 3.5 `seller_statements` _(new; proposed)_

`id`, `seller_user_id`, `period_start date`, `period_end date`, `opening_balance_paisa`, `gross_paisa`, `commission_paisa`, `net_paisa`, `adjustments_paisa`, `paid_paisa`, `closing_balance_paisa`, `file_id → files (private)`, `generated_at`. Unique `(seller_user_id, period_start, period_end)`. Generated monthly whether or not a payout happened, so a seller below the minimum still gets a record.

### 3.6 `seller_balances_v` _(view; proposed)_

```sql
select seller_user_id,
  sum(net_paisa) filter (where status = 'pending')   as on_hold_paisa,
  sum(net_paisa) filter (where status = 'available') as available_paisa,
  sum(net_paisa) filter (where status = 'paid')      as lifetime_paid_paisa,
  sum(gross_paisa) filter (where status <> 'reversed') as lifetime_gross_paisa
from seller_earnings group by 1
```

plus a lateral join to open adjustments. `security_invoker = on`, so RLS applies. **Every number on the seller dashboard reads this view**; no component sums anything itself and no component multiplies by 0.7.

### 3.7 RLS policies — in words

**`seller_earnings`**

- _select_: `seller_user_id = app.current_user_id()` **or** `app.is_platform_admin()`. Nobody else, in any role, in any workspace.
- _insert_: denied to every role. Rows are written only by the marketplace fulfilment handler with the service role, inside the validated-capture transaction (F-CM-01 §4.1).
- _update_: denied to every role. Status moves (`pending → available`, `→ paid`, `→ reversed`) happen in pg_cron functions and service-role server actions.
- _delete_: denied to everyone, permanently. A wrong earning is corrected with an adjustment, never deleted.

**`seller_adjustments`**: _select_ own + platform staff. _insert/update_: platform staff only (and the service role for automatic clawbacks). _delete_: denied.

**`payouts`**: _select_ own + platform staff. The `payout_method_id` join is masked — a seller sees `account_ref_last4_snapshot`, never the encrypted reference (F-CM-02 §3.3). _insert/update_: platform staff / service role only. _delete_: denied.

**`payout_runs`**: _select_ platform staff only (a seller sees their own `payouts` row, not the whole run). _insert/update_: platform staff. _delete_: denied once `status <> 'draft'`.

**`seller_statements`**: _select_ own + platform staff. Everything else service role.

**`seller_balances_v`**: inherits `seller_earnings` RLS via `security_invoker`.

### 3.8 Files

Statement PDFs live in the **private** bucket at `statements/<seller_user_id>/<period_start>.pdf`, registered in `files` with `visibility='private'`, served through `/api/files/[id]` (5-minute signed URL) after an ownership or platform-staff check, logged to `file_access_log`.

---

## 4. Workflows

### 4.1 Earning creation (automatic, at capture)

**Trigger:** F-CM-01's fulfilment dispatcher, inside the transaction that sets `payments.status='captured'`.

For each `order_line` with `line_type='listing'` and a non-null `seller_user_id`:

1. Insert `seller_earnings` copying `gross_paisa`, `commission_bps`, `commission_paisa`, `net_paisa` **from the order line** (which itself snapshotted them at order creation from `platform_settings`). Nothing is recomputed here — recomputation is how the prototype ended up with two rates.
2. `status='pending'`, `sale_at = orders.paid_at`, `hold_until = orders.paid_at + (platform_settings.earnings_hold_days || ' days')::interval`.
3. Unique `(order_line_id)` makes a replayed IPN a no-op.
4. Notify the seller `marketplace.sale` with the **net** amount and the hold release date: _"You earned ৳175 from 'Class 8 Algebra Worksheet Pack'. Available on 19 May."_
5. Audit `earning.created`.

**Failure case:** a line whose seller has since been deleted (impossible — sellers are never deleted) or whose `seller_profile` is `suspended`: the earning is still created. Suspension freezes **payouts**, not earnings; the money is owed either way unless fraud is established.

### 4.2 Hold release (nightly)

pg_cron at 00:30 Asia/Dhaka:

```sql
update seller_earnings
   set status = 'available', available_at = now()
 where status = 'pending'
   and hold_until <= now()
   and reversed_at is null;
```

One statement, idempotent, no application code. It emits a summary to the job log and a per-seller notification only when it crosses the payout minimum (_"You're now above ৳1,000 — your next payout is 1 June"_), not for every release.

### 4.3 Refund → reversal or clawback (§5.5 has the arithmetic)

**Trigger:** a `refunds` row reaches `settled` (F-CM-01 §4.3 step 5).

1. Find the `seller_earnings` row for the refunded `order_line_id`.
2. **If `status = 'pending'` or `'available'`** (not yet paid): set `status='reversed'`, `reversed_at=now()`, `reversal_reason='refund:<id>'`. No adjustment row is needed — the money never left. This is the common case, because the refund window (7 days) equals the hold period (7 days).
3. **If `status = 'paid'`** (we already transferred it): create a `seller_adjustments` row with `kind='refund_clawback'` and a **negative** `amount_paisa`, `related_refund_id`, `status='open'`. It will reduce the seller's next payout.
4. **Partial refund:** always an adjustment (never a partial reversal), computed per §5.5, whatever the earning's status — except that if the earning is still `pending`/`available` the adjustment is applied against that same earning by reducing the payout, which nets to the same number and keeps one code path.
5. Notify the seller with the reason and the amount: _"A refund was issued for order ORD-…; ৳175 has been deducted."_ Sellers hear about clawbacks from us, not from a mystery line in a statement.
6. Audit `earning.reversed` or `adjustment.created`.

### 4.4 Monthly payout run

**Trigger:** pg_cron on the **1st at 02:00 Asia/Dhaka** creates a `draft` run; platform staff then work it.

1. **Generate.** `cutoff_at = now()`. For every seller: `candidate = Σ available earnings (available_at <= cutoff_at, payout_id is null) + Σ open adjustments`. Include the seller when `candidate >= platform_settings.payout_minimum_paisa` (৳1,000 = 100000 paisa) **and** `candidate > 0` **and** they are not frozen **and** they have a default payout method. Create one `payouts` row per included seller and stamp `payout_id` on every included earning and adjustment **in the same transaction**, so nothing can be double-paid.
2. **Review.** `/platform/payouts/runs/[id]` lists sellers with amount, method, masked account, and per-seller drill-down. Staff can **exclude** a seller (with a reason) before approving — excluded earnings return to the pool for next month.
3. **Approve.** Run → `approved`, then `executing`. Amounts are frozen; the earnings are `payout_id`-locked. Staff download a **transfer sheet** (CSV + PDF) grouped by method: one bank file, one bKash list, one Nagad list, each with account name, account reference (revealed through `app.reveal_payout_ref`, audited per row), and amount in taka.
4. **Execute.** Staff perform the transfers in their banking/agent apps. For each payout they enter the **transfer reference** (required, non-empty, ≤ 64 chars) and tap **Mark paid** — one at a time on a phone, or as a CSV re-upload matching `payout_id → reference` for a large run. Marking paid sets `payouts.status='paid'`, `paid_at`, `marked_by`, flips the included earnings to `status='paid'`, and settles the included adjustments.
5. **Failures.** A transfer that bounces is marked **failed** with a reason; the payout returns the earnings to `available` (clearing `payout_id`) so they roll into next month, and a `transfer_failure_reversal` adjustment of `0` is _not_ created (nothing moved). The seller is notified and asked to check their payout method.
6. **Complete.** When no payout in the run is `queued`, the run is `completed`, statements are generated (§4.5), and sellers are notified.
7. Audit: `payout_run.generated / approved / completed`, `payout.marked_paid` (with the reference), `payout.failed`, `payout_method.revealed` (one per row on the transfer sheet).

**Phone flow for staff.** `/platform/payouts` is a card list of the current run: seller name, amount, method chip, and a **Mark paid** button that opens a sheet with a single reference field and a numeric keypad hint. The account reference is behind a **Reveal** button (tap, re-auth if stale, auto-hide after 30 s) so a shoulder-surfer in a bank queue does not read a screen full of account numbers.

### 4.5 Statements

On the 1st, after the run, generate one `seller_statements` row + PDF per seller who had any activity in the closed month:

- Header: Acadigma Campus, seller name, handle, period.
- Opening balance (= previous closing).
- Sales table: date, order no, listing title, gross, commission (with the rate), net.
- Adjustments table: date, kind, reason, signed amount.
- Payout line: date, method, masked account, reference, amount.
- Closing balance, and a split of it into _on hold_ and _available_.
- Footer: _"Commission is 30 % of the sale price. Payment-gateway charges are borne by Acadigma and are not deducted from your earnings."_

The statement must **reconcile exactly**: `opening + net_sales + adjustments − paid = closing`, asserted by a test on generated data.

### 4.6 Seller's own view

`/sell/earnings`:

- Three balance tiles from `seller_balances_v`: **Available**, **On hold** (with the next release date), **Lifetime paid**.
- A 6-month bar chart bucketed by `sale_at` (never by a nullable timestamp).
- A ledger `DataList`: date, listing, gross, commission, net, status chip, with filters by status and month.
- An explainer row: _"30 % platform commission · ৳1,000 minimum payout · paid on the 1st · 7-day hold"_, every number read from `platform_settings`, none hardcoded.

`/sell/payouts`: history of payouts with status, method, reference, amount, and a statement download per period.

---

## 5. Business rules and calculations

### 5.1 State machines

**`seller_earnings.status`**

```
pending ──(hold_until passed)──► available ──(payout run)──► paid
   │                                 │
   └──(refund settles)──► reversed ◄─┘
```

`paid` is terminal — a post-payout refund becomes an **adjustment**, never a status change. `reversed` is terminal.

**`payouts.status`**: `queued → paid` | `queued → failed` | `queued → cancelled` (excluded before approval). `paid` is terminal.

**`payout_runs.status`**: `draft → approved → executing → completed`, or `draft → cancelled`.

### 5.2 Hold period

```
hold_until = orders.paid_at + (platform_settings.earnings_hold_days) days     -- default 7
```

Chosen to equal the refund window (PRODUCT-DECISIONS 4.8), so the overwhelming majority of refunds land while the money is still `pending` and the clean reversal path applies. The number is a setting, not a constant, and both features read the same row.

### 5.3 Balance formulas (exact)

```
on_hold_paisa    = Σ net_paisa   where status = 'pending'
available_paisa  = Σ net_paisa   where status = 'available' and payout_id is null
open_adjustments = Σ amount_paisa where status = 'open'              (signed)
payable_paisa    = available_paisa + open_adjustments
lifetime_paid    = Σ net_paisa   where status = 'paid'
lifetime_gross   = Σ gross_paisa where status <> 'reversed'
lifetime_commission = Σ commission_paisa where status <> 'reversed'
```

`payable_paisa` can be negative (a large clawback against a small balance); it is clamped for _display_ to ৳0 with a separate line _"Owed to Acadigma: ৳X, will be deducted from future earnings"_, and the run-inclusion test uses the unclamped value.

### 5.4 Payout inclusion test (exact)

```
eligible(seller) :=
      not seller.payouts_frozen
  and seller.default_payout_method is not null
  and (first_payout_ever → seller.default_payout_method.verified)
  and payable_paisa(seller, cutoff_at) >= platform_settings.payout_minimum_paisa
```

and then

```
payouts.earnings_paisa    = Σ net_paisa of included earnings
payouts.adjustments_paisa = Σ amount_paisa of included open adjustments
payouts.amount_paisa      = earnings_paisa + adjustments_paisa      -- > 0 by the test above
```

If `payable_paisa < minimum`, **nothing** is included — the earnings stay `available` with `payout_id is null` and roll forward. A seller who never reaches ৳1,000 accumulates indefinitely; a **Request early payout** button is explicitly _not_ in v1 (PRODUCT-DECISIONS 4.2), but the seller sees _"৳640 available — ৳360 more until your next payout."_

Worked example. Seller has three available earnings of ৳175, ৳420, ৳560 (= ৳1,155) and one open clawback of −৳175.

```
earnings_paisa    =  17500 + 42000 + 56000 = 115500
adjustments_paisa = -17500
amount_paisa      =  98000  (৳980)  <  100000 (৳1,000)   → NOT eligible this month
```

All four rows roll forward. Next month one more ৳200 sale tips it over and all five settle together.

### 5.5 Refund arithmetic (exact)

Let the refunded line have `gross_paisa = G`, `commission_paisa = C`, `net_paisa = N` (so `C + N = G`), and let `R` be the refunded amount in paisa, `0 < R <= G`.

**Full refund (`R = G`):**

```
seller_clawback_paisa  = N          (the whole net)
platform_gives_back    = C          (the whole commission)
```

**Partial refund (`R < G`):** split proportionally, with the rounding remainder falling on the **platform**, mirroring §5.2 of F-CM-01:

```
seller_clawback_paisa   = floor(N * R / G)
platform_clawback_paisa = R - seller_clawback_paisa
```

so `seller_clawback + platform_clawback = R` exactly, for every input. Worked example: `G = 25000`, `C = 7500`, `N = 17500`, `R = 10000` →
`seller_clawback = floor(17500 * 10000 / 25000) = 7000` (৳70), `platform_clawback = 3000` (৳30). Seller keeps ৳105 of the original ৳175; platform keeps ৳45 of the original ৳75. Both retain exactly 70 %/30 % of what the buyer kept.

**Application:**

- Earning `pending`/`available` and `R = G` → `status='reversed'`; no adjustment row.
- Earning `pending`/`available` and `R < G` → adjustment `kind='refund_clawback'`, `amount_paisa = -seller_clawback_paisa`, earning stays as-is.
- Earning `paid` (any `R`) → adjustment `kind='refund_clawback'`, `amount_paisa = -seller_clawback_paisa`.

**Gateway fee is never clawed back from the seller.** SSLCommerz does not return its own charge on a refund, so a refund costs the platform the gateway fee twice. That is absorbed by the platform and is one reason the 7-day window exists. It is stated in the statement footer so no seller ever sees an unexplained deduction.

### 5.6 What the seller is _not_ charged

- Payment-gateway charges (SSLCommerz's cut of `amount` → `store_amount`, F-CM-01 §5.9).
- Bank/bKash/Nagad **transfer** fees on the payout — absorbed by the platform in v1 (the `payout_fee` adjustment kind exists for a future policy change, and is unused).
- Storage or bandwidth for their files.
  The only deduction is the 30 % commission. Saying this once, precisely, in the statement and on `/sell/earnings`, is worth more than any dashboard.

### 5.7 Frozen payouts

`seller_profiles.payouts_frozen boolean` _(proposed addition to F-CM-02 §3.1)_ set when a seller is suspended for `suspected_fraud` or when open reports exceed a threshold. Frozen sellers keep accruing earnings, are excluded from runs, and see _"Payouts are on hold while we review your account — contact support."_ Unfreezing includes them in the next run.

### 5.8 Currency and rounding

All arithmetic is integer paisa. No division ever happens outside the two `floor` expressions in §5.5 and §5.2 of F-CM-01. Display through `formatBDT`. The lint rule from F-CM-01 Part 1 bans money arithmetic in `apps/web/**`, which is what makes the prototype's `* 0.7` bug structurally impossible to reintroduce.

### 5.9 Reconciliation invariant (asserted nightly)

```
Σ order_lines.seller_paisa (paid, non-refunded)
  = Σ seller_earnings.net_paisa where status in ('pending','available','paid')
Σ payouts.amount_paisa where status='paid'
  = Σ seller_earnings.net_paisa where status='paid' + Σ seller_adjustments.amount_paisa where status='settled'
```

A nightly job checks both and alerts platform staff on any drift, with the offending ids. This is the cheapest possible defence against the class of bug that made the prototype's money screens fiction.

---

## 6. UI

| Route                            | Who    | 360×800                                                                     | ≥1024                                             | Primary action          | Empty                                    | Loading               | Error        |
| -------------------------------- | ------ | --------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------- | ---------------------------------------- | --------------------- | ------------ |
| `/sell/earnings`                 | seller | 3 balance tiles stacked 2+1, 6-month bar chart, filter chips, ledger cards  | Tiles in a row, chart + ledger table side by side | Filter                  | _"No sales yet"_ + Share your storefront | Skeleton tiles + rows | Retry banner |
| `/sell/payouts`                  | seller | Payout cards: month, amount, status chip, method, reference, statement link | Table                                             | Download statement      | _"No payouts yet"_ + minimum explainer   | Skeleton              | Retry        |
| `/platform/payouts`              | staff  | Current run summary, seller card list with Mark paid                        | Sidebar run list + table + bulk actions           | Mark paid               | _"No run this month"_ + Generate         | Skeleton              | Retry        |
| `/platform/payouts/runs/[id]`    | staff  | Totals, per-seller cards, Reveal + Mark paid sheets, Export transfer sheet  | 3-panel with per-seller drill-down                | Approve run / Mark paid | n/a                                      | Skeleton              | Alert        |
| `/platform/sellers/[id]/finance` | staff  | Balances, ledger, adjustments, **Add adjustment** sheet                     | Two-column                                        | Add adjustment          | _"No activity"_                          | Skeleton              | Alert        |

Components: `AppShell`, `BalanceTile`, `MoneyText`, `DataList`, `StatusChip`, `BarChart` (per the dataviz tokens), `FormSheet`, `RevealField`, `ConfirmSheet`, `EmptyState`.

**Phone specifics.** Balance tiles are 2-up then 1 full-width, each with the label above the number (labels are what make ৳3,240 mean something). The ledger card shows listing title, date, net in bold, and a status chip; gross and commission are on the expanded row, because net is the number a seller cares about. The chart is 180 px tall with 6 bars — no legend, labels under the bars, values on tap. `Mark paid` is destructive-adjacent and therefore has a confirm sheet restating seller, amount and method.

---

## 7. Server contracts

| Name                                | Kind                                                                       | Input                                                                              | Output                                                                                                     | Errors                                                                 | Idempotency                               | Rate limit                                     |
| ----------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- |
| `getSellerBalances`                 | RSC query                                                                  | ctx                                                                                | `{onHold, available, payable, lifetimePaid, lifetimeGross, nextReleaseAt, nextPayoutDate, shortfallPaisa}` | —                                                                      | n/a                                       | 60/min/user                                    |
| `listEarnings`                      | RSC query                                                                  | `{status?, month?, cursor?}`                                                       | `{items[], nextCursor}`                                                                                    | —                                                                      | n/a                                       | 60/min/user                                    |
| `listSellerPayouts`                 | RSC query                                                                  | `{cursor?}`                                                                        | `{items[]}`                                                                                                | —                                                                      | n/a                                       | 60/min/user                                    |
| `downloadStatement`                 | route `GET /api/files/[id]`                                                | statement file id                                                                  | signed URL                                                                                                 | `FORBIDDEN`, `NOT_FOUND`                                               | n/a                                       | 20/min/user                                    |
| `releaseHolds`                      | pg_cron SQL function `app.release_earning_holds()`                         | —                                                                                  | `{released int}`                                                                                           | —                                                                      | idempotent by predicate                   | nightly                                        |
| `generatePayoutRun`                 | action                                                                     | `{periodStart, periodEnd, idempotencyKey}`                                         | `{runId, sellerCount, totalPaisa, excludedBelowMinimum int}`                                               | `RUN_EXISTS`, `FORBIDDEN`                                              | key + unique `(period_start, period_end)` | 5/day/staff                                    |
| `excludeFromRun`                    | action                                                                     | `{payoutId, reason}`                                                               | `{status}`                                                                                                 | `RUN_NOT_DRAFT`, `FORBIDDEN`                                           | key                                       | 200/day/staff                                  |
| `approvePayoutRun`                  | action                                                                     | `{runId, idempotencyKey}`                                                          | `{status, total}`                                                                                          | `RUN_NOT_DRAFT`, `FORBIDDEN`                                           | key                                       | 5/day/staff                                    |
| `exportTransferSheet`               | route `GET /api/platform/payouts/runs/[id]/transfer-sheet?format=csv\|pdf` | run id                                                                             | file                                                                                                       | `FORBIDDEN`                                                            | n/a                                       | 10/day/staff — **every row reveal is audited** |
| `markPayoutPaid`                    | action                                                                     | `{payoutId, transferReference, note?, idempotencyKey}`                             | `{status, paidAt}`                                                                                         | `REFERENCE_REQUIRED`, `ALREADY_PAID`, `RUN_NOT_EXECUTING`, `FORBIDDEN` | key                                       | 500/day/staff                                  |
| `markPayoutFailed`                  | action                                                                     | `{payoutId, failureReason}`                                                        | `{status}`                                                                                                 | `ALREADY_TERMINAL`, `FORBIDDEN`                                        | key                                       | 200/day/staff                                  |
| `bulkMarkPaid`                      | action                                                                     | `{runId, rows:[{payoutId, transferReference}]}`                                    | `{marked, skipped, errors[]}`                                                                              | `FORBIDDEN`                                                            | key                                       | 20/day/staff                                   |
| `createAdjustment`                  | action                                                                     | `{sellerUserId, kind, amountPaisa, reasonNote, relatedEarningId?, idempotencyKey}` | `{adjustmentId}`                                                                                           | `AMOUNT_ZERO`, `NOTE_REQUIRED`, `FORBIDDEN`                            | key                                       | 100/day/staff                                  |
| `freezePayouts` / `unfreezePayouts` | actions                                                                    | `{sellerUserId, reason}`                                                           | `{frozen}`                                                                                                 | `FORBIDDEN`                                                            | key                                       | 50/day/staff                                   |
| `generateStatements`                | route `POST /api/cron/payouts/statements`                                  | `{periodStart, periodEnd}`                                                         | `{generated}`                                                                                              | `FORBIDDEN`                                                            | run key                                   | monthly                                        |

---

## 8. Parts (build chunks)

**Part 1 — `seller_earnings` schema, RLS, creation on capture** _(2 days)_
Scope: migration (table, enum, indexes, unique `order_line_id`), RLS per §3.7, the earnings step of the marketplace fulfilment handler, `sale_at`/`hold_until` computation, seller sale notification.
Tests: pgTAP — no role can insert, update or delete; a seller sees only their own; a school admin of the seller's school sees none. Integration — a replayed capture creates one earning; amounts equal the order line exactly (never recomputed).
**Demo:** a sandbox purchase produces one `pending` earning with the right ৳175 and a release date 7 days out.

**Part 2 — Hold release job + `seller_balances_v` + seller earnings page** _(1.5 days)_
Scope: `app.release_earning_holds()` on pg_cron, the view, `/sell/earnings` with three tiles, the 6-month chart bucketed by `sale_at`, the ledger list with filters, the settings-driven explainer row.
Tests: release is idempotent and time-correct across the Dhaka timezone boundary; the view respects RLS; the page renders zero state honestly.
**Demo:** set `hold_until` to the past in a seed, run the job, watch the tile move from On hold to Available.

**Part 3 — Adjustments + refund reversal/clawback** _(2 days)_
Scope: `seller_adjustments`, the refund hook from F-CM-01, full vs partial arithmetic in `packages/domain/market/clawback.ts`, seller notification with the reason, `/platform/sellers/[id]/finance` with Add adjustment.
Tests: property test asserting `seller_clawback + platform_clawback == R` for 1e5 random `(G, C, R)`; pending → reversed path; paid → negative adjustment path; a negative payable clamps for display but not for eligibility.
**Demo:** refund a paid-out sale and see a −৳175 clawback appear on the seller's ledger with a readable reason.

**Part 4 — Payout run generation** _(2 days)_
Scope: `payout_runs`, `payouts`, the monthly pg_cron draft, the inclusion test, the atomic stamping of `payout_id` on earnings and adjustments, run review UI with exclusion, run approval.
Tests: minimum boundary at exactly ৳1,000 and ৳999.99; a seller with no default method excluded; first-payout-requires-verified-method rule; double generation blocked by the unique index; no earning can land in two runs (pgTAP concurrency test).
**Demo:** generate a run over seeded data and show the below-minimum sellers correctly excluded with a stated shortfall.

**Part 5 — Execution: transfer sheet, mark paid/failed, reveal + audit** _(2 days)_
Scope: transfer sheet CSV/PDF grouped by method, `app.reveal_payout_ref` per row with audit, `RevealField` with auto-hide, `markPayoutPaid` requiring a reference, `markPayoutFailed` returning earnings to the pool, `bulkMarkPaid` CSV, run completion, seller notifications.
Tests: mark paid without a reference rejected; a failed payout returns earnings to `available` with `payout_id` cleared; every reveal writes an audit row; marking paid twice is idempotent.
**Demo:** mark a payout paid on a phone with a bKash reference and see the seller's status flip.

**Part 6 — Statement PDF** _(1.5 days)_
Scope: `seller_statements`, monthly generation job, React-PDF template with Bengali font, the reconciliation assertion, download through `/api/files/[id]`, `/sell/payouts` list.
Tests: `opening + net_sales + adjustments − paid == closing` on generated fixtures; a seller cannot download another seller's statement; deterministic rendering.
**Demo:** download a May statement that ties to the ledger to the taka.

**Part 7 — Reconciliation invariants + platform finance view** _(1 day)_
Scope: the nightly invariant job (§5.9), drift alerting with offending ids, `/platform/finance` totals (gross, commission, paid out, outstanding liability), freeze/unfreeze.
Tests: deliberately corrupt a row in a test database and assert the job flags it rather than silently passing.
**Demo:** the platform finance page showing outstanding seller liability, matching the sum of available + on-hold balances.

---

## 9. Acceptance criteria

1. **Given** a ৳250 sale with a 30 % snapshot **when** the payment is captured **then** exactly one `seller_earnings` row exists with `gross 25000`, `commission 7500`, `net 17500`, `status='pending'`, `hold_until = paid_at + 7 days`, and its amounts are byte-identical to the order line's.
2. **Given** the same IPN is replayed **when** fulfilment runs again **then** no second earning is created.
3. **Given** `platform_settings.commission_bps` is changed to 2500 **when** a new sale is captured **then** the new earning uses 25 % and **every existing earning is unchanged**.
4. **Given** an earning whose `hold_until` has passed **when** the nightly job runs **then** it becomes `available` with `available_at` set; running the job again changes nothing.
5. **Given** a seller with ৳980 payable on the 1st **when** the run is generated **then** they are excluded, their earnings keep `payout_id is null`, and their dashboard says _"৳20 more until your next payout."_
6. **Given** a seller with exactly ৳1,000 payable **when** the run is generated **then** they are included.
7. **Given** a seller with no default payout method **when** the run is generated **then** they are excluded with a stated reason and notified to add one.
8. **Given** a run is approved **when** staff export the transfer sheet **then** each revealed account reference writes an `audit_events` row `payout_method.revealed` naming the staff member and the payout.
9. **Given** a payout **when** staff tap _Mark paid_ without a transfer reference **then** it is rejected with `REFERENCE_REQUIRED`.
10. **Given** a payout is marked paid **then** every included earning becomes `status='paid'`, every included adjustment becomes `settled`, and the seller is notified with the reference.
11. **Given** a payout is marked failed **then** its earnings return to `available` with `payout_id` cleared and are picked up by the next run.
12. **Given** a refund settles for a still-`available` earning **then** the earning becomes `reversed` and no adjustment row is created.
13. **Given** a refund settles for an already-`paid` earning of ৳175 **then** an adjustment of `−17500` is created with a readable reason, the seller is notified, and their next payout is reduced by exactly ৳175.
14. **Given** a partial refund of ৳100 on a ৳250 sale **then** the seller clawback is exactly ৳70 and the platform's share of the refund is exactly ৳30, and the two sum to ৳100.
15. **Given** a seller **when** they query `seller_earnings`, `payouts` or `seller_statements` with their own JWT **then** they see only their own rows; a school owner of their school sees none.
16. **Given** a monthly statement **when** it is generated **then** `opening + net_sales + adjustments − paid = closing` holds exactly, and the footer states that gateway charges are not deducted from the seller.
17. **Given** the nightly invariant job **when** any drift exists between order lines, earnings and payouts **then** platform staff are alerted with the offending ids and the job does not self-heal.
18. **Given** `/sell/earnings` at 360×800 **then** the three balance tiles, the chart and the first ledger rows are readable without horizontal scroll and axe reports no serious violations.

---

## 10. Tests

- **Unit (domain):** clawback split property test; balance formulas; payout inclusion test across the minimum boundary, frozen, unverified-method and negative-payable cases; earning and payout transition tables; statement reconciliation arithmetic.
- **DB (pgTAP):** isolation and escalation on `seller_earnings`, `seller_adjustments`, `payouts`, `payout_runs`, `seller_statements`; insert/update/delete denial on `seller_earnings` for every role including platform admin; the unique `(order_line_id)` under concurrency; a concurrency test asserting one earning cannot be stamped into two runs; `seller_balances_v` invoker RLS.
- **Integration:** capture → earning; refund → reversal and → clawback; run generate → approve → mark paid → statement, end to end on seeded data; failed payout rollback.
- **e2e (360×800 and 1280×800):** seller views earnings and downloads a statement; staff generate, approve, reveal, mark paid, and complete a run on a phone; axe on all screens.
- **Security:** attempt to read another seller's earnings, payout and statement (0 rows / 403); attempt to mark a payout paid as a non-staff user (403); assert the encrypted payout reference never appears in any API response body (a response-shape test over every route in this feature).
- **Performance:** run generation p95 < 5 s for 5,000 sellers and 200,000 earnings; `/sell/earnings` p95 < 400 ms; statement render p95 < 4 s for 500 lines.

---

## 11. Open questions

1. **Payout day when the 1st is a holiday.** _Default assumed:_ the run is still generated on the 1st; staff execute transfers on the next banking day, and `paid_at` records reality. No schedule shifting logic.
2. **Negative balance recovery from a seller who stops selling.** _Default assumed:_ the negative adjustment sits `open` indefinitely and is disclosed on every statement; no collections process in v1.
3. **Tax withholding / AIT on seller payouts.** Bangladesh may require withholding on payments to individuals. _Default assumed:_ **not** implemented in v1; a `withholding_tax` adjustment kind is deliberately left out until the owner has accounting advice. Flagged as the highest-risk open item in this area.
4. **Should sellers be able to request an early payout?** _Default assumed:_ no (PRODUCT-DECISIONS 4.2). The schema supports an ad-hoc run if that changes.
5. **Multi-currency.** _Default assumed:_ BDT only; `currency` columns exist so a second currency is additive.
6. **Does the platform absorb transfer fees forever?** _Default assumed:_ yes in v1; the `payout_fee` adjustment kind is present but unused so a policy change is a config change, not a migration.
