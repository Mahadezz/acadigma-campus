# WF-06 — Marketplace: become a seller → KYC → listing → moderation → purchase → entitlement → payout

|                  |                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journey          | Every taka the marketplace will ever move, plus the school-funded variant and the refund path                                                                                                                                                     |
| Primary actors   | Seller (any verified user) · Buyer (teacher, personal funds) · Platform staff                                                                                                                                                                     |
| Secondary actors | School admin (approves school-funded purchases) · Owner (school billing)                                                                                                                                                                          |
| Features         | F-CM-01 (payments core) · F-CM-02 (seller onboarding/KYC) · F-CM-03 (listings & moderation) · F-CM-04 (browse, purchase, entitlements, downloads) · F-CM-05 (earnings & payouts) · F-TE-05 (resources library) · F-ID-08 (platform console shell) |
| Money rules      | BDT only · integer **paisa** `bigint` · commission **3000 bps**, snapshotted per order line · gateway min ৳10, max ৳500,000 · 7-day refund window · 7-day earnings hold · monthly payout, min ৳1,000                                              |
| Exit state       | `entitlements` granted only from a validated IPN, a watermarked download, a `seller_earnings` row walking `pending → available → paid`                                                                                                            |

---

## 1. Actors and preconditions

| Actor                     | Device        | Needs                                                                                                                            |
| ------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Seller**                | Phone or PC   | A verified email; **no school membership required** — selling is a per-user capability (`seller_profiles`), not a workspace type |
| **Buyer (personal)**      | Android phone | Any signed-in account; the buyer of record is their **personal workspace** so RLS is uniform and there is never a null tenant    |
| **Buyer (school-funded)** | Android phone | A teacher membership; the buyer of record is the **school workspace** and the entitlement survives the teacher leaving           |
| **School admin**          | Windows PC    | `marketplace.purchase.approve` (a **Pro** entitlement)                                                                           |
| **Platform staff**        | Windows PC    | `profiles.is_platform_admin` → `/platform` only; never implies workspace membership                                              |

**Preconditions**

- `platform_settings` singleton: `commission_bps=3000`, `payout_minimum_paisa=100000`, `earnings_hold_days=7`, `refund_window_days=7`.
- `SSLCOMMERZ_MODE`, `STORE_ID`, `STORE_PASSWD` and the secret IPN path set in Vercel env **and** Supabase Edge Function secrets — never in `NEXT_PUBLIC_*`. CI fails a production deploy with `SSLCOMMERZ_MODE=sandbox`.
- `files` private bucket + `/api/files/[id]` signed-URL handler + `file_access_log`.

---

## 2. Sequence

