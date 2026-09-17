# Acadigma Campus (Base44) — Security Review

**Target:** `Acadigma Campus Base44 Source Code` — the export behind the live app at school-troop.base44.app
**Scope:** 243 files, 27,773 LOC, 64 entity schemas. Six parallel review agents across authorization, tenant isolation, PII/file exposure, financial integrity, secrets/injection, and audit/lifecycle. Findings below were re-verified by hand.
**Method:** static review only. No authentication, no live probing, no exploitation.

---

## Verify this first — it decides everything below

Every high-severity finding here reduces to one question:

> **In Base44, what does an entity with no `rls` block do? And what does `"create": {}` mean — unrestricted, or deny?**

The code is written as though the answer is "the platform handles it." `src/lib/RoleGuard.jsx:8` says so in a comment: _"Layer 4: API — server-side validation (Base44 platform handles this)."_

If `{}` and "no block" mean **unrestricted**, this app has critical, actively exploitable holes and the live app is exposing children's records and government ID scans right now.
If they mean **deny**, most findings collapse into "fragile design, no defence in depth."

**Do not guess.** Log in as a low-privilege test account, open devtools, and run:

```js
await base44.entities.IdentityVerification.list() // should be empty/403
await base44.entities.SchoolSettings.list() // should return only your school
await base44.entities.User.list() // should not return the platform
```

Three calls, two minutes. Everything below is prioritised on the assumption that they return data.

---

## Root cause

**Tenant isolation is anchored to a field the client writes to itself.**

22 of 64 entities have RLS, and nearly all of it is the same rule:

```json
"read": { "data.workspace_id": "{{user.data.active_workspace_id}}" }
```

`active_workspace_id` is a custom field on the user's own record. The client sets it directly — `src/lib/SchoolContext.jsx:78`:

```js
const switchWorkspace = (id) => {
  setActiveWorkspaceId(id)
  localStorage.setItem("activeWorkspaceId", id)
  base44.auth.updateMe({ active_workspace_id: id }).catch(() => {})
}
```

Nothing verifies that `id` is a workspace the caller belongs to. The membership check (`status === 'active'`) lives in React state, not in the write.

So the server-side rule is effectively _"you may read the workspace you say you're in."_ Combined with `SchoolSettings.rls.read` being `{}` — world-readable, so every school's id is enumerable — this is the whole ballgame.

---

## Critical findings (all verified by hand)

### 1. Cross-tenant takeover in two SDK calls

`src/lib/SchoolContext.jsx:78` · `base44/entities/SchoolSettings.jsonc` (`"read": {}`) · `base44/entities/Student.jsonc` (rls block)

```js
await base44.entities.SchoolSettings.list() // enumerate every school
await base44.auth.updateMe({ active_workspace_id: "<their id>" }) // become a member of one
await base44.entities.Student.list() // read their children
```

`Student.jsonc` RLS checks `workspace_id` and **nothing else** — no role predicate. That returns, for every child in that school: date of birth, religion, health conditions, allergies, medications, prescription and immunisation file URLs, national ID numbers and document scans for the child _and both parents_, home address, and parent contact details.

Repeatable against every school on the platform. No membership required at any point.

### 2. `WorkspaceMember.create` is `{}` — self-appointment as owner

`base44/entities/WorkspaceMember.jsonc`

```json
"create": {},
"update": { "data.workspace_id": "{{user.data.active_workspace_id}}" }
```

`create` has no constraint on `workspace_id`, `role`, or `status`. `update` checks the _target row's_ workspace but never the _caller's_ role.

```js
base44.entities.WorkspaceMember.create({
  workspace_id: "<any school>",
  user_email: me,
  role: "owner",
  status: "active",
})
```

`useEffectiveRole()` maps `owner` → `superadmin`. Instant full control of a school you were never invited to. A parent can also self-promote to admin by updating their own row.

### 3. Government ID scans and selfies have no RLS at all

`base44/entities/IdentityVerification.jsonc`

The schema annotates these fields: _"INTERNAL ONLY — never expose to public, schools, or buyers."_ The file has **no `rls` block**. The comment is documentation, not a control. The UI tells users _"🔒 only accessible by SchoolTroop internal staff"_ (`VerificationWall.jsx:140`).

