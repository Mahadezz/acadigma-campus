# F-CM-03 — Listings, files and platform moderation

|                  |                                                                                                                                                          |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | market                                                                                                                                                   |
| Status           | planned                                                                                                                                                  |
| Owner branch     | `feat/commerce-listings`                                                                                                                                 |
| Depends on       | F-CM-02 (verified seller), F-OP-0x (files, private bucket, PDF pipeline), F-CM-01 (platform console shell)                                               |
| Plan             | `docs/plan/ROADMAP.md` chunk — commerce, third                                                                                                           |
| Base44 reference | `docs/reference/base44-inventory/04-commerce-billing.md` §4 "Separately: listing moderation", §5 rows 18–20, 24, §7-A7, §7-A8, §7-B18, §7-C22, §7-E43–45 |

> **Schema note.** Tables and columns are **proposed; `docs/architecture/DATA-MODEL.md` wins**.

---

## 1. Purpose

A verified seller creates a listing for a digital academic file, submits it, platform staff review it, and once approved the seller publishes it. From that moment the file is buyable and — crucially — the file itself has never been reachable by anyone except the seller and the reviewer.

**What Base44 had:** `MarketplaceListing` with a six-value status enum implying a review queue and **no moderation UI anywhere**, so nothing could ever reach `published` and _no listing created through the app was ever visible in the marketplace_. `published_at` was never set. `main_file_url` was a plain public URL on a row whose RLS granted read on every published listing to everyone — so **any user could download every paid product for free** without buying. Preview "watermarking" was a CSS-rotated `<div>` over an unmodified image. `preview_page_urls` was a string containing a JSON array. Bulk CSV upload omitted the required `seller_id` (which was also the RLS predicate), sent two undeclared fields, defaulted `resource_type` to a value outside the enum, and reported `success++` unconditionally — every row failed while the UI said _"N listings created as drafts"_. `view_count` was never incremented, `rating_average` never recomputed. Delete had no confirmation.

**Done looks like:** a seller drafts a worksheet on her phone, uploads a 6 MB PDF, sees a machine-generated 2-page preview appear a few seconds later, submits, and gets an approval notification the next morning. A buyer browsing the marketplace can see the preview and the cover but there is no URL anywhere in the page, the network tab, or the database-visible-to-them that leads to the source file.

---

## 2. Roles and permissions

| Action                             | Permission key           | verified seller (own)     | other users       | platform staff |
| ---------------------------------- | ------------------------ | ------------------------- | ----------------- | -------------- |
| Create / edit a draft listing      | `listing.write.own`      | ✔                         | —                 | —              |
| Upload listing files               | `listing.file.write.own` | ✔                         | —                 | —              |
| Submit for review                  | `listing.submit`         | ✔ (requires approved KYC) | —                 | —              |
| Read own listing in any status     | `listing.read.own`       | ✔                         | —                 | ✔              |
| Read a **published** listing       | —                        | ✔                         | ✔ incl. anonymous | ✔              |
| Approve / request changes / reject | `listing.moderate`       | —                         | —                 | ✔              |
| Publish an approved listing        | `listing.publish`        | ✔                         | —                 | ✔ (force)      |
| Unlist / relist                    | `listing.unlist`         | ✔                         | —                 | ✔              |
| Take down (staff)                  | `listing.takedown`       | —                         | —                 | ✔              |
| Bulk upload                        | `listing.bulk_upload`    | ✔                         | —                 | —              |

School admins and owners have **no** permissions over a member's listings.

---

## 3. Data

