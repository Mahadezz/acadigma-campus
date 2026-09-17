# F-CM-08 — Student fee collection (school as merchant of record)

|                  |                                                                                                                                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | billing (school-side finance — **not** Acadigma revenue)                                                                                                                                                                                                                           |
| Status           | planned                                                                                                                                                                                                                                                                            |
| Owner branch     | `feat/commerce-fee-collection`                                                                                                                                                                                                                                                     |
| Depends on       | F-CM-01 (`PaymentProvider` interface, IPN infrastructure, idempotency — **with the amendments in §12**), F-AC-0x (students, enrolments, sections, academic years), F-AU-02 (workspaces, members, guardians), F-OP-0x (files, PDF, Bengali fonts), F-CM-06 (the `fees` plan module) |
| Plan             | `docs/plan/ROADMAP.md` — R1.5, ahead of the marketplace chunks                                                                                                                                                                                                                     |
| Base44 reference | none — the prototype had **no student fee module at all**                                                                                                                                                                                                                          |
| Market reference | `docs/product/research/COMPETITORS.md` §1.1, §1.2, §5.1, §6.4, §6.5, §7a(1), §7 gap matrix                                                                                                                                                                                         |

> **Schema note.** Every table and column below is **proposed; `docs/architecture/DATA-MODEL.md` wins**.
>
> **Money-flow note, and it governs everything here.** Acadigma is **never** the merchant of record for a school fee, never holds a taka of school money, and takes **no commission** on fee collection. The school's own SSLCommerz or bKash merchant account receives the funds directly. Acadigma provides the ledger, the checkout hand-off and the reconciliation. This is a deliberate regulatory posture (COMPETITORS.md §6.4 pt 4, §7a rec 1): being in the flow of funds would make Acadigma a payment aggregator, with the licensing, treasury and settlement-risk exposure that implies.

---

## 1. Purpose

Every Bangladeshi school-software vendor leads with fee collection — it is first or second on every competitor's feature list, and the market research calls it "the anchor module" and "the single most important structural fact" of the category (COMPETITORS.md §1.1). bKash has already trained Bangladeshi parents that _school fees are paid inside bKash, by Student ID_, live for roughly a thousand institutions, with USSD support for feature phones. Third parties sell the ERP↔bKash reconciliation bridge as a standalone paid product, which proves there is a market for this layer alone.

Acadigma Campus today has SaaS billing for the school and an expense ledger, and **no way for a parent to pay tuition**. The gap matrix marks this as one of two 🔴 ship-blockers for the mid-market: a school will not replace its existing system with one that cannot collect money, however fast attendance is.

This feature builds: fee heads and structures per grade/section/academic year, discounts and waivers, an **arrears-aware per-student ledger** (the BD structure is admission fee + annual session charge + monthly tuition + exam/transport extras, not a flat recurring charge — COMPETITORS.md §6.5), guardian invoices on a monthly or termly cycle, school-configurable due dates and late fees, office recording of cash and bank payments, online payment by **student ID** through the school's **own** SSLCommerz or bKash merchant account, Bengali receipt PDFs, a defaulter list, collection reports, metered reminders, reconciliation, refunds and adjustments, accountant exports, and a parent-portal _Pay now_ with history.

**Done looks like:** the office publishes January invoices for Class 6 in one action; a parent gets a notification and an SMS, opens `/family/fees` on a ৳8,000 phone, taps _Pay ৳4,500_, completes bKash, and has a Bengali receipt in eleven seconds — while the money landed in the school's own bKash merchant account and Acadigma took nothing. On the 12th, the office opens the defaulter list, sees 23 students, sends one reminder batch and knows exactly what it cost.

---

## 2. Roles and permissions

| Action                                  | Permission key            | owner | admin | cashier¹      | teacher | staff | parent | platform          |
| --------------------------------------- | ------------------------- | ----- | ----- | ------------- | ------- | ----- | ------ | ----------------- |
| Define fee heads and structures         | `fees.structure.write`    | ✔     | ✔     | —             | —       | —     | —      | —                 |
| Assign / override a student's fee plan  | `fees.assignment.write`   | ✔     | ✔     | —             | —       | —     | —      | —                 |
| Grant a discount / waiver / scholarship | `fees.discount.grant`     | ✔     | ✔     | —             | —       | —     | —      | —                 |
| Approve a waiver above the threshold    | `fees.discount.approve`   | ✔     | —     | —             | —       | —     | —      | —                 |
| Generate / publish an invoice run       | `fees.invoice.run`        | ✔     | ✔     | —             | —       | —     | —      | —                 |
| Void an invoice                         | `fees.invoice.void`       | ✔     | ✔     | —             | —       | —     | —      | —                 |
| Record an offline payment (cash/bank)   | `fees.payment.record`     | ✔     | ✔     | ✔             | —       | —     | —      | —                 |
| Cancel / correct a recorded payment     | `fees.payment.correct`    | ✔     | ✔     | own, same day | —       | —     | —      | —                 |
| Configure merchant credentials          | `fees.merchant.configure` | ✔     | —     | —             | —       | —     | —      | —                 |
| View the fee ledger of any student      | `fees.ledger.read`        | ✔     | ✔     | ✔             | —       | —     | —      | —                 |
| View **their own children's** ledger    | `fees.ledger.read.own`    | —     | —     | —             | —       | —     | ✔      | —                 |
| Pay online                              | `fees.pay`                | ✔     | ✔     | ✔             | ✔       | ✔     | ✔      | —                 |
| View collection reports                 | `fees.report.read`        | ✔     | ✔     | ✔             | —       | —     | —      | —                 |
| Send reminders                          | `fees.reminder.send`      | ✔     | ✔     | ✔             | —       | —     | —      | —                 |
| Issue a refund / adjustment             | `fees.refund.issue`       | ✔     | ✔     | —             | —       | —     | —      | —                 |
| Export for accountants                  | `fees.export`             | ✔     | ✔     | ✔             | —       | —     | —      | —                 |
| Read fee data for support               | —                         | —     | —     | —             | —       | —     | —      | **✘** (see §5.13) |

¹ **`cashier` is not a new membership role.** It is a `custom_labels` display name (typically "Accountant" or "Bursar") mapped to base role `staff`, plus a per-member capability grant `fees.cashier` on a new `workspace_member_capabilities` table _(proposed: `workspace_id, user_id, capability, granted_by, granted_at`)_. PRODUCT-DECISIONS 1.4 and 1.5 fix the five base roles; a school's bursar is almost never an `admin`, and giving them `admin` to take cash would hand them student records and school settings. This capability grant is the minimum viable answer and is flagged in §11.

**Teachers see nothing.** A teacher must never be able to see which child's family is behind on fees — it is the most consequential piece of information in a school and the fastest way to harm a student. There is no policy granting `teacher` a single row in this feature, and an acceptance criterion asserts it across every table.

---

## 3. Data

Tenant key: `workspace_id` on **every** table, no exceptions. All amounts `bigint` paisa, `currency char(3)` default `'BDT'`. All rates in basis points.

### 3.1 `fee_heads` _(new; proposed)_

A named charge type, seeded per school from a BD default list.

| column                             | type                           | notes                                                                                                                  |
| ---------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `id`                               | uuid pk                        |
| `workspace_id`                     | uuid not null → workspaces     |
| `code`                             | text not null                  | `tuition`, `admission`, `session`, `exam`, `transport`, `lab`, `library`, `sports`, `development`, `late_fee`, `other` |
| `name_en` / `name_bn`              | text not null                  | both required; Bengali is the parent-facing string                                                                     |
| `kind`                             | `fee_head_kind` not null       | `recurring \| one_time \| optional`                                                                                    |
| `default_frequency`                | `fee_frequency` null           | `monthly \| termly \| yearly \| on_admission \| ad_hoc`                                                                |
| `is_refundable`                    | boolean not null default true  | a security deposit is; an exam fee usually is not                                                                      |
| `is_taxable`                       | boolean not null default false | reserved; BD school fees are generally VAT-exempt                                                                      |
| `ledger_code`                      | text null                      | the school's own accounting code, carried into exports                                                                 |
| `sort`                             | int not null default 0         |
| `active`                           | boolean not null default true  |
| `created_at/updated_at/created_by` |                                |                                                                                                                        |

Indexes: unique `(workspace_id, code)`, `(workspace_id, active, sort)`.

### 3.2 `fee_structures` and `fee_structure_items` _(new; proposed)_

A structure is a **versioned** price list scoped to an academic year and a target.

`fee_structures`: `id`, `workspace_id`, `academic_year_id`, `name`, `scope` (`grade | section | student_group`), `grade_level_id` null, `section_id` null, `student_group_id` null, `version int not null default 1`, `status` (`draft | active | superseded`), `effective_from date`, `effective_to date null`, `created_by`, `created_at`, `updated_at`.

Unique partial `(workspace_id, academic_year_id, scope, coalesce(grade_level_id, section_id, student_group_id)) where status='active'` — **one active structure per target per year**. This is the constraint that prevents the classic ERP bug of two overlapping fee schedules silently double-billing a child.

`fee_structure_items`: `id`, `workspace_id`, `fee_structure_id`, `fee_head_id`, `amount_paisa bigint not null`, `frequency fee_frequency not null`, `due_day_of_month int null` (1–28, §5.4), `months int[] null` (for termly/custom cycles, e.g. `{1,4,7,10}`), `is_optional boolean not null default false`, `applies_from_month int null`, `applies_to_month int null`, `sort int`. Unique `(fee_structure_id, fee_head_id, frequency)`.

**Versioning rule:** an active structure is **immutable once any invoice references it**. Editing creates version _n+1_ in `draft`; activating it supersedes _n_ with `effective_to = new.effective_from - 1 day`. Issued invoices are never retro-priced (§5.3).

### 3.3 `student_fee_assignments` and `student_fee_overrides` _(new; proposed)_

`student_fee_assignments`: `id`, `workspace_id`, `student_id`, `academic_year_id`, `fee_structure_id`, `status` (`active | ended`), `effective_from date`, `effective_to date null`, `transport_opted boolean not null default false`, `transport_route_id uuid null`, `notes`, `assigned_by`, `created_at`, `updated_at`. Unique partial `(workspace_id, student_id, academic_year_id) where status='active'`.

`student_fee_overrides`: `id`, `workspace_id`, `student_id`, `academic_year_id`, `fee_head_id`, `override_amount_paisa bigint null`, `suppressed boolean not null default false`, `reason text not null`, `approved_by`, `created_at`. For the one child whose transport is billed differently or whose lab fee is structurally waived. Unique `(workspace_id, student_id, academic_year_id, fee_head_id)`.

### 3.4 `fee_discounts` _(new; proposed)_ — discounts, waivers, scholarships

