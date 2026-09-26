# F-ID-11 — Offline (platform-wide)

|                  |                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | platform                                                                                                                                      |
| Status           | Part 1 built (D-308, PR #83); Parts 2a–5 planned — D-71                                                                                       |
| Owner branch     | `feat/platform-offline`                                                                                                                       |
| Depends on       | F-ID-01 (sessions, sign-out), F-ID-03 (membership status, `WorkspaceContext`), F-AC-03 (attendance save, D-104), F-AC-06 Part 3 (marks entry) |
| Offline          | this spec defines the rule every other spec declares against (§5.1)                                                                           |
| Plan             | `docs/plan/ROADMAP.md` — "Basic mode and offline" note: its own track, six Parts                                                              |
| Base44 reference | none — the prototype had no offline path                                                                                                      |

## 1. Purpose

School work must not stop because the internet did. In Bangladeshi school buildings the signal drops in corridors and classrooms, mobile data runs out mid-month, and many teachers use old Android phones on slow connections. Owner decision (2026-09-26): offline is for the **whole app**, not only basic mode, and covers **literally everything except generating anything**. A teacher can take attendance, enter marks, look at their classes (students, routine, past marks) and make normal edits with no connection; the app keeps the work in a queue on the phone and sends it when the connection returns — through the **same server actions** the online path uses, so there is one set of rules, not two. Anything that **generates or sends** (PDFs and report cards, AI tools, SMS and notifications, payments, invitations and join codes, creating a school) shows a clear **"Needs internet"** state instead.

"Done" from the teacher's chair: she takes the roll for two classes with flight mode on, sees "Saved on this phone · 2 waiting to send", enters marks for a paper, walks to the staff room, and the chip turns into "All sent". Nothing she did is lost silently; anything the server refused is waiting for her in a "Needs attention" list with a plain reason.

This spec generalises F-AC-03 §4.6 (the attendance offline queue and the revocation purge) into one platform mechanism, and absorbs the offline halves of F-AC-03 Part 7 and F-AC-06 Part 4.

## 2. Roles and permissions

Offline adds **no permission** and relaxes none. A queued write is replayed with the user's live session through the normal server action, which runs every check (`requireWritable`, role, assignment, edit window, RLS) at replay time. What a user can read offline is exactly what they read online, cached on their own device.

| Action                                 | owner       | admin       | teacher     | staff       | parent              | platform                |
| -------------------------------------- | ----------- | ----------- | ----------- | ----------- | ------------------- | ----------------------- |
| Read cached pages/data offline         | own reads   | own reads   | own reads   | own reads   | own reads (F-AC-10) | no cache in `/platform` |
| Queue an offline-capable write         | per action¹ | per action¹ | per action¹ | per action¹ | per action¹         | no                      |
| See / retry / discard own queued items | own only    | own only    | own only    | own only    | own only            | —                       |

¹ The action's own permission key decides, at replay time.

Nobody can see or replay another user's queue: the queue lives on the device, scoped to one user (§5.6).

## 3. Data

**No new server tables.** The server side already has what replay needs:

- `app.idempotency_keys` (PK `(scope, key)`) — every offline-capable action takes a client key and returns the stored result on a replay (DATA-MODEL, D-104 `save_attendance`).
- The version check on attendance (`expected_updated_at` → `CONFLICT`, D-104).
- `audit_events.before/after` — the generic audit trigger keeps the overwritten value of every update, which is where "the later edit wins, the overwritten value is kept" (§5.4) lands.

**Attendance: two columns, added in Part 2b.** `attendance_sessions.captured_at timestamptz null` (the clock-corrected device time the roll was taken, sent only by a replay) and `attendance_sessions.synced_late boolean default false` (set when a replay was accepted outside the edit window under §5.3, like `edited_after_window`). Proposed; DATA-MODEL wins.

**Marks: one column, added in Part 3.** `marks.client_edited_at timestamptz null` — the time the teacher typed the value (clock-corrected, §5.4); used only to decide which of two edits to the same cell is later. Proposed; DATA-MODEL wins.

**On the device (IndexedDB, one database per user: `acadigma-<user_id>`):**

| Store    | Key                                  | Fields                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `outbox` | `id` (uuid v4 = the idempotency key) | `userId`, `workspaceId`, `kind` (`attendance.save`, `marks.cells`, `lessonplan.save`, `handout.upload`, …), `entityKey` (e.g. `attendance:<section>:<date>`), `payload`, `summary` (plain sentence for the queue sheet), `createdAt`, `attempts`, `status` (`pending \| sending \| conflict \| needs_attention`), `lastError` (code + message), `baseVersion` (e.g. the loaded session's `updated_at`) |
| `files`  | `outboxId`                           | `Blob`, `name`, `type`, `size` — attachments waiting with their outbox item                                                                                                                                                                                                                                                                                                                            |
| `meta`   | key                                  | `lastOnlineCheckAt`, `serverClockOffsetMs`, `lastSessionUserId`                                                                                                                                                                                                                                                                                                                                        |

**Read cache:** the service worker's Cache Storage (serwist runtime caches, names prefixed `acadigma-data-`) holds the pages and RSC payloads the user opened, plus the warm-up set (§4.2). Nothing is cached for `/platform`, `/api/files/*` signed URLs, or auth routes.

**Private data on the device** (student names, statuses, marks, guardian contacts on pages the user may read) is the reason for §5.6–5.8: it is wiped on sign-out, on revocation, and for a different user on a shared phone.

## 4. Workflows

**4.1 Going offline and coming back.** The app watches `navigator.onLine` plus the result of real requests (a failed fetch counts as offline even when `onLine` is true — captive portals and dead mobile data both lie). Offline → the DESIGN-SYSTEM §3.10 banner ("Offline — 3 changes will sync when you reconnect [View]"). Back online → "Syncing…" → "All sent" (auto-dismiss 2.5 s) or "Couldn't send 1 change [Review]" (stays).

**4.2 Reading offline (Part 1).** Every page the user has opened is served from cache when the network fails (network-first, cache fallback), with a **"Last updated 09:12 today"** stamp in the page header whenever the content came from cache. A page never opened shows a section-level "This needs internet the first time" state with a Retry button — never a blank page or the browser's dinosaur. **Warm-up:** on app open with a connection, the app quietly fetches the teacher's own class pages (their sections' roll call, roster, and — as they ship — routine and papers) so they are there the first time the signal drops. Only a teacher's own classes are warmed; admins get the pages they open.

**4.3 Writing offline (Part 2a onward).** _Trigger:_ a save in an offline-capable screen when the request fails with a network error (or the app already knows it is offline). _Steps:_ the screen writes an outbox item under its current idempotency key (§5.2 — a double-tap is one item; the screen takes a fresh key once the item is written), or, if an item for the same `entityKey` is still pending, **replaces that item's payload** (§5.2), and shows the optimistic result with a small "Waiting to send" mark on what was saved, and the top-bar **pending chip** reads "1 waiting". _Outcome:_ the work survives closing the app, rebooting the phone and a flat battery. _Audit:_ at replay the server action writes its normal audit row, with `queued_offline: true` and the item's `createdAt` in the payload.

**4.4 Replay.** Triggers (the same on Android and iPhone — iOS has no Background Sync, so v1 uses none anywhere, one code path): **app open**, the **`online` event**, **`visibilitychange` → visible**, and after any successful request while items are pending. Order: **serial** — one item at a time, oldest first. Each item calls its feature's normal server action with its idempotency key. Outcomes by reply:

| Reply                                                                                                                                                    | Item becomes                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| success, or the stored result of an earlier replay (idempotency hit)                                                                                     | removed; the page's optimistic mark clears                                                             |
| network error, timeout, 5xx, 429                                                                                                                         | stays `pending`; replay stops for now and retries on the next trigger (no backoff timer)               |
| `UNAUTHENTICATED` / expired session                                                                                                                      | queue **pauses**; §4.6                                                                                 |
| `CONFLICT` (attendance version check)                                                                                                                    | `conflict`; §4.5                                                                                       |
| any other named error (`OUTSIDE_EDIT_WINDOW`, `SESSION_LOCKED`, `SECTION_ARCHIVED`, `NOT_ASSIGNED`, `PLAN_READ_ONLY`, `SUBJECT_LOCKED`, `VALIDATION`, …) | `needs_attention` with the server's message in plain words; never retried automatically, never dropped |

**4.5 Conflicts.**
_Attendance_ (the existing version check, D-104): the replay carries the `updated_at` the teacher loaded; if someone saved the session since, the server returns `CONFLICT` with its session. The **conflict sheet** shows "Ms Nadia saved 6 – ক at 09:12, after you took the roll offline at 08:55", then only the students whose status differs, each with **theirs / mine**, and three buttons: **Keep theirs** (discard mine), **Use mine** (re-save all of mine against their version), **Save my choices** (the per-student picks). The re-save is a normal `saveAttendanceSession` with the new base version — the audit trail keeps both.
_Marks_ (owner's choice, per cell): no sheet. The later edit of each cell wins by `client_edited_at` (§5.4); the losing value is kept in the audit trail and the teacher is told once: "2 marks you entered offline had newer edits by Mr Karim; his values were kept. [See which]".
_Everything else_ declares its rule in its own spec (§5.1); the default for a single-record edit is the attendance pattern (version check + sheet).

**4.6 Session expiry while offline.** The queue does not need a live session to hold work; it needs one to send it. If replay gets `UNAUTHENTICATED` and the token refresh fails, the queue pauses and a banner says "Sign in again to send 3 saved changes". The sign-in screen then shows who the items belong to ("Saved by rahima@…"). After sign-in:

- **same user** (`user_id` matches the outbox's `userId`) → replay resumes;
- **a different user** → before the new session loads anything, a confirmation: "This phone has 3 unsent changes from another account (rahima@…). Continuing will delete them." **Continue** purges that user's database and caches (§5.7); **Go back** signs the new user out so the first user can sign in. Owner rule: a different user means purge — never replay one person's work under another's session.

**4.7 Sign-out.** Sign-out wipes the user's IndexedDB database, every `acadigma-data-*` cache, and the TanStack Query cache, then reloads to `/login`. If items are pending, sign-out first asks: "3 changes have not been sent yet. **Stay and send** / **Sign out and delete them**" (offline, "Stay and send" just closes the sheet).

**4.8 Revocation purge** (generalises F-AC-03 §4.6; ships **with** what it purges — the cache purge in Part 1, the outbox purge in Part 2a, as F-AC-03 §4.6 requires). On every app open and every return online, before rendering cached data, the app checks the session (`getUser`) and the active membership's status **and role**, comparing them with the values stored in `meta` at the last check. If the session is revoked, the account deleted, the membership `removed`/`suspended`, or the membership's **role changed** (a demoted admin must not keep pages cached under the old role):

- membership revoked in **one** workspace → purge that workspace's outbox items and every cache (a full `acadigma-data-*` clear — cache keys do not carry the workspace, §5.8);
- role changed in a workspace → purge every cache (reads are re-fetched under the new role); that workspace's outbox items stay and replay under the new role, where the server's checks decide;
- session or account revoked → purge the whole user database and every cache.

Pending items are lost by design: a dismissed teacher's phone must not keep children's names, statuses or marks. The purge runs from the page on load (not from sign-out), because a dismissed teacher does not sign themselves out.

**4.9 Needs internet.** Actions that generate or send (§5.1) render their button with a cloud-off icon and the label **"Needs internet"** while offline, disabled, with one line explaining ("Report cards are made on the server"). They never queue: a PDF queued for later is a PDF printed with stale data, and an SMS sent hours late is worse than none.

**4.10 Queue sheet and Needs attention.** The pending chip opens the **queue sheet**: every item in plain words ("Attendance · 6 – ক · Sun 27 Sep · waiting"), grouped as **Waiting**, **Needs your choice** (conflicts) and **Needs attention** (refused), with **Send now** at the top. A needs-attention item shows the server's reason and offers **Try again** (after the teacher fixed the cause, e.g. an admin reopened the edit window), **Show what I entered** (read-only view of the payload, so it can be re-typed or read to an admin), and **Delete** (confirmed, naming the item). Items are never removed without either a success or the user's own Delete. An item still waiting after 7 days turns the banner into a persistent "3 changes from last week have not been sent" (F-AC-03 §4.6).

**4.11 Phone specifics.** The chip sits in the top bar, inside the thumb-reachable right side on phones; the queue and conflict screens are bottom sheets; every action has a text label (basic mode sizes apply, F-ID-10). At ≥1024 the queue is a right-side panel.

## 5. Business rules and calculations

**5.1 What works offline — every feature declares it.** Each feature spec states one of three levels in its header (`Offline` row, `docs/features/_TEMPLATE.md`), and each server action that queues is listed in the `OUTBOX_KINDS` registry in `packages/domain/offline` (the TypeScript union of `kind`). The owner's target is "literally everything except generating anything", so **read** is an **interim** level, not a resting place: the areas listed there (admissions and transfers, routine, settings, …) are read-only offline only until a later Part registers their writes (D-71, lead decision under owner authorization 2026-09-26).

| Level              | Meaning                                         | Examples                                                                                                                                                                      |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **full**           | cached reads + queued writes                    | attendance roll call, marks entry, lesson plan edits, handout uploads (files wait in the queue), student notes, homework set/mark, profile & preference edits                 |
| **read** (interim) | cached reads; writes need internet for now      | students (admission, transfers), routine/timetable, past marks and results views, audit viewer, settings screens, staff directory                                             |
| **needs internet** | nothing offline beyond a "Needs internet" state | PDFs and report cards, print jobs, AI tools, SMS and notifications, payments and fee collection, invitations and join codes, creating a school, sign-up, the platform console |

A feature moves from **read** to **full** only in a Part that registers its `kind`, proves idempotent replay, and states its conflict rule.

**5.2 Idempotency keys.** uuid v4; **one key per save attempt**. The screen creates a key when it opens and keeps it while Save is retried or double-tapped (so those are one save), and **creates a new key after every successful save or enqueue** — a second, different save from the same screen (the teacher corrects one student and saves again) must never reuse a key, because `save_attendance` (and every action on the same contract) raises `IDEMPOTENCY_KEY_REUSED` when a key comes back with a different payload. Every offline-capable action requires a key and stores its result in `app.idempotency_keys` under its own scope; the same key with the same payload returns the stored result. `IDEMPOTENCY_KEY_REUSED` on replay is a client bug → Needs attention.

**Replace, don't stack.** When a new save is made for an `entityKey` that still has a **pending** (not yet sending) item, the new payload **replaces** that item's payload and key, and keeps its `baseVersion` — the teacher's own earlier, unsent save is not a version the server has seen, so stacking it would produce a `CONFLICT` against herself. An item already `sending` is left alone and the new save queues behind it with the base version that reply returns.

**5.3 Server time is the truth, with one bounded exception for late attendance.** The school day, read-only mode and permission checks run at replay time against the server clock (F-AC-03 §5.14), and no queued item carries "today". **Exception (D-71, lead decision under owner authorization 2026-09-26):** a replayed roll call that is now outside the edit window is **accepted** only when **all** of these hold: **no session exists yet** for that section and date (the late path creates a register, it never edits one); `captured_at` (clock-corrected, §5.4) is **≥ the session date** (start of that day, school timezone) and **≤ server `now()`**; `captured_at` falls inside the edit window for the session's date; **and** it arrives within **7 days** of `captured_at` (server clock). If any fails, the item goes to Needs attention. It is stamped `synced_late = true`, audited (`attendance.session.synced_late`, with `captured_at` and the arrival time), and shown to admins on the attendance overview and as a register footnote. Rural schools can be offline for days and losing a day's register is worse than the risk; clock tampering is visible in the audit (captured vs arrival time, the device's clock offset). Anything older → Needs attention for an admin ("Ask your admin to save 6 – ক for Sunday").

**5.4 Marks: the later edit wins, per cell.** Each queued cell carries `client_edited_at = device time at the keystroke + serverClockOffsetMs` (the offset is the difference between the server's `Date` header and the device clock at the last successful request), clamped to `[now − 30 days, server now]` on the server. An **online** `saveMarks` stamps `client_edited_at = server now()`, so every stored mark has a comparable time. On replay, per cell: if the incoming time is later than the stored mark's `coalesce(client_edited_at, updated_at)` → apply (the old value stays in `audit_events.before`); otherwise → do not apply, and write a `marks.offline_edit_superseded` audit event with the discarded value. Either way both values end in the audit trail. Locked papers and the entry window still refuse the whole item first.

**5.5 Queue limits.** At most 500 outbox items and 100 MB of queued files per user; a single file ≤ 20 MB (the same limit the upload action enforces). At the limit, new offline writes are refused with "The phone's waiting list is full — connect to send what's waiting" instead of silently evicting.

**5.6 Storage.** On first sign-in the app calls `navigator.storage.persist()` (Chrome grants it to installed PWAs; Safari may not). The outbox and its files are **never evicted by the app**; the read cache is capped at 50 MB and evicted oldest-first. `navigator.storage.estimate()` is checked on app open; if too little space is left for the outbox, a persistent banner asks the user to connect and send (the 50 MB read-cache cap is the only trimming). iOS may evict all site data after ~7 days without a visit — the 7-day banner (§4.10) and the "open the app" reminders are the mitigation, stated honestly in the test report.

**5.7 Shared phones.** One IndexedDB database per user (`acadigma-<user_id>`); sign-out wipes it (§4.7); a different user signing in purges the previous user's data after the confirmation (§4.6); the service-worker read cache is cleared on every sign-out and every sign-in (it is keyed by URL, not user). No local PIN in v1 (OQ-2).

**5.8 Workspace switch.** Page URLs do not carry the workspace (it is resolved from the session), so switching workspace clears the `acadigma-data-*` caches. Outbox items keep their `workspaceId`, which goes **in the action's input** on replay (as every action already takes it) and is checked through `resolveWorkspaceContext` like any other call — whatever workspace is active on screen.

**5.9 Maximum offline age (Part 5).** If the app has had no successful session check for **14 days**, cached student data is locked (not deleted) behind "Connect once to keep using saved data" until a check succeeds; queued items are kept. This bounds how long a revoked user's device can show data it cannot know is revoked.

## 6. UI

| Screen / element                    | Where                                 | 360×800                                                                                   | ≥1024       | Primary action    | Empty             | Loading          | Error                                     |
| ----------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- | ----------- | ----------------- | ----------------- | ---------------- | ----------------------------------------- |
| Offline banner                      | top of every shell                    | DESIGN-SYSTEM §3.10 (Offline → Syncing → All sent / Couldn't send)                        | same        | View              | —                 | progress bar     | persistent danger state                   |
| Pending chip                        | top bar                               | "3 waiting" / "1 needs you" (icon + number + word)                                        | same        | opens queue sheet | hidden when empty | spinner on send  | danger tone when anything needs attention |
| Queue sheet                         | bottom sheet from chip/banner         | Waiting / Needs your choice / Needs attention groups, Send now                            | right panel | Send now          | "Nothing waiting" | per-item spinner | per-item reason                           |
| Conflict sheet                      | from a conflict item                  | Who saved when, differing rows with theirs/mine, Keep theirs / Use mine / Save my choices | dialog      | Save my choices   | —                 | —                | error in sheet, choices kept              |
| "Last updated" stamp                | page header of any cached page        | "Last updated 09:12 today" (relative day, school timezone)                                | same        | Refresh           | —                 | —                | —                                         |
| Needs-internet state                | generate/send buttons; uncached pages | cloud-off icon + "Needs internet" + one line; section-level card for uncached pages       | same        | Retry (pages)     | —                 | —                | —                                         |
| Sign-out / other-user confirmations | sheets                                | plain sentence naming the count and the account                                           | dialog      | named per case    | —                 | —                | —                                         |

Components: `Sheet`, `Button`, `Badge`, `Alert`, `Skeleton` from `packages/ui`; new compositions `OfflineBanner`, `PendingChip`, `QueueSheet`, `ConflictSheet`, `LastUpdated`, `NeedsInternet` (DESIGN-SYSTEM §4.13 already names `PendingChip` and `ConflictSheet`).

## 7. Server contracts

**No new sync endpoint** (F-AC-03 §7). Replay calls each feature's existing server action. What this spec requires of those actions:

| Requirement                            | Applies to                | Detail                                                                                                                  |
| -------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `idempotencyKey` (uuid) in the input   | every `full`-level action | stored in `app.idempotency_keys`; replay returns the stored result                                                      |
| a base version where edits can collide | single-record edits       | e.g. `expected_updated_at`; mismatch → `CONFLICT` with the current server record attached                               |
| named, stable error codes              | every `full`-level action | the outbox classifies by code (§4.4); an unnamed error is treated as retryable, so actions must not throw raw DB errors |
| `queuedOffline`, `queuedAt` (optional) | every `full`-level action | written into the audit payload only; never used for authorisation — except attendance's `capturedAt`, bounded by §5.3   |
| `workspaceId` in the input             | all                       | checked through `resolveWorkspaceContext`; §5.8                                                                         |

Actions covered by the Parts: `saveAttendanceSession` (exists, D-104 — already has key and version), `saveMarks` (F-AC-06 P3; Part 3 here adds per-cell `clientEditedAt`), `updateUiPreferences` (F-ID-10, last-write-wins), then lesson plan and handout actions as they ship.

Client module (`apps/web/lib/offline/`): `enqueue(kind, payload, opts)`, `replay()`, `purgeUser(userId)`, `purgeWorkspace(workspaceId)`, `useOutbox()` (for chip/sheet). Built on the native IndexedDB API with a thin promise wrapper — no new dependency unless the Part shows a need.

## 8. Parts (build chunks)

**Part 1 — App shell, read cache and the cache purge** · serwist runtime caching for pages/RSC payloads (network-first, `acadigma-data-` caches, 50 MB cap, `/platform`/auth/file URLs excluded), `LastUpdated` stamp, the "needs internet the first time" page state, `NeedsInternet` on existing generate/send buttons (reports, invitations, create school), the offline banner (offline/online states only), warm-up of the teacher's own class pages, **cache clear on sign-out, sign-in and workspace switch**, and the **revocation check with the cache half of the purge** (§4.8: session revoked, membership removed/suspended, or role changed → every data cache cleared before any cached render) — shipped with the cache, not later, because the cache holds student data · files: `apps/web/app/sw.ts`, `apps/web/lib/offline/*`, shell components · tests: Playwright `context.setOffline(true)` — an opened roster page reloads offline with a "Last updated" stamp; an unopened page shows the needs-internet state; sign-out then offline → no cached roster; workspace switch → no `acadigma-data-*` entries; membership removed or role changed from an admin context → the teacher's next open has no cached roster (Cache Storage read directly); unit tests for the offline detector · **Demo:** open Class 6 – ক, switch flight mode on, reload: the roster is there with "Last updated 09:12"; the Report card button reads "Needs internet".

**Part 2a — The generic outbox, with attendance on it** (absorbs F-AC-03 Part 7's offline half; the scan hook stays in F-AC-03 P7) · IndexedDB per-user database, `enqueue`/`replay` with the §4.4 outcome table (serial, retry on the triggers only), the §5.2 key rules (new key after each save or enqueue; replace a pending item's payload for the same `entityKey`), replay triggers (open, online, visible), `PendingChip`, `QueueSheet` with Needs attention, pending-items confirmation on sign-out, the 7-day banner, the §5.5 limits, and the **outbox half of the revocation purge** (§4.8 — it ships with the queue, as F-AC-03 §4.6 requires) · tests: Playwright offline journey (take the roll for two sections offline → reconnect → exactly two sessions, chip clears), replay idempotency (force a replay after success → still one session), save-correct-save from one screen offline → one item, one session, no `CONFLICT` and no `IDEMPOTENCY_KEY_REUSED`, archived-section item → needs attention, membership removed → outbox purged before render; unit tests for the outcome classifier, key rotation and replace-on-pending · **Demo:** flight mode on, take attendance for two classes, correct one and save again, flight mode off: both send once, no duplicates.

**Part 2b — Conflicts, late sync and session expiry** · the attendance `ConflictSheet` (keep theirs / use mine / per-student), `captured_at`/`synced_late` with the §5.3 late-sync rule in `save_attendance` and its admin footnote, session-expiry pause + same-user resume + different-user purge confirmation · tests: conflict journey (second context saves first → sheet → Save my choices → audit has both), pgTAP for late sync (no existing session + captured in window and within [session date, now] + arrived ≤ 7 days → accepted and stamped; session already exists, captured before the session date, captured in the future, or arrived after 7 days → refused), session-expiry same-user resume and different-user purge journeys · **Demo:** a colleague's earlier save produces the conflict sheet; a roll call held offline for four days lands with a "synced late" footnote.

**Part 3 — Marks on the outbox** (absorbs F-AC-06 Part 4's offline half; needs F-AC-06 Part 3) · `saveMarks` accepts `clientEditedAt` per cell and stamps `server now()` on online saves, `marks.client_edited_at` column, the §5.4 per-cell rule (`coalesce(client_edited_at, updated_at)`) in the save function, `marks.offline_edit_superseded` audit event, server-clock offset in `meta`, the one-time "newer edits were kept" notice · tests: pgTAP for the per-cell rule (later wins, earlier is audited not applied, clamp to server now, a mark saved before the column existed compares by `updated_at`), Playwright: two contexts edit the same cell, the offline one older → the online value stays and audit holds both · **Demo:** enter 40 marks offline, a colleague fixes one mark online meanwhile, reconnect: 39 of hers land, his correction stays, and the audit shows both.

**Part 4 — Lesson plans and handouts** (scheduled when F-TE-01 and F-TE-05 ship their edit/upload Parts) · `lessonplan.save` and `handout.upload` kinds, file blobs in the `files` store with the §5.5 limits, upload replay through the normal upload action, per-item progress in the queue sheet · tests: offline upload of a 5 MB PDF survives an app restart and uploads once on reconnect; the 20 MB and 100 MB limits · **Demo:** attach a handout offline, close the app, reopen online: it uploads once.

**Part 5 — Offline age lock and storage** · the 14-day maximum offline age lock (§5.9), `storage.persist()` and the quota check with its banner (§5.6), a review of every cached route for data a role should not keep (parents, staff), and the security reviewer's pass · tests: 14-day lock with a mocked clock (cached pages locked, queued items kept, unlocked by one successful check); quota banner with a mocked `estimate()` · **Demo:** a phone left offline for 15 days shows "Connect once to keep using saved data" and unlocks the moment it reconnects.

## 9. Acceptance criteria

1. **Given** a teacher who opened Class 6 – ক's roster online, **when** the network is off and the page reloads, **then** the roster shows with "Last updated <time>", and a page never opened shows "This needs internet the first time" with Retry.
2. **Given** no network, **when** the teacher takes and saves the roll for two sections, **then** the chip reads "2 waiting", and **when** the network returns, **then** exactly two sessions exist on the server, each with one audit row carrying `queued_offline: true`, and the chip disappears.
3. **Given** an item was sent successfully, **when** the same item is replayed (e.g. the success reply was lost), **then** the server returns the stored result and no second session or audit row appears.
4. **Given** a teacher took the roll offline from a loaded session and a colleague saved the same section/date meanwhile, **when** the teacher's item replays, **then** the conflict sheet shows only the differing students and nothing is overwritten until the teacher chooses.
5. **Given** a queued roll call for a section archived meanwhile, **when** it replays, **then** it moves to Needs attention with the reason in plain words, is not retried automatically, and stays until the teacher deletes it or it succeeds.
6. **Given** two edits to the same mark cell — the offline one typed at 10:00, an online one at 12:00 — **when** the offline edit replays at 14:00, **then** the 12:00 value stays, the 10:00 value is recorded in `audit_events` as superseded, and the teacher sees the "newer edits were kept" notice once.
7. **Given** the session expired while offline with 3 items waiting, **when** the same user signs in again, **then** the 3 items replay; **given** a different user signs in instead, **then** they are asked to confirm deleting 3 unsent changes, and on Continue the first user's database and caches are empty.
8. **Given** pending items, **when** the user taps Sign out, **then** they are asked "Stay and send / Sign out and delete them"; **after** sign-out, IndexedDB has no `acadigma-<user_id>` database and Cache Storage has no `acadigma-data-*` cache.
9. **Given** an admin removed a teacher's membership, **when** the teacher's app next opens online, **then** the outbox and every data cache are purged before any cached page renders; **given** the admin only changed the member's role, **then** every data cache is purged before render and the outbox is kept.
10. **Given** no network, **when** the user views a report-card, invitation, SMS, payment or create-school button, **then** it shows "Needs internet", is disabled, and no item is queued.
11. **Given** an iPhone (no Background Sync), **when** the app returns to the foreground online with items waiting, **then** replay starts within 2 s without any user action.
12. **Given** the school is read-only (D-300), **when** a queued item replays, **then** it lands in Needs attention with "Your school is read-only — ask the owner" and is not lost.
13. **Given** a roll call taken offline on Sunday (inside the 2-day window) that reaches the server on Thursday, **when** it replays, **then** it is saved with `synced_late = true`, an `attendance.session.synced_late` audit row, and a footnote on the admin overview; **given** it reaches the server 8 days after it was taken, **then** it goes to Needs attention for an admin.
14. **Given** a session for 6 – ক on Sunday already exists on the server, **when** a teacher's offline Sunday roll call replays on Thursday, **then** it is not saved through the late path and goes to Needs attention; **given** no session exists but the item's `captured_at` is before Sunday or later than the server's `now()`, **then** it also goes to Needs attention and nothing is written.
15. **Given** the app has had no successful session check for 14 days, **when** it opens offline, **then** cached pages are locked behind "Connect once to keep using saved data", queued items are kept, and one successful check unlocks them.
16. **Given** 500 items or 100 MB of queued files are waiting, **when** the teacher makes another offline save, **then** it is refused with "The phone's waiting list is full — connect to send what's waiting" and nothing already queued is evicted.
17. **Given** a user with cached pages in School A, **when** they switch to School B, **then** Cache Storage has no `acadigma-data-*` entries and School A's queued items still replay into School A.

## 10. Tests

- **Unit (`packages/domain/offline`, `apps/web/lib/offline`)**: outcome classifier (every named code → state), serial oldest-first order, key rotation after save/enqueue, replace-on-pending for one `entityKey`, clock-offset correction and clamp, limit checks, purge selectors.
- **DB (pgTAP)**: Part 3's per-cell rule and superseded audit event; idempotent replay of `save_attendance` and `save_marks` with the same key; `IDEMPOTENCY_KEY_REUSED` on a changed payload.
- **Integration**: each `full`-level action with a key replayed twice; `CONFLICT` payload shape; `PLAN_READ_ONLY` on replay.
- **E2E (Playwright `context.setOffline`, 360×800 and 1280×800, axe on banner/chip/sheets)**: `offline-read-cache`, `offline-attendance-sync`, `offline-attendance-conflict`, `offline-marks-later-wins`, `offline-session-expiry-same-user`, `offline-shared-phone-purge`, `offline-revocation-purge`, `needs-internet-buttons`. Each e2e that asserts a purge reads IndexedDB and Cache Storage directly.
- **Manual**: one old Android (8–10) and one iPhone per Part — flight-mode journeys, app kill and reboot with items pending, iOS foreground replay; recorded in the Part's test report.
- **Performance**: enqueue < 50 ms; replay of 20 queued roll calls < 30 s on Slow 4G; the service worker adds < 15 KB gzipped to the shell budget (DESIGN-SYSTEM §7.2).

## 11. Open questions

- **OQ-1 — Background Sync on Android.** Not used in v1 (one code path for Android and iPhone; replay on open/online/visible). Add it only if field data shows items waiting too long on Android.
- **OQ-2 — A local PIN or lock for shared phones.** Not in v1; sign-out and per-user purge are the protection. Needed if schools share one phone between many teachers who stay signed in.
- **OQ-3 — RSC page caching.** Part 1 caches rendered pages and RSC payloads through serwist. If Next's App Router payloads prove unreliable to serve from cache (deploy-version mismatches), the fallback is a JSON read cache per screen in IndexedDB; Part 1 decides with the offline Playwright test and records it.
- **OQ-4 — Parents offline.** The family shell (F-AC-10) is read-only offline by default. Confirm there is no parent write that needs queuing.
- **Size, stated honestly:** six Parts (Part 2 is split in two) of about two days each, and it touches every `full`-level feature's action contract (keys, versions, named errors). Parts 1–2b are the bulk of the risk; Part 4 waits for features that do not exist yet. This is a track of its own, not a side task of basic mode.

### Status — Part 1 (D-308, PR #83)

Built: the service worker caches full page loads of the signed-in shells (`/app`, `/family`, `/personal`) network-first in `acadigma-data-pages` (60 entries, 30 days); a page reached by an in-app navigation is fetched once in the background so it is cached too; `/api/*`, RSC payloads, auth pages, `/account` and `/platform` are never cached; the caches the old `defaultCache` worker filled (`pages`, `pages-rsc`, `apis`, `others`, …) are deleted when the new worker activates. "Last updated 09:12 today" on a page served from the cache (the shell's render time travels with the cached copy). The offline banner (offline state). "This needs internet the first time" with Retry for a page never opened. `OnlineOnly` shows "Needs internet / ইন্টারনেট দরকার" on the report-card, bulk report-card and sample PDF buttons, the PDF download link, Publish, the student import, Create school, guardian invitations (create and accept), the attendance register and the exam mark sheet. The purge: `GET /api/offline/session` + `decidePurge` (unit-tested) on every app open, every return online and on entering a shell from outside it; unconditional wipes (no network needed) on arriving at `/login`, on the menu and invite-page sign-outs, and on a workspace switch (`check.test.ts`, `offline-provider.test.tsx`; the journey reads Cache Storage after a switch and after sign-out).

Deviations (D-308):

- **OQ-3 decided:** RSC payloads are not cached. An RSC fetch that fails offline makes Next fall back to a full navigation, which the page cache answers. Cost: one background page fetch per in-app navigation (at most once per URL per 10 minutes).
- **The snapshot** (user, workspace, role) lives in `localStorage` (non-secret ids), not IndexedDB `meta` — Part 2a moves it with the outbox.
- **The first check after a sign-in does not purge:** `/login` already wiped the cache unconditionally; a sign-in that skips `/login` (invite, register) meets the previous user's snapshot and purges.
- **Byte cap:** an entry count (60) stands in for the 50 MB cap until Part 5's quota work.
- **Not built in Part 1:** the warm-up of the teacher's class pages (§4.2 — the navigation copy covers "pages I opened"), `storage.persist()` and the quota banner (Part 5), failed-request offline detection (Part 2a, with the outbox), SMS/AI buttons (those screens do not exist yet; they use `OnlineOnly` when they ship), the membership-removed and role-changed e2e cases (the rule is unit-tested; the journey covers sign-out and a workspace switch).
