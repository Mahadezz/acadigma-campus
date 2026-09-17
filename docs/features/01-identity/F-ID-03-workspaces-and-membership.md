# F-ID-03 — Workspaces, membership and tenancy

|                  |                                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | auth                                                                                                                                                                                                                                                |
| Status           | planned                                                                                                                                                                                                                                             |
| Owner branch     | `feat/identity-workspaces-membership`                                                                                                                                                                                                               |
| Depends on       | F-ID-01, F-ID-02                                                                                                                                                                                                                                    |
| Plan             | `docs/plan/ROADMAP.md` chunk 1                                                                                                                                                                                                                      |
| Base44 reference | `docs/reference/base44-inventory/01-auth-tenancy-personal.md` §2 (entire), §3 rows 13, 17–18, 23–24, 26–27, 30, 45, 52; §4.3–4.6; §5.2 D3, D5, D6, D8, D10, D16; §5.3 W5, W6, W13, W16; `docs/reference/base44-security-review.md` findings 1, 2, 6 |

## 1. Purpose

This is the feature every other feature in Acadigma Campus sits on. It defines what a workspace is, who is in it, what they may do, how the server decides which workspace a request belongs to, and what happens when someone joins, is promoted, leaves or is removed. "Done" from the user's chair: a principal creates a school, sees a Team & Access screen that is the single roster for the school, gives a colleague the title "Vice-Principal" without inventing a new permission level, hands ownership over before retiring, and knows with certainty that a teacher who was let go last Thursday cannot open a single student record today.

The Base44 prototype intended exactly this and got the security of it inside-out. `SchoolSettings` was simultaneously the workspace table, the school-settings table and the seller-store table (§2.1). Tenant context came from `user.active_workspace_id` — **a field the browser wrote to itself** — so `updateMe({active_workspace_id: <any school's id>})` was a complete cross-tenant takeover (security review finding 1). `WorkspaceMember.create` had no constraints, so a user could insert themselves as `owner/active` into any school (finding 2). There were three overlapping role vocabularies (`owner`/`superadmin`, `principal` on invitations only, a Base44 platform `admin`/`user`) bridged by one client-side mapping function. Removal was a hard `DELETE`, and since access was keyed on the client-writable field, dismissed staff kept working access (finding 6). The `status: 'removed'` enum value was declared and never written (D10). Team & Access existed twice, ~90 % duplicated, at two routes (W13). Module toggles wrote `module_*` flags that no navigation code ever read (B2). `useScopedEntity.js` — 92 lines promising "ZERO data leakage" — had no call sites (D3). And nothing routed a user to the shell matching their workspace (W16).

The rebuild inverts all of it: membership is the only truth, the server resolves it on every request, RLS enforces it in the database, and the client is told what it may render only after the server has already decided.

## 2. Roles and permissions

Roles are exactly five (PRODUCT-DECISIONS §1.5): **`owner`, `admin`, `teacher`, `staff`, `parent`**. `superadmin` does not exist. `principal` is a **label**, not a role (§1.4). Permission keys live in `packages/domain/permissions.ts` as one exported matrix consumed by the server (`can()` before every write), by the nav config, and by the tests — one source, which is the fix for prototype D6's two drifting sources.

| Action                                                                                  | owner                  | admin                             | teacher                  | staff                    | parent         | platform staff | Permission key                 |
| --------------------------------------------------------------------------------------- | ---------------------- | --------------------------------- | ------------------------ | ------------------------ | -------------- | -------------- | ------------------------------ |
| Read the workspace record                                                               | ✅                     | ✅                                | ✅                       | ✅                       | ✅ (name only) | ✅             | `workspace.read`               |
| Edit school profile (name, EIIN, board, address, timezone, working days, academic year) | ✅                     | ✅                                | —                        | —                        | —              | —              | `workspace.settings.write`     |
| Upload / change the school logo                                                         | ✅                     | ✅                                | —                        | —                        | —              | —              | `workspace.branding.write`     |
| Read the member roster                                                                  | ✅                     | ✅                                | ✅ (directory card only) | ✅ (directory card only) | —              | ✅             | `members.read`                 |
| Read member work contact + staff fields                                                 | ✅                     | ✅                                | —                        | —                        | —              | ✅             | `members.contact.read`         |
| Invite a member                                                                         | ✅                     | ✅                                | —                        | —                        | —              | —              | `members.invite`               |
| Approve / reject a join request                                                         | ✅                     | ✅                                | —                        | —                        | —              | —              | `members.approve`              |
| Change a member's role                                                                  | ✅                     | ✅ (cannot set or change `owner`) | —                        | —                        | —              | —              | `members.role.write`           |
| Edit a member's staff fields (employee no., department, subjects, work phone)           | ✅                     | ✅                                | own row only             | own row only             | —              | —              | `members.staff_fields.write`   |
| Remove a member                                                                         | ✅                     | ✅ (cannot remove an `owner`)     | —                        | —                        | —              | —              | `members.remove`               |
| Leave the workspace                                                                     | ✅ (unless sole owner) | ✅                                | ✅                       | ✅                       | ✅             | —              | `members.leave`                |
| Transfer ownership                                                                      | ✅                     | —                                 | —                        | —                        | —              | —              | `workspace.ownership.transfer` |
| Create / edit / delete custom labels                                                    | ✅                     | ✅                                | —                        | —                        | —              | —              | `labels.write`                 |
| Assign a custom label to a member                                                       | ✅                     | ✅                                | —                        | —                        | —              | —              | `labels.assign`                |
| Toggle module visibility                                                                | ✅                     | —                                 | —                        | —                        | —              | —              | `modules.visibility.write`     |
| Archive the workspace                                                                   | ✅                     | —                                 | —                        | —                        | —              | ✅             | `workspace.archive`            |
| Suspend / reinstate a workspace                                                         | —                      | —                                 | —                        | —                        | —              | ✅             | `platform.workspace.suspend`   |

**Hard invariants, enforced in the database, not only in code:**

- A `school` workspace always has **≥ 1** member with `role='owner'` and `status='active'`. The last owner cannot leave, be removed, or be downgraded (PRODUCT-DECISIONS §1.5).
- An `admin` can never create, promote to, or demote an `owner`. Only an existing owner transfers ownership.
- No member may change **their own** `role` or `status` under any circumstance — RLS forbids self-update of those two columns outright (security review finding 2).
- A `personal` workspace has exactly one member, `owner`, and admits no invitations, no join code and no role changes.
- `parent` memberships are created only by the guardian-invite flow (F-ID-04 §4.5) and are never assignable from the role dropdown — which is precisely how the prototype's parent role was granted.