| column                                             | type                                         | notes                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                               | uuid pk                                      |
| `workspace_id`                                     | uuid not null                                |
| `student_id`                                       | uuid not null → students                     |
| `academic_year_id`                                 | uuid not null                                |
| `kind`                                             | `discount_kind` not null                     | `sibling \| merit_scholarship \| need_based \| staff_child \| freedom_fighter \| orphan \| management \| early_payment \| other` |
| `scope`                                            | `discount_scope` not null                    | `all_heads \| specific_head`                                                                                                     |
| `fee_head_id`                                      | uuid null                                    | required when `scope='specific_head'`                                                                                            |
| `method`                                           | `discount_method` not null                   | `percentage \| fixed_per_period \| fixed_total`                                                                                  |
| `percent_bps`                                      | int null                                     | `2500` = 25 %                                                                                                                    |
| `amount_paisa`                                     | bigint null                                  | for the two fixed methods                                                                                                        |
| `valid_from` / `valid_to`                          | date not null / date null                    |                                                                                                                                  |
| `max_total_paisa`                                  | bigint null                                  | lifetime cap on a `percentage` discount                                                                                          |
| `consumed_paisa`                                   | bigint not null default 0                    | maintained by trigger as invoices are issued                                                                                     |
| `status`                                           | `discount_status` not null default `pending` | `pending \| approved \| rejected \| active \| expired \| revoked`                                                                |
| `requires_approval`                                | boolean not null                             | computed at insert (§5.6)                                                                                                        |
| `approved_by` / `approved_at` / `rejection_reason` |                                              |                                                                                                                                  |
| `evidence_file_id`                                 | uuid null → files                            | **private** — a need-based waiver is backed by documents                                                                         |
| `reason`                                           | text not null                                | ≥ 10 chars                                                                                                                       |
| `created_by` / `created_at` / `updated_at`         |                                              |                                                                                                                                  |

Check: exactly one of `percent_bps` / `amount_paisa` is non-null, matching `method`.
Indexes: `(workspace_id, student_id, academic_year_id) where status='active'`, `(workspace_id, status) where status='pending'`, `(workspace_id, kind)`.

### 3.5 `fee_invoices` and `fee_invoice_lines` _(new; proposed)_

| `fee_invoices` column                     | type                                          | notes                                                        |
| ----------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `id`                                      | uuid pk                                       |
| `workspace_id`                            | uuid not null                                 |
| `invoice_no`                              | text not null                                 | `FEE-2026-000184`, **gapless** per workspace per year (§5.9) |
| `student_id`                              | uuid not null → students                      |
| `academic_year_id`                        | uuid not null                                 |
| `run_id`                                  | uuid null → fee_invoice_runs                  |
| `period_kind`                             | `fee_period_kind` not null                    | `monthly \| termly \| yearly \| one_time`                    |
| `period_label`                            | text not null                                 | `January 2026`, `Term 1 2026`, `Admission 2026`              |
| `period_start` / `period_end`             | date not null                                 |
| `issued_on` / `due_on`                    | date not null                                 |
| `gross_paisa`                             | bigint not null                               | Σ line gross                                                 |
| `discount_paisa`                          | bigint not null default 0                     | Σ line discount                                              |
| `late_fee_paisa`                          | bigint not null default 0                     | recomputed **absolutely** by the job (§5.7)                  |
| `adjustment_paisa`                        | bigint not null default 0                     | signed; manual corrections                                   |
| `total_paisa`                             | bigint not null                               | `gross - discount + late_fee + adjustment`                   |
| `paid_paisa`                              | bigint not null default 0                     | Σ allocations, maintained by trigger                         |
| `refunded_paisa`                          | bigint not null default 0                     |
| `balance_paisa`                           | bigint **generated**                          | `total_paisa - paid_paisa + refunded_paisa`                  |
| `status`                                  | `fee_invoice_status` not null default `draft` | §5.2                                                         |
| `currency`                                | char(3) not null default `'BDT'`              |
| `pdf_file_id`                             | uuid null → files                             | private, Bengali                                             |
| `voided_at` / `void_reason` / `voided_by` |                                               |                                                              |
| `created_at/updated_at`                   |                                               |                                                              |

Indexes: unique `(workspace_id, invoice_no)`, `(workspace_id, student_id, period_start desc)`, `(workspace_id, status, due_on) where status in ('issued','partially_paid','overdue')` (the defaulter query), `(run_id)`.

`fee_invoice_lines`: `id`, `workspace_id`, `fee_invoice_id`, `fee_head_id`, `head_name_en_snapshot`, `head_name_bn_snapshot`, `gross_paisa`, `discount_paisa`, `discount_id` null, `net_paisa`, `sort`. **All amounts and names are snapshots**; changing a structure or a head later never rewrites an issued invoice.

### 3.6 `fee_invoice_runs` _(new; proposed)_

`id`, `workspace_id`, `academic_year_id`, `period_kind`, `period_label`, `period_start`, `period_end`, `issued_on`, `due_on`, `target` (`all | grade | section | student_ids`), `target_ref jsonb`, `status` (`draft | previewed | published | partially_failed | cancelled`), `student_count`, `invoice_count`, `gross_paisa`, `discount_paisa`, `total_paisa`, `errors jsonb`, `created_by`, `published_by`, `published_at`, `created_at`.

Unique partial `(workspace_id, academic_year_id, period_kind, period_label, target, target_ref) where status='published'` — January cannot be published twice for the same target.

### 3.7 `fee_transactions` _(new; proposed)_ — the money-received record

One row per receipt of money, whatever the channel.

| column                                                                        | type                                        | notes                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                                                                          | uuid pk                                     |
| `workspace_id`                                                                | uuid not null                               |
| `receipt_no`                                                                  | text not null                               | `RCP-2026-001902`, gapless per workspace per year                                   |
| `student_id`                                                                  | uuid not null → students                    |
| `channel`                                                                     | `fee_channel` not null                      | `cash \| bank_deposit \| cheque \| online_sslcommerz \| online_bkash \| adjustment` |
| `amount_paisa`                                                                | bigint not null                             | `> 0`                                                                               |
| `currency`                                                                    | char(3) not null default `'BDT'`            |
| `received_on`                                                                 | date not null                               | when the money arrived (may differ from `created_at` for a backdated deposit)       |
| `status`                                                                      | `fee_txn_status` not null default `pending` | §5.2                                                                                |
| `paid_by_name` / `paid_by_relation` / `paid_by_phone`                         | text null                                   | who handed over the cash                                                            |
| `bank_name` / `bank_branch` / `deposit_slip_no` / `cheque_no` / `cheque_date` | text null                                   | offline detail                                                                      |
| `slip_file_id`                                                                | uuid null → files                           | private; photo of the deposit slip                                                  |
| `payment_id`                                                                  | uuid null → fee_payments                    | set for online channels                                                             |
| `unallocated_paisa`                                                           | bigint not null default 0                   | received but not yet applied (§5.8)                                                 |
| `receipt_file_id`                                                             | uuid null → files                           | private, Bengali                                                                    |
| `reversal_of`                                                                 | uuid null → fee_transactions                |
| `reversed_at` / `reversal_reason`                                             |                                             |                                                                                     |
| `recorded_by`                                                                 | uuid not null → profiles                    | the cashier                                                                         |
| `notes`                                                                       | text null                                   |
| `created_at/updated_at`                                                       |                                             |                                                                                     |

Indexes: unique `(workspace_id, receipt_no)`, `(workspace_id, student_id, received_on desc)`, `(workspace_id, received_on)` (daily collection report), `(workspace_id, channel, received_on)`, unique `(payment_id) where payment_id is not null`.

### 3.8 `fee_allocations` _(new; proposed)_ — which money paid which invoice

`id`, `workspace_id`, `fee_transaction_id`, `fee_invoice_id`, `fee_invoice_line_id` null, `amount_paisa bigint not null`, `allocated_by` (`system_fifo | manual`), `created_by`, `created_at`, `reversed_at` null.

This table is why the ledger is arrears-aware rather than a running total: a ৳5,000 payment against ৳12,000 of arrears is four explicit allocations, and the receipt says exactly which months it cleared. Indexes: `(workspace_id, fee_invoice_id)`, `(fee_transaction_id)`.

### 3.9 `fee_merchant_accounts` _(new; proposed)_ — the school's own gateway credentials

**The most security-sensitive table in the product after `seller_payout_methods`.**