```mermaid
sequenceDiagram
    autonumber
    actor S as Seller
    actor PS as Platform staff
    actor B as Buyer (teacher)
    participant C as Client
    participant SA as Server Actions
    participant DB as Postgres + RLS
    participant GW as SSLCommerz
    participant EF as Edge Fn (IPN)
    participant JOB as jobs / pg_cron

    S->>C: profile menu → /sell → Start selling
    C->>SA: createSellerProfile(SellerProfileInput)
    SA->>DB: seller_profiles(kyc_status='pending') + seller_payout_methods(encrypted) + files(private KYC docs)
    DB->>DB: notifications: seller.kyc.submitted → platform queue
    PS->>C: /platform/kyc → Approve
    C->>SA: decideKyc({id,'approve'})
    SA->>DB: seller_profiles(kyc_status='approved', verified_at)
    DB->>DB: notifications: seller.kyc.approved → seller

    S->>C: /sell/listings → New listing → Submit for review
    C->>SA: submitListing({id})
    SA->>DB: listings(status='submitted') + listing_files(private) + preview render job
    DB->>DB: notifications: marketplace.listing.submitted → platform queue
    PS->>C: /platform/listings → Approve
    SA->>DB: listings(status='approved')
    S->>C: Publish
    SA->>DB: listings(status='published', published_at)

    B->>C: /market/[slug] → Buy ৳250
    C->>SA: createOrder({kind:'marketplace', funding:'personal', items:[{listingId}], idempotencyKey})
    SA->>DB: re-reads listings.price_paisa; app.create_order() computes every amount
    DB->>DB: orders(pending_payment) + order_lines(gross 25000, commission 7500, seller 17500)
    C->>SA: startCheckout({orderId, idempotencyKey})
    SA->>DB: payments(status='created', tran_id='ACD-…')
    SA->>GW: session API
    GW-->>SA: GatewayPageURL
    SA-->>C: full-page redirect
    B->>GW: pays with bKash

    par Authoritative
        GW->>EF: IPN POST /functions/v1/sslcommerz-ipn/<secret>
        EF->>DB: inbound_events insert … on conflict do nothing
        EF->>EF: verify_sign recompute (signal only)
        EF->>GW: validation API by val_id
        GW-->>EF: VALID + amount
        EF->>DB: amount == payments.amount_paisa? then BEGIN
        DB->>DB: payments.captured + orders.paid + entitlements + seller_earnings(pending) + listings counters
        DB->>DB: audit_events × n (one correlation_id) + notifications payment.succeeded / marketplace.sale
        EF->>JOB: jobs receipt.render
    and Cosmetic
        GW-->>C: POST success_url
        C->>SA: /api/payments/sslcommerz/return/success
        SA-->>C: 303 /market/orders/[id] → "Confirming your payment…" polls 2 s × 60 s
    end

    B->>C: Download
    C->>SA: GET /api/files/[id]
    SA->>DB: entitlement check → watermark PDF with buyer name/email → 5-min signed URL
    DB->>DB: file_access_log
    JOB->>DB: pg_cron earnings.release (+7 days) → seller_earnings.available
    PS->>C: /platform/payouts (1st of the month) → run
    SA->>DB: payout_runs + payouts(seller, amount, ref) + seller_earnings.paid
```

---

## 3. Steps

### Stage A — Become a seller and pass KYC (PRODUCT-DECISIONS §1.8, §4.5)

1. **Profile menu → Sell.** `/sell` is reached from the profile menu of whichever shell the user is in; there is **no seller workspace and no seller shell**. Selling is a capability of a user.
2. **Storefront step** — display name, bio (≤ 500), avatar, professional link. _Writes:_ `seller_profiles` (1:1 with `profiles`; `display_name`, `bio`, `kyc_status='none'`).
3. **Identity step** — document type (NID / passport / driving licence), document scan, selfie. Both files go to the **private** bucket as `files` rows with `visibility='private'`; they are readable only by platform staff through `app.can_open_kyc_file()`, and every open is logged.
4. **Payout step** — bank (name / account name / account number / branch) **or** bKash / Nagad number. _Writes:_ `seller_payout_methods` (`type`, `details_encrypted` via pgsodium, `masked`, `is_default`, `verified_at`). Full details are visible **only** to platform staff; the seller sees `•••• 4821`. This is the data the prototype collected and threw away.
5. **Submit** → `seller_profiles.kyc_status='pending'`, `submitted_at`. _Events:_ `notifications` → platform queue: `seller.kyc.submitted`. The SLA shown is **2 business days**, everywhere, once (PRODUCT-DECISIONS §4.5).
6. **Platform staff** at `/platform/kyc` open the row, view the documents through signed URLs (logged), and **Approve** or **Reject with a reason**.
   _Writes:_ `seller_profiles` (`kyc_status`, `reviewed_by`, `reviewed_at`, `rejection_reason`), never a second row — resubmission **updates**, so `user_id` stays unique.
   _Events:_ `notifications` → seller: `seller.kyc.approved` / `seller.kyc.rejected`. `audit_events`: `seller_profile.kyc_decided`.
   `kyc_status='approved'` **is** the `verified_seller` badge. There is no second badge in v1.

### Stage B — Create and moderate a listing (PRODUCT-DECISIONS §4.4)

7. **`/sell/listings` → New listing.** Title, description, resource type, subject, grade level, curriculum, language, tags, cover image, **main file(s)** (private bucket), and price in taka.
   _Price rule:_ `0` (free) or `≥ 1000 paisa` — SSLCommerz's minimum transaction is ৳10, so a ৳5 listing can never be published (F-CM-01 §5.8).
   _Writes:_ `listings` (`status='draft'`, `price_paisa`, `seller_user_id`), `listing_files` (private).
