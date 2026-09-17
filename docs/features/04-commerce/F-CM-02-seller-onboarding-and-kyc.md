# F-CM-02 — Seller onboarding, KYC and payout methods

|                  |                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Area             | market                                                                                                                |
| Status           | planned                                                                                                               |
| Owner branch     | `feat/commerce-seller-onboarding`                                                                                     |
| Depends on       | F-AU-01 (auth/profiles), F-AU-02 (workspaces), F-OP-0x (files + signed URLs), F-CM-01 (platform console shell)        |
| Plan             | `docs/plan/ROADMAP.md` chunk — commerce, second                                                                       |
| Base44 reference | `docs/reference/base44-inventory/04-commerce-billing.md` §4 (both flows), §7-A4, §7-A5, §7-A6, §7-B17, §7-C20, §7-E47 |

> **Schema note.** Tables and columns are **proposed; `docs/architecture/DATA-MODEL.md` wins**.

---

## 1. Purpose

Turn any verified Acadigma user into a seller: one application form, one identity check reviewed by platform staff inside a 2-business-day SLA, one encrypted payout destination, one public storefront. Selling is a **per-user capability**, not a workspace and not a role (PRODUCT-DECISIONS 1.8) — a teacher in a school, a private tutor with only a personal workspace, and a standalone publisher all use the same path.

**What Base44 had:** two divergent wizards (`VerificationWall.jsx` and `BecomeSellerModal.jsx`) writing the same `IdentityVerification` entity with **three different published SLAs** (1–2 business days, 24–48 hours, and a toast). `IdentityVerification` had **no RLS at all**, so any authenticated user could list every other user's NID scan and selfie — the single worst data exposure in the export, sitting under UI copy that promised the files were _"encrypted and reviewed only by Acadigma staff"_. Resubmission always `create`d, producing duplicates against a documented-unique key. **No reviewer UI existed anywhere**, so `status` was permanently `pending` and nobody could ever be verified. Payout details (bank triple or bKash/Nagad number) were collected in step 3 and silently thrown away — there was no column to hold them. `SellerPublicProfile` was read by the buyer UI and written by nothing, so every listing showed _"Unknown Seller"_ and the verified badge could never appear. The gate it all protected — _"you cannot publish until verified"_ — was not enforced: `/seller/listings` had no guard at all.

**Done looks like:** a teacher taps _Start selling_ in the profile menu, completes a three-step sheet on her phone in under four minutes, uploads her NID photo with the camera, gets a _"We'll review within 2 business days"_ screen that matches the badge shown to the reviewer, and two days later has a **Verified seller** badge on a storefront at `/market/sellers/<handle>` — and at no point could any other user, or any school admin, read her NID.

---

## 2. Roles and permissions

| Action                                 | Permission key                   | self                                        | school admin/owner | platform staff |
| -------------------------------------- | -------------------------------- | ------------------------------------------- | ------------------ | -------------- |
| Start / edit own seller application    | `seller.profile.write.own`       | ✔                                           | —                  | —              |
| Read own seller profile and KYC status | `seller.profile.read.own`        | ✔                                           | —                  | ✔              |
| Read another user's **KYC documents**  | `seller.kyc.read`                | —                                           | —                  | ✔              |
| Approve / request changes / reject KYC | `seller.kyc.review`              | —                                           | —                  | ✔              |
| Add / replace own payout method        | `seller.payout_method.write.own` | ✔                                           | —                  | —              |
| Read **full** payout account details   | `seller.payout_method.read.full` | ✔ (own, masked by default; full on re-auth) | —                  | ✔              |
| Suspend a seller                       | `seller.suspend`                 | —                                           | —                  | ✔              |
| View a public storefront               | —                                | anyone, incl. signed-out                    |                    |                |

School admins have **no** role here at all. A school never sees, approves, or is notified about a member's selling activity. That is a deliberate reversal of the prototype's assumption that selling belonged to the school workspace.

---

## 3. Data

Tenant key: seller data is **user-scoped, not workspace-scoped** — `seller_profiles.user_id` is the key and there is no `workspace_id`. This is the one documented exception to PRODUCT-DECISIONS 1.6, because a seller identity spans workspaces by design (1.8). RLS is written against `app.current_user_id()` and `app.is_platform_admin()` instead of `app.has_role(...)`, and the pgTAP template used is the _user-scoped_ one.

### 3.1 `seller_profiles` _(new; proposed)_