`base44.entities.IdentityVerification.list()` would return every seller's passport/NID image plus their selfie — a complete identity-fraud kit.

### 4. Marketplace has no payment processing at all

`src/pages/marketplace/ListingDetail.jsx:70-94`

The UI says _"Secure payment via SSLCommerz / Stripe."_ There is no such call anywhere in the codebase. `@stripe/stripe-js` is in `package.json` and never imported. "Buy Now" writes the record and stops:

```js
const transaction = await base44.entities.MarketplaceTransaction.create({
  amount: listing.price, status: isSchoolFunded ? 'pending' : 'completed', ...
});
await base44.entities.SellerEarnings.create({ seller_amount: sellerAmount, ... });
```

Both entities declare `"create": {}`. Two consequences: **every paid listing is already free today** through the normal UI, and anyone can mint a `SellerEarnings` row payable to themselves with a self-chosen amount.

Commission compounds it: `CommissionEngine.jsx:17` holds the rate in React state behind an `<input min="0" max="50">` — and it disagrees with the hardcoded rate in `MarketplaceConstants.jsx`, so the same transaction pays out differently depending on code path.

### 5. The audit trail is not evidence

`src/lib/auditLog.js` · `base44/entities/AuditLog.jsonc`

Four compounding problems:

- Written **from the browser**, best-effort — failure is a `console.warn`. An attacker just doesn't call it.
- `AuditLog` has **no `rls` block**, so rows are writable and deletable by anyone.
- The app proves this itself: `DossierScorecard.jsx:66` calls `AuditLog.update(...)`, overwriting a prior entry in place — directly contradicting the module's own _"read-only (no edit, no delete)"_ comment.
- Both real call sites pass **arguments in the wrong order**:

```js
// signature: logAudit(user, action_type, entity_type, ...)
await logAudit('resource.reassigned', user?.id, {...})   // SchoolResourceLibrary.jsx:89
await logAudit('cover.override',      user?.id, {...})   // CoverAssignmentPanel.jsx:74
```

Every row those produce has `user_id: 'system'`, `school_id: 'unknown'`, and a raw UUID where the action name should be. `logActivity()` has **zero** call sites — the entire activity feed never fires.

Net: for a system holding children's records, _"who changed this child's medical record, and when"_ is currently unanswerable.

### 6. Removed staff keep access

`src/pages/WorkspaceMembers.jsx:81-92`

Removal deletes the `WorkspaceMember` row. But access is gated by the user's own `active_workspace_id`, which nothing clears. No RLS rule references `WorkspaceMember` at all.

A teacher dismissed for misconduct involving a student retains full read/write to student records after removal — and per finding 5, that window is unauditable. The `status: 'removed'` enum exists in the schema and is used nowhere.

---

## Also confirmed

| Finding                                                                                                                              | Location                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `/messaging` is the only unguarded route; its "Admin" channel is one click from any role, incl. parents                              | `App.jsx:123`, `Messaging.jsx:14`                                                 |
| `User.list()` called to find one user — dumps every profile on the platform                                                          | `CandidateProfile.jsx:31`                                                         |
| ParentPortal fetches **all** students, then filters in React                                                                         | `ParentPortal.jsx:42`                                                             |
| Teacher CVs / certificates / marksheets — no RLS; approval gate only hides a button                                                  | `TeacherPublicProfile.jsonc`, `CandidateProfile.jsx:215`                          |
| Applicant résumés and ID documents — no RLS                                                                                          | `Applicant.jsonc`, `JobApplication.jsonc`                                         |
| `main_file_url` for paid listings ships in the public browse feed                                                                    | `Marketplace.jsx:76`                                                              |
| AI quota never checked before `InvokeLLM`; credit entities have no RLS                                                               | `AIPlanner.jsx:88`, `CreditAllocation.jsonc`                                      |
| `SchoolSubscription` has no RLS — plan/status client-writable                                                                        | `SchoolSubscription.jsonc`                                                        |
| Invitations: no RLS, no expiry enforcement, email binding never checked on redeem                                                    | `SchoolWorkspaceInvitation.jsonc`, `Workspaces.jsx:28`                            |
| `useScopedEntity.js` — 92 lines promising _"ZERO data leakage"_ — **has no call sites**                                              | `src/lib/useScopedEntity.js`                                                      |
| `getUserRole()` fails **open** to `teacher` for any unknown role                                                                     | `permissions.js:77`                                                               |
| `user.school_id` doesn't exist on the User schema → three flows write `school_id: 'default'`, collapsing all tenants into one bucket | `PaymentMethodsPanel.jsx:31`, `ManualExpensesPanel.jsx:74`, `CustomLabels.jsx:64` |
| Logout doesn't clear `activeWorkspaceId`                                                                                             | `AuthContext.jsx:117`                                                             |
| Invite codes use `Math.random()`, no rate limiting on lookup                                                                         | `Welcome.jsx:23`                                                                  |