Listings are **global, not tenant-scoped** — a marketplace item is cross-school by design (the inventory's `MarketplaceListing` got this right). The owner key is `seller_user_id`. Every policy is written against that plus `app.is_platform_admin()`.

### 3.1 `listings` _(new; proposed)_

| column                                                          | type                                             | notes                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `id`                                                            | uuid pk                                          |
| `listing_no`                                                    | text unique not null                             | `MKT-000482`, from a global counter                                                                              |
| `seller_user_id`                                                | uuid not null → profiles                         |
| `seller_profile_id`                                             | uuid not null → seller_profiles                  |
| `slug`                                                          | citext unique not null                           | `algebra-class-8-worksheet-pack-000482` (title-derived + number)                                                 |
| `title`                                                         | text not null                                    | 8–120 chars                                                                                                      |
| `summary`                                                       | text not null                                    | 20–200 chars, shown on cards                                                                                     |
| `description`                                                   | text null                                        | ≤ 4000 chars, **plain text or a restricted markdown subset** (bold/italic/lists/links only), sanitised on render |
| `listing_type`                                                  | `listing_type` not null                          | §5.1                                                                                                             |
| `grade_level_ids`                                               | uuid[] not null                                  | → `grade_levels_catalog`                                                                                         |
| `subject_id`                                                    | uuid not null                                    | → `subjects_catalog`                                                                                             |
| `curriculum_id`                                                 | uuid null                                        | → `curricula_catalog` (NCTB, Cambridge, Edexcel, IB, Madrasah, Other)                                            |
| `language`                                                      | `listing_language` not null default `bn`         | `bn \| en \| bn_en`                                                                                              |
| `tags`                                                          | text[] not null default `'{}'`                   | ≤ 10, lowercased, from a controlled vocabulary + free tags                                                       |
| `price_paisa`                                                   | bigint not null default 0                        | `0` or `>= 1000` (§5.4)                                                                                          |
| `currency`                                                      | char(3) not null default `'BDT'`                 |
| `status`                                                        | `listing_status` not null default `draft`        | §5.2                                                                                                             |
| `cover_file_id`                                                 | uuid null → files                                | public bucket, 1200×800                                                                                          |
| `preview_file_ids`                                              | uuid[] not null default `'{}'`                   | public bucket, generated (§5.5)                                                                                  |
| `page_count` / `file_size_bytes` / `file_mime`                  | int / bigint / text null                         | from the primary file                                                                                            |
| `view_count`                                                    | bigint not null default 0                        | incremented by a debounced server call (§5.8)                                                                    |
| `purchase_count`                                                | bigint not null default 0                        | trigger on entitlement grant                                                                                     |
| `rating_avg_bp`                                                 | int null / `rating_count` int not null default 0 | trigger on review write                                                                                          |
| `submitted_at` / `approved_at` / `published_at` / `unlisted_at` | timestamptz null                                 |
| `content_hash`                                                  | text null                                        | sha256 of the primary file; duplicate detection (§5.9)                                                           |
| `search_tsv`                                                    | tsvector generated                               | §5.7                                                                                                             |
| `deleted_at`                                                    | timestamptz null                                 | soft delete (ARCHITECTURE §4 allows it for listings)                                                             |
| `created_at/updated_at`                                         |                                                  |                                                                                                                  |

Indexes: unique `(slug)`, unique `(listing_no)`, `(seller_user_id, status, updated_at desc)`, `(status, published_at desc) where status='published' and deleted_at is null`, GIN on `search_tsv`, GIN on `grade_level_ids`, GIN on `tags`, `(subject_id, status)`, `(price_paisa) where status='published'`, `(content_hash) where content_hash is not null`.

### 3.2 `listing_files` _(new; proposed)_

The saleable payload. Separated from `listings` so that **no policy that grants listing reads can ever expose a file path** — the exact Base44 hole.

| column                           | type                         | notes                                         |
| -------------------------------- | ---------------------------- | --------------------------------------------- |
| `id`                             | uuid pk                      |
| `listing_id`                     | uuid not null → listings     |
| `seller_user_id`                 | uuid not null                | denormalised for RLS                          |
| `file_id`                        | uuid not null → files        | **private** bucket, `purpose='listing_asset'` |
| `role`                           | `listing_file_role` not null | `primary \| extra`                            |
| `display_name`                   | text not null                |                                               |
| `size_bytes` / `mime` / `sha256` | bigint / text / text         |                                               |
| `page_count`                     | int null                     | PDFs                                          |
| `version`                        | int not null default 1       | bumped on replace                             |
| `created_at`                     |                              |                                               |

Indexes: `(listing_id, role)`, unique partial `(listing_id) where role='primary'`.

### 3.3 `listing_reviews_queue` — moderation cases _(new; proposed)_

| column                        | type                                             | notes                                                                                                                          |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`                          | uuid pk                                          |
| `listing_id`                  | uuid not null → listings                         |
| `attempt_no`                  | int not null                                     |
| `trigger`                     | `moderation_trigger` not null                    | `initial \| price_change \| file_change \| content_change \| report \| staff_audit`                                            |
| `diff_summary`                | jsonb not null default `'{}'`                    | what changed since the last approval (§5.6)                                                                                    |
| `status`                      | `moderation_status` not null default `submitted` | `submitted \| in_review \| approved \| changes_requested \| rejected`                                                          |
| `sla_due_at`                  | timestamptz not null                             | 2 business days, same function as F-CM-02 §5.3                                                                                 |
| `reviewer_id` / `reviewed_at` |                                                  |                                                                                                                                |
| `checklist`                   | jsonb not null default `'{}'`                    | §5.10                                                                                                                          |
| `reason_codes`                | `moderation_reason`[]                            | `copyright \| low_quality \| mislabelled \| wrong_price \| offensive \| watermark_missing \| duplicate \| incomplete \| other` |
| `note_to_seller`              | text null                                        | required for non-approve, ≥ 10 chars                                                                                           |
| `internal_note`               | text null                                        | never shown to the seller                                                                                                      |
| `created_at/updated_at`       |                                                  |                                                                                                                                |

Indexes: unique partial `(listing_id) where status in ('submitted','in_review')`, `(status, sla_due_at)`, `(listing_id, attempt_no desc)`.

### 3.4 Taxonomy catalogues _(new; proposed, platform-owned, global)_

- `subjects_catalog(id, name_en, name_bn, sort, active)` — seeded with the NCTB subject list.
- `grade_levels_catalog(id, code, name_en, name_bn, sort)` — Play, Nursery, KG, Class 1…12.
- `curricula_catalog(id, code, name)` — `nctb`, `cambridge`, `edexcel`, `ib`, `madrasah`, `other`.
- `listing_type` enum, not a table (fixed list, §5.1).

All four are readable by everyone (including anonymous) and writable by platform staff only. The school-side `subjects` table is **workspace-scoped and separate**; a mapping table `subject_catalog_links(workspace_subject_id, catalog_subject_id)` _(proposed)_ lets a school's library suggest marketplace items. Not merging them is deliberate: a school may name a subject "ICT-9" and that must not appear in a global facet.

### 3.5 `listing_bulk_batches` _(new; proposed)_

`id`, `seller_user_id`, `csv_file_id`, `zip_file_id`, `status` (`uploaded|parsing|validating|ready|committing|completed|failed`), `row_count`, `valid_count`, `error_count`, `created_count`, `errors jsonb` (per-row `{row, column, code, message}`), `created_at`, `completed_at`.

### 3.6 RLS policies — in words

**`listings`**

- _select_: (a) **anyone, including anonymous**, may read rows where `status='published' AND deleted_at is null` — through the view `listing_public_v`, which exposes everything except internal columns and which **has no join to `listing_files`**. (b) `seller_user_id = app.current_user_id()` reads their own rows in every status. (c) platform staff read all.
- _insert_: `seller_user_id = app.current_user_id()` **and** `app.is_verified_seller(auth.uid()) is not false` (a `pending_review` seller may draft) **and** `status = 'draft'` **and** `published_at is null` **and** `purchase_count = 0` **and** `rating_count = 0`.
- _update_: owner may update only while `status in ('draft','changes_requested','unlisted')`, and a trigger forbids changing `status`, `seller_user_id`, `approved_at`, `published_at`, `view_count`, `purchase_count`, `rating_*`, `listing_no`. Status moves happen through server actions. Platform staff may update moderation-owned columns. **Nobody** can update a row while it is `submitted` or `in_review` — the reviewer must be looking at a frozen object.
- _delete_: denied. Soft delete via the `archiveListing` action, blocked when `purchase_count > 0` (buyers keep working links; an archived-with-sales listing becomes `unlisted`, never deleted).

**`listing_files`** — the important one.

- _select_: **`seller_user_id = app.current_user_id()` or `app.is_platform_admin()`. That is the entire policy.** A buyer never selects this table; downloads go through `/api/market/download` which resolves entitlement server-side and signs a URL from the `files` row using the **service role** (F-CM-04 §4.4). There is no buyer-facing read path, not even for an entitled buyer, so a future RLS mistake on entitlements cannot leak a path.
- _insert/update_: owner only, and only while the parent listing is in an editable status.
- _delete_: owner, only while editable, and never for a version referenced by an entitlement's download history.

**`listing_reviews_queue`**: _select_ platform staff (all) and the owning seller (their own rows, **excluding `internal_note`** by column revoke). _insert_ is server-action only (owner submit). _update_ platform staff only. _delete_ denied.

**Catalogues**: _select_ to `public`; _insert/update/delete_ platform staff only.

**`listing_bulk_batches`**: owner + platform staff select; owner insert; service-role update.

### 3.7 Files and buckets

| asset                        | bucket      | path                                               | who can reach it                                                                                                |
| ---------------------------- | ----------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| primary / extra listing file | **private** | `listings/<listing_id>/v<version>/<file_id>.<ext>` | seller, reviewer, entitled buyer — each via a 5-min signed URL from `/api/files/[id]` or `/api/market/download` |
| generated preview pages      | **public**  | `listing-previews/<listing_id>/p<1..3>.webp`       | anyone (they are watermarked derivatives, §5.5)                                                                 |
| cover image                  | **public**  | `listing-covers/<listing_id>.webp`                 | anyone                                                                                                          |
| bulk CSV / ZIP               | **private** | `bulk/<batch_id>/…`                                | seller, platform staff                                                                                          |

Accepted primary types: `application/pdf`, `.docx`, `.pptx`, `.xlsx`, `.zip`. Max 100 MB (plan-independent; the seller's storage is not charged against their school's quota because listings are user-scoped, not workspace-scoped). Magic-byte sniffed; `.zip` is scanned for path traversal entries and for nested executables before acceptance. A ClamAV scan runs as a job before a listing may be submitted (`listings` cannot move to `submitted` while a file's `scan_status` is `pending` or `infected`).

**CI-enforced, not a review convention (R1).** The private-vs-public split above was previously guarded only by developers remembering the rule in code review — the same class of gap `coverage.sql` closes for RLS (SECURITY.md). A CI check (`supabase/ci/public-bucket-guard.*`, run alongside `coverage.sql`) statically enumerates every code path that writes to the `listing-previews` / `listing-covers` public buckets against an explicit allowlist (only the preview-generation job of §5.5 and the cover-upload path) and **fails the build** on any other write target, any write of a primary/extra listing file object key into a public bucket, or a new public-bucket reference added outside the allowlist. This turns "the source file never enters a public bucket" from a sentence a reviewer might miss into a build gate.

---

## 4. Workflows

### 4.1 Create and edit a draft

1. `/sell/listings/new` → a **stepped full-page form**, not a sheet (files + camera round-trips): **Basics** (title, summary, type, subject, grades, curriculum, language, tags) → **Files** (primary, optional extras, cover) → **Price** → **Review**.
2. Autosave on blur, 800 ms debounce, with a _"Saved"_ timestamp. Drafts never expire.
3. On primary-file upload: a `jobs` row `listing.process_file` runs virus scan → page count → sha256 → preview generation (§5.5) → cover fallback (first page). The Files step shows per-asset state chips (`Uploading · Scanning · Ready · Failed`). Submit is disabled until the primary file is `Ready`.
4. Delete a draft: a confirm sheet naming the listing title (the prototype had no confirmation at all).

**Failure cases:** oversized file (rejected before upload starts, from the file input's size); unsupported type (magic-byte rejection server-side with a clear message); scan failure (`infected` → file removed, seller notified, listing stays draft, audit `listing.file_rejected`); preview generation failure (listing may still be submitted; the reviewer sees _"Preview generation failed"_ and can approve anyway — the buyer then sees the cover only).

### 4.2 Submit → review → approve → publish

1. Seller taps **Submit for review** (Review step). Server action `submitListing` checks: KYC approved; all required fields; primary file `Ready` and scanned clean; price legal (§5.4); no open moderation case.
2. Insert `listing_reviews_queue` (`trigger='initial'` or a change trigger, `sla_due_at` = 2 business days), listing → `submitted`. The listing is **frozen** (RLS blocks updates).
3. Platform staff open `/platform/listings`, default tab **Needs review**, sorted by `sla_due_at`. The case view shows: rendered previews, a link to open the **actual file** in a viewer (signed URL, 5 min, logged), all metadata, the seller's history (listings approved/rejected, sales, rating), the `diff_summary` for re-reviews, and a **checklist** (§5.10).
4. Decisions:
   - **Approve** → case `approved`, listing → `approved`, `approved_at=now()`. The seller is notified: _"Approved — publish when you're ready."_
   - **Request changes** → case `changes_requested` with reason codes + a note. Listing → `changes_requested` and becomes editable again. The seller sees the note at the top of the editor.
   - **Reject** → case `rejected`, listing → `rejected` (editable; the seller may revise and resubmit, except when the reason is `copyright` or `offensive`, which additionally flags the seller account for staff attention).
5. **Publish** is the seller's action, not the reviewer's: `publishListing` sets `status='published'`, `published_at=now()`, makes the row visible in `listing_public_v`, and bumps `seller_profiles.total_listings`. Approved-but-unpublished listings sit in a _Ready to publish_ tab.
6. **Unlist** (seller) → `unlisted`; disappears from browse and search immediately; **existing buyers keep their entitlement and their download link forever**. **Relist** from `unlisted` goes back to `published` with no new review _unless_ something re-reviewable changed while unlisted.
7. **Takedown** (staff) → `removed`, with a reason. Same buyer guarantee. Notifies the seller. Used for copyright claims.

**Phone flow.** The seller's listing list is a `DataList` of cards with a status chip and a kebab menu (Edit · Submit · Publish · Unlist · Duplicate · Delete) in a bottom sheet. The reviewer's case view stacks: previews carousel → checklist accordion → metadata → sticky decision bar with three buttons; _Approve_ is primary and right-most for thumb reach.

### 4.3 Re-review on edit

Editing a **published** listing is allowed for non-material fields and forbidden for material ones (§5.6). Changing a material field puts the listing into `changes_pending_review`: the **currently published version stays live and buyable** while the change waits, and the pending diff is applied atomically on approval. That is the practical answer to PRODUCT-DECISIONS 4.4's _"edits to price/files re-enter review"_ without taking a seller's income offline for two days.

Implementation: a `listing_pending_changes` table _(proposed: `listing_id, payload jsonb, files jsonb, created_at`)_ holds the draft delta; the moderation case's `diff_summary` renders it field-by-field, old → new.

### 4.4 Bulk upload (CSV + ZIP)

1. `/sell/listings/bulk` — download a template CSV (headers: `filename,title,summary,listing_type,subject,grade_levels,curriculum,language,tags,price_bdt`). Upload the CSV plus one ZIP whose entries match `filename`.
2. Parse and validate **every row** server-side into `listing_bulk_batches.errors` — unknown subject, unknown grade, illegal price, missing file in the ZIP, duplicate filename, file too large, bad type. Nothing is created yet.
3. A preview table shows valid rows in green and invalid rows in red with the exact column and reason. The seller may download an annotated CSV, fix it, and re-upload.
4. **Commit** creates one `draft` listing per valid row with its file, then runs the normal per-file processing jobs. It reports the true created count.
5. Every bulk-created listing **goes through moderation exactly like any other** (PRODUCT-DECISIONS 4.10). A **Submit all drafts from this batch** action creates one moderation case per listing; the reviewer gets them grouped by batch so approving 30 similar worksheets is one screen with per-item approve/skip, not 30 screens.

**Failure case that the prototype got wrong:** partial success is reported honestly — `created_count` is counted from actual inserted rows, and the UI shows `18 created · 4 skipped` with the reasons, never an unconditional success.

---

## 5. Business rules and calculations

### 5.1 `listing_type` (fixed enum, 15 values, carried over)

`worksheet, exam_paper, quiz, class_test, homework, notes, presentation, lab_sheet, project_work, resource_pack, book, thesis, question_bank, assignment, handout`. Mirrored in `packages/contracts` and covered by the enum-parity test. No `Other` — the prototype's bulk upload defaulted to a value outside the enum precisely because a catch-all existed in the CSV template and not in the schema.

### 5.2 `listings.status` state machine

```
draft ─submit─► submitted ─claim─► in_review ─┬─approve──► approved ─publish─► published
  ▲                                            ├─changes──► changes_requested ─┐
  │                                            └─reject───► rejected ──────────┤
  └────────────────────── edit ────────────────────────────────────────────────┘

published ─unlist──► unlisted ─relist──► published
published ─material edit──► changes_pending_review ──approve──► published (delta applied)
published|unlisted ─staff──► removed        (terminal; buyers keep access)
```

Illegal transitions are rejected by a `packages/domain/listings/transitions.ts` table and by a DB trigger. `draft → published` does not exist. There is no path that publishes without an `approved` moderation case — asserted by a pgTAP test that tries every status pair.

### 5.3 Who may be in each state

`submitted`/`in_review` require `app.is_verified_seller(seller_user_id) = true`. If a seller is suspended, a trigger moves all their `published` listings to `unlisted` and cancels open cases.

### 5.4 Pricing rules

- `price_paisa = 0` (free) **or** `price_paisa >= 1000` (৳10.00). The middle range is impossible because SSLCommerz refuses transactions under ৳10.00 (F-CM-01 §5.8). The form says so: _"Price must be ৳0 (free) or at least ৳10."_
- Upper bound `price_paisa <= 5000000` (৳50,000) per listing — well inside the gateway ceiling and a sane sanity limit.
- Prices are whole **taka** in the UI (`price_paisa % 100 = 0` enforced by a check constraint); paisa exists so the schema never needs migrating, not because anyone types poisha.
- **Free listings still go through moderation and still create an order + entitlement** (F-CM-01 §5.6) — a free item is a real acquisition with a real download log.
- A price change on a published listing is a **material edit** (re-review). This is deliberate and is the single rule most likely to annoy sellers; it is what PRODUCT-DECISIONS 4.4 requires, and the pending-change mechanism (§4.3) means their current price stays live meanwhile.
- The **commission is not shown as a rate the seller can change**; the price editor shows a live breakdown using `platform_settings.commission_bps`:
  ```
  You set:        ৳250
  Platform (30%): ৳75      = floor(25000 * 3000 / 10000) = 7500 paisa
  You receive:    ৳175      = 25000 - 7500 = 17500 paisa
  ```
  computed by the **same** `packages/domain/money.ts` function the ledger uses, never by a hardcoded `* 0.7`.

### 5.5 Preview generation and watermarking

Runs as a job on upload, in a Node route (`/api/jobs/listing-preview`), never in the browser:

- **PDF:** render pages 1…min(3, page_count) at 150 DPI to WebP, max 1400 px on the long edge.
- **DOCX/PPTX/XLSX:** converted to PDF first (LibreOffice headless in a job container), then as above. If conversion is unavailable, the preview falls back to the cover only.
- **ZIP:** no preview; the seller must supply a cover.
- Each preview page is **rasterised** (never a PDF the buyer can extract text from) and stamped server-side with a tiled diagonal watermark reading `Preview — Acadigma Campus` at 12 % opacity, drawn into the pixels. The stored file **is** the watermarked artefact; there is no unwatermarked public copy. This is the fix for the prototype's CSS-overlay pretence.
- Page 2+ of the preview is additionally blurred in the lower 40 % for listings over ৳500 — a cheap deterrent that keeps the preview useful.
- Preview images are public because they are safe to be public. The **source file never enters a public bucket at any point in its life**, including during processing (jobs read it through the service role from the private bucket).

### 5.6 Material vs non-material edits (what re-enters review)

| Field                                                            | Material?                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `price_paisa`                                                    | **yes**                                                                  |
| primary or extra file (any replace)                              | **yes**                                                                  |
| `title`, `summary`, `description`                                | **yes**                                                                  |
| `listing_type`, `subject_id`, `grade_level_ids`, `curriculum_id` | **yes**                                                                  |
| cover image                                                      | no                                                                       |
| `tags`, `language`                                               | no                                                                       |
| typo fix ≤ 5 characters in `description`                         | **yes** — no exception; a character-count carve-out is an attack surface |

`diff_summary` is produced by `packages/domain/listings/diff.ts` and is what the reviewer reads, so a re-review of a price change takes fifteen seconds, not two minutes.

### 5.7 Search vector

```sql
search_tsv generated always as (
  setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
  setweight(to_tsvector('simple', coalesce(summary,'')), 'B') ||
  setweight(to_tsvector('simple', array_to_string(tags,' ')), 'C') ||
  setweight(to_tsvector('simple', coalesce(description,'')), 'D')
) stored
```

`'simple'` (not `'english'`) because titles are routinely mixed Bangla/English and the English stemmer mangles transliterations. Bangla matching is handled by `simple` + a trigram index on `title` for fuzzy fallback (`pg_trgm`). Details in F-CM-04 §5.

### 5.8 Counters (never client-written)

- `view_count`: `POST /api/market/listings/[id]/view`, called once per listing per session, deduped server-side by `(listing_id, session_hash, date)` in a `listing_views` table _(proposed)_; the counter is a nightly rollup, not a live `+1` on every request. Bots (no-JS, known UA) are excluded.
- `purchase_count`: trigger on `entitlements` insert.
- `rating_avg_bp` / `rating_count`: trigger on `listing_reviews` insert/update/delete (F-CM-04 §5).
- `seller_profiles.total_listings` / `total_sales`: triggers. Every one of these was "never updated" in the prototype; each now has a pgTAP test asserting the trigger fires.

### 5.9 Duplicate detection

On file processing, `content_hash` (sha256) is compared against all other listings. An exact match by a **different** seller raises the case's `duplicate` flag and the reviewer sees both listings side by side. A match by the **same** seller blocks submission with _"You already have this file listed as …"_.

### 5.10 Reviewer checklist (stored on the case, not decorative)

`{ file_opens: bool, matches_description: bool, quality_acceptable: bool, no_third_party_branding: bool, price_reasonable: bool, grade_subject_correct: bool, no_pii_in_file: bool }`. **Approve is disabled until every box is ticked**, and the ticks are stored so a later dispute can show what was checked. `no_pii_in_file` catches the real hazard of a teacher uploading a worksheet with a class roster in the footer.

### 5.11 Reporting a listing

Any signed-in user can report a published listing (`listing_reports` _(proposed: id, listing_id, reporter_user_id, reason_code, note, status, created_at)_). A report creates a moderation case with `trigger='report'` and an SLA of **1 business day** for `copyright`/`offensive`, 2 for everything else. Three open reports auto-unlist pending review.

---

## 6. UI

| Route                                 | Who    | 360×800                                                                                                                   | ≥1024                                          | Primary action                         | Empty                             | Loading                      | Error                        |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------- | --------------------------------- | ---------------------------- | ---------------------------- |
| `/sell/listings`                      | seller | Chip tabs (All · Draft · In review · Ready to publish · Published · Unlisted), card list with status chip + price + sales | Sidebar filter + table                         | **New listing** (FAB above bottom nav) | _"No listings yet"_ + New listing | 6 skeleton cards             | Retry banner                 |
| `/sell/listings/new` and `/[id]/edit` | seller | Full-page 4-step form, sticky Continue/Save bar, per-file state chips                                                     | Two-column: form left, live card preview right | Save draft / Submit                    | n/a                               | Disabled bar + spinner       | Per-field inline + top alert |
| `/sell/listings/[id]`                 | seller | Status timeline, reviewer note (if any), stats (views, sales, revenue), actions in a sheet                                | Detail + right rail stats                      | Publish / Edit                         | n/a                               | Skeleton                     | Alert                        |
| `/sell/listings/bulk`                 | seller | Two upload tiles stacked, then a scrollable validation list (errors first)                                                | Side-by-side upload + table                    | Commit valid rows                      | _"Upload a CSV and a ZIP"_        | Progress bar with row counts | Per-row errors               |
| `/platform/listings`                  | staff  | Chip tabs, card list with SLA chip and batch grouping                                                                     | Sidebar + table + bulk actions                 | Open case                              | _"Queue clear"_                   | Skeleton                     | Retry                        |
| `/platform/listings/[caseId]`         | staff  | Preview carousel → Open file → checklist accordion → diff → sticky decision bar                                           | 3-panel                                        | Approve                                | n/a                               | Skeleton                     | Alert                        |

Components: `AppShell`, `DataList`, `StepForm`, `FileDropTile`, `AssetStateChip`, `PriceBreakdown`, `StatusChip`, `SlaChip`, `DiffList`, `Checklist`, `ImageCarousel`, `StickyActionBar`, `ConfirmSheet`, `EmptyState`.

**Phone notes.** The price field uses `inputmode="numeric"` with a `৳` prefix adornment and shows the breakdown live below it. The preview carousel is a CSS scroll-snap strip (no JS carousel library). The reviewer's decision bar sits above the safe area with 44 px buttons and a destructive-action confirm.

---

## 7. Server contracts

| Name                                                        | Kind    | Input                                                                                       | Output                                                                | Errors                                                                                                                 | Idempotency | Rate limit     |
| ----------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------- | -------------- |
| `createListingDraft`                                        | action  | `ListingDraftInput` (all §3.1 editable fields, partial)                                     | `{listingId, slug}`                                                   | `NOT_A_SELLER`, `VALIDATION`                                                                                           | key         | 30/hour/user   |
| `updateListingDraft`                                        | action  | `{listingId, patch}`                                                                        | `{updatedAt}`                                                         | `LISTING_LOCKED`, `MATERIAL_EDIT_REQUIRES_REVIEW`                                                                      | key         | 120/hour/user  |
| `createListingUploadTarget`                                 | action  | `{listingId, role, mime, sizeBytes, displayName}`                                           | `{fileId, uploadUrl}`                                                 | `UNSUPPORTED_TYPE`, `TOO_LARGE`, `LISTING_LOCKED`                                                                      | key         | 60/hour/user   |
| `finalizeListingUpload`                                     | action  | `{listingId, fileId}`                                                                       | `{jobId}`                                                             | `NOT_FOUND`                                                                                                            | key         | 60/hour/user   |
| `submitListing`                                             | action  | `{listingId, idempotencyKey}`                                                               | `{caseId, slaDueAt}`                                                  | `KYC_NOT_APPROVED`, `FILE_NOT_READY`, `FILE_INFECTED`, `PRICE_INVALID`, `OPEN_CASE_EXISTS`, `DUPLICATE_OF_OWN_LISTING` | key         | 60/hour/user   |
| `publishListing`                                            | action  | `{listingId}`                                                                               | `{publishedAt}`                                                       | `NOT_APPROVED`                                                                                                         | key         | 60/hour/user   |
| `unlistListing` / `relistListing`                           | actions | `{listingId, reason?}`                                                                      | `{status}`                                                            | `INVALID_TRANSITION`                                                                                                   | key         | 60/hour/user   |
| `archiveListing`                                            | action  | `{listingId, confirmTitle}`                                                                 | `{ok}`                                                                | `HAS_PURCHASES`, `TITLE_MISMATCH`                                                                                      | key         | 20/hour/user   |
| `claimModerationCase`                                       | action  | `{caseId}`                                                                                  | `{ok}`                                                                | `FORBIDDEN`                                                                                                            | key         | 120/min/staff  |
| `decideListing`                                             | action  | `{caseId, decision, checklist, reasonCodes?, noteToSeller?, internalNote?, idempotencyKey}` | `{status}`                                                            | `CHECKLIST_INCOMPLETE`, `NOTE_REQUIRED`, `ALREADY_DECIDED`                                                             | key         | 300/hour/staff |
| `takedownListing`                                           | action  | `{listingId, reasonCode, note}`                                                             | `{status}`                                                            | `FORBIDDEN`                                                                                                            | key         | 30/hour/staff  |
| `reportListing`                                             | action  | `{listingId, reasonCode, note}`                                                             | `{reportId}`                                                          | `ALREADY_REPORTED`                                                                                                     | key         | 5/day/user     |
| `createBulkBatch` / `validateBulkBatch` / `commitBulkBatch` | actions | `{csvFileId, zipFileId}` / `{batchId}`                                                      | `{batchId, rowCount, validCount, errors}` / `{createdCount, skipped}` | `PARSE_FAILED`, `ZIP_MISMATCH`, `TOO_MANY_ROWS` (>200)                                                                 | key         | 5/day/user     |

---

## 8. Parts (build chunks)

**Part 1 — Taxonomy catalogues + seed** _(1 day)_
Scope: `subjects_catalog`, `grade_levels_catalog`, `curricula_catalog`, `listing_type` enum, RLS (public read / staff write), NCTB seed data in `supabase/seed`, a tiny `/platform/taxonomy` editor.
Tests: enum parity; public read works anonymously; non-staff write denied.
**Demo:** the browse filter facets render from real seeded data.

**Part 2 — `listings` + `listing_files` schema, RLS, transitions** _(2 days)_
Scope: migration, indexes, `listing_public_v`, the transition trigger, `packages/domain/listings/transitions.ts`.
Tests: pgTAP — an anonymous caller selecting `listing_files` gets 0 rows **for a published listing they could otherwise read**; a seller cannot update a `submitted` listing; every illegal status pair is rejected; `draft → published` impossible.
**Demo:** the Base44 hole replayed as a test: read every published listing as a stranger, assert no file path is reachable.

**Part 3 — Listing editor (Basics + Price) with autosave** _(2 days)_
Scope: `/sell/listings/new` steps 1 and 3, slug generation, price validation + live breakdown from `money.ts`, autosave, `/sell/listings` list with tabs.
Tests: price boundary tests (0, 999, 1000, 5000001); slug uniqueness; autosave conflict handling.
**Demo:** draft a listing on a phone and see the ৳250 → ৳75/৳175 breakdown.

**Part 4 — File upload, scanning, preview generation** _(2 days)_
Scope: signed upload targets, magic-byte + ZIP-entry validation, ClamAV job, sha256, page count, PDF→WebP preview with baked-in watermark, LibreOffice conversion job, cover fallback, asset state chips.
Tests: infected file quarantined and the listing blocked from submit; a renamed executable rejected; preview pixels actually contain the watermark (asserted by sampling pixel variance in the stamped region); no public-bucket object is ever created for a source file.
**Demo:** upload a PDF and watch three watermarked preview pages appear.

**Part 5 — Submit + moderation queue + decisions** _(2 days)_
Scope: `listing_reviews_queue`, `submitListing`, `/platform/listings` queue with SLA sorting, `/platform/listings/[caseId]` case view with the file viewer and the mandatory checklist, three decisions, notifications, publish action, _Ready to publish_ tab.
Tests: approve-without-checklist blocked; frozen-listing RLS; decision idempotency; publish requires an approved case.
**Demo:** submit → approve → publish → the listing appears in browse.

**Part 6 — Re-review on material edits + unlist/relist/takedown/reports** _(2 days)_
Scope: `listing_pending_changes`, `diff.ts`, `changes_pending_review` flow keeping the live version buyable, unlist/relist, staff takedown, `listing_reports` with the 3-report auto-unlist.
Tests: a price change leaves the old price live until approval, then applies atomically; unlisting preserves buyer downloads; report thresholds.
**Demo:** change a published price and show buyers still paying the old price until the reviewer approves.

**Part 7 — Bulk CSV + ZIP upload** _(2 days)_
Scope: template download, parse + validate, annotated error CSV, preview table, commit, batch-grouped submission, grouped review screen.
Tests: honest counts (a row that fails does **not** count as created); ZIP entry mismatch; 200-row cap; traversal entries rejected.
**Demo:** upload 20 rows with 4 deliberate errors and see `16 created · 4 skipped` with reasons.

---

## 9. Acceptance criteria

1. **Given** a verified seller **when** they complete the editor and tap _Submit for review_ **then** the listing is `submitted`, a moderation case exists with a due date 2 business days out, and the listing can no longer be edited.
2. **Given** a seller whose KYC is not approved **when** they tap _Submit_ **then** they get `KYC_NOT_APPROVED`; **and** they can still save the draft.
3. **Given** any user, signed in or anonymous, **when** they query `listing_files` for a published listing **then** they get zero rows; **and when** they inspect the listing detail page's HTML and network traffic **then** no URL resolving to the private bucket appears.
4. **Given** a listing with a ৳250 price **when** the editor renders the breakdown **then** it shows platform ৳75 and seller ৳175, computed by `packages/domain/money.ts` (verified by changing `commission_bps` to 2500 in a test and seeing ৳62.50/৳187.50 without a code change).
5. **Given** a price of ৳5 **when** the seller saves **then** validation rejects it with _"Price must be ৳0 (free) or at least ৳10."_
6. **Given** a PDF upload **when** processing finishes **then** up to 3 preview WebP pages exist in the public bucket, each carrying a baked-in diagonal watermark, and the source PDF exists only in the private bucket.
7. **Given** a reviewer with an unticked checklist **when** they tap _Approve_ **then** the button is disabled and the reason is stated.
8. **Given** a reviewer approves **when** the seller next opens `/sell/listings` **then** the listing is in _Ready to publish_, and tapping **Publish** makes it appear in `/market` within one page load.
9. **Given** a published listing with 3 sales **when** the seller edits the price **then** the live listing keeps the old price and shows _"Price change under review"_; on approval the new price applies to new orders only, and existing entitlements are untouched.
10. **Given** a published listing with sales **when** the seller tries to delete it **then** it is refused with `HAS_PURCHASES` and offered _Unlist_ instead.
11. **Given** a listing is unlisted or taken down **when** an existing buyer opens their library **then** the download still works.
12. **Given** a bulk upload of 20 rows where 4 reference missing ZIP entries **when** the batch is committed **then** exactly 16 listings are created as drafts and the UI reports `16 created · 4 skipped` with the four filenames and reasons.
13. **Given** a ZIP containing `../../etc/passwd` **when** validated **then** the batch fails with a traversal error and nothing is extracted.
14. **Given** a file uploaded with a `.pdf` extension but PE magic bytes **when** finalised **then** it is rejected and no `listing_files` row exists.
15. **Given** two sellers upload the identical file **when** the second submits **then** the reviewer's case shows a duplicate flag with a link to the first listing.
16. **Given** a seller is suspended **when** the trigger runs **then** all their published listings become `unlisted` and open moderation cases are cancelled.
17. **Given** the moderation queue at 360×800 **when** a reviewer works through a case **then** previews, checklist and decisions are all reachable without horizontal scroll, buttons are ≥ 44 px, and axe reports no serious violations.

---

## 10. Tests

- **Unit (domain):** transition table (every pair); material-edit classifier; diff generation; slug generation and collision; price validator; CSV row validator; duplicate-hash logic.
- **DB (pgTAP):** the `listing_files` isolation test in five caller personas (anonymous, other user, entitled buyer, school admin of the seller's school, platform admin); frozen-listing update denial; trigger protection on counters; `listing_public_v` column set frozen; catalogue write denial.
- **Integration:** upload → scan → preview job chain with a fixture PDF; infected-file path with the EICAR test file; bulk commit counting; re-review delta application atomicity.
- **e2e (360×800 and 1280×800):** draft → submit → approve → publish → visible in browse; request-changes loop; bulk upload with errors; report a listing; axe on all screens.
- **Security:** enumerate the public bucket and assert no object under a `listings/` prefix; the CI public-bucket-guard check (§3.7) is itself covered by a fixture that adds a disallowed public write and asserts the build fails; assert a signed URL for a listing file expires and 403s afterwards; attempt to `update listings set status='published'` directly with a seller JWT (denied by trigger **and** policy).
- **Performance:** editor autosave p95 < 250 ms; queue list p95 < 400 ms at 20,000 listings; preview job p95 < 12 s for a 20-page PDF.

---

## 11. Open questions

1. **LibreOffice conversion host.** Vercel functions cannot run it. _Default assumed:_ a Supabase Edge Function is also unsuitable, so DOCX/PPTX previews run in a small containerised job (Fly.io or a Vercel background function with a bundled converter); until that exists, non-PDF listings require a seller-supplied cover and get no page previews. Flagged to ARCHITECTURE.
2. **Virus scanning.** _Default assumed:_ ClamAV in the same job container. If unavailable at v1, the gate becomes "reviewer opens the file in a sandboxed viewer" and `scan_status='skipped'` is recorded honestly rather than faked.
3. **Bangla full-text search quality.** _Default assumed:_ `simple` + `pg_trgm`. If recall is poor in testing, add a Bangla stemming dictionary or move search to a dedicated index. Measured in F-CM-04.
4. **Licence terms per listing** (single teacher vs whole school). _Default assumed:_ one licence — _personal or single-school use, no redistribution_ — stated once in the marketplace terms, not per listing. A `licence_type` column is a plausible v2.
5. **Should the reviewer be able to edit metadata instead of bouncing it back?** _Default assumed:_ no — reviewers decide, sellers edit. A "suggest a fix" note covers the common case.
6. **Preview page count for non-PDF resource packs.** _Default assumed:_ cover only.
