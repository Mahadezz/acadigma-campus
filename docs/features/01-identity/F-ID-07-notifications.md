# F-ID-07 — Notifications

|                  |                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | auth                                                                                                                                                                                                                                                                                                                   |
| Status           | in-progress — v1 event catalogue (`packages/domain/src/notifications/catalog.ts`), contracts mirror and the CI parity test landed (`feat/m0-settings-notifications`); `notification_event_catalog` migration, catalogue-aware `app.notify`, RLS and pgTAP not started. See `docs/test-reports/2026-09-17-M0-gates.md`. |
| Owner branch     | `feat/identity-notifications`                                                                                                                                                                                                                                                                                          |
| Depends on       | F-ID-01, F-ID-02, F-ID-03                                                                                                                                                                                                                                                                                              |
| Plan             | `docs/plan/ROADMAP.md` chunk 2                                                                                                                                                                                                                                                                                         |
| Base44 reference | `docs/reference/base44-inventory/01-auth-tenancy-personal.md` §3 rows 19, 22, 29; §5.1 B3; §5.2 D7; §5.3 W3, W4, W5, W7; PRODUCT-DECISIONS §1.11                                                                                                                                                                       |

## 1. Purpose

The product's nervous system. Something happens somewhere in a school — a teacher requests to join, a print job finishes, a class drops below 75 % attendance, a marketplace sale lands, a document request arrives — and the right person learns about it, on the right channel, with one tap that takes them to the exact screen where they can act. This feature owns the **event taxonomy** every other area emits into, the in-app notification centre, realtime delivery, per-user preferences, and the hooks that push and email hang off. "Done" from the user's chair: a principal's phone shows a badge on the bell; tapping it shows "Nusrat Jahan asked to join Ideal School" with an Approve shortcut; tapping the row opens the pending tab already filtered; and she can turn off marketplace noise without losing attendance alerts.

The Base44 prototype had a `Notification` entity, a bell, and a dashboard widget, and none of the three agreed with each other. The centre rendered `n.body` while the schema field was `message`, so **every notification showed a title and nothing else** (W3). Its `typeConfig` icon keys (`print_ready`, `attendance_anomaly`, `exam_reminder`…) intersected the schema's enum (`info`, `warning`, `marketplace`, `billing`…) in **exactly zero places**, so every row got the generic alert icon (W4). `action_url` existed on the schema and was never used, so notifications were not clickable at all. Every writer set `school_id: user?.school_id || 'default'` against a field that does not exist on the user schema, while the dashboard widget filtered by `activeWorkspaceId` — so the widget was **permanently empty** and every notification in the entire platform landed in one shared pseudo-tenant (W5, row 19). The five notification switches in Settings were `<Switch defaultChecked />` with no handler (B3); the personal-settings switches wrote five `notif_*` fields that did not exist (W7); and `UserPreferences`, the entity designed for exactly this, had zero references in the codebase (D7). The rebuild fixes the taxonomy first, because the taxonomy is what everything else in the product will code against.

## 2. Roles and permissions

| Action                                 | Recipient (self)                      | Workspace owner/admin                                                        | Any member | Server / system                    | Platform staff               |
| -------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- | ---------- | ---------------------------------- | ---------------------------- |
| Read my notifications                  | ✅                                    | —                                                                            | —          | —                                  | —                            |
| Mark read / unread / mark all read     | ✅                                    | —                                                                            | —          | —                                  | —                            |
| Archive / delete my notification       | ✅                                    | —                                                                            | —          | —                                  | —                            |
| Read someone else's notifications      | ❌ — nobody, including platform staff |                                                                              |            |                                    |                              |
| Create a notification                  | ❌                                    | ❌                                                                           | ❌         | ✅ only (SECURITY DEFINER emitter) | ❌                           |
| Read/write my notification preferences | ✅                                    | —                                                                            | —          | —                                  | —                            |
| Send a workspace-wide announcement     | —                                     | ✅ (messaging area owns the feature; it emits `announcement.published` here) | —          | —                                  | —                            |
| Send a platform-wide broadcast         | —                                     | —                                                                            | —          | —                                  | ✅ `platform.broadcast.send` |
| Register / revoke a push device        | ✅                                    | —                                                                            | —          | —                                  | —                            |

**No client may ever insert into `notifications`.** Every row comes from `app.notify(...)`, a `SECURITY DEFINER` function called by triggers, server actions and jobs. This is the same reasoning as DECISION-LOG D-05 for audit: a client can skip a call it is asked to make.

## 3. Data

Tenant key: `notifications.workspace_id` — **nullable**, because account-level events (`account.deletion_scheduled`, `auth.new_device_signin`) belong to a person, not a tenant. Columns **proposed; DATA-MODEL.md wins**.

### `notifications`

