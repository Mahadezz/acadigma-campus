# F-CM-01 — Payments core (PaymentProvider, SSLCommerz, orders, refunds, receipts)

|                  |                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Area             | market / billing (shared payment substrate)                                                                   |
| Status           | planned                                                                                                       |
| Owner branch     | `feat/commerce-payments-core`                                                                                 |
| Depends on       | F-AU-01 (auth/profiles), F-AU-02 (workspaces/members), F-OP-0x (files + PDF renderer)                         |
| Plan             | `docs/plan/ROADMAP.md` chunk — commerce, first                                                                |
| Base44 reference | `docs/reference/base44-inventory/04-commerce-billing.md` §3.1, §3.2, §3.3, §3.9, §3.10, §7-A1, §7-B18, §7-C28 |

> **Schema note.** Every table and column below is **proposed; `docs/architecture/DATA-MODEL.md` wins** if it differs. Names follow `PRODUCT-DECISIONS.md` §4–§5 and `ARCHITECTURE.md` §4.

---

## 1. Purpose

Every taka the product will ever collect — marketplace purchases, school-funded purchases, plan subscriptions, AI credit packs — flows through **one** payment substrate. This feature builds it: a provider-agnostic `PaymentProvider` interface, a SSLCommerz hosted-checkout adapter, the `orders → order_lines → payments` tables with server-computed, snapshotted amounts in paisa, an IPN Edge Function that validates every notification against SSLCommerz's own validation API before anything is granted, a refund path, a nightly reconciliation job, and buyer receipt PDFs.

**What Base44 had:** the string _"Secure payment via SSLCommerz / Stripe"_ (`ListingDetail.jsx:264`) and nothing behind it. `Buy Now` wrote `MarketplaceTransaction{status:'completed'}` client-side with `create` RLS of `{}` — any authenticated user could mint a completed transaction for any listing and then open the seller's raw `main_file_url`. There was no order, no payment record, no provider call, no webhook, no refund path, no receipt, and two contradictory commission rates. Commission was computed **in the browser**. All of that is deleted, not ported.

**Done looks like:** a teacher on a 360 px phone taps _Buy — ৳250_, lands on the SSLCommerz hosted page, pays with bKash, is returned to `/market/orders/<id>`, and sees a paid order with a downloadable receipt — while the entitlement that actually unlocks the file was granted by a server-side IPN handler that called SSLCommerz's validation API and matched the amount against the order. Replaying the IPN ten times changes nothing.

---

## 2. Roles and permissions

`packages/domain/permissions.ts` keys:

| Action                                           | Permission key                    | owner | admin | teacher | staff | parent | platform staff  |
| ------------------------------------------------ | --------------------------------- | ----- | ----- | ------- | ----- | ------ | --------------- |
| Create a personal order (buyer = self)           | `payments.order.create.personal`  | ✔     | ✔     | ✔       | ✔     | ✔      | ✔               |
| Create a workspace-funded order (buyer = school) | `payments.order.create.workspace` | ✔     | ✔     | —       | —     | —      | —               |
| Start checkout for an order they own             | `payments.checkout.start`         | ✔     | ✔     | ✔       | ✔     | ✔      | ✔               |
| View own orders / receipts                       | `payments.order.read.own`         | ✔     | ✔     | ✔       | ✔     | ✔      | ✔               |
| View workspace orders / receipts                 | `payments.order.read.workspace`   | ✔     | ✔     | —       | —     | —      | —               |
| Issue a refund                                   | `payments.refund.issue`           | —     | —     | —       | —     | —      | ✔               |
| View reconciliation / payment ops console        | `payments.ops.read`               | —     | —     | —       | —     | —      | ✔               |
| Change provider credentials / mode               | —                                 | —     | —     | —       | —     | —      | env only, no UI |

**Nobody** can set an amount. There is no permission for it, because no code path accepts an amount from a client (see §5.1).

---

## 3. Data

Tenant key: `workspace_id` on every table here (PRODUCT-DECISIONS 1.6, 5.5). A _personal_ purchase carries the buyer's **personal workspace** id, so RLS is uniform and there is never a `null` tenant.

> **Scope of these tables — D-31 (2).** `orders`, `order_lines` and `payments` hold **Acadigma's revenue only**: marketplace purchases, plan subscriptions and AI credit packs, all charged on **Acadigma's** SSLCommerz store. **School fee money never enters them.** Student fees are collected on the _school's own_ merchant account and live in `fee_payments` and `fee_transactions` (F-CM-08 §3.10, §3.7), a parallel set of tables with their own state machine, their own receipt series and their own reconciliation. `orders.kind` therefore has **no** fee member, and it never will — mixing the two would corrupt `billing_summaries_v` (F-CM-07), the platform finance totals, the F-CM-05 reconciliation invariants, and the meaning of every number on `/platform/payments`. F-CM-08's acceptance criterion 16 asserts that a completed fee payment adds **zero** rows to any table in this section. What F-CM-08 _does_ reuse is this feature's `PaymentProvider` interface, adapters, IPN discipline and idempotency layers — the code, not the ledger.

### 3.1 `orders` _(new; proposed)_

| column                             | type                                    | notes                                                                     |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `id`                               | uuid pk                                 |                                                                           |
| `workspace_id`                     | uuid not null → workspaces              | buyer of record's workspace (personal or school)                          |
| `order_no`                         | text not null unique                    | `app.next_document_no(workspace_id,'order')` → `ORD-2026-000147` (§5.12a) |
| `buyer_user_id`                    | uuid not null → profiles                | the human who clicked buy                                                 |
| `kind`                             | `order_kind` not null                   | `marketplace \| subscription \| credit_pack`                              |
| `funding`                          | `order_funding` not null                | `personal \| workspace`                                                   |
| `status`                           | `order_status` not null default `draft` | see §5.3                                                                  |
| `subtotal_paisa`                   | bigint not null                         | Σ `order_lines.gross_paisa`                                               |
| `discount_paisa`                   | bigint not null default 0               | reserved; always 0 in v1                                                  |
| `tax_paisa`                        | bigint not null default 0               | reserved; VAT is displayed, not added, in v1 (§5.8)                       |
| `total_paisa`                      | bigint not null                         | `subtotal - discount + tax`                                               |
| `refunded_paisa`                   | bigint not null default 0               | running total of settled refunds                                          |
| `currency`                         | char(3) not null default `'BDT'`        |                                                                           |
| `commission_bps_snapshot`          | int not null                            | copied from `platform_settings.commission_bps` at order creation          |
| `approval_id`                      | uuid null → `purchase_approvals`        | set for `funding='workspace'` (F-CM-04)                                   |
| `metadata`                         | jsonb not null default `'{}'`           | non-authoritative display data                                            |
| `placed_at`                        | timestamptz null                        | set when status leaves `draft`                                            |
| `paid_at`                          | timestamptz null                        | set when first payment reaches `captured`                                 |
| `created_at/updated_at/created_by` |                                         | standard                                                                  |

Indexes: `(workspace_id, created_at desc)`, `(buyer_user_id, created_at desc)`, `(status) where status in ('pending_payment','payment_failed')`, unique `(order_no)`.

### 3.2 `order_lines` _(new; proposed)_

