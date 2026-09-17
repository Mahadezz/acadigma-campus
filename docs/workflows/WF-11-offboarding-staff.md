# WF-11 — Offboarding a staff member: remove → instant revoke → orphan → reassign → audit

|                  |                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journey          | A teacher resigns on the 20th. By the time they walk out, their classes have a teacher, their worksheets have an owner, and their login opens nothing                                                                                                                                                                               |
| Primary actor    | Admin / owner                                                                                                                                                                                                                                                                                                                       |
| Secondary actors | Departing member · Receiving teachers · Head of department (reassignment) · Owner (audit)                                                                                                                                                                                                                                           |
| Features         | **F-OP-06** (staff records, offboarding checklist, revoke transaction) · **F-ID-03** (membership lifecycle, last-owner invariant, ownership transfer) · F-TE-05 (resource orphaning) · F-AC-01 (section/section_subject reassignment) · F-OP-02 (cover) · F-OP-04 (print queue) · F-OP-05 (channel revoke) · F-ID-09 (audit viewer) |
| Non-negotiable   | **Nothing is ever deleted.** `workspace_members` has **no DELETE grant to anyone**; removal is `status='removed'` (PRODUCT-DECISIONS §1.14)                                                                                                                                                                                         |
| Exit state       | `workspace_members.status='removed'`, `staff_records.employment_status='left'`, zero dangling assignments, one audit event summarising every consequence                                                                                                                                                                            |

---

## 1. Actors and preconditions

| Actor                    | Device        | Needs                                                              |
| ------------------------ | ------------- | ------------------------------------------------------------------ |
| **Admin / owner**        | Windows PC    | `offboarding.run`; an owner is required to offboard another owner  |
| **Departing member**     | Android phone | Nothing — they may be mid-session on another device when this runs |
| **Receiving teacher(s)** | Android phone | An active membership; they are notified of what they inherit       |

**Preconditions**

- A `staff_records` row exists with `employment_status='active'` and a linked `membership_id` (created at hire, WF-08, or backfilled for pre-existing staff).
- The **last-owner invariant** holds: a `school` workspace always has ≥ 1 active `owner`. Offboarding the last owner is refused — ownership must be transferred first (F-ID-03 §4.7).

---

## 2. Sequence

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant C as Client
    participant SA as Server Actions
    participant DB as Postgres + RLS
    actor M as Departing member (mid-session elsewhere)
    actor R as Receiving teacher
    actor O as Owner

    A->>C: /app/staff/[id] → Start offboarding
    C->>SA: startOffboarding({staffRecordId, effectiveDate, reason, note})
    SA->>DB: offboardings(status='in_progress', steps[] materialised from template)
    SA->>DB: staff_records(employment_status='on_notice')
    DB->>DB: audit_events: offboarding.started

    A->>C: Step 2 — Reassign teaching (blocking)
    C->>SA: updateOffboardingStep({stepKey:'reassign_teaching', payload})
    SA->>DB: section_subjects.primary_teacher_id, sections.class_teacher_id
    DB->>DB: notifications: academics.assigned_subject → R

    A->>C: Step 3 — Resources (blocking): reassign all to F. Akter
    C->>SA: resources.reassign({ids, toUserId})
    SA->>DB: resources(owner_user_id, reassigned_at/by; created_by immutable)

    A->>C: Complete offboarding
    C->>SA: completeOffboarding({offboardingId}, idempotency_key)
    SA->>DB: BEGIN  — the revoke transaction
    DB->>DB: 1 workspace_members status='removed', removed_at/by
    DB->>DB: 2 staff_records employment_status='left', left_on
    DB->>DB: 3 channel_members.left_at · 4 conversation_participants.left_at
    DB->>DB: 5 resources → 'orphaned' (whatever step 3 did not reassign)
    DB->>DB: 6 cover_priority_lists entries removed · 7 open cover_assignments cancelled
    DB->>DB: 8 queued print_jobs cancelled · 9 pending invitations cancelled
    DB->>DB: 10 refresh tokens for this workspace context revoked
    DB->>DB: 11 notifications → member + owners/admins
    DB->>DB: 12 audit_events: member.removed with a before/after consequence summary
    SA->>DB: COMMIT

    M->>C: taps Save on an open marks grid
    C->>SA: any workspace-scoped action
    SA->>DB: resolveWorkspaceContext → no active membership
    SA-->>M: 403 → "You no longer have access to this school"
    O->>C: /app/settings/audit?actor=… → the whole trail