| column                                     | type                                        | notes                                                                                                                   |
| ------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`                                       | uuid pk                                     |
| `user_id`                                  | uuid **unique** not null → profiles         | 1:1 with the user                                                                                                       |
| `handle`                                   | citext unique not null                      | storefront slug, 3–30 chars `[a-z0-9-]`, reserved-word list                                                             |
| `display_name`                             | text not null                               | 2–60 chars                                                                                                              |
| `seller_type`                              | `seller_type` not null                      | `individual \| institution`                                                                                             |
| `bio`                                      | text null                                   | ≤ 500 chars, plain text (no HTML ever rendered)                                                                         |
| `avatar_file_id`                           | uuid null → files                           | `visibility='public'` (storefront avatar)                                                                               |
| `subjects`                                 | text[] not null default `'{}'`              | from the shared subject taxonomy (F-CM-03)                                                                              |
| `website_url`                              | text null                                   | validated http(s), `rel="nofollow noopener"` when rendered                                                              |
| `status`                                   | `seller_status` not null default `draft`    | §5.1                                                                                                                    |
| `kyc_status`                               | `kyc_status` not null default `not_started` | §5.1                                                                                                                    |
| `verified_at`                              | timestamptz null                            | set on KYC approval; drives the badge                                                                                   |
| `suspended_at` / `suspended_reason`        | timestamptz / text null                     |                                                                                                                         |
| `total_listings` / `total_sales`           | int not null default 0                      | maintained by trigger, never by the client                                                                              |
| `rating_avg_bp`                            | int null                                    | average star rating × 1000 (`4650` = 4.65★) — scale defined once in F-CM-04 §5.9; recomputed by trigger on review write |
| `rating_count`                             | int not null default 0                      |                                                                                                                         |
| `applied_at` / `created_at` / `updated_at` |                                             |                                                                                                                         |

Indexes: unique `(user_id)`, unique `lower(handle)`, `(kyc_status) where kyc_status='submitted'` (review queue), `(status) where status='active'`.

### 3.2 `seller_kyc_submissions` _(new; proposed)_

One row per **submission attempt**. Resubmission inserts a new row — it never updates an old one, so the review history is intact (fixing prototype bug §7-E47 from the other direction: duplicates become _versions_, with a unique partial index guaranteeing one open submission).

| column                               | type                                      | notes                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                 | uuid pk                                   |
| `seller_profile_id`                  | uuid not null → seller_profiles           |
| `user_id`                            | uuid not null → profiles                  | denormalised for RLS                                                                                                                                                                                                                              |
| `attempt_no`                         | int not null                              | 1, 2, 3…                                                                                                                                                                                                                                          |
| `legal_name`                         | text not null                             | as printed on the document                                                                                                                                                                                                                        |
| `document_type`                      | `kyc_document_type` not null              | `nid \| passport \| driving_licence \| birth_certificate`                                                                                                                                                                                         |
| `document_number_last4`              | text null                                 | last 4 digits only; **the full number is never stored**                                                                                                                                                                                           |
| `document_front_file_id`             | uuid not null → files                     | private                                                                                                                                                                                                                                           |
| `document_back_file_id`              | uuid null → files                         | private; required for `nid`                                                                                                                                                                                                                       |
| `selfie_file_id`                     | uuid not null → files                     | private                                                                                                                                                                                                                                           |
| `date_of_birth`                      | date null                                 |                                                                                                                                                                                                                                                   |
| `address_line` / `city` / `postcode` | text null                                 |                                                                                                                                                                                                                                                   |
| `status`                             | `kyc_status` not null default `submitted` | `submitted \| in_review \| approved \| changes_requested \| rejected`                                                                                                                                                                             |
| `sla_due_at`                         | timestamptz not null                      | §5.3                                                                                                                                                                                                                                              |
| `reviewer_id`                        | uuid null → profiles                      | platform staff                                                                                                                                                                                                                                    |
| `reviewed_at`                        | timestamptz null                          |                                                                                                                                                                                                                                                   |
| `decision_reason_code`               | `kyc_reason` null                         | `illegible \| name_mismatch \| expired_document \| selfie_mismatch \| suspected_fraud \| incomplete \| other` — a `suspected_fraud` rejection gets the written appeal route in §4.2 and is **never surfaced to a school** under any policy (§3.6) |
| `decision_note`                      | text null                                 | shown to the seller for `changes_requested`/`rejected`; required, ≥ 10 chars                                                                                                                                                                      |
| `internal_note`                      | text null                                 | **never shown to the seller**                                                                                                                                                                                                                     |
| `created_at` / `updated_at`          |                                           |                                                                                                                                                                                                                                                   |

Indexes: `(seller_profile_id, attempt_no desc)`, unique partial `(seller_profile_id) where status in ('submitted','in_review')` — at most one open submission per seller, `(status, sla_due_at)` for the queue sorted by urgency.

### 3.3 `seller_payout_methods` _(new; proposed — PRODUCT-DECISIONS 1.9)_

| column                                         | type                            | notes                                                     |
| ---------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| `id`                                           | uuid pk                         |
| `seller_profile_id`                            | uuid not null → seller_profiles |
| `user_id`                                      | uuid not null                   | for RLS                                                   |
| `method_type`                                  | `payout_method_type` not null   | `bank \| bkash \| nagad`                                  |
| `label`                                        | text null                       | seller's own name for it                                  |
| `account_name`                                 | text not null                   |                                                           |
| `account_ref_encrypted`                        | bytea not null                  | **pgsodium**: account number / wallet number, encrypted   |
| `account_ref_last4`                            | text not null                   | for display; the only part ever rendered                  |
| `bank_name` / `branch_name` / `routing_number` | text null                       | bank only; `routing_number` is not secret in BD           |
| `is_default`                                   | boolean not null default false  | partial unique index: one default per seller              |
| `verified`                                     | boolean not null default false  | set by platform staff after the first successful transfer |
| `created_at` / `updated_at`                    |                                 |                                                           |

**Encryption.** `account_ref_encrypted` uses `pgsodium` transparent column encryption with a key in the Supabase vault, keyed by `pgsodium.crypto_aead_det_encrypt` with `id` as associated data. A `SECURITY DEFINER` function `app.reveal_payout_ref(payout_method_id)` is the only way to decrypt; it (a) requires `app.is_platform_admin()` **or** `user_id = app.current_user_id()`, (b) requires the caller's session to have been re-authenticated within 10 minutes (`auth.jwt() ->> 'aal'` / a `sensitive_reauth_at` claim on the session record), and (c) writes an `audit_events` row `payout_method.revealed` **before** returning. No view, no repository, and no API ever selects the raw column — a CI grep test asserts `account_ref_encrypted` appears in exactly two files (the migration and the reveal function).

Bangladeshi format validation (client and server, `packages/domain/payout.ts`): bKash/Nagad `^01[3-9]\d{8}$` (11 digits); bank account 6–20 digits; routing number exactly 9 digits.

### 3.4 `kyc_review_events` _(new; proposed)_

Append-only audit of the review itself: `id`, `submission_id`, `actor_id`, `from_status`, `to_status`, `reason_code`, `note`, `created_at`. No update or delete grants for any role. (`audit_events` also receives these, but this table makes the queue's per-case timeline cheap to render.)

### 3.5 Files

All KYC images go to the **private** bucket at `kyc/<user_id>/<submission_id>/<kind>.<ext>`, registered in `files` with `visibility='private'` and `purpose='kyc'`. Rules:

- Accepted: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Max 8 MB each. Magic-byte sniffed server-side; the extension is never trusted.
- EXIF is stripped on upload (location data on a selfie is not ours to keep).
- Signed URLs are **2 minutes** here, not the usual 5, and are issued only by `/api/files/[id]` after `app.is_platform_admin()` or ownership. Every issue writes `file_access_log`.
- **Retention:** approved submissions' images are deleted **180 days** after approval (the decision and the last-4 remain); rejected submissions' images are deleted 90 days after the decision. A pg_cron job does it and writes an audit row. This is the concrete answer to the prototype's "stored securely" copy.

### 3.6 RLS policies — in words

**`seller_profiles`**

- _select_: (a) anyone, including anonymous, may read rows where `status='active' AND kyc_status='approved'` — **but only through the view `seller_public_v`**, which exposes `handle, display_name, seller_type, bio, avatar_file_id, subjects, website_url, verified_at, total_listings, total_sales, rating_avg_bp, rating_count` and nothing else. The base table's public policy is limited to those columns via the view with `security_invoker=off`. (b) `user_id = app.current_user_id()` sees their own row in full. (c) platform staff see all rows in full.
- _insert_: only `user_id = app.current_user_id()`, and only with `status='draft'`, `kyc_status='not_started'`, `verified_at is null`, `total_* = 0`. A user cannot self-verify at insert time.
- _update_: `user_id = app.current_user_id()` may change `display_name`, `bio`, `avatar_file_id`, `subjects`, `website_url`, `handle` (once per 30 days). A trigger rejects any change to `status`, `kyc_status`, `verified_at`, `suspended_at`, `total_*`, `rating_*` from a non-platform caller — those columns are written by the review server action or by triggers only. Platform staff may update `status`, `suspended_at`, `suspended_reason`.
- _delete_: denied to everyone. A seller who quits is `status='closed'`.

**`seller_kyc_submissions`**

- _select_: the owning `user_id` sees their own rows **excluding** `internal_note` (enforced by a column-level grant revoke plus the repository's explicit column list); platform staff see everything. **No other role, in any workspace, at any time, can select a single row** — there is no school-admin policy, no membership-based policy, nothing. This applies with no exception to a `suspected_fraud` rejection: a school never learns why, or that fraud was suspected, about one of its teachers.
- _insert_: `user_id = app.current_user_id()`, only when the seller profile has no open submission (the partial unique index enforces it) and `status='submitted'`.
- _update_: platform staff only, and only the decision columns. The seller cannot edit a submitted row; they submit a new attempt instead.
- _delete_: denied to all.

**`seller_payout_methods`**

- _select_: owner (`user_id = app.current_user_id()`) and platform staff. The `account_ref_encrypted` column is **revoked from every role**; only `app.reveal_payout_ref()` can read it.
- _insert/update_: owner only, `user_id` forced to `app.current_user_id()` by a `with check`. `verified` is trigger-protected (platform staff only).
- _delete_: owner, but blocked by a trigger if the method is referenced by a payout run that is not `paid` (F-CM-05).

**`kyc_review_events`**: _select_ platform staff, plus the owning seller for the subset where `to_status` is a seller-visible decision. _insert_ platform staff. _update/delete_ denied to all.

---

## 4. Workflows

### 4.1 Become a seller (phone-first, 3 steps)

**Trigger:** profile menu → _Start selling_, or the `/sell` route when no profile exists, or a marketplace CTA.

**Step 0 — eligibility check** (server): the user's email must be verified and the account ≥ 24 h old. Failing either shows an explanatory screen rather than the form.

**Step 1 — Your storefront.** Display name, handle (with live availability check, debounced 400 ms), seller type, subjects (multi-select chips), optional bio and website. Saves a `seller_profiles` row with `status='draft'` on _Continue_ — so a drop-off is recoverable.

**Step 2 — Identity.** Legal name, document type, date of birth, address. Then three upload tiles: document front, document back (only for NID), selfie. On a phone each tile opens the **camera** by default (`capture="environment"` for the document, `"user"` for the selfie) with _Choose from files_ as the secondary option. Each upload shows a thumbnail, its size, and a **Replace** action. Client-side: HEIC→JPEG conversion, downscale to max 2000 px, EXIF strip before upload. The copy under the tiles states exactly: _"Only Acadigma platform staff can open these files. They are deleted 180 days after your verification is approved."_

**Step 3 — Getting paid.** Method type as three large radio cards (Bank / bKash / Nagad). Bank shows account name, account number, bank, branch, routing; bKash/Nagad show account name and an 11-digit number with an inline format hint. A confirmation field requires the number to be typed twice (no paste on the second field). Below: _"This is where your earnings are sent. Payouts run monthly on the 1st, minimum ৳1,000, after a 7-day hold."_

**Submit** → one server action `submitSellerApplication` in one transaction: profile `status='pending_review'`, `kyc_status='submitted'`, insert `seller_kyc_submissions` (attempt = max+1, `sla_due_at` per §5.3), insert `seller_payout_methods` (default), enqueue an email to the seller, notify the platform queue, audit `seller.applied` + `kyc.submitted`.

**Outcome screen:** _"Under review — we'll decide within 2 business days"_ with the exact `sla_due_at` date rendered in Asia/Dhaka, a summary of what was sent, and a _Contact support_ link. The same date is what the reviewer sees.

**Failure cases:** upload fails (retry per tile, the rest of the form is preserved); handle taken (inline, before submit); duplicate open submission (button disabled with _"You already have a review in progress"_); unsupported file type (rejected client-side by magic-byte read **and** server-side).

**Phone specifics.** Each step is a full-screen route (`/sell/apply/[step]`), not a sheet — sheets lose state on an OS camera round-trip. A 3-dot progress indicator sits under the top bar. The primary button is a sticky bottom bar. Fields are `inputmode="numeric"` where numeric. Nothing requires horizontal scroll at 360 px.

### 4.2 Platform staff review

**Trigger:** `/platform/sellers` — default tab **Needs review**, sorted by `sla_due_at` ascending, with an **Overdue** count chip in red.

1. Reviewer opens a case. Left (or top, on phone): the submission — legal name, document type, DOB, address, and the three images rendered inline through short-lived signed URLs with a pinch-zoom viewer. Right: the storefront data, the account (email, joined date, workspaces they belong to, prior attempts).
2. Opening the case sets `status='in_review'` and `reviewer_id` (a soft claim; another reviewer sees _"Being reviewed by X"_ but is not blocked).
3. Three decisions, each in a confirm sheet:
   - **Approve** → submission `approved`; profile `kyc_status='approved'`, `status='active'`, `verified_at=now()`. Seller emailed + notified `seller.verified`. Badge appears everywhere immediately.
   - **Request changes** → submission `changes_requested` with a reason code and a note the seller **will** read. Profile `kyc_status='changes_requested'`, `status` stays `pending_review`. The seller's `/sell` page shows the note and a _Resubmit_ button that opens step 2 **prefilled** with everything except the files (which must be re-uploaded) — the prototype's dead "Resubmit" button, made real.
   - **Reject** → submission `rejected`, profile `kyc_status='rejected'`, `status='rejected'`. Seller may appeal by contacting support; a new attempt is allowed after 7 days. **When `decision_reason_code='suspected_fraud'` (later M6):** the standard 7-day resubmit path is supplemented with a **written appeal route** — the seller submits a written explanation to a dedicated platform-staff review queue (distinct from a fresh KYC attempt, since a fraud flag should not simply be resubmitted around), reviewed by a **different** staff member than the original decision where team size allows. The reason code and the fact of a fraud-flagged rejection are **never surfaced to any school** — not through `seller_public_v`, not through any workspace-scoped query, not through support tooling — only the generic "not currently available" state is visible outside platform staff.
4. Every decision writes `kyc_review_events` + `audit_events` and is irreversible except by a new attempt.
5. Payout method verification is a **separate** toggle in the same console, set after the first successful transfer (F-CM-05).

**Phone review.** The queue is a card list; a case is a full page with the images in a horizontal snap-scroll carousel and the decision buttons in a sticky bar. Reviewing on a phone is a real scenario for a small platform team and is tested at 360×800.

### 4.3 Storefront

`/market/sellers/[handle]` is a **public, server-rendered, indexable** page: avatar, display name, verified badge (when `kyc_status='approved'`), seller type, bio, subjects, member-since, total listings, total sales, average rating with count, and a paginated grid of that seller's `published` listings with the same card component as browse (F-CM-04). It reads `seller_public_v` only. A signed-out visitor sees it; tapping a listing sends them to the listing page, which prompts sign-in at _Buy_.

### 4.4 Suspension

Platform staff can suspend a seller (reason required). Effect: `status='suspended'`; all their listings move to `unlisted` (F-CM-03); the storefront returns 404 for new visitors; **existing buyers keep their entitlements and downloads forever** (they paid); pending earnings continue through the normal hold and payout cycle unless the suspension reason is `suspected_fraud`, which freezes payouts pending review. Audit: `seller.suspended`.

---

## 5. Business rules and calculations

### 5.1 State machines

**`seller_profiles.status`**

```
draft ──► pending_review ──► active ──► suspended ──► active
             │   ▲                 └──► closed
             └───┴── (changes_requested loops back via a new submission)
             └──► rejected ──► pending_review   (new attempt, ≥7 days later)