**42 of 64 entities have no `rls` block**, including: `IdentityVerification`, `User`, `Message`, `AuditLog`, `PaymentMethod`, `BillingRecord`, `SchoolSubscription`, `Applicant`, `JobApplication`, `TeacherPublicProfile`, `IntegrationConfig`, `Handout`, `AttendanceLog`, `TeacherAttendance`, `Grade`.

Four of those — `Handout`, `AttendanceLog`, `TeacherAttendance`, `SchoolBook` — have no tenant field _at all_, so they cannot be scoped even if someone wanted to.

---

## Clean

Worth saying plainly, because these are the usual suspects and they're fine:

- **No hardcoded secrets.** No API keys, tokens, or credentials anywhere. Config comes from `import.meta.env.VITE_*`.
- **No XSS.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or `document.write` in the tree. `react-markdown` is used once without `rehype-raw`, so raw HTML is stripped. `react-quill` is a dependency but unused — remove it.
- **No open redirect.** `authReturnTo.js` correctly allowlists same-origin and rejects `//` and backslash payloads (though it's dead code — `Login.jsx` never imports it). `OAuthConsent.jsx` validates redirect schemes properly; it's the most carefully written file in the codebase.
- **No PCI exposure.** Only last-four/brand/expiry/name are stored. No PAN, no CVV.
- **Password reset tokens** are read from the URL, passed straight to the SDK, never persisted or logged.

---

## What to do

**Today** — run the three console calls above. If they return data, the live app is breached-by-design and needs an immediate decision about taking the marketplace and recruitment surfaces offline.

**This week, in order:**

1. `IdentityVerification` — add RLS restricting read to `data.user_id == {{user.id}}`. Government ID scans.
2. `WorkspaceMember.create` — require `status: 'pending'` and `user_email == {{user.email}}`. Role/status changes move server-side.
3. `SchoolSettings.read` — scope to members; stop exposing `invite_code` and `owner_id`.
4. `active_workspace_id` — make it settable only by a server function that verifies an active membership row.
5. Marketplace — disable "Buy Now" until real payment processing exists. It is giving away paid content right now.
6. Add RLS to the other 41 entities.

**Then:** fix the two `logAudit` call sites, and move audit writing server-side.

---

## What this means for the rewrite

The Release 0 spec already calls for exactly the right thing — RLS _plus_ API policy checks _plus_ client guards as UX only. This review is the evidence for why that ordering matters, and it sharpens three requirements:

- **Tenant context must never come from a client-writable field.** This is the single root cause here. Organization context belongs in the session, derived server-side from membership.
- **RLS must check membership and role, not just the tenant id.** Every rule in the Base44 app checks `workspace_id` alone, which is why a parent can read a `superadmin`-gated record.
- **Audit events must be written by the server**, in the same transaction as the mutation — never by the client, and never best-effort.

One correction to the spec's migration plan: it says _"map entities, validate ownership, import to staging."_ Given findings 2 and 4, ownership in the current data may already be wrong — forged memberships, fabricated transactions and earnings rows. Migration needs a reconciliation step that treats existing `WorkspaceMember`, `MarketplaceTransaction` and `SellerEarnings` rows as **untrusted**, not as ground truth to be copied forward.

---

## Caveats

Base44's server-side behaviour is not visible in this export. Findings marked against missing or empty RLS depend on the platform defaulting to permissive, which the code's own comments assume but which I could not verify. That assumption is the first thing to test.

I did not authenticate to the live app or attempt any exploitation. Every finding is from static reading of the export. The attack paths are described from code structure and have not been executed.