| column                                     | type                                            | notes                                                                         |
| ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`                                       | uuid pk                                         |
| `workspace_id`                             | uuid not null → workspaces                      |
| `provider`                                 | `fee_provider` not null                         | `sslcommerz \| bkash`                                                         |
| `mode`                                     | text not null                                   | `sandbox \| live`                                                             |
| `label`                                    | text null                                       |
| `merchant_ref`                             | text not null                                   | SSLCommerz `store_id` / bKash username — not secret, shown masked             |
| `credentials_encrypted`                    | bytea not null                                  | **pgsodium**: `{store_passwd}` or `{app_key, app_secret, username, password}` |
| `webhook_path_token`                       | text not null unique                            | 32-char random segment on this workspace's IPN URL                            |
| `status`                                   | `merchant_status` not null default `unverified` | `unverified \| verifying \| active \| failed \| disabled`                     |
| `verified_at` / `last_verify_error`        |                                                 |                                                                               |
| `settlement_account_note`                  | text null                                       | free text, for the school's own reference                                     |
| `is_default`                               | boolean not null default false                  | partial unique: one default per workspace                                     |
| `created_by` / `created_at` / `updated_at` |                                                 |                                                                               |

Indexes: unique `(workspace_id, provider, mode)`, unique `(webhook_path_token)`, partial unique `(workspace_id) where is_default`.

**Encryption and access.** pgsodium with a vault key, `id` as associated data. The column is **revoked from every database role**. The only reader is `app.reveal_fee_merchant_credentials(account_id)`, a `SECURITY DEFINER` function callable **only by the service role from within a payment operation** — not by owners, not by admins, not by platform staff, and never from a server action that returns to a browser. Writing mirrors it: `app.set_fee_merchant_credentials(account_id, payload)` takes plaintext, encrypts, returns nothing. Both write `audit_events`. A CI grep asserts `credentials_encrypted` appears in exactly two files.

**Platform staff cannot read a school's gateway password.** A deliberate asymmetry with `seller_payout_methods`, where staff must read an account number to make a transfer: here nobody at Acadigma ever needs the value, so nobody gets it. If a school loses their credentials they re-enter them; we cannot recover them, and the UI says so before they save.

### 3.10 `fee_payments` _(new; proposed)_ — online attempts, **separate from `payments`**

Mirrors F-CM-01's `payments` state machine in a different table, because this is the school's money (§12 conflict 2).

`id`, `workspace_id`, `student_id`, `merchant_account_id`, `provider`, `provider_mode`, `tran_id text not null unique` (`FEE-<base32(id)>`), `amount_paisa`, `currency`, `status` (`created|pending|captured|failed|cancelled|expired|disputed`), `intent jsonb` (`{invoiceIds[], allocationPlan}` snapshotted at creation), `session_key`, `gateway_url`, `val_id text unique null`, `bank_tran_id`, `provider_payment_id` (bKash's `paymentID`), `card_type`/`card_brand`/`card_issuer`/`card_no_masked`, `store_amount_paisa`, `mdr_estimate_paisa`, `risk_level`, `failure_code`/`failure_reason`, `validated_at`, `expires_at`, `initiated_by uuid null` (parent or office user; null for a public student-ID payment), `created_at/updated_at`.

Indexes: unique `(tran_id)`, unique `(val_id) where val_id is not null`, `(workspace_id, status, created_at desc)`, `(student_id, created_at desc)`.

### 3.11 `fee_refunds` _(new; proposed)_

`id`, `workspace_id`, `fee_transaction_id`, `fee_payment_id` null, `student_id`, `amount_paisa`, `method` (`cash | bank | gateway`), `reason_code` (`overpayment | duplicate | withdrawal | fee_revision | error | other`), `reason_note text not null`, `status` (`requested|processing|settled|failed`), `refund_trans_id`, `provider_ref_id`, `approved_by`, `settled_on date`, `bank_reference`, `receipt_file_id`, `created_by`, `created_at/updated_at`.

### 3.12 `fee_reminders`, `fee_reminder_batches`, `sms_credits_ledger` _(new; proposed)_

`fee_reminder_batches`: `id`, `workspace_id`, `trigger` (`manual | scheduled_before_due | scheduled_overdue`), `channel_set text[]`, `target_filter jsonb`, `recipient_count`, `sms_count`, `sms_cost_paisa_estimate`, `sms_cost_paisa_actual`, `status` (`draft|estimating|sending|sent|partially_failed|cancelled`), `created_by`, `created_at`, `completed_at`.

`fee_reminders`: `id`, `workspace_id`, `batch_id`, `student_id`, `guardian_user_id` null, `phone_masked`, `channel`, `provider_message_id`, `status` (`queued|sent|delivered|failed|suppressed`), `failure_reason`, `credits_used int`, `sent_at`, `created_at`.

`sms_credits_ledger` _(shared with the messaging area)_: `id`, `workspace_id`, `delta int`, `source` (`purchase|usage|comp|refund|expiry`), `reference_id`, `balance_after`, `created_at`. Append-only. Purchased through a `credit_pack`-shaped flow on **Acadigma's** merchant account — it is our cost being passed through — unlike fee payments.

### 3.13 `fee_settings` _(new; proposed, one row per workspace)_

`workspace_id pk`, `default_due_day int not null default 10`, `grace_days int not null default 0`, `late_fee_enabled bool not null default false`, `late_fee_method` (`flat | percent_of_outstanding | per_day`), `late_fee_flat_paisa`, `late_fee_percent_bps`, `late_fee_per_day_paisa`, `late_fee_cap_paisa`, `late_fee_max_days int`, `late_fee_head_id`, `allow_partial_payment bool not null default true`, `min_online_payment_paisa bigint not null default 1000`, `allocation_strategy` (`oldest_first | head_priority`), `waiver_approval_threshold_paisa bigint not null default 500000`, `public_pay_enabled bool not null default true`, `receipt_language` (`bn | en | both`) default `both`, `receipt_prefix`, `receipt_footer_bn`, `receipt_footer_en`, `institution_seal_file_id`, `signatory_name`, `signatory_designation`, `reminder_days_before int[] default '{3}'`, `reminder_days_after int[] default '{1,7,15}'`, `updated_by`, `updated_at`.

### 3.14 RLS policies — in words

**`fee_heads`, `fee_structures`, `fee_structure_items`, `fee_settings`**

- _select_: `app.has_role(workspace_id,'{owner,admin}')`, plus any member holding the `fees.cashier` capability. **Not** teachers, **not** staff without the capability, **not** parents (a parent sees their own invoice lines, not the school's whole price list).
- _insert/update_: `app.has_role(workspace_id,'{owner,admin}')` only, `workspace_id` forced by `with check`. A trigger blocks any change to a `fee_structures` row whose version is referenced by an issued invoice.
- _delete_: denied to all. Deactivate instead.

**`student_fee_assignments`, `student_fee_overrides`**: _select_ owner/admin/cashier; _insert/update_ owner/admin; _delete_ denied. Parents do not read these — they read invoices.

**`fee_discounts`**

- _select_: owner/admin/cashier for their workspace; **the guardians of that student** via `app.is_guardian_of(student_id)` — a family is entitled to know what discount they have been granted — **except** `reason` and `evidence_file_id`, exposed only to owner/admin (a need-based waiver's justification is not something to hand back verbatim, and the file may contain third-party information). Enforced by `fee_discounts_guardian_v` with a frozen column list plus a column-level revoke.
- _insert_: owner/admin; `status` forced to `pending` when `requires_approval`, else `active`.
- _update_: owner only for approve/reject; owner/admin for revoke. A trigger forbids a non-owner setting `status='approved'` and forbids anyone writing `consumed_paisa`.
- _delete_: denied.

**`fee_invoices`, `fee_invoice_lines`**

- _select_: owner/admin/cashier see all rows in their workspace; **a guardian sees rows where `app.is_guardian_of(student_id)` and `status <> 'draft'`** — a draft invoice is the school's working document and must not be visible before publication; platform staff see **none** (§5.13).
- _insert/update_: denied to every role. Invoices are written by the run engine and the late-fee job under the service role, and by the void action.
- _delete_: denied to everyone, always. A wrong invoice is voided and keeps its number.

**`fee_transactions`, `fee_allocations`**

- _select_: owner/admin/cashier; guardian for their own children's rows (so a parent can re-download every receipt); platform staff none.
- _insert_: **denied to every role, including the cashier.** Recording a payment goes through `recordOfflinePayment`, which assigns the gapless receipt number, computes the allocation and writes both tables in one transaction. A direct insert path would let a cashier mint a receipt number out of sequence — exactly what a cash-handling audit exists to catch.
- _update_: denied. A wrong receipt is **reversed** by a compensating row with `reversal_of` set, never edited.
- _delete_: denied.

**`fee_merchant_accounts`**

- _select_: `app.has_role(workspace_id,'{owner}')` **only**, and `credentials_encrypted` is revoked from every role including that one (the owner sees masked `merchant_ref`, `status`, `verified_at`). Admins cannot see the row at all. Platform staff cannot see it at all.
- _insert/update_: owner only, through the set-credentials function.
- _delete_: owner, blocked by trigger while any `fee_payments` row for that account is non-terminal.

**`fee_payments`**: _select_ owner/admin/cashier; the `initiated_by` user; the guardian of the student. `session_key`, `gateway_url` and `intent` are exposed only to the initiator. _insert/update/delete_: denied to all (service role only).

**`fee_refunds`**: _select_ owner/admin/cashier + guardian of the student; _insert/update_ owner/admin via the action; _delete_ denied.

**`fee_reminders`, `fee_reminder_batches`, `sms_credits_ledger`**: _select_ owner/admin/cashier; _insert/update_ service role; _delete_ denied. A parent does not read the reminder log about themselves.

**Every policy above is `workspace_id`-scoped through `app.has_role` or `app.is_guardian_of`, and every one has a pgTAP isolation + escalation test including a `teacher` persona asserting zero rows.**

### 3.15 Files

All private bucket, `visibility='private'`, 5-minute signed URLs via `/api/files/[id]`, logged to `file_access_log`:

- `fees/<workspace_id>/invoices/<invoice_no>.pdf`
- `fees/<workspace_id>/receipts/<receipt_no>.pdf`
- `fees/<workspace_id>/slips/<transaction_id>/<file_id>.<ext>`
- `fees/<workspace_id>/discounts/<discount_id>/<file_id>.<ext>`
- `fees/<workspace_id>/exports/<export_id>.<csv|xlsx>`

Slip and evidence uploads: magic-byte sniffed, EXIF-stripped, ≤ 10 MB, JPEG/PNG/WebP/PDF.

---

## 4. Workflows

### 4.1 Set up fee heads and a structure

1. `/app/fees/setup` on first use offers a **seeded BD default set** of heads with Bengali names pre-filled; the school edits or deletes.
2. `/app/fees/structures/new`: pick academic year and target (grade, section, or a named student group), then add rows — head, amount, frequency, due day, applicable months. A live preview reads _"a Class 6 student will be invoiced ৳4,500 on the 10th of each month, and ৳3,000 once in April — ৳57,000 for the year."_
3. Save as `draft`; **Activate** validates (no duplicate head+frequency, amounts ≥ 0, ≥ 1 item) and sets `status='active'`, superseding any prior active structure for that target.
4. Audit `fee_structure.activated` with the full item list.

**Phone note.** Structures are built at a desk, not on a bus. The editor is a ≥1024 two-column form with a phone fallback that is a readable, editable single-column list plus an _Add item_ sheet. The phone-first budget is spent on the screens used daily — collect, defaulters, parent pay — and that trade is deliberate rather than accidental.

### 4.2 Assign students and grant discounts

1. Assignment is automatic on enrolment: a trigger on `enrollments` creates a `student_fee_assignments` row from the active structure for the student's **section**, falling back to **grade**, in that order of specificity. Unassigned students appear in a **Needs a fee plan** list on `/app/fees` with a one-tap bulk assign.
2. **Discounts** are granted from the student's fee page or in bulk (_"25 % sibling discount for these 40 students"_). The form requires a kind, a method, a reason, and — for `need_based` — an evidence file.
3. If projected annual value exceeds `fee_settings.waiver_approval_threshold_paisa` (default ৳5,000) the discount saves as `pending` into the **owner's** approval queue. Below the threshold an admin's grant is immediately `active`.
4. Approve/reject writes an audit row and notifies the grantor. Revoking an active discount stops it applying to _future_ invoices and never rewrites issued ones.

### 4.3 Generate and publish an invoice run

**Trigger:** office opens `/app/fees/runs/new` on the 1st, or an optional scheduled run fires.

1. Choose academic year, period kind, period label, target, issue date and due date (defaulted from `default_due_day`).
2. **Preview** computes, without writing anything: per student, the applicable structure items for that period, then overrides, then discounts (§5.5), producing a table of `student · gross · discount · net` with totals and a list of **exclusions with reasons** (no active assignment, left mid-month, already invoiced for this period, ৳0 net). The preview is the whole safety mechanism — an invoice run is the most destructive action in a school ERP and it must be inspectable before it commits.
3. **Publish** writes all invoices in one transaction with `status='issued'`, assigns gapless numbers, queues PDF renders, and notifies guardians in-app + email (SMS only if explicitly ticked and credits exist — §4.9).
4. Partial failure is reported honestly: `invoice_count` counts rows actually written and `errors` lists each skipped student with a reason. Status becomes `partially_failed` — never a green tick over a silent failure.
5. Audit `fee_invoice_run.published` with counts and totals.

**Ad-hoc invoices** (one exam fee for one student, an admission fee at enrolment) use the same path with `target='student_ids'` and `period_kind='one_time'`.

### 4.4 Record an offline payment (the daily job)

This is the screen a cashier uses forty times a morning, and it is the most phone-optimised surface in the feature.

1. `/app/fees/collect` opens with **the student search focused**. Search by name, student ID, roll or guardian phone; a QR scan of the student ID card jumps straight through.
2. The student page shows, in order: name + class + photo, **outstanding total in 32 px**, unpaid invoices oldest-first with balances, and any unallocated credit.
3. Tap **Record payment** → a sheet: amount (defaulted to the full outstanding, editable), channel (Cash / Bank deposit / Cheque), date (today), payer name and relation, channel-specific fields, an optional slip photo, a note.
4. The sheet shows a **live allocation preview**: _"৳5,000 will clear November (৳4,500) and part of December (৳500)."_ The cashier can switch to manual allocation if the parent insists on a specific month.
5. **Save** → one transaction: `fee_transactions` with a gapless receipt number, `fee_allocations` rows, trigger-updated invoice `paid_paisa` and statuses, receipt PDF job, guardian notification.
6. The receipt is offered immediately as **Print** (opens the PDF) and **Share** (Web Share API → WhatsApp, which is how a BD school actually delivers a receipt to a parent who has already left the counter).
7. **Correction:** within the same day a cashier may reverse their own transaction with a reason; after that, owner/admin only. A reversal writes a new row with `reversal_of`, reverses the allocations, and both receipts remain retrievable.
8. Audit `fee_payment.recorded`, `fee_payment.reversed`.

**Phone specifics.** Search is a full-width 48 px field with `enterkeyhint="search"`. _Record payment_ is a sticky bottom bar. The keypad is `inputmode="decimal"`. The whole cash-to-receipt path is **four taps**, and an acceptance criterion holds it there.

### 4.5 Configure the school's merchant account

**Trigger:** owner opens `/app/fees/settings/merchant`.

1. A plain-language explainer first: _"Fees are paid into **your** school's account, not Acadigma's. You will need your own SSLCommerz store or bKash merchant credentials. Acadigma never holds your money and takes no commission on fees."_ With a link to SSLCommerz merchant onboarding and a note that setup costs **৳25,500 one-time plus ~2.5 % per transaction** (COMPETITORS.md §6.4) — a school deserves to know that before it starts.
2. Choose provider and mode, enter credentials. They go straight into `app.set_fee_merchant_credentials` and are **never echoed back**; the form warns that they cannot be retrieved afterwards.
3. **Verify** runs a live zero-risk check: for SSLCommerz, create a session for the ৳10 minimum and immediately abandon it — a `SUCCESS` response proves the credentials work without charging anyone; for bKash, a grant-token call. On success `status='active'`, `verified_at` set. On failure the provider's error is shown **verbatim** — it is the school's own account and they need the real message.
4. Copy the **IPN URL** to paste into their SSLCommerz merchant panel: `https://<host>/api/fees/ipn/<webhook_path_token>`. Per-account, unguessable, rotatable.
5. Until an account is `active`, online payment is hidden everywhere and the parent portal says _"Online payment isn't set up yet — please pay at the school office."_ No dead button.
6. Audit `fee_merchant.configured`, `fee_merchant.verified`, `fee_merchant.rotated`.