```

**`seller_profiles.kyc_status`**: `not_started → submitted → in_review → approved | changes_requested | rejected`. `changes_requested → submitted` on a new attempt. `approved` is sticky: a later suspension changes `status`, never `kyc_status`.

### 5.2 What verification gates (enforced, not promised)

- A listing can be **submitted for review** only when `kyc_status='approved'` and `status='active'` — checked in the server action **and** by an RLS `with check` on `listings.insert/update` that calls `app.is_verified_seller(auth.uid())`.
- A seller can **receive earnings** only when verified; an unverified seller cannot have a published listing, so this is structurally impossible rather than separately enforced.
- A **payout** additionally requires `seller_payout_methods.verified` on the default method for the _first_ payout only.
- Drafting a listing is allowed while `pending_review` — so a seller can prepare while waiting, which is what the prototype's copy promised and never enforced.

`app.is_verified_seller(user_id)` is a `SECURITY DEFINER STABLE` helper, pinned search_path, used by both layers.

### 5.3 SLA — exactly 2 business days

`sla_due_at = business_days_add(submitted_at, 2)` in **Asia/Dhaka**, where a business day excludes **Friday and Saturday** (the Bangladesh weekend; PRODUCT-DECISIONS 2.5 makes Sat–Thu the school week, but the _platform's_ own office week is Sun–Thu, which is the standard BD corporate week) and any date in `platform_holidays` *(proposed: `date pk, name)*. The clock starts at `submitted_at`; if that is outside 09:00–18:00 it starts at 09:00 on the next business day.

