# F-TE-05 — Resources and the school library

|                  |                                                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | teaching                                                                                                                                                                                                                                                         |
| Status           | planned                                                                                                                                                                                                                                                          |
| Owner branch     | `feat/teaching-resources`                                                                                                                                                                                                                                        |
| Depends on       | F-AU-02 (workspaces, memberships, removal lifecycle) · F-OP-05 (`files` table, private/public buckets, signed URLs, `file_access_log`) · F-BI-01 (`plans.storage_gb`) · F-OP-04 (print queue)                                                                    |
| Depended on by   | F-TE-04 (every generated artefact lands here) · F-MK-06 (marketplace purchases land here) · F-TE-07 (storage and library analytics)                                                                                                                              |
| Plan             | `docs/plan/ROADMAP.md` chunk — teaching, position 1                                                                                                                                                                                                              |
| Base44 reference | `docs/reference/base44-inventory/03-teaching-intelligence.md` §2.7, §2.8, §2.5, §2.6, §4 rows 6, 8, 9–10f, §5.4, §5.5, §6 "Resource identifier generation" / "Resource library aggregates", §7 items 3, 4, 6, 7, 8, 9, 12, 20–26, 34–37, 46–47, §8 Q10, Q11, Q15 |

## 1. Purpose

Everything a teacher makes or buys lands in one place they can find it again: worksheets, exam papers, notes, handouts, presentations, question banks, textbook softcopies, marketplace purchases, and every artefact the AI tools generate. Teachers organise their own material in folders, share individual items with named colleagues, and see a real storage meter. Admins get a school-wide library view with orphan detection — when a teacher leaves, their school-library material does not leave with them — plus reassignment, bulk download and bulk print.

**What Base44 intended, and what was broken.** `AcademicResource` was the central asset of the product and had **no RLS at all**; `SchoolResourceLibrary.jsx:70` did a bare `.list()` with no filter, so _School A's admin saw School B's resources_. Its tenant key was `school_id`, read from `user?.school_id || 'default'` — a property that did not exist on `User` — so **every resource and folder in the entire product shared one tenant key, the literal string `'default'`**. Sharing was structurally impossible twice over: the colleague picker filtered `u.role === 'teacher'` against a role enum of `['admin','user']` (always empty), and "Shared With Me" filtered an array that had already been narrowed to `uploader_id = me`, so it could only ever show resources you had shared with yourself. Resource identifiers were `Math.random()` 6-digit numbers with no uniqueness check (≈50 % collision probability at ~1,100 resources of one type) despite the schema calling the field "Auto-generated unique ID", and 7 of 15 types shared the `RS` prefix. `print_count` and `view_count` were declared, never incremented, and two UI surfaces ranked by them. `status='orphaned'` was never written by any code, so the entire orphan story — KPI card, red banner, filter, per-row Reassign button — was inert; the Reassign action itself was unreachable (empty teacher list) and its audit call was made with the wrong argument order, writing `user_id: undefined`. Bulk print and download ZIP were `alert()` calls; the admin Export ZIP and Bulk Print buttons had no `onClick` at all. File preview was dead everywhere — three call sites passed `url=` to a component whose prop was `fileUrl`. Storage usage was `Math.min(resources.length / 10, 100)` presented as a percentage of "100 GB free", while `file_size_kb` sat captured on every row, unused. The default-folder seeding effect could duplicate, and folder queries ran with `owner_id: undefined` before the user loaded.

**Done looks like:** one tenant key, one RLS policy set, sequential identifiers that are actually sequential, sharing that the recipient can query, a storage meter that is the sum of real bytes and blocks uploads at the plan limit, and an orphaning path that fires automatically when a membership is removed.

## 2. Roles and permissions

| Action                                         | permission key                      | owner | admin | teacher            | staff | parent | platform    |
| ---------------------------------------------- | ----------------------------------- | ----- | ----- | ------------------ | ----- | ------ | ----------- |
| Upload a resource                              | `resource.write`                    | ✓     | ✓     | ✓                  | —     | —      | —           |
| Read my own resources                          | `resource.read.own`                 | ✓     | ✓     | ✓                  | ✓     | —      | —           |
| Read resources shared with me                  | `resource.read.shared`              | ✓     | ✓     | ✓                  | ✓     | —      | —           |
| Read resources published to the school library | `resource.read.library`             | ✓     | ✓     | ✓                  | ✓     | —      | —           |
| Read **every** resource in the workspace       | `resource.read.any`                 | ✓     | ✓     | —                  | —     | —      | read bypass |
| Edit metadata / move / rename                  | `resource.write`                    | ✓     | ✓     | own or shared-edit | —     | —      | —           |
| Delete (soft)                                  | `resource.delete`                   | ✓     | ✓     | own only           | —     | —      | —           |
| Publish to the school library                  | `resource.publish`                  | ✓     | ✓     | ✓ (own)            | —     | —      | —           |
| Unpublish someone else's library item          | `resource.publish.any`              | ✓     | ✓     | —                  | —     | —      | —           |
| Share with a colleague                         | `resource.share`                    | ✓     | ✓     | ✓ (own)            | —     | —      | —           |
| Download a private file                        | `resource.download` (+ entitlement) | ✓     | ✓     | ✓                  | ✓     | —      | —           |
| Reassign ownership                             | `resource.reassign`                 | ✓     | ✓     | —                  | —     | —      | —           |
| Archive an orphaned resource                   | `resource.archive`                  | ✓     | ✓     | —                  | —     | —      | —           |
| Bulk download (ZIP)                            | `resource.bulk_download`            | ✓     | ✓     | ✓ (own + shared)   | —     | —      | —           |
| Bulk print                                     | `resource.bulk_print`               | ✓     | ✓     | ✓                  | —     | —      | —           |
| See the storage meter                          | `resource.read.own`                 | ✓     | ✓     | ✓                  | ✓     | —      | —           |
| See school-wide storage & library analytics    | `analytics.read`                    | ✓     | ✓     | —                  | —     | —      | ✓           |

