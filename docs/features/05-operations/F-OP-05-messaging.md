# F-OP-05 — Messaging, Announcements and Contact Log

|                  |                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Area             | ops                                                                                                                                                                                  |
| Status           | planned                                                                                                                                                                              |
| Owner branch     | `feat/ops-messaging`                                                                                                                                                                 |
| Depends on       | F-ID-01/02 (profiles, memberships), F-AC-0x (sections, section_subjects, enrollments, guardians + `guardian_users`), F-OP-06 (offboarding revokes), files/storage, Supabase Realtime |
| Plan             | `docs/plan/ROADMAP.md` chunk TBD                                                                                                                                                     |
| Base44 reference | `docs/reference/base44-inventory/05-operations.md` §1.5, §2.2 (`Message`, `Notification`, `ActivityFeedItem`), §3 rows 64–76, §4.6, §6.4, §7.4, §7.13, §8 Q13–Q14                    |

---

## 1. Purpose

A school runs on messages: the head of section needs the maths teachers in one place, two teachers need to swap a period, the principal needs every Class 8 parent to know that Thursday is a holiday, and a class teacher needs a record that she phoned Rahim's father about his absences. **Messaging** gives the school one chat surface (channels + DMs, realtime, on a phone), one broadcast surface (announcements to parents, one-way), and one safeguarding surface (a contact log for the phone and WhatsApp conversations that will always happen outside the app). Notifications are the thin layer that makes any of it reach a person who is not looking at the screen.

**What Base44 intended and what was fake.** Slack-lite, built **twice** — `/messaging` and the "Internal Messages" tab of `/communication` — with different semantics, different sorting and a delete-own-message button in only one of them (§1.5, §3 rows 64, 70). The `Message` table had **no tenant column and no RLS**, so **every message in the product was readable by every user of every school** (§7.4), and `/messaging` was the one route with **no role guard at all**, so a parent could read and post in `#admin` — a channel whose own description said "Admin & admin only" (§3 row 65). Recruiter↔candidate DMs **leaked into `#general`** because one of the two implementations forgot `is_direct:false` in its filter (§3 row 71). `thread_id` existed and was never written (§3 row 68). Messages never produced notifications (§4.6). The notification bell rendered `n.body` when the column was `message`, so **notification bodies never displayed**, and its icon map matched none of the enum values, so every notification showed the same icon (§7.13). Parent outreach was three deep links (`tel:`, `wa.me`, `mailto:`) with **nothing recorded anywhere** (§3 row 73). The "Student Portal Feed" had a visibility toggle in its caption and a hardcoded boolean in its code (§3 row 74).

**Done looks like:** a teacher opens Messages on her phone between periods, sees 3 unread in #class-6a, replies in a thread, attaches a photo of the board, and the message appears on the head teacher's laptop in under a second. The principal posts one announcement to the parents of Classes 6–8 and can see that 214 of 312 have read it. And when that teacher rings a parent, the app logs who called whom, when, and what was agreed — in thirty seconds, because it is two taps and a sentence.

## 2. Roles and permissions

