# F-CM-04 — Marketplace browse, purchase, entitlement and delivery

|                  |                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Area             | market                                                                                                                               |
| Status           | planned                                                                                                                              |
| Owner branch     | `feat/commerce-marketplace`                                                                                                          |
| Depends on       | F-CM-01 (orders/payments), F-CM-02 (seller profiles), F-CM-03 (listings, files), F-OP-0x (files, PDF pipeline), F-AU-02 (workspaces) |
| Plan             | `docs/plan/ROADMAP.md` chunk — commerce, fourth                                                                                      |
| Base44 reference | `docs/reference/base44-inventory/04-commerce-billing.md` §3.1, §3.5, §5 rows 1–11, §7-A9, §7-B18, §7-B19, §7-C21, §7-C28, §7-E43–44  |

> **Schema note.** Tables and columns are **proposed; `docs/architecture/DATA-MODEL.md` wins**.

---

## 1. Purpose

The buyer half of the marketplace: find a resource, look at it, buy it (personally or on the school's money), download it, and say what you thought of it. Everything a buyer receives is gated on an `entitlements` row that only a validated payment can create.

**What Base44 had:** browse that called an unbounded `.list()` and filtered **the entire table in the browser** with no pagination. _Buy Now_ wrote a `completed` transaction with `create` RLS of `{}` and no payment at all, then handed over `listing.main_file_url` — a raw, unsigned, permanent URL that was already readable by anyone who could see the listing, so **paid files were free to everybody whether they clicked Buy or not**. The purchased resource was "delivered" by copying the seller's URL into the buyer's library row, so if the seller replaced the file every buyer's copy changed. School-funded purchase wrote a `pending` transaction that the approvals screen could never see, because the approvals screen queried a different entity that nothing ever wrote — a documented dead end. Sales counters could not increment because RLS required the updater to be the seller. Reviews were written but `rating_average` was never recomputed, so no rating ever surfaced. Related-listing cards called `window.location.reload()`.

**Done looks like:** a teacher searches _"class 8 algebra worksheet"_ on a phone, filters to free + NCTB, opens a listing, sees three watermarked preview pages, taps _Request school purchase_, her admin approves and the school pays, and she downloads a PDF whose footer reads _"Licensed to Rahima Khatun · Shaheen Model School · ORD-2026-000147"_. Every download is logged. The source file has no public URL at any point.

---

## 2. Roles and permissions

| Action                              | Permission key                      | anon | any signed-in              | teacher/staff | admin/owner | platform    |
| ----------------------------------- | ----------------------------------- | ---- | -------------------------- | ------------- | ----------- | ----------- |
| Browse / search / view listing      | —                                   | ✔    | ✔                          | ✔             | ✔           | ✔           |
| Buy personally                      | `market.purchase.personal`          | —    | ✔                          | ✔             | ✔           | ✔           |
| Request a school-funded purchase    | `market.purchase.request`           | —    | —                          | ✔             | ✔           | —           |
| Approve / decline a request and pay | `market.purchase.approve`           | —    | —                          | —             | ✔           | —           |
| Download an entitled file           | `market.download`                   | —    | ✔ (if entitled)            | ✔             | ✔           | ✔ (audited) |
| Write a review                      | `market.review.write`               | —    | ✔ (if entitled)            | ✔             | ✔           | —           |
| Reply to a review                   | `market.review.reply`               | —    | seller of the listing only |               |             | ✔           |
| Moderate / remove a review          | `market.review.moderate`            | —    | —                          | —             | —           | ✔           |
| View workspace entitlements         | `market.entitlement.read.workspace` | —    | —                          | ✔ (read)      | ✔           | ✔           |

---

## 3. Data

### 3.1 `entitlements` _(new; proposed)_ — the single source of "may download"

| column                 | type                               | notes                                                                                     |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `id`                   | uuid pk                            |
| `listing_id`           | uuid not null → listings           |
| `scope`                | `entitlement_scope` not null       | `user \| workspace`                                                                       |
| `user_id`              | uuid null → profiles               | set when `scope='user'`                                                                   |
| `workspace_id`         | uuid null → workspaces             | set when `scope='workspace'`                                                              |
| `order_id`             | uuid not null → orders             |
| `order_line_id`        | uuid not null → order_lines        |
| `listing_file_version` | int not null                       | the file version bought — a later seller replace does **not** change what this buyer owns |
| `granted_at`           | timestamptz not null default now() |
| `revoked_at`           | timestamptz null                   | set on refund                                                                             |
| `revoked_reason`       | text null                          |
| `download_count`       | int not null default 0             | maintained by trigger on `download_log`                                                   |
| `last_downloaded_at`   | timestamptz null                   |

Constraints:

- `check ((scope='user' and user_id is not null and workspace_id is null) or (scope='workspace' and workspace_id is not null and user_id is null))`
- unique partial `(listing_id, user_id) where scope='user' and revoked_at is null`
- unique partial `(listing_id, workspace_id) where scope='workspace' and revoked_at is null`

These two unique indexes are what make double-IPN-delivery safe (F-CM-01 §5.4): a second grant attempt hits the index and is a no-op.

Indexes: `(user_id, granted_at desc)`, `(workspace_id, granted_at desc)`, `(order_id)`.

**Ownership rule (PRODUCT-DECISIONS 4.6):** a personal purchase grants `scope='user'` — it follows the person between schools forever. A school-funded purchase grants `scope='workspace'` — it belongs to the school and survives the requesting teacher leaving. A teacher who bought personally and later leaves takes it with her; a school that paid keeps it. There is no third case.

### 3.2 `purchase_approvals` _(new; proposed)_

| column                      | type                                         | notes                                                                  |
| --------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `id`                        | uuid pk                                      |
| `workspace_id`              | uuid not null → workspaces                   | the school                                                             |
| `listing_id`                | uuid not null → listings                     |
| `requested_by`              | uuid not null → profiles                     |
| `justification`             | text null                                    | ≤ 300 chars                                                            |
| `price_paisa_at_request`    | bigint not null                              | snapshot; re-checked at approval (§5.3)                                |
| `status`                    | `approval_status` not null default `pending` | `pending \| approved \| declined \| expired \| purchased \| cancelled` |
| `decided_by` / `decided_at` |                                              |                                                                        |
| `decline_reason`            | text null                                    |
| `order_id`                  | uuid null → orders                           | set when the admin pays                                                |
| `expires_at`                | timestamptz not null                         | `requested_at + 14 days`                                               |
| `created_at/updated_at`     |                                              |                                                                        |

Indexes: `(workspace_id, status, created_at desc)`, unique partial `(workspace_id, listing_id) where status='pending'`, `(status, expires_at)`.

### 3.3 `download_log` _(new; proposed)_

`id`, `entitlement_id`, `listing_id`, `user_id` (who actually downloaded — for a workspace entitlement this is the member, not the school), `workspace_id` (null for personal), `file_id`, `file_version`, `ip inet`, `user_agent text`, `watermark_token uuid` (embedded in the PDF, §5.6), `bytes bigint`, `created_at`. Append-only; no update or delete grants for any role. Retention 1 year (ARCHITECTURE §10), then aggregated into `download_counts_monthly`.

This is _also_ written to `file_access_log` by the generic file layer; `download_log` is the marketplace-specific record with the watermark token, which is what makes a leaked file traceable.

### 3.4 `listing_reviews` _(new; proposed)_

| column                  | type                                       | notes                                                                       |
| ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| `id`                    | uuid pk                                    |
| `listing_id`            | uuid not null → listings                   |
| `order_line_id`         | uuid not null **unique** → order_lines     | **one review per purchase**, structurally                                   |
| `reviewer_user_id`      | uuid not null → profiles                   |
| `workspace_id`          | uuid null                                  | set when the purchase was school-funded (shows "purchased by their school") |
| `rating`                | int not null                               | `check (rating between 1 and 5)` — the prototype had no constraint          |
| `body`                  | text null                                  | ≤ 1500 chars, plain text                                                    |
| `status`                | `review_status` not null default `visible` | `visible \| hidden_by_staff \| withdrawn`                                   |
| `seller_reply`          | text null                                  | ≤ 1000 chars                                                                |
| `seller_replied_at`     | timestamptz null                           |
| `helpful_count`         | int not null default 0                     |
| `edited_at`             | timestamptz null                           | editable for 7 days after posting                                           |
| `created_at/updated_at` |                                            |                                                                             |

Indexes: unique `(order_line_id)`, `(listing_id, created_at desc) where status='visible'`, `(reviewer_user_id)`.

### 3.5 `listing_views` _(new; proposed)_ — see F-CM-03 §5.8

`listing_id, session_hash, viewed_on date, first_at` with unique `(listing_id, session_hash, viewed_on)`. Rolled up nightly into `listings.view_count`.

### 3.6 `saved_listings` _(new; proposed)_

`user_id, listing_id, created_at`, pk `(user_id, listing_id)`. A wishlist; there is no cart in v1 (PRODUCT-DECISIONS: cart-less buy now).

### 3.7 RLS policies — in words

**`entitlements`**

- _select_: `scope='user' AND user_id = app.current_user_id()`, **or** `scope='workspace' AND app.has_role(workspace_id,'{owner,admin,teacher,staff}')`, **or** `app.is_platform_admin()`. A parent role sees nothing here.
- _insert_: **denied to every role.** Entitlements are written only by the fulfilment handler running with the service role inside the validated-payment transaction (F-CM-01 §4.1 step 8). There is no server action a client can call that inserts an entitlement — that is the structural fix for the prototype's open-`create` transaction table.
- _update_: denied to every role; `revoked_at` is set by the refund handler (service role).
- _delete_: denied to everyone, including platform staff. Revocation is a column, not a delete, so the audit trail survives.

**`purchase_approvals`**

- _select_: `app.has_role(workspace_id,'{owner,admin}')` sees all rows for the school; `requested_by = app.current_user_id()` sees their own; platform staff see all.
- _insert_: `requested_by = app.current_user_id()` **and** `app.has_role(workspace_id,'{owner,admin,teacher,staff}')` **and** `status='pending'` **and** `order_id is null`. A `with check` forces `price_paisa_at_request` to be ignored on write — a trigger overwrites it from `listings.price_paisa`, so a client-supplied price is impossible.
- _update_: `app.has_role(workspace_id,'{owner,admin}')` may move `pending → approved|declined`; `requested_by` may move `pending → cancelled` (withdraw their own request). Nothing else. `order_id` and `status='purchased'` are set by the server action that creates the order.
- _delete_: denied.

**`download_log`**: _select_ the downloading user (own rows), workspace `owner|admin` for their workspace's rows, the **seller** for rows against their own listings but with `user_id`, `ip` and `user_agent` **hidden** (exposed through `seller_download_stats_v`, which returns counts by listing and day only — a seller gets to know how often their work is downloaded, not by whom, from where). Platform staff see all. _insert_: service role only. _update/delete_: denied to all.

**`listing_reviews`**

- _select_: anyone (including anonymous) may read `status='visible'` rows through `listing_reviews_public_v` (reviewer display name and avatar, rating, body, date, seller reply — no email, no workspace name unless school-funded, in which case the school's public name only). Reviewer sees their own in any status; seller sees all reviews on their listings; platform staff see all.
- _insert_: `reviewer_user_id = app.current_user_id()` **and** an `exists` check that the referencing `order_line_id` belongs to an order the caller bought, that the line's `listing_id` matches, and that a **non-revoked** entitlement exists. Enforced in the policy, not only in the action — so even a direct PostgREST call cannot fake a review.
- _update_: reviewer may edit `rating`/`body` within 7 days of `created_at` (a trigger enforces the window and stamps `edited_at`); the **seller** may set `seller_reply`/`seller_replied_at` on reviews of their own listings and nothing else (column-level check in a trigger); platform staff may set `status='hidden_by_staff'`.
- _delete_: denied; `status='withdrawn'` instead.

**`saved_listings`**: owner-only, all four verbs.

**`listing_views`**: no client access; service role writes, nightly rollup reads.

---

## 4. Workflows

### 4.1 Browse and search (server-side, always)

1. `/market` renders on the server. Query params are the state: `?q=&type=&subject=&grade=&curriculum=&lang=&price=&rating=&sort=&cursor=`.
2. The query hits `listing_public_v` with `status='published' AND deleted_at is null`, applies facets as SQL predicates, orders by the chosen sort, and returns **24 rows plus a cursor**. Keyset pagination on `(sort_key, id)` — never `OFFSET`.
3. Facet counts come from one grouped query per facet group, cached 60 s in the route segment cache. Zero-count facet options are shown disabled rather than hidden, so the filter list does not jump around.
4. **No client-side filtering of the catalogue exists.** `DataList` is virtualised and fetches the next page on scroll (phone) or via a _Load more_ button at ≥1024.

**Phone flow.** A sticky search field at the top (44 px). Filters live behind a single **Filters** button that opens a bottom `Sheet` with the facet groups as accordions and a sticky _Show N results_ button; the count updates live as facets are toggled. Active filters render as removable chips in a horizontally scrollable row under the search field. Sort is a separate small sheet. Nothing important is more than one thumb-reach away.

**Empty and error states.** No results → _"Nothing matches these filters"_ + the three most-relaxable filters as one-tap removals + _"Browse all worksheets"_. Search failure → the last successful result set stays on screen with a retry banner rather than a blank page.

### 4.2 Listing detail

`/market/listings/[slug]` — server-rendered, indexable, works signed out.

Order on a phone: cover → title → seller row (avatar, name, **Verified** badge, link to storefront) → rating + count → price → **preview carousel** (scroll-snap, watermarked images from the public bucket) → what's included (type, pages, file size, format) → grade/subject/curriculum/language chips → description → reviews (3 shown, _See all_ opens a full page) → _More from this seller_ → _Similar resources_. The buy action is in a sticky bottom bar the entire time.

The buy bar has up to two actions depending on context:

- Not signed in → **Sign in to buy** (returns to the same listing after auth).
- Signed in, not entitled, free listing → **Get it free**.
- Signed in, not entitled, paid, personal workspace active → **Buy ৳250**.
- Signed in, not entitled, paid, school workspace active, role teacher/staff → **Buy ৳250** _and_ **Ask school to buy** (secondary).
- Signed in, not entitled, paid, school workspace active, role admin/owner → **Buy ৳250 (personal)** _and_ **Buy for school ৳250**.
- Already entitled → **Download** (+ _"You bought this on 12 May"_ or _"Your school bought this"_).
- Own listing → **Manage listing**.

Related listings are real `<Link>`s to real routes. (The prototype reloaded the page.)

### 4.3 Personal purchase

1. Tap **Buy ৳250** → `createOrder({kind:'marketplace', funding:'personal', items:[{type:'listing', listingId}]})`. The buyer's **personal** workspace is the tenant regardless of which shell they are in, because a personal purchase belongs to the person.
2. Pre-checks, all server-side: listing is `published`; seller is not the buyer; no live entitlement already (`ALREADY_ENTITLED` → the UI switches to Download instead of erroring); price re-read from the DB.
3. `startCheckout` → hosted gateway → IPN → validation → capture (all F-CM-01).
4. Fulfilment handler `marketplace.fulfil(order)` runs inside the capture transaction: for each `order_line`, insert `entitlements` (`scope='user'`, `listing_file_version` = current primary version), insert `seller_earnings` (F-CM-05), bump `listings.purchase_count` and `seller_profiles.total_sales` via triggers.
5. Buyer lands on `/market/orders/[id]` with a **Download** button; the listing page now shows Download too; the item appears in `/market/library`.
6. Notifications: buyer `marketplace.purchase_complete`; seller `marketplace.sale` with the net amount.
7. Audit: `entitlement.granted` with the order, listing and scope.

### 4.4 Download (the security-critical path)

1. Buyer taps **Download**. `POST /api/market/download` with `{listingId}`.
2. Handler, under the **user's JWT** first: resolve `WorkspaceContext`; find a non-revoked entitlement that is either `scope='user' AND user_id = me` or `scope='workspace' AND workspace_id = ctx.workspaceId AND I am an active member`. No entitlement → `403 NOT_ENTITLED`. **This check happens before anything touches storage.**
3. Load the `listing_files` row at `entitlement.listing_file_version` — using the **service role**, because the buyer has no read access to that table by design (F-CM-03 §3.6).
4. Rate limit: 20 downloads per entitlement per day, 100 per user per day. Exceeding it returns `429` with a plain-language message; it is logged and, at 5× the limit in a week, flagged to platform staff.
5. **If the file is a PDF:** generate a per-download watermarked copy (§5.6) into a short-lived object at `tmp/downloads/<watermark_token>.pdf`, sign it for **5 minutes**, return the URL, and schedule deletion at +15 minutes. **If it is not a PDF** (docx/pptx/xlsx/zip): sign the original private object for 5 minutes; the watermark is then only the `download_log` record, and the listing page says so honestly (_"Watermarking applies to PDF downloads"_).
6. Insert `download_log` with the `watermark_token`; trigger bumps `entitlements.download_count`.
7. The response is `{url, expiresAt, filename}`; the browser navigates to it. On a phone this hands off to the OS downloader, which is why the URL must be a direct object URL and not a streaming response from our server.

**Failure cases:** file missing from storage (500 + platform alert + the buyer sees _"We're fixing this — your purchase is safe"_); watermarking fails (fall back to the unwatermarked original, log a warning, still record the download — never deny a paying buyer their file because of a rendering bug); expired URL (the button simply re-requests).

### 4.5 School-funded purchase (request → approve → school pays)

**Actors:** a teacher/staff member requests; an admin/owner approves **and pays in the same step**. There is no invoice credit (PRODUCT-DECISIONS 4.6).

1. Teacher taps **Ask school to buy**, optionally writes a justification, submits. `purchase_approvals` row `pending`, `price_paisa_at_request` snapshotted by trigger, `expires_at = +14 days`.
2. Admins get a notification `marketplace.approval_requested` and a badge on `/app/billing/marketplace`.
3. Admin opens the request: listing card, requester, justification, price **now** vs price at request, whether the school already owns it, and the school's month-to-date marketplace spend.
4. **Approve & pay** → `createOrder({kind:'marketplace', funding:'workspace', items:[…], approvalId})` on the school workspace, then straight into checkout. The approval moves to `approved`, and to `purchased` when the order is paid.
5. **Decline** → `declined` with a reason; the requester is notified and may buy it personally instead (the UI offers exactly that).
6. On payment capture, the entitlement is `scope='workspace'`. Every active member of that school can download it. The requesting teacher gets a _"Your school bought this"_ notification.
7. If the price rose between request and approval, the admin sees a warning and approving uses the **current** price (§5.3).
8. Expiry: a daily job moves `pending` requests past `expires_at` to `expired` and notifies the requester.
9. Audit: `purchase_approval.requested / approved / declined / expired`.

**Phone flow.** The request form is a `Sheet` with one textarea and a sticky submit. The admin's queue is a card list under `/app/billing/marketplace` with **Approve & pay** as the primary card action; approving opens the checkout page directly (no intermediate confirm — the payment page _is_ the confirm).

### 4.6 Library

`/market/library` — everything the current context can download: personal entitlements always, plus the active workspace's entitlements when a school workspace is active, in two labelled groups (_Yours_ / _Your school's_). Each row: cover, title, seller, purchase date, download button, review prompt if not yet reviewed. Filter by subject/grade/type; search by title. Purchased marketplace items also surface in the school Resources library (F-TE-0x) as read-only entries with a `source='marketplace'` badge, linking here for the download — the resource row references the entitlement rather than copying a URL, which is the fix for the prototype's shared-URL delivery.

### 4.7 Reviews

1. After a download, and from the library, an entitled buyer sees _"Rate this resource"_. The form is a `Sheet`: 5 stars (44 px targets), optional text.
2. `writeReview` requires a non-revoked entitlement and an unused `order_line_id`. One review per purchase, enforced by a unique index — so a buyer who bought personally and whose school also bought it may review twice (two purchases, two lines). That is correct and rare.
3. Posting recomputes `listings.rating_avg_bp` and `rating_count` and `seller_profiles.rating_avg_bp`/`rating_count` **by trigger** (the prototype never recomputed either).
4. The seller is notified and may reply once per review, inline, shown under the review with a _Seller_ label. Replies are editable for 7 days.
5. Buyers may edit their review for 7 days, then it is frozen (`edited_at` shown). Withdrawal is always possible and removes it from the averages.
6. Platform staff may hide a review (`hidden_by_staff`) with a reason; it leaves the averages and the seller is told why. Sellers can **report** a review but cannot remove one.
7. A refunded purchase revokes the entitlement and sets the review to `withdrawn` automatically — you do not get to keep a rating on a product you were refunded for.

---

## 5. Business rules and calculations

### 5.1 Entitlement is the only key to a file

There is exactly one function that decides whether bytes may be served:

```ts
// packages/domain/market/entitlement.ts (sketch)
export function resolveEntitlement(ctx, listingId, rows): Entitlement | null
// rows come from a single query; returns the first non-revoked row matching
//   (scope='user' && user_id===ctx.userId) || (scope='workspace' && workspace_id===ctx.workspaceId)
```

It is called by `/api/market/download` and by nothing else. There is no second code path, no "if the listing is free, skip the check", and no client-side equivalent.

### 5.2 Grant rules

| Purchase                | Scope       | Owner      | Survives                                                      |
| ----------------------- | ----------- | ---------- | ------------------------------------------------------------- |
| Personal (free or paid) | `user`      | the buyer  | leaving a school, joining another, closing the school         |
| School-funded           | `workspace` | the school | the requester leaving, being removed, or the seller unlisting |

A workspace entitlement is usable by every **active** member; a removed member loses access the moment `workspace_members.status` leaves `active`, because the download check re-reads membership every time.

### 5.3 Price at request vs price at approval

`price_paisa_at_request` is a snapshot for display. The **order always uses the current `listings.price_paisa`**, read inside the order transaction. If `current > at_request`, the approval screen shows _"Price increased from ৳200 to ৳250 since this was requested"_ and requires an explicit confirm. If `current < at_request`, it just charges less. If the listing is no longer `published`, the request is auto-`declined` with reason `listing_unavailable`.

### 5.4 Duplicate-purchase prevention

Before creating an order, `createOrder` checks for a live entitlement in the target scope:

- Personal buy with a live personal entitlement → `ALREADY_ENTITLED`, UI shows Download.
- School buy with a live workspace entitlement → `ALREADY_ENTITLED`, UI shows _"Your school already owns this"_.
- Personal buy while the **school** owns it → **allowed**, with a warning sheet: _"Your school already owns this. Buying personally means you keep it if you leave."_ This is a real choice, not an error.
- The unique partial indexes on `entitlements` are the backstop if two orders race.

### 5.5 Refund → revocation (the buyer side of F-CM-01 §4.3)

On a settled refund for a marketplace line:

```
entitlements.revoked_at    = now()
entitlements.revoked_reason = 'refund:' || refund.id
listing_reviews.status      = 'withdrawn'  (for that order_line)
listings.purchase_count    -= 1            (trigger, floored at 0)
seller_profiles.total_sales-= 1
```

Already-downloaded files cannot be recalled — the `download_log` and watermark are the deterrent, and this is stated in the refund policy shown to staff before they refund.

### 5.6 PDF watermarking (server-side, per download)

Applied with `pdf-lib` in the download route:

- **Footer band** on every page, 8 pt, 60 % grey: `Licensed to {buyer_display_name} · {buyer_email_masked} · {workspace_name or "Personal"} · {order_no} · {yyyy-mm-dd}`.
- **Diagonal tile** across each page at 6 % opacity: `{order_no}` repeated — low enough to read through, high enough to survive a phone photo.
- **Invisible marker:** `watermark_token` (a uuid) written into the PDF's `Keywords` metadata **and** as a 1×1 white-on-white text run at a page-specific offset. `download_log.watermark_token` maps it back to a person. Two markers because metadata is trivially stripped and a stripped copy is itself a signal.
- `buyer_email_masked` = `rah****@gmail.com` — enough to identify with the log, not enough to harvest.
- Encrypted or password-protected source PDFs are rejected at listing submission (F-CM-03), so watermarking never has to handle them.
- Budget: p95 < 3 s for a 30-page PDF. Beyond 200 pages, watermark only the first 5 and the last page (a full-document pass on a 500-page book is not worth the latency) — the token still goes in the metadata.

### 5.7 Search ranking

```
rank = 0.55 * ts_rank_cd(search_tsv, websearch_to_tsquery('simple', q))
     + 0.20 * least(purchase_count, 50) / 50
     + 0.15 * coalesce(rating_avg_bp,0) / 10000 * least(rating_count,20)/20
     + 0.10 * recency_decay(published_at, halflife := 180 days)
```

With no `q`, the default sort is `relevance → newest`. Explicit sorts: `newest`, `price_asc`, `price_desc`, `rating`, `most_purchased`. `price_asc` puts free items first, which is what a teacher on a Free plan actually wants.

Fuzzy fallback: if `ts_rank` returns fewer than 5 rows, re-query with `title % q` (pg_trgm, similarity ≥ 0.3) and label the block _"Similar results"_.

### 5.8 Facet definitions

- **Price bands** (fixed, matching the prototype's, which were sensible): `Free`, `Under ৳100`, `৳100–500`, `৳500+`. Bands are `price_paisa` ranges in SQL, never computed client-side.
- **Rating**: `4★ and up`, `3★ and up`. Listings with `rating_count = 0` are excluded from rating facets but not from unfiltered browse.
- **Grade** is multi-select against the `grade_level_ids` array (GIN `&&`).
- Facet counts are computed against the _other_ active filters (standard faceted-search semantics), which is one `GROUP BY` per group over the same filtered CTE.

### 5.9 Review eligibility and rating maths

- Eligible = a non-revoked entitlement **and** an `order_line_id` with no existing review.
- **Scale, defined once and only once:** `rating_avg_bp = round(1000 * avg(rating))` over `status='visible'` rows — the average star rating scaled by 1000, so the range is `1000`–`5000` and `4650` means 4.65★. Display is `(rating_avg_bp / 1000).toFixed(1)`. The name keeps the `_bp` suffix for consistency with the other integer-scaled columns, but the scale is **1000, not 10000**, and that is stated in a column comment, in `packages/domain/market/rating.ts` as a single exported constant `RATING_SCALE = 1000`, and in a test that asserts the round-trip. A scale ambiguity here is exactly the class of bug that gave the prototype two commission units on one column.
- A listing shows a star rating only at `rating_count >= 3`; below that it shows _"New"_ — prevents a single 5★ from a friend defining a product.

### 5.10 Rate limits and abuse

- Download: §4.4 step 4.
- Review: 1 per order line (structural) + 10 reviews/day/user.
- View counting: deduped per `(listing, session, day)`; a session hash is `hmac(session_id, daily_salt)` so the table is not a tracking database.
- Saved listings: 500 per user.

---

## 6. UI

| Route                             | Who         | 360×800                                                                              | ≥1024                                            | Primary action              | Empty                                    | Loading          | Error                            |
| --------------------------------- | ----------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------- | ---------------------------------------- | ---------------- | -------------------------------- |
| `/market`                         | anyone      | Sticky search, filter chips row, **Filters** sheet, 1-col card list, infinite scroll | Left facet sidebar + 3-col grid + _Load more_    | Open listing                | _"Nothing matches"_ + relax-filter chips | 8 skeleton cards | Keep last results + retry banner |
| `/market/listings/[slug]`         | anyone      | Single column, preview carousel, sticky buy bar                                      | Two-column: media left, buy panel right (sticky) | Buy / Download / Ask school | n/a                                      | Skeleton hero    | Alert, previews degrade to cover |
| `/market/library`                 | signed-in   | Segmented control _Yours / School_, card list                                        | Table with download column                       | Download                    | _"Nothing here yet"_ + Browse            | Skeleton         | Retry                            |
| `/market/sellers/[handle]`        | anyone      | see F-CM-02 §6                                                                       |                                                  |                             |                                          |                  |                                  |
| `/app/billing/marketplace`        | admin/owner | Request cards with Approve & pay, spend summary at top                               | Table + right rail spend                         | Approve & pay               | _"No requests"_                          | Skeleton         | Retry                            |
| `/market/listings/[slug]/reviews` | anyone      | Full review list, filter by star                                                     | Same, two columns                                | Write a review              | _"No reviews yet"_                       | Skeleton         | Retry                            |

Components: `AppShell`, `DataList`, `FilterSheet`, `FacetGroup`, `ListingCard`, `PreviewCarousel`, `StickyBuyBar`, `MoneyText`, `VerifiedBadge`, `StarRating`, `ReviewCard`, `ConfirmSheet`, `EmptyState`, `Skeleton`.

**Phone specifics.** The buy bar is `position: sticky; bottom: 0` with safe-area inset padding, above the bottom nav, 56 px, full-bleed. Preview images use `content-visibility: auto` and are lazy-loaded below the first. The filter sheet's _Show N results_ button updates via a debounced count query so the number is never stale by more than ~300 ms. Star inputs are 44 px each with a visible numeric label for screen readers.

---

## 7. Server contracts

| Name                            | Kind                                        | Input                                                                                                  | Output                                                         | Errors                                                                                | Idempotency            | Rate limit                       |
| ------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------- | -------------------------------- |
| `searchListings`                | RSC query / `GET /api/market/search`        | `{q?, type?, subjectId?, gradeIds?, curriculumId?, lang?, priceBand?, minRating?, sort?, cursor?}`     | `{items[], nextCursor, facets}`                                | `INVALID_CURSOR`                                                                      | n/a                    | 120/min/ip                       |
| `getListing`                    | RSC query                                   | `{slug}`                                                                                               | listing + previews + seller + reviews page + entitlement state | `NOT_FOUND`                                                                           | n/a                    | cached 60 s                      |
| `recordListingView`             | route `POST /api/market/listings/[id]/view` | —                                                                                                      | `204`                                                          | —                                                                                     | per session/day        | 60/min/ip                        |
| `requestSchoolPurchase`         | action                                      | `{listingId, justification?, idempotencyKey}`                                                          | `{approvalId}`                                                 | `DUPLICATE_REQUEST`, `ALREADY_ENTITLED`, `NOT_A_SCHOOL_WORKSPACE`, `FORBIDDEN`        | key                    | 20/day/user                      |
| `decidePurchaseRequest`         | action                                      | `{approvalId, decision:'approve'\|'decline', declineReason?, acknowledgePriceChange?, idempotencyKey}` | `{status, orderId?}`                                           | `PRICE_CHANGED_UNACKNOWLEDGED`, `LISTING_UNAVAILABLE`, `ALREADY_DECIDED`, `FORBIDDEN` | key                    | 100/day/admin                    |
| `cancelPurchaseRequest`         | action                                      | `{approvalId}`                                                                                         | `{status}`                                                     | `FORBIDDEN`                                                                           | key                    | 20/day/user                      |
| `requestDownload`               | route `POST /api/market/download`           | `{listingId}`                                                                                          | `{url, expiresAt, filename}`                                   | `NOT_ENTITLED`, `RATE_LIMITED`, `FILE_UNAVAILABLE`                                    | n/a (logged each time) | 20/day/entitlement, 100/day/user |
| `writeReview`                   | action                                      | `{orderLineId, rating, body?, idempotencyKey}`                                                         | `{reviewId}`                                                   | `NOT_ENTITLED`, `ALREADY_REVIEWED`, `VALIDATION`                                      | key                    | 10/day/user                      |
| `editReview` / `withdrawReview` | actions                                     | `{reviewId, …}`                                                                                        | `{ok}`                                                         | `EDIT_WINDOW_CLOSED`, `FORBIDDEN`                                                     | key                    | 20/day/user                      |
| `replyToReview`                 | action                                      | `{reviewId, body}`                                                                                     | `{ok}`                                                         | `NOT_SELLER`, `ALREADY_REPLIED`                                                       | key                    | 50/day/seller                    |
| `hideReview`                    | action                                      | `{reviewId, reason}`                                                                                   | `{ok}`                                                         | `FORBIDDEN`                                                                           | key                    | 50/day/staff                     |
| `toggleSaveListing`             | action                                      | `{listingId}`                                                                                          | `{saved}`                                                      | `LIMIT_REACHED`                                                                       | key                    | 100/day/user                     |

`createOrder` and `startCheckout` are F-CM-01's; this feature only supplies `items` and `funding`.

---

## 8. Parts (build chunks)

**Part 1 — Browse, search, facets, cursor pagination** _(2 days)_
Scope: `searchListings` with keyset pagination, facet counting CTE, ranking function, `pg_trgm` fallback, `/market` page with the filter sheet and chip row, `ListingCard`.
Files: `packages/db/repositories/listings.ts`, `packages/domain/market/ranking.ts`, `apps/web/app/(market)/market/page.tsx`, `packages/ui/FilterSheet.tsx`.
Tests: keyset stability across pages with concurrent inserts; facet counts respect other filters; ranking unit tests; no `OFFSET` anywhere (grep test).
**Demo:** 5,000 seeded listings filtered to 12 results on a 360 px phone in under 400 ms, with no client-side array filtering in the bundle.

**Part 2 — Listing detail + previews + view counting** _(1.5 days)_
Scope: `/market/listings/[slug]`, preview carousel, seller block, related listings as real links, `recordListingView` + `listing_views` + nightly rollup, OG/metadata for sharing.
Tests: anonymous render; view dedupe per session/day; related links navigate (regression test for the prototype's `location.reload()`).
**Demo:** share a listing link into WhatsApp and see a correct preview card.

**Part 3 — `entitlements` schema, RLS, fulfilment handler** _(2 days)_
Scope: `entitlements` migration with both unique partial indexes, the marketplace fulfilment handler registered with F-CM-01's dispatcher, personal purchase pre-checks, `ALREADY_ENTITLED` handling, purchase/sales counter triggers.
Tests: pgTAP — no role can insert or update `entitlements`; a user sees only their own; a workspace member sees the school's; two concurrent captures produce one row.
**Demo:** a sandbox purchase ends with exactly one entitlement and a Download button.

**Part 4 — Download route with entitlement check, signing and logging** _(1.5 days)_
Scope: `/api/market/download`, entitlement resolution, service-role file lookup, signed URL, `download_log`, rate limits, `seller_download_stats_v`.
Tests: non-entitled user 403; revoked entitlement 403; removed workspace member 403; expired URL 403; rate limit 429; seller cannot see who downloaded.
**Demo:** attempt every unauthorised download path and get 403 with nothing leaked.

**Part 5 — PDF watermarking** _(1.5 days)_
Scope: `pdf-lib` pipeline, footer band, diagonal tile, dual marker tokens, large-document strategy, non-PDF honest fallback, temp object cleanup job.
Tests: extracted text contains the buyer identity; `watermark_token` round-trips from the PDF metadata to `download_log`; p95 latency budget; failure falls back rather than denying.
**Demo:** two buyers download the same listing and the PDFs differ identifiably.

**Part 6 — School-funded purchase: request → approve & pay** _(2 days)_
Scope: `purchase_approvals` + RLS + price trigger, request sheet, `/app/billing/marketplace` queue, approve-and-pay handing off to `createOrder(funding:'workspace')`, decline, cancel, 14-day expiry job, price-change confirm, notifications.
Tests: client-supplied price ignored; duplicate pending request blocked; price-increase requires acknowledgement; expiry job; workspace entitlement usable by another member and not by a removed one.
**Demo:** teacher requests on a phone, admin approves and pays, teacher downloads — three accounts, one chain.

**Part 7 — Library + resources integration** _(1 day)_
Scope: `/market/library` with the Yours/School segmentation, review prompts, and the read-only marketplace entries in the school Resources library referencing the entitlement (not a copied URL).
Tests: a school entitlement shows for every active member; a personal one does not leak into the school group.
**Demo:** the same item visible correctly to a teacher and to their admin, from different angles.

**Part 8 — Reviews, replies, rating rollups, moderation** _(2 days)_
Scope: `listing_reviews` + RLS with the entitlement `exists` check, write/edit/withdraw, seller reply, rating triggers on both listing and seller, `rating_count >= 3` display rule, staff hide, auto-withdraw on refund, reviews page.
Tests: a non-buyer's direct PostgREST insert is denied by policy; one review per line; averages recompute on every mutation (the prototype's #43 replayed as a passing test); refund withdraws the review.
**Demo:** three buyers rate a listing, the card shows 4.3★ (3), and a refund drops it to 4.0★ (2).

---

## 9. Acceptance criteria

1. **Given** 5,000 published listings **when** a buyer filters to _Free + Class 8 + NCTB_ on a phone **then** results, facet counts and pagination are all computed on the server, the first page has ≤ 24 items, and the JS bundle contains no full-catalogue array.
2. **Given** an anonymous visitor **when** they open a listing page **then** it renders fully with previews, rating and seller, and the buy bar says _Sign in to buy_.
3. **Given** any user, entitled or not **when** they query `listing_files` or inspect the listing page's network traffic **then** no URL to the private bucket is present.
4. **Given** a buyer with no entitlement **when** they call `/api/market/download` directly **then** they get `403 NOT_ENTITLED` and no signed URL is generated.
5. **Given** a completed personal purchase **when** the buyer downloads **then** exactly one `download_log` row is written with a `watermark_token`, and the PDF's footer names the buyer and the order number.
6. **Given** two different buyers of the same listing **when** each downloads **then** the two PDFs carry different tokens, and each token resolves to the right person in `download_log`.
7. **Given** a buyer who already owns a listing **when** they tap Buy again **then** `createOrder` returns `ALREADY_ENTITLED` and the UI shows Download.
8. **Given** a teacher in a school workspace **when** they tap _Ask school to buy_ **then** a `pending` approval exists, the price snapshot was written by the trigger and not by the client, and the school admins are notified.
9. **Given** a pending request whose listing price rose **when** the admin taps _Approve & pay_ without acknowledging **then** it fails with `PRICE_CHANGED_UNACKNOWLEDGED`; after acknowledging, the order is created at the **current** price.
10. **Given** a school-funded purchase is paid **when** any other active member of that school opens the listing **then** they see Download; **and when** the requesting teacher is removed from the school **then** she can no longer download it, while the school still can.
11. **Given** a personal purchase **when** the buyer leaves the school **then** they keep the download.
12. **Given** a pending request older than 14 days **when** the daily job runs **then** it is `expired` and the requester is notified.
13. **Given** a non-buyer **when** they attempt to insert a `listing_reviews` row via PostgREST with a forged `order_line_id` **then** RLS denies it.
14. **Given** three visible reviews of 5, 4, 4 **when** the card renders **then** it shows `4.3 (3)`; **and given** only two reviews **then** it shows _New_ instead of a rating.
15. **Given** a refund settles **when** the handler runs **then** the entitlement is revoked, the download 403s, the review is withdrawn, and `purchase_count` decreases by one.
16. **Given** a seller **when** they open their listing stats **then** they see download counts per day and never a buyer's name, email, or IP.
17. **Given** 21 download requests for one entitlement in a day **when** the 21st is made **then** it returns `429` with a readable message and is logged.
18. **Given** the marketplace at 360×800 **when** browsing, filtering, viewing and buying **then** every primary action is thumb-reachable, no horizontal scroll occurs, and axe reports zero serious violations.

---

## 10. Tests

- **Unit (domain):** ranking function; price-band predicates; rating scale (the 1000× constant) and the `>=3` display rule; entitlement resolution truth table (8 combinations of scope × membership × revoked); watermark text composition and email masking.
- **DB (pgTAP):** `entitlements` insert/update denied for every role; scope visibility matrix; the two unique partial indexes under concurrency; `listing_reviews` insert policy with a forged order line; `purchase_approvals` price trigger overwrites a client value; `download_log` immutability; `seller_download_stats_v` column set frozen.
- **Integration:** fulfilment handler idempotency under a double capture; refund cascade (revoke → withdraw review → decrement counters); school-funded end-to-end with three roles; download rate limiting.
- **e2e (360×800 and 1280×800):** search → filter → detail → buy (sandbox) → download → review; school-funded request/approve/download across three logged-in contexts; anonymous browse; axe everywhere.
- **Security:** the full "paid file is free" replay from the prototype, asserted to fail at four layers (no public URL, RLS on `listing_files`, entitlement check, signed-URL expiry); IDOR on `entitlements`, `purchase_approvals`, `download_log`, `listing_reviews` by id enumeration; review-forgery attempt.
- **Performance:** search p95 < 400 ms at 50k listings; listing detail TTFB < 300 ms cached; download route p95 < 3 s including watermarking for a 30-page PDF; library list p95 < 400 ms.

---

## 11. Open questions

1. **Bundles / multi-item cart.** v1 is cart-less buy-now per PRODUCT-DECISIONS. _Default assumed:_ `orders` already supports multiple lines, so a cart is additive later with no migration.
2. **Non-PDF watermarking.** DOCX/PPTX watermarking is feasible but fragile. _Default assumed:_ not in v1; the UI says so plainly and the download log remains the trace.
3. **Preview-to-purchase attribution.** _Default assumed:_ no attribution analytics in v1 beyond `view_count` and `purchase_count`; conversion is their ratio, honestly computed (unlike the prototype's permanent 0.0 %).
4. **Should a school admin see which member downloaded a school-owned file?** _Default assumed:_ yes — `download_log` select for `owner|admin` on their workspace rows includes `user_id`. Sellers never see it.
5. **Free listings and entitlement spam.** A user could "buy" thousands of free listings. _Default assumed:_ 50 free acquisitions per user per day, then a soft block.
6. **Review incentives / verified-purchase label.** Every review is a verified purchase by construction, so the label is implicit. _Default assumed:_ show _"Verified purchase"_ anyway, because buyers expect it.