Parents never see this module. Staff (non-teaching) can read and download but not create — a librarian or office assistant needs to fetch a handout without being able to publish.

## 3. Data

**Proposed; `docs/architecture/DATA-MODEL.md` wins.** Tenant key is **`workspace_id`** everywhere — this is the single most important correction in this file (PRODUCT-DECISIONS 1.6).

### 3.1 `resources`

| column                                          | type                                                    | notes                                                                               |
| ----------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `id`                                            | uuid pk                                                 |                                                                                     |
| `workspace_id`                                  | uuid not null                                           | tenant key, server-set                                                              |
| `identifier`                                    | text not null                                           | sequential per type per workspace: `WS-000214`. Unique `(workspace_id, identifier)` |
| `resource_type`                                 | `resource_type` enum not null                           | see 3.2                                                                             |
| `title`                                         | text not null                                           |                                                                                     |
| `description`                                   | text null                                               | actually collected in the upload form (Base44 declared it and never asked)          |
| `subject_id`                                    | uuid null → `subjects`                                  |                                                                                     |
| `grade_level_id`                                | uuid null → `grade_levels`                              |                                                                                     |
| `language`                                      | text not null default 'en'                              |                                                                                     |
| `tags`                                          | text[] not null default '{}'                            | a real array, not a JSON string                                                     |
| `file_id`                                       | uuid null → `files`                                     | the primary file; null for a link-only resource                                     |
| `external_url`                                  | text null                                               | Drive/OneDrive link alternative to a file (validated https, no `javascript:`)       |
| `cover_file_id`                                 | uuid null → `files`                                     |                                                                                     |
| `folder_id`                                     | uuid null → `resource_folders`                          | null = root of the owner's tree                                                     |
| `owner_user_id`                                 | uuid not null → `profiles`                              | **current** owner; changes on reassignment                                          |
| `created_by`                                    | uuid not null                                           | original author, immutable                                                          |
| `visibility`                                    | `resource_visibility` enum not null default `'private'` | `private \| shared \| library` — `library` = published to the school                |
| `status`                                        | `resource_status` enum not null default `'active'`      | `active \| orphaned \| archived`                                                    |
| `source`                                        | `resource_source` enum not null default `'upload'`      | `upload \| ai \| marketplace \| template`                                           |
| `ai_generation_id`                              | uuid null → `ai_generations`                            |                                                                                     |
| `marketplace_order_line_id`                     | uuid null                                               | for purchases                                                                       |
| `size_bytes`                                    | bigint not null default 0                               | denormalised from `files` for fast quota maths                                      |
| `print_count` / `download_count` / `view_count` | integer not null default 0                              | **incremented server-side by real actions** (§5.7)                                  |
| `orphaned_at`, `reassigned_at`, `reassigned_by` |                                                         |                                                                                     |
| `created_at`, `updated_at`, `deleted_at`        | timestamptz                                             | soft delete                                                                         |

Indexes: `(workspace_id, owner_user_id, deleted_at, created_at desc)`, `(workspace_id, visibility, deleted_at)`, `(workspace_id, status)` partial on `status='orphaned'`, `(workspace_id, folder_id)`, `(workspace_id, resource_type)`, gin on `tags`, gin on `to_tsvector('simple', title || ' ' || coalesce(description,''))`.

### 3.2 `resource_type` enum and identifier prefixes

Base44 had **two competing taxonomies** — a 15-value `resource_type` enum and a separate 16-value `MATERIAL_TYPES` list imported by four other pages. One list wins, and it is this one. Prefixes are complete: no type falls through to a generic bucket.

| type           | prefix |     | type            | prefix |
| -------------- | ------ | --- | --------------- | ------ |
| `worksheet`    | `WS`   |     | `lab_sheet`     | `LS`   |
| `exam_paper`   | `EP`   |     | `project_work`  | `PJ`   |
| `quiz`         | `QZ`   |     | `resource_pack` | `RP`   |
| `class_test`   | `CT`   |     | `handout`       | `HO`   |
| `homework`     | `HW`   |     | `lesson_plan`   | `LP`   |
| `notes`        | `NT`   |     | `book`          | `BK`   |
| `presentation` | `SL`   |     | `question_bank` | `QB`   |
| `rubric`       | `RB`   |     | `other`         | `RS`   |

(`rubric` is new, from F-TE-04 §4.8; `illustration` files are stored as `other` with an `IL` tag, or gain their own type if DATA-MODEL prefers.)

### 3.3 `resource_folders`

`id`, `workspace_id`, `owner_user_id` not null, `parent_id` uuid null (self-ref), `name` text not null, `color` text null (validated against the design-system palette tokens, not an arbitrary hex), `is_default` boolean default false, `position` integer, timestamps, `deleted_at`.
Unique `(workspace_id, owner_user_id, parent_id, lower(name))` where `deleted_at is null`. Max depth **4**, enforced by a trigger walking the parent chain — an unbounded tree is unbrowsable at 360 px.
Base44's `ResourceFolder.shared_with` column is **dropped**: it was declared and never read or written, and folder-level sharing is not in v1.

### 3.4 `resource_shares`

`id`, `workspace_id`, `resource_id` (cascade), `shared_with_user_id` → `profiles`, `permission` enum `share_permission` (`view | edit`), `shared_by`, `created_at`. Unique `(resource_id, shared_with_user_id)`. A trigger rejects a target who is not an **active** member of the same workspace.

This is a table so the recipient can query it. Base44 stored a JSON string on the resource row, which is why "Shared with me" was structurally impossible.

### 3.5 `id_counters` (shared with F-AC)