| Action                                 | Permission key         | owner | admin |      teacher      | staff |             parent             | platform |
| -------------------------------------- | ---------------------- | :---: | :---: | :---------------: | :---: | :----------------------------: | :------: |
| Open messaging                         | `message.view`         |  ✅   |  ✅   |        ✅         |  ✅   |              — ¹               |    —     |
| Post in a channel they are a member of | `message.post`         |  ✅   |  ✅   |        ✅         |  ✅   |               —                |    —     |
| Create a custom channel                | `channel.create`       |  ✅   |  ✅   |       ✅ ²        |   —   |               —                |    —     |
| Add/remove channel members             | `channel.manage`       |  ✅   |  ✅   | channel moderator |   —   |               —                |    —     |
| Archive / rename a channel             | `channel.manage`       |  ✅   |  ✅   | channel moderator |   —   |               —                |    —     |
| Start a DM with another member         | `message.dm`           |  ✅   |  ✅   |        ✅         |  ✅   |               —                |    —     |
| Edit **own** message (15 min)          | `message.post`         |  own  |  own  |        own        |  own  |               —                |    —     |
| Delete **own** message                 | `message.post`         |  own  |  own  |        own        |  own  |               —                |    —     |
| Delete **any** message / moderate      | `message.moderate`     |  ✅   |  ✅   |         —         |   —   |               —                |    —     |
| Mute a member in a channel             | `message.moderate`     |  ✅   |  ✅   | channel moderator |   —   |               —                |    —     |
| Suspend a member from messaging        | `message.moderate`     |  ✅   |  ✅   |         —         |   —   |               —                |    —     |
| Publish an announcement                | `announcement.publish` |  ✅   |  ✅   |  class teacher ³  |   —   |               —                |    —     |
| Read announcements                     | —                      |  ✅   |  ✅   |        ✅         |  ✅   | ✅ (their children's sections) |    —     |
| Write a contact log entry              | `contact_log.write`    |  ✅   |  ✅   |        ✅         |  ✅   |               —                |    —     |
| Read contact log for a student         | `contact_log.view`     |  ✅   |  ✅   |   own sections    |   —   |               —                |    —     |
| Export contact log                     | `contact_log.export`   |  ✅   |  ✅   |         —         |   —   |               —                |    —     |

¹ Parents have **no chat access in v1**. They receive announcements and notifications in `/family`. Two-way parent messaging is FUTURE (§11 Q1) — this is deliberate: a chat surface open to hundreds of parents needs moderation capacity a school does not have on day one.
² Teachers may create custom channels; a school setting `messaging_policy.teacher_can_create_channels` (default true) can turn that off.
³ A class teacher may announce to their own section only. Admins/owners may announce to any audience.

**Plan entitlement:** `messaging` is available on **Free** (PRODUCT-DECISIONS §5.1) — it is the module that makes the app worth opening daily. Announcements and the contact log are also Free; attachment size scales with the plan's storage.

## 3. Data

> **Proposed; `docs/architecture/DATA-MODEL.md` wins.** Every table carries `workspace_id` — the single fix for §7.4's cross-tenant leak.

### 3.1 `channels`

`(workspace_id, kind enum auto_general|auto_staff|auto_section|custom, slug, name, topic, section_id uuid null, visibility enum workspace|role_restricted|section|private, allowed_roles role[] null, is_default bool, archived_at, created_by)`.
Unique `(workspace_id, slug)`. Auto channels are created by a trigger:

- **#general** — `visibility='role_restricted'`, roles `{owner,admin,teacher,staff}`; every active non-parent member is added on join.
- **#staff** — roles `{owner,admin,staff}` (teachers excluded by default; setting `messaging_policy.staff_channel_includes_teachers`, default false). This replaces Base44's ungated `#admin`.
- **#class-{section-slug}** — one per section, members = class teacher + every `section_subjects` teacher + admins/owners; membership is **recomputed by a trigger** whenever `section_subjects` or the class teacher changes.
  RLS: select where `app.is_channel_member(id)` or (`visibility='workspace'` and active member); insert/update `{owner,admin}` or the channel's moderator.

### 3.2 `channel_members`

`(channel_id, user_id, workspace_id, role_in_channel enum member|moderator, joined_at, last_read_at timestamptz, last_read_message_id, muted_until, notification_level enum all|mentions|none default 'all', left_at)`.
Unique `(channel_id, user_id)`. `last_read_at` is the read-receipt primitive (§5.4).

### 3.3 `conversations` + `conversation_participants` (DMs)

`conversations(workspace_id, kind enum direct|group, created_by, last_message_at)`;
`conversation_participants(conversation_id, workspace_id, user_id, last_read_at, muted_until, left_at)`.
A direct conversation is unique per **sorted pair** within a workspace: unique index on `(workspace_id, participant_key)` where `participant_key = array_to_string(sorted user ids, ':')`. DMs are **workspace-scoped**: two people who share two workspaces have two separate DM threads, because a message about School A must not surface in School B. This, plus a separate table from `channels`, structurally prevents §3 row 71's DM-into-#general leak — a DM has no `channel_id` to leak into.

### 3.4 `messages`

| Column                                       | Type          | Notes                                                                       |
| -------------------------------------------- | ------------- | --------------------------------------------------------------------------- |
| `workspace_id`                               | uuid not null | **the column Base44 never had**                                             |
| `channel_id` / `conversation_id`             | uuid null     | exactly one is non-null (check constraint)                                  |
| `sender_id`                                  | uuid not null |                                                                             |
| `body`                                       | text          | ≤ 4000 chars; plain text + safe markdown subset, rendered with no raw HTML  |
| `parent_message_id`                          | uuid null     | **threads, actually wired** (§3 row 68)                                     |
| `reply_count`, `last_reply_at`               |               | maintained by trigger on the parent                                         |
| `mentions`                                   | uuid[]        | parsed server-side from `@` tokens; drives notifications                    |
| `system_event`                               | jsonb null    | `{type:'member_joined'\|'channel_renamed'\|…}`; body is generated at render |
| `edited_at`                                  | timestamptz   | editable by the author for 15 minutes                                       |
| `deleted_at`, `deleted_by`, `deleted_reason` |               | soft delete → tombstone (§5.6)                                              |
| `client_nonce`                               | text          | for optimistic send + dedupe                                                |

Indexes `(channel_id, created_at desc)`, `(conversation_id, created_at desc)`, `(parent_message_id, created_at)`, `(workspace_id, created_at desc)`, GIN on `mentions`.
RLS: select where `app.is_channel_member(channel_id)` or `app.is_conversation_participant(conversation_id)`; insert with `sender_id = app.current_user_id()`, membership required, and `muted_until` / `messaging_suspended_until` checked in a trigger; update limited to the author's own `body`/`edited_at` within 15 min, or a moderator setting `deleted_*`.
`message_attachments(message_id, file_id, workspace_id)` → `files` with `visibility='private'` (PRODUCT-DECISIONS §6.5); access via `/api/files/[id]` after `app.can_open_message_file(file_id)`.
`message_reactions(message_id, user_id, emoji)` — unique per triple. (Cheap, and it removes 80 % of "noted, thanks" messages.)

### 3.5 `announcements`

`(workspace_id, title, body, audience jsonb, status enum draft|scheduled|published|unpublished, scheduled_at, published_at, published_by, pinned_until, allow_replies bool default false (v1: always false), created_by)`.
`audience = {"sections": [uuid], "grade_levels": [uuid], "roles": ["parent","teacher"], "all_parents": bool}`. Resolution to recipients is a SQL function `app.resolve_announcement_audience(announcement_id)` returning user ids (guardian users linked via `guardian_users` to students enrolled in those sections, plus staff by role).
`announcement_recipients(announcement_id, user_id, workspace_id, student_id null, delivered_at, read_at)` — materialised at publish so read rates are real and stable even if a student changes section later.
`announcement_attachments(announcement_id, file_id)`.
RLS: publishers per §2; recipients select their own rows and the announcement.

### 3.6 `contact_log`

`(workspace_id, student_id null, guardian_id null, other_party_name text null, staff_user_id not null, direction enum outbound|inbound, channel enum phone|whatsapp|sms|email|in_person|other, purpose enum attendance|academic|behaviour|fees|health|admission|general, subject text, note text not null, occurred_at timestamptz not null default now(), duration_minutes int null, outcome enum spoke|no_answer|left_message|wrong_number|declined null, follow_up_at date null, follow_up_done bool default false, related_message_id null, created_by)`.
Index `(workspace_id, student_id, occurred_at desc)`, `(workspace_id, follow_up_at) where follow_up_done = false`.
RLS: insert by any active member with `contact_log.write`; select for `{owner,admin}` and for teachers of the student's section; **no update after 24 h** (it is a safeguarding record — corrections are appended as a new entry referencing the old one via `corrects_id`); no delete for anyone but a platform admin acting on a data-protection request.

### 3.7 `notifications` (shared, defined here because this feature owns the taxonomy)

`(workspace_id, recipient_id, event_type text, category enum derived, title, body, action_url not null, entity_type, entity_id, actor_id, read_at, created_at, expires_at)`.
**Every notification has `action_url`** and a `body` column named `body` — the two bugs in §7.13 were a naming mismatch and an unused field; both are closed by making `action_url` `not null` and by a test that renders one notification per registered event type.
Event types are a **registry** in `packages/domain/notifications/events.ts` (`{ key, category, titleTemplate, bodyTemplate, icon, defaultChannels }`); a CI test asserts every `event_type` written anywhere in the codebase exists in the registry — so an icon map can never drift from the enum again.
Events owned by this feature: `message.mention`, `message.dm`, `message.thread_reply`, `channel.invited`, `announcement.published`, `contact_log.follow_up_due`.
Channels: in-app always; push (native wrappers) and email digest per `user_preferences` (PRODUCT-DECISIONS §1.10, §1.11).

### 3.8 Realtime

Postgres changes publication on `messages` (insert/update) and `notifications` (insert), filtered by RLS (ARCHITECTURE §5). The browser subscribes with the anon key + user JWT to `messages:channel_id=eq.{id}` for the open channel and to `notifications:recipient_id=eq.{me}` globally. **No 5-second polling** (Base44's approach, §1.5).

## 4. Workflows

### W1 — Auto channels on workspace and membership changes

Trigger: workspace created / member activated / section created / `section_subjects` changed / class teacher changed / member removed.
Triggers maintain `channels` and `channel_members` so nobody has to curate them: a new teacher assigned to Class 7 – B Physics is in `#class-7b` within the same transaction; an offboarded member's `channel_members.left_at` is set by F-OP-06's revoke step and they immediately stop matching the RLS predicate.
Outcome: `messages.system_event` rows narrate joins and leaves in the channel.

### W2 — Send, thread, react, attach

Trigger: a member opens a channel and types.

1. Optimistic append with `client_nonce`; the server action returns the canonical row; Realtime delivers it to everyone else.
2. `@name` typed in the composer resolves against channel members only; the server re-parses the body and writes `mentions` (never trusting the client's array).
3. Reply in thread → `parent_message_id`; the channel shows "3 replies" and the thread opens as a **sheet on phone**, a right panel on desktop.
4. Attach → file picker (camera/gallery/files on phone) → upload to the private bucket with a progress bar → `message_attachments`. Images render as thumbnails fetched through signed URLs; other types render as a file row with size and type.
5. Notifications: `message.mention` to every mentioned member; `message.thread_reply` to the thread's participants; `message.dm` to the other participant. Channel members with `notification_level='all'` get an in-app badge only (no notification row per message — that is how a notification bell becomes noise).
   Failures: over quota → upload refused with the quota message; muted in the channel → composer disabled with "You cannot post here until 14:30"; message over 4000 chars → refused client and server side.

### W3 — Direct messages

Trigger: tapping a member in the directory → **Message**.
Creates or reuses the workspace-scoped direct conversation. DM list is a separate tab. A DM to a member who has left the workspace is read-only with a banner. There is no cross-workspace DM and no DM to a parent in v1.

### W4 — Announcements

Trigger: admin/owner (or a class teacher for their own section) taps **New announcement**.

1. Compose: title, body, attachments, audience picker (sections / grade levels / all parents / staff roles), optional schedule, optional pin-until date.
2. **Preview shows the resolved recipient count** before publishing ("312 parents of 8 sections, 41 staff"). This number is computed server-side by `app.resolve_announcement_audience`.
3. Publish (or a job publishes at `scheduled_at`) → `announcement_recipients` materialised → in-app notification `announcement.published` to every recipient → email to those whose preferences want it.
4. Parents see it in `/family` as a card; opening it sets `read_at`. The publisher sees **"214 of 312 read"** and can drill into which sections lag.
5. **Announcements are one-way.** `allow_replies` exists in the schema but is forced false in v1; the card carries the school's contact number instead, and tapping it opens the contact-log flow (W5) from the parent's side? — no: from the _school's_ side only. Parents get "Call the office" as a `tel:` link with no logging obligation on them.
   Failures: publishing to an audience that resolves to zero recipients is refused with the reason; unpublishing hides the card and keeps the read statistics.

### W5 — Contact log (the safeguarding record)

Trigger: from a student's page, a guardian's card, an attendance alert, or the messages "Contact a parent" tab.

1. A sheet lists the student's guardians with their numbers. Tapping **Call** fires the `tel:` deep link **and immediately opens a follow-up sheet** behind it.
2. The follow-up sheet is deliberately tiny: outcome (Spoke · No answer · Left message · Wrong number), purpose chip, one note field, optional follow-up date. Two taps and a sentence. **Save** writes `contact_log`.
3. WhatsApp uses `https://wa.me/{e164}?text=…` with a message pre-filled from a template; email uses `mailto:`; both open the same follow-up sheet.
4. If the user dismisses the follow-up sheet without saving, a **pending contact** chip stays on the student's card for the rest of the day ("You called Rahim's father at 11:20 — add a note"). Nagging beats an empty record.
5. Follow-ups due today appear in the school dashboard and fire `contact_log.follow_up_due`.
   Failures: a guardian with no phone number shows "No number on file" with an edit link; an entry older than 24 h cannot be edited — a correction appends a linked entry.

### W6 — Moderation

Trigger: any member taps **Report** on a message, or an admin acts directly.

1. Admin actions: delete a message (tombstone with the actor and an optional reason), mute a member in a channel until a time, suspend a member from all messaging (`workspace_members.messaging_suspended_until`), archive a channel.
2. Every action writes `audit_events` and notifies the affected member with the reason.
3. Reported messages land in a small queue at `/app/messages/moderation` (admins only) with the reporter, the message and one-tap actions.
   Failures: deleting the last message of a thread keeps the thread with its tombstone; a moderator cannot delete an admin's message unless they are an owner.

### W7 — Phone flow (explicit)

`/app/messages` at 360×800: a **segmented control** (Channels · DMs · Announcements) under the title; a list of rows with avatar/name/last message/unread pill; tapping opens the conversation **full screen** (not a sheet — typing needs the whole viewport) with a sticky composer above the keyboard, a back chevron top-left and the channel menu top-right. The thread opens as a **bottom sheet** over the conversation. Attachments open the OS picker. Long-press a message → action sheet (Reply in thread · React · Copy · Edit · Delete · Report). The unread badge lives on the bottom-nav Messages icon. Announcements compose is a full-screen stepper (Compose → Audience → Review) because the audience picker is the whole point and it needs room. Contact log is always a bottom sheet — it must be completable one-handed while holding a phone to your ear with the other.

## 5. Business rules and calculations

### 5.1 Channel membership resolution

- `auto_general`: every active member with role ∈ `{owner,admin,teacher,staff}`.
- `auto_staff`: `{owner,admin,staff}` (+ teachers if the setting is on).
- `auto_section`: the section's class teacher + every teacher on a `section_subjects` row for that section (primary or assistant) + all `{owner,admin}`.
- `custom`: explicit `channel_members` rows.
  Recomputation happens in the same transaction as the source change. A member who loses their last qualifying link gets `left_at` set (history preserved) and loses read access immediately, because RLS checks `left_at is null`.

### 5.2 Who may post

```
can_post(user, channel) =
      member(channel) with left_at is null
  and (muted_until is null or muted_until < now())
  and (workspace_members.messaging_suspended_until is null or < now())
  and channel.archived_at is null
```

Checked in `domain/permissions` **and** by a trigger on `messages` — both layers, per ARCHITECTURE §5.

### 5.3 Mentions

Server-side parse of `@[display name](user_id)` tokens produced by the composer's picker; any id not in `channel_members` is stripped. `@channel` and `@here` are allowed only for moderators and admins and are rate-limited to 3 per channel per day (the setting `messaging_policy.broadcast_mentions_per_day`).

### 5.4 Unread and read receipts

```
unread_count(channel, user) = count(messages
                                    where channel_id = :channel
                                      and created_at > coalesce(last_read_at, joined_at)
                                      and sender_id <> :user
                                      and deleted_at is null)
```

`last_read_at` advances when the conversation is open and the newest message is on screen (debounced 1 s), and on explicit "Mark as read". Per-channel read receipts are shown as **"Read by 12"** with a list on tap (who, and when) — computed from `channel_members.last_read_at >= message.created_at`. For DMs the receipt is a simple _Seen 14:02_. Announcement read rate:

```
read_rate = count(announcement_recipients where read_at is not null) / count(announcement_recipients)
```

displayed as "214 of 312 read (69 %)", broken down by section.
Unread badges cap at 99+; the bottom-nav badge is the sum across channels and DMs.

### 5.5 Notification rules (anti-noise)

A notification row is created **only** for: a mention, a DM, a reply in a thread you are in, a channel invitation, an announcement, and a due follow-up. Ordinary channel messages produce **no** notification row — only the in-app unread badge and (for the native wrappers) a silent push that updates the badge. Email digests batch anything unread for 30 minutes and are capped at one per hour per user.
`expires_at` is set for time-bound events (an announcement pinned until a date) and a nightly job clears expired unread notifications.

### 5.6 Deletion and tombstones

A deleted message keeps its row with `body = null`, `deleted_at`, `deleted_by`, and renders as _"Message removed"_ (plus _"by an admin"_ when `deleted_by <> sender_id`). Attachments are removed from storage on deletion. Editing is allowed for 15 minutes and every edit stores the previous body in `message_edits(message_id, previous_body, edited_at)` — an edited message shows "(edited)" and moderators can see the history. Nothing is hard-deleted from a conversation except by a platform-level data-protection action.

### 5.7 Attachments

Max 25 MB per file, 5 files per message, counted against the workspace's storage quota. Allowed: images, PDF, office documents, plain text, audio. Executables and archives are rejected. Files are `private`; the access predicate is:

```
app.can_open_message_file(file_id) =
  exists (message_attachments ma
          join messages m on m.id = ma.message_id
          where ma.file_id = :file
            and (app.is_channel_member(m.channel_id) or app.is_conversation_participant(m.conversation_id))
            and m.deleted_at is null)
```

Every open is logged to `file_access_log`.

### 5.8 Contact log rules

- `note` is required and must be ≥ 10 characters — a log entry that says nothing is worse than none.
- `occurred_at` defaults to now and may be backdated up to 7 days (for entries written after the fact), never forward-dated.
- Immutable after 24 h; corrections append a new row with `corrects_id`.
- The student timeline shows contact entries alongside attendance and behaviour so a pattern is visible on one screen.
- Export (CSV/PDF) is admin-only and writes an `audit_events` row naming the range exported — this record can end up in a safeguarding file.

### 5.9 Timezone

All "today", digest windows, follow-up dates and read-rate reporting use `school_profiles.timezone` (default Asia/Dhaka), computed in SQL.

## 6. UI

| Screen               | Route                                              | 360×800                                                            | ≥1024                                          | Primary action   | Empty / loading / error                                                                         |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| Messages home        | `/app/messages`                                    | Segmented (Channels·DMs·Announcements); row list with unread pills | Three-pane: channel rail · list · conversation | Open             | Empty channels never happens (auto channels); DMs empty: "Start a conversation" + member picker |
| Conversation         | `/app/messages/c/[id]`                             | Full screen; sticky composer; back chevron; menu                   | Centre pane, thread panel right                | Send             | Skeleton bubbles; "Failed to send — retry" inline on the bubble; muted composer with the reason |
| Thread               | sheet / right panel                                | Bottom sheet over the conversation                                 | Right panel                                    | Reply            | "No replies yet"                                                                                |
| New channel          | sheet / dialog                                     | Sheet: name, topic, visibility, members                            | Dialog                                         | Create           | Slug conflict inline                                                                            |
| Announcements list   | `/app/messages/announcements`                      | Cards with read-rate bars                                          | Table + detail                                 | New announcement | "No announcements yet"                                                                          |
| Compose announcement | `/app/messages/announcements/new`                  | Full-screen 3-step stepper (Compose · Audience · Review)           | Two-column with live recipient count           | Publish          | Zero-recipient refusal names the reason                                                         |
| Parent view          | `/family/announcements`                            | Card list, unread first                                            | Same                                           | Open             | "Nothing from school yet"                                                                       |
| Contact a parent     | sheet from a student                               | Guardian rows → Call/WhatsApp/Email → follow-up sheet              | Dialog                                         | Call             | "No number on file" + edit link                                                                 |
| Contact log          | `/app/students/[id]` tab, `/app/messages/contacts` | Timeline entries                                                   | Table with filters                             | Add entry        | "No contact recorded"                                                                           |
| Moderation           | `/app/messages/moderation`                         | Report cards with one-tap actions                                  | Table                                          | Remove           | "Nothing reported"                                                                              |

Components: `AppShell`, `DataList`, `FormSheet`, `SegmentedControl`, `MessageBubble`, `Composer` (with mention picker and attachment tray), `ThreadSheet`, `UnreadPill`, `ReadReceiptRow`, `AudiencePicker` (new), `ContactSheet` (new), `EmptyState`, `ConfirmSheet`.
Accessibility: the message list is an `aria-live="polite"` log region with per-message `article` semantics; new messages announce sender + first 60 characters; the composer is a labelled textarea with a visible character counter past 3500; every long-press action is also reachable from a visible overflow button (long-press alone is not accessible).

## 7. Server contracts

| Name                                  | Input                                                                                                                                                   | Output                             | Errors                                                                                 | Idempotency         | Rate limit             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- | ------------------- | ---------------------- |
| `sendMessage`                         | `{ channelId? , conversationId?, body, parentMessageId?, attachmentFileIds[], clientNonce }`                                                            | `Message`                          | `not_a_member`, `muted`, `suspended`, `archived_channel`, `too_long`, `quota_exceeded` | `clientNonce`       | **30/min/user**, 600/h |
| `editMessage`                         | `{ id, body }`                                                                                                                                          | `Message`                          | `edit_window_closed`, `forbidden`                                                      | per id + version    | 60/h                   |
| `deleteMessage`                       | `{ id, reason? }`                                                                                                                                       | `Message`                          | `forbidden`                                                                            | per id              | 120/h                  |
| `reactToMessage`                      | `{ id, emoji }` (toggle)                                                                                                                                | `{ counts }`                       |                                                                                        | per triple          | 300/h                  |
| `markChannelRead`                     | `{ channelId, lastMessageId }`                                                                                                                          | `{ lastReadAt }`                   |                                                                                        | natural             | 600/h                  |
| `createChannel`                       | `{ name, topic?, visibility, allowedRoles?, memberIds[] }`                                                                                              | `Channel`                          | `slug_taken`, `forbidden`                                                              | draft id            | 30/h                   |
| `updateChannelMembers`                | `{ channelId, add[], remove[] }`                                                                                                                        | `Channel`                          | `forbidden`, `auto_channel_immutable`                                                  |                     | 60/h                   |
| `archiveChannel`                      | `{ channelId }`                                                                                                                                         | `Channel`                          | `forbidden`                                                                            |                     |                        |
| `startDirectConversation`             | `{ userId }`                                                                                                                                            | `Conversation`                     | `not_a_member`, `self`                                                                 | `(ws, sorted pair)` | 60/h                   |
| `muteChannelMember` / `suspendMember` | `{ …, until, reason }`                                                                                                                                  | —                                  | `forbidden`                                                                            |                     | 60/h                   |
| `reportMessage`                       | `{ id, reason }`                                                                                                                                        | `{ ok }`                           |                                                                                        | per id + user       | 30/h                   |
| `createAnnouncement`                  | `AnnouncementInput` (title, body, audience, attachments, scheduledAt?, pinnedUntil?)                                                                    | `Announcement` (draft)             | `forbidden`, `audience_empty`                                                          | draft id            | 60/h                   |
| `previewAnnouncementAudience`         | `{ audience }`                                                                                                                                          | `{ total, bySection[], byRole[] }` |                                                                                        | —                   | 120/h                  |
| `publishAnnouncement`                 | `{ id }`                                                                                                                                                | `Announcement`                     | `audience_empty`, `already_published`                                                  | per id              | 30/h                   |
| `markAnnouncementRead`                | `{ id }`                                                                                                                                                | `{ readAt }`                       |                                                                                        | natural             | 300/h                  |
| `createContactLog`                    | `{ studentId?, guardianId?, otherPartyName?, channel, direction, purpose, subject?, note (≥10), occurredAt?, durationMinutes?, outcome?, followUpAt? }` | `ContactLogEntry`                  | `note_too_short`, `future_date`, `forbidden`                                           | client draft id     | 120/h                  |
| `appendContactCorrection`             | `{ correctsId, note }`                                                                                                                                  | `ContactLogEntry`                  |                                                                                        |                     | 60/h                   |
| `exportContactLog`                    | `{ from, to, studentId? }`                                                                                                                              | `report_runs` row (F-OP-03)        | `forbidden`                                                                            |                     | 10/h                   |
| `GET /api/files/[id]`                 | —                                                                                                                                                       | 302 signed URL                     | `forbidden` via `app.can_open_message_file`                                            | —                   | 300/h                  |

Realtime is a **read path only**: the browser never writes through the anon key.

## 8. Parts (build chunks)

**Part 1 — Schema, RLS, auto-channel triggers** · `channels`, `channel_members`, `conversations`, `conversation_participants`, `messages` (+ attachments, reactions, edits), all with `workspace_id` and RLS; the membership-recompute triggers; `app.is_channel_member` / `app.is_conversation_participant` / `app.can_open_message_file`; the post-permission trigger.
_Demo:_ pgTAP proves a member of School A sees zero School B messages, a parent sees zero channel rows, a non-member cannot insert into a channel, and adding a teacher to a `section_subjects` row puts them in `#class-…` in the same transaction.

**Part 2 — Channel list + conversation + send (no realtime yet)** · `/app/messages` at both viewports, conversation view with the sticky composer, optimistic send with `client_nonce`, cursor pagination upward, edit/delete with tombstones, system-event rendering.
_Demo:_ on a 360×800 phone, post 50 messages, scroll back through pages, edit one within the window and fail to edit it after, delete one and see the tombstone.

**Part 3 — Realtime, unread, read receipts, mentions** · Supabase subscription per open channel + global notifications channel, `last_read_at` advancement, unread counts and badges, mention picker + server-side parse, `message.mention` notifications, the notification event registry and its CI parity test.
_Demo:_ two browsers side by side; a message appears in under a second; the mention produces a notification whose body **renders** and whose `action_url` opens the right message.

**Part 4 — Threads, reactions, attachments** · `parent_message_id` with reply counts, the thread sheet/panel, reactions, private-file upload with progress, image thumbnails via signed URLs, type/size guards, quota enforcement.
_Demo:_ reply in a thread from a phone, attach a photo taken with the camera, and open it from a second account that is a channel member — then fail to open it from an account that is not.

**Part 5 — DMs** · workspace-scoped direct conversations with the sorted-pair uniqueness, DM tab, seen receipts, the left-workspace read-only state.
_Demo:_ two members DM each other; a third member cannot read the thread (server + pgTAP); the same two members in a second workspace get a separate thread.

**Part 6 — Announcements** · compose stepper, `AudiencePicker`, `app.resolve_announcement_audience`, recipient materialisation, publish/schedule/unpublish, parent view in `/family`, read tracking and the read-rate breakdown.
_Demo:_ publish to 3 sections; the preview count matches the materialised recipients exactly; a parent of one of those sections sees it and the read rate ticks up; a parent of another section cannot fetch it.

**Part 7 — Contact log** · the contact sheet from student/guardian surfaces with `tel:`/`wa.me`/`mailto:` hand-offs, the follow-up sheet, the pending-contact nag, the 24-hour immutability and corrections, the student timeline tab, follow-up notifications, admin export.
_Demo:_ tap Call on a phone, return to the app, and complete the log in under 30 seconds; try to edit it the next day and get the correction flow instead.

**Part 8 — Moderation + policy settings** · report action, moderation queue, delete-any with reason, channel mute, workspace messaging suspension, archive channel, `messaging_policy` settings in F-OP-07, audit events for every moderation act.
_Demo:_ an admin removes an offensive message; the author is notified with the reason; `audit_events` holds the actor, the reason and the previous body.

## 9. Acceptance criteria

**Tenancy and access (the Base44 disaster, made impossible)**

1. _Given_ a member of School A, _when_ they query `messages` with their JWT, _then_ zero School B rows are returned (pgTAP).
2. _Given_ a `parent` member, _when_ they open `/app/messages`, _then_ they are redirected, and `sendMessage` returns `forbidden`.
3. _Given_ a teacher not in `#staff`, _when_ they request that channel, _then_ they receive 403 and it does not appear in their channel list.
4. _Given_ a DM between A and B, _when_ C (an admin) queries it, _then_ zero rows are returned — admins moderate reported messages, they do not read DMs by default.
5. _Given_ a member removed by offboarding, _when_ they request a channel they belonged to, _then_ access is denied immediately (no cache window beyond the current request).

**Messaging** 6. _Given_ an open channel in two browsers, _when_ one posts, _then_ the other renders it in under 1 s without polling. 7. _Given_ a message sent twice with the same `client_nonce` (double tap / retry), _then_ exactly one row exists. 8. _Given_ a message 16 minutes old, _when_ its author edits it, _then_ the server returns `edit_window_closed`. 9. _Given_ an edited message, _then_ it renders "(edited)" and `message_edits` holds the previous body. 10. _Given_ an admin deletes a member's message with a reason, _then_ the message renders "Message removed by an admin", the author is notified with the reason, and `audit_events` contains the previous body. 11. _Given_ a muted member, _when_ they open the channel, _then_ the composer is disabled and names the time the mute ends, and a direct API call returns `muted`. 12. _Given_ a teacher assigned to Class 7 – B Physics, _then_ they appear in `#class-7b` without any manual action.

**Threads, mentions, attachments** 13. _Given_ a threaded reply, _then_ the parent shows the reply count, the thread opens as a sheet at 360×800, and participants receive `message.thread_reply`. 14. _Given_ a body containing an `@` token for a user who is not a channel member, _when_ it is sent, _then_ that id is stripped from `mentions` and no notification is sent to them. 15. _Given_ a mention notification, _when_ it renders in the bell, _then_ the body text is visible and tapping it opens the exact message (`action_url`). 16. _Given_ a 30 MB file, _then_ the upload is refused with the 25 MB limit named; _given_ a `.exe`, _then_ the type is refused. 17. _Given_ an attachment in a channel, _when_ a non-member requests its file id, _then_ the response is 403 and the attempt is logged. 18. _Given_ a deleted message with an attachment, _then_ the storage object is removed and subsequent signed-URL requests 404.

**Announcements** 19. _Given_ an audience of 3 sections, _when_ the preview is shown, _then_ the count equals the number of `announcement_recipients` rows created at publish. 20. _Given_ a published announcement, _then_ every linked guardian receives a notification and sees the card in `/family`. 21. _Given_ a parent of a section not in the audience, _when_ they request the announcement, _then_ they receive 403. 22. _Given_ 312 recipients of whom 214 have opened it, _then_ the publisher sees "214 of 312 read (69 %)" with a per-section breakdown. 23. _Given_ an audience that resolves to zero recipients, _when_ publish is attempted, _then_ it is refused with `audience_empty`. 24. _Given_ an unpublished announcement, _then_ it disappears from `/family` and the read statistics are preserved. 25. _Given_ v1, _then_ no reply affordance exists on any announcement for any role.

**Contact log** 26. _Given_ a teacher taps Call for a guardian, _then_ the `tel:` link fires **and** the follow-up sheet is presented; _when_ they save with outcome "Spoke" and a 20-character note, _then_ a `contact_log` row exists with `direction='outbound'`, `channel='phone'` and the correct `staff_user_id`. 27. _Given_ the follow-up sheet is dismissed without saving, _then_ a pending-contact chip remains on the student's card for the rest of the local day. 28. _Given_ a note of 5 characters, _then_ the server returns `note_too_short`. 29. _Given_ an entry 25 hours old, _when_ the author edits it, _then_ the edit is refused and the correction flow creates a linked entry. 30. _Given_ a follow-up dated today, _then_ the assigned member receives `contact_log.follow_up_due` and it appears on the dashboard. 31. _Given_ an admin exports the contact log for a date range, _then_ an `audit_events` row records the actor and the range. 32. _Given_ a teacher who does not teach the student's section, _when_ they read that student's contact log, _then_ zero rows are returned.

**Notifications** 33. _Given_ the notification event registry, _when_ CI runs, _then_ every `event_type` string written by any code path exists in the registry with an icon and templates (no silent fallback icon). 34. _Given_ 20 ordinary channel messages, _then_ zero notification rows are created and only the unread badge changes. 35. _Given_ every registered event type, _when_ each is rendered in the bell, _then_ title, body and a working `action_url` are present (snapshot test over the registry).

**Phone** 36. _Given_ a 360×800 viewport, _when_ a conversation is open with the keyboard up, _then_ the composer stays visible, the newest message is in view, and no horizontal scroll exists.

## 10. Tests

- **Unit**: mention parsing (including malicious/forged ids and unicode names); unread computation across `last_read_at` edge cases; the announcement audience resolver against a fixture school (overlapping sections, a guardian of two children in different sections counted once); contact-log validation (note length, backdating limit, forward-date rejection); the notification registry parity test; body sanitisation (no raw HTML, markdown subset only).
- **DB (pgTAP)**: isolation and escalation on `messages`, `channels`, `channel_members`, `conversations`, `announcements`, `announcement_recipients`, `contact_log`; the post-permission trigger under mute/suspension/archive; the sorted-pair uniqueness of direct conversations under concurrency; `app.can_open_message_file` truth table; the auto-channel recompute triggers.
- **Integration**: realtime delivery latency against the dev branch; `client_nonce` dedupe under a double-submit; announcement publish creating exactly N recipient rows; attachment upload → signed URL → member/non-member access.
- **e2e (360×800 and 1280×800, axe)**: J1 two contexts chatting live with a mention and a notification tap-through; J2 thread + camera attachment on phone; J3 announcement to 3 sections → parent sees it → read rate updates; J4 call a guardian → log in under 30 s → appears on the student timeline; J5 admin removes a reported message → author notified with reason.
- **Security**: XSS attempts in message bodies, channel names, announcement titles and contact notes (stored + reflected); an attempt to send with a forged `workspace_id`/`sender_id`; an attempt to subscribe to another workspace's realtime channel with a valid JWT (must yield nothing).
- **a11y**: live-region announcements are not chatty (debounced); long-press actions have visible equivalents; the composer and the audience picker are fully keyboard-operable; contrast on unread pills ≥ 4.5:1.
- **Performance budgets**: channel open (50 messages) p95 ≤ 700 ms; realtime delivery p95 ≤ 1 s; unread counts for 40 channels ≤ 200 ms (one query, not N); announcement publish to 500 recipients ≤ 3 s.

## 11. Open questions

1. **Parent ↔ school two-way messaging** is out of v1 (PRODUCT-DECISIONS §6.7 lists announcements as one-way). _Default assumed:_ parents get announcements + the contact log's phone hand-off. Two-way parent chat is FUTURE and will need a moderation model before it ships.
2. **Recruiter ↔ candidate DM** (raised by F-OP-01 §11 Q1): a candidate is not a member, so they cannot appear in `conversation_participants` under the current RLS. _Default assumed:_ candidate communication stays as templated email + application notes until hire. If the owner wants in-app candidate chat, it needs a separate `application_messages` table scoped to the application.
3. **SMS / WhatsApp Business** delivery of announcements is explicitly deferred (PRODUCT-DECISIONS §6.7, §7). The `announcement_recipients` table already has the shape a provider would need.
4. **Message search** is not in these parts. _Default assumed:_ v1 ships a simple `ilike` search scoped to the open channel; full-text search across the workspace is a follow-up part once volumes justify a `tsvector` column.
5. **Retention.** _Default assumed:_ messages are kept indefinitely; attachments follow storage quota pressure. A school-configurable retention window is FUTURE.
6. **The "Student Portal Feed"** (§3 row 74) is **not rebuilt** — students are not users in Campus v1 (PRODUCT-DECISIONS §1.22), and its visibility toggle was a hardcoded literal. Its intent (controlling what is shared) is served by announcements and by parent-visible flags on the underlying records.