## 3. Data

**Tenant key: `workspace_id` on every tenant-scoped table, no exceptions** (PRODUCT-DECISIONS §1.6). The `school_id` / `teacher_id` / `'default'` mixture is gone. Columns below are **proposed; DATA-MODEL.md wins**.

### `workspaces`

| column                                            | type                    | notes                                                                 |
| ------------------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `id`                                              | uuid PK                 |                                                                       |
| `type`                                            | enum `workspace_type`   | `school \| personal` — **no `seller` type** (PRODUCT-DECISIONS §1.8)  |
| `name`                                            | text not null           |                                                                       |
| `slug`                                            | citext unique           | generated from the name, `acadigma.app/s/{slug}` for public job pages |
| `short_code`                                      | text unique             | `WS-000214`, from `app.next_id` — the copyable workspace id in the UI |
| `logo_url`                                        | text                    | `public` bucket                                                       |
| `plan_id`                                         | uuid FK plans           | source of truth for entitlements (PRODUCT-DECISIONS §1.20)            |
| `status`                                          | enum `workspace_status` | `active \| suspended \| archived`                                     |
| `created_by`                                      | uuid FK profiles        |                                                                       |
| `archived_at`, `suspended_at`, `suspended_reason` |                         | platform-staff controlled                                             |
| `created_at` / `updated_at`                       | timestamptz             |                                                                       |

Indexes: unique `slug`, unique `short_code`, `(type, status)`.

### `school_profiles` (1:1 with `workspaces` where `type='school'`)

`workspace_id` PK/FK · `eiin` text (BD school identifier, 6 digits, optional, unique when present) · `board` enum `school_board` (`dhaka|chattogram|rajshahi|khulna|barishal|sylhet|rangpur|mymensingh|madrasah|technical|cambridge|edexcel|ib|other`) · `medium` enum (`bangla|english|english_version|madrasah`) · `address_line1/2`, `city`, `district`, `postcode`, `country` default `BD` · `contact_email`, `contact_phone`, `website` · `timezone` text default `'Asia/Dhaka'` · `working_days` int[] default `{6,0,1,2,3,4}` (Sat–Thu, ISO-style 0=Sun) · `first_day_of_week` smallint derived · `academic_year_start_month` smallint default 1 · `current_academic_year_id` uuid · `attendance_policy` jsonb (PRODUCT-DECISIONS §2.2) · `grading_policy` jsonb · `default_language` enum `app_language` · `default_palette` enum `palette_key` · `bin_vat_no` text (for invoices, §4.9) · `created_at/updated_at`.

Personal workspaces have **no** row here — that is the whole point of the split (PRODUCT-DECISIONS §1.7).

### `workspace_members`

| column                                       | type                        | notes                                                                |
| -------------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `id`                                         | uuid PK                     |                                                                      |
| `workspace_id`                               | uuid not null FK workspaces | tenant key                                                           |
| `user_id`                                    | uuid not null FK profiles   |                                                                      |
| `role`                                       | enum `member_role`          | `owner \| admin \| teacher \| staff \| parent`                       |
| `status`                                     | enum `member_status`        | `pending \| active \| removed` (PRODUCT-DECISIONS §1.14)             |
| `custom_label_id`                            | uuid FK custom_labels       | display title; permissions never read it                             |
| `employee_no`                                | text                        | per-workspace, `app.next_id(workspace_id,'staff')` → `ADM-2026-0001` |
| `department`                                 | text                        |                                                                      |
| `work_email`, `work_phone`                   | text                        | school-published contact, distinct from `profiles`                   |
| `subjects`                                   | uuid[] / join table         | teaching subjects (academic area owns the catalogue)                 |
| `joined_at`, `approved_by`                   |                             | set when `status` becomes `active`                                   |
| `removed_at`, `removed_by`, `removed_reason` |                             | never deleted                                                        |
| `invited_by`, `invitation_id`                |                             | provenance                                                           |
| `created_at` / `updated_at`                  |                             |                                                                      |

Indexes: **unique `(workspace_id, user_id)`** (one membership per person per workspace — a partial unique excluding `removed` is rejected, because re-joining should reactivate the same row and keep the history), `(workspace_id, status, role)`, `(user_id, status)`.

### `custom_labels`

`id` · `workspace_id` · `name` text · `name_bn` text · `base_role` enum `member_role` (restricted to `admin|teacher|staff`) · `color` text · `sort_order` int · `created_by` · timestamps. Unique `(workspace_id, lower(name))`. The Base44 `UserLabel` join table is replaced by `workspace_members.custom_label_id` — one label per member, which is what every school actually needs and removes an entire unused table (prototype D8).

### `workspace_modules`

`workspace_id` · `module_key` text · `is_visible` boolean not null default true · `updated_by` · `updated_at`. PK `(workspace_id, module_key)`. Rows exist only for modules an owner has explicitly hidden or re-shown; absence means "visible if entitled". `module_key` values come from one enumerated list in `packages/domain/modules.ts` (`attendance`, `timetable`, `students`, `exams`, `marks`, `assignments`, `lessons`, `curriculum`, `resources`, `library`, `reports`, `print`, `messages`, `hiring`, `cover`, `staff`, `billing`, `ai`, `marketplace`).

### RLS, in words

Helpers are the ones fixed by ARCHITECTURE §3: `app.current_user_id()`, `app.is_platform_admin()`, `app.member_role(workspace_id)`, `app.has_role(workspace_id, roles[])`, `app.is_guardian_of(student_id)` — all `SECURITY DEFINER`, `STABLE`, `search_path` pinned to `app, public`, and **all of them consider only `status='active'` rows**.