`(workspace_id, kind)` → `next_value`. `app.next_id(workspace_id, kind)` takes a transaction-level advisory lock on `hashtext(workspace_id::text || kind)`, increments, and formats per a per-workspace pattern (PRODUCT-DECISIONS 2.6). For resources, `kind` is the type prefix, so worksheets and quizzes have independent sequences.

### 3.6 `resource_bulk_jobs`

`id`, `workspace_id`, `requested_by`, `kind` enum (`zip_download | bulk_print`), `resource_ids` uuid[], `status` enum (`queued | running | ready | failed | expired`), `progress` smallint, `file_id` uuid null (the produced ZIP), `total_bytes` bigint, `error_code`, `expires_at` (24 h), timestamps. Drained by the `jobs` runner.

### 3.7 Storage accounting

`workspace_storage` (materialised, refreshed on every file insert/delete by trigger and reconciled nightly): `workspace_id`, `used_bytes`, `file_count`, `updated_at`. Quota = `plans.storage_gb × 1024³`, or `workspaces.storage_bytes_override` when platform staff have granted more.

`used_bytes` counts **every** `files` row for the workspace, not just resources — avatars, PDFs, syllabus uploads, print renditions — because that is what the school is actually consuming. Soft-deleted resources still count until their files are hard-deleted (30 days), and the meter says so.

### 3.8 Private files

Every resource file lives in the **private** bucket. There is **no public URL**. Download is `GET /api/files/[id]` → policy check (owner, share, library visibility, or entitlement for a purchase) → a 5-minute signed URL → a `file_access_log` row (who, which file, when, IP hash, purpose). Marketplace purchases additionally get buyer-name watermarking at download time (PRODUCT-DECISIONS 4.7) — implemented in F-MK, consumed here.

### 3.9 RLS in words

`resources` SELECT: active member AND (`owner_user_id = me` OR a `resource_shares` row for me OR `visibility='library'` OR `app.has_role(workspace_id,'{owner,admin}')`) AND `deleted_at is null` (a separate policy exposes soft-deleted rows to their owner for restore). INSERT: `{owner,admin,teacher}` with `owner_user_id = me`, `created_by = me`, `workspace_id = app.current_workspace_id()`. UPDATE: owner, share-with-edit, or `{owner,admin}`; WITH CHECK forbids changing `workspace_id`, `created_by`, `identifier`, `size_bytes`, and the three counters (those move only through `SECURITY DEFINER` functions). DELETE: owner or `{owner,admin}`.
`resource_folders`: owner-only read/write, plus `{owner,admin}` read (an admin investigating an orphan needs to see the tree). `resource_shares`: readable by the sharer, the recipient and `{owner,admin}`; writable by the resource's owner and `{owner,admin}`. `resource_bulk_jobs`: requester and `{owner,admin}`.

## 4. Workflows

### 4.1 Upload

1. `/app/resources` → FAB → Upload. A sheet takes: file (drag-drop at ≥1024, file picker on phone, camera-roll allowed), or "link instead" for a Drive URL.
2. **Before the upload starts**, the client asks `resources.quotaCheck({ sizeBytes })`; the server returns remaining bytes. Over quota → the sheet shows "This file is 4.2 MB and you have 1.1 MB left" with an Upgrade link and the file picker resets. **Uploading is blocked, not warned** (PRODUCT-DECISIONS 3.11).
3. Type (defaults inferred from the extension and the source), title (defaults to the filename minus extension), description, subject, grade, tags, folder, language.
4. Upload goes directly to Supabase Storage with a server-issued signed upload URL scoped to a generated path `{workspace_id}/resources/{uuid}/{filename}`; the server then creates the `files` row and the `resources` row in one transaction, calling `app.next_id(workspace_id, prefix)` for the identifier.
5. **Outcome:** a resource with `identifier`, `size_bytes`, `status='active'`, `visibility='private'`. `workspace_storage.used_bytes` increases by trigger.
6. **Audit:** `resource.created`. **No notification.**
7. **Failures:** `QUOTA_EXCEEDED` (pre-checked, and re-checked server-side at row creation because two uploads can race), `FILE_TYPE_BLOCKED` (executables, archives containing executables, `.svg` from user upload is allowed only through the AI path where it is sanitised — an uploaded `.svg` is stored but served with the same hardened headers as F-TE-04 §4.10), `FILE_TOO_LARGE` (per-file cap 50 MB), `UPLOAD_FAILED` (the signed URL expired) → the sheet keeps the metadata and offers Retry with a fresh URL.

### 4.2 Organise

Six default folders are created **once**, idempotently, on a member's first visit to `/app/resources`: Worksheets, Exam Papers, Notes, Handouts, Lesson Plans, Books. Idempotency is a unique index plus an `ON CONFLICT DO NOTHING` insert of all six in one statement — Base44 fired the creation whenever `folders.length === 0`, which could duplicate before invalidation resolved.

Create / rename / recolour / nest / delete. **Deleting a folder never deletes resources**: contents are reparented to the folder's parent (root if none) first, in the same transaction — the one thing Base44 got right here, kept. Moving a resource is a sheet on phone, drag at ≥1024. Depth is capped at 4.

### 4.3 Share with a colleague

Identical model to F-TE-01 §4.5: a sheet listing **active** `workspace_members` with role `teacher|admin|owner|staff`, excluding me, each with a view/edit control. Writes `resource_shares`. Recipient gets notification `resource.shared` and the item appears under their **Shared with me** filter — a query over `resource_shares`, which is the structural fix for the prototype's always-empty tab. Unshare removes the row silently.

### 4.4 Publish to the school library

Trigger: the "Publish to school library" toggle on a resource. Sets `visibility='library'`. Every member with `resource.read.library` can now find and download it; only the owner and admins can edit or unpublish it.

This is the **explicit publish action Base44 never had** — there, admins saw everything automatically because the query had no filter, which is also why there was no tenant isolation. Publishing is a decision, not a side effect.

### 4.5 School library (admin)