8. **Submit for review** → `status='submitted'`. A render job produces the **preview** (first page / thumbnail) at approval time, watermarked `Preview — Acadigma`. _Events:_ `notifications` → platform queue: `marketplace.listing.submitted`.
9. **Platform staff** at `/platform/listings` see a queue with the file preview, the price and the seller. Decisions: **Approve** · **Changes requested** (with notes) · **Reject** (with a reason).
   Lifecycle: `draft → submitted → approved | changes_requested | rejected → published → unlisted`. **The seller publishes an approved listing**, so they control launch timing. Editing price or files on a published listing sends it back through review.
   _Events:_ `notifications` → seller: `marketplace.listing.approved` / `.changes_requested` / `.rejected`. `audit_events`: `listing.moderated` with before/after.
10. **Bulk upload** (CSV + a zip of files) creates listings in `draft` and every one of them **goes through moderation like any other** — there is no bypass.

### Stage C — Purchase with personal funds (F-CM-01 §4.1)

11. **`/market`** — server-filtered, cursor-paginated browse (never a client-side filter over an unbounded list). A listing card shows price, rating, sales count and the verified-seller badge; the **main file URL is not in the payload** at any point.
12. **`/market/[slug]`** — preview pages, description, seller card, reviews. The primary action lives in a `StickyActionBar`: a 56 px full-width **Buy — ৳250** in the thumb zone.
13. `createOrder` takes **ids only** — `{kind, funding, items:[{type:'listing', listingId}], idempotencyKey}`. There is no `amount` field anywhere in `packages/contracts` for checkout actions, and a CI grep test asserts that. The server re-reads `listings.price_paisa` inside the same transaction, reads `platform_settings.commission_bps`, and `app.create_order()` computes:
    ```
    commission_paisa = floor(gross_paisa × commission_bps / 10000)
    seller_paisa     = gross_paisa − commission_paisa        -- subtraction, not a second floor
    ```
    so `commission + seller == gross` for every possible input. ৳250 → commission ৳75, seller ৳175.
    _Writes:_ `orders` (`order_no` from `app.next_id(workspace_id,'order')` → `ORD-2026-000147`, `workspace_id` = the buyer's **personal** workspace, `status='pending_payment'`, `commission_bps_snapshot`), `order_lines` (`title_snapshot`, `unit_price_paisa`, `gross_paisa`, `commission_paisa`, `seller_paisa`, `seller_user_id`).
    **No client insert path exists**: `orders` has no INSERT grant to any role, and the belt-and-braces policy that does exist requires `total_paisa = 0`.
14. `startCheckout` writes a `payments` row (`tran_id = 'ACD-' + base32(payment.id)`, `provider_mode` from env, `expires_at = +30 min`) and calls the SSLCommerz session API with passthrough `value_a=order_id`, `value_b=workspace_id`, `value_c=kind`, `value_d=payment_id`. The browser does a **full-page redirect** — never an iframe, because mobile-banking flows break inside frames.
15. **Two things now race, and that is by design.**
    - **(a) The IPN is authoritative.** `POST /functions/v1/sslcommerz-ipn/<secret-path>` writes `inbound_events` **first** (`insert … on conflict do nothing`, unique on `(provider, provider_event_id=val_id)`), records the source-IP check and the recomputed `verify_sign` as **signals**, then calls the **validation API**. Capture happens only when validation returns `VALID`/`VALIDATED` **and** `currency='BDT'` **and** `round(amount×100) = payments.amount_paisa` **and** `tran_id` matches.
    - **(b) The browser return is cosmetic.** `POST /api/payments/sslcommerz/return/success` is treated as fully untrusted input; it looks up the order and redirects to `/market/orders/[id]`, which shows _"Confirming your payment…"_ and polls `GET /api/payments/[id]/status` every 2 s for 60 s. **It grants nothing.**
16. **Capture transaction** (one DB transaction): `payments.status='captured'` with `where status <> 'captured'` (fulfilment runs only if that update affected a row) → `orders.status='paid'`, `paid_at` → **fulfilment dispatch by `order.kind`**:
    - `marketplace` → `entitlements` (`workspace_id`, `user_id` for personal, `listing_id`, `order_line_id`, unique per `(order_line_id)` and per `(scope, listing_id)`) + `seller_earnings` (`status='pending'`, `available_at = now() + 7 days`) + `listings.total_sales`/`total_revenue_gross_paisa` incremented **server-side** (the buyer never writes the seller's row);
    - a copy of the purchased material is registered in the buyer's `resources` library with `source='marketplace_purchase'` and `listing_id` — **by reference to the entitlement, not by copying the seller's URL**.
      _Events:_ `audit_events`: `order.created`, `payment.created`, `payment.captured`, `order.paid`, `entitlement.granted`, `receipt.issued` — all carrying the `inbound_events.correlation_id`. `notifications`: buyer `payment.succeeded`; each seller `marketplace.sale`. `jobs`: `receipt.render` → `/api/pdf/receipt` → `files` (private, `receipts/{workspace_id}/{order_no}.pdf`) → Resend → `email_log`.
17. **৳0 listings** short-circuit: `pending_payment → paid` with **no `payments` row and no gateway call**, fulfilment in the same transaction, receipt still issued reading ৳0.00.

### Stage D — Watermarked download (PRODUCT-DECISIONS §4.7)

18. **Download** calls `GET /api/files/[id]`. The handler checks the entitlement, then **watermarks the buyer's name and email into the PDF server-side at download time**, stores nothing public, issues a **5-minute** signed URL, and writes `file_access_log` (`file_id`, `user_id`, `workspace_id`, `ip_hash`, `outcome`).
19. **Review.** Only a user with an entitlement from a `paid` order line may review, one review per order line; the seller may reply once.
    _Writes:_ `reviews` (`listing_id`, `order_line_id` unique, `buyer_user_id`, `rating 1..5` **checked**, `body`, `seller_reply`). A trigger recomputes `listings.rating_average` and `review_count` — the prototype never recomputed either.

### Stage E — School-funded purchase (PRODUCT-DECISIONS §4.6)

20. On the listing page a teacher in a **Pro** school sees a second action: **Ask school to buy**. Sheet: a one-line justification.
    _Writes:_ `purchase_approvals` (`workspace_id`, `listing_id`, `requested_by`, `justification`, `status='pending'`, `price_paisa_snapshot`).
    _Events:_ `notifications` → owner + admins: `marketplace.purchase.requested`, `action_url=/app/billing/approvals`.
21. **Admin** at `/app/billing/approvals` sees the request with the listing preview, the price and the requester, and taps **Approve & pay** or **Decline** (reason required).
    Approve creates an order with `funding='workspace'`, `workspace_id` = the **school**, `buyer_user_id` = the approving admin, `approval_id` set, and runs the identical checkout. **The school pays immediately via SSLCommerz** — there is no invoice credit in v1.
22. The entitlement belongs to the **workspace**, so it survives the requesting teacher leaving (WF-11). A school invoice PDF carrying the school's BIN/VAT fields is issued in addition to the buyer receipt.

### Stage F — Refund (PRODUCT-DECISIONS §4.8)

23. **Platform staff only**, at `/platform/payments/orders/[id]` → **Refund**. Checks: `now() − orders.paid_at ≤ platform_settings.refund_window_days` (7), amount ≤ `total_paisa − refunded_paisa`, a `reason_code` and a **≥ 10-character note**.
    _Writes:_ `refunds` (`refund_trans_id = 'RFD-'+base32(id)`, `status='requested'`), then the provider refund API with the payment's `bank_tran_id`.
    Provider `success` → `settled`; `processing` → a `jobs{type:'refund.poll'}` at +15 min, up to 20 attempts over 5 days, then a platform alert.
24. On `settled`: `orders.refunded_paisa` and `order_lines.refunded_paisa` increase, order → `refunded` or `partially_refunded`, **entitlement revoked** (the next download 403s), and the seller earning is **reversed if still `pending`, otherwise clawed back as a negative adjustment against the next payout**. The buyer gets a credit-note PDF.
    _Events:_ `audit_events`: `refund.requested`, `refund.settled`, `entitlement.revoked`, `earning.reversed`. `notifications`: buyer `payment.refunded`; seller `marketplace.earning_reversed`.

### Stage G — Earnings hold → monthly payout (PRODUCT-DECISIONS §4.2 / D-17)

25. `seller_earnings` walks `pending → available → paid | reversed`. A pg_cron job releases `pending → available` when `available_at < now()` and no refund touched the order line.
26. **`/sell/earnings`** shows the three buckets with real numbers, the 30 % commission stated plainly, and a line explaining that **the gateway's own charge is a platform cost absorbed from the 30 %** — `payments.store_amount_paisa` is recorded for reconciliation and is **never** used to compute commission or seller earnings.
27. **`/platform/payouts`**, on the **1st of the month**: the queue lists every seller whose `available` total ≥ **৳1,000** with their masked payout method. Staff execute the transfers out of band and record a **transfer reference** per seller.
    _Writes:_ `payout_runs` (`period`, `run_by`, `totals`), `payouts` (`seller_user_id`, `amount_paisa`, `method_snapshot`, `transfer_reference`, `status='paid'`, `paid_at`), `seller_earnings.status='paid'`, `payout_id`.
    _Events:_ `notifications` → seller: `marketplace.payout_sent`. `jobs`: seller statement PDF → `files` → email. `audit_events`: `payout.executed`.
28. Below the minimum, the balance simply rolls into next month and the seller's earnings page says so explicitly with the shortfall.

### Stage H — Reconciliation (the safety net)

29. pg_cron at **03:00 Asia/Dhaka** (and an on-demand button) selects payments `pending` older than 30 minutes and any `captured` with a null `validated_at` (which should be impossible — if one appears, the job pages). It calls the transaction query API by `tran_id` and maps the result exactly as an IPN would.
    **An amount mismatch is never auto-corrected**: it is written to `reconciliation_runs.mismatches`, the payment is flagged `disputed`, and platform staff are notified. This is what makes a 5xx'd IPN recoverable without the buyer noticing more than a delay.

---

## 4. Failure and edge cases

| Case                                                      | Detection                                                                                   | Behaviour                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client tampers the body with `totalPaisa: 1`              | No such field exists in the schema                                                          | Order is still created at ৳250; the field is stripped                                                                                                      |
| IPN delivered six times                                   | `inbound_events.provider_event_id` unique + conditional capture update + unique entitlement | One event row, one capture, one entitlement, one earning, one receipt                                                                                      |
| IPN says VALID, validation API says ৳200 for a ৳250 order | Exact integer comparison                                                                    | Payment → `disputed`, **no entitlement**, platform staff notified                                                                                          |
| Validation API unreachable                                | Edge Function returns **200** with `inbound_events.status='received'`                       | Never 4xx on a parseable body (a 4xx makes SSLCommerz retry forever); reconciliation completes the capture within 24 h                                     |
| Buyer closes the tab after paying                         | IPN is authoritative                                                                        | `/market/orders` shows `paid` with a downloadable receipt                                                                                                  |
| Buyer cancels on the gateway                              | `cancel_url`                                                                                | Payment `cancelled`, order stays `pending_payment`, **Try again** creates a _new_ `payments` row with a _new_ `tran_id` (the gateway rejects a reused one) |
| No response at all                                        | pg_cron sweeper every 5 min                                                                 | Payment `expired` after 30 min; order `abandoned` after 24 h. A late IPN still captures — expiry is our bookkeeping, not the gateway's                     |
| Already entitled                                          | `createOrder` eligibility check                                                             | `ALREADY_ENTITLED` with a link to the download                                                                                                             |
| Listing unpublished between page load and pay             | Re-read inside the order transaction                                                        | `LISTING_NOT_PURCHASABLE`; no order                                                                                                                        |
| Price below ৳10                                           | `PRICE_BELOW_GATEWAY_MINIMUM`                                                               | Refused at `createOrder`; F-CM-03 never allows such a price to publish                                                                                     |
| Order over ৳500,000                                       | `ORDER_EXCEEDS_GATEWAY_LIMIT`                                                               | Refused and routed to the Enterprise "contact us" path                                                                                                     |
| `risk_level = 1` from the gateway                         | Recorded on the payment                                                                     | Capture proceeds, `orders.metadata.risk=1`, platform staff notified (digital goods, refundable for 7 days)                                                 |
| Refund attempted on day 9                                 | `refund_window_days`                                                                        | `REFUND_WINDOW_CLOSED`                                                                                                                                     |
| Over-refund                                               | Server-read remaining amount bounds `amountPaisa`                                           | `REFUND_EXCEEDS_REMAINING`                                                                                                                                 |
| Seller deletes the file after sales                       | `listing_files` are immutable once a listing is published                                   | A replacement file re-enters moderation; existing entitlements keep resolving to the version they bought                                                   |
| Seller's KYC later revoked                                | `seller_profiles.kyc_status`                                                                | Listings are unlisted; existing entitlements and downloads are unaffected; pending earnings are held pending review                                        |
| Teacher leaves after a school-funded purchase             | Entitlement scope is the workspace                                                          | The school keeps the material (WF-11)                                                                                                                      |
| Sandbox rows in production                                | `payments.provider_mode`                                                                    | `/platform` shows a permanent amber ribbon; CI fails a production deploy with `SSLCOMMERZ_MODE=sandbox`                                                    |

---

## 5. What the Base44 prototype did instead

There was **no payment processing of any kind**. `ListingDetail.jsx:264` printed the string _"Secure payment via SSLCommerz / Stripe"_; `@stripe/stripe-js` was in `package.json` and never imported; there was no provider call, no redirect, no webhook, no order, no payment record, no receipt and no refund path. "Buy Now" wrote `MarketplaceTransaction{status:'completed'}` **from the browser**, and that entity's create RLS was `{}` — so any authenticated user could mint a completed transaction for any listing, and could equally mint a `SellerEarnings` row payable to themselves with a self-chosen amount. Commission was computed in the browser and existed at **two contradictory rates simultaneously**: a hardcoded `COMMISSION_RATE = 0.30`, an admin-editable `DEFAULT_COMMISSION = 15` in the payout tool (0–50, free text), nine UI strings promising sellers 70 %, a `permissions.js` entry saying nobody may change it, and `SellerEarnings.commission_rate` written as `0.30` by one path and `15` by another into the same column. Delivery was `window.open(listing.main_file_url)` on a raw unsigned URL — and because the listing RLS granted read on every `published` row to everyone, **every paid file on the platform was downloadable without buying it**; the purchased copy was registered by pointing at the seller's object, so a seller deleting their file broke every buyer's library. The promised watermark was a CSS-rotated div over the preview image. The buyer's own sales-counter update was denied by RLS (it required `seller_id == user.id`), so `total_sales` and `total_revenue_gross` never moved and every seller analytic read zero. `MarketplaceListing.rating_average`, `review_count`, `view_count` and `published_at` were never written either. **Nothing could ever be published**: the moderation queue did not exist, so listings submitted as `pending_review` stayed there forever while the browse screen filtered on `published`. **Nobody could ever be verified**: no file in the codebase updated `IdentityVerification.status`, which had **no RLS at all**, so every seller's NID/passport scan and selfie — the fields whose own schema comment reads _"INTERNAL ONLY"_ — were readable by any authenticated user. Payout details were collected in the Become-a-Seller wizard and **discarded** by `handleSubmit`. "Process N Payouts" inserted `SellerEarnings` rows with `status:'pending_payout'` and reported _"N payouts processed successfully"_; nothing ever became `paid`, no rail was ever called, and the tool itself was structurally unreachable (an admin-gated panel nested inside a `role==='teacher'`-gated tab). School-funded purchases wrote a `pending` transaction and the approvals screen read a **different entity** (`BillingRecord`) that nothing in the codebase ever created — a dead end by the author's own in-code admission. `refunded` and `disputed` were enum values no code path could reach.