### 4.6 Online payment by student ID (the bKash-shaped flow)

Three entry points, one engine:

- **Parent portal** `/family/fees` → _Pay now_.
- **Signed-in school member** paying on a parent's behalf at the counter.
- **Public** `/pay/[schoolSlug]` → enter **Student ID** → see name + class + outstanding (and nothing else, §5.12) → pay. This is the flow bKash has already trained the market on, and it must work for a parent with no account.

1. `createFeePayment` runs server-side: resolve the student, re-read unpaid invoices **from the database**, build the allocation plan (§5.8), compute the amount (full outstanding, or a parent-chosen partial if `allow_partial_payment`), validate `≥ min_online_payment_paisa` and `≤ ৳500,000` (§5.10), insert `fee_payments` with the plan snapshotted in `intent`.
2. Load the workspace's merchant credentials **inside the payment operation** (service role, never returned to any caller) and call `provider.createCheckout` with the school's `store_id`, the school's name as `product_name`, and this account's `ipn_url`. `value_a = fee_payment_id`, `value_b = workspace_id`, `value_c = 'fee'`, `value_d = student_id`.
3. Full-page redirect to the gateway. Parent pays with bKash/Nagad/card.
4. **IPN** hits `/api/fees/ipn/<webhook_path_token>` → resolve the merchant account from the token → write `inbound_events` (idempotent on `val_id`) → recompute `verify_sign` with **that school's** store password → **call the validation API with that school's credentials** → check `tran_id`, exact paisa amount and `BDT` currency against our `fee_payments` row → only then capture.
5. Capture, in one transaction: `fee_payments.status='captured'`; create the `fee_transactions` row (online channel, gapless receipt number); write `fee_allocations` **from the snapshotted plan, re-validated** (§5.8 covers the case where the office took cash for the same invoice while the parent was on the gateway); update invoice statuses; render the Bengali receipt; notify guardian and office.
6. The return page polls `GET /api/fees/payments/[id]/status` showing _"Confirming your payment…"_, exactly as F-CM-01 §4.1. It grants nothing.
7. Failure, cancellation, expiry and reconciliation behave as F-CM-01 §4.2 and §4.4, run per workspace.

### 4.7 Parent portal

`/family/fees` — per child when a guardian has several:

- **Outstanding** in large type with a _Pay now_ sticky bar.
- **Invoices**: period, due date, total, paid, balance, status chip, Bengali PDF download.
- **Receipts**: date, receipt no, amount, channel, download, share.
- **Discounts** applied, named in Bengali (_"২৫% ভাইবোন ছাড়"_), so a family can see they are getting what they were promised.
- Bengali by default with an English toggle — the parent reading this is often not the parent who speaks English.

### 4.8 Defaulter list and collection reports