`/app/library`. A filterable table of every resource in the workspace with: search, type, subject, grade, owner, status, visibility, date range. KPI tiles: total resources, published to library, orphaned, storage used. Charts: resources by type, uploads per month (both from SQL views, F-TE-07). Actions: open, download, reassign, archive, unpublish, bulk select → ZIP / print.

"Top 10 most printed" is a **real** ranking because `print_count` is incremented by the print action (§5.7); in Base44 it ranked a column nothing ever wrote.

### 4.6 Orphaning on member removal, and reassignment

**Trigger:** a `workspace_members` row transitions to `status='removed'` (PRODUCT-DECISIONS 1.14 — memberships are never deleted).

1. A DB trigger (or a job enqueued by the membership action; the trigger is preferred because it cannot be skipped) sets `status='orphaned'`, `orphaned_at=now()` on **every** resource in that workspace where `owner_user_id` = the removed user **and** `visibility='library'` or the resource was created inside the school workspace. Personal-workspace resources are untouched (PRODUCT-DECISIONS 3.7).
2. The removed user's `resource_shares` rows granting _them_ access are deleted; shares they granted to others survive (the material stays useful).
3. Notification `resources.orphaned` to owners and admins: "14 resources need a new owner", `action_url=/app/library?status=orphaned`.
4. A **red banner** on `/app/library` persists until the count is zero.
5. Admin selects resources → **Reassign** → picks an active member → `resources.reassign` sets `owner_user_id`, `status='reassigned'`→ then immediately `'active'` (the prototype's three-state enum kept `reassigned` as a terminal state, which meant a twice-reassigned resource had no distinct state; here `reassigned_at`/`reassigned_by` carry the history and `status` returns to `active`), and writes an audit event with the correct argument order — `logAudit(actor, 'resource.reassigned', 'resources', id, {before}, {after})`. Base44's call site passed the action as the actor and an object as the entity type.
6. Or **Archive**: `status='archived'`, hidden from normal views, retained, still counted in storage.
7. **Failure:** reassigning to a non-active member returns `MEMBER_NOT_ACTIVE`; the picker cannot offer one because it is fed from `workspace_members`, not a users table with the wrong enum.

### 4.7 Download and preview

- **Preview** opens in a `FileViewer` (PDF via an embedded viewer, images inline, SVG via `<img>` with the hardened headers, Office documents fall back to "download to view"). The viewer takes **one** prop name, `fileId`, and resolves the URL itself — removing the class of bug that killed every preview in the prototype (three call sites passing `url=` to a `fileUrl=` prop).
- **Download** → `/api/files/[id]` → policy check → signed URL → `file_access_log` → `download_count` increment.
- A link-only resource (`external_url`) opens in a new tab with `rel="noopener noreferrer"`; the UI labels it "Opens Google Drive" so nobody expects a preview. Base44 passed `undefined` to its viewer for Drive-only books.

### 4.8 Bulk download as ZIP

1. Select resources (checkbox on each card/row; a "select all on this page" control). "Download as ZIP".
2. Pre-flight: total bytes ≤ **500 MB** and count ≤ **200**; over either, the action explains which limit and asks the user to narrow the selection.
3. `resources.startBulkDownload` creates a `resource_bulk_jobs` row `queued` and returns immediately. **This is a job, not a request** — zipping 200 PDFs cannot live inside a serverless request.
4. The job runner streams each file from storage into a ZIP written back to the private bucket, updating `progress`. Entitlement is re-checked **per file** inside the job, using the requester's context — a user cannot widen their access by bulk-selecting.
5. On completion: `status='ready'`, `file_id` set, notification `resource.zip_ready` with a download link valid until `expires_at` (24 h). The download itself is a signed URL, logged like any other.
6. Failures: `TOO_LARGE`, `TOO_MANY`, a per-file access failure (the file is **skipped** and listed in a `manifest.txt` inside the ZIP rather than failing the whole job), storage errors → `failed` with `error_code` and a Retry.
7. Expired jobs are purged nightly along with their ZIPs, so the archive does not quietly eat the school's quota. **ZIP artefacts do not count against the workspace quota** while they exist (they are ours, not the school's) — they are stored under a `system/` prefix excluded from `workspace_storage`.

### 4.9 Bulk print

Selection → "Send to print queue" → creates one `print_jobs` row per resource (F-OP-04) with `copies` defaulting to 1, or to the enrolled count of a chosen section when the user picks "one per student" (PRODUCT-DECISIONS 2.8). Each resource's `print_count` increments. A confirmation sheet shows "12 documents, 384 pages, 1 copy each" before committing — because in a school, a mis-tap here costs paper.

### 4.10 Storage meter

A card on `/app/resources` and `/app/library`: a bar, "3.2 GB of 10 GB used", the largest 5 files, and how much is recoverable from the recycle bin. At ≥90 % the bar turns amber with "You're nearly out of space"; at 100 % uploads are blocked with an Upgrade link. **Every number is `sum(files.size_bytes)`** — the prototype's meter was `resources.length / 10`.

### 4.11 Phone flow, explicitly

- `/app/resources` is a **`DataList` of cards**: type icon, title, identifier, size, folder chip, sharing indicator. A horizontally scrollable folder chip row sits above it (root + folders), which is far better at 360 px than a tree.
- The folder **tree** exists only at ≥1024 as a left rail; on phone, tapping a folder chip filters, and a "Manage folders" sheet handles create/rename/nest.
- Filters (type, subject, grade, tags) are a **sheet** reached from a filter button showing an active-count badge.
- Upload is a **sheet**; the file picker is the first control, and the metadata fields appear after a file is chosen so the teacher is not filling a form before knowing the upload is even possible.
- Selection mode: long-press a card enters it, a top bar shows "3 selected" with ZIP / Print / Move / Delete; the bar's actions are within the thumb arc at the bottom on phone, not the top.
- `/app/library` on phone is a card list sorted by "needs attention" (orphaned first), with the orphan banner pinned.