| column                    | type                                     | notes                                   |
| ------------------------- | ---------------------------------------- | --------------------------------------- |
| `id`                      | uuid pk                                  |
| `order_id`                | uuid not null → orders on delete cascade |
| `workspace_id`            | uuid not null                            | denormalised for RLS (matches parent)   |
| `line_type`               | `order_line_type` not null               | `listing \| plan \| credit_pack`        |
| `listing_id`              | uuid null → listings                     | for `listing`                           |
| `plan_id` / `plan_period` | uuid null / `monthly\|yearly` null       | for `plan`                              |
| `credit_pack_id`          | uuid null → credit_packs                 | for `credit_pack`                       |
| `seller_user_id`          | uuid null → profiles                     | null for platform-sold lines            |
| `title_snapshot`          | text not null                            | listing/plan title **at purchase time** |
| `quantity`                | int not null default 1                   | always 1 in v1                          |
| `unit_price_paisa`        | bigint not null                          | snapshot                                |
| `gross_paisa`             | bigint not null                          | `unit_price_paisa * quantity`           |
| `commission_bps`          | int not null                             | snapshot (0 for platform-sold lines)    |
| `commission_paisa`        | bigint not null                          | §5.2                                    |
| `seller_paisa`            | bigint not null                          | §5.2                                    |
| `refunded_paisa`          | bigint not null default 0                |                                         |
| `currency`                | char(3) not null default `'BDT'`         |                                         |

Indexes: `(order_id)`, `(seller_user_id, created_at desc)`, `(listing_id)`.

**Every amount column on this table is written by the server from the database's own copy of the price.** Nothing in the request body reaches these columns.

### 3.3 `payments` _(new; proposed)_

One row per **payment attempt**. An order may have several (a failed card, then bKash).