`/app/fees/defaulters`: students with `balance_paisa > 0` on an invoice past `due_on + grace_days` — student, class, guardian phone (a `tel:` link; the office's next action is almost always a call), overdue amount, days overdue, last payment, last reminder. Filters by class/section, days-overdue band, amount band. Actions: **Send reminders**, **Export**, **Open ledger**.

`/app/fees/reports`:

- **Daily collection** by channel and by cashier — for cash-drawer reconciliation at close of day. This report is the reason a bursar trusts the system.
- **Monthly collection vs expected** (Σ issued vs collected vs outstanding, by class).
- **Head-wise collection**.
- **Discount and waiver register** by kind with student counts — the number a board asks for.
- **Ageing**: 0–30 / 31–60 / 61–90 / 90+ days.
- **Online vs offline mix** with the school's estimated MDR cost.

### 4.9 Reminders (metered)

1. Select recipients (from the defaulter list or a filter) and channels. In-app and email are free; **SMS is metered and priced**.
2. An **estimate step is mandatory**: _"312 recipients · 312 SMS · about ৳109 · your balance is 1,450 credits."_ If credits are short the send is **blocked entirely**, never partially delivered.
3. Templates are per school, bilingual, with merge fields (`{{student_name}}`, `{{class}}`, `{{amount}}`, `{{due_date}}`, `{{school_name}}`) and a **live segment counter** — Bengali is UCS-2, so a Bengali SMS is **70 characters per segment, not 160**, and a 200-character Bengali message costs three SMS. The counter shows segments and taka, not characters, because that is the number that matters.
4. Sending debits `sms_credits_ledger` per message the provider accepts; failures refund the ledger.
5. Scheduled reminders run from `reminder_days_before` / `reminder_days_after`, with at most **one SMS per guardian per day** across all reminder types, enforced against `fee_reminders`.
6. A guardian who has opted out is `suppressed` with a reason and costs nothing.

**Compliance note (PDPA 2026, COMPETITORS.md §6.3):** reminder content must not include anything beyond student name, class, amount and due date. Templates are validated against a field allowlist; a school cannot merge in an arbitrary column.

### 4.10 Refunds and adjustments

- **Adjustment** (a correction to what is owed): owner/admin adds a signed `adjustment_paisa` to an issued invoice with a required reason; total and status recompute. Used for a fee revision or a billing error. Audited, and shown on the PDF as its own line so a parent can see why the number changed.
- **Refund** (money going back out): created against a `fee_transactions` row, bounded by `amount_paisa − already refunded`, with a reason code and note.
  - `method='cash'|'bank'` → the office pays it out and records a reference and date. Acadigma records; it does not move money.
  - `method='gateway'` → calls the provider's refund API **with the school's own credentials**, then polls, exactly as F-CM-01 §4.3. The money returns to the parent's instrument from the school's merchant account.
- On settlement: originating allocations reverse, invoice `refunded_paisa` and balances recompute, a refund receipt PDF is issued, the guardian is notified.
- **Overpayment is not a refund by default**: it becomes `unallocated_paisa` (a credit) and auto-applies to the next invoice. A parent may ask for it back, which then takes the refund path.

### 4.11 Reconciliation and accountant export

- A nightly per-workspace job queries the school's gateway (transaction-query by `tran_id`) for `fee_payments` stuck `pending`, repairing captures we missed — F-CM-01 §4.4 in shape, scoped per merchant account.
- **Invariants checked nightly**, reported to the school, never self-healed:
  ```
  Σ fee_allocations.amount (non-reversed)  = Σ fee_invoices.paid_paisa
  Σ fee_transactions.amount (non-reversed) = Σ fee_allocations.amount + Σ unallocated_paisa
  Σ fee_invoices.balance_paisa             = total outstanding on the defaulter report
  ```
- **Exports** (CSV/XLSX, real files): transactions, invoices, allocations, defaulters, head-wise summary, discount register — each carrying `ledger_code` so a bookkeeper can map them into Tally or a chart of accounts.

---

## 5. Business rules and calculations

### 5.1 Acadigma's economics on this feature: zero

No commission, no per-transaction fee, no revenue share. The gateway's MDR (~2.5 % SSLCommerz, ~1.5 % bKash) is paid by the school to its own provider and never touches an Acadigma table except as `mdr_estimate_paisa`, which exists **only** so the school's own report can show it. Acadigma monetises this through the `fees` plan module on Starter and above (F-CM-06) and through SMS credit packs sold as pass-through. A CI test asserts no file in this feature reads `platform_settings.commission_bps`.

### 5.2 State machines

**`fee_invoices.status`**

```
draft ──publish──► issued ──(partial payment)──► partially_paid ──(full)──► paid
                     │           │                                           │
                     ├─(past due)┴──► overdue ──(payment)──► partially_paid/paid
                     └──void──► voided                                       │
paid ──(refund)──► partially_paid / issued  ◄────────────────────────────────┘
```

- `overdue` is set by the nightly job when `due_on + grace_days < today` and `balance_paisa > 0`. It is a **stored** status, not a view, so the defaulter query is an index scan.
- `voided` is terminal, keeps its `invoice_no`, and cannot be applied to an invoice with payments against it — the office must reverse the receipts first, and the error says so.

**`fee_transactions.status`**: `pending → confirmed` (offline is `confirmed` on save; online becomes `confirmed` only on capture) · `confirmed → reversed`. A cheque may sit `pending` until cleared, then `confirmed` or `bounced` (which behaves as a reversal with a distinct reason and re-opens the invoices).

**`fee_payments.status`**: identical to F-CM-01 §5.3's payment machine.

**`fee_discounts.status`**: `pending → approved → active`, `pending → rejected`, `active → expired | revoked`.

### 5.3 Invoice line computation (exact, and in this order)

For student _s_, period _p_, for each applicable `fee_structure_items` row _i_:

```
1. skip the line entirely if override.suppressed
   skip if i.is_optional and the student has not opted in
        (transport requires student_fee_assignments.transport_opted)
2. base_paisa     = override.override_amount_paisa  when an override exists and is not suppressed
                  = i.amount_paisa                  otherwise
3. gross_paisa    = base_paisa
4. discount_paisa = computeDiscount(s, i.fee_head_id, gross_paisa, p)      -- §5.5
5. net_paisa      = max(gross_paisa - discount_paisa, 0)
```

and for the invoice:

```
invoice.gross_paisa    = Σ line.gross_paisa
invoice.discount_paisa = Σ line.discount_paisa
invoice.total_paisa    = invoice.gross_paisa - invoice.discount_paisa
                       + invoice.late_fee_paisa + invoice.adjustment_paisa
```

**Everything is snapshotted.** An issued invoice never changes because a structure, head name, discount or override changed afterwards. The only mutations to an issued invoice are `late_fee_paisa` (by the job), `adjustment_paisa` (by an audited action), `paid_paisa`/`refunded_paisa` (by triggers) and `status`.

Worked example — Class 6, January: tuition ৳4,500, transport ৳1,200 (opted in), 25 % sibling discount on all heads.

```
tuition   gross 450000  discount floor(450000*2500/10000) = 112500  net 337500
transport gross 120000  discount floor(120000*2500/10000) =  30000  net  90000
invoice   gross 570000  discount 142500                   total 427500  → ৳4,275.00
```

### 5.4 Due dates

```
due_on = make_date(period_year, period_month,
                   least(coalesce(item.due_day_of_month, fee_settings.default_due_day), 28))
```

The **28 cap** is not laziness — it guarantees a valid date in February without special-casing, and no BD school sets a due date after the 28th in practice. If the computed date falls on a Friday or a `platform_holidays` date it rolls **forward** to the next working day (a parent should not be late because the office was shut). `grace_days` applies on top.

### 5.5 Discount computation (exact)

For head _h_, gross _G_, period _p_, over the student's `active` discounts valid on `p.start`:

```
applicable = discounts where (scope='all_heads' or fee_head_id = h)
                       and valid_from <= p.start
                       and (valid_to is null or valid_to >= p.start)

candidate(d) = floor(G * d.percent_bps / 10000)   if d.method='percentage'
             = min(d.amount_paisa, G)             if d.method='fixed_per_period'
             = min(remaining_of(d), G)            if d.method='fixed_total'

discount_paisa = min(max(candidate(d) for d in applicable), G)
```

**Discounts never compound — the largest single discount wins.** Stacking is how ERPs end up billing a scholarship student ৳0 for a year by accident. One discount per head per period, the best one. A school wanting a combined effect sets a single discount at the combined rate, and the UI says so when a second is granted: _"This student already has a 25 % sibling discount. Only the larger discount applies to each fee head."_

```
remaining_of(d)  = d.amount_paisa - d.consumed_paisa                 -- fixed_total
```

`consumed_paisa` increases by the discount actually applied, by trigger, at invoice issue, and decreases on a void. `max_total_paisa` caps a percentage discount the same way.

### 5.6 Waiver approval threshold

```
projected_annual_value(d) = Σ over the remaining periods of the year of candidate(d)
requires_approval         = projected_annual_value(d) > fee_settings.waiver_approval_threshold_paisa
```

Default ৳5,000, owner-only approval. A `pending` discount does **not** apply to invoices issued while it is pending, and approving it does not retro-credit issued invoices — the office issues an adjustment if they want that, which keeps the audit trail explicit.

### 5.7 Late fees (exact)

Computed nightly by `app.accrue_fee_late_fees()` per workspace, only when `late_fee_enabled`:

```
days_late = greatest(today_in_workspace_tz - (due_on + grace_days), 0)
if days_late = 0 → no change

base    = invoice.total_paisa - invoice.paid_paisa          -- outstanding BEFORE late fee
accrued = late_fee_flat_paisa                                          if method='flat'
        = floor(base * late_fee_percent_bps / 10000)                   if method='percent_of_outstanding'
        = late_fee_per_day_paisa * least(days_late, late_fee_max_days) if method='per_day'

invoice.late_fee_paisa = least(accrued, coalesce(late_fee_cap_paisa, accrued))
```

Rules that matter:

- The job is **idempotent and absolute**, not incremental: it recomputes `late_fee_paisa` to its correct value every night rather than adding to it, so running it twice, or after a downtime gap, cannot double-charge. This is the most common ERP fee bug and it is designed out.
- A late fee is **never charged on a late fee** — `base` excludes `late_fee_paisa`.
- A payment clearing the principal stops accrual at that day's value; it does not retroactively remove what accrued.
- `flat` and `percent_of_outstanding` are charged **once per invoice**, not per day.
- The late fee appears as its own invoice line (via `late_fee_head_id`) on the PDF, in Bengali, with the number of days — a parent contesting a charge must be able to see the arithmetic.
- Default: **disabled**. A school must consciously choose to charge children's families extra money.

### 5.8 Payment allocation (exact)

Given a receipt of _A_ paisa for student _s_:

```
strategy = fee_settings.allocation_strategy          -- default oldest_first

oldest_first:
  invoices = unpaid invoices for s, ordered by due_on asc, then invoice_no asc
  for each invoice:
      take = min(A_remaining, invoice.balance_paisa)
      allocate take; A_remaining -= take
  leftover → fee_transactions.unallocated_paisa

head_priority:
  as above, but within an invoice lines clear in fee_heads.sort order,
  so tuition clears before transport on a partial payment
```

- Allocation never creates a negative balance and never crosses students or workspaces.
- **Concurrency:** allocation runs inside a transaction holding `select … for update` on the student's unpaid invoices. This is what makes the §4.6 race safe — if the office took cash for November while a parent was on the gateway, the online capture re-runs allocation against **current** balances, allocates what it can, and puts the rest in `unallocated_paisa` as a credit. The parent is never charged for nothing and the money is never lost.
- Manual allocation is available to the cashier, recorded as `allocated_by='manual'` with the user id.
- `unallocated_paisa` auto-applies by trigger when the next invoice is issued, oldest-first.

### 5.9 Gapless numbering

`invoice_no` and `receipt_no` come from `app.next_document_no(workspace_id, 'fee_invoice' | 'fee_receipt')` against the shared **`document_counters`** table (F-CM-01 §5.8a — per **D-31 (8)** this replaces the `fee_counters` table originally proposed here), taking a row lock inside the issuing transaction. **Not** a Postgres sequence — sequences gap on rollback, and a gap in a receipt book is exactly what a school's auditor will question. Prefixes are configurable per school (`fee_settings.receipt_prefix`, e.g. `SMS/2026/000184`). Rollback leaves no gap because the counter increments in the same transaction that writes the row.

### 5.10 Gateway limits are product rules here too

- SSLCommerz minimum **৳10.00** → `min_online_payment_paisa` defaults to `1000` and cannot be set lower.
- SSLCommerz maximum **৳500,000.00** → **this bites for real.** A Dhaka admission fee reaches ৳500,000+ and elite annual fees run to ৳10–15 lakh (COMPETITORS.md §6.5). When a payable amount exceeds ৳500,000 the UI **offers to split it**: the parent pays in instalments of at most ৳500,000, each its own `fee_payments` row and its own receipt, allocated as they land. The office sees one invoice with several receipts. A silent gateway failure on a school's largest transactions would be the worst possible first impression.
- `allow_partial_payment=false` forces full-invoice payment — some schools insist — but the ৳500,000 split still applies, because a gateway ceiling is not a policy choice.

### 5.11 Currency, rounding, Bengali numerals

- Integer paisa throughout; the only divisions are the three `floor` expressions in §5.3, §5.5 and §5.7.
- Fee amounts are whole taka (`amount_paisa % 100 = 0` on structure items and fixed discounts); paisa exists for gateway fidelity, not for data entry.
- Display uses `formatBDT` with **lakh/crore grouping** (`৳১২,৩৪,৫৬৭`), and **Bengali numerals** on parent-facing surfaces and receipts when `receipt_language` includes `bn`. `packages/domain/money.ts` gains `formatBDTBengali`, tested across the ০–৯ mapping and the lakh/crore separators. Office screens default to Latin numerals, because a cashier cross-checking a bank slip needs the glyphs the bank printed.
- Amount-in-words is required on receipts in **both** scripts when `receipt_language='both'`.

### 5.12 Public student-ID lookup: what it may reveal

The public `/pay/[schoolSlug]` page is the bKash-shaped flow and is therefore **unauthenticated by design**, which makes it an enumeration surface. It is deliberately starved:

- It returns **only** the student's first name plus the first letter of the surname (`Rahima K.`), class and section, and the total outstanding. No photo, no full name, no guardian name, no phone, no address, no invoice detail, no history.
- Rate limited to **10 lookups per IP per hour** and 3 per student ID per hour, with a CAPTCHA after 3 failures.
- Student IDs are the school's own sequential ids (`STU-2026-00001`) and therefore guessable, so the lookup additionally requires **the last 4 digits of a registered guardian phone number** as a second factor. That is the same bar bKash's own flow uses, and it is the difference between a payment page and a student directory.
- A school may disable the public page entirely (`fee_settings.public_pay_enabled`) and keep online payment logged-in-only.
- Every lookup is logged (workspace, student, IP, result) for abuse review.

### 5.13 Platform staff see no fee data

Unlike every other table in this area, **`app.is_platform_admin()` grants nothing here.** A school's fee ledger names which families are poor, which are behind, and which received charity — under PDPA 2026 that is the school's data about children, held by Acadigma as a **processor**, and there is no support scenario requiring a balance. Support debugging works from `audit_events`, job logs and `inbound_events`, which carry amounts and ids but no student identity. Breaking this needs a written, time-boxed, owner-approved elevation, out of scope for v1 and recorded in §11.

### 5.14 PDPA 2026 obligations inherited

- Guardian phone numbers used for SMS are personal data; the reminder template allowlist (§4.9) prevents leaking anything else.
- Waiver evidence may contain sensitive data (income documents) → private bucket, owner/admin only, retention **2 years after the academic year ends**, then purged by job with an audit row.
- The school is the controller; Acadigma is the processor. The onboarding data-processing agreement (COMPETITORS.md §6.3 pt 1) must name fee data explicitly.
- Export and erasure: a school leaving must be able to export the full fee ledger self-serve (§4.11), and a student erasure request must be answerable — financial records are retained for the statutory 5 years, so erasure here means **pseudonymisation** of student and guardian identity fields on fee rows, not deletion. Flagged in §11.

---

## 6. UI

| Route                     | Who                 | 360×800                                                                                                    | ≥1024                                      | Primary action  | Empty                                | Loading              | Error                             |
| ------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------- | ------------------------------------ | -------------------- | --------------------------------- |
| `/app/fees`               | owner/admin/cashier | Today's collection, outstanding total, defaulter count, _Needs a fee plan_ count, quick actions            | Dashboard grid + trend                     | Collect payment | _"Set up your fee heads"_ wizard CTA | Per-card skeletons   | Per-card retry                    |
| `/app/fees/collect`       | cashier+            | **Search focused**, student card, outstanding 32 px, invoice list, sticky **Record payment**               | Split: search+list left, ledger right      | Record payment  | _"Search for a student"_             | Skeleton             | Inline                            |
| `/app/fees/students/[id]` | owner/admin/cashier | Ledger: invoices, receipts, discounts, credit balance                                                      | Three panels                               | Record payment  | _"No invoices yet"_                  | Skeleton             | Retry                             |
| `/app/fees/structures`    | owner/admin         | Readable single-column list + _Add item_ sheet (desk-first, §4.1)                                          | Two-column editor with live annual preview | Activate        | _"No structures"_ + template         | Skeleton             | Inline per-field                  |
| `/app/fees/runs/new`      | owner/admin         | Stepped: period → target → preview (scrollable) → publish                                                  | Full preview table + totals rail           | Publish run     | n/a                                  | Progress with counts | Per-row errors                    |
| `/app/fees/defaulters`    | owner/admin/cashier | Filter chips, cards: student, class, amount, days, tap-to-call                                             | Table + bulk select                        | Send reminders  | _"No defaulters 🎉"_                 | Skeleton             | Retry                             |
| `/app/fees/reports`       | owner/admin/cashier | Report picker → one report, charts 160 px                                                                  | Sidebar + report                           | Export          | _"No data for this period"_          | Skeleton             | Retry                             |
| `/app/fees/reminders/new` | owner/admin/cashier | Recipients → channels → template with segment/cost counter → **estimate** → send                           | Two-column                                 | Send            | n/a                                  | Estimating…          | Blocked with reason               |
| `/app/fees/settings/*`    | owner               | Sections: general, late fee, receipts, merchant, public page                                               | Tabs                                       | Save            | Defaults prefilled                   | Skeleton             | Inline                            |
| `/family/fees`            | parent              | Child switcher, outstanding large, sticky **Pay now**, invoices, receipts, discounts — **Bengali default** | Two-column                                 | Pay now         | _"Nothing due 🎉"_                   | Skeleton             | Retry                             |
| `/pay/[schoolSlug]`       | public              | School name, Student ID, guardian phone last-4, then name + class + amount, **Pay**                        | Centred card                               | Pay             | n/a                                  | Spinner              | _"We couldn't find that student"_ |

Components: `AppShell`, `StudentSearch`, `MoneyText`, `MoneyTextBn`, `LedgerList`, `AllocationPreview`, `DataList`, `FormSheet`, `StickyActionBar`, `StatusChip`, `SegmentCostCounter`, `RunPreviewTable`, `EmptyState`, `ConfirmSheet`, `Skeleton`.

**Phone specifics.** The cashier flow is the benchmark: search → tap student → **Record payment** → **Save** = four taps, amount pre-filled to the outstanding total. The parent flow is three: open → **Pay now** → gateway. Bengali parent surfaces use a minimum 16 px body (Bengali conjuncts are unreadable smaller) and the Bengali font is subset and preloaded so the outstanding figure does not reflow. Guardian phone numbers are `tel:` links on the defaulter list.

---

## 7. Server contracts

| Name                                        | Kind                                          | Input                                                                                                                                | Output                                                                             | Errors                                                                                                               | Idempotency        | Rate limit                 |
| ------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------- |
| `upsertFeeHead`                             | action                                        | `FeeHeadInput`                                                                                                                       | `{id}`                                                                             | `CODE_TAKEN`, `FORBIDDEN`                                                                                            | key                | 60/hour                    |
| `saveFeeStructure` / `activateFeeStructure` | actions                                       | `FeeStructureInput` / `{id}`                                                                                                         | `{id, version}`                                                                    | `STRUCTURE_LOCKED`, `DUPLICATE_ITEM`, `VALIDATION`                                                                   | key                | 60/hour                    |
| `assignFeeStructure`                        | action                                        | `{studentIds[], structureId, effectiveFrom}`                                                                                         | `{assigned, skipped}`                                                              | `NO_ACTIVE_STRUCTURE`, `FORBIDDEN`                                                                                   | key                | 30/hour                    |
| `grantDiscount`                             | action                                        | `DiscountInput`                                                                                                                      | `{id, status, requiresApproval}`                                                   | `VALIDATION`, `EVIDENCE_REQUIRED`, `FORBIDDEN`                                                                       | key                | 100/hour                   |
| `decideDiscount`                            | action                                        | `{discountId, decision, note?}`                                                                                                      | `{status}`                                                                         | `NOT_OWNER`, `ALREADY_DECIDED`                                                                                       | key                | 100/hour                   |
| `previewInvoiceRun`                         | action                                        | `RunInput`                                                                                                                           | `{rows[], totals, exclusions[], previewToken}`                                     | `NO_PERIOD`, `FORBIDDEN`                                                                                             | n/a                | 20/hour                    |
| `publishInvoiceRun`                         | action                                        | `{previewToken, idempotencyKey}`                                                                                                     | `{runId, invoiceCount, totalPaisa, errors[]}`                                      | `PREVIEW_STALE`, `RUN_ALREADY_PUBLISHED`, `FORBIDDEN`                                                                | key + unique index | 10/day                     |
| `voidInvoice`                               | action                                        | `{invoiceId, reason}`                                                                                                                | `{status}`                                                                         | `HAS_PAYMENTS`, `FORBIDDEN`                                                                                          | key                | 50/day                     |
| `adjustInvoice`                             | action                                        | `{invoiceId, amountPaisa, reason}`                                                                                                   | `{total, balance}`                                                                 | `VALIDATION`, `FORBIDDEN`                                                                                            | key                | 100/day                    |
| `searchStudentsForFees`                     | RSC query                                     | `{q}`                                                                                                                                | `{students[] with outstanding}`                                                    | —                                                                                                                    | n/a                | 120/min                    |
| `recordOfflinePayment`                      | action                                        | `{studentId, amount:string, channel, receivedOn, payer{}, channelFields{}, slipFileId?, allocation?:'auto'\|Line[], idempotencyKey}` | `{transactionId, receiptNo, allocations[]}`                                        | `AMOUNT_INVALID`, `NOTHING_TO_ALLOCATE`, `FORBIDDEN`                                                                 | key                | 500/day                    |
| `reversePayment`                            | action                                        | `{transactionId, reason}`                                                                                                            | `{reversalId}`                                                                     | `ALREADY_REVERSED`, `FORBIDDEN`                                                                                      | key                | 100/day                    |
| `setFeeMerchantCredentials`                 | action                                        | `{provider, mode, merchantRef, secrets{}}`                                                                                           | `{accountId, status}`                                                              | `NOT_OWNER`, `VALIDATION`                                                                                            | key                | 10/day                     |
| `verifyFeeMerchant`                         | action                                        | `{accountId}`                                                                                                                        | `{status, error?}`                                                                 | `NOT_OWNER`, `PROVIDER_ERROR`                                                                                        | key                | 20/day                     |
| `lookupStudentForPublicPay`                 | route `POST /api/fees/public/lookup`          | `{schoolSlug, studentCode, guardianPhoneLast4}`                                                                                      | `{lookupToken, maskedName, className, outstandingPaisa, splitRequired}`            | `NOT_FOUND`, `RATE_LIMITED`, `PUBLIC_PAY_DISABLED`                                                                   | n/a                | 10/hour/ip, 3/hour/student |
| `createFeePayment`                          | action / route                                | `{studentId \| lookupToken, amountPaisa?, idempotencyKey}`                                                                           | `{paymentId, gatewayUrl}`                                                          | `NO_MERCHANT_ACCOUNT`, `BELOW_MINIMUM`, `EXCEEDS_GATEWAY_LIMIT_SPLIT_REQUIRED`, `NOTHING_DUE`, `PARTIAL_NOT_ALLOWED` | key                | 10/hour/student            |
| `getFeePaymentStatus`                       | route `GET /api/fees/payments/[id]/status`    | id                                                                                                                                   | `{status, receiptNo?}`                                                             | `NOT_FOUND`                                                                                                          | n/a                | 60/min                     |
| `feeIpn`                                    | route `POST /api/fees/ipn/[webhookPathToken]` | form body                                                                                                                            | `200` always                                                                       | never 4xx on a parseable body                                                                                        | `val_id`           | 300/min/ip                 |
| `estimateReminderBatch`                     | action                                        | `{filter, channels, templateId}`                                                                                                     | `{recipients, smsCount, segments, costPaisa, creditBalance, sufficient}`           | `TEMPLATE_INVALID`                                                                                                   | n/a                | 60/hour                    |
| `sendReminderBatch`                         | action                                        | `{batchId, idempotencyKey}`                                                                                                          | `{queued, suppressed}`                                                             | `INSUFFICIENT_SMS_CREDITS`, `FORBIDDEN`                                                                              | key                | 20/day                     |
| `issueFeeRefund`                            | action                                        | `{transactionId, amountPaisa, method, reasonCode, reasonNote, idempotencyKey}`                                                       | `{refundId, status}`                                                               | `EXCEEDS_REMAINING`, `NO_MERCHANT_ACCOUNT`, `FORBIDDEN`                                                              | key                | 50/day                     |
| `requestFeeExport`                          | action                                        | `{kind, format, periodStart, periodEnd, filters}`                                                                                    | `{exportId}`                                                                       | `RANGE_TOO_LARGE`, `FORBIDDEN`                                                                                       | key                | 20/day                     |
| `runFeeJobs`                                | route `POST /api/cron/fees/tick`              | —                                                                                                                                    | `{overdueMarked, lateFeesAccrued, remindersScheduled, reconciled, creditsApplied}` | `FORBIDDEN`                                                                                                          | run key            | nightly                    |

`previewToken` is an HMAC over `{workspaceId, runParams, rowHash, issuedAt}` with a 15-minute life; `publishInvoiceRun` recomputes and refuses on mismatch, so the table the office approved is provably the table that was issued.

---

## 8. Parts (build chunks)

**Part 1 — Fee heads, structures, settings: schema + RLS + editor** _(2 days)_
Scope: `fee_heads`, `fee_structures`, `fee_structure_items`, `fee_settings`; the `fee_invoice`/`fee_receipt` kinds registered in the shared `document_counters` (F-CM-01 §5.8a); all §3.14 policies; the BD default head seed with Bengali names; `/app/fees/setup` and `/app/fees/structures` with the live annual preview; the immutability trigger.
Tests: pgTAP — a **teacher** gets 0 rows on every table here; a parent gets 0 rows; cross-tenant 0 rows; the one-active-structure-per-target index; a structure referenced by an invoice cannot be edited.
**Demo:** build a Class 6 structure and see _"৳4,500/month + ৳3,000 in April = ৳57,000/year"_.

**Part 2 — Assignments, overrides, discounts, approval queue** _(2 days)_
Scope: `student_fee_assignments`, `student_fee_overrides`, `fee_discounts`; the enrolment trigger and the _Needs a fee plan_ list; grant and bulk-grant UI with evidence upload; the threshold rule and the owner approval queue; `computeDiscount` in `packages/domain/fees/discount.ts`.
Tests: unit — largest-single-discount across overlaps, `fixed_total` consumption and caps, validity windows; pgTAP — a guardian reads their child's discount through the view but not `reason`/`evidence_file_id`; an admin cannot self-approve above the threshold.
**Demo:** grant a 25 % sibling discount to 40 students in one action and watch one ৳8,000 need-based waiver land in the owner's queue.

**Part 3 — Invoice run: preview, publish, gapless numbering** _(2 days)_
Scope: `fee_invoices`, `fee_invoice_lines`, `fee_invoice_runs`; the §5.3 computation; `previewInvoiceRun` + `previewToken`; `publishInvoiceRun` in one transaction with honest partial-failure reporting; due-date rules including the 28 cap and holiday roll-forward; void.
Tests: unit — the §5.3 worked example to the paisa; due-date edges (Feb, Friday, holiday); pgTAP — no role can insert or update an invoice; the duplicate-publish index; a voided invoice keeps its number and cannot be voided with payments attached; gapless numbering under a concurrent rollback.
**Demo:** preview January for 180 students, see 6 exclusions with reasons, publish, get 174 invoices with consecutive numbers.

**Part 4 — Invoice PDF (Bengali) + guardian notification** _(1.5 days)_
Scope: React-PDF invoice with embedded Bengali font, bilingual head names, Bengali numerals, amount in words in both scripts, school header from `school_profiles`, seal and signatory; render job; private storage; guardian in-app + email notification.
Tests: snapshot on the text layer including Bengali glyph integrity; `formatBDTBengali` unit tests (০–৯, lakh/crore); a guardian of another student gets 403.
**Demo:** open a Bengali invoice PDF on an Android phone and read it correctly.

**Part 5 — Cashier: record offline payment, allocation engine, receipt** _(2 days)_
Scope: `fee_transactions`, `fee_allocations`; `recordOfflinePayment` as the only write path; the §5.8 allocation engine with `for update` locking; `/app/fees/collect` with the four-tap flow, search, QR scan, live allocation preview, manual allocation; receipt PDF + Print + Web Share; reversal.
Tests: unit — allocation across arrears, partial, overpayment to `unallocated_paisa`, head-priority; integration — two concurrent recordings for the same student never over-allocate; pgTAP — direct insert into `fee_transactions` denied for every role including cashier; reversal restores balances exactly.
**Demo:** take ৳5,000 cash against ৳12,000 of arrears in four taps and share the Bengali receipt to WhatsApp.

**Part 6 — Overdue marking + late-fee accrual job** _(1 day)_
Scope: `app.accrue_fee_late_fees()` and overdue marking on the nightly tick; the three methods; cap and max-days; the late-fee invoice line; settings UI defaulting to **off**.
Tests: unit — all three methods with caps; **idempotency: five runs produce identical `late_fee_paisa`**; no late fee on a late fee; accrual stops on payment.
**Demo:** run the job twice on a seeded overdue invoice and show the charge unchanged.

**Part 7 — Merchant account: encrypted per-workspace credentials + verification** _(2 days)_
Scope: `fee_merchant_accounts` with pgsodium, `app.set_/reveal_fee_merchant_credentials`, the column revoke and CI grep, `/app/fees/settings/merchant` with the plain-language explainer and cost disclosure, the live verify call, the per-account IPN URL and token rotation.
Tests: the raw column is unreadable by owner, admin and platform admin; reveal is callable only by the service role; a verify failure surfaces the provider's message; a rotated token invalidates the old IPN path.
**Demo:** a school enters its own sandbox SSLCommerz store, verifies it, and copies its IPN URL.

> **Prerequisite, not a part of this feature — D-31 (1).** The scope-aware provider factory (`getPaymentProvider(provider, scope)`, stateless adapters, the bKash identifier widening, and the nullable `workspace_id`/`merchant_account_id` on `inbound_events`) is **F-CM-01 Part 11**, owned by the payments builder, because it refactors F-CM-01's adapter code. It must land before Part 8 below. Everything above this line (Parts 1–7) is school-side only and has no dependency on it.

**Part 8 — Online fee payment: checkout, per-workspace IPN, capture** _(2 days)_
Scope: `fee_payments`; `createFeePayment` with server-side amount and allocation planning; the ৳500,000 split offer; `/api/fees/ipn/[token]` resolving the merchant account and validating with **that school's** credentials under the four capture checks; capture creating transaction, allocations and receipt in one transaction with re-validated allocation; status polling and return pages.
Tests: replayed IPN captures once; wrong amount → `disputed`, nothing recorded; an IPN on the wrong workspace's token rejected; the office-took-cash-meanwhile race leaves a credit rather than an over-allocation.
**Demo:** pay a real sandbox fee end-to-end; money is attributed to the school's store and Acadigma's own `orders` table gains zero rows.

**Part 9 — bKash direct provider adapter** _(2 days)_
Scope: `BkashProvider` on the same interface — grant token (cached to its TTL), create payment, execute payment, query payment, refund, refund status; the callback-not-IPN shape mapped onto the same `fee_payments` machine; sandbox credentials flow.
Tests: token refresh on expiry; an executed-but-unqueried payment recovered by reconciliation; an interface-conformance test shared with `SSLCommerzProvider`.
**Demo:** the same _Pay now_ button completes through bKash sandbox with a bKash reference on the receipt.

**Part 10 — Parent portal + public student-ID pay page** _(2 days)_
Scope: `/family/fees` with child switcher, Bengali-default rendering, invoice/receipt downloads and discount display; `/pay/[schoolSlug]` with the guardian-phone second factor, starved response, rate limits, CAPTCHA, lookup logging and the school's disable switch.
Tests: a guardian sees only their own children (pgTAP via `app.is_guardian_of`); a draft invoice is invisible to a guardian; enumeration is rate-limited and logged; the public response carries no field beyond the four allowed (response-shape freeze test).
**Demo:** pay a fee from a signed-out phone using only a student ID and a guardian's last four digits.

**Part 11 — Defaulter list + collection reports + exports** _(2 days)_
Scope: the defaulter query and UI with tap-to-call; the six reports in §4.8; ageing buckets; cashier-wise daily collection for drawer reconciliation; real CSV/XLSX exports carrying `ledger_code`.
Tests: the daily collection report reconciles to `Σ fee_transactions` for the day by channel and by cashier; ageing buckets are exhaustive and non-overlapping; export totals equal on-screen totals.
**Demo:** close a day's drawer against the report and export the month for an accountant.

**Part 12 — Reminders: templates, segment/cost estimation, metered SMS** _(2 days)_
Scope: `fee_reminder_batches`, `fee_reminders`, `sms_credits_ledger`; bilingual templates with the merge-field allowlist; the **UCS-2 70-character** Bengali segment counter and taka estimate; the mandatory estimate step and insufficient-credit block; scheduled before/after-due reminders; the one-SMS-per-guardian-per-day cap; opt-out suppression; SMS credit pack purchase on Acadigma's merchant account (pass-through).
Tests: Bengali segment counting (70, and 67 with UDH) against known strings; the estimate matches the debit; failures refund credits; the daily cap holds across reminder types; a template with a disallowed merge field is rejected.
**Demo:** estimate 312 Bengali reminders at ~৳109, send, and see the ledger debit match exactly.

**Part 13 — Refunds, adjustments, reconciliation, PDPA retention** _(2 days)_
Scope: `fee_refunds` for cash/bank/gateway; gateway refunds through the school's credentials with polling; adjustments on issued invoices; credit-balance auto-application; the nightly per-workspace reconciliation and the three invariants with drift reported to the school; waiver-evidence retention purge; the pseudonymisation path for an erasure request.
Tests: refund bounded by remaining; allocations reverse exactly; invariants detect a deliberately corrupted row and report rather than self-heal; the retention job removes evidence files and leaves the decision.
**Demo:** refund an online fee payment back to the parent's bKash from the school's own merchant account, with a Bengali refund receipt.

---

## 9. Acceptance criteria

1. **Given** a Class 6 structure of tuition ৳4,500 + transport ৳1,200 and a 25 % sibling discount **when** January is invoiced for an opted-in student **then** the invoice reads gross ৳5,700, discount ৳1,425, total ৳4,275, with two lines discounted ৳1,125 and ৳300.
2. **Given** a student with both a 25 % sibling discount and a ৳500 fixed discount on tuition **when** the invoice is computed **then** only the **larger** applies to tuition (৳1,125), never both, and the UI told the grantor so.
3. **Given** an active structure referenced by an issued invoice **when** an admin edits it **then** it is refused; saving creates version 2 in draft, and activating version 2 **does not** change any issued invoice.
4. **Given** a preview of 180 students with 6 exclusions **when** the run is published **then** exactly 174 invoices exist with consecutive gapless numbers, the 6 exclusions are listed with reasons, and republishing the same period and target is refused.
5. **Given** a preview older than 15 minutes **when** publish is attempted **then** it fails with `PREVIEW_STALE`.
6. **Given** a **teacher** **when** they query `fee_invoices`, `fee_transactions`, `fee_discounts`, `fee_structures` or any other table in this feature with their own JWT **then** every query returns zero rows, and `/app/fees` returns 404.
7. **Given** a **platform admin** **when** they query any fee table **then** they get zero rows (§5.13).
8. **Given** a guardian of student A **when** they query `fee_invoices` **then** they see A's non-draft invoices only — not student B's, not A's drafts, and not another school's.
9. **Given** a cashier **when** they attempt a direct PostgREST insert into `fee_transactions` **then** it is denied; the only path is `recordOfflinePayment`.
10. **Given** ৳12,000 of arrears across three months **when** a cashier records ৳5,000 cash **then** allocations clear the two oldest invoices fully and part of the third, the receipt names exactly which months were cleared, and the whole path took four taps at 360×800.
11. **Given** two cashiers recording payments for the same student simultaneously **when** both commit **then** no invoice is over-allocated and any excess becomes `unallocated_paisa`.
12. **Given** a recorded payment **when** it is reversed **then** a compensating transaction exists, both receipt numbers remain valid and retrievable, the invoices return to their prior balances exactly, and nothing was edited or deleted.
13. **Given** late fees set to 2 % of outstanding with a ৳500 cap **when** the nightly job runs five times **then** `late_fee_paisa` is identical after each run, and it never includes a late fee on a late fee.
14. **Given** late fees are disabled (the default) **when** an invoice goes 40 days overdue **then** no late fee is charged and the invoice is marked `overdue` only.
15. **Given** an owner saves merchant credentials **when** anyone — owner, admin or platform admin — queries `credentials_encrypted` **then** permission is denied; the form warned before saving that the values cannot be retrieved.
16. **Given** a school's verified SSLCommerz store **when** a parent pays ৳4,275 online **then** the IPN is validated **with that school's credentials**, the four capture checks pass, one `fee_transactions` row with an online channel is created with allocations and a Bengali receipt, **and Acadigma's own `orders`, `order_lines` and `payments` tables gain zero rows**.
17. **Given** the same fee IPN is replayed six times **then** one transaction, one receipt and one set of allocations exist.
18. **Given** an IPN posted to school A's webhook token carrying school B's `tran_id` **then** nothing is captured and the event is recorded as a mismatch.
19. **Given** the office records cash for November while a parent is mid-gateway for the same amount **when** the online capture lands **then** allocation re-runs against current balances, nothing is over-allocated, and the excess is a credit that auto-applies to the next invoice.
20. **Given** an admission fee of ৳620,000 **when** a parent taps Pay **then** the UI offers to split it into instalments of at most ৳500,000, each producing its own payment and receipt against the same invoice.
21. **Given** an online payment attempt of ৳5 **then** it is refused with `BELOW_MINIMUM` (SSLCommerz's ৳10.00 floor).
22. **Given** no verified merchant account **when** a parent opens `/family/fees` **then** there is **no** Pay button and the page says to pay at the office.
23. **Given** the public pay page **when** a correct student ID is entered with a wrong guardian phone last-4 **then** nothing is revealed; **and when** correct **then** the response contains only masked name, class and outstanding amount — verified by a response-shape test.
24. **Given** 11 public lookups from one IP in an hour **then** the 11th is rate-limited and logged.
25. **Given** 312 Bengali reminder recipients **when** the batch is estimated **then** segments are counted at **70 characters per segment** (UCS-2), the taka estimate is shown before sending, and with insufficient credits the send is blocked entirely rather than partially delivered.
26. **Given** a guardian who already received a fee reminder today **when** a second batch targets them **then** they are suppressed and no credit is spent.
27. **Given** a gateway refund **when** it settles **then** allocations reverse, invoice balances recompute, a Bengali refund receipt is issued, and the money returns from the **school's** merchant account — with no Acadigma refund row created.
28. **Given** the nightly invariant check **when** allocations and invoice `paid_paisa` disagree **then** the school is shown the discrepancy with the offending ids and the job does **not** self-heal.
29. **Given** a school on the **Free** plan **when** a member opens `/app/fees` **then** it returns 404 (the `fees` module is Starter and above); **and given** they downgrade from Starter to Free **then** every fee row is preserved and exportable while new invoice runs are blocked.
30. **Given** any parent-facing fee screen or PDF at 360×800 **then** Bengali renders correctly at ≥ 16 px, the outstanding figure and Pay action are thumb-reachable, and axe reports zero serious violations.

---

## 10. Tests

- **Unit (domain, ≥ 95 %):** line computation with overrides and optional heads; the largest-single-discount rule; `fixed_total` consumption and caps; due-date rules (Feb, Friday, holidays, the 28 cap); all three late-fee methods with idempotency; the allocation engine across every arrears shape; `formatBDTBengali` and amount-in-words in both scripts; Bengali SMS segment counting; invoice and transaction transition tables; the gateway split calculator.
- **DB (pgTAP):** isolation and escalation across all fourteen tables with **five personas** — teacher, staff-without-capability, cashier, guardian-of-another-student, platform admin — each asserted to zero rows where appropriate; insert/update denial on `fee_invoices`, `fee_transactions`, `fee_allocations`, `fee_payments`; the column revokes on `credentials_encrypted` and on `fee_discounts.reason`/`evidence_file_id` for guardians; gapless numbering under concurrent rollback; every partial unique index.
- **Integration:** preview→publish atomicity and partial-failure honesty; concurrent allocation under `for update`; the online/offline race; replayed IPN; wrong-workspace IPN; reversal exactness; retention purge.
- **e2e (360×800 and 1280×800):** cashier four-tap collection with a Bengali receipt shared; parent pays in sandbox from `/family/fees`; public student-ID payment signed out; owner configures and verifies a merchant account; reminder estimate and send; axe on every screen including the Bengali ones.
- **Security:** IDOR across students, invoices, receipts, refunds and payments by id enumeration; the public lookup response-shape freeze; enumeration rate limits; an attempt to read another school's merchant credentials from every role; an assertion that no fee endpoint response body ever contains a gateway credential; an assertion that no fee row carries a `commission_bps`.
- **Compliance:** reminder templates cannot merge a field outside the allowlist; waiver evidence is unreachable by guardians and by platform staff; the retention purge leaves the decision and removes the file.
- **Performance:** run preview p95 < 4 s for 2,000 students; publish p95 < 12 s for 2,000 invoices; collect-screen student search p95 < 200 ms; defaulter list p95 < 400 ms at 3,000 students; nightly tick < 60 s per 2,000-student workspace.

---

## 11. Open questions

1. **The cashier capability.** This spec introduces `workspace_member_capabilities` to grant `fees.cashier` to a `staff` member without making them an `admin`. That is a **new authorisation primitive** belonging in F-AU-02 and DATA-MODEL.md, not here. _Default assumed:_ the table exists as described. If rejected, the fallback is owner/admin-only cash handling, which will not survive contact with a real school office.
2. **Cheque clearing.** _Default assumed:_ a cheque transaction is `pending` until an office user marks it cleared or bounced; a bounce reverses like any other reversal plus an optional bounce charge. Not built beyond the status in v1.
3. **Transport routes and stage-based fares.** Transport is a flat optional head here; real schools price by stage. _Default assumed:_ `transport_route_id` is stored and per-route pricing is a v2 override.
4. **Sibling discount automation.** _Default assumed:_ manual grant in v1; auto-detecting siblings from shared guardian records is a natural v2 and the data supports it.
5. **Madrasa and coaching-centre fee shapes** (COMPETITORS.md §6.1) are not modelled distinctly. _Default assumed:_ the head+structure model is general enough; verify with a madrasa before claiming support.
6. **Platform staff elevation for fee support.** §5.13 gives platform staff nothing. _Default assumed:_ that holds for v1. If support proves impossible, the answer is a time-boxed, owner-approved, fully-audited elevation — not a standing read policy.
7. **Erasure vs statutory retention.** PDPA 2026 grants erasure; financial records need 5-year retention. _Default assumed:_ pseudonymisation of identity fields on fee rows, retaining the money record. Needs the owner's and a lawyer's sign-off before the first erasure request, and belongs in `COMPLIANCE-PDPA.md`.
8. **Does Acadigma ever want a revenue share here?** _Default assumed:_ never, by design (§5.1). Taking a cut of fees would make us a payment aggregator and change the regulatory posture entirely. If the owner ever wants it, that is a legal-entity conversation, not a code change.
9. **bKash merchant API access.** bKash Checkout needs a merchant agreement and API credentials per school. _Default assumed:_ schools that already have a bKash merchant account use it; those that do not are pointed at SSLCommerz, which resells bKash as a channel anyway at ~2.5 %.
10. **Online admission fee payment** (COMPETITORS.md §7a rec 3) would reuse this engine for an applicant who is not yet a student. _Default assumed:_ out of scope here; noted as the natural next consumer of `fee_payments`.

---

## 12. Conflicts with F-CM-01 — amendments required

> **Status: all nine were accepted as rulings under D-31 and have landed in F-CM-01.** This section is kept as the record of _why_ each amendment exists and where it now lives — not as an open list. Severity order, with the F-CM-01 section that now carries each ruling named in bold at the end.

**1. The `PaymentProvider` factory must become scope-aware. (Blocking.)**
F-CM-01 §5.11 loaded `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWD` from environment variables — one global merchant. Fee collection needs **per-workspace credentials** resolved at call time. _Amendment:_ `getPaymentProvider(provider, scope)` with `scope = {kind:'platform'} | {kind:'workspace', merchantAccountId}`; the adapter becomes stateless with respect to credentials, which are resolved inside the operation via `app.reveal_fee_merchant_credentials`. F-CM-01's redaction, no-redirect and TLS rules apply unchanged to both scopes. **Landed: F-CM-01 §5.5 and F-CM-01 Part 11** — the refactor is owned by the payments builder, not by this feature, because it changes F-CM-01's adapter code.

**2. Fee money must not enter `orders` / `order_lines` / `payments`. (Blocking; design separation.)**
Those tables are Acadigma's revenue. Putting school fees in them would corrupt `billing_summaries_v` (F-CM-07), platform finance totals, the F-CM-05 reconciliation invariants, receipt numbering, and the meaning of every number on `/platform/payments`. _Resolution:_ `fee_payments` and `fee_transactions` are separate tables with a parallel state machine; `orders.kind` gains **no** fee member; acceptance criterion 16 asserts zero new rows in F-CM-01's tables during a fee payment. **Landed: F-CM-01 §3 scope note.**

**3. `inbound_events` has no `workspace_id`. (Blocking; small.)**
F-CM-01 §3.5 defines it as a platform table with no tenant key, platform-staff-read-only. Fee IPNs need workspace attribution for per-school reconciliation and support. _Amendment:_ add `workspace_id uuid null` and `merchant_account_id uuid null`; extend the select policy so `owner|admin` of a workspace can read **their own** fee events (amounts, statuses, provider ids — no names). Platform staff keep full read for platform events; per §5.13 this is the one place they see fee-adjacent data, and it deliberately carries no student identity. **Landed: F-CM-01 §3.5 and §3.8.**

**4. Refund authority differs. (Decision needed.)**
F-CM-01 §4.3 makes refunds **platform-staff-only within 7 days** — correct for marketplace money we hold. Fee refunds are the **school's** money and the school's decision: `fees.refund.issue` is owner/admin with **no time window**, because a school may legitimately refund a March withdrawal for fees paid in January. _Resolution:_ two separate refund actions (`issueRefund` vs `issueFeeRefund`) sharing only the provider methods. **Landed: F-CM-01 §4.3 scope banner.**

**5. `platform_settings.commission_bps` must not reach this feature. (Assertion.)**
Acadigma takes 0 % of fees (§5.1). A CI test greps every file under the fee feature and fails the build on `commission_bps`, `platform_settings` or `seller_paisa`; `fee_invoice_lines` deliberately has no commission columns. **Landed: F-CM-01 §5.2.**

**6. The ৳500,000 gateway ceiling stops being theoretical.**
F-CM-01 §5.8 treats it as an edge case only Enterprise yearly could hit, resolved by refusing the order. Here it is **routine** — Dhaka admission fees reach ৳500,000+ and elite annual fees run to ৳10–15 lakh. _Amendment:_ "refuse and route to contact-us" remains right for subscriptions; this feature implements a real **split-payment** flow (§5.10, Part 8 here), and F-CM-01 records that the capability exists and is owned here. **Landed: F-CM-01 §5.8.**

**7. Reconciliation is per-merchant, not global.**
F-CM-01 §4.4 runs one job against one store. _Amendment:_ the fee reconciliation job iterates workspaces with active merchant accounts, uses each school's credentials, and reports drift **to the school**, not to platform staff. Separate cron entry, shared query-API adapter code. **Landed: F-CM-01 §4.4.**

**8. bKash is a second provider with a different shape. (New work, minor interface change.)**
F-CM-01 assumed SSLCommerz-only with Stripe reserved. bKash Checkout is grant-token → create → execute → query, with a **callback rather than an IPN**. The interface accommodates it, but `parseWebhook` must tolerate a callback carrying a `paymentID` and **no `val_id`**, and `validate` must accept `{providerPaymentId}` as a third identifier alongside `valId` / `tranId`. _Amendment:_ widen those signatures — `parseWebhook` makes `tranId`/`valId` optional and adds `providerPaymentId`; `validate` accepts any one of the three. **Landed: F-CM-01 §5.5.**

**9. Receipt numbering namespaces.**
F-CM-01 issues `ORD-`/`INV-` from platform-wide and per-workspace counters; fees issue `FEE-`/`RCP-` from per-workspace, per-year counters with a school-configurable prefix. No collision, but `fee_counters` and `invoice_counters` are two tables doing the same job. _Resolved:_ unified into one `document_counters(workspace_id nullable, kind, year, last_no)` with `app.next_document_no()`, a null workspace meaning a platform-scoped series. **Landed: F-CM-01 §5.8a**, with F-CM-06 §5.8 and §5.9 here updated to use it.