Worked example: submitted Thursday 17:00 → day 1 = Sunday, day 2 = Monday → `sla_due_at` = Monday 18:00 Asia/Dhaka.

The same computed value is shown to the seller ("we'll decide by Monday 18 May") and to the reviewer (as a countdown chip: green > 8 h, amber ≤ 8 h, red overdue). One function, `packages/domain/sla.ts`, used by both — the prototype's three different SLAs came from three different hardcoded strings.

A daily 09:00 job posts the overdue count to the platform staff notification channel.

### 5.4 Handle rules

Lowercased on write; 3–30 chars matching `^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$`; no double hyphens; blocked list includes `admin`, `acadigma`, `support`, `platform`, `api`, `sell`, `market`, `new`, `settings`, plus anything matching an existing route segment. Changeable once per 30 days; the old handle 301-redirects for 90 days via a `seller_handle_history` table _(proposed)_.

### 5.5 Profile completeness (drives a nudge, not a gate)

```
completeness_pct = round(100 * filled / 7)
filled = count of: avatar, bio ≥ 40 chars, ≥1 subject, website, ≥1 published listing,
                   payout method, approved KYC
```

Shown as a ring on `/sell`. It never blocks anything.

### 5.6 Badge definition (one definition, per PRODUCT-DECISIONS 4.5)