| column                                                        | type                                        | notes                                                                             |
| ------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`                                                          | uuid pk                                     |
| `workspace_id`                                                | uuid not null                               |
| `order_id`                                                    | uuid not null → orders                      |
| `provider`                                                    | `payment_provider` not null                 | `sslcommerz` (v1); `stripe`, `manual` reserved                                    |
| `provider_mode`                                               | text not null                               | `sandbox \| live` — recorded so sandbox rows can never be mistaken for real money |
| `tran_id`                                                     | text not null unique                        | **our** id, sent to SSLCommerz; `ACD-<base32(payment.id)>` (≤30 chars)            |
| `amount_paisa`                                                | bigint not null                             | = `orders.total_paisa` at attempt time                                            |
| `currency`                                                    | char(3) not null default `'BDT'`            |
| `status`                                                      | `payment_status` not null default `created` | §5.3                                                                              |
| `session_key`                                                 | text null                                   | SSLCommerz `sessionkey`                                                           |
| `gateway_url`                                                 | text null                                   | `GatewayPageURL` (not stored after use; nulled on terminal state)                 |
| `val_id`                                                      | text null unique                            | SSLCommerz validation id — **the idempotency anchor**                             |
| `bank_tran_id`                                                | text null                                   | required later for refunds                                                        |
| `card_type` / `card_brand` / `card_issuer` / `card_no_masked` | text null                                   | display + reconciliation                                                          |
| `store_amount_paisa`                                          | bigint null                                 | net of the gateway's own charge (§5.9)                                            |
| `risk_level`                                                  | int null                                    | 0 safe, 1 risky                                                                   |
| `failure_code` / `failure_reason`                             | text null                                   |                                                                                   |
| `validated_at`                                                | timestamptz null                            | when the validation API returned VALID/VALIDATED                                  |
| `expires_at`                                                  | timestamptz null                            | `created_at + 30 min` (§5.4)                                                      |
| `created_at/updated_at`                                       |                                             |                                                                                   |

Indexes: unique `(tran_id)`, unique `(val_id) where val_id is not null`, `(order_id, created_at desc)`, `(status, created_at)` for the reconciliation job.

### 3.4 `refunds` _(new; proposed)_

| column                  | type                                         | notes                                                                                      |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `id`                    | uuid pk                                      |
| `workspace_id`          | uuid not null                                | buyer's workspace                                                                          |
| `payment_id`            | uuid not null → payments                     |
| `order_id`              | uuid not null → orders                       |
| `order_line_id`         | uuid null → order_lines                      | null = whole-order refund                                                                  |
| `refund_trans_id`       | text not null unique                         | **our** id, sent to SSLCommerz (`RFD-<base32(refunds.id)>`)                                |
| `amount_paisa`          | bigint not null                              |                                                                                            |
| `reason_code`           | `refund_reason` not null                     | `not_as_described \| corrupt_file \| duplicate_purchase \| accidental \| policy_exception` |
| `reason_note`           | text not null                                | required, min 10 chars (PRODUCT-DECISIONS 4.8)                                             |
| `status`                | `refund_status` not null default `requested` | §5.5                                                                                       |
| `provider_ref_id`       | text null                                    | SSLCommerz `refund_ref_id`                                                                 |
| `provider_status`       | text null                                    | last raw provider status                                                                   |
| `requested_by`          | uuid not null → profiles                     | platform staff                                                                             |
| `settled_at`            | timestamptz null                             |                                                                                            |
| `created_at/updated_at` |                                              |                                                                                            |

### 3.5 `inbound_events` _(new; shared, proposed — see ARCHITECTURE §5)_

`id`, `provider`, `event_type`, `provider_event_id` (**unique with provider**), `raw_body jsonb`, `raw_headers jsonb`, `source_ip inet`, `signature_ok bool`, `validated bool`, `status` (`received|processing|processed|failed|ignored`), `attempts int`, `last_error text`, `correlation_id uuid`, `workspace_id uuid null`, `merchant_account_id uuid null`, `received_at`, `processed_at`. For SSLCommerz, `provider_event_id = val_id` when present, else `tran_id || ':' || status`; for bKash, the `paymentID` (§5.5).

**`workspace_id` and `merchant_account_id` are null for platform events** (marketplace, subscription, credit pack — money on Acadigma's own store) and **set for school fee events** (F-CM-08), where the merchant account resolved from the IPN path token determines both. Index `(workspace_id, received_at desc) where workspace_id is not null`. Per **D-31 (3)**.

### 3.6 `platform_settings` _(new; singleton, proposed)_

`id` (check = 1), `commission_bps int not null default 3000`, `payout_minimum_paisa bigint not null default 100000` (৳1,000), `earnings_hold_days int not null default 7`, `refund_window_days int not null default 7`, `vat_bin text null`, `vat_rate_bps int not null default 0`, `receipt_footer text`, `updated_by`, `updated_at`.

### 3.7 `idempotency_keys` _(shared, per ARCHITECTURE §5)_

`key text pk`, `scope text`, `user_id`, `workspace_id`, `request_hash text`, `response jsonb`, `status`, `created_at`, `expires_at (now()+24h)`.

### 3.8 RLS policies — in words

Every policy below is additionally covered by a pgTAP isolation + escalation test.

**`orders`**

- _select_: a row is visible if `app.has_role(workspace_id,'{owner,admin}')` **or** `buyer_user_id = app.current_user_id()`, **or** `app.is_platform_admin()`. So a teacher sees their own school-funded order; a school owner sees every order billed to the school; a staff member sees only their own.
- _insert_: denied to all roles. Orders are created **only** by server actions running under the user's JWT through a `SECURITY DEFINER` function `app.create_order(...)` that computes amounts itself — there is no direct client insert path. (Belt and braces: an insert policy exists that requires `buyer_user_id = app.current_user_id() AND status = 'draft' AND total_paisa = 0`, so even a leaked path cannot mint a priced order.)
- _update_: denied to every role including platform staff. Status transitions happen in service-role server code and webhook handlers only.
- _delete_: denied to all. Abandoned drafts are swept by a job, not by users.

**`order_lines`**: _select_ mirrors the parent order (an `exists` subquery on `orders`), **plus** `seller_user_id = app.current_user_id()` so a seller can see the lines that belong to them (title, gross, commission, seller amount) without seeing the buyer's other lines or the buyer's other orders. _insert/update/delete_: denied to all roles.

**`payments`**: _select_ = same visibility as the parent order, **minus** `session_key`/`gateway_url`, which are exposed only to the buyer who owns the order via a view `payments_buyer_v`. Platform staff select all. _insert/update/delete_: denied to all roles (service role only).

**`refunds`**: _select_ = parent-order visibility ∪ platform staff ∪ affected seller (via the order line). _insert/update_: platform staff only, and only through the refund server action (which additionally checks the 7-day window). _delete_: denied to all.

**`inbound_events`**: _select_ platform staff see every row. **Additionally**, `app.has_role(workspace_id,'{owner,admin}')` may read rows where `workspace_id` is **not null** — a school can see the gateway events for its own fee collection, which it needs for reconciliation and support. Those rows carry amounts, statuses and provider ids but **no student identity**, which is what makes this compatible with F-CM-08 §5.13's rule that platform staff never see fee data: the school sees its own events, and nobody sees a name. _insert/update/delete_: denied to all roles; written by the Edge Functions with the service role.

**`platform_settings`**: _select_ to any authenticated user (the commission rate is public-facing seller information). _update_: platform staff only. _insert/delete_: denied.

**`idempotency_keys`**: no client access at all; service role only.

### 3.9 Private files

- **Receipt PDFs** are stored in the `private` bucket at `receipts/<workspace_id>/<order_no>.pdf` and registered in `files` with `visibility='private'`. Access is via `/api/files/[id]` → 5-minute signed URL after the same check as `orders.select`, logged to `file_access_log`.
- **Nothing** about a payment is ever stored in a public bucket.

---

## 4. Workflows

### 4.1 Checkout (happy path)

**Trigger:** buyer taps a primary action that maps to `createOrder` (Buy now — F-CM-04; Upgrade — F-CM-06; Buy credits — F-CM-07).

1. Server action `createOrder` runs under the buyer's JWT. It resolves `WorkspaceContext`, re-reads the priced entity **from the database** (`listings.price_paisa`, `plans.price_monthly_paisa`, `credit_packs.price_paisa`), checks eligibility (listing `published`, not already entitled, plan exists, etc.), reads `platform_settings.commission_bps`, and inserts `orders` + `order_lines` with all amounts computed server-side. Status → `pending_payment`, `placed_at = now()`.
2. If `total_paisa = 0` (a free listing) the order short-circuits: status → `paid` with no payment row, fulfilment runs immediately, `paid_at = now()`. **The gateway is never called for ৳0** (§5.6).
3. Otherwise `startCheckout(orderId, idempotencyKey)` inserts a `payments` row (`status='created'`, `tran_id` derived from the payment id), then calls `provider.createCheckout()`.
4. The SSLCommerz adapter POSTs to the session API with `store_id`, `store_passwd`, `total_amount` (decimal taka, §5.7), `currency=BDT`, `tran_id`, `success_url`, `fail_url`, `cancel_url`, `ipn_url`, customer fields from `profiles`, product fields from the lines, `shipping_method=NO`, `product_profile=non-physical-goods`, and passthrough `value_a = order_id`, `value_b = workspace_id`, `value_c = kind`, `value_d = payment_id`.
5. Response `status=SUCCESS` → store `sessionkey`, `GatewayPageURL`; payment → `pending`. The server action returns the gateway URL; the browser does a **full-page redirect** (never an iframe — the gateway sets its own CSP and mobile-banking flows break inside frames).
6. Buyer pays on the hosted page (card / bKash / Nagad / Rocket / net banking — the gateway decides what to show; we show nothing of our own).
7. **Two things now race, and that is fine:** (a) SSLCommerz POSTs the IPN to our Edge Function, (b) the browser is POSTed back to `success_url`.
   - **(a) is authoritative.** `/functions/v1/sslcommerz-ipn` writes an `inbound_events` row keyed by `val_id`, checks the source IP against the allowlist, recomputes `verify_sign`, then calls the **validation API** with `val_id`. Only if that returns `VALID`/`VALIDATED` **and** `currency='BDT'` **and** `round(amount*100) = payments.amount_paisa` **and** `tran_id` matches does it move the payment to `captured`, the order to `paid`, and dispatch fulfilment.
   - **(b) is cosmetic.** `POST /api/payments/sslcommerz/return/success` verifies the user session, looks up the order by `tran_id`, and redirects to `/market/orders/<id>`. If the IPN has not landed yet the page shows _"Confirming your payment…"_ and polls `GET /api/payments/<id>/status` every 2 s for up to 60 s. It never grants anything.
8. Fulfilment dispatch (in the same DB transaction as the capture): `marketplace` → grant entitlements + create seller earnings (F-CM-04, F-CM-05); `subscription` → activate/extend the subscription (F-CM-06); `credit_pack` → append to `ai_credit_ledger` (F-CM-07).
9. Receipt PDF is enqueued in `jobs` (`type='receipt.render'`), rendered by `/api/pdf/receipt`, stored to `files`, emailed via Resend, logged to `email_log`.
10. **Audit:** `order.created`, `payment.created`, `payment.captured`, `order.paid`, `entitlement.granted`, `receipt.issued` — all with the same `correlation_id` as the `inbound_events` row.
11. **Notifications:** buyer `payment.succeeded`; each seller on the order `marketplace.sale`.

**Phone flow.** The whole of step 1–3 is one button in a sticky bottom bar (thumb zone, 56 px tall, full width minus 16 px gutters). Tapping it disables the button and shows an inline spinner with the text _"Opening secure payment…"_ — no modal, because the redirect is about to replace the page anyway. On return, `/market/orders/<id>` is a full page (not a sheet) so the browser back button lands on the marketplace, not on the gateway.

### 4.2 Failure, cancellation, expiry

- **`fail_url`** → `POST /api/payments/sslcommerz/return/fail` → payment `failed` (reason from the posted `error`), order stays `pending_payment`, buyer sees `/market/orders/<id>` with a red banner and a **Try again** button that calls `startCheckout` and creates a **new** `payments` row with a **new** `tran_id` (SSLCommerz requires `tran_id` uniqueness per attempt).
- **`cancel_url`** → payment `cancelled`, order stays `pending_payment`.
- **No response at all** (user closed the tab): a pg_cron job every 5 minutes marks payments older than `expires_at` and still `pending` as `expired`; orders with no live payment attempt and older than 24 h move to `abandoned`.
- An IPN arriving for an already-`expired` payment is still processed (validation API is the truth) and will flip it to `captured` — expiry is our bookkeeping, not the gateway's.

### 4.3 Refund

> **Scope — D-31 (4).** Everything in this section is **marketplace and subscription refunds only**: money Acadigma took onto its own store and therefore controls. Platform-staff-only, 7-day window, `platform_settings.refund_window_days`. **School fee refunds are a different thing with different rules** — the money is the school's, so the decision is the school's: **owner/admin, with no time window** (a school may legitimately refund a March withdrawal against January fees), executed against the school's own merchant account. They live in `fee_refunds` and are specified in F-CM-08 §4.10 and §5, sharing only the provider methods with this flow. `issueRefund` and `issueFeeRefund` are separate server actions and neither can act on the other's rows.

**Trigger:** platform staff opens `/platform/payments/orders/<id>` and taps **Refund**.

1. Server action `issueRefund` checks `is_platform_admin`, that `now() - orders.paid_at <= platform_settings.refund_window_days` (7), that the requested amount ≤ `total_paisa - refunded_paisa` for the order (or line-level equivalent), and that a reason code + ≥10-char note are present.
2. Insert `refunds` (`status='requested'`), then call the provider refund API with `bank_tran_id` (from the payment), a fresh `refund_trans_id`, `refund_amount` in decimal taka, and `refund_remarks` = reason code.
3. Response `APIConnect='DONE'` + `status='success'` → refund `settled`. `status='processing'` → refund `processing` and a `jobs` row `refund.poll` scheduled at +15 min. `status='failed'` or `APIConnect≠DONE` → refund `failed` with `errorReason`; staff sees it and can retry with a new `refund_trans_id`.
4. `refund.poll` calls the refund query API with `refund_ref_id` until it returns `refunded` (→ `settled`) or `cancelled` (→ `failed`); it gives up after 20 attempts over 5 days and raises a platform alert.
5. On `settled`: `orders.refunded_paisa += amount`, the affected `order_lines.refunded_paisa += amount`, order status → `refunded` or `partially_refunded`, **entitlement revoked** (F-CM-04), **seller earning reversed or clawed back** (F-CM-05 §5), buyer emailed a credit note PDF.
6. Audit: `refund.requested`, `refund.settled` / `refund.failed`, `entitlement.revoked`.

### 4.4 Reconciliation

A pg_cron job at 03:00 Asia/Dhaka (plus an on-demand button in `/platform/payments`):

1. Select payments in `pending` older than 30 minutes and payments in `captured` whose `validated_at` is null (should be impossible — if any appear, that is a bug and the job pages).
2. For each, call the **transaction query API** by `tran_id`. Map the returned status: `VALID`/`VALIDATED` → treat exactly as an IPN (validate amount, capture, fulfil); `FAILED`/`CANCELLED`/`EXPIRED`/`UNATTEMPTED` → set the matching terminal state; `no_of_trans_found=0` → leave `pending` until expiry.
3. Produce a `reconciliation_runs` row *(proposed: `id, ran_at, checked int, repaired int, mismatches jsonb, notes)*. Any **amount mismatch** between our order and the gateway is never auto-corrected: it is written to `mismatches`, the payment is flagged `status='disputed'`, and platform staff are notified.
4. Failure case that matters: an IPN that SSLCommerz sent and we 5xx'd. The reconciliation job is what makes that recoverable without the buyer noticing more than a delay.

