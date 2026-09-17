# WF-10 — Messaging and announcements: channels, DMs, realtime, receipts, contact log

|                  |                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Journey          | The school's daily conversation — staff chat, one broadcast to parents, and a safeguarding record of the call that happened outside the app                                                                        |
| Primary actors   | Teacher · Admin / principal · Parent (receive only)                                                                                                                                                                |
| Secondary actors | Class teacher (section announcements) · Owner (moderation)                                                                                                                                                         |
| Features         | **F-OP-05** (messaging, announcements, contact log, notification taxonomy) · F-ID-07 (notifications) · F-ID-03 (membership → channel membership) · F-AC-01/02 (sections, guardians) · F-OP-06 (offboarding revoke) |
| Plan gate        | `messaging` is available on **Free** — it is the module that makes the app worth opening daily                                                                                                                     |
| Exit state       | Every message carries a `workspace_id`, parents receive announcements and nothing else, and every phone call to a guardian leaves a `contact_log` row                                                              |

---

## 1. Actors and preconditions

| Actor               | Device             | Access                                                               |
| ------------------- | ------------------ | -------------------------------------------------------------------- |
| **Teacher / staff** | Android phone      | Channels they belong to, DMs, contact log for their own sections     |
| **Admin / owner**   | Windows PC + phone | All of the above, plus announcements to any audience and moderation  |
| **Class teacher**   | Android phone      | Announcements to **their own section only**                          |
| **Parent**          | Android phone      | `/family/announcements` only — **parents have no chat access in v1** |

**Preconditions**

- Active memberships (WF-01); `sections` and `section_subjects` populated, because section channels are derived from them; `guardian_users` links exist (WF-02), because the announcement audience resolves through them.
- Supabase Realtime publication on `messages` and `notifications`, filtered by RLS.
- The notification **event registry** (`packages/domain/notifications/events.ts`) is populated, and the CI parity test that every `event_type` written anywhere exists in the registry is green.

---

## 2. Sequence

```mermaid
sequenceDiagram
    autonumber
    actor T as Teacher
    actor A as Admin / principal
    participant C as Client
    participant RT as Supabase Realtime
    participant SA as Server Actions
    participant DB as Postgres + RLS
    participant JOB as jobs / Resend
    actor T2 as Head teacher
    actor P as Parent

    Note over DB: triggers keep channels in step with membership and section_subjects

    T->>C: /app/messages → #class-6a
    C->>RT: subscribe messages:channel_id=eq.{id}
    T->>C: types @Nadia, attaches a photo of the board
    C->>SA: sendMessage({channelId, body, attachmentFileIds, clientNonce})
    SA->>DB: messages + message_attachments (files private)
    DB->>DB: mentions re-parsed server-side; ids not in channel_members are stripped
    DB-->>RT: postgres_changes insert
    RT-->>T2: renders in < 1 s (no polling)
    DB->>DB: notifications: message.mention → Nadia (action_url = the exact message)

    A->>C: /app/messages/announcements/new (3-step stepper)
    C->>SA: previewAnnouncementAudience({audience})
    SA->>DB: app.resolve_announcement_audience → "312 parents of 8 sections, 41 staff"
    A->>C: Publish
    C->>SA: publishAnnouncement({id})
    SA->>DB: announcements(published) + announcement_recipients materialised
    DB->>DB: notifications: announcement.published × N
    SA->>JOB: email per notification_preferences → email_log
    P->>C: /family/announcements → opens card
    C->>SA: markAnnouncementRead({id})
    SA->>DB: announcement_recipients.read_at
    A->>C: "214 of 312 read (69 %)" with a per-section breakdown

    T->>C: student page → Contact a parent → Call
    C-->>T: tel: deep link fires AND the follow-up sheet opens behind it
    T->>C: outcome "Spoke" + a one-line note
    C->>SA: createContactLog({studentId, guardianId, channel:'phone', …})
    SA->>DB: contact_log (immutable after 24 h)
    DB->>DB: notifications: contact_log.follow_up_due (if a follow-up date was set)
```

---

## 3. Steps

### Stage A — Channels maintain themselves (F-OP-05 W1, §5.1)