- **`workspaces` select:** `app.member_role(id) is not null` (any active member) **or** `app.is_platform_admin()`. Nothing is world-readable — the prototype's `"read": {}` on `SchoolSettings`, which let anyone enumerate every school and its invite code, has no analogue here.
- **`workspaces` insert:** authenticated users only, and only through `createWorkspace`/`createSchool` server actions; the `with check` clause requires `created_by = app.current_user_id()`.
- **`workspaces` update:** `app.has_role(id,'{owner,admin}')`, with a trigger that rejects changes to `type`, `plan_id`, `status` and `short_code` from non-service-role callers (plan changes come from billing, status from the platform console).
- **`workspaces` delete:** no grant. Archiving is an update.
- **`school_profiles`:** select for any active member; insert/update for `{owner,admin}`; no delete.
- **`workspace_members` select:** active members of the same workspace see rows of that workspace; a user always sees **their own** rows in every workspace (including `pending` and `removed`, so the personal-area workspace list can render them); platform staff see all.
- **`workspace_members` insert:** three narrow paths only — (a) the owner row created inside `createWorkspace` (service-role, same transaction); (b) a self-insert with a hard `with check` of `user_id = app.current_user_id() and status = 'pending' and role = 'teacher'` **and** a valid, active join code proven by a SECURITY DEFINER function (F-ID-04); (c) an invitation redemption, again through a SECURITY DEFINER function that verifies the token. Direct client insert of an arbitrary `(workspace_id, role, status)` triple — the prototype's finding 2 — is impossible under every one of these.
- **`workspace_members` update:** `app.has_role(workspace_id,'{owner,admin}')` **and** `user_id <> app.current_user_id()` for any statement that touches `role` or `status`; a member may update only their own `work_email`, `work_phone` and `department`. A `BEFORE UPDATE` trigger additionally rejects: promoting to `owner` by a non-owner; demoting or removing the last active owner; changing `workspace_id` or `user_id`.
- **`workspace_members` delete:** **no grant to anyone.** Removal is `status='removed'` (PRODUCT-DECISIONS §1.14).
- **`custom_labels` / `workspace_modules`:** select for active members; insert/update/delete for `{owner,admin}` (`workspace_modules` write: `owner` only).
- **Parent policies** are separate and student-scoped (`app.is_guardian_of`); a `parent` member never satisfies `app.has_role(ws,'{owner,admin,teacher,staff}')`.

Private files: the school logo is public; nothing else here is a file.

## 4. Workflows

### 4.1 Create a school workspace