**Per-merchant reconciliation — D-31 (6).** The job above runs **once, against Acadigma's own store**, because every payment it repairs belongs to Acadigma. Fee collection needs the same logic run **once per school**, using that school's credentials via `getPaymentProvider({kind:'workspace', merchantAccountId})`. That is a separate cron entry (`/api/cron/fees/reconcile`, F-CM-08 §4.11) iterating workspaces with an `active` merchant account and sharing this feature's transaction-query adapter code. Two consequences: drift on a fee payment is reported **to the school**, not to platform staff (per F-CM-08 §5.13, platform staff see no fee data); and a school with no merchant account is simply skipped. The `reconciliation_runs` table gains a nullable `workspace_id` on the same basis as `inbound_events` (§3.5).

---

## 5. Business rules and calculations

### 5.1 Amounts are never accepted from a client

The only inputs any checkout action takes are **ids** (`listing_id`, `plan_id`, `credit_pack_id`), a `funding` mode, and an `idempotency_key`. Prices are re-read from the database inside the same transaction that writes the order. A Zod schema with an `amount` field does not exist anywhere in `packages/contracts` for these actions, and a CI grep test asserts that.

### 5.2 Commission and seller amount (exact)

Let `commission_bps` be the value snapshotted on the order line (default **3000** = 30 %, from `platform_settings.commission_bps`).

```
commission_paisa = floor(gross_paisa * commission_bps / 10000)
seller_paisa     = gross_paisa - commission_paisa
```

- Integer arithmetic only, in `packages/domain/money.ts`, no floats anywhere.
- The **subtraction** (not a second floor) is deliberate: the rounding remainder always lands with the platform, so `commission_paisa + seller_paisa == gross_paisa` holds for every possible input. A pgTAP + Vitest property test asserts that identity over 0…10,000,000 paisa.
- Worked example: `gross_paisa = 25000` (৳250.00), `bps = 3000` → `commission = floor(75_000_000/10_000) = 7500` (৳75.00), `seller = 17500` (৳175.00).
- Worked example with a remainder: `gross_paisa = 33` → `commission = floor(99000/10000) = 9`, `seller = 24`. `9 + 24 = 33`. ✔
- Platform-sold lines (`plan`, `credit_pack`) carry `commission_bps = 0`, `commission_paisa = gross_paisa`, `seller_paisa = 0`, `seller_user_id = null`.
- **`platform_settings.commission_bps` is unreachable from fee code — D-31 (9).** Acadigma takes **0 %** of student fees (F-CM-08 §5.1), so commission is not "set to zero" there, it does not exist: `fee_invoice_lines` has no commission columns and no fee code path reads this setting. A CI test greps every file under the fee feature — `packages/domain/fees/**`, `packages/db/repositories/fee*`, `apps/web/app/**/fees/**`, `apps/web/app/**/pay/**`, `supabase/functions/fees-*` — and **fails the build** if `commission_bps`, `platform_settings` or `seller_paisa` appears in any of them.

### 5.3 State machines

**`orders.status`**

```
draft ──► pending_payment ──► paid ──► partially_refunded ──► refunded
  │             │               │                              ▲
  │             ├──► abandoned  └──────────────────────────────┘
  └──► cancelled
```

- `draft → pending_payment` on `createOrder` commit.
- `pending_payment → paid` **only** from a validated capture (or `total_paisa = 0`).
- `pending_payment → abandoned` by the sweeper after 24 h with no live attempt.
- `paid → partially_refunded` when `0 < refunded_paisa < total_paisa`; `→ refunded` when equal.
- No transition ever moves backwards out of `paid`.

**`payments.status`**

```
created ──► pending ──► captured
   │           ├──► failed
   │           ├──► cancelled
   │           └──► expired
   └──► failed (session create returned FAILED)
captured ──► disputed        (reconciliation mismatch; manual only)
```

`captured` is terminal for the payment; refunds live on their own table so a payment is never "un-captured".

**`refunds.status`**: `requested → processing → settled`, with `requested|processing → failed`. `settled` and `failed` are terminal.

### 5.4 Idempotency — three independent layers

1. **Client → server.** `startCheckout`, `createOrder`, `issueRefund` take `idempotency_key` (uuid v4 from the client). `idempotency_keys` stores `(key, scope, user_id, request_hash)`; a repeat with the same key and the same hash returns the stored response; a repeat with a **different** hash returns `409 IDEMPOTENCY_KEY_REUSED`.
2. **Gateway → server.** `inbound_events.provider_event_id` is unique per provider. The Edge Function's first statement is an `insert … on conflict do nothing returning id`; no row returned ⇒ this IPN was already seen ⇒ return `200 OK` immediately and do nothing else. SSLCommerz's own `VALIDATED` status (meaning "you already validated this") is treated as success, not as an error.
3. **Database.** `payments.val_id` is unique; the capture is written by `update payments set status='captured' … where id = $1 and status <> 'captured'` and fulfilment runs only if that update affected a row. Entitlement inserts additionally carry a unique constraint (F-CM-04 §3). Two concurrent IPN deliveries therefore produce exactly one entitlement.
4. **Attempt uniqueness.** Each retry creates a new `payments` row with a new `tran_id`, because SSLCommerz rejects a reused `tran_id` on session create.

### 5.5 Provider contract

```ts
// packages/contracts + adapters/payments/PaymentProvider.ts  (sketch)

// D-31 (1): credentials are resolved per call, never captured at module load.
export type ProviderScope =
  | { kind: "platform" } //  Acadigma's own store — marketplace, subscriptions, credit packs
  | { kind: "workspace"; merchantAccountId: string } //  a school's own store — F-CM-08 fees

export function getPaymentProvider(
  provider: ProviderId,
  scope: ProviderScope
): PaymentProvider

export interface PaymentProvider {
  readonly id: "sslcommerz" | "bkash" | "stripe" | "manual"
  createCheckout(i: CreateCheckoutInput): Promise<CreateCheckoutResult> // → {gatewayUrl, sessionKey, tranId, providerPaymentId?}
  parseWebhook(req: WebhookRequest): Promise<ParsedWebhook>
  //   → {providerEventId, tranId?, valId?, providerPaymentId?, rawStatus, signatureOk}
  //     valId and tranId are BOTH optional: a bKash callback carries only a paymentID.
  validate(i: {
    valId?: string
    tranId?: string
    providerPaymentId?: string
  }): Promise<ValidationResult>
  //   at least one identifier required; the adapter picks the one its API supports
  //   → {status:'valid'|'failed'|'cancelled'|'expired'|'unattempted'|'unknown',
  //      amountPaisa, currency, bankTranId, storeAmountPaisa, riskLevel, cardType, cardBrand, cardIssuer, cardNoMasked}
  refund(i: {
    bankTranId?: string
    providerPaymentId?: string
    refundTransId: string
    amountPaisa: bigint
    remarks: string
  }): Promise<RefundResult>
  refundStatus(i: { refundRefId: string }): Promise<RefundStatusResult>
}
```