## 5. Business rules and calculations

**5.1 Tenant key.** `workspace_id`, on `resources`, `resource_folders`, `resource_shares`, `resource_bulk_jobs`, `files`. No `school_id` column exists anywhere in this feature.

**5.2 Identifier generation.** `identifier = app.next_id(workspace_id, prefix)` → `{PREFIX}-{value zero-padded to 6}`, e.g. `WS-000214`. Sequences are per workspace per prefix, advisory-locked, gapless under concurrency, and **never random**. Format is overridable per workspace via the `id_counters` pattern (PRODUCT-DECISIONS 2.6). A resource's identifier is immutable after creation, including through reassignment — it is how a printed worksheet is referred to in a staffroom.

**5.3 Storage quota.** `quota_bytes = coalesce(workspaces.storage_bytes_override, plans.storage_gb × 1073741824)`. `used_bytes = sum(files.size_bytes)` for the workspace, excluding the `system/` prefix. Upload is refused when `used_bytes + new_file_bytes > quota_bytes`, checked **twice**: optimistically before upload (for a good message) and authoritatively inside the row-creation transaction (for correctness under concurrent uploads). Per-file cap 50 MB; per-syllabus-PDF cap 20 MB (F-TE-02).

**5.4 Trial expiry and over-limit data.** Per PRODUCT-DECISIONS 5.2, data over a plan's limits becomes **read-only, never deleted**. Over quota: uploads and ZIP jobs are blocked; downloads, previews, sharing and printing continue. The banner names the exact overage.

**5.5 Orphaning scope.** Only resources whose `owner_user_id` is the removed member **and** whose workspace is a `school` workspace. A teacher's personal-workspace resources are untouched and follow them. Resources they had shared to colleagues keep working; the share rows survive orphaning so a class does not lose its handout the day a teacher resigns.

**5.6 Reassignment does not change authorship.** `created_by` is immutable; `owner_user_id` moves. The library shows both ("Created by S. Rahman · now owned by F. Akter"), which is what an audit actually needs.

**5.7 Counters are server-side and specific.**

- `download_count` +1 per successful signed-URL issue through `/api/files/[id]` with `purpose='download'` (not per preview).
- `view_count` +1 per preview open, deduplicated per user per resource per hour.
- `print_count` +1 per `print_jobs` row created for that resource (bulk print increments each selected resource once, regardless of copies).
  All three increment through `SECURITY DEFINER` functions; RLS forbids clients from writing them, which is why they can be trusted in a ranking.

**5.8 Bulk limits.** ZIP: ≤200 resources, ≤500 MB total, ≤2 concurrent jobs per user, output expires in 24 h. Bulk print: ≤100 resources per submission.

**5.9 Soft delete and the recycle bin.** `deleted_at` set; hidden from every list; visible in `/app/resources/trash` for **30 days**; restorable; after 30 days a nightly job hard-deletes the row and its storage objects and decrements `workspace_storage`. Files still counted in the meter while in the bin, and the meter says "1.4 GB recoverable".

**5.10 Marketplace purchases** arrive here with `source='marketplace'`, `visibility='private'`, an entitlement-backed download path, and **do not count against the buyer's storage quota** (they are the seller's bytes, delivered under licence). A school-funded purchase is owned by the workspace: `owner_user_id` is set to the approving admin but the entitlement belongs to the workspace, so it survives that admin leaving (PRODUCT-DECISIONS 4.6) — and orphaning explicitly skips `source='marketplace'` rows.

**5.11 File type policy.** Allowed: pdf, doc(x), xls(x), ppt(x), odt/ods/odp, txt, md, csv, png, jpg, webp, gif, svg, mp3, mp4 (≤50 MB), zip **only when created by our own bulk job**. Blocked: exe, msi, bat, cmd, sh, js, jar, apk, user-uploaded zip/rar/7z. MIME is verified from magic bytes server-side, not from the browser-supplied `Content-Type` or the extension.

**5.12 Search** is Postgres full-text over `title || description` plus a `tags` array match, scoped by RLS. No client-side filtering of whole tables (ARCHITECTURE §6).

## 6. UI

| Screen          | Route                              | 360×800                                                                 | ≥1024                                         | Primary      | Empty                                                                          | Loading                                  | Error                                                      |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- | ------------ | ------------------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------- |
| My resources    | `/app/resources`                   | Storage card · folder chip row · filter button · `DataList` cards · FAB | Left folder tree · table · right preview pane | Upload       | "Nothing here yet. Upload a worksheet, or generate one with AI." (two buttons) | Storage card skeleton + 6 card skeletons | Inline `Alert`, last good list retained                    |
| Shared with me  | `/app/resources?filter=shared`     | Same list, owner chip on each card                                      | Same                                          | —            | "No one has shared anything with you yet."                                     | Skeletons                                | Inline                                                     |
| Trash           | `/app/resources/trash`             | Cards with "deleted 3 days ago" + Restore                               | Table                                         | Restore      | "Nothing deleted."                                                             | Skeletons                                | Inline                                                     |
| Upload          | sheet                              | File first, then metadata; quota line under the picker                  | Dialog with drag-drop                         | Upload       | n/a                                                                            | Determinate progress bar per file        | Inline; metadata retained on retry                         |
| Resource detail | `/app/resources/[id]`              | Preview, metadata, actions stack                                        | Two-column                                    | Download     | n/a                                                                            | Preview skeleton                         | "Preview unavailable — download to view"                   |
| Manage folders  | sheet                              | List with rename/colour/nest/delete                                     | Inline in the tree                            | New folder   | "No folders yet."                                                              | Skeletons                                | Inline                                                     |
| School library  | `/app/library`                     | Orphan banner · KPI tiles (2×2) · filter sheet · cards                  | KPI row · charts · full table                 | Reassign     | "No resources in the school library yet."                                      | Skeletons                                | Inline                                                     |
| Reassign        | sheet                              | Member list + confirm                                                   | Dialog                                        | Reassign     | "No active members to reassign to."                                            | Skeletons                                | `MEMBER_NOT_ACTIVE` inline                                 |
| Bulk job        | toast → `/app/resources/jobs/[id]` | Progress card with per-file count                                       | Same                                          | Download ZIP | n/a                                                                            | Determinate progress                     | `Alert` + Retry; partial ZIP still offered with a manifest |