**Verified seller** = `kyc_status = 'approved'`. There is no second badge, no "verified educator" concept distinct from KYC, and no sales-volume tier in v1. The badge component reads `verified_at is not null` from `seller_public_v` and nothing else.

### 5.7 Data minimisation

We store the document **images** and the **last 4 digits** of its number; we never store the full NID/passport number, and the form does not ask for it. The reviewer reads the number off the image. This shrinks the blast radius of any future leak to "images that are deleted after 180 days".

---

## 6. UI

| Route                      | Who    | 360×800                                                                                             | ≥1024                                | Primary action                     | Empty                                      | Loading                   | Error            |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------- | ------------------------------------------ | ------------------------- | ---------------- |
| `/sell`                    | seller | Status card (draft/pending/approved), completeness ring, quick links to listings/earnings/payouts   | Two-column dashboard                 | Continue application / New listing | _"You're not selling yet"_ + Start selling | Skeleton card             | Inline alert     |
| `/sell/apply/[1-3]`        | user   | Full-screen step, 3-dot progress, sticky bottom **Continue**                                        | Centred 640 px card                  | Continue / Submit                  | n/a                                        | Disabled button + spinner | Per-field inline |
| `/sell/kyc`                | seller | Decision note, attempt history list, **Resubmit**                                                   | Same + timeline rail                 | Resubmit                           | _"No submissions"_                         | Skeleton                  | Alert            |
| `/sell/payouts/methods`    | seller | Method cards with `•••• 1234`, default chip, Add method sheet                                       | Table + panel                        | Add method                         | _"No payout method"_                       | Skeleton                  | Alert            |
| `/market/sellers/[handle]` | public | Header block, then 1-col listing cards                                                              | Header + 3-col grid                  | Follow-free; listing tap           | _"No listings yet"_                        | Skeleton grid             | 404 page         |
| `/platform/sellers`        | staff  | Tabs as chips (Needs review · In review · Approved · Rejected · Suspended), card list with SLA chip | Sidebar + table                      | Open case                          | _"Queue clear"_                            | Skeleton                  | Retry            |
| `/platform/sellers/[id]`   | staff  | Image carousel, details accordion, sticky decision bar                                              | 3-panel: images / details / decision | Approve · Request changes · Reject | n/a                                        | Skeleton                  | Alert            |