**Credential resolution — D-31 (1).** The factory takes a `ProviderScope` and the returned adapter is **stateless with respect to credentials**: it holds none, captures none at module load, and resolves them inside each operation. For `{kind:'platform'}` they come from `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWD` (§5.11); for `{kind:'workspace'}` from `app.reveal_fee_merchant_credentials(merchantAccountId)`, callable only by the service role from inside a payment operation (F-CM-08 §3.9). Credentials are never returned to a caller, never logged, and never cross scopes — a CI test runs a platform charge and a school charge in the same process and asserts each used its own store. Redaction, no-redirect and TLS-1.2+ rules (§5.10 a) apply identically to both scopes. **A module-level credential capture is a build failure**, asserted by a grep test.

**Identifier widening — D-31 (7).** SSLCommerz's hosted flow is session → IPN → validate-by-`val_id`; bKash Checkout is grant-token → create → execute → query-by-`paymentID`, and returns a **callback, not an IPN**. `parseWebhook` therefore makes `tranId` and `valId` both optional and adds `providerPaymentId`, and `validate` accepts any one of the three. The capture gate in §5.10 (b) is unchanged in substance — whichever identifier the provider gave us must resolve to **our** payment row, and the amount and currency must match exactly.

Every method returns a `Result<T, PaymentError>`; no adapter throws to the caller. The interface is deliberately **id-and-amount only** — nothing provider-specific leaks into `packages/domain`.

### 5.6 Zero-amount orders

A ৳0 order (free listing) never reaches a provider: SSLCommerz's minimum transaction is **৳10.00** and it would reject it. The order goes straight `pending_payment → paid` with `paid_at = now()` and no `payments` row, and fulfilment runs in the same transaction. Receipts are still issued (they read ৳0.00). This is why `payments` is **not** a required child of `orders`.

### 5.7 Currency and unit conversion at the adapter boundary

- Internally: `bigint` paisa, `currency = 'BDT'`, always.
- To SSLCommerz: `total_amount = (amount_paisa / 100).toFixed(2)` — a decimal-taka string with exactly two places.
- From SSLCommerz: `amount_paisa = BigInt(Math.round(parseFloat(amount) * 100))`. The comparison against `payments.amount_paisa` is exact equality on the integers; a 1-paisa difference is a mismatch and blocks capture.
- `packages/domain/money.ts` owns `toGatewayAmount`, `fromGatewayAmount`, `formatBDT` (`৳1,250.00`, Bengali digits off by default), and is 100 % unit-tested.

### 5.8 Gateway limits that are product rules

- **Minimum ৳10.00, maximum ৳500,000.00 per transaction.** Therefore: listing prices must be `0` or `≥ 1000` paisa (enforced in F-CM-03 §5); plan and credit-pack prices must be `≥ 1000` paisa; any order whose total would exceed `50,000,000` paisa is **refused at `createOrder`** with `ORDER_EXCEEDS_GATEWAY_LIMIT` and routed to the Enterprise "contact us" path (PRODUCT-DECISIONS 5.1 already makes Enterprise contact-only, so this only bites on a hypothetical yearly Enterprise self-serve — recorded in §11).
- **The ceiling is handled differently for school fees — D-31 (5).** Refusing is acceptable here because an over-ceiling Acadigma order is a rarity with an obvious sales fallback. It is **not** acceptable for fees: Dhaka admission fees reach ৳500,000+ and elite annual fees run to ৳10–15 lakh (COMPETITORS.md §6.5), so refusing would fail a school's largest and most important transactions. **F-CM-08 owns a real split-payment flow** (§5.10, Part 8 there): a payable amount above the ceiling is split into instalments of at most ৳500,000, each its own `fee_payments` row and its own receipt, allocated against the same invoice as they land. That capability lives entirely in F-CM-08 and is **not** offered on `createOrder`; if self-serve Enterprise yearly is ever wanted, this is the pattern to copy.
- VAT: v1 **displays** a BIN and a `0 %` VAT line on invoices when `platform_settings.vat_bin` is set; it does not add tax to the total. `tax_paisa` exists so that turning it on later is a calculation change, not a migration.

### 5.8a Document numbering — one counter table for the whole product (D-31 (8))

Three features issue human-visible, auditable document series: orders and receipts here, invoices in F-CM-06, fee invoices and fee receipts in F-CM-08. They all need the same property — **gapless**, because a gap in a numbered series is an audit question in Bangladesh — and they were independently specified as `invoice_counters` and `fee_counters`. They unify into one table:

```
document_counters(
  workspace_id uuid null,        -- null = a platform-wide series (order numbers)
  kind         text not null,    -- 'order' | 'invoice' | 'fee_invoice' | 'fee_receipt' | 'credit_note'
  year         int  not null,
  last_no      bigint not null default 0,
  primary key (coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, year)
)
```

`app.next_document_no(workspace_id, kind)` takes a **row lock inside the caller's transaction**, increments and returns. Not a Postgres sequence: sequences gap on rollback, and the whole point is that they must not. A rollback leaves no gap because the increment rolls back with the row that would have used it. Prefix and padding are per `kind`, with F-CM-08 allowing a school-configurable prefix (`fee_settings.receipt_prefix`). `app.next_id()` (ARCHITECTURE §4) remains for internal sequential ids like `STU-` and `WS-`, where a gap is harmless; `app.next_document_no()` is specifically for money documents, where it is not.

### 5.9 `store_amount` is not our revenue

SSLCommerz returns `store_amount` = the amount net of **its own** gateway charge (e.g. ৳100 → ৳96 after a 4 % bank commission). We record it for reconciliation against settlement statements, and it is **never** used to compute commission or seller earnings. Seller earnings are computed from `gross_paisa` only. The gateway fee is a platform cost of doing business, absorbed out of the platform's 30 % — stated plainly on the seller earnings page so no seller is surprised (F-CM-05 §5).

### 5.10 Webhook trust model (what SSLCommerz actually gives us)

SSLCommerz does **not** HMAC-sign its IPN. It provides `verify_sign` (an MD5 over the fields named in `verify_key`, salted with the MD5 of the store password) which is weak, and an out-of-band **validation API**. Two facts about that API drive the whole design:

**(a) The store credentials travel in the request parameters.** The validation API, the transaction-query API and the refund API all carry `store_id` and `store_passwd` **as query/form parameters**, not in a header. So:

- Every one of these calls is made **server-side only** — from the Edge Function or a Node route holding server secrets. There is no browser code path, no client SDK, and no `NEXT_PUBLIC_*` variable that touches them. A CI test asserts `SSLCOMMERZ_STORE_PASSWD` appears in no client component and in no bundled client output.
- The password is treated as _a credential inside a URL_: `redactSecrets(url)` rewrites `store_passwd=…` to `store_passwd=***` before **any** logging, Sentry breadcrumb, or error message, and provider errors are re-wrapped as `PaymentError` with the raw URL stripped.
- TLS 1.2+ only, and **redirects are not followed** — following one would re-send the credentials to whatever host the response names.
- Secrets live in Vercel project env and Supabase Edge Function secrets, are rotatable, and are not readable from a preview deployment a PR author controls.