1. Triggers create and maintain three kinds of automatic channel so nobody has to curate them:
   - **`#general`** — `visibility='role_restricted'`, roles `{owner, admin, teacher, staff}`; every active non-parent member joins on activation.
   - **`#staff`** — `{owner, admin, staff}`, teachers excluded unless `messaging_policy.staff_channel_includes_teachers`. **This replaces the prototype's ungated `#admin`.**
   - **`#class-{section-slug}`** — one per section; members are the class teacher + every teacher on a `section_subjects` row (primary or assistant) + admins/owners, **recomputed in the same transaction** as any change to `section_subjects` or `sections.class_teacher_id`.
     _Writes:_ `channels`, `channel_members`, plus `messages.system_event` rows that narrate joins and leaves in the channel itself.
2. Custom channels are created by anyone with `channel.create` (teachers included by default, switchable per school). Auto channels are immutable as to membership — `updateChannelMembers` returns `auto_channel_immutable`.

### Stage B — Send, thread, mention, attach (F-OP-05 W2)

3. **`/app/messages`** at 360×800 is a **segmented control** (Channels · DMs · Announcements) over a row list with avatar, name, last message and an unread pill. Tapping opens the conversation **full screen** — not a sheet, because typing needs the whole viewport — with a sticky composer above the keyboard, a back chevron top-left and the channel menu top-right. The unread badge lives on the bottom-nav Messages icon and caps at 99+.
4. **Send** appends optimistically with a `client_nonce`; the server action returns the canonical row; Realtime delivers it to everyone else in **under a second**.
   _Writes:_ `messages` (`workspace_id` — the column the prototype never had — exactly one of `channel_id` / `conversation_id`, `sender_id`, `body` ≤ 4000 chars rendered as a **safe markdown subset with no raw HTML**, `mentions uuid[]`, `client_nonce`).
5. **Mentions** are re-parsed **server-side** from the composer's `@[name](user_id)` tokens; any id that is not in `channel_members` is stripped, so a forged mention cannot notify a stranger. `@channel` / `@here` are moderator-only and capped at 3 per channel per day.
6. **Threads** are real: `parent_message_id` with a trigger-maintained `reply_count` and `last_reply_at`. The channel row shows "3 replies"; the thread opens as a **bottom sheet** on phone and a right panel on desktop.
7. **Attachments** go to the **private** bucket (≤ 25 MB, ≤ 5 per message, images/PDF/office/text/audio only; executables and archives refused), counted against the workspace's storage quota. Images render as thumbnails through 5-minute signed URLs; every open is gated by `app.can_open_message_file(file_id)` and written to `file_access_log`.
8. **Editing** is allowed for 15 minutes, stores the previous body in `message_edits`, and renders "(edited)". **Deleting** leaves a tombstone (`body = null`, `deleted_at`, `deleted_by`, `deleted_reason`) that renders _"Message removed"_ — plus _"by an admin"_ when the deleter is not the author — and removes the storage objects. Nothing is hard-deleted except by a platform data-protection action.
9. **Reactions** (`message_reactions`, unique per message × user × emoji) exist for the cheapest possible reason: they remove most "noted, thanks" messages from a channel.

### Stage C — Direct messages (F-OP-05 W3)

10. Tapping a member in the directory → **Message** creates or reuses a **workspace-scoped** direct conversation, unique on the sorted participant pair. Two people who share two workspaces get **two separate threads**, because a message about School A must never surface in School B.
    Structurally, a DM has **no `channel_id`**, which is why the prototype's DM-leaks-into-`#general` bug cannot recur here.
11. DM receipts are a simple _Seen 14:02_. A DM with someone who has left the workspace is read-only with a banner.
12. **Admins do not read DMs.** A pgTAP test asserts that an admin querying a conversation they are not a participant in gets zero rows; moderation acts on **reported** messages only.

### Stage D — Announcements to parents (F-OP-05 W4)

