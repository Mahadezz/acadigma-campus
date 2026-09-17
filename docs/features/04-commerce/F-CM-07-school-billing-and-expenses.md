# F-CM-07 — School billing hub, AI credit packs and the expense ledger

|                  |                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | billing                                                                                                                                             |
| Status           | planned                                                                                                                                             |
| Owner branch     | `feat/commerce-school-billing`                                                                                                                      |
| Depends on       | F-CM-01 (orders/payments/receipts), F-CM-04 (marketplace spending, approvals), F-CM-06 (plans, subscriptions, invoices), F-TE-0x (AI credit ledger) |
| Plan             | `docs/plan/ROADMAP.md` chunk — commerce, seventh                                                                                                    |
| Base44 reference | `docs/reference/base44-inventory/04-commerce-billing.md` §3.7, §3.8, §3.9, §5 rows 30–31, 35, 38–42, §7-A13, §7-A14, §7-A16, §7-C26                 |

> **Schema note.** Tables and columns are **proposed; `docs/architecture/DATA-MODEL.md` wins**.

---

## 1. Purpose

One page where a school owner or admin can answer _"what are we spending on Acadigma, and on what?"_ — with every number computed from a real table. It assembles the subscription (F-CM-06), marketplace spending and pending approvals (F-CM-04), AI credit purchases, and a manual expense ledger for the school's own printing, utilities and sundries, plus one invoice list that covers all of it.

**What Base44 had:** the billing shell read five entities with unfiltered `.list()` calls, **no `school_id` filter and no RLS on any of them**, so every school shared one billing dataset — and since `User` had no `school_id`, every billing write landed on the literal string `'default'`. The overview hardcoded _"AI Usage Cost ৳ 0"_, _"Marketplace Spending ৳ 0"_ and _"Storage Used 34 GB of 100 GB"_. The AI-billing-model badge read a field that lived on a different, entirely unreferenced entity, so it always said "Shared Pool". Payment history read `BillingRecord`, which **nothing in the codebase ever created**, so it was permanently empty and its per-row Download button had no handler. The marketplace-approvals tab queried that same never-written entity instead of the transactions table — the author's own comment admits it — so school-funded purchase requests were orphaned forever. The import/export centre downloaded a hardcoded placeholder blob. The one genuinely working feature was the manual expense ledger, with CRUD, soft delete and a total — written to tenant `'default'` and visible to every school on earth, with a decorative _"recoverable within 30 days"_ label and no purge job.

**Done looks like:** an admin opens `/app/billing` on a phone and sees this month's real total broken into subscription, marketplace, AI credits and manual expenses; taps _Marketplace_ to find two pending teacher requests; taps _Credits_ to buy a ৳499 top-up pack that lands in the AI ledger within seconds of the IPN; and downloads a CSV of the year's expenses for their accountant. Every figure ties to a row they can open.

---

## 2. Roles and permissions

| Action                                | Permission key             | owner | admin | teacher           | staff             | parent | platform |
| ------------------------------------- | -------------------------- | ----- | ----- | ----------------- | ----------------- | ------ | -------- |
| View billing overview                 | `billing.overview.read`    | ✔     | ✔     | —                 | —                 | —      | ✔        |
| View invoices + receipts              | `billing.invoice.read`     | ✔     | ✔     | —                 | —                 | —      | ✔        |
| View marketplace spending + approvals | `market.purchase.approve`  | ✔     | ✔     | own requests only | own requests only | —      | ✔        |
| Buy AI credit packs                   | `billing.credits.purchase` | ✔     | ✔     | —                 | —                 | —      | —        |
| Change the AI billing model           | `ai.billing_model.change`  | ✔     | —     | —                 | —                 | —      | ✔        |
| Create / edit / delete an expense     | `expense.write`            | ✔     | ✔     | —                 | —                 | —      | —        |
| View expenses                         | `expense.read`             | ✔     | ✔     | —                 | —                 | —      | ✔        |
| Restore a soft-deleted expense        | `expense.restore`          | ✔     | ✔     | —                 | —                 | —      | ✔        |
| Export billing data                   | `billing.export`           | ✔     | ✔     | —                 | —                 | —      | ✔        |

Teachers and staff never see the school's financials. They see their own marketplace requests under `/app/billing/marketplace` filtered to `requested_by = me`, which is the one place the route is shared.

---

## 3. Data

Tenant key: `workspace_id` on every table, no exceptions (PRODUCT-DECISIONS 1.6, 5.5). This feature exists partly to make that true after the prototype wrote everything to `'default'`.

### 3.1 `expenses` _(new; proposed)_ — replaces `ManualExpense`