**(b) Nothing in an inbound request is trusted.** Anyone who can reach the IPN URL can POST a well-formed body with a plausible `verify_sign`. So the handler **re-derives the truth from SSLCommerz server-side and matches it against our own order**. Capture requires **all four** of the following, checked in this order, any failure blocking it:

1. the **validation API** (called server-side with `val_id`) returns `status ∈ {VALID, VALIDATED}`;
2. the returned **`tran_id`** equals the `tran_id` on **our** `payments` row;
3. the returned **amount**, converted to paisa, equals `payments.amount_paisa` **exactly** (integer equality, no tolerance);
4. the returned **currency** is `BDT` and equals the order's currency.

A mismatch on 2, 3 or 4 sets the payment to `disputed`, grants nothing, and pages platform staff. **Replay** is blocked independently of all four by the unique `val_id` and the unique `inbound_events.provider_event_id` (§5.4), so even a perfectly replayed genuine notification cannot produce a second entitlement, a second earning, or a second receipt.

Therefore:

- `verify_sign` is checked and its result recorded in `inbound_events.signature_ok`, but a pass **never** authorises anything on its own.
- **The validation API call is mandatory and is the only thing that authorises capture.** No code path grants an entitlement from the IPN body.
- Source IP is checked against the allowlist (`103.26.139.87` sandbox; `103.26.139.81`, `103.132.153.81` live) and recorded; a mismatch is logged and the event is still validated via the API, then processed — the IP list is a signal, not a gate, because provider IPs change.
- The `success_url` browser POST is treated as fully untrusted user input.

**verify_sign recomputation (sketch):**

```
keys      = verify_key.split(',')                      // provider tells us which fields
pairs     = keys.sort().map(k => `${k}=${body[k] ?? ''}`)
candidate = md5(pairs.join('&') + '&store_passwd=' + md5(STORE_PASSWD))
signatureOk = timingSafeEqual(candidate, body.verify_sign)
```

### 5.11 Sandbox vs live configuration

|                     | sandbox                                                                | live                                                                     |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Session API         | `https://sandbox.sslcommerz.com/gwprocess/v4/api.php`                  | `https://securepay.sslcommerz.com/gwprocess/v4/api.php`                  |
| Validation API      | `https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php` | `https://securepay.sslcommerz.com/validator/api/validationserverAPI.php` |
| Refund / tran query | `…/validator/api/merchantTransIDvalidationAPI.php` on the same host    | same                                                                     |
| Store id / password | sandbox store from the SSLCommerz developer portal                     | issued after merchant onboarding (trade licence, TIN/BIN, bank account)  |

- Env: `SSLCOMMERZ_MODE` (`sandbox|live`), `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWD`, `SSLCOMMERZ_IPN_SECRET_PATH` (a random path segment on the IPN URL, defence in depth). Set in Vercel project env **and** Supabase Edge Function secrets, never in `NEXT_PUBLIC_*`.
- `provider_mode` is written onto every `payments` row from `SSLCOMMERZ_MODE`. `/platform` shows a permanent amber ribbon when any payment in the last 24 h has `provider_mode='sandbox'` in a production deployment.
- Sandbox test instruments: VISA `4111111111111111` exp 12/26 CVV 111; Mastercard `5111111111111111`; mobile-banking OTP `111111` or `123456`. Documented in `docs/engineering/RUNBOOK-payments.md`, not in the repo README.
- The dev/preview environment points at sandbox; a CI check fails the production deploy if `SSLCOMMERZ_MODE=sandbox` on the `main` branch.

### 5.12 Rounding, currency display, and the receipt

- All displayed money is `formatBDT(paisa)`; no component multiplies or divides money itself. A lint rule bans `* 0.7`, `/ 100` and `toLocaleString` inside `apps/web/**` for money values — the exact bug that produced Base44's hardcoded `0.7`.
- Receipt PDF (`/api/pdf/receipt`) contains: Acadigma Campus header, `order_no`, date in Asia/Dhaka, buyer name + workspace, per-line title/qty/unit/gross, subtotal, VAT line (0 % + BIN when set), total, payment method (`card_brand`/`card_type`), masked instrument, `bank_tran_id`, and a footer from `platform_settings.receipt_footer`. Bengali font embedded. Deterministic: re-rendering the same order yields a byte-identical PDF, which is asserted by a test.

---

## 6. UI

| Route                            | Who         | 360×800                                                                              | ≥1024                                                | Primary action               | Empty                                  | Loading                         | Error                  |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------- | -------------------------------------- | ------------------------------- | ---------------------- |
| `/market/checkout/[orderId]`     | buyer       | Single column: order summary card, total in 28 px bold, sticky bottom **Pay ৳X** bar | Two-column: summary left, provider/trust panel right | Pay                          | n/a (order always exists)              | Skeleton summary + disabled bar | Inline `Alert` + Retry |
| `/market/orders`                 | buyer       | `DataList` cards: order_no, date, total, status chip                                 | Table: no, date, items, total, status, receipt       | Open order                   | _"No orders yet"_ + Browse marketplace | 6 skeleton rows                 | Retry                  |
| `/market/orders/[id]`            | buyer       | Status banner, line list, payment method, **Download receipt**                       | Same + right rail with payment details               | Download receipt / Try again | n/a                                    | Skeleton                        | Banner                 |
| `/app/billing/orders`            | owner/admin | Workspace-funded orders, same list                                                   | Table with buyer column                              | Open                         | _"No school purchases yet"_            | Skeleton                        | Retry                  |
| `/platform/payments`             | platform    | Tabs as a scrollable chip row: Payments · Refunds · Events · Reconciliation          | Sidebar + table                                      | Run reconciliation           | _"No payments today"_                  | Skeleton                        | Retry                  |
| `/platform/payments/orders/[id]` | platform    | Stacked: order, lines, payments, events timeline; **Refund** in a sheet              | Three panels                                         | Refund                       | n/a                                    | Skeleton                        | Banner                 |

Components from `packages/ui`: `AppShell`, `DataList`, `FormSheet`, `MoneyText`, `StatusChip`, `Alert`, `Skeleton`, `StickyActionBar`, `Timeline`, `EmptyState`.

**Phone specifics.** The pay button lives in `StickyActionBar` (bottom, safe-area padded, 56 px). Order status uses colour **and** an icon (contrast ≥ 4.5:1). The confirming-payment poller announces state changes through `aria-live="polite"`. Nothing on a payment screen opens in a new tab — mobile-banking apps return the user to the same tab.

---

## 7. Server contracts

All in `packages/contracts/payments.ts`; all return `Result<T, ApiError>`.