13. **Compose** at `/app/messages/announcements/new` is a **full-screen three-step stepper on phone** (Compose → Audience → Review), because the audience picker is the whole point and needs room.
14. The **audience** is a jsonb selector over sections, grade levels, `all_parents` and staff roles. **Preview shows the resolved recipient count before publishing** — "312 parents of 8 sections, 41 staff" — computed server-side by `app.resolve_announcement_audience`, which walks `guardian_users → students → enrollments → sections` and counts a guardian of two children in the audience **once**.
15. **Publish** (or a job at `scheduled_at`) materialises `announcement_recipients` so read rates stay real and stable even if a student later changes section.
    _Writes:_ `announcements` (`status='published'`, `published_at`, `published_by`, `pinned_until`), `announcement_recipients`, `announcement_attachments`.
    _Events:_ `notifications`: `announcement.published` to every recipient, plus email per `notification_preferences` → `email_log`.
16. Parents see it in **`/family/announcements`** as a card list, unread first. Opening it sets `read_at`. The publisher sees **"214 of 312 read (69 %)"** with a per-section breakdown so they know which class to chase.
17. **Announcements are one-way.** `allow_replies` exists in the schema and is forced false in v1; the card carries the school's phone number as a `tel:` link instead. Two-way parent chat is FUTURE — a surface open to hundreds of parents needs moderation capacity a school does not have on day one.

### Stage E — Contact log, the safeguarding record (F-OP-05 W5)

18. From a student page, a guardian card, an attendance alert (WF-03) or the Messages → Contacts tab, a sheet lists the student's guardians with their numbers. Tapping **Call** fires the `tel:` deep link **and immediately opens the follow-up sheet behind it**, so returning to the app lands on the form.
19. The follow-up sheet is deliberately tiny — completable one-handed while holding a phone to the other ear: outcome (Spoke · No answer · Left message · Wrong number), a purpose chip (attendance / academic / behaviour / fees / health / admission / general), one note field, optional follow-up date.
    _Writes:_ `contact_log` (`student_id`, `guardian_id`, `staff_user_id`, `direction`, `channel ∈ phone|whatsapp|sms|email|in_person|other`, `purpose`, `note` **≥ 10 characters**, `occurred_at`, `outcome`, `follow_up_at`).
20. WhatsApp uses `https://wa.me/{e164}?text=…` from a template and email uses `mailto:`; both open the same follow-up sheet.
21. **If the sheet is dismissed without saving**, a pending-contact chip stays on the student's card for the rest of the local day: _"You called Rahim's father at 11:20 — add a note."_ Nagging beats an empty record.
22. Entries are **immutable after 24 hours**; a correction appends a new row with `corrects_id`. Follow-ups due today appear on the dashboard and fire `contact_log.follow_up_due`. Admin export (CSV/PDF) writes an `audit_events` row naming the exported range — this record can end up in a safeguarding file.
23. The student timeline shows contact entries **alongside attendance and behaviour**, so a pattern is visible on one screen.

### Stage F — Notifications that are not noise (F-OP-05 §5.5)

24. A `notifications` row is created **only** for: a mention, a DM, a thread reply in a thread you are in, a channel invitation, an announcement, and a due follow-up. **Ordinary channel messages produce no notification row** — only the in-app unread badge and, in the native wrappers, a silent push that updates the badge.
25. Every notification has `action_url` **not null** and a body column actually named `body`; a snapshot test renders one notification per registered event type and asserts title, body and a working link. Email digests batch unread items for 30 minutes and are capped at one per hour per user.

### Stage G — Moderation (F-OP-05 W6)

26. Any member can **Report** a message; reports land in a small queue at `/app/messages/moderation` for admins with one-tap actions. Admin actions: delete with a reason (tombstone), mute a member in a channel until a time, suspend a member from all messaging (`workspace_members.messaging_suspended_until`), archive a channel.
27. Every moderation act writes `audit_events` **with the previous body** and notifies the affected member with the reason. A moderator cannot delete an admin's message unless they are an owner.

---

## 4. Failure and edge cases