Components: `AppShell`, `FormSheet`, `FileDropTile`, `StatusChip`, `SlaChip`, `ImageViewer`, `DataList`, `EmptyState`, `StickyActionBar`, `VerifiedBadge`, `CompletenessRing`.

**Accessibility.** Upload tiles are `<button>`s with a visible label and an `aria-describedby` size/format hint. The image viewer traps focus and closes on Escape. The SLA chip's state is conveyed by text (_"Due in 6 hours"_), not colour alone.

---

## 7. Server contracts

| Name                                                                | Kind                            | Input                                                                                                                                                                                                             | Output                                | Errors                                                                                                    | Idempotency    | Rate limit     |
| ------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------- | -------------- |
| `checkHandleAvailable`                                              | route `GET /api/sell/handle?h=` | `{h}`                                                                                                                                                                                                             | `{available, suggestion?}`            | —                                                                                                         | n/a            | 30/min/user    |
| `saveSellerDraft`                                                   | action                          | `SellerDraftInput{displayName, handle, sellerType, bio?, subjects[], websiteUrl?}`                                                                                                                                | `{sellerProfileId}`                   | `HANDLE_TAKEN`, `HANDLE_INVALID`                                                                          | key            | 20/min/user    |
| `createKycUploadTarget`                                             | action                          | `{kind:'doc_front'\|'doc_back'\|'selfie', mime, sizeBytes}`                                                                                                                                                       | `{fileId, uploadUrl}`                 | `UNSUPPORTED_TYPE`, `TOO_LARGE`                                                                           | key            | 20/min/user    |
| `submitSellerApplication`                                           | action                          | `{legalName, documentType, documentNumberLast4, dateOfBirth, address{...}, fileIds{...}, payout{methodType, accountName, accountRef, accountRefConfirm, bankName?, branchName?, routingNumber?}, idempotencyKey}` | `{submissionId, slaDueAt}`            | `OPEN_SUBMISSION_EXISTS`, `MISSING_DOCUMENT`, `INVALID_PAYOUT_REF`, `PAYOUT_REF_MISMATCH`, `NOT_ELIGIBLE` | key            | 5/hour/user    |
| `addPayoutMethod` / `setDefaultPayoutMethod` / `deletePayoutMethod` | actions                         | see §3.3                                                                                                                                                                                                          | `{id}`                                | `INVALID_PAYOUT_REF`, `METHOD_IN_USE`                                                                     | key            | 10/hour/user   |
| `revealPayoutRef`                                                   | action                          | `{payoutMethodId}`                                                                                                                                                                                                | `{accountRef}`                        | `REAUTH_REQUIRED`, `FORBIDDEN`                                                                            | none (audited) | 5/hour/user    |
| `claimKycCase`                                                      | action                          | `{submissionId}`                                                                                                                                                                                                  | `{ok}`                                | `FORBIDDEN`                                                                                               | key            | 60/min/staff   |
| `decideKyc`                                                         | action                          | `{submissionId, decision:'approve'\|'changes_requested'\|'reject', reasonCode?, note?, internalNote?, idempotencyKey}`                                                                                            | `{status}`                            | `FORBIDDEN`, `NOTE_REQUIRED`, `ALREADY_DECIDED`                                                           | key            | 120/hour/staff |
| `suspendSeller` / `reinstateSeller`                                 | actions                         | `{sellerProfileId, reason}`                                                                                                                                                                                       | `{status}`                            | `FORBIDDEN`                                                                                               | key            | 30/hour/staff  |
| `getSellerPublic`                                                   | RSC query                       | `{handle}`                                                                                                                                                                                                        | `seller_public_v` row + listings page | `NOT_FOUND`                                                                                               | n/a            | cached 60 s    |