Owned end-to-end by F-ID-05 §4.3 (the wizard). This feature provides the transaction: `workspaces` row + `school_profiles` row + `workspace_members{role:'owner', status:'active', joined_at}` + `workspace_join_codes` row (its `code` **prefixed with this workspace's own `app.next_id` short code**, so a guess only ever tests this one school — schema and the global hourly failure-budget alert owned by F-ID-04 §3) + default `plan_id` (Pro trial, PRODUCT-DECISIONS §5.2) + `app.next_id` short code — **all in one database transaction**, so the prototype's swallowed-catch orphan account is structurally impossible.
**Audit:** `workspace.created`. **Notifications:** none (the creator is present).

### 4.2 Switch the active workspace

**Trigger:** the workspace chip in the top bar (present on **phone and desktop** — the prototype hid the switcher behind `hidden lg:flex`, D16).

1. Tap the chip → a `Sheet` listing every membership: workspace name, type icon, the user's role, and a "Pending approval" chip for `status='pending'` rows. The personal workspace is always first.
2. Choosing one calls `switchWorkspace(workspaceId)`, which **verifies an active membership server-side**, sets the httpOnly cookie `acx_ws`, writes `profiles.last_workspace_id`, clears the TanStack Query cache, and **navigates** to the shell for that workspace type. The prototype set state and localStorage and never navigated (§2.4).
3. A `pending` row is not selectable; tapping it opens a status explainer sheet instead.

**Outcome:** the whole app is in the new tenant, including every query key (all keys are prefixed with the workspace id).
**Audit:** none (a read-side selection is not an auditable mutation), but the resolved workspace id is attached to every structured log line.
**Failure cases:** the membership was revoked between render and tap → `WORKSPACE_NOT_MEMBER`, the switcher refetches and shows the workspace greyed out with "You no longer have access".

### 4.3 Active-workspace resolution on every request

This is the security heart of the product and is specified as an algorithm, not a screen.

1. The browser sends the Supabase session cookie. For server-side Supabase queries made from client components it also sends **`x-workspace-id`**, whose value comes from the React context the server layout provided — never from `localStorage`, never from a user-editable field.
2. `packages/db/resolveWorkspaceContext(request)` runs: read the candidate id from `x-workspace-id` → else the `acx_ws` cookie → else `user_preferences.default_workspace_id` → else `profiles.last_workspace_id` → else the first `active` membership ordered `type='personal' desc, joined_at asc`.
3. It then **queries `workspace_members` for `(candidate, auth.uid(), status='active')`**. No row → `403 WORKSPACE_NOT_MEMBER`. The header is a _hint_; the database is the authority (ARCHITECTURE §3, DECISION-LOG D-04).
4. It returns `WorkspaceContext = { workspaceId, workspaceType, userId, role, planId, entitlements, moduleVisibility, labels }` and calls `set_config('app.workspace_id', …, true)` plus `set_config('app.correlation_id', …, true)` for the transaction, so triggers and audit rows pick them up.
5. Every repository function in `packages/db` takes `WorkspaceContext` as its first argument — there is no callable repository signature that omits it. This is the real replacement for the prototype's never-called `useScopedEntity` (D3).

**Failure cases:** a forged `x-workspace-id` for a workspace the caller is not in → 403, and an `audit_events` row `tenancy.context_rejected` with the attempted id (this is a cheap tripwire for exactly the attack the security review describes). A suspended workspace → 403 with a dedicated screen for owners explaining why and how to contact support. An archived workspace → read-only mode (`entitlements.readonly = true`).

### 4.4 Shell and landing-route resolution

`resolveLandingRoute(ctx)` in `packages/domain/workspace/resolveLanding.ts`:

| Condition (first match wins)                                                  | Route                                 |
| ----------------------------------------------------------------------------- | ------------------------------------- |
| No active membership at all                                                   | `/onboarding`                         |
| Resolved workspace `type='personal'`                                          | `/personal`                           |
| Resolved workspace `type='school'` and role ∈ {owner, admin, teacher, staff}  | `/app`                                |
| Resolved workspace `type='school'` and role = `parent`                        | `/family`                             |
| `profiles.is_platform_admin` and the user explicitly navigated to `/platform` | `/platform` (never a default landing) |

Note the parent case: PRODUCT-DECISIONS §1.1 says the workspace _type_ decides the shell, but a `parent` membership is in a `school` workspace whose shell (`/app`) they must never see. The resolver is therefore **type ∧ role**, with role as the tie-break — recorded as OQ-1.

### 4.5 Team & Access — the single roster screen

**One route, `/app/staff/team`.** The prototype's two ~90 %-duplicated screens (`/workspace-members` and the Settings → Team tab) collapse into this one (W13); Settings links to it.

**Phone layout:** a segmented control (Active · Pending · Removed) above a `DataList` of member cards. Each card: avatar, name, custom label or role chip, department, and a `…` button opening an action sheet (Change role · Edit staff details · Assign label · Remove). Search is a sticky field under the segments; role and label filters live in a filter sheet, **server-side** (no client-side filtering of the whole roster, ARCHITECTURE §6).
**Desktop:** the same data as a table with inline role selects, bulk selection for label assignment and bulk remove.

Actions and their consequences:

1. **Approve a pending member** → `status='active'`, `joined_at`, `approved_by`. Notification `join_request.approved` to the joiner. Audit `member.approved`.
2. **Reject a pending member** → `status='removed'`, `removed_reason='rejected'`. Notification `join_request.rejected`. Audit `member.rejected`.
3. **Change role** → confirmation sheet naming what the person gains or loses in plain words ("Rahim will be able to edit every class's marks and see billing"). Notification `member.role_changed` to the member. Audit `member.role_changed` with before/after.
4. **Edit staff details** → `FormSheet` with employee no., department, work email, work phone, subjects. Audit `member.staff_fields_updated`.
5. **Assign a custom label** → select from the workspace's labels; changing a label never changes the role, and the sheet says so.
6. **Remove** → destructive confirm sheet listing the consequences: access ends immediately, their school-library resources become `orphaned` for reassignment (PRODUCT-DECISIONS §3.7), and their name stays on historical records. `status='removed'`, `removed_at/by/reason`. Notification `member.removed` to the member. Audit `member.removed`. All of that member's sessions keep working as _sessions_ — but every workspace-scoped request now fails membership resolution, which is the structural fix for security review finding 6.

**Failure cases:** attempting to remove or demote the last owner is blocked by the trigger and surfaced as `LAST_OWNER_BLOCKED` with a link to ownership transfer; an admin attempting to touch an owner gets `FORBIDDEN_OWNER_TARGET`.

### 4.6 Leave a workspace

**Trigger:** `/personal/workspaces` (the personal-area list, F-ID-06) or the workspace switcher's overflow.
Confirmation sheet → `leaveWorkspace` → `status='removed'`, `removed_reason='left'`, `removed_by = self`. If the leaver is the **sole active owner** of a workspace with other active members, the action is blocked with the transfer link. If they are the sole owner of a workspace with no other members, they are offered "Leave and archive this workspace" in the same sheet.
**Notification:** `member.left` to owners and admins. **Audit:** `member.left`.

### 4.7 Transfer ownership

**Trigger:** `/app/settings/workspace` → Ownership → "Transfer ownership".

1. Step 1: choose an **active `admin` or `teacher`** of the same workspace (the search is server-side over the roster).
2. Step 2: consequences panel — "You will become an admin. Only Nusrat will be able to transfer ownership, delete the workspace or change billing."
3. Step 3: re-authenticate (password or OTP, reusing F-ID-01 §4.6's re-auth component) and type the workspace name to confirm.
4. `transferOwnership` runs one transaction: target `role='owner'`, current owner `role='admin'` (unless "keep me as an owner too" is ticked — multiple owners are allowed, PRODUCT-DECISIONS §1.5), `workspaces.updated_at` bumped.
5. The target must accept? **No** — ownership transfer is immediate, because the common real case is a principal leaving this week. The target is notified loudly and any owner can transfer it back.

**Notifications:** `workspace.ownership_transferred` to the new owner, the previous owner and all admins. **Audit:** `workspace.ownership_transferred` with both user ids.
**Failure cases:** the target's membership changed mid-flow → `TARGET_NOT_ELIGIBLE`; re-auth failure → the transaction never opens.

### 4.8 Custom labels

`/app/settings/labels`. Create a label: name, Bangla name, base role (`admin`/`teacher`/`staff`), colour. The sheet's help text is explicit: **"A label changes what people see written next to a name. It does not change what they can do — that is the role."** Assigning a label to a member sets `custom_label_id`; the member card then shows "Vice-Principal" with the role in smaller type underneath. Deleting a label nulls it on members (no cascade delete of people).
**Audit:** `label.created`, `label.updated`, `label.deleted`, `member.label_assigned`.

### 4.9 Module visibility

`/app/settings/modules` (owner only). A list of every module with three possible states, rendered honestly:

- **Not in your plan** — greyed, with the plan needed and an upgrade link. Not togglable.
- **On** — switch on; it appears in navigation for roles allowed to see it.
- **Hidden** — switch off; the module disappears from navigation for everyone **and its routes return 404 for this workspace**, because a hidden module that is still reachable by URL is the prototype's B2 bug in a new costume.

Effective visibility = `plan entitlement ∧ workspace_modules.is_visible ∧ role allowed` (PRODUCT-DECISIONS §1.12). Hiding a module never deletes data; re-enabling it restores everything.
**Audit:** `workspace.module_visibility_changed` with the module key and the new value.
**Failure case:** hiding a module that another enabled module depends on (e.g. hiding `students` while `attendance` is on) is blocked with a named dependency message; the dependency graph lives in `packages/domain/modules.ts`.

### 4.10 School profile settings

`/app/settings/workspace` — name, logo, EIIN, board, medium, address, contact, timezone, working days (a seven-chip row, Sat first), academic year start, BIN/VAT for invoices. Changing `timezone` or `working_days` shows a warning that timetable and attendance screens will recompute "today" (PRODUCT-DECISIONS §6.10). Logo upload is the only place a logo can be set — and the onboarding copy that promised it ("you can add a logo later in Settings", prototype B14) is now true.
**Audit:** `workspace.updated` / `school_profile.updated` with changed field names and before/after values (school settings are not personal PII, so values are recorded).

## 5. Business rules and calculations

| Rule                        | Value / formula                                                                                                                                             | Where                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Roles                       | `owner, admin, teacher, staff, parent` — one enum, mirrored in contracts                                                                                    | `packages/domain/permissions.ts`               |
| Permission matrix           | one exported `PERMISSIONS: Record<PermissionKey, MemberRole[]>`; `can(role, key)` is the only read path                                                     | same                                           |
| Member statuses             | `pending → active → removed`; `removed → active` allowed on re-approval (same row, history kept)                                                            | `packages/domain/workspace/memberLifecycle.ts` |
| Last-owner invariant        | `count(workspace_members where role='owner' and status='active') >= 1` for `type='school'`, enforced by a `BEFORE UPDATE`/`AFTER UPDATE` constraint trigger | migration                                      |
| Admin ceiling               | an `admin` may not create, target or produce an `owner` row                                                                                                 | trigger + `can()`                              |
| Self-edit ban               | no member may update their own `role` or `status`                                                                                                           | RLS + trigger                                  |
| Personal workspace shape    | exactly one member, `owner`; no `school_profiles`, no join code, no invitations; `workspaces.name` defaults to `"{full_name}'s workspace"`                  | `createPersonalWorkspace`                      |
| Workspace short code        | `WS-` + 6-digit per-platform sequence via `app.next_id` (PRODUCT-DECISIONS §2.6)                                                                            | `app.next_id`                                  |
| Employee number             | `ADM-{year}-{4-digit per-workspace sequence}`, generated on first save when blank                                                                           | `app.next_id(workspace_id,'staff')`            |
| Slug                        | lowercase, ASCII-folded, hyphenated, deduped with `-2`, `-3`; immutable after creation unless platform staff change it                                      | `packages/domain/workspace/slug.ts`            |
| Working days default        | `{Sat,Sun,Mon,Tue,Wed,Thu}`, timezone `Asia/Dhaka` (PRODUCT-DECISIONS §2.5)                                                                                 | `school_profiles` defaults                     |
| "Today"                     | `(now() at time zone school_profiles.timezone)::date`, computed in SQL and mirrored by a single client helper                                               | `packages/domain/time/today.ts`                |
| Module effective visibility | `entitled(plan, module) && (workspace_modules.is_visible ?? true) && can(role, module.permission)`                                                          | `packages/domain/modules.ts`                   |
| Nav composition             | one typed nav config per workspace type, filtered by the expression above, max 5 bottom-nav items + "More" sheet                                            | `packages/ui/nav`                              |
| Context resolution order    | `x-workspace-id` → `acx_ws` cookie → `default_workspace_id` → `last_workspace_id` → first active membership (personal first)                                | `resolveWorkspaceContext`                      |
| Landing route               | §4.4 table                                                                                                                                                  | `resolveLanding.ts`                            |
| Removal effect latency      | immediate — the next resolution fails; no token revocation needed because tenancy is not in the token                                                       | —                                              |
| Custom label                | one per member; base role restricted to `admin                                                                                                              | teacher                                        | staff`; never consulted by `can()` | `packages/domain/workspace/labels.ts` |
| Workspace cap per user      | soft limit 20 active memberships; beyond that, joining requires platform-staff review (anti-abuse)                                                          | `packages/domain/workspace/limits.ts`          |

## 6. UI

Components: `WorkspaceChip`, `WorkspaceSwitcherSheet`, `AppShell`/`BottomNav`/`Sidebar`, `DataList`, `MemberCard`, `RoleSelect`, `ConfirmSheet` (destructive variant), `FormSheet`, `SettingsSection`, `Banner`, `EmptyState`, `Skeleton`, `FilterSheet`.

| Screen / route                                             | 360×800                                                                                                                                                                                 | ≥1024                                                                        | Primary action      | Empty                                                              | Loading          | Error                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------- |
| Workspace switcher (top bar chip, every shell)             | Chip shows the workspace initial + truncated name; tap opens a bottom `Sheet`, one row per workspace, 56 px tall, current one ticked; "Create or join a workspace" pinned at the bottom | Dropdown from the top bar, same rows                                         | Switch              | Only one workspace → the chip is not tappable and shows no chevron | Skeleton rows ×3 | Row-level "No longer available" state                                        |
| Team & Access — `/app/staff/team`                          | Segmented Active/Pending/Removed; sticky search; member cards; FAB "Invite" bottom-right in thumb reach; actions in an action sheet                                                     | Table with inline role select, bulk checkbox column, right-side detail panel | Invite member       | "Just you so far — invite your teachers" + primary Invite button   | 6 card skeletons | Full-width `InlineAlert` with retry; a failed role change reverts the select |
| Pending tab                                                | Each card shows how they asked (code or invite), when, and Approve / Reject as two 44 px buttons side by side                                                                           | Same as a table with row actions                                             | Approve             | "No one is waiting"                                                | skeletons        | per-row revert                                                               |
| Member detail                                              | Full-height sheet: identity block, role + label, staff fields, activity summary, danger zone at the bottom                                                                              | Right panel, 420 px                                                          | Save                | —                                                                  | skeleton         | inline                                                                       |
| Change role confirm                                        | Bottom sheet with plain-language consequences and a red/primary confirm                                                                                                                 | Dialog 480 px                                                                | Confirm             | —                                                                  | button spinner   | `LAST_OWNER_BLOCKED` explainer with the transfer link                        |
| Transfer ownership — `/app/settings/workspace` → Ownership | Three-step full-screen sheet (choose → consequences → re-auth)                                                                                                                          | Dialog with a stepper                                                        | Transfer ownership  | "You are the only member — invite someone first"                   | skeleton         | inline per step                                                              |
| Custom labels — `/app/settings/labels`                     | List of label chips; FAB to add; edit in a sheet                                                                                                                                        | Two-column list + form                                                       | New label           | "Titles like Principal or Coordinator live here"                   | skeleton         | inline                                                                       |
| Module visibility — `/app/settings/modules`                | One row per module: name, one-line description, state chip, switch on the right; locked rows show a plan badge instead of a switch                                                      | Same rows at 720 px with the plan badge inline                               | toggle (auto-saves) | n/a                                                                | skeleton rows    | switch reverts with a toast; dependency block is a sheet                     |
| Workspace settings — `/app/settings/workspace`             | Sections stacked: Identity, Logo, Academic, Contact, Ownership, Danger zone; working days as a 7-chip wrap row starting Saturday                                                        | Left section nav + right form                                                | Save section        | n/a                                                                | field skeletons  | inline per field                                                             |
| Suspended workspace                                        | Full-screen state: what happened, who to contact, a Sign-out button; no nav rendered                                                                                                    | Same centred                                                                 | Contact support     | —                                                                  | —                | —                                                                            |

Phone specifics called out because they are easy to get wrong: the switcher and the Invite FAB are both in the bottom third of the screen; destructive confirmations are sheets with the destructive action at the **bottom** (thumb) and Cancel above it; the roster search never triggers a layout jump when the keyboard opens (the list scroll container is height-stable).

## 7. Server contracts

Schemas in `packages/contracts/src/identity/workspace.ts` and `.../membership.ts`. Actions in `apps/web/app/(school)/app/settings/actions.ts` and `apps/web/app/(shared)/workspace/actions.ts`.

| Action / handler                                                        | Input schema                                                                                                                                   | Output                                                                                        | Errors                                                                                                   | Idempotency                                                                                | Rate limit     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| `createPersonalWorkspace` (internal, called by the signup trigger path) | `CreatePersonalWorkspaceInput` {user_id, full_name}                                                                                            | `WorkspaceDto`                                                                                | `ALREADY_EXISTS`                                                                                         | one per user, enforced by a partial unique index on `(created_by)` where `type='personal'` | —              |
| `createSchoolWorkspace`                                                 | `CreateSchoolWorkspaceInput` {name, eiin?, board, medium, timezone, working_days, academic_year_start_month, grade_level_ids[]}                | `{ workspace, landingRoute }`                                                                 | `VALIDATION`, `EIIN_TAKEN`, `RATE_LIMITED`                                                               | `idempotency_key` required                                                                 | 3/day per user |
| `updateWorkspace`                                                       | `UpdateWorkspaceInput` {name?, logo_url?}                                                                                                      | `WorkspaceDto`                                                                                | `FORBIDDEN`, `VALIDATION`                                                                                | last write wins                                                                            | 60/h           |
| `updateSchoolProfile`                                                   | `UpdateSchoolProfileInput` (all school_profiles fields, partial)                                                                               | `SchoolProfileDto`                                                                            | `FORBIDDEN`, `VALIDATION`, `EIIN_TAKEN`                                                                  | last write wins                                                                            | 60/h           |
| `switchWorkspace`                                                       | `SwitchWorkspaceInput` {workspace_id}                                                                                                          | `{ landingRoute, workspaceType }` + sets `acx_ws`                                             | `WORKSPACE_NOT_MEMBER`, `WORKSPACE_SUSPENDED`                                                            | idempotent                                                                                 | 120/h          |
| `listMyWorkspaces`                                                      | `ListMyWorkspacesInput` {}                                                                                                                     | `MembershipSummary[]` {workspace_id, name, type, role, status, logo_url} — includes `pending` | `UNAUTHENTICATED`                                                                                        | n/a                                                                                        | 120/min        |
| `listMembers`                                                           | `ListMembersInput` {status?, role?, label_id?, q?, cursor?, limit ≤ 50}                                                                        | `Paginated<MemberRowDto>`                                                                     | `FORBIDDEN`                                                                                              | n/a                                                                                        | 120/min        |
| `approveMember`                                                         | `ApproveMemberInput` {member_id, role?}                                                                                                        | `MemberRowDto`                                                                                | `FORBIDDEN`, `NOT_PENDING`, `SEAT_LIMIT_REACHED`                                                         | by member_id (already active = success)                                                    | 120/h          |
| `rejectMember`                                                          | `RejectMemberInput` {member_id, reason?}                                                                                                       | `MemberRowDto`                                                                                | `FORBIDDEN`, `NOT_PENDING`                                                                               | idempotent                                                                                 | 120/h          |
| `changeMemberRole`                                                      | `ChangeMemberRoleInput` {member_id, role}                                                                                                      | `MemberRowDto`                                                                                | `FORBIDDEN`, `FORBIDDEN_OWNER_TARGET`, `LAST_OWNER_BLOCKED`, `SELF_EDIT_FORBIDDEN`, `SEAT_LIMIT_REACHED` | idempotent when the role already matches                                                   | 120/h          |
| `updateMemberStaffFields`                                               | `UpdateMemberStaffFieldsInput` {member_id, employee_no?, department?, work_email?, work_phone?, subject_ids?}                                  | `MemberRowDto`                                                                                | `FORBIDDEN`, `EMPLOYEE_NO_TAKEN`                                                                         | last write wins                                                                            | 120/h          |
| `assignMemberLabel`                                                     | `AssignMemberLabelInput` {member_id, custom_label_id: uuid \| null}                                                                            | `MemberRowDto`                                                                                | `FORBIDDEN`, `LABEL_NOT_FOUND`                                                                           | idempotent                                                                                 | 120/h          |
| `removeMember`                                                          | `RemoveMemberInput` {member_id, reason?}                                                                                                       | `MemberRowDto`                                                                                | `FORBIDDEN`, `FORBIDDEN_OWNER_TARGET`, `LAST_OWNER_BLOCKED`, `SELF_EDIT_FORBIDDEN`                       | idempotent                                                                                 | 60/h           |
| `leaveWorkspace`                                                        | `LeaveWorkspaceInput` {workspace_id, archive_if_empty?: boolean}                                                                               | `{ landingRoute }`                                                                            | `LAST_OWNER_BLOCKED`                                                                                     | idempotent                                                                                 | 20/h           |
| `transferOwnership`                                                     | `TransferOwnershipInput` {workspace_id, target_user_id, keep_self_as_owner: boolean, confirm_name: string, reauth: {password?} \| {otp_code?}} | `{ ok: true }`                                                                                | `FORBIDDEN`, `TARGET_NOT_ELIGIBLE`, `NAME_MISMATCH`, `REAUTH_FAILED`                                     | `idempotency_key` required                                                                 | 5/day          |
| `createCustomLabel` / `updateCustomLabel` / `deleteCustomLabel`         | `CustomLabelInput` {name, name_bn?, base_role, color} (+ `id` for update/delete)                                                               | `CustomLabelDto`                                                                              | `FORBIDDEN`, `LABEL_NAME_TAKEN`, `VALIDATION`                                                            | by `(workspace_id, lower(name))`                                                           | 60/h           |
| `setModuleVisibility`                                                   | `SetModuleVisibilityInput` {module_key, is_visible}                                                                                            | `ModuleVisibilityDto[]`                                                                       | `FORBIDDEN`, `MODULE_NOT_ENTITLED`, `MODULE_DEPENDENCY_BLOCKED`                                          | idempotent                                                                                 | 60/h           |
| `archiveWorkspace`                                                      | `ArchiveWorkspaceInput` {workspace_id, confirm_name}                                                                                           | `{ ok: true }`                                                                                | `FORBIDDEN`, `NAME_MISMATCH`, `HAS_ACTIVE_SUBSCRIPTION`                                                  | idempotent                                                                                 | 3/day          |
| `GET /api/workspace/context` (route handler)                            | —                                                                                                                                              | `WorkspaceContextDto` (no secrets)                                                            | `WORKSPACE_NOT_MEMBER`                                                                                   | n/a                                                                                        | 240/min        |

`can(ctx.role, key)` is asserted in every action **before** the repository call, even though RLS would also block it (ARCHITECTURE §5) — and the tests assert both layers independently.

## 8. Parts (build chunks)

**Part 1 — Tables, enums and RLS foundation** · Migrations for `workspaces`, `school_profiles`, `workspace_members`, `custom_labels`, `workspace_modules`; the five `app.*` helper functions; the policy template applied to all five tables; the last-owner and self-edit triggers; `app.next_id`. · Files: `supabase/migrations/*_tenancy.sql`, `packages/db/src/types.generated.ts`. · Tests: pgTAP suite — cross-tenant select/insert/update/delete denied on every table; self-promotion denied; last-owner demotion denied; direct `workspace_members` insert with `role='owner'` denied; no DELETE grant anywhere. · **Demo:** run the pgTAP suite in CI and show the four security-review attack paths failing at the database level with no application code deployed.

**Part 2 — `WorkspaceContext` resolution and the repository contract** · `resolveWorkspaceContext`, `x-workspace-id` plumbing, `acx_ws` cookie, `set_config` transaction settings, the `WorkspaceContext`-first repository signature in `packages/db`, `tenancy.context_rejected` audit tripwire, structured log fields. · Tests: unit tests for the resolution order; an integration test that a forged header 403s and writes the tripwire row; an ESLint/Semgrep rule that fails the build on any repository export whose first parameter is not a `WorkspaceContext`. · **Demo:** in a preview environment, send a valid session with another school's `x-workspace-id` and get a 403 plus an audit row.

**Part 3 — Permission matrix and the nav engine** · `packages/domain/permissions.ts`, `modules.ts` with the dependency graph, the typed nav config per workspace type, `AppShell` filtering by entitlement ∧ visibility ∧ role, route-level guards returning 404 for hidden modules. · Tests: 100 % unit coverage of `can()` across role × key; a test asserting nav and route guards read the same matrix (guards against prototype D6 drift). · **Demo:** switch the signed-in role in a seeded workspace and watch the bottom nav and the reachable routes change together.

**Part 4 — Workspace switcher and landing-route resolution** · `WorkspaceChip` + switcher sheet on phone and desktop, `switchWorkspace`, `listMyWorkspaces`, `resolveLandingRoute`, cache clearing on switch, pending-membership rows. · Tests: e2e switching between a school and a personal workspace at 360×800 and asserting the shell changes; a unit matrix for `resolveLandingRoute`. · **Demo:** a user with a school and a personal workspace switches on a phone and the whole shell changes, including the bottom nav.

**Part 5 — Team & Access roster (read + approve/reject)** · `/app/staff/team`, `listMembers` with server-side search/filter/cursor pagination, the three tabs, `approveMember`, `rejectMember`, member detail sheet. · Tests: pagination and filter integration tests; e2e approve journey; axe. · **Demo:** approve a pending teacher on a phone and watch them gain access in a second browser without a reload beyond one refetch.

**Part 6 — Role changes, staff fields, labels** · `changeMemberRole` with the consequences sheet, `updateMemberStaffFields`, `employee_no` generation, `custom_labels` CRUD, `assignMemberLabel`, the "labels are not permissions" copy. · Tests: trigger tests for admin-touching-owner and self-edit; integration tests for each named error; e2e label assignment. · **Demo:** create a "Vice-Principal" label over the `admin` base role, assign it, and show the permission matrix is unchanged.

**Part 7 — Removal, leaving, ownership transfer** · `removeMember` with the consequences sheet and resource-orphaning hook, `leaveWorkspace`, the three-step `transferOwnership` with re-auth, all four notifications, `workspace.archive`. · Tests: the "removed member loses access on the next request" e2e (two browser contexts), last-owner blocks at every entry point, transfer transaction atomicity. · **Demo:** remove a teacher who is mid-session in another browser; their next action fails with a clear "You no longer have access to this school" screen.

**Part 8 — Workspace settings, module visibility, suspended/archived states** · `/app/settings/workspace`, logo upload, working-days picker, `setModuleVisibility` with dependency blocking and 404 routing, suspended and archived screens, `archiveWorkspace`. · Tests: hidden-module route returns 404; dependency block; timezone change recomputes "today" in an attendance query test; e2e for the suspended state. · **Demo:** hide Hiring as an owner — it disappears from the nav and `/app/hiring` 404s for every member of that school and nobody else.

## 9. Acceptance criteria

1. **Given** a signed-in user with no membership in school S, **when** their client sends `x-workspace-id: S`, **then** the server responds 403 `WORKSPACE_NOT_MEMBER`, no data from S is returned, and an `audit_events` row `tenancy.context_rejected` is written.
2. **Given** any authenticated user, **when** they attempt `insert into workspace_members (workspace_id, user_id, role, status) values (S, me, 'owner', 'active')` through the browser client, **then** the insert is rejected by RLS — the security review's finding 2 cannot be reproduced.
3. **Given** a teacher in school S, **when** they attempt to update their own `workspace_members.role` to `admin`, **then** the update is rejected by both the RLS policy and the trigger, and `can()` never even runs.
4. **Given** an admin, **when** they attempt to change an owner's role or remove an owner, **then** they receive `FORBIDDEN_OWNER_TARGET` and nothing changes.
5. **Given** a school with exactly one active owner, **when** that owner tries to leave, be removed, or be demoted by any path, **then** `LAST_OWNER_BLOCKED` is returned and the database still has ≥ 1 active owner.
6. **Given** a teacher removed from school S while they have an open session, **when** they perform their next action in S, **then** it fails membership resolution, they see the "no longer have access" screen, and no row from S is served — and their membership row still exists with `status='removed'`, `removed_at`, `removed_by`.
7. **Given** a removed member, **when** an owner later approves them again, **then** the same `workspace_members` row is reactivated (`status='active'`) and the previous `removed_at`/`removed_by` remain visible in the audit trail.
8. **Given** a user with a personal and a school workspace, **when** they switch to the personal one from the top-bar chip at 360×800, **then** the URL becomes `/personal`, the bottom nav changes to the personal set, and no query returns school data.
9. **Given** a user whose only membership is `personal`, **when** they navigate directly to `/app/dashboard`, **then** they are redirected to `/personal` — not shown an empty school dashboard (the prototype's W16 bug).
10. **Given** a `parent` member of school S, **when** they sign in, **then** they land on `/family`, `/app/*` is not reachable, and `app.has_role(S,'{owner,admin,teacher,staff}')` is false for them.
11. **Given** an owner who hides the Hiring module, **when** any member of that school opens `/app/hiring`, **then** the route returns 404 and the item is absent from both the bottom nav and the "More" sheet; **and** members of other schools are unaffected.
12. **Given** a module not included in the workspace's plan, **when** the owner opens the module settings, **then** the row shows the required plan and offers no switch.
13. **Given** an owner transferring ownership to an active admin, **when** they complete the name confirmation and re-authentication, **then** in one transaction the target becomes `owner`, the initiator becomes `admin` (unless they kept ownership), three notifications are queued, and one `workspace.ownership_transferred` audit row records both user ids.
14. **Given** a custom label "Principal" over base role `admin`, **when** it is assigned to a teacher, **then** the teacher's displayed title changes and `can()` still evaluates their permissions as `teacher`.
15. **Given** a school whose `timezone` is changed from `Asia/Dhaka` to `Asia/Kolkata`, **when** an attendance screen computes "today", **then** it uses the new timezone in SQL, not the browser's.
16. **Given** a roster of 400 members, **when** a search term is typed on a phone, **then** the filtering happens server-side, the first page returns ≤ 50 rows, and no request downloads the whole roster.
17. **Given** a suspended workspace, **when** any member signs in with it as their active workspace, **then** they see the suspended screen and every data request for that workspace is refused.
18. **Given** a repository function in `packages/db`, **when** CI runs the lint rule, **then** any exported repository whose first parameter is not `WorkspaceContext` fails the build.

## 10. Tests

- **Unit (`packages/domain`, ≥ 80 %):** `can()` over the full role × permission-key matrix (table-driven, every cell asserted); `memberLifecycle` transitions including illegal ones; `resolveLanding` matrix; `modules.effectiveVisibility` including dependency blocking; `slug` generation and dedupe; `limits.canAddMember` against plan seat counts.
- **DB (pgTAP — the most important suite in the repository):** for each of `workspaces`, `school_profiles`, `workspace_members`, `custom_labels`, `workspace_modules`: a member of workspace A sees zero rows of workspace B for select/update/delete; an anonymous role sees zero rows; a `pending` member sees zero rows; a `removed` member sees zero rows; a `parent` member sees zero staff rows. Escalation: self-insert as owner denied; self-update of role/status denied; admin promoting to owner denied; last-owner demotion denied; `workspace_members` DELETE denied for every role including `owner`; `workspaces.type` and `plan_id` unchangeable by owners. Helper correctness: `app.member_role` returns null for `pending`/`removed`.
- **Integration (server actions):** every action in §7 for happy path and every named error; `switchWorkspace` with a workspace the caller left; `approveMember` when the plan's teacher seat limit is reached; `transferOwnership` atomicity under a simulated mid-transaction failure; idempotency-key replay for `createSchoolWorkspace` and `transferOwnership`.
- **E2E (360×800 and 1280×800):** `switch-workspace-changes-shell`, `approve-pending-teacher`, `change-role-consequences`, `remove-member-kills-access` (two contexts), `transfer-ownership`, `hide-module-hides-nav-and-404s`, `team-roster-search-and-paginate`.
- **A11y:** axe on the switcher sheet, the roster, and every settings section; the roster segmented control and the role selects are keyboard-operable; destructive confirmations trap focus and announce their consequence text.
- **Performance budgets:** `resolveWorkspaceContext` ≤ 15 ms server-side (one indexed lookup, cached per request); `listMembers` p95 ≤ 250 ms at 2,000 members; the roster's first contentful paint ≤ 2.5 s on simulated 3G at 360×800; nav computation is pure and memoised (no network).
- **Security:** a Semgrep rule forbidding `x-workspace-id` from being read anywhere except `resolveWorkspaceContext`; a rule forbidding `localStorage` reads of any workspace id; the four security-review attack paths encoded as explicit failing-by-design tests.

## 11. Open questions

- **OQ-1 (conflict): shell resolution is type ∧ role, not type alone.** PRODUCT-DECISIONS §1.1 says "the active workspace's `type` decides" the shell, but ARCHITECTURE §2 defines a separate `(parent)/family/` shell and §1.13 creates `parent` memberships inside `school` workspaces. A parent whose active workspace is a school must land on `/family`, never `/app`. **Default assumed:** the resolver in §4.4 (role is the tie-break). PRODUCT-DECISIONS §1.1 should be amended to say so.
- **OQ-2: seat limits and what happens when a plan downgrades.** PRODUCT-DECISIONS §5.1 gives per-plan teacher/student caps and §5.2 says over-limit data becomes read-only, but does not say what happens to _members_ over the cap. **Default assumed:** existing members are never auto-removed; new approvals and invitations are blocked with `SEAT_LIMIT_REACHED` and an upgrade prompt, and the roster shows an over-cap banner. Billing area to confirm.
- **OQ-3: re-joining a workspace you were removed from.** **Default assumed:** allowed — the same membership row is reactivated, preserving history. If a school wants a hard ban, that is a future `blocked` status, not a v1 feature.
- **OQ-4: multi-campus.** Explicitly out of scope (PRODUCT-DECISIONS §7: one workspace = one campus). Noted so nobody adds a `parent_workspace_id` column opportunistically.
- **OQ-5: `workspaces.short_code` uniqueness scope.** `app.next_id` is documented as _per-workspace_ (PRODUCT-DECISIONS §2.6), but the workspace short code must be unique _per platform_. **Default assumed:** `app.next_id` accepts a null workspace id for platform-scoped sequences. DATA-MODEL to confirm.
- **OQ-6: who may see the roster.** **Default assumed:** teachers and staff see directory cards (name, avatar, label, department) so they can address colleagues, but not work contact details, employee numbers or status history. An owner can widen this later via a setting; not in v1.