Components: `DataList`, `DataTable`, `FileDropzone`, `FileViewer` (single `fileId` prop), `StorageMeter`, `FolderChips`, `FolderTree`, `FilterSheet`, `SelectionBar`, `ProgressCard`, `KpiTile`, `BarList`, `EmptyState`, `ErrorState`, `AlertDialog`.

## 7. Server contracts

| Name                                                                       | Input                                                                                                                                | Output                                                              | Errors                                                  | Idempotency                | Rate limit     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------- | -------------- |
| `resources.list`                                                           | `{ filter: 'mine'\|'shared'\|'library'\|'all'\|'trash', folderId?, type?, subjectId?, gradeLevelId?, tags?, q?, cursor, limit<=50 }` | `{ items, nextCursor, folderBreadcrumb }`                           | `FORBIDDEN`                                             | —                          | 120/min        |
| `resources.get`                                                            | `{ id }`                                                                                                                             | detail + shares + folder path                                       | `NOT_FOUND`                                             | —                          | 240/min        |
| `resources.quotaCheck`                                                     | `{ sizeBytes }`                                                                                                                      | `{ allowed, remainingBytes, quotaBytes }`                           | —                                                       | —                          | 120/min        |
| `resources.createUploadUrl`                                                | `{ filename, sizeBytes, mimeType }`                                                                                                  | `{ uploadUrl, path, expiresAt }`                                    | `QUOTA_EXCEEDED`, `FILE_TOO_LARGE`, `FILE_TYPE_BLOCKED` | key                        | 60/min         |
| `resources.create`                                                         | `ResourceCreateInput` `{ path?, externalUrl?, type, title, description?, subjectId?, gradeLevelId?, tags?, folderId?, language }`    | `Resource` (with `identifier`)                                      | `QUOTA_EXCEEDED`, `VALIDATION`, `FORBIDDEN`             | key **required**           | 60/min         |
| `resources.update`                                                         | `{ id, ...metadata }`                                                                                                                | `Resource`                                                          | `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`                    | key                        | 120/min        |
| `resources.move`                                                           | `{ ids[], folderId }`                                                                                                                | `{ moved: n }`                                                      | `FORBIDDEN`, `FOLDER_DEPTH`                             | key                        | 60/min         |
| `resources.setVisibility`                                                  | `{ id, visibility }`                                                                                                                 | `Resource`                                                          | `FORBIDDEN`                                             | key                        | 60/min         |
| `resources.share` / `.unshare`                                             | `{ id, targets[] }` / `{ id, userId }`                                                                                               | shares                                                              | `MEMBER_NOT_ACTIVE`                                     | key                        | 30/min         |
| `resources.delete` / `.restore`                                            | `{ ids[] }`                                                                                                                          | `{ n }`                                                             | `FORBIDDEN`                                             | key                        | 30/min         |
| `resources.reassign`                                                       | `{ ids[], toUserId }`                                                                                                                | `{ n }`                                                             | `MEMBER_NOT_ACTIVE`, `FORBIDDEN`                        | key **required**           | 30/min         |
| `resources.archive`                                                        | `{ ids[] }`                                                                                                                          | `{ n }`                                                             | `FORBIDDEN`                                             | key                        | 30/min         |
| `resources.startBulkDownload`                                              | `{ ids[] (≤200) }`                                                                                                                   | `{ jobId }`                                                         | `TOO_MANY`, `TOO_LARGE`, `CONCURRENT_LIMIT`             | key **required**           | 5/hour         |
| `resources.bulkPrint`                                                      | `{ ids[] (≤100), copies \| perStudentSectionId }`                                                                                    | `{ printJobIds[] }`                                                 | `FORBIDDEN`, `TOO_MANY`                                 | key **required**           | 20/hour        |
| `resources.job`                                                            | `{ jobId }`                                                                                                                          | job row                                                             | `NOT_FOUND`                                             | —                          | 120/min (poll) |
| `folders.list` / `.create` / `.rename` / `.recolour` / `.move` / `.delete` | …                                                                                                                                    | folders                                                             | `FOLDER_DEPTH`, `NAME_TAKEN`, `FORBIDDEN`               | key on writes              | 60/min         |
| `folders.ensureDefaults`                                                   | `{}`                                                                                                                                 | `{ created: n }`                                                    | —                                                       | idempotent by unique index | 10/min         |
| `library.list`                                                             | `{ ...filters, ownerId?, status?, cursor }`                                                                                          | rows + KPI counts                                                   | `FORBIDDEN`                                             | —                          | 60/min         |
| `storage.summary`                                                          | `{}`                                                                                                                                 | `{ usedBytes, quotaBytes, fileCount, largest[], recoverableBytes }` | —                                                       | —                          | 60/min         |
| `GET /api/files/[id]`                                                      | `?purpose=download\|preview`                                                                                                         | 302 to a 5-min signed URL                                           | `FORBIDDEN`, `NOT_FOUND`, `GONE`                        | —                          | 120/min        |

## 8. Parts (build chunks)