| column                      | type                                        | notes                                                                                                            |
| --------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`                        | uuid pk                                     |
| `workspace_id`              | uuid not null → workspaces                  |
| `title`                     | text not null                               | 2–120 chars                                                                                                      |
| `category`                  | `expense_category` not null default `other` | `printing \| utilities \| maintenance \| supplies \| transport \| salaries_other \| events \| software \| other` |
| `amount_paisa`              | bigint not null                             | `> 0`                                                                                                            |
| `currency`                  | char(3) not null default `'BDT'`            |
| `spent_on`                  | date not null                               | the date the money left, in the workspace timezone                                                               |
| `vendor`                    | text null                                   |
| `payment_mode`              | `expense_payment_mode` null                 | `cash \| bank \| bkash \| nagad \| card \| other`                                                                |
| `reference_no`              | text null                                   | voucher / cheque / txn reference                                                                                 |
| `notes`                     | text null                                   | ≤ 1000 chars                                                                                                     |
| `receipt_file_id`           | uuid null → files                           | **private**                                                                                                      |
| `created_by`                | uuid not null → profiles                    |
| `deleted_at` / `deleted_by` | timestamptz / uuid null                     | soft delete with a real 30-day purge (§5.4)                                                                      |
| `created_at/updated_at`     |                                             |                                                                                                                  |

Indexes: `(workspace_id, spent_on desc) where deleted_at is null`, `(workspace_id, category, spent_on)`, `(workspace_id, deleted_at) where deleted_at is not null`, `(receipt_file_id)`.

### 3.2 `credit_packs` _(new; proposed — platform-owned, global)_

`id`, `code` (`pack_500`, `pack_1500`, `pack_5000`), `name`, `credits int not null`, `price_paisa bigint not null`, `sort int`, `is_public boolean default true`, `status` (`active|archived`), `updated_by`, `updated_at`. Seeded placeholder: **500 credits — ৳499** (PRODUCT-DECISIONS 3.3), plus `1,500 — ৳1,299` and `5,000 — ৳3,999` as volume options the owner can delete or reprice from `/platform`.

Read by any authenticated user (the pack list renders for any admin); written by platform staff only.

### 3.3 `ai_credit_ledger` — _owned by F-TE-0x; this feature only appends to it_

This feature contributes rows of `source='purchase'` with positive `credits`, plus `order_id`, `credit_pack_id`, `workspace_id`, `granted_at`, `expires_at = null`. **Purchased credits do not expire** and are consumed only after the daily plan grant is exhausted (§5.3). Nothing here reads or mutates consumption.

### 3.4 `billing_summaries_v` _(view; proposed)_ — the overview's single source

```sql
-- one row per workspace per month, month boundaries in the workspace timezone
select workspace_id, month_start,
       subscription_paisa,      -- Σ paid subscription invoices issued in the month
       marketplace_paisa,       -- Σ paid workspace-funded marketplace orders, net of refunds
       credit_pack_paisa,       -- Σ paid credit-pack orders, net of refunds
       expenses_paisa,          -- Σ expenses.amount_paisa where deleted_at is null
       (subscription_paisa + marketplace_paisa + credit_pack_paisa + expenses_paisa) as total_paisa