| Name                | Kind                                                                 | Input (Zod)                                                                                                                                                   | Output                                              | Errors                                                                                                                             | Idempotency         | Rate limit          |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| `createOrder`       | server action                                                        | `CreateOrderInput { kind, funding, items: ({type:'listing', listingId} \| {type:'plan', planId, period} \| {type:'credit_pack', packId})[], idempotencyKey }` | `{ orderId, orderNo, totalPaisa, requiresPayment }` | `LISTING_NOT_PURCHASABLE`, `ALREADY_ENTITLED`, `FUNDING_NOT_ALLOWED`, `ORDER_EXCEEDS_GATEWAY_LIMIT`, `PRICE_BELOW_GATEWAY_MINIMUM` | key                 | 10/min/user         |
| `startCheckout`     | server action                                                        | `{ orderId, idempotencyKey }`                                                                                                                                 | `{ paymentId, gatewayUrl }`                         | `ORDER_NOT_PAYABLE`, `PROVIDER_SESSION_FAILED`                                                                                     | key                 | 6/min/user          |
| `getPaymentStatus`  | route `GET /api/payments/[id]/status`                                | path param                                                                                                                                                    | `{ status, orderStatus }`                           | `NOT_FOUND`                                                                                                                        | n/a                 | 30/min/user         |
| `sslcommerzReturn`  | route `POST /api/payments/sslcommerz/return/{success\|fail\|cancel}` | form body (untrusted)                                                                                                                                         | 303 redirect                                        | —                                                                                                                                  | n/a                 | 60/min/ip           |
| `sslcommerzIpn`     | Edge Function `POST /functions/v1/sslcommerz-ipn/<secret-path>`      | form body                                                                                                                                                     | `200 OK` always (after persisting the event)        | never 4xx on a parseable body — a 4xx makes SSLCommerz retry forever                                                               | `provider_event_id` | 300/min/ip          |
| `issueRefund`       | server action                                                        | `{ paymentId, orderLineId?, amountPaisa?, reasonCode, reasonNote, idempotencyKey }`                                                                           | `{ refundId, status }`                              | `REFUND_WINDOW_CLOSED`, `REFUND_EXCEEDS_REMAINING`, `PROVIDER_REFUND_FAILED`, `FORBIDDEN`                                          | key                 | 20/hour/staff       |
| `runReconciliation` | route `POST /api/cron/payments/reconcile`                            | `{ sinceHours? }`                                                                                                                                             | `{ checked, repaired, mismatches }`                 | `FORBIDDEN`                                                                                                                        | run id              | cron + 1/min manual |
| `renderReceipt`     | route `GET /api/pdf/receipt?orderId=`                                | query                                                                                                                                                         | PDF stream                                          | `NOT_FOUND`, `FORBIDDEN`                                                                                                           | cached by `files`   | 20/min/user         |

`amountPaisa` appears **only** on `issueRefund`, and only for platform staff; it is bounded by the server-read remaining amount.

---

## 8. Parts (build chunks)

**Part 1 — Money primitives and contracts** _(≤1 day)_
Scope: `packages/domain/money.ts` (paisa `bigint`, bps math, `toGatewayAmount`/`fromGatewayAmount`, `formatBDT`), `packages/contracts/payments.ts` enums and schemas, the money lint rule.
Files: `packages/domain/money.ts`, `packages/domain/money.test.ts`, `packages/contracts/payments.ts`, `packages/config/eslint/no-money-math.js`.
Tests: Vitest property test for `commission + seller == gross` over 1e5 random inputs; rounding table tests.
**Demo:** `pnpm test packages/domain` green, including the identity property.

**Part 2 — Schema: orders, order_lines, payments, refunds, platform_settings, inbound_events** _(2 days)_
Scope: migration with enums, tables, indexes, RLS policies exactly as §3.8, `app.create_order()` definer function, `platform_settings` seed (`commission_bps=3000`, hold 7 d, minimum 100000 paisa).
Tests: pgTAP — cross-tenant select denied on all six tables; buyer can read own order but not another buyer's; seller sees only their own line; nobody can insert or update `orders`/`payments`; platform admin read works.
**Demo:** pgTAP suite green; `select * from orders` as another tenant returns 0 rows.

**Part 3 — PaymentProvider interface + SSLCommerz adapter (session create)** _(2 days)_
Scope: `adapters/payments/PaymentProvider.ts`, `SSLCommerzProvider.ts` (`createCheckout` only), config loader with `SSLCOMMERZ_MODE`, a `FakeProvider` for tests.
Tests: unit tests with a mocked fetch for SUCCESS/FAILED; a contract test asserting `FakeProvider` and `SSLCommerzProvider` satisfy the same interface.
**Demo:** a script hits sandbox and prints a real `GatewayPageURL` that opens the hosted page.

**Part 4 — createOrder + startCheckout + return routes** _(2 days)_
Scope: the two server actions, idempotency table + helper, the three return routes, `/market/checkout/[orderId]` and `/market/orders/[id]` pages with the confirming-payment poller.
Tests: integration — amounts come from the DB, a tampered client payload is ignored; idempotent double-submit yields one order.
**Demo:** on a phone viewport, buy a sandbox item and land back on the order page in the _confirming_ state (fulfilment not yet built).

**Part 5 — IPN Edge Function + validation + payment/order state machine** _(2 days)_
Scope: `supabase/functions/sslcommerz-ipn`, `inbound_events` write-first, `verify_sign` recompute, IP allowlist logging, validation API call, amount/currency/tran_id checks, capture transaction, `fulfilment.dispatch` hook (no-op handlers for now).
Tests: replayed IPN → one capture; wrong amount → `disputed`, no capture; `VALIDATED` treated as success; unparseable body → 200 + `inbound_events.status='failed'`.
**Demo:** sandbox payment flips the order to `paid` end-to-end with the browser tab closed during payment.

**Part 6 — Fulfilment dispatcher + audit + notifications** _(1 day)_
Scope: `packages/domain/payments/fulfilment.ts` registry keyed by `order.kind`, audit events, buyer/seller notifications, `jobs` enqueue.
Tests: dispatcher runs exactly once per capture; unknown kind fails loudly.
**Demo:** an audit trail for one order showing `order.created → payment.captured → order.paid` with one `correlation_id`.

**Part 7 — Receipt PDF + email** _(1.5 days)_
Scope: `/api/pdf/receipt`, React-PDF template with Bengali font, store to `files`, Resend email, download button on the order page.
Tests: snapshot test on the rendered PDF text layer; access control test (another user gets 403).
**Demo:** download a receipt on a phone and open it in the OS viewer.

**Part 8 — Refunds (initiate + poll)** _(2 days)_
Scope: `refunds` flow, `issueRefund` action, provider `refund`/`refundStatus`, `refund.poll` job, `/platform/payments/orders/[id]` refund sheet, credit-note PDF.
Tests: window enforcement; over-refund rejected; processing → settled via poll; failure surfaces with `errorReason`.
**Demo:** refund a sandbox order and watch it reach `settled`.

**Part 9 — Reconciliation job + payment ops console** _(1.5 days)_
Scope: cron route, transaction query API, `reconciliation_runs`, `/platform/payments` tabs (payments, refunds, events, reconciliation), mismatch alerting.
Tests: a payment left `pending` after a dropped IPN is repaired by the job; an amount mismatch is flagged, never auto-captured.
**Demo:** delete an IPN delivery, run reconciliation, order becomes `paid`.

**Part 10 — Live-mode hardening and runbook** _(1 day)_
Scope: env matrix, sandbox ribbon, CI guard against sandbox-on-main, IP allowlist config, secret IPN path, `docs/engineering/RUNBOOK-payments.md` (what to do on mismatch, stuck refund, provider outage), Sentry alerts.
Tests: CI guard test; a synthetic "provider down" test returns `PROVIDER_SESSION_FAILED` cleanly with a friendly message.
**Demo:** the runbook walked through end-to-end by someone who did not build it.

**Part 11 — Scope-aware provider factory (`getPaymentProvider`)** _(1.5 days)_ — **D-31 (1); owned by whoever built Parts 1–10.**
This part exists in **this** feature rather than in F-CM-08 because it refactors this feature's adapter code, and handing that to a fee-team developer cold is how a payments regression gets written. It lands **after** Part 10, so the platform path is already hardened and green before a second scope is introduced.
Scope: replace the module-level env credential capture in `SSLCommerzProvider` with `getPaymentProvider(provider, scope)` per §5.5; make the adapter stateless w.r.t. credentials; resolve platform credentials from env and workspace credentials from `app.reveal_fee_merchant_credentials()` inside each operation; update every existing call site to an explicit `{kind:'platform'}` scope; widen `parseWebhook`/`validate`/`refund` for the bKash identifier shape (D-31 (7)) without implementing the bKash adapter itself (that stays F-CM-08); add nullable `workspace_id`/`merchant_account_id` to `inbound_events` and `reconciliation_runs` with the extended select policy (D-31 (3), (6)).
Files: `adapters/payments/{PaymentProvider.ts,SSLCommerzProvider.ts,factory.ts}`, `packages/contracts/payments.ts`, the migration for the two nullable columns.
Tests: Parts 1–10's whole suite still green with no behavioural change; a platform charge and a school charge in one process each use their own store and never cross; a grep test failing the build on any module-level credential capture; redaction still applied under both scopes; a `{kind:'workspace'}` call with no active merchant account fails cleanly rather than silently falling back to the platform store.
**Demo:** a marketplace purchase and a school fee payment complete in the same test run against two different sandbox stores, with the platform suite unchanged.