---

## 8. Parts (build chunks)

**Part 1 — Schema, RLS, and the verified-seller helper** _(2 days)_
Scope: migration for `seller_profiles`, `seller_kyc_submissions`, `seller_payout_methods`, `kyc_review_events`, `platform_holidays`, `seller_handle_history`; enums; indexes; all policies from §3.6; `app.is_verified_seller()`; trigger protecting privileged columns.
Tests: pgTAP — user A cannot select user B's submission (0 rows) **as a school admin, as a platform non-admin, and as an anonymous caller**; a seller cannot self-set `kyc_status='approved'`; the partial unique index blocks a second open submission.
**Demo:** the escalation test suite green, including the exact Base44 exposure replayed as a test that now returns 0 rows.

**Part 2 — pgsodium payout encryption + reveal function** _(1.5 days)_
Scope: vault key, encrypted column, `app.reveal_payout_ref()` with re-auth + audit, masked display helper, BD format validators in `packages/domain/payout.ts`, the CI grep test.
Tests: the raw column is unreadable by every role; reveal without recent re-auth fails; reveal writes an audit row; format validators unit-tested against real bKash/Nagad/bank shapes.
**Demo:** `select account_ref_encrypted from seller_payout_methods` as platform admin → permission denied; the reveal action returns the number and leaves an audit trail.

**Part 3 — Application wizard steps 1–2 (storefront + identity)** _(2 days)_
Scope: `/sell/apply/1` and `/2`, handle availability, draft save, upload tiles with camera capture, client HEIC/downscale/EXIF-strip, server magic-byte sniffing, `createKycUploadTarget`.
Tests: integration on upload validation; e2e at 360×800 through both steps.
**Demo:** on a real phone, photograph an NID and see the thumbnail, with the file landing in the private bucket.

**Part 4 — Step 3 (payout) + submit + SLA** _(1.5 days)_
Scope: payout step, double-entry confirmation, `submitSellerApplication` transaction, `business_days_add` + `platform_holidays`, outcome screen, seller email.
Tests: SLA unit tests across the Fri/Sat weekend and a holiday; duplicate-submission guard.
**Demo:** submit an application and see the same due date in the email, on the outcome screen, and in the queue.

**Part 5 — Platform review queue and case view** _(2 days)_
Scope: `/platform/sellers` tabs + SLA sorting + overdue chip, `/platform/sellers/[id]` with the image viewer on short-lived signed URLs, claim, three decisions, `kyc_review_events`, seller notifications and emails.
Tests: decision transitions; `ALREADY_DECIDED`; a non-platform user gets 404 on the route and 0 rows from the table.
**Demo:** approve a seller on a phone; the seller's badge appears without a reload on their next page load.

**Part 6 — Resubmission, rejection, suspension** _(1 day)_
Scope: `changes_requested` flow with prefilled step 2, 7-day cooldown after rejection, suspend/reinstate with listing unlisting and entitlement preservation.
Tests: cooldown enforced; suspension unlists listings but leaves entitlements intact.
**Demo:** request changes, resubmit, approve — three attempts visible in the history.

**Part 7 — Public storefront + badge + rollup triggers** _(1.5 days)_
Scope: `seller_public_v`, `/market/sellers/[handle]` server-rendered with metadata and OG tags, `VerifiedBadge`, triggers maintaining `total_listings`, `total_sales`, `rating_avg_bp`, handle-change redirects.
Tests: the view exposes no private column (asserted by an information_schema test); anonymous access works; a suspended seller 404s.
**Demo:** open a storefront signed out on a phone and see real counts, not zeros.

---

## 9. Acceptance criteria