**Part 1 — Schema, RLS, identifiers (≤2 days).**
Scope: every table in §3, the `resource_type` enum with complete prefixes, `app.next_id` for resource kinds, folder depth trigger, share active-member trigger, counters as `SECURITY DEFINER` functions with client writes revoked, `workspace_storage` trigger, RLS for all five tables.
Tests: pgTAP — cross-workspace SELECT returns 0 (a direct regression test for the prototype's bare `.list()`); a teacher cannot SELECT an unshared, unpublished colleague resource; a client cannot UPDATE `identifier`, `size_bytes`, `print_count`, `download_count` or `view_count`; folder depth 5 is rejected; 500 concurrent `next_id` calls produce 500 distinct gapless identifiers.
**Demo:** the concurrency test output showing zero duplicate identifiers — the direct answer to the prototype's `Math.random()` generator.

**Part 2 — Upload, quota, files (≤2 days).**
Scope: signed upload URLs, magic-byte MIME verification, type allow-list, per-file cap, the double quota check, `resources.create` transaction, `StorageMeter`, the 90 %/100 % states, `/api/files/[id]` with signed URLs and `file_access_log`.
Tests: two concurrent uploads that individually fit but jointly exceed quota — exactly one succeeds; a `.exe` renamed to `.pdf` is rejected by magic bytes; a signed URL expires and cannot be reused; the access log records every issue.
**Demo:** fill a 1 GB test quota to 100 % and show uploads blocked while downloads still work.

**Part 3 — Browse, folders, metadata (≤2 days).**
Scope: `/app/resources` list with cursor pagination and server-side filtering, folder chips (phone) and tree (desktop), default-folder idempotent seeding, create/rename/recolour/nest/delete with reparenting, move, edit metadata, full-text search, soft delete + trash + restore + the 30-day purge job.
Tests: seeding twice creates six folders, not twelve; deleting a folder with 20 resources reparents all 20 and deletes none; search ranks title over description; trash purge decrements storage.
**Demo:** organise 30 resources into a 3-deep tree on a 360 px viewport.

**Part 4 — Sharing and library publishing (≤1 day).**
Scope: `resource_shares`, the member picker from `workspace_members`, "Shared with me" as a real query, publish/unpublish to library, notifications.
Tests: the recipient's list returns the resource **only** via the share table; a share to a removed member is rejected; publishing makes it visible to `resource.read.library` holders and to nobody in another workspace.
**Demo:** teacher A shares one resource and publishes another; teacher B sees exactly those two and nothing else of A's.

**Part 5 — Preview and download (≤1 day).**
Scope: `FileViewer` with a single `fileId` prop (PDF, image, SVG-hardened, fallback), download path with counters, link-only resources labelled and opened safely.
Tests: every call site of `FileViewer` passes `fileId` (enforced by types — the prop-name bug is now a compile error); an SVG resource is served with the hardened headers; `download_count` increments once per download and not on preview; `view_count` dedupes within an hour.
**Demo:** open a PDF, an image, an SVG and a Drive link from the same list and see four correct behaviours.

**Part 6 — School library, orphaning, reassignment (≤2 days).**
Scope: `/app/library` with filters and KPI tiles, the membership-removal trigger that orphans resources, the notification and persistent banner, reassign and archive with correctly-ordered audit calls, marketplace-source exclusion, personal-workspace exclusion.
Tests: removing a member orphans exactly their school-library resources and none of their personal ones, none of their marketplace purchases, and no other member's; reassigning to an inactive member is rejected; the audit event has the actor in the actor position (a direct regression test for the prototype's argument-order bug); the orphan KPI is non-zero when it should be.
**Demo:** remove a teacher and watch 14 resources become orphaned, the banner appear, and a reassignment clear it.

**Part 7 — Bulk ZIP and bulk print (≤2 days).**
Scope: `resource_bulk_jobs`, the job runner streaming into a ZIP, per-file re-entitlement, `manifest.txt` for skipped files, progress, 24 h expiry and purge, the `system/` storage exclusion, bulk print with the copies confirmation and per-resource `print_count`.
Tests: a selection containing one resource the user lost access to mid-job produces a ZIP without it and a manifest naming it; 201 resources is rejected; two concurrent jobs allowed, a third rejected; expired ZIPs are purged and do not count against quota.
**Demo:** ZIP 60 files as a background job, download it, and confirm the school's storage meter did not move.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7. Parts 4 and 5 may run in parallel after 3.

## 9. Acceptance criteria