---

## 9. Acceptance criteria

1. **Given** a published listing priced ৳250 **when** a signed-in teacher taps _Buy now_ **then** an order is created with `total_paisa = 25000`, `commission_paisa = 7500`, `seller_paisa = 17500`, and the browser is redirected to an `sslcommerz.com` gateway URL.
2. **Given** a checkout request whose body has been tampered with to include `totalPaisa: 1` **when** `createOrder` runs **then** the order is still created at ৳250 and the tampered field is ignored (there is no such field in the schema).
3. **Given** a buyer who completes payment on the hosted page **when** the IPN arrives and the validation API returns `VALID` with a matching amount **then** the payment is `captured`, the order is `paid`, and exactly one entitlement is granted.
4. **Given** the same IPN is delivered five more times **when** each is processed **then** `inbound_events` has one row, the payment stays `captured`, and no additional entitlement, earning, or receipt is created.
5. **Given** the IPN reports `VALID` but the validation API returns an amount of ৳200 for a ৳250 order **when** the handler runs **then** the payment is set to `disputed`, **no** entitlement is granted, and platform staff are notified.
6. **Given** the validation API is unreachable **when** the IPN arrives **then** the Edge Function returns `200`, the `inbound_events` row is `received`, and the reconciliation job completes the capture within 24 hours.
7. **Given** a buyer closes the tab after paying **when** they return to `/market/orders` **then** the order shows `paid` and the receipt is downloadable.
8. **Given** a buyer cancels on the gateway **when** they land on `cancel_url` **then** the payment is `cancelled`, the order remains `pending_payment`, and **Try again** creates a new payment with a new `tran_id`.
9. **Given** a free (৳0) listing **when** the buyer taps _Get it free_ **then** the order goes straight to `paid` with no `payments` row and no provider call, and the entitlement is granted.
10. **Given** a listing priced ৳5 **when** anyone tries to buy it **then** `createOrder` fails with `PRICE_BELOW_GATEWAY_MINIMUM` (and F-CM-03 never allows such a price to be published).
11. **Given** an order paid 3 days ago **when** platform staff issue a full refund with a reason **then** a `refunds` row reaches `settled`, `orders.status = 'refunded'`, the entitlement is revoked, and the seller earning is reversed or clawed back.
12. **Given** an order paid 9 days ago **when** platform staff attempt a refund **then** it fails with `REFUND_WINDOW_CLOSED`.
13. **Given** a school owner **when** they open `/app/billing/orders` **then** they see every order billed to their school and none from any other workspace, confirmed by a pgTAP cross-tenant test.
14. **Given** a teacher **when** they query `orders` directly with their JWT **then** they see only rows where they are the buyer.
15. **Given** any provider call (session create, validation, transaction query, refund) **when** it succeeds or fails **then** no log line, Sentry event, `inbound_events` row or error response contains `store_passwd`, and the value is present in no client bundle — asserted by a redaction unit test plus a bundle-grep CI test.
16. **Given** an IPN whose `tran_id` names payment A but whose `val_id` validates to payment B **when** the handler runs **then** nothing is captured, the payment is `disputed`, and staff are paged.
17. **Given** a platform charge and a school fee charge running in the same process **when** each calls `getPaymentProvider` with its own scope **then** each uses its own store credentials, neither reads the other's, and no credential was captured at module load — asserted by a grep test that fails the build on module-level capture.
18. **Given** a completed school fee payment **when** the capture transaction commits **then** `orders`, `order_lines` and `payments` gain **zero** rows, and the money is recorded only in `fee_payments`/`fee_transactions`.
19. **Given** two transactions that each take a document number and one rolls back **when** both finish **then** the surviving series has **no gap**, for `order`, `invoice`, `fee_invoice` and `fee_receipt` kinds alike.
20. **Given** `SSLCOMMERZ_MODE=sandbox` on the `main` branch **when** CI runs **then** the production deploy fails.
21. **Given** any payment screen at 360×800 **when** rendered **then** the primary action is within the bottom 25 % of the viewport, is ≥ 44 px tall, and axe reports zero serious violations.

---

## 10. Tests

- **Unit (domain, ≥95 % here):** money conversion, bps math and the sum identity, state-machine transition table (every illegal transition rejected), `verify_sign` recomputation against a captured sandbox payload fixture, `tran_id` encoding length.
- **DB (pgTAP):** RLS isolation and escalation for `orders`, `order_lines`, `payments`, `refunds`, `inbound_events`, `platform_settings`; `app.create_order` refuses a caller who is not a member; unique constraints on `tran_id`, `val_id`, `provider_event_id`.
- **Integration (server actions, with `FakeProvider`):** full happy path; tampered inputs; idempotency key reuse with a different body; concurrent double IPN (two parallel invocations) producing one entitlement; refund window; over-refund.
- **Contract:** enum parity between Postgres enums and `packages/contracts`; a grep test asserting no checkout schema has an `amount` field.
- **e2e (Playwright, 360×800 and 1280×800):** sandbox purchase with the test card including the OTP step; cancel path; retry after failure; receipt download; axe on every payment screen.
- **Performance budgets:** `createOrder` p95 < 300 ms; IPN handler p95 < 1.5 s including the validation round-trip; `/market/orders` first contentful paint < 2.0 s on a simulated 3G phone.
- **Security:** an authenticated non-buyer cannot read another order (403 + RLS 0 rows); `/api/pdf/receipt` for someone else's order is 403; the IPN endpoint with a forged body but a valid-looking `verify_sign` grants nothing because the validation API is authoritative; `redactSecrets` unit tests over every provider URL shape; a bundle-grep CI test asserting no store credential reaches the client; a no-follow-redirect test on the provider HTTP client; the four-check capture gate exercised with each check failing in turn.

---

## 11. Open questions

1. **Gateway ceiling vs Enterprise yearly.** A yearly Enterprise plan could exceed ৳500,000 in one transaction. _Default assumed:_ Enterprise stays contact-only and is invoiced offline (PRODUCT-DECISIONS 5.1), so `createOrder` refuses it. If self-serve Enterprise is ever wanted, we split into instalment orders.
2. **Does SSLCommerz's settlement report get imported?** _Default assumed:_ no in v1; `store_amount_paisa` is captured per payment and reconciled manually from the merchant panel. A CSV importer is a future part.
3. **Partial refunds at line level for multi-line orders.** v1 orders are single-line in practice (cart-less buy now, one plan, one credit pack). _Default assumed:_ line-level refund is supported in the schema and the action but the UI only offers whole-line refunds.
4. **EMI.** SSLCommerz supports `emi_option`. _Default assumed:_ off (`emi_option=0`) in v1.
5. **Is `risk_level = 1` a hold?** _Default assumed:_ capture proceeds, the order is flagged `metadata.risk=1`, entitlement **is** granted (digital goods, refundable within 7 days), and platform staff get a notification. Revisit if fraud appears.
6. **Chargebacks / disputes** are out of band with SSLCommerz. _Default assumed:_ handled as a staff-initiated refund plus a manual note; no dispute table in v1.