```

---

## 3. Steps

### Stage A — Start offboarding (F-OP-06 W6)

1. **`/app/staff/[id]` → Start offboarding.** Sheet: effective date (the last working day), reason, note.
   _Writes:_ `offboardings` (`status='in_progress'`, `steps jsonb[]` **materialised from the template at creation**, so a checklist that shipped last term stays reproducible), `staff_records.employment_status='on_notice'`.
   _Events:_ `audit_events`: `offboarding.started`.
   Nothing destructive has happened yet — cancelling here restores `employment_status='active'` and reverses nothing else.
2. **`/app/staff/[id]/offboarding`** renders a vertical stepper on phone (one card per step, the primary action in a sticky bottom bar) and a two-pane layout at ≥1024. Blocking steps are flagged, and **Complete offboarding** is disabled while any of the four required steps is incomplete, with the reason named.

### Stage B — The checklist (F-OP-06 §5.3)

| #   | Key                 | Required | What it actually does                                                                                                                                                       |
| --- | ------------------- | :------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `last_day`          |    ✅    | Sets `effective_date`; everything below is scheduled against it                                                                                                             |
| 2   | `reassign_teaching` |    ✅    | Lists **every** `section_subjects` row and every section where they are class teacher, with a picker per row. Cannot be marked done while one assignment remains            |
| 3   | `resources`         |    ✅    | Counts their school-library resources; choose _Reassign all to…_ or _Mark orphaned for an admin to sort_. **Personal-workspace resources are untouched and the UI says so** |
| 4   | `cover_and_queue`   |    —     | Cancels their open `cover_assignments` on both sides, removes them from every `cover_priority_lists`, cancels or reassigns their `queued` `print_jobs`                      |
| 5   | `revoke_access`     |    ✅    | The transaction in Stage C                                                                                                                                                  |
| 6   | `assets`            |    —     | Free-text checklist (ID card, keys, laptop) with per-item notes                                                                                                             |
| 7   | `final_pay`         |    —     | Records outstanding cover credits from WF-09 as a note for the payroll run                                                                                                  |

3. **Step 2** writes `section_subjects.primary_teacher_id`, `section_subject_teachers` and `sections.class_teacher_id`. Each receiving teacher gets `notifications`: `academics.assigned_subject` with the sections they inherit. **Changing a teacher never rewrites history** — past `marks`, `attendance_records` and `lesson_logs` keep their own `recorded_by` / `logged_by`.
4. **Step 3** is where the school's material is protected. Reassignment sets `resources.owner_user_id`, `reassigned_at`, `reassigned_by` — and **`created_by` is immutable**, so the library shows both: _"Created by S. Rahman · now owned by F. Akter"_, which is what an audit actually needs. Identifiers (`WS-000214`) are immutable through reassignment, because that is how a printed worksheet is referred to in a staffroom.

### Stage C — The revoke transaction (F-OP-06 §5.4 — one transaction, idempotent)

5. **Complete offboarding** runs step 5 if it has not run, in a single transaction:

```
 1. workspace_members          status='removed', removed_at=now(), removed_by=actor, removed_reason
 2. staff_records              employment_status='left', left_on = effective_date
 3. channel_members            left_at = now() for every channel in this workspace
 4. conversation_participants  left_at = now()            (DM history preserved, read-only)
 5. resources (this workspace) status='orphaned' for anything step 3 did not reassign
 6. cover_priority_lists       user removed from every entries[] array
 7. cover_assignments          proposed/notified/acknowledged on either side → cancelled, reason='member_removed'
 8. print_jobs                 queued rows requested_by this user → cancelled, reason='member_removed'
 9. workspace_invitations      any pending invitation for this email in this workspace → cancelled