| column                              | type                         | notes                                                                                       |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `id`                                | uuid PK                      |                                                                                             |
| `user_id`                           | uuid not null FK profiles    | the recipient; fan-out writes one row per recipient                                         |
| `workspace_id`                      | uuid null FK workspaces      | null = account-level                                                                        |
| `event`                             | text not null                | the **event type**, e.g. `attendance.low` — the primary taxonomy (PRODUCT-DECISIONS §1.11)  |
| `category`                          | enum `notification_category` | **derived** from `event` by `app.notification_category(text)`; never supplied by the caller |
| `priority`                          | enum `notification_priority` | `low \| normal \| high` — drives push and the digest                                        |
| `title`                             | text not null                | already localised at render time from `event` + `data`, not stored pre-translated (see §5)  |
| `body`                              | text                         | the **single** body column — the prototype's `message`/`body` split is gone (W3)            |
| `action_url`                        | text not null                | every notification is clickable (PRODUCT-DECISIONS §1.11)                                   |
| `data`                              | jsonb                        | typed per event; used to render the title/body in the user's language                       |
| `actor_id`                          | uuid null                    | who caused it, for "Nusrat approved your request"                                           |
| `subject_type` / `subject_id`       | text / uuid                  | the row it is about, for deduping and deep links                                            |
| `dedupe_key`                        | text null                    | e.g. `attendance.low:section:{id}:2026-09`                                                  |
| `group_key`                         | text null                    | collapses "3 new join requests" into one row in the UI                                      |
| `read_at`, `seen_at`, `archived_at` | timestamptz                  | `seen_at` clears the badge; `read_at` is the explicit action                                |
| `expires_at`                        | timestamptz null             | ephemeral notices (e.g. `print.ready`) age out of the list                                  |
| `created_at`                        | timestamptz                  |                                                                                             |

Indexes: `(user_id, read_at nulls first, created_at desc)` for the centre; partial `(user_id) where read_at is null` for the badge count; unique `(user_id, dedupe_key) where dedupe_key is not null and created_at > now() - interval '1 day'` — expressed as a unique index on `(user_id, dedupe_key, dedupe_bucket_date)`; `(workspace_id, created_at desc)`.

### `notification_preferences`