1. **Given** a signed-in user with a verified email **when** they complete the three-step application **then** a `seller_profiles` row is `pending_review`, one `seller_kyc_submissions` row is `submitted`, one encrypted payout method exists, and the outcome screen shows a due date exactly 2 business days ahead in Asia/Dhaka.
2. **Given** an application submitted at 17:00 on a Thursday **when** the SLA is computed **then** the due date is the following Monday, skipping Friday and Saturday.
3. **Given** user B's KYC submission **when** user A queries `seller_kyc_submissions` with their own JWT — as a plain user, as a school owner of a workspace B belongs to, and as an anonymous client — **then** all three return zero rows.
4. **Given** any role including platform admin **when** they `select account_ref_encrypted` **then** permission is denied; **and when** platform staff call `revealPayoutRef` after re-authenticating **then** the number is returned and an `audit_events` row `payout_method.revealed` exists.
5. **Given** a seller whose KYC is `submitted` **when** they try to submit a listing for review **then** it is refused by both the server action and the RLS `with check`.
6. **Given** a seller whose KYC is `submitted` **when** they create a listing **then** it saves as a `draft` successfully.
7. **Given** platform staff approve a submission **when** the seller reloads **then** `kyc_status='approved'`, `verified_at` is set, the **Verified seller** badge shows on the storefront and on every listing card, and an email was sent.
8. **Given** platform staff choose _Request changes_ with a note **when** the seller opens `/sell/kyc` **then** they see the note, tap Resubmit, and land on a prefilled step 2 with empty file tiles; the new submission is `attempt_no = 2`.
9. **Given** an open submission **when** the seller tries to submit again **then** they get `OPEN_SUBMISSION_EXISTS` and the button is disabled with an explanation.
10. **Given** a rejected seller **when** they apply again within 7 days **then** it is refused; after 7 days it is allowed.
11. **Given** a seller is suspended **when** a buyer who previously purchased from them opens their library **then** the download still works, and the seller's storefront returns 404.
12. **Given** an approved submission 181 days old **when** the retention job runs **then** the three image files are deleted, `files` rows are gone, the submission row and `document_number_last4` remain, and an audit row records the deletion.
13. **Given** a handle that is taken or reserved **when** typed **then** the field shows an inline error before submit and suggests an alternative.
14. **Given** the review queue with an overdue case **when** staff open `/platform/sellers` on a 360 px phone **then** the overdue case sorts first with a red _"Overdue by Nh"_ chip and axe reports no serious violations.
15. **Given** a seller uploads a `.exe` renamed to `.jpg` **when** it is submitted **then** the server rejects it on magic bytes with `UNSUPPORTED_TYPE` and nothing is stored.

---

## 10. Tests

- **Unit (domain):** `business_days_add` across weekends/holidays/out-of-hours; handle validator and reserved list; bKash/Nagad/bank format validators; completeness formula; KYC and seller status transition tables.
- **DB (pgTAP):** isolation and escalation on all four tables; the three-way "can't read someone else's KYC" test; privileged-column trigger; partial unique index; column-level revoke on `account_ref_encrypted` and on `internal_note`; `seller_public_v` column set frozen by an information_schema assertion.
- **Integration:** upload validation (type, size, magic bytes, EXIF strip); the submit transaction's atomicity (a failing payout insert rolls back the submission); decision idempotency; suspension side-effects.
- **e2e (360×800 and 1280×800):** full application with mocked camera input; review and approve as staff; resubmission loop; storefront signed out; axe on every screen.
- **Security:** attempt to read a KYC signed URL after it expires (403); attempt to fetch another user's KYC file id (403 + `file_access_log` entry); verify no KYC image is ever served from the public bucket (a test enumerates the public bucket and asserts no `kyc/` prefix).
- **Performance:** `/market/sellers/[handle]` server-rendered p95 < 500 ms with 100 listings; queue list p95 < 400 ms at 5,000 submissions.

---

## 11. Open questions

1. **Institution sellers.** `seller_type='institution'` currently uses the same personal-NID KYC. _Default assumed:_ v1 verifies the **individual signatory** and records the institution name in `display_name`; trade-licence upload is a future field.
2. **Payout method verification.** _Default assumed:_ `verified` is set manually by staff after the first successful transfer (F-CM-05); no penny-drop or bKash name-check API in v1.
3. **Appeals.** _Default assumed:_ out-of-band via support email; no appeal table.
4. **Do we need a seller agreement / terms acceptance record?** _Default assumed:_ yes — a `terms_version` + `terms_accepted_at` pair on `seller_profiles`, captured at submit. Flagged for DATA-MODEL.md.
5. **Multiple payout methods.** Schema supports many with one default. _Default assumed:_ the UI allows up to 3.
6. **Platform office week.** This spec assumes the platform's business week is Sun–Thu while schools run Sat–Thu. If the owner wants the SLA clock on the school week instead, change one constant in `packages/domain/sla.ts`.