10. auth                       refresh tokens for this user's sessions revoked for this workspace context
11. notifications              the member is told; owners and admins receive a summary
12. audit_events               ONE row with a before/after summary of everything above
```

6. **Step 1 alone is what actually ends access.** Every RLS helper — `app.member_role`, `app.has_role`, `app.is_guardian_of` — considers only `status='active'` rows, and `WorkspaceContext` is resolved **per request** from `workspace_members`, never from a token claim or a client-writable field. So the latency of removal is **the next request**: there is nothing to revoke in the token because tenancy was never in the token.
   Steps 3–9 are hygiene, so the school is not left with dangling work; step 10 is belt and braces.
7. `staff_records.employment_status` and `workspace_members.status` are kept in step by a trigger, so _"the staff record says active but the person has no access"_ — and its inverse — cannot happen.
8. **Nothing is deleted.** The member keeps their account, their personal workspace and everything in it, their `guardian_users` links if they are also a parent at that school (those are a separate membership), and their name on every historical record they touched.

### Stage D — What the departing member experiences

9. Mid-session on another device, their next workspace-scoped server action fails membership resolution and returns 403. The client renders a dedicated screen — _"You no longer have access to this school"_ — with a button to the workspace switcher, **not** a generic error toast.
10. Any offline queue they hold (attendance, lesson logs) fails on replay and is **surfaced, never silently dropped**: "3 saves could not be synced because you no longer have access to Green Valley School."
11. `/personal/workspaces` shows the workspace greyed out with the removal date. Their own `notifications` row (`member.removed`) carries the reason the admin typed.
12. Their **personal** workspace, `resources` there, `teacher_profiles`, `seller_profiles`, applications and document-request approvals are entirely unaffected — those belong to the user, not to the school.

### Stage E — Orphaned resources and reassignment (F-TE-05 §4.6, PRODUCT-DECISIONS §3.7)

13. A trigger (preferred over a job, because a trigger cannot be skipped) sets `status='orphaned'`, `orphaned_at` on every school-library resource owned by the removed user. **Marketplace-sourced rows are explicitly skipped** — a school-funded purchase belongs to the workspace and its entitlement already survives the buyer leaving (WF-06 stage E).
14. _Events:_ `notifications`: `resources.orphaned` → owners and admins — _"14 resources need a new owner"_, `action_url=/app/library?status=orphaned`.
15. **`/app/library`** on phone sorts by "needs attention" with the orphan banner pinned. Admin selects rows → **Reassign** → picks an **active** member (the picker is fed from `workspace_members`, so it can never be empty for the wrong reason) → `owner_user_id` moves, `status` returns to `active`, and `reassigned_at`/`reassigned_by` carry the history.
    _Events:_ `audit_events`: `resource.reassigned` with the correct argument order — actor, action, table, row id, before, after.
16. Shares the departing teacher had made to colleagues **survive orphaning**, so a class does not lose its handout the day a teacher resigns. Orphaned resources may also be **archived** if nobody wants them; they are never deleted by this flow.

### Stage F — Adjacent lifecycle paths

17. **Leave voluntarily** (`/personal/workspaces` → Leave): same `status='removed'` with `removed_reason='left'`, `removed_by = self`. Blocked for a **sole active owner** of a workspace with other members, with a link to ownership transfer; a sole owner of an empty workspace is offered "Leave and archive this workspace" in the same sheet. _Notification:_ `member.left` → owners and admins.
18. **Ownership transfer** (owner only, re-authenticated, three steps) moves `owner` to another active member in one transaction, notifies the new owner, the previous owner and all admins, and audits both user ids. This is the prerequisite for a sole owner ever leaving.
19. **Rejoining** reuses the **same** `staff_records` row: `employment_status` returns to `pending_join`, a new `joined_on` is recorded, and the previous stint is preserved in `employment_history`. The `workspace_members` row is reactivated — the unique `(workspace_id, user_id)` index exists precisely so that re-joining keeps the history rather than creating a second row. Their old messages, marks and audit trail keep their attribution.
20. **Seat counting** for the plan (WF-07) counts `status='active'` only, so removal frees a seat immediately.

### Stage G — What the owner sees afterwards

21. **`/app/settings/audit`** filtered by actor or by row shows, for this offboarding, a single `member.removed` event carrying the consequence summary, plus the individual `section_subject.teacher_changed`, `resource.reassigned`, `cover_assignment.cancelled` and `print_job.cancelled` rows — **all sharing one `correlation_id`**, so the whole departure reads as one story rather than twelve unrelated lines.
22. `audit_events` is append-only: no UPDATE and no DELETE grant for any role, filled by database triggers with the actor from `auth.uid()`. The question _"who took this class over, and when"_ has exactly one answer (WF-13).

---

## 4. Failure and edge cases

| Case                                                  | Detection                                                                            | Behaviour                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Offboarding the last active owner                     | Constraint trigger + `can()`                                                         | `LAST_OWNER_BLOCKED` / `last_owner` with a link to ownership transfer                                     |
| Admin tries to offboard an owner                      | `FORBIDDEN_OWNER_TARGET`                                                             | Refused; only an owner may                                                                                |
| Blocking step incomplete                              | Server + disabled UI                                                                 | `blocking_incomplete`, naming exactly which assignments remain                                            |
| Assignments remain at step 2                          | Per-row picker state                                                                 | Step cannot be marked done; the count is shown ("4 of 7 reassigned")                                      |
| Admin cancels mid-checklist                           | `offboardings.status='cancelled'`                                                    | `employment_status` returns to `active`; **nothing else is reversed because nothing destructive has run** |
| `completeOffboarding` double-tapped                   | `idempotency_key` **required**, plus every step written with a conditional predicate | One removal, one notification fan-out, one audit event                                                    |
| Member is mid-request when the transaction commits    | Per-request context resolution                                                       | That request may finish; the next one 403s. There is no cached grant                                      |
| Member has an offline queue                           | Replay fails membership resolution                                                   | Surfaced to the user with the workspace named; never silently dropped                                     |
| Member is also a parent at the same school            | Two separate `workspace_members` rows                                                | Only the staff membership is removed; `/family` access is untouched                                       |
| Member owns resources in their personal workspace     | Orphaning scope is `type='school'` only                                              | Untouched; they keep them                                                                                 |
| Member owns marketplace-sourced resources             | Orphaning skips `source='marketplace'`                                               | School-funded entitlements stay with the workspace                                                        |
| Member is a cover teacher for tomorrow                | Step 4 / revoke step 7                                                               | Assignment cancelled with `reason='member_removed'`; admins notified so the period is re-covered (WF-09)  |
| Member has queued print jobs                          | Revoke step 8                                                                        | Cancelled, or `requested_by` reassigned to the acting admin                                               |
| Member has a pending invitation to the same workspace | Revoke step 9                                                                        | Cancelled, so an "accept" link cannot resurrect access                                                    |
| Member has submitted interview scorecards             | Not touched                                                                          | Kept, attributed and immutable; unsubmitted ones drop out of the panel average (WF-08)                    |
| Member is mentioned in old messages                   | Not touched                                                                          | Mentions and authorship stay; `channel_members.left_at` ends read access, history stays                   |
| Reassigning to a non-active member                    | Picker is fed from `workspace_members` + server check                                | `MEMBER_NOT_ACTIVE`                                                                                       |
| Someone tries to DELETE a membership row directly     | **No DELETE grant to any role**                                                      | Denied at the database, asserted by pgTAP                                                                 |
| Removed member tries to self-restore                  | RLS forbids self-update of `role`/`status` outright                                  | Denied at the database                                                                                    |

---

## 5. What the Base44 prototype did instead

Offboarding was the security review's **finding 6**, and it was a design defect rather than a bug. Removal **hard-deleted** the `WorkspaceMember` row while the schema's own `status: 'removed'` enum value sat unused — soft-removal was clearly intended and never written. But deletion did not end access, because access was not gated on membership at all: it was gated on `user.data.active_workspace_id`, a **field the client writes to itself** with `base44.auth.updateMe({ active_workspace_id: id })` and nothing anywhere verifying that the id belongs to a workspace the caller is in. Nothing cleared that field on removal, and no RLS rule in the entire product referenced `WorkspaceMember`. The result, in the review's words, is that a teacher dismissed for misconduct involving a student **retained full read/write access to student records after removal** — and, because of the audit failures below, that window was unauditable. Self-service leaving was no better: `/personal/workspaces` → Leave School called `WorkspaceMember.delete(member.id)` followed by `window.location.reload()`, and it only ever removed the **first** school workspace it found in the array. Owners could not be removed or role-changed (a client-side `member.role !== 'owner'` guard), and there was **no ownership-transfer flow at all**, so an owner who left the company stranded the workspace permanently. Nothing downstream of removal existed: `AcademicResource.status='orphaned'` was **never written by any code**, so the entire orphan story — the KPI card, the red banner, the filter and the per-row Reassign button — was inert, and the Reassign action was itself unreachable because its teacher picker filtered `u.role === 'teacher'` against a `User.role` enum whose only values are `admin` and `user`. When that unreachable action did fire, it logged the audit through `logAudit('resource.reassigned', user?.id, {…})` against a signature of `logAudit(user, action_type, entity_type, …)`, producing a row with `user_id: undefined`, the action name in the actor column and a raw object in the entity-type column. `HiredStaff` — the only thing resembling a staff record — had no tenant field, no `.create()` anywhere, and no link back to `Applicant` or `User`. There was no hourly rate on any entity, no employment status, no notice period, no checklist, and no reassignment of classes: a departing teacher's `Class.teacher_name` was a free-text string that simply kept naming them.