`user_id` · `workspace_id` null (null = the user's default for every workspace) · `category` enum · `in_app boolean default true` · `push boolean default true` · `email boolean default true` · `updated_at`. PK `(user_id, coalesce(workspace_id,'0000…'), category)`. Global channel master switches live in `user_preferences.notification_channels` (F-ID-02 §3); this table is the per-category override.

### `device_registrations`

Defined in F-ID-01 §3; this feature reads `push_token` and `platform` for delivery and writes `revoked_at` when a push provider reports an invalid token.

### `notification_digests` (proposed)

`id` · `user_id` · `period enum(daily|weekly)` · `window_start`, `window_end` · `notification_count` · `sent_at` · `email_log_id`. Prevents double-sending a digest.

### `email_log` / `push_log`

One row per send attempt with the provider's message id, the status and the failure reason. `push_log` is added by this feature; `email_log` already exists (ARCHITECTURE §5).

**`push_log` is the delivery ledger [R1, T-04].** Every row tracks the full lifecycle — `status enum(queued|sent|delivered|failed|skipped_quiet_hours)`, `queued_at`, `sent_at`, `delivered_at` (from the push service's delivery receipt where the platform provides one; null where it does not, and the row stays at `sent`), `opened_at` (set when the resulting notification's `read_at`/`seen_at` fires from that push's `action_url`), `failure_reason`. This is what "≥ 99% measured notification delivery" (ROADMAP.md R1-launch exit criterion) is measured against, and it is what lets an owner ask "did this actually reach people" instead of trusting a client-side toast.

### RLS, in words

- `notifications` **select**: `user_id = app.current_user_id()`. That is the whole policy. There is **no** owner policy, no admin policy and **no platform-admin policy** — a notification can quote a student's name or a salary figure, and nobody should be able to read another person's inbox to find out.
- `notifications` **insert**: **no grant to any role.** Rows are written only by `app.notify(...)` (SECURITY DEFINER, `search_path` pinned).
- `notifications` **update**: `user_id = app.current_user_id()`, and a trigger restricts the updatable columns to `read_at`, `seen_at`, `archived_at`. A recipient cannot rewrite a notification's title, event or action URL.
- `notifications` **delete**: the recipient may delete their own rows; the retention job deletes old ones under the service role.
- `notification_preferences`: full CRUD by the row owner only; no other reader.
- **Realtime**: the `notifications` table is added to the realtime publication with RLS enforced, so a browser subscription filtered by `user_id = auth.uid()` receives only that user's rows. The filter is a convenience; RLS is the boundary.

Private files: none.

## 4. Workflows

### 4.1 An event happens → a notification exists

**Trigger:** any server action, database trigger or job that changes something someone else cares about.

1. The emitting code calls `app.notify(p_event, p_recipients uuid[], p_workspace_id, p_data jsonb, p_action_url, p_actor_id, p_subject, p_dedupe_key, p_group_key)` — one call, however many recipients.
2. The function derives `category` and `priority` from a static map (`app.notification_event_catalog`, seeded by migration and mirrored in `packages/contracts`), applies the dedupe index, and inserts one row per recipient **after** checking each recipient's `in_app` preference for that category. A recipient who has turned in-app off for that category gets no row at all — there is no "stored but hidden" state to confuse people.
3. For each recipient whose `push` preference is on and who has a live `device_registrations` row, a `jobs` row `notification.push` is enqueued. For each whose `email` preference is on, the notification is either sent immediately (priority `high`) or accumulated for the digest.
4. Postgres Realtime broadcasts the insert; the recipient's open tab updates the bell badge without polling.

**Failure cases:** a push token rejected by the provider → `device_registrations.revoked_at` set and the row is not retried; an email bounce → `email_log` records it and three consecutive hard bounces disable the email channel for that address with an in-app notice; `app.notify` never raises into the caller's transaction — it is called after the business write commits, via a statement-level trigger or the action's post-commit hook, so a notification failure can never roll back an attendance save.

### 4.2 The notification centre

**Trigger:** the bell in the top bar (present on **phone and desktop**).

**Phone:** tapping the bell opens a full-height `Sheet`. A segmented control: **All · Unread**, then a category filter chip row (Academics, People, Billing, Marketplace, System). Rows are 72 px: a category icon, the title in one line, the body in one truncated line, a relative timestamp, and an unread dot. Grouped rows render as "3 people asked to join" and expand in place. Pull-to-refresh at the top. "Mark all read" is in the sheet header. Infinite scroll with cursor pagination, 20 per page.

**Desktop:** a 420 px popover with the same content, plus a "See all" link to `/app/notifications` (a full page for when there are hundreds).

- **Tapping a row** marks it read and navigates to `action_url`. Every event has one — this is the fix for the prototype's unclickable notifications.
- **Row actions** (swipe on phone, hover on desktop): Mark unread, Archive.
- **Opening the sheet** sets `seen_at` on everything currently visible, which clears the badge; `read_at` is only set by an explicit tap. The badge therefore stops nagging without pretending you read things.

**Empty state:** "Nothing new — we'll tell you when something needs you."

### 4.3 Preferences

**Route:** settings → Notifications (both shells, F-ID-02 §4.4).

A matrix: rows are categories, columns are In-app / Push / Email. In-app for **critical** categories (security, billing failures) is shown locked on with an explanation. Under the matrix: the email digest frequency (Off / Daily at 7pm / Weekly on Friday) and a per-workspace override section for users in more than one workspace ("Quieter in: Ideal School").

Saving writes `notification_preferences` rows (only the deltas from the defaults) and the global channels in `user_preferences`. Changes take effect on the next emitted event; nothing is retroactive.

### 4.4 Push registration [R1, decided — T-04]

**Installed-PWA Web Push ships in Release 1**, not deferred to the native wrapper milestone. This reverses the earlier ARCHITECTURE §7 framing ("push = native wrappers, R4"): notification failure is the #3 pain point in the review corpus, and shipping no push for four releases while messaging is sold as a daily hook was judged to cost more retention than it saves engineering time. Every recipient of a `high`-priority notification is push-eligible from R1, subject to preferences and quiet hours (§5.2).

On the PWA, "Turn on push" requests the browser permission and registers a Web Push subscription into `device_registrations`. In the Android wrapper (post-R1), the Capacitor Push plugin registers an FCM token into the same table (ARCHITECTURE §7) — no schema change is needed when that lands. The UI never claims push is on when the OS permission is denied — it shows "Blocked in your browser settings" with instructions. Unsubscribing sets `revoked_at`.

**Design constraint carried from the decision:** messaging must stay correct on **poll + open-the-app**, not only on a live push, because restricted background data kills websockets/Web Push delivery on a real budget Android phone. The notification centre (§4.2) is always the authoritative source; push is a convenience nudge on top of it, never the only path to a notification.

### 4.5 Email digest

A pg_cron job at 19:00 in each recipient's workspace timezone (defaulting to Asia/Dhaka) selects unread, unsent, digest-eligible notifications from the window, groups them by category, renders one React Email, sends via Resend, and writes `notification_digests` + `email_log`. A digest is never sent when the window is empty. High-priority notifications are sent immediately and are excluded from the digest so nothing arrives twice.

### 4.6 Platform broadcast

Platform staff can send an announcement to all users, all owners, or the members of a named workspace (F-ID-08). It emits `platform.broadcast` through the same `app.notify` path — there is no second delivery mechanism to maintain, and broadcasts respect the `system` category preference except when marked critical (a security advisory).

### 4.7 Retention

Read notifications older than 90 days and archived ones older than 30 days are deleted nightly. Unread ones are kept for 180 days and then archived, never silently deleted. The audit trail, not the notification list, is the permanent record.

## 5. Business rules and calculations

### 5.1 The event taxonomy

Event names are `{domain}.{event}`, lowercase, dot-separated, stable forever (they are a public contract between areas). Categories are **derived**, never stored by the caller. This is the v1 catalogue; each area's spec adds its own rows to `app.notification_event_catalog` by migration.

| Event                                                               | Category    | Priority | Recipients                        | `action_url`                          |
| ------------------------------------------------------------------- | ----------- | -------- | --------------------------------- | ------------------------------------- |
| `auth.new_device_signin`                                            | security    | high     | the user                          | `/settings/security`                  |
| `account.deletion_scheduled`                                        | security    | high     | the user                          | `/settings/security`                  |
| `account.deletion_cancelled`                                        | security    | normal   | the user                          | `/settings/security`                  |
| `invite.received`                                                   | people      | high     | invitee                           | `/invite/{token}`                     |
| `invite.accepted`                                                   | people      | normal   | inviter + admins                  | `/app/staff/team`                     |
| `invite.declined`                                                   | people      | low      | inviter                           | `/app/staff/team?tab=invitations`     |
| `invite.expired`                                                    | people      | low      | inviter                           | `/app/staff/team?tab=invitations`     |
| `join_request.received`                                             | people      | high     | owners + admins                   | `/app/staff/team?tab=pending`         |
| `join_request.approved`                                             | people      | high     | joiner                            | `/app`                                |
| `join_request.rejected`                                             | people      | normal   | joiner                            | `/personal/workspaces`                |
| `member.role_changed`                                               | people      | high     | the member                        | `/app`                                |
| `member.removed`                                                    | people      | high     | the member                        | `/personal/workspaces`                |
| `member.left`                                                       | people      | low      | owners + admins                   | `/app/staff/team`                     |
| `workspace.ownership_transferred`                                   | people      | high     | new owner, previous owner, admins | `/app/settings/workspace`             |
| `guardian.invited`                                                  | people      | normal   | guardian (if a user)              | `/invite/{token}`                     |
| `guardian.linked`                                                   | people      | normal   | class teacher                     | `/app/students/{id}`                  |
| `document_request.received`                                         | people      | high     | candidate                         | `/personal/requests`                  |
| `document_request.approved` / `.declined` / `.revoked`              | people      | normal   | requester                         | `/app/hiring/applications/{id}`       |
| `document_request.expiring`                                         | people      | normal   | candidate + requester             | `/personal/requests`                  |
| `attendance.low`                                                    | academics   | high     | class teacher + admins            | `/app/attendance/alerts?section={id}` |
| `exam.reminder`                                                     | academics   | normal   | teachers of the exam              | `/app/exams/{id}`                     |
| `assignment.due_soon`                                               | academics   | low      | assigned teachers                 | `/app/assignments/{id}`               |
| `marks.published`                                                   | academics   | normal   | parents of the section            | `/family/{student}/marks`             |
| `report_card.ready`                                                 | academics   | normal   | parents                           | `/family/{student}/reports`           |
| `behaviour.logged`                                                  | academics   | normal   | parents (when parent-visible)     | `/family/{student}/behaviour`         |
| `cover.assigned`                                                    | academics   | high     | cover teacher                     | `/app/cover/{id}`                     |
| `print.ready`                                                       | system      | normal   | requester                         | `/app/print/{id}`                     |
| `print.failed`                                                      | system      | high     | requester                         | `/app/print/{id}`                     |
| `ai_credits.low` / `.exhausted`                                     | billing     | high     | owner + the teacher               | `/app/ai`                             |
| `ai_credits.requested`                                              | billing     | normal   | owner                             | `/app/ai/requests`                    |
| `billing.trial_ending`                                              | billing     | high     | owner                             | `/app/billing`                        |
| `billing.payment_failed`                                            | billing     | high     | owner                             | `/app/billing`                        |
| `billing.invoice_ready`                                             | billing     | normal   | owner                             | `/app/billing/invoices/{id}`          |
| `marketplace.sale`                                                  | marketplace | normal   | seller                            | `/sell/orders/{id}`                   |
| `marketplace.listing_approved` / `.changes_requested` / `.rejected` | marketplace | high     | seller                            | `/sell/listings/{id}`                 |
| `marketplace.payout_paid`                                           | marketplace | normal   | seller                            | `/sell/payouts/{id}`                  |
| `marketplace.refund_issued`                                         | marketplace | high     | seller + buyer                    | `/sell/orders/{id}`                   |
| `kyc.approved` / `kyc.rejected`                                     | marketplace | high     | seller                            | `/sell/kyc`                           |
| `hiring.application_received`                                       | people      | normal   | hiring staff                      | `/app/hiring/applications/{id}`       |
| `hiring.interview_scheduled`                                        | people      | high     | candidate + interviewers          | `/app/hiring/interviews/{id}`         |
| `hiring.offer_made`                                                 | people      | high     | candidate                         | `/personal/applications/{id}`         |
| `message.mention` / `message.dm`                                    | messages    | normal   | mentioned user / recipient        | `/app/messages/{channel}`             |
| `announcement.published`                                            | messages    | normal   | audience                          | `/app/messages/announcements/{id}`    |
| `platform.broadcast`                                                | system      | varies   | as targeted                       | the given URL                         |
| `support.grant_requested` / `.granted` / `.expired`                 | security    | high     | owner / platform staff            | `/app/settings/workspace?tab=support` |

Categories: `security`, `people`, `academics`, `billing`, `marketplace`, `messages`, `system`. Adding an event without adding it to the catalogue **fails a CI test** — this is the mechanism that prevents the prototype's icon-map/enum divergence from ever recurring.

### 5.2 Other rules

| Rule                             | Value                                                                                                                                                                                                                                                                                                                                                                                                                                               | Where                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Category derivation              | `app.notification_category(event)` reads the catalogue; callers never pass a category                                                                                                                                                                                                                                                                                                                                                               | migration + `packages/contracts/src/notifications/catalog.ts` |
| Title/body rendering             | stored `data` + the user's language → rendered at read time by `renderNotification(event, data, locale)`; nothing is stored pre-translated, so switching to বাংলা re-renders history correctly                                                                                                                                                                                                                                                      | `packages/domain/notifications/render.ts`                     |
| `action_url`                     | **required** on every event; a catalogue entry without one fails CI                                                                                                                                                                                                                                                                                                                                                                                 | catalogue test                                                |
| Dedupe                           | `(user_id, dedupe_key)` within a rolling day; a second identical event updates `created_at` and re-surfaces the row instead of creating a duplicate                                                                                                                                                                                                                                                                                                 | unique index + `app.notify`                                   |
| Grouping                         | rows sharing `group_key` within 24 h collapse in the UI with a count; the newest actor names the row                                                                                                                                                                                                                                                                                                                                                | `packages/domain/notifications/group.ts`                      |
| Fan-out cap                      | a single `app.notify` call accepts ≤ 2,000 recipients; announcements above that are chunked by the job runner                                                                                                                                                                                                                                                                                                                                       | `app.notify`                                                  |
| In-app preference                | checked **before** insert — no hidden rows                                                                                                                                                                                                                                                                                                                                                                                                          | `app.notify`                                                  |
| Push preference                  | checked at job time, so turning push off stops queued sends                                                                                                                                                                                                                                                                                                                                                                                         | `notification.push` job                                       |
| Email immediacy                  | priority `high` → immediate; `normal`/`low` → digest                                                                                                                                                                                                                                                                                                                                                                                                | `packages/domain/notifications/policy.ts`                     |
| Digest schedule                  | daily 19:00 or weekly Friday 19:00, in the workspace timezone                                                                                                                                                                                                                                                                                                                                                                                       | pg_cron                                                       |
| Digest suppression               | never sent for an empty window; never includes already-emailed high-priority items                                                                                                                                                                                                                                                                                                                                                                  | `notification_digests`                                        |
| Locked channels                  | `security` category in-app cannot be disabled; `billing.payment_failed` email cannot be disabled                                                                                                                                                                                                                                                                                                                                                    | `policy.ts`                                                   |
| Badge semantics                  | badge = count where `seen_at is null`; opening the centre sets `seen_at`; `read_at` is set by tapping a row or "Mark all read"                                                                                                                                                                                                                                                                                                                      | `notifications`                                               |
| Realtime                         | one subscription per session on `notifications` filtered by `user_id`; the badge also refetches on window focus as a fallback                                                                                                                                                                                                                                                                                                                       | `packages/ui/notifications`                                   |
| Retention                        | read > 90 days deleted; archived > 30 days deleted; unread > 180 days archived                                                                                                                                                                                                                                                                                                                                                                      | nightly job                                                   |
| Quiet hours [R1, decided — T-04] | **Asia/Dhaka 22:00–07:00, for teachers as well as parents (not parents only).** Non-urgent (`normal`/`low` priority) push is suppressed in that window and the attempt is logged in `push_log` with `status='skipped_quiet_hours'`, not silently dropped; `high`-priority (security, urgent academic/attendance) push still delivers. A per-user override lives on `user_preferences`; the OS-level do-not-disturb is a backstop, not the mechanism | `packages/domain/notifications/quietHours.ts`                 |

## 6. UI

Components: `NotificationBell` (badge), `NotificationSheet`, `NotificationRow`, `SegmentedControl`, `ChipFilterRow`, `EmptyState`, `Skeleton`, `PreferenceMatrix`, `Switch`, `Banner`, `Toast` (`aria-live`).

| Screen / route                                                      | 360×800                                                                                                                                                                                                            | ≥1024                                                                              | Primary action        | Empty                                                    | Loading         | Error                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| Bell — top bar, every shell                                         | 44 px target; badge shows 1–9 then "9+"; a subtle pulse on a new realtime row (suppressed when `reduce_motion`)                                                                                                    | Same in the top bar                                                                | Open centre           | No badge at all when zero                                | —               | Badge falls back to a focus-refetch if realtime drops, with no visible error |
| Centre — sheet / popover                                            | Full-height sheet, 90 % viewport; segmented All/Unread; category chip row scrolls horizontally; 72 px rows; pull-to-refresh; "Mark all read" in the header; infinite scroll                                        | 420 px popover anchored to the bell, max 640 px tall, with "See all" at the bottom | Tap a row (navigates) | "Nothing new — we'll tell you when something needs you." | 6 row skeletons | Inline "Couldn't load — retry" preserving any already-loaded rows            |
| All notifications — `/app/notifications`, `/personal/notifications` | Full page version of the same list with a date-grouped layout (Today / Yesterday / Earlier)                                                                                                                        | Two-column: filters on the left, list on the right                                 | Mark all read         | Same empty copy                                          | skeletons       | page-level alert                                                             |
| Grouped row                                                         | "3 people asked to join" with stacked avatars; tapping expands the group in place, not on a new screen                                                                                                             | Same                                                                               | Expand                | —                                                        | —               | —                                                                            |
| Preferences — settings → Notifications                              | Category sections, each with three switches labelled In-app / Push / Email; locked rows show a small lock and a one-line reason; digest frequency as a radio group; per-workspace overrides in a collapsed section | Matrix table, categories × channels, with the overrides as a second table          | per-switch autosave   | n/a                                                      | row skeletons   | per-switch revert with a toast                                               |
| Push permission                                                     | A card: "Get alerts when you're not in the app" with an Enable button; after a denial it shows the browser-settings instructions instead of the button                                                             | Same card                                                                          | Enable push           | —                                                        | —               | Honest denied state; never a fake "on"                                       |

Accessibility: the badge count is announced (`aria-label="Notifications, 3 unread"`); new realtime arrivals announce politely once, not per row; rows are links with a visible focus ring; swipe actions have keyboard/menu equivalents; the preference matrix has real `<th>` headers so a screen reader can say "Academics, Push, on".

## 7. Server contracts

Schemas in `packages/contracts/src/notifications/*.ts`. Actions in `apps/web/app/(shared)/notifications/actions.ts`.

| Action / handler                                              | Input schema                                                                                                                       | Output                                                                    | Errors                            | Idempotency                       | Rate limit                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------- | --------------------------------- | ---------------------------------- |
| `listNotifications`                                           | `ListNotificationsInput` {scope: 'all'\|'unread', category?, workspace_id?, cursor?, limit ≤ 30}                                   | `Paginated<NotificationDto>` (title/body rendered in the caller's locale) | `UNAUTHENTICATED`                 | n/a                               | 120/min                            |
| `getUnreadCount`                                              | `UnreadCountInput` {}                                                                                                              | `{ unseen: n, unread: n }`                                                | —                                 | n/a                               | 240/min                            |
| `markSeen`                                                    | `MarkSeenInput` {ids?: uuid[]} — omitted = everything currently unseen                                                             | `{ seen: n }`                                                             | —                                 | idempotent                        | 120/min                            |
| `markRead` / `markUnread`                                     | `MarkReadInput` {ids: uuid[1..100]}                                                                                                | `{ updated: n }`                                                          | `NOT_FOUND` (silently skipped)    | idempotent                        | 120/min                            |
| `markAllRead`                                                 | `MarkAllReadInput` {workspace_id?, category?}                                                                                      | `{ updated: n }`                                                          | —                                 | idempotent                        | 30/min                             |
| `archiveNotifications` / `deleteNotifications`                | `NotificationIdsInput` {ids: uuid[1..100]}                                                                                         | `{ updated: n }`                                                          | —                                 | idempotent                        | 60/min                             |
| `getNotificationPreferences`                                  | `GetPrefsInput` {}                                                                                                                 | `{ channels, categories: PreferenceRow[] }`                               | —                                 | n/a                               | 120/min                            |
| `updateNotificationPreferences`                               | `UpdatePrefsInput` {workspace_id?: uuid \| null, entries: {category, in_app?, push?, email?}[], digest?: 'off'\|'daily'\|'weekly'} | `{ channels, categories }`                                                | `VALIDATION`, `CHANNEL_LOCKED`    | last write wins                   | 120/h                              |
| `registerPushDevice`                                          | `RegisterPushInput` {platform, token, label?}                                                                                      | `{ device_id }`                                                           | `VALIDATION`                      | by token                          | 30/h                               |
| `revokePushDevice`                                            | `RevokePushInput` {device_id}                                                                                                      | `{ ok: true }`                                                            | `NOT_FOUND`                       | idempotent                        | 30/h                               |
| `POST /api/jobs/notifications/push` (cron, service role)      | —                                                                                                                                  | `{ sent, failed, revoked }`                                               | —                                 | idempotent per job row            | every minute                       |
| `POST /api/jobs/notifications/digest` (cron, service role)    | —                                                                                                                                  | `{ digests_sent }`                                                        | —                                 | guarded by `notification_digests` | hourly (fires per timezone window) |
| `POST /api/jobs/notifications/retention` (cron, service role) | —                                                                                                                                  | `{ deleted, archived }`                                                   | —                                 | idempotent                        | daily                              |
| `app.notify(...)` (SQL, SECURITY DEFINER)                     | —                                                                                                                                  | `int` (rows inserted)                                                     | raises only on an unknown `event` | dedupe index                      | —                                  |

`NotificationDto` never includes another user's identifiers beyond `actor_id` and a display name the caller is already allowed to see.

## 8. Parts (build chunks)

**Part 1 — Taxonomy, `notifications` table, `app.notify`** · Migration for `notifications`, `notification_preferences`, the `notification_event_catalog` seed, `app.notification_category`, `app.notify` with dedupe/grouping/preference checks, RLS (no insert grant to anyone, recipient-only select, column-restricted update), the contracts mirror and the CI catalogue-parity test. · Tests: pgTAP — no role can insert; a second user reads zero rows; a platform admin reads zero rows; the recipient cannot change `title`/`event`/`action_url`; dedupe holds under concurrent calls. Unit: catalogue completeness (every event has a category, priority and `action_url`). · **Demo:** call `app.notify` in psql for three recipients and show one row each, correct categories, and a duplicate call collapsing.

**Part 2 — Notification centre (list, read, archive)** · `NotificationBell` with badge, the phone sheet and desktop popover, `listNotifications` with cursor pagination and locale rendering, `markSeen`/`markRead`/`markAllRead`/`archive`, `/app/notifications` and `/personal/notifications` full pages, grouped rows, `action_url` navigation. · Tests: integration for pagination and marking; e2e at 360×800 for open → tap → land on the right screen; axe. · **Demo:** on a phone, a join request notification takes you straight to the pending tab with the request visible.

**Part 3 — Realtime delivery** · Supabase Realtime subscription scoped to `user_id`, badge updates without polling, reconnect handling, focus-refetch fallback, `reduce_motion` respect, a single polite announcement per arrival. · Tests: a two-context e2e where an admin's approval makes the teacher's badge increment within 3 s without a reload; a test that a dropped socket recovers on focus. · **Demo:** two phones side by side — one approves, the other's bell lights up.

**Part 4 — Preferences** · `notification_preferences` UI (matrix, locks, per-workspace overrides), `updateNotificationPreferences`, the in-app check inside `app.notify`, the global channel switches shared with F-ID-02. · Tests: a pgTAP/integration test that turning a category's in-app off means **no row is inserted**; `CHANNEL_LOCKED` for security and payment-failure channels; per-workspace override precedence unit tests. · **Demo:** turn marketplace notifications off, trigger a sale, and show that nothing lands — while an attendance alert still does.

**Part 5 — Push (Web Push) and device plumbing [R1, decided — T-04]** · `registerPushDevice`/`revokePushDevice`, the VAPID setup, the `notification.push` job with provider error handling and token revocation, the honest permission-denied state, `push_log` as the delivery ledger (queued/sent/delivered/failed/skipped_quiet_hours), Asia/Dhaka quiet-hours enforcement for teachers and parents. · Tests: job unit tests for each provider outcome and for quiet-hours suppression; an e2e that registers, receives and clicks a push in a Playwright context with permissions granted; a test that a revoked token is not retried; a test that a `normal`-priority push queued at 23:00 Asia/Dhaka is suppressed and logged, while a `high`-priority one still sends. · **Demo:** install the PWA on an Android phone, background it, and receive a tappable push that deep-links correctly. **Roadmap note:** this part must land inside the R1 build chunks, not the R4/native-wrapper milestone `docs/plan/ROADMAP.md` currently assigns it to (M7) — that ROADMAP.md re-sequencing is a separate edit, out of scope here.

**Part 6 — Email digest, broadcast and retention** · The digest job with per-timezone windows, the React Email digest template, `notification_digests`, immediate high-priority emails, `platform.broadcast` emission, the retention job. · Tests: digest window correctness across timezones; no-double-send test; empty-window suppression; retention idempotency; template snapshot. · **Demo:** advance the clock in the dev branch and watch one digest email arrive containing exactly the unread normal-priority items.

## 9. Acceptance criteria

1. **Given** any authenticated user, **when** they attempt to insert into `notifications` through the browser client, **then** the insert is rejected — there is no insert grant for any role.
2. **Given** two users, **when** either queries `notifications`, **then** they receive only their own rows; a platform admin querying another user's notifications receives zero rows.
3. **Given** a recipient, **when** they attempt to update a notification's `title`, `event` or `action_url`, **then** the update is rejected by the trigger; only `read_at`, `seen_at` and `archived_at` are writable.
4. **Given** a teacher requesting to join a school, **when** the request is created, **then** every owner and admin has exactly one `join_request.received` notification with category `people`, priority `high`, and an `action_url` pointing at the pending tab.
5. **Given** three join requests within an hour, **when** the admin opens the centre, **then** they see one grouped row reading "3 people asked to join", expandable in place.
6. **Given** the same `attendance.low` condition firing twice in a day for one section, **when** both emissions run, **then** one row exists and its `created_at` is refreshed — no duplicate.
7. **Given** an event that is not in `app.notification_event_catalog`, **when** CI runs, **then** the catalogue-parity test fails — the prototype's icon-map/enum divergence cannot ship.
8. **Given** every catalogue entry, **when** the CI test inspects them, **then** each has a category, a priority and a non-empty `action_url` template.
9. **Given** a user with `language='bn'`, **when** they open a notification created while their language was English, **then** the title and body render in Bangla from the stored `data`.
10. **Given** a user who has turned the marketplace category's in-app channel off, **when** a `marketplace.sale` event fires for them, **then** **no row is inserted** and nothing appears in their centre.
11. **Given** a user with the security category, **when** they open preferences, **then** the in-app switch for security is locked on with a stated reason and cannot be turned off.
12. **Given** an open session, **when** a new notification is inserted for that user, **then** the badge increments within 3 seconds over Realtime with no page reload and no polling.
13. **Given** Realtime is unavailable, **when** the user focuses the window, **then** the badge refetches and no error is shown to the user.
14. **Given** an unread, normal-priority notification, **when** the 19:00 digest job runs in the user's workspace timezone, **then** it is included exactly once and a `notification_digests` row prevents a second send.
15. **Given** a high-priority notification, **when** it is emitted, **then** the email is sent immediately and the item is excluded from that day's digest.
16. **Given** a push token rejected by the provider, **when** the job processes the failure, **then** `device_registrations.revoked_at` is set and no further sends are attempted to it.
17. **Given** a notification tapped on a phone, **when** navigation completes, **then** `read_at` is set, the badge decrements, and the destination screen shows the exact subject of the notification.
18. **Given** read notifications older than 90 days, **when** the retention job runs, **then** they are deleted while unread ones older than 180 days are archived rather than deleted.
19. **Given** a teacher (not only a parent) with no quiet-hours override, **when** a `normal`-priority push would be sent at 23:00 Asia/Dhaka, **then** it is suppressed, a `push_log` row records `status='skipped_quiet_hours'`, and the in-app notification is still created for the next app open.
20. **Given** a `high`-priority notification during quiet hours, **when** it is emitted, **then** push still delivers — quiet hours never suppress security or urgent alerts.
21. **Given** a push send, **when** the provider reports delivery, **then** `push_log.delivered_at` is set, and when the resulting notification is opened via its push, `push_log.opened_at` is set — giving an owner a real queued→sent→delivered→opened count, not a client-side guess.

## 10. Tests

- **Unit:** catalogue completeness and stability (a snapshot test so renaming an event is a deliberate, reviewed change); `renderNotification` for every event × both locales with fixture `data`; grouping and dedupe key construction; digest eligibility; channel-lock rules; badge arithmetic.
- **DB (pgTAP):** no insert grant for `anon` or `authenticated`; recipient-only select; platform admin reads nothing; the updatable-column trigger; the dedupe unique index under concurrent `app.notify` calls; `app.notify` respecting the in-app preference; realtime publication carries RLS.
- **Integration:** every action in §7 for happy path and errors; `app.notify` fan-out to 2,000 recipients within the time budget; job handlers for push, digest and retention including failure paths; a test asserting a notification failure never rolls back the originating business transaction.
- **E2E (360×800 and 1280×800):** `realtime-badge-updates` (two contexts), `notification-deep-link` (one journey per category with a real destination assertion), `preferences-suppress-category`, `grouped-rows-expand`, `push-permission-denied-state`.
- **A11y:** axe on the sheet, the popover, the full page and the preference matrix; the badge's accessible name includes the count; arrivals announce once; every swipe action has a menu equivalent.
- **Performance budgets:** `getUnreadCount` ≤ 20 ms server-side (partial index); `listNotifications` p95 ≤ 150 ms at 10,000 rows per user; the centre's first paint ≤ 500 ms from tap; one realtime subscription per session, never per component; `app.notify` for 500 recipients ≤ 300 ms.
- **Security:** a test that `NotificationDto` never leaks a field the caller could not otherwise read; a Semgrep rule forbidding direct `insert into notifications` anywhere in application code.

## 11. Open questions

- **OQ-1: push in v1 — RESOLVED [R1, T-04].** Installed-PWA Web Push ships in Release 1 (§4.4), not deferred to the native wrapper milestone; FCM is added as a second driver on the same table and job when the Android wrapper lands (post-R1). This supersedes the earlier "default assumed" framing and ARCHITECTURE §7's "push = native wrappers, R4" — ARCHITECTURE §7 needs a matching update, out of scope for this edit. If a future review finds R1 Web Push infeasible after all, the fallback the decision names is to **delete messaging from the daily-hook/retention story** rather than half-ship it — not to quietly slip back to "default assumed."
- **OQ-2: SMS as a notification channel.** Announcements to parents are listed as "in-app + optional SMS later" (PRODUCT-DECISIONS §6.7) and SMS providers are deferred (§7). **Default assumed:** no SMS channel in v1; the preference matrix has three columns, not four.
- **OQ-3: quiet hours — RESOLVED [R1, T-04].** Asia/Dhaka 22:00–07:00 quiet hours for non-urgent push, extended to **teachers as well as parents** (§5.2) — not the parents-only scope earlier drafts assumed. `push_log.status='skipped_quiet_hours'` records every suppressed send so the quiet-hours claim is auditable, not just a UI promise.
- **OQ-4: parent notifications.** Parents receive `marks.published`, `report_card.ready`, `behaviour.logged` and `announcement.published`. PRODUCT-DECISIONS §1.13 lists what a parent may see but not what they are told. **Default assumed:** the four events above, all with `/family/...` action URLs, all preference-controllable. Parent-portal spec to confirm.
- **OQ-5: `notifications.workspace_id` nullability.** Account-level events have no workspace. **Default assumed: nullable**, with a partial index for the workspace-scoped queries. Same nullability question as `audit_events` — see F-ID-09 §11. DATA-MODEL to settle both together.
- **OQ-6: who owns each event's emission.** This spec defines the catalogue; the emitting call sites belong to the areas that own the underlying action. **Default assumed:** each area's spec must add a migration row to the catalogue and a test asserting the emission, and the catalogue-parity test enforces it.