from ...
```

`security_invoker = on`. **Every number on `/app/billing` reads this view.** No component sums anything itself, and the tile component takes a single value with **no default**, so a hardcoded figure like the prototype's _"34 GB"_ cannot be rendered — there is nowhere to put it.

### 3.5 `billing_exports` _(new; proposed)_

`id`, `workspace_id`, `kind` (`expenses|invoices|marketplace|full`), `format` (`csv|xlsx`), `period_start`, `period_end`, `file_id`, `row_count`, `requested_by`, `status` (`queued|ready|failed`), `created_at`, `completed_at`. Exports are **generated server-side into a real file**, which is the direct fix for the prototype's placeholder blob.

### 3.6 RLS policies — in words

**`expenses`**

- _select_: `app.has_role(workspace_id,'{owner,admin}')` for non-deleted rows; owner/admin also see soft-deleted rows (the _Deleted_ tab filters in SQL, not in the browser); platform staff see all. **Teachers, staff and parents get no policy at all** — a school's expense ledger is not staff-visible information, so there is no row they can reach under any query.
- _insert_: `app.has_role(workspace_id,'{owner,admin}')`, with a `with check` forcing `workspace_id = current_setting('app.workspace_id')::uuid` and `created_by = app.current_user_id()`.
- _update_: same roles, same workspace; a trigger forbids changing `workspace_id` and `created_by`, and forbids editing a row whose `deleted_at` is set (restore first, then edit).
- _delete_: **hard delete denied to every role, including platform staff.** The action sets `deleted_at`; the purge job (service role) is the only thing that removes a row.

**`credit_packs`**: _select_ to any authenticated user; _insert/update/delete_ platform staff only.

**`billing_summaries_v`**: inherits the underlying tables' RLS through `security_invoker`, so a member who cannot read `invoices` or `expenses` reads nothing from the view either.

**`billing_exports`**: _select/insert_ owner/admin of the workspace + platform staff; _update_ service role; _delete_ denied. The generated file is private and served through `/api/files/[id]` after the same check.

**Receipt files** (`expenses.receipt_file_id`) are `visibility='private'`, in the `private` bucket at `expenses/<workspace_id>/<expense_id>/<file_id>.<ext>`, 5-minute signed URLs, access logged to `file_access_log`. Accepted: JPEG/PNG/WebP/PDF, ≤ 10 MB, magic-byte sniffed, EXIF stripped.

---

## 4. Workflows

### 4.1 Billing overview

**Trigger:** owner or admin opens `/app/billing`.

1. One server query against `billing_summaries_v` for the current month plus the previous five (for the trend), and one against `subscriptions` for plan state.
2. The page renders, top to bottom on a phone:
   - **Plan card** — plan name, status chip (`Trial · 6 days left` / `Active` / `Past due — pay by 8 June` / `Free`), next renewal date and price, **Upgrade** / **Renew now**. Straight from F-CM-06; nothing is duplicated here.
   - **This month** — one large total, then four rows: Subscription, Marketplace, AI credits, Other expenses, each with its amount and a chevron into its detail page. A ৳0 row still renders: an absent row reads as a bug, a ৳0 row reads as a fact.
   - **Usage meters** — teachers, students, storage, daily AI credits, each `current / limit` from `usage_counters` (F-CM-06 §3.9). **Storage is a real number**, computed from `sum(files.size_bytes)` for the workspace, not a hardcoded 34 GB.
   - **AI billing model** — `shared_pool` or `individual_allocation` with the owner-only **Change** action (PRODUCT-DECISIONS 5.3 makes this owner-changeable, not support-only). The value is read from the workspace's own AI settings row, not from a field on a different table.
   - **Pending marketplace requests** — a count badge and a link, rendered only when > 0.
   - **6-month trend** — a small stacked bar chart by category.
3. Loading is per-card skeletons, not a whole-page spinner; a failing card shows an inline retry and does not blank the others.

### 4.2 Invoices and receipts

`/app/billing/invoices` lists everything the school has been billed for or has paid, from two sources unified in one list: `invoices` (subscriptions) and `orders` with `funding='workspace'` (marketplace purchases and credit packs, which produce a **receipt**, not an invoice, because they are paid at once).

Each row: date, document number (`INV-…` or `ORD-…`), type chip, description, amount, status, **Download**. The download resolves to the stored PDF in `files` — and **every row's button has a handler**, which is worth stating because the prototype's did not.

Filters: year, type, status. Default view: the current financial year (§11 Q1).

### 4.3 Marketplace spending

`/app/billing/marketplace` has three parts:

1. **Month-to-date and year-to-date spend** at the top, from `billing_summaries_v`.
2. **Pending requests** (the F-CM-04 §4.5 queue) — cards with listing, requester, justification, price, and **Approve & pay** / **Decline**. It lives under billing because that is where an admin looks for it.
3. **Purchased** — the school's workspace-funded orders: date, listing, requester, amount, receipt download, and a link to the entitlement so an admin can see how often it has been downloaded.

A teacher opening this route sees only their own requests and no financial figures — enforced by the `purchase_approvals` select policy, not by a UI branch.

### 4.4 Buying AI credit packs

1. `/app/billing/credits` shows the balance (today's plan grant remaining **and** purchased balance, as two separate numbers), the daily grant from the plan, and the pack cards.
2. Owner/admin taps a pack → confirm sheet (pack, credits, price, _"Purchased credits never expire and are used after your daily allowance runs out"_) → `createOrder({kind:'credit_pack', items:[{type:'credit_pack', packId}], funding:'workspace'})` → F-CM-01 checkout.
3. On capture, the `credit_pack` fulfilment handler appends one `ai_credit_ledger` row with the pack's credits **inside the capture transaction**, idempotent on `order_line_id`.
4. A receipt PDF is issued; the owner and admins are notified; teachers are not (the balance they see simply goes up).
5. Audit: `credits.purchased` with pack, credits and order id.
6. **Failure case:** payment fails → no credits, the order stays `pending_payment`, the page shows _Try again_. There is no path where credits appear before a validated payment.

**What this replaces:** the prototype's _"Top Up"_ granted credits for free, with no request record, no audit, no cap and no cost — credits conjured out of nothing. Here, credits enter a workspace through exactly two doors: the plan's daily grant, and a paid pack. Platform staff can additionally grant a comp, which writes `source='comp'` with a required reason and an audit row.

### 4.5 Manual expense ledger

1. `/app/billing/expenses` — a `DataList` grouped by month with a running total per group and a period total at the top. Filters: category, date range, payment mode, has-receipt.
2. **Add** opens a `FormSheet`: title, amount (৳, numeric keypad), date (defaults to today in the workspace timezone), category chips, vendor, payment mode, reference, notes, and a receipt tile that opens the camera on a phone.
3. **Edit** is the same sheet, prefilled. Every edit writes an audit row with before/after, because expense records are financial records.
4. **Delete** is a soft delete behind a confirm sheet naming the title and amount. The row moves to the **Deleted** tab showing _"Will be permanently removed on 14 June"_ — a real date, backed by a real job (§5.4).
5. **Restore** from the Deleted tab clears `deleted_at`.
6. **Export** produces a real CSV/XLSX via `billing_exports`.
7. Audit: `expense.created / updated / deleted / restored / purged`.

**Phone flow.** Add is a FAB 16 px above the bottom nav. The amount field is first and autofocused, `inputmode="decimal"`, with a `৳` adornment. Category is a horizontally scrollable chip row (faster than a select at 360 px). The receipt tile is last, so a one-handed entry can be completed now and the photo added later from the edit sheet.

### 4.6 Export

Any of the four export kinds → a queued `billing_exports` job → a real file in `files` → a download link, plus an email when it is ready for large ranges. CSV columns are stable and documented in a header comment row, so a school's accountant can build a template against them.

---

## 5. Business rules and calculations

### 5.1 The month, and the total

"This month" is `date_trunc('month', now() at time zone school_profiles.timezone)`; the same expression is used in SQL and in the UI (ARCHITECTURE §4, PRODUCT-DECISIONS 6.10). No month boundary is ever computed in JavaScript.

```
month_total_paisa = subscription_paisa + marketplace_paisa + credit_pack_paisa + expenses_paisa
```

where each term is a `SUM` over rows whose date falls in the month:

- `subscription_paisa` — `invoices` with `kind='subscription'`, `status='paid'`, `issued_at` in month.
- `marketplace_paisa` — `orders` with `kind='marketplace'`, `funding='workspace'`, `status in ('paid','partially_refunded','refunded')`, `paid_at` in month, **net of refunds**: `total_paisa - refunded_paisa`.
- `credit_pack_paisa` — same shape with `kind='credit_pack'`.
- `expenses_paisa` — `expenses` with `deleted_at is null`, `spent_on` in month.

Refunds reduce the month in which the **original order** was paid, not the refund month. That is the convention an accountant expects for a same-period refund, and every refund falls inside a 7-day window so cross-month cases are rare; when one does cross a month, the earlier month's figure changes and the trend chart shows it. A footnote on the page says so rather than hiding it.

### 5.2 Every figure is traceable

Each of the four rows links to a list whose rows sum to the figure shown. A test asserts, on seeded data, that `billing_summaries_v.marketplace_paisa` equals the sum of the rows rendered on `/app/billing/marketplace` for the same period, and likewise for the other three. This is the concrete version of PRODUCT-DECISIONS 3.9's _"no mock arrays ship"_.

### 5.3 Credit pack accounting

- A pack grants `credit_packs.credits` credits at capture. `৳499 / 500 credits` is the seeded placeholder; price and credit count are both editable in `/platform`.
- **Consumption order:** the daily plan grant is spent first; purchased credits are spent only when the day's grant is exhausted. Purchased credits **never expire**; the daily grant resets at 00:00 Asia/Dhaka and unused grant credits are lost (PRODUCT-DECISIONS 3.3). The balance display therefore shows two numbers — _"Today: 120 of 400 · Purchased: 1,340"_ — because one number would be a lie about what resets.
- Packs are bought by the **workspace**, so they are a school asset and follow the `shared_pool` / `individual_allocation` setting like any other credit.
- Cost per credit is shown on each pack card (`৳1.00 per credit`) as `price_paisa / credits`, rounded to 2 dp **for display only**.
- **No metered overage invoices, ever** (PRODUCT-DECISIONS 5.4). There is no code path that bills for AI usage after the fact.

### 5.4 Soft delete and the purge that actually runs

```
purge_after = deleted_at + interval '30 days'
```

A daily pg_cron job hard-deletes `expenses` rows past `purge_after`, deletes the attached receipt from storage and from `files`, and writes one `audit_events` row per purged expense (`expense.purged`, with the full prior row in `before`). The Deleted tab shows the exact purge date per row. The prototype's label was decorative; this one is a promise with a job behind it.

### 5.5 Expense validation

- `amount_paisa > 0` and `<= 10,000,000,000` (৳10 crore) — a sanity ceiling that catches a mistyped extra zero far better than no ceiling does.
- `spent_on` may not be more than 1 day in the future (an advance dated tomorrow is legitimate; one dated next year is a typo) and not earlier than `workspace.created_at - 2 years`.
- Amounts are typed in taka with up to 2 decimals and stored as paisa. The **client sends a string**; the server checks `^\d{1,9}(\.\d{1,2})?$` (after stripping thousands separators) and then computes `amount_paisa = round(parseFloat(s) * 100)`. No number crosses the wire, so no float rounding happens in a browser.
- Duplicate guard: creating an expense with the same `(workspace_id, amount_paisa, spent_on, vendor)` as an existing non-deleted row shows a soft warning (_"Looks like a duplicate of an entry on 3 June"_) with a _Save anyway_ option. Not a block — schools really do pay the same vendor the same amount twice.

### 5.6 What is deliberately **not** here

- **No card vault.** The prototype's `PaymentMethod` stored hand-typed brand/last-4/expiry with no PSP token — a decorative record that looked like a saved card and was not one. It is deleted and not replaced. SSLCommerz hosted checkout collects the instrument each time, and the billing page says _"You'll choose how to pay at checkout"_ instead of showing a fake card list.
- **No auto-billing toggle.** F-CM-06 §4.5 explains why: v1 sends renewal reminders rather than flipping a boolean with nothing behind it.
- **No import.** The prototype's import preview was two hardcoded rows and its Import button wrote nothing. Export exists; import waits for a real parser and a real column-mapping UI.
- **No integrations catalogue.** PRODUCT-DECISIONS 6.9 removes all 23 fake connectors.

### 5.7 AI billing model switch

`shared_pool` ↔ `individual_allocation`, owner-only, behind a confirm sheet explaining the effect: switching to `individual_allocation` opens the per-teacher daily cap editor; switching back pools everything from the next daily reset. The change takes effect at the **next** 00:00 reset, never mid-day, so nobody loses credits they were about to use. Writes `audit_events` and notifies admins.

---

## 6. UI

| Route                                 | Who                         | 360×800                                                                                    | ≥1024                                               | Primary action  | Empty                                           | Loading            | Error                 |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- | --------------- | ----------------------------------------------- | ------------------ | --------------------- |
| `/app/billing`                        | owner/admin                 | Plan card → This-month total + 4 rows → usage meters → AI model → pending requests → trend | Two-column: plan + spend left, meters + trend right | Upgrade / Renew | New school: _"Nothing billed yet"_ + trial card | Per-card skeletons | Per-card inline retry |
| `/app/billing/invoices`               | owner/admin                 | Cards: date, no, type chip, amount, Download                                               | Table + toolbar filters                             | Download        | _"No invoices yet"_                             | Skeleton rows      | Retry                 |
| `/app/billing/marketplace`            | owner/admin (+teacher, own) | MTD/YTD, pending request cards, then purchased list                                        | Two-column: queue left, purchased right             | Approve & pay   | _"No requests"_                                 | Skeleton           | Retry                 |
| `/app/billing/credits`                | owner/admin                 | Balance card (two numbers), daily grant, pack cards stacked                                | Balance + 3 packs in a row + usage chart            | Buy pack        | n/a                                             | Skeleton           | Alert                 |
| `/app/billing/expenses`               | owner/admin                 | Period total, filter chips, month-grouped cards, FAB **Add**                               | Table + filter sidebar + totals rail                | Add expense     | _"No expenses recorded"_ + Add                  | Skeleton           | Retry                 |
| `/app/billing/expenses` (Deleted tab) | owner/admin                 | Cards with purge date + Restore                                                            | Table                                               | Restore         | _"Nothing deleted"_                             | Skeleton           | Retry                 |
| `/app/billing/details`                | owner/admin                 | Billing profile form (F-CM-06 §6)                                                          | Two-column                                          | Save            | Prefilled                                       | Skeleton           | Inline                |
| `/app/billing/export`                 | owner/admin                 | Kind + period + format, then a ready-file list                                             | Same, inline panel                                  | Generate        | _"No exports yet"_                              | Progress           | Alert                 |

Components: `AppShell`, `PlanCard`, `SpendRow`, `UsageMeter`, `MoneyText`, `DataList`, `FormSheet`, `CategoryChips`, `FileDropTile`, `StatusChip`, `StackedBarChart`, `ConfirmSheet`, `EmptyState`, `Skeleton`.

**Phone specifics.** The month total is the largest type on the page (28 px), with the four rows beneath it at 16 px — a glance answers the question the page exists for. Category chips scroll horizontally with momentum and no visible scrollbar. The trend chart is 160 px tall, six bars, labels under, values on tap, drawn with the dataviz palette **plus pattern fills** so the four categories are distinguishable without colour.

---

## 7. Server contracts

| Name                         | Kind                                   | Input                                                                                                                                           | Output                                                                                                                            | Errors                                                    | Idempotency | Rate limit        |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------- | ----------------- |
| `getBillingOverview`         | RSC query                              | ctx                                                                                                                                             | `{plan, month:{total, subscription, marketplace, creditPacks, expenses}, trend[6], usage{}, aiBillingModel, pendingRequestCount}` | —                                                         | n/a         | 60/min            |
| `listInvoicesAndReceipts`    | RSC query                              | `{year?, type?, status?, cursor?}`                                                                                                              | `{items[], nextCursor}`                                                                                                           | —                                                         | n/a         | 60/min            |
| `listCreditPacks`            | RSC query                              | —                                                                                                                                               | `{packs[]}`                                                                                                                       | —                                                         | n/a         | cached 300 s      |
| `getCreditBalance`           | RSC query                              | ctx                                                                                                                                             | `{dailyGrant, dailyRemaining, purchasedBalance, resetsAt}`                                                                        | —                                                         | n/a         | 60/min            |
| `buyCreditPack`              | action                                 | `{packId, idempotencyKey}`                                                                                                                      | `{orderId}`                                                                                                                       | `PACK_UNAVAILABLE`, `NOT_A_SCHOOL_WORKSPACE`, `FORBIDDEN` | key         | 10/hour/workspace |
| `setAiBillingModel`          | action                                 | `{model:'shared_pool'\|'individual_allocation', idempotencyKey}`                                                                                | `{model, effectiveAt}`                                                                                                            | `NOT_OWNER`                                               | key         | 5/day/workspace   |
| `createExpense`              | action                                 | `{title, amount:string, spentOn, category, vendor?, paymentMode?, referenceNo?, notes?, receiptFileId?, acknowledgeDuplicate?, idempotencyKey}` | `{expenseId, duplicateWarning?}`                                                                                                  | `AMOUNT_INVALID`, `DATE_OUT_OF_RANGE`, `FORBIDDEN`        | key         | 200/day/workspace |
| `updateExpense`              | action                                 | `{expenseId, patch}`                                                                                                                            | `{updatedAt}`                                                                                                                     | `NOT_FOUND`, `ROW_DELETED`, `FORBIDDEN`                   | key         | 200/day           |
| `deleteExpense`              | action                                 | `{expenseId, confirmTitle}`                                                                                                                     | `{deletedAt, purgeAt}`                                                                                                            | `TITLE_MISMATCH`, `FORBIDDEN`                             | key         | 100/day           |
| `restoreExpense`             | action                                 | `{expenseId}`                                                                                                                                   | `{ok}`                                                                                                                            | `NOT_DELETED`, `PURGED`                                   | key         | 100/day           |
| `createExpenseReceiptTarget` | action                                 | `{mime, sizeBytes}`                                                                                                                             | `{fileId, uploadUrl}`                                                                                                             | `UNSUPPORTED_TYPE`, `TOO_LARGE`                           | key         | 100/day           |
| `requestBillingExport`       | action                                 | `{kind, format, periodStart, periodEnd}`                                                                                                        | `{exportId}`                                                                                                                      | `RANGE_TOO_LARGE`, `FORBIDDEN`                            | key         | 10/day/workspace  |
| `purgeExpenses`              | pg_cron `app.purge_deleted_expenses()` | —                                                                                                                                               | `{purged int}`                                                                                                                    | —                                                         | idempotent  | daily             |

---

## 8. Parts (build chunks)

**Part 1 — `expenses` schema, RLS, ledger UI, soft delete + real purge** _(2 days)_
Scope: migration with indexes and the delete-denied policy; the month-grouped `DataList` with filters and totals; add/edit `FormSheet` with server-side amount parsing; confirm-sheet delete; Deleted tab with real purge dates; `app.purge_deleted_expenses()` on pg_cron; audit on every mutation.
Files: `supabase/migrations/*_expenses.sql`, `packages/db/repositories/expenses.ts`, `apps/web/app/(school)/app/billing/expenses/*`.
Tests: pgTAP — a teacher, a staff member and a parent each get 0 rows; hard delete denied for every role including platform admin; `workspace_id`/`created_by` immutability. Unit — amount string parsing (`"1,250.50"`, `"0"`, `"1.234"`, `"abc"`), date-range rules, duplicate detection. Integration — purge removes the row, the storage object and the `files` row and writes one audit event.
**Demo:** record a ৳1,250 printing expense with a photographed receipt on a phone, delete it, see the real purge date, restore it.

**Part 2 — Receipts (private files) + export** _(1 day)_
Scope: `createExpenseReceiptTarget`, magic-byte sniffing and EXIF strip, signed-URL viewing, `billing_exports` with real CSV/XLSX generation and a stable column contract.
Tests: another workspace's receipt is 403 and logged; the export file contains exactly the filtered rows and its total matches the UI.
**Demo:** export a year of expenses and open the CSV in a spreadsheet.

**Part 3 — `billing_summaries_v` + the overview page** _(2 days)_
Scope: the view with timezone-correct month boundaries; `getBillingOverview`; the plan card (from F-CM-06); the four spend rows; usage meters reading `usage_counters` with a real storage figure; the 6-month trend; per-card skeletons and inline retries.
Tests: the traceability assertion (§5.2) for all four figures on seeded data; timezone boundary at 23:59 and 00:01 Dhaka; `security_invoker` means a teacher reading the view gets nothing; the grep test asserting no hardcoded money string exists in any billing component.
**Demo:** an overview showing four non-zero, clickable figures that each sum correctly on their detail page.

**Part 4 — Invoices and receipts list** _(1 day)_
Scope: the unified list over `invoices` + workspace-funded `orders`, filters, and a working download handler on every row.
Tests: cross-workspace IDOR on both document types; a test that walks the rendered list and fetches each download link.
**Demo:** download a subscription invoice and a marketplace receipt from the same list.

**Part 5 — AI credit packs: purchase and fulfilment** _(1.5 days)_
Scope: `credit_packs` + seed + the `/platform` editor entry; `/app/billing/credits` with the two-number balance; pack cards with cost-per-credit; confirm sheet; `buyCreditPack` → F-CM-01 checkout; the `credit_pack` fulfilment handler appending to `ai_credit_ledger` idempotently; receipt; audit.
Tests: a replayed IPN grants credits once; a failed payment grants none; consumption order (grant first, purchased second) asserted against the ledger; purchased credits survive the daily reset.
**Demo:** buy a ৳499 pack in sandbox and watch the purchased balance rise by 500 **after** the IPN, with nothing granted before it.

**Part 6 — Marketplace spending view + AI billing model switch** _(1 day)_
Scope: `/app/billing/marketplace` combining the F-CM-04 approvals queue with the purchased list and MTD/YTD figures; the teacher's own-requests-only view; `setAiBillingModel` with next-reset semantics and the per-teacher cap editor entry point.
Tests: a teacher sees only their own requests (policy-level, not UI-level); the model switch takes effect at the next reset and is audited.
**Demo:** an admin approves a pending request and sees the month's marketplace figure move by exactly that amount.

---

## 9. Acceptance criteria

1. **Given** a school with a paid subscription, two workspace-funded marketplace orders, one credit pack and five expenses this month **when** an owner opens `/app/billing` **then** the four figures are the true sums of those rows and the total equals their sum, with no hardcoded value anywhere in the rendered output.
2. **Given** each of those four figures **when** the owner taps its row **then** the detail list's rows sum to exactly the figure shown.
3. **Given** two schools **when** each opens `/app/billing` **then** neither sees a single row belonging to the other, confirmed by pgTAP cross-tenant tests on `expenses`, `invoices`, `orders` and the summary view.
4. **Given** a teacher, a staff member or a parent **when** they query `expenses` with their own JWT **then** they get zero rows, and `/app/billing` returns 404 for them.
5. **Given** a teacher **when** they open `/app/billing/marketplace` **then** they see only their own purchase requests and no school financial figures.
6. **Given** an admin records an expense of `1,250.50` **when** it is saved **then** `amount_paisa = 125050`, parsed server-side from a string, and no number was sent by the client.
7. **Given** an expense of `৳0`, `৳-50`, or a date two years in the future **when** submitted **then** each is rejected with its own specific message.
8. **Given** an expense identical in amount, date and vendor to an existing one **when** submitted **then** a duplicate warning appears with _Save anyway_, and saving anyway succeeds.
9. **Given** an expense is deleted **when** the Deleted tab is opened **then** it shows a purge date exactly 30 days out; **and when** the purge job runs after that date **then** the row, the storage object and the `files` row are gone and one `expense.purged` audit event holds the full prior row.
10. **Given** a deleted expense **when** it is restored before purge **then** it reappears with its receipt intact.
11. **Given** a receipt file **when** a member of another workspace requests it by id **then** it is 403 and the attempt is written to `file_access_log`.
12. **Given** an admin buys the ৳499 / 500-credit pack **when** the IPN is validated **then** exactly one `ai_credit_ledger` row of +500 appears; **and when** the same IPN is replayed **then** no second row appears.
13. **Given** a failed credit-pack payment **then** no credits are granted and the balance is unchanged.
14. **Given** a workspace with 120 of 400 daily credits remaining and 1,340 purchased **when** an AI action costs 150 **then** the daily 120 is consumed first and 30 comes from the purchased balance, leaving `0 / 400` and `1,310`.
15. **Given** the daily reset at 00:00 Asia/Dhaka **then** the grant returns to 400 and the purchased balance is unchanged.
16. **Given** an owner switches the AI billing model **then** it is audited and takes effect at the next daily reset, not immediately; **and given** an admin (not owner) attempts it **then** it returns `NOT_OWNER`.
17. **Given** the storage meter **when** rendered **then** it shows a value computed from `sum(files.size_bytes)` for that workspace, and a test that uploads a 5 MB file sees the meter move.
18. **Given** an export request for a year of expenses **then** a real file is produced whose row count and total match the UI for the same filters.
19. **Given** `/app/billing` at 360×800 **then** the month total is the largest element, all four spend rows and the primary action are reachable without horizontal scroll, the trend chart is distinguishable without colour, and axe reports zero serious violations.
20. **Given** any billing component **when** CI runs the grep test **then** no hardcoded currency or quota string (`৳ 0`, `34 GB`, a numeric literal passed to `MoneyText`) is present — the exact regression the prototype shipped.

---

## 10. Tests

- **Unit (domain):** amount string parsing and paisa conversion; month-boundary computation in the workspace timezone; the four-term total; credit consumption order; duplicate detection; purge-date arithmetic; export column contract.
- **DB (pgTAP):** isolation and escalation on `expenses`, `billing_exports`, `credit_packs`; hard-delete denial for every role; the immutability trigger; `billing_summaries_v` honouring invoker RLS; cross-tenant reads returning 0 rows on all four sources.
- **Integration:** the traceability assertion for all four figures; the purge job end to end including storage; credit-pack fulfilment idempotency under a double capture; a refund reducing the original month's marketplace figure; AI-model switch timing.
- **e2e (360×800 and 1280×800):** admin records an expense with a camera receipt, deletes and restores it; owner buys a credit pack in sandbox and sees the balance rise; admin downloads an invoice and a receipt; teacher is correctly barred; axe on every billing screen.
- **Security:** IDOR on expenses, receipts, exports, invoices and orders by id enumeration; a receipt signed URL after expiry (403); an assertion that no billing endpoint returns a row from another `workspace_id` under any parameter combination.
- **Regression (prototype-specific):** a test asserting the literal string `'default'` appears as a workspace id nowhere in the codebase or the seeded database; the hardcoded-money grep test; a test that every Download button in the invoices list has a working handler.
- **Performance:** `/app/billing` p95 < 500 ms with 5 years of history (the summary view is indexed on `(workspace_id, month_start)`); expense list p95 < 400 ms at 10,000 rows; a 10,000-row export completes in < 20 s as a job.

---

## 11. Open questions

1. **Financial-year boundary.** Bangladesh's government FY runs July–June; many private schools use January–December. _Default assumed:_ a `school_profiles.financial_year_start_month` setting, default **7** (July), used only by the "current financial year" default filter — never by the monthly summary.
2. **Should expenses feed a wider accounting module** (heads, budgets, approval chains)? _Default assumed:_ no in v1 — this is a ledger, not an accounting system. Category totals and export are the bridge to whatever the school actually uses.
3. **Print costs flowing in automatically.** `ManualExpense.category='printing'` hinted at it. _Default assumed:_ not in v1; print jobs have no cost model until the Windows print agent ships (PRODUCT-DECISIONS 6.4).
4. **Multi-currency or foreign vendors.** _Default assumed:_ BDT only; the `currency` column exists for later.
5. **Who else should see the expense ledger?** A bursar is usually not an `admin`. _Default assumed:_ owner/admin only in v1; if schools ask, this becomes a `finance` custom label mapped to `admin` (PRODUCT-DECISIONS 1.4 already supports the label mechanism) or a dedicated permission key.
6. **Credit-pack refunds.** _Default assumed:_ a refunded credit pack appends a negative `ai_credit_ledger` entry, which can drive the purchased balance below zero if the credits were already spent; the balance is clamped to 0 for display and the shortfall is absorbed. Flagged for the owner — refusing refunds on consumed credits is the equally defensible alternative.