1. **Given** resources in school A, **when** an admin of school B loads the library, **then** zero rows are returned — the exact cross-tenant leak the prototype shipped.
2. **Given** no `school_id` anywhere, **when** any resource is created, **then** its `workspace_id` comes from the verified `WorkspaceContext` and never from client input.
3. **Given** 500 concurrent worksheet creations in one workspace, **when** they complete, **then** there are 500 distinct identifiers `WS-000001`…`WS-000500` with no duplicates and no gaps.
4. **Given** a quiz and a worksheet created in sequence, **when** their identifiers are read, **then** they are `QZ-000001` and `WS-000001` — independent sequences per type.
5. **Given** an identifier assigned at creation, **when** the resource is reassigned or moved, **then** the identifier is unchanged.
6. **Given** a workspace at 9.8 GB of a 10 GB quota, **when** I upload a 400 MB file, **then** the upload is refused before it starts with the exact remaining space quoted.
7. **Given** two uploads of 300 MB each with 400 MB remaining, **when** both are submitted concurrently, **then** exactly one is committed and the other returns `QUOTA_EXCEEDED`.
8. **Given** the storage meter, **when** it renders, **then** the number equals `sum(files.size_bytes)` for the workspace and changes when a file is deleted.
9. **Given** an `.exe` renamed to `.pdf`, **when** it is uploaded, **then** magic-byte verification rejects it.
10. **Given** teacher B has not been shared a resource and it is not published, **when** B requests it by id, **then** B gets not-found and no signed URL is issued.
11. **Given** a resource shared with teacher B as `view`, **when** B opens "Shared with me", **then** it appears — returned by a query over `resource_shares`, not a filter over B's own uploads.
12. **Given** teacher B is removed from the workspace, **when** B requests a previously shared file, **then** the download is refused on the next request.
13. **Given** a resource published to the library, **when** any active member searches, **then** they find it and can download it; when an admin unpublishes it, it disappears from their view.
14. **Given** a teacher's membership becomes `removed`, **when** the trigger runs, **then** every school-library resource they owned has `status='orphaned'` and `orphaned_at` set, their personal-workspace resources are unchanged, and their marketplace purchases are unchanged.
15. **Given** orphaned resources exist, **when** an admin opens the library, **then** the red banner shows the exact count and the orphan filter returns exactly those rows.
16. **Given** an orphaned resource, **when** an admin reassigns it to an active teacher, **then** `owner_user_id` changes, `created_by` does not, `status` returns to `active`, and an `audit_events` row records actor, table, row id, before and after **in the correct fields**.
17. **Given** a reassignment target who is a `pending` member, **when** the admin confirms, **then** the server returns `MEMBER_NOT_ACTIVE` and the picker never offered them.
18. **Given** a folder containing 20 resources, **when** the folder is deleted, **then** all 20 resources still exist, reparented to the folder's parent.
19. **Given** a first visit to `/app/resources`, **when** the page loads twice quickly, **then** exactly six default folders exist.
20. **Given** a folder at depth 4, **when** I try to nest another inside it, **then** I get `FOLDER_DEPTH`.
21. **Given** any file preview, **when** the viewer is opened, **then** it renders — there is no prop-name mismatch, and a wrong prop name fails the TypeScript build.
22. **Given** a download, **when** it completes, **then** `download_count` is +1, a `file_access_log` row exists, and the signed URL is dead after 5 minutes.
23. **Given** a preview opened three times in one hour by the same user, **when** counters are read, **then** `view_count` increased by exactly 1.
24. **Given** a bulk print of 12 resources with "one per student" for a section of 32, **when** it commits, **then** 12 `print_jobs` rows exist with 32 copies each and each resource's `print_count` is +1.
25. **Given** a ZIP job for 60 files, **when** it completes, **then** a notification links to a ZIP whose signed URL works, and `workspace_storage.used_bytes` is unchanged.
26. **Given** a ZIP job where one file's access is revoked mid-run, **when** it completes, **then** the ZIP omits that file and `manifest.txt` names it.
27. **Given** a ZIP job older than 24 hours, **when** the purge job runs, **then** the ZIP is deleted and the job is `expired`.
28. **Given** 201 selected resources, **when** I request a ZIP, **then** I get `TOO_MANY` with the limit stated.
29. **Given** a soft-deleted resource, **when** 30 days pass, **then** the row and its storage object are hard-deleted and the storage meter drops.
30. **Given** the "Top 10 most printed" list, **when** it renders, **then** it is ordered by a counter that real print actions incremented — not a column nothing writes.

## 10. Tests

- **Unit (`packages/domain`):** `formatIdentifier(prefix, n)`, `canAccessResource(role, resource, shares)`, `quotaAllows()`, `folderDepth()`, `mimeFromMagicBytes()`, `bulkLimits()`, `orphanScope(membership, resource)`.
- **DB (pgTAP):** isolation + escalation on `resources`, `resource_folders`, `resource_shares`, `resource_bulk_jobs`; immutability of `identifier`/`created_by`/`workspace_id`/counters; the `next_id` concurrency test (500 sessions); the orphaning trigger's scope; folder-delete reparenting; default-folder idempotency; `workspace_storage` trigger accuracy against a hand-computed fixture.
- **Integration:** upload with quota races; signed-URL expiry and reuse; share/unshare with membership transitions mid-flight; reassignment audit shape; bulk job with a mid-run access revocation; the 30-day purge.
- **e2e (360×800 + 1280×800, axe):** J1 upload→organise→share→download; J2 quota full; J3 two-user share visibility; J4 remove a member → orphan banner → reassign; J5 bulk ZIP; J6 bulk print with per-student copies; J7 trash and restore.
- **Security:** `appsec-review` over the upload and download routes; a test that no resource file is ever reachable without a policy check; SVG serving headers; `rel="noopener"` on external links; path-traversal attempts in filenames rejected.
- **a11y:** selection mode is keyboard-operable and announces the selected count; the storage meter exposes its value as text, not only as a bar; file cards have accessible names including type and size.
- **Performance budgets:** `resources.list` p95 < 250 ms for 5,000 resources; search p95 < 400 ms; `storage.summary` p95 < 150 ms; ZIP job throughput ≥ 5 MB/s.

## 11. Open questions

1. **Folder sharing.** Dropped from v1 (Base44 declared `ResourceFolder.shared_with` and never used it). Default assumed: item-level sharing only.
2. **Versioning a resource.** Replacing a file currently replaces it. A version history is a real teacher need ("this is the 2026 edition of last year's paper") but a distinct feature. Default assumed: no versions; re-upload as a new resource.
3. **Does the school library need a separate "department" grouping?** Base44's Enterprise dashboard bucketed by `User.department`, mapped from `CustomLabel`. PRODUCT-DECISIONS 1.4 makes labels display-only. Default assumed: filter by subject and owner, not by department.
4. **Do marketplace purchases count against quota?** Default assumed **no** (§5.10). If the owner wants them counted, it is a one-line change to the `workspace_storage` trigger's filter — but it would make buying material feel like a punishment.
5. **Per-teacher storage sub-quotas.** Not in v1; the workspace quota is shared. A single teacher can consume a school's space, and the "largest 5 files" list is the mitigation.
6. **ZIP size ceiling.** 500 MB is a guess based on job-runner memory. Should be re-derived once the runner's real limits are known; the constant lives in `packages/domain/limits.ts`.
7. **Book library as a separate concept.** Base44 had `SchoolBook` (title, author, publisher, cover, Drive link) alongside `AcademicResource`. This spec folds it into `resources` with `resource_type='book'` and the publisher/author captured as tags. If schools want a proper catalogue (ISBN, copies, lending), that is its own feature. Default assumed: folded in.