| Case                                                                  | Detection                                                                           | Behaviour                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Message sent twice (double tap, retry)                                | `client_nonce`                                                                      | Exactly one row                                                          |
| Edit at 16 minutes                                                    | Server                                                                              | `edit_window_closed`                                                     |
| Muted member posts                                                    | Trigger on `messages` **and** `domain/permissions`                                  | Composer disabled naming the end time; a direct API call returns `muted` |
| Suspended member                                                      | `messaging_suspended_until`                                                         | Same, workspace-wide                                                     |
| Archived channel                                                      | `channels.archived_at`                                                              | `archived_channel`; history stays readable                               |
| Forged `@` token for a non-member                                     | Server re-parse                                                                     | Id stripped; no notification                                             |
| Attachment 30 MB or `.exe`                                            | Type/size guard                                                                     | Refused with the limit named                                             |
| Non-member requests an attachment's file id                           | `app.can_open_message_file`                                                         | 403 + a `file_access_log` denial row                                     |
| Attachment on a deleted message                                       | Deletion removes storage objects                                                    | Subsequent signed-URL requests 404                                       |
| Member removed mid-session                                            | Offboarding sets `channel_members.left_at` and `workspace_members.status='removed'` | Channel access denied on the **next request** — no cache window (WF-11)  |
| Parent opens `/app/messages`                                          | Nav filter + server policy + RLS                                                    | Redirected; `sendMessage` returns `forbidden`; zero channel rows         |
| Teacher requests `#staff` they are not in                             | RLS                                                                                 | 403 and the channel is absent from their list                            |
| Announcement audience resolves to zero                                | Server                                                                              | Publish refused with `audience_empty` and the reason named               |
| Parent of a section not in the audience fetches it                    | `announcement_recipients` + RLS                                                     | 403                                                                      |
| Announcement unpublished                                              | `status='unpublished'`                                                              | Card disappears from `/family`; **read statistics are preserved**        |
| Student changes section after publish                                 | Recipients materialised at publish                                                  | Read rate stays stable and honest                                        |
| Guardian with no phone number                                         | Contact sheet                                                                       | "No number on file" + an edit link                                       |
| Contact note under 10 characters                                      | Server                                                                              | `note_too_short`                                                         |
| Contact entry forward-dated                                           | Server                                                                              | Rejected; backdating up to 7 days is allowed                             |
| Contact entry edited next day                                         | 24-hour immutability                                                                | The correction flow creates a linked entry instead                       |
| Teacher reads the contact log of a student they do not teach          | RLS                                                                                 | Zero rows                                                                |
| Realtime subscription with a valid JWT to another workspace's channel | RLS on the publication                                                              | Yields nothing (security test)                                           |
| Unknown `event_type` written by new code                              | CI registry parity test                                                             | **Build fails** — an icon map can never drift from the enum again        |

---

## 5. What the Base44 prototype did instead

Messaging was Slack-lite **built twice** — `/messaging` and the "Internal Messages" tab of `/communication` — with different sorting, different semantics and a delete-own-message button in only one of them. The `Message` table had **no tenant column and no RLS**, so **every message in the product was readable by every user of every school**; and `/messaging` was the one route inside the app shell with **no role guard at all**, so a parent could open it and read and post in `#admin` — a channel whose own in-product description read _"Admin & admin only"_. Recruiter↔candidate DMs **leaked into `#general`**, because one of the two implementations filtered by `channel` and forgot `is_direct:false` while the other included it. `thread_id` was in the schema and was never written or read, so threading was designed and not built. Delivery was a **5-second poll**, and messages produced **no notifications of any kind**. The notification bell itself was broken in three ways at once: it rendered `n.body` when the column is `message`, so **notification bodies never displayed at all**; its `typeConfig` icon map keyed on `print_ready | print_failed | attendance_anomaly | message | exam_reminder | system_alert | recovery_modal`, which intersects the schema's enum (`info | warning | action_required | approval_request | system | marketplace | recruitment | cover_teacher | ai_credits | billing`) in **zero places**, so every row fell through to the same generic icon; and `action_url` was never used, so notifications were not clickable. Worse, every writer set `school_id: user?.school_id || 'default'` against a field that does not exist on the User schema, while the dashboard read `Notification.filter({school_id: activeWorkspaceId})` — so the widget **never matched a single row** and every notification in the system landed in one shared pseudo-tenant. Parent outreach was three OS deep links (`tel:`, `wa.me`, `mailto:`) with **nothing recorded anywhere** — no message, no audit log, no activity item — and the "Student Portal Feed" beside it carried a caption inviting the user to "toggle visibility to control what students see" over a hardcoded boolean literal with no toggle in existence. The activity-feed helper that would have logged any of this, `logActivity()`, had **zero call sites** in the entire codebase, and the permission key guarding the feed guarded a feature that did not exist.
