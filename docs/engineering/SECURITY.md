# Acadigma Campus — Security

The threat model, the controls that answer it, and the tests that prove each control exists. Controls are specified in `docs/architecture/ARCHITECTURE.md` §11; this document expands them, maps them to the evidence in `docs/reference/base44-security-review.md`, and defines how we work securely day to day.

**What this system holds:** children's dates of birth, religion, health conditions, allergies, medications, prescription and immunisation files; national ID numbers and document scans for children and both parents; teacher CVs and certificates; government ID scans and selfies for seller KYC; payment records in BDT. The prototype exposed most of it. That is the bar we are clearing.

**Disclosure:** see `SECURITY.md` at the repository root.

---

## 1. Principles

1. **The database and the server are the security boundary.** Client-side guards are experience. Every control is enforced in Postgres (RLS) _and_ in the server layer (policy check), and both are tested.
2. **Tenant context never comes from the client.** The single root cause of the prototype's breach class was a client-writable `active_workspace_id`. Context is derived server-side from `workspace_members`.
3. **Authorisation is role _and_ tenant.** A predicate on `workspace_id` alone is not authorisation — it is what let a parent read superadmin-gated records.
4. **Default deny.** Unknown role → no permissions (the prototype failed open to `teacher`). Unknown flag → off. No policy → no access, guaranteed by `coverage.sql` failing the build.
5. **Evidence over intent.** A schema comment saying "INTERNAL ONLY" is documentation; RLS is the control. Every claim in this document has a test id next to it.

---

## 2. Threat model (STRIDE per surface)

Surfaces are the trust boundaries in ARCHITECTURE §1. Risk is post-control residual risk.

### 2.1 Browser → Next.js (Server Actions, Route Handlers)

| STRIDE              | Threat                                                                            | Control                                                                                                                                                                                 | Test                          |
| ------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **S**poofing        | Forged or replayed session; `x-workspace-id` for a workspace the caller is not in | Supabase Auth JWT verified server-side; `resolveWorkspaceContext()` queries `workspace_members` for `(ws, auth.uid(), status='active')`; header alone grants nothing                    | `T-CTX-01`, `T-CTX-02`        |
| **T**ampering       | Client-supplied amounts, roles, workspace ids, `created_by`                       | Zod parse at every entry point; server ignores client-sent money (D-06) and computes from `platform_settings`; `workspace_id`/`created_by` set server-side, never from the body         | `T-ACT-INPUT-*`, `T-MONEY-01` |
| **R**epudiation     | "I never changed that medical record"                                             | `audit_events` written by a database trigger inside the mutation's transaction, actor from `auth.uid()`, correlation id from a request-scoped setting; table has no UPDATE/DELETE grant | `T-AUDIT-01..03`              |
| **I**nfo disclosure | Over-fetch, verbose errors, enumeration of ids                                    | Explicit column `select()`, server-side filtering only, cursor pagination; `Result<T, ApiError>` returns typed codes not stack traces; uuid v4 primary keys                             | `T-RLS-*`, `T-ERR-01`         |
| **D**oS             | Expensive list queries, action flooding, AI cost burn                             | Rate limits per user+action (§5.6); pagination caps (`limit ≤ 100`); AI credits reserved before the provider call                                                                       | `T-RATE-01`, `T-AI-01`        |
| **E**levation       | Self-promotion via membership write; role edit through a generic update           | Role and status change only through dedicated server actions with a policy check; RLS forbids self-update of `role`/`status`; invite acceptance binds to the invited email              | `T-ESC-01..04`                |

### 2.2 Browser → Supabase (anon key + user JWT, direct reads and Realtime)

| STRIDE | Threat                                            | Control                                                                                                                                                                    | Test                      |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **S**  | Anon key treated as a secret / used for writes    | Publishable key is public by design; **all writes go through the server**; the browser client is read+realtime only, and lint blocks mutating calls from client components | `T-CLIENT-01`             |
| **T**  | Direct table write from devtools                  | RLS insert/update/delete policies restrict to the correct roles; sensitive tables grant no write to `authenticated` at all                                                 | `T-RLS-*` escalation half |
| **R**  | —                                                 | Reads that matter are logged (`file_access_log`)                                                                                                                           | `T-FILE-02`               |
| **I**  | Realtime subscription to another tenant's channel | Realtime publication filtered by RLS; channels namespaced by workspace; subscription without membership returns nothing                                                    | `T-RT-01`                 |
| **D**  | Subscription storm                                | Supabase connection limits; one channel per workspace per client                                                                                                           | monitored, §2.7           |
| **E**  | Reading a table the UI never exposes              | RLS is table-level and complete — `coverage.sql` fails the build if any `workspace_id` table lacks RLS or tests                                                            | `T-RLS-COVERAGE`          |

### 2.3 Authentication and session

| STRIDE | Threat                                                     | Control                                                                                                                                                                                  | Test            |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **S**  | Credential stuffing, OTP brute force, invite-code guessing | Supabase Auth rate limits + our per-IP/per-identifier limiter on login, OTP, reset and invite lookup; invite codes are CSPRNG (`crypto.randomUUID`/`randomBytes`), never `Math.random()` | `T-AUTH-01..03` |
| **T**  | Password reset token replay; email change hijack           | Supabase-issued single-use tokens, never logged or persisted; email change requires confirmation on both addresses                                                                       | `T-AUTH-04`     |
| **R**  | Shared account denial                                      | `device_registrations` + session list; sign-in events audited                                                                                                                            | `T-AUTH-05`     |
| **I**  | Account enumeration via login/reset responses              | Uniform response and timing for "unknown email" and "wrong password"                                                                                                                     | `T-AUTH-06`     |
| **D**  | Reset-email flooding a victim                              | Per-address cooldown on reset and OTP sends                                                                                                                                              | `T-RATE-02`     |
| **E**  | Session outliving membership removal                       | Access is evaluated per request from `workspace_members`; a removed member is denied on the next request without needing to re-authenticate                                              | `T-ESC-04`      |

Session storage, email verification gating, MFA for privileged roles and the password/breach policy are specified as a checklist in §5.7 — they are the controls behind the **S**, **T** and **E** rows above.

### 2.4 Files and storage

| STRIDE | Threat                                                          | Control                                                                                                                                                                   | Test                       |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **S**  | Guessing a storage path                                         | `private` bucket has no public access; objects are addressed by uuid; access only via `/api/files/[id]`                                                                   | `T-FILE-01`                |
| **T**  | Uploading a payload that executes for another user              | Extension + MIME + magic-byte validation; server-assigned filename; `Content-Disposition: attachment`; SVG/HTML never served inline from the private bucket               | `T-FILE-03..05`            |
| **R**  | "I never downloaded that ID scan"                               | Every issued signed URL writes `file_access_log` (actor, file, reason, ip hash)                                                                                           | `T-FILE-02`                |
| **I**  | A signed URL shared or leaked, or a paid asset in a public feed | 5-minute expiry; URL issued only after a server-side policy check; paid listing assets are never included in browse payloads (prototype shipped `main_file_url` publicly) | `T-FILE-01`, `T-MARKET-03` |
| **D**  | Storage exhaustion                                              | Per-plan quota, per-upload size cap, MIME allowlist                                                                                                                       | `T-FILE-06`                |
| **E**  | Reading another tenant's or another family's file               | `/api/files/[id]` resolves `WorkspaceContext` + guardian scope before signing                                                                                             | `T-FILE-01`                |

### 2.5 Payments, marketplace, earnings

| STRIDE | Threat                                                 | Control                                                                                                                                                                                  | Test                     |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **S**  | Forged IPN callback from the gateway                   | SSLCommerz IPN validated server-to-server against the gateway's validation API plus store credentials; unvalidated callbacks are recorded and discarded                                  | `T-PAY-01`               |
| **T**  | Buyer-chosen price or commission; self-minted earnings | Amounts and commission computed server-side from `platform_settings` (D-15) and snapshotted onto `order_lines`; `seller_earnings` is written only by the server from a validated payment | `T-MONEY-01..03`         |
| **R**  | Disputed transaction                                   | `orders`/`payments` state machine in the domain layer; `inbound_events` retains the raw provider event; all transitions audited                                                          | `T-PAY-03`               |
| **I**  | Payment instrument data                                | Only brand/last-four/expiry stored; no PAN, no CVV, ever                                                                                                                                 | `T-PAY-04`               |
| **D**  | Checkout spam creating orders                          | Idempotency key per checkout; rate limit per user                                                                                                                                        | `T-RATE-03`              |
| **E**  | Entitlement without payment; refund abuse              | Entitlements granted **only** from a processed, validated `inbound_events` row; refunds move earnings back out of `available` within the 7-day hold (D-17)                               | `T-PAY-02`, `T-MONEY-04` |

### 2.6 AI (Anthropic)

| STRIDE | Threat                                                                                                | Control                                                                                                                                                                                                                               | Test          |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **S**  | Client calling the model directly                                                                     | `ANTHROPIC_API_KEY` is server-only; no AI route reachable without a resolved context                                                                                                                                                  | `T-AI-02`     |
| **T**  | Prompt injection through student/teacher-supplied text steering a tool call or leaking another record | Model output is never trusted: structured output parsed by Zod, no tool has database write access, retrieved context is scoped to the caller's workspace before the prompt is built, untrusted text is delimited and labelled as data | `T-AI-03..05` |
| **R**  | Cost disputes                                                                                         | `ai_usage_log` per call: workspace, user, prompt version, tokens, credits settled                                                                                                                                                     | `T-AI-06`     |
| **I**  | One tenant's data in another's completion                                                             | Context assembled through repositories with `ctx`; no cross-workspace retrieval path exists                                                                                                                                           | `T-AI-04`     |
| **D**  | Credit/cost exhaustion                                                                                | `reserveCredits` **before** the provider call, `settleCredits` after; per-workspace daily limit; refuse with a typed error when over quota                                                                                            | `T-AI-01`     |
| **E**  | Using AI output as an authorisation decision                                                          | Model output never grants permissions or writes directly; every mutation it suggests goes through the normal action path with policy checks                                                                                           | `T-AI-05`     |

### 2.7 Platform console, jobs, webhooks, supply chain

| STRIDE | Threat                                                  | Control                                                                                                                               | Test                   |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **S**  | Unauthenticated cron/webhook invocation                 | `CRON_SECRET` on `/api/cron/*`; webhook signature/credential validation; both 401 without it                                          | `T-JOB-01`, `T-PAY-01` |
| **T**  | Replayed webhook double-granting entitlements           | `inbound_events` unique on provider event id; processing is idempotent                                                                | `T-PAY-02`             |
| **R**  | Platform staff action without a trail                   | `/platform` writes are audited with `is_platform_admin` actor; `withServiceRole(reason)` logs its reason                              | `T-PLAT-02`            |
| **I**  | Platform admin bypass policy reading more than intended | Bypass policies are read-only except on moderation tables; asserted per table                                                         | `T-PLAT-01`            |
| **D**  | Job queue starvation / poison message                   | `attempts` cap with dead-lettering; per-type concurrency                                                                              | `T-JOB-02`             |
| **E**  | Compromised dependency running at build or runtime      | Lockfile committed, `pnpm audit` gate, Dependabot, GitHub Actions pinned to commit SHAs, no `postinstall` scripts without review (§6) | `CI / security`        |

---

## 3. The six critical findings → control → proof

Each row is: what was wrong in the prototype, the control in the rebuild, and the specific test that fails if the control regresses. These tests are not optional and cannot be quarantined (`TESTING.md` §8.6).

### Finding 1 — Cross-tenant takeover in two SDK calls

_Enumerate schools via world-readable `SchoolSettings`, set `active_workspace_id` to any of them, read every child's medical and ID records. `Student` RLS checked `workspace_id` and nothing else._

| Control                                                                                                                                                                                        | Where                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `WorkspaceContext` is resolved server-side from `workspace_members` with `status='active'`; the `x-workspace-id` header is an input to a lookup, never a grant                                 | ARCHITECTURE §3; `packages/db/src/context.ts`                    |
| There is no client-writable tenant pointer anywhere in the schema. The "last workspace" cookie is a _preference_; it is re-validated on every request and a stale value yields 403, not access | ARCHITECTURE §3                                                  |
| Every RLS policy predicates on `app.has_role(workspace_id, '{…}')` — membership **and** role — never on `workspace_id` alone                                                                   | ARCHITECTURE §3 policy template                                  |
| School records are readable only by active members; nothing exposes a directory of workspace ids, invite codes or owner ids                                                                    | `docs/features/01-identity/F-ID-03-workspaces-and-membership.md` |
| Student medical/ID columns live behind the same table policy plus guardian scoping for parents                                                                                                 | `DATA-MODEL.md`                                                  |

**Proof:** `T-CTX-01` (header naming another workspace → 403), `T-CTX-02` (cookie for a workspace the user left → 403), `T-RLS-students` isolation half (school A sees zero school B rows, by list _and_ by known id), `T-RLS-COVERAGE` (no tenant table without RLS + tests), e2e `workspace-switch-denied`.

### Finding 2 — `WorkspaceMember.create` is `{}` — self-appointment as owner

_`create` constrained neither workspace, role nor status; `update` never checked the caller's role. A parent could self-promote to admin._

| Control                                                                                                                                                                                                     | Where                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| No client path creates or updates a membership. Joining is `acceptInvite(token)` or `joinWithCode(code)`, both server actions                                                                               | `docs/features/01-identity/F-ID-04-invitations-and-join-codes.md` |
| Invitations are single-use, expiring, and **bound to the invited email**, verified at redemption against `auth.jwt()->>'email'`                                                                             | ARCHITECTURE §5                                                   |
| RLS forbids any member from updating their own `role` or `status`; role changes are made by a server action gated on `can(ctx.role, 'members.role.write')`, and the last owner cannot be demoted or removed | ARCHITECTURE §3                                                   |
| Self-activation is impossible: a row inserted by a join is `status='pending'`, and only an owner/admin action moves it to `active`                                                                          | `DATA-MODEL.md`                                                   |

**Proof:** `T-ESC-01` (member cannot update own role — pgTAP, asserted as _zero rows affected_), `T-ESC-02` (cannot self-activate a pending membership), `T-ESC-03` (teacher cannot change another member's role), `T-INVITE-01` (redeeming an invite as a different email fails), `T-INVITE-02` (expired/reused invite fails), e2e `invite-accept`.

### Finding 3 — Government ID scans and selfies with no RLS at all

_`IdentityVerification` had no `rls` block; the protection was a schema comment and a UI string._

| Control                                                                                                                                                                                                                                           | Where                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| KYC rows are readable by their subject and by `is_platform_admin` only — never by schools, buyers or other sellers                                                                                                                                | `docs/features/04-commerce/F-CM-02-seller-onboarding-and-kyc.md` |
| KYC documents live in the `private` bucket, reachable only through `/api/files/[id]` after a policy check, with 5-minute signed URLs and a `file_access_log` row per issue                                                                        | ARCHITECTURE §4                                                  |
| `coverage.sql` fails the build if any table carrying `workspace_id` has `relrowsecurity = false` or no test file; non-tenant sensitive tables (`identity_verifications`, `profiles`) are on an explicit must-have-RLS allowlist in the same check | `supabase/tests/coverage.sql`                                    |
| Platform-admin bypass policies are read-only on KYC and are asserted per table                                                                                                                                                                    | ARCHITECTURE §3                                                  |

**Proof:** `T-RLS-identity_verifications` (subject sees own row only; school owner sees zero; outsider sees zero; platform admin reads but cannot update the document columns), `T-RLS-COVERAGE`, `T-FILE-01` (signing a KYC file as a non-owner → 403), `T-FILE-02` (access log row written).

### Finding 4 — Marketplace has no payment processing at all

_"Buy Now" wrote a transaction row and stopped; `MarketplaceTransaction` and `SellerEarnings` both `"create": {}`; two disagreeing commission rates, one of them a client input._

| Control                                                                                                                                                                                                               | Where                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Purchase is a server action: it computes the price from the listing row, commission from `platform_settings` (30/70, D-15), creates the order, and returns a gateway checkout URL. The request body carries no amount | D-06, D-09                                                             |
| Entitlement is granted **only** when a validated SSLCommerz IPN is recorded in `inbound_events` and processed; `orders` moves through a domain state machine                                                          | ARCHITECTURE §5                                                        |
| `seller_earnings` has no insert/update grant for `authenticated` at all — it is written by server code from a processed payment, and moves `pending → available` (7-day hold) → `paid` (D-17)                         | D-17                                                                   |
| Commission is snapshotted onto `order_lines` at purchase, so a later rate change cannot rewrite history; there is exactly one rate, in one row, editable only by platform staff                                       | D-15                                                                   |
| Paid listing assets are never present in the browse payload; the download link is issued post-entitlement                                                                                                             | `docs/features/04-commerce/F-CM-04-marketplace-browse-and-purchase.md` |

**Proof:** `T-MONEY-01` (amount in the request body is ignored; order total equals the server computation), `T-MONEY-02` (commission matches `platform_settings` and is stored on the line), `T-MONEY-03` (direct insert into `seller_earnings` as an authenticated user → denied), `T-PAY-01` (unvalidated IPN grants nothing), `T-PAY-02` (duplicate IPN grants once), `T-MARKET-03` (browse response contains no asset URL for a paid listing), e2e `marketplace-purchase-to-entitlement`.

### Finding 5 — The audit trail is not evidence

_Written from the browser, best-effort, with no RLS (so rows were writable and deletable by anyone), overwritten in place by the app itself, and both call sites passed arguments in the wrong order._

| Control                                                                                                                                                                                                                                          | Where                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `audit_events` rows are written by a generic **database trigger** on every tenant table, in the same transaction as the mutation. No application or client code writes audit rows — so there is no call site to get wrong, and no way to skip it | D-05, ARCHITECTURE §4 |
| Actor is `auth.uid()` read inside the trigger; correlation id comes from the request-scoped setting the repository sets                                                                                                                          | ARCHITECTURE §4       |
| The table is append-only: no UPDATE or DELETE grant for any role, including service role usage in application code; retention is indefinite                                                                                                      | ARCHITECTURE §4, §10  |
| Reads are restricted to owner/admin for their own workspace, and to `is_platform_admin` in the console                                                                                                                                           | D-16                  |

**Proof:** `T-AUDIT-01` (insert/update/delete each produce exactly one row with correct actor, before/after diff and correlation id), `T-AUDIT-02` (`update` and `delete` on `audit_events` are denied for every role), `T-AUDIT-03` (a mutation that rolls back leaves no audit row — the trigger is transactional, not best-effort), `T-AUDIT-04` (every tenant table has the trigger attached — enumerated, like `coverage.sql`).

### Finding 6 — Removed staff keep access

_Removal deleted the membership row, but access was gated by the user's own `active_workspace_id`, which nothing cleared. `status: 'removed'` existed in the schema and was used nowhere._

| Control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Where                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Access is evaluated **per request** from `workspace_members` with `status='active'`. There is no cached grant in the session, so the next request after removal is denied                                                                                                                                                                                                                                                                                                                                                                    | ARCHITECTURE §3                                                                              |
| Removal sets `status='removed'` (retained for audit) rather than deleting, and every RLS helper filters on `status='active'`                                                                                                                                                                                                                                                                                                                                                                                                                 | `DATA-MODEL.md`                                                                              |
| Sign-out and workspace switch clear the preference cookie, but the cookie was never the control                                                                                                                                                                                                                                                                                                                                                                                                                                              | ARCHITECTURE §3                                                                              |
| Realtime channels re-authorise on reconnect and RLS applies to the publication, so an open subscription stops delivering **on the next reconnect** — see the active-disconnect gap this leaves, closed below                                                                                                                                                                                                                                                                                                                                 | ARCHITECTURE §5                                                                              |
| **Device-side purge on revocation.** "Re-authorise on reconnect" and "zero rows on the next request" both assume the next request or reconnect happens promptly. A device that was offline when its membership was revoked is still showing whatever it cached. The **next app open** after a status change must purge the offline queue and cached reads (IndexedDB, service-worker cache) **before rendering anything**, not after — a stale cached dashboard for a removed user is the same failure as a live query that forgot to filter | ARCHITECTURE §6 (offline: service worker + IndexedDB queue); Capacitor/Tauri wrappers (D-13) |
| **Realtime disconnect broadcast**, not just reconnect re-authorisation. On a membership status change (removal, suspension, role change that drops access), the server actively publishes a targeted revoke event on that user's channel and force-closes the socket, instead of relying solely on the client eventually reconnecting and being re-checked. An attacker (or an innocent removed user) who never disconnects should not keep receiving updates indefinitely                                                                   | ARCHITECTURE §5                                                                              |

**Proof:** `T-ESC-04` (pgTAP: flip status to `removed`, same session, zero rows visible on every tenant table), `T-CTX-02` (stale cookie → 403), e2e `removed-member-loses-access` (teacher is removed mid-session; the next navigation lands on the no-access screen without re-login), **`T-OFFLINE-01`** (seed a stale offline cache for a user, flip their membership to `removed` server-side, open the app: assert IndexedDB/service-worker cache is purged and no cached record renders before the fresh, empty-access state does), **`T-RT-02`** (open a realtime subscription, flip the subscriber's membership status server-side, assert the socket receives a disconnect/revoke event and stops delivering **within N seconds** — not merely "on next reconnect"; N is a fixed budget, e.g. 5s, asserted in the test rather than left informal).

### Finding 6 — further hardening not yet covered above

Four more gaps in the same family (session/access control at the edges of a request), closed here because none of them fit neatly inside the existing six findings but all belong to "can a status change, or a forged request, still get through":

| Gap                                                                                                                                                                                                                                                                                                                                                                                                                    | Control                                                                                                                                                                                                                                                                                                                                                        | Test                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Join-code guessing spread across many IPs.** The per-IP limit in §5.6 (10/hour per IP) does not stop an attacker who guesses codes from a botnet of low-volume IPs, none of which individually trips the limit                                                                                                                                                                                                       | A **global hourly failure budget** on join-code redemption, independent of the per-IP limit: once total failed lookups across all callers in an hour crosses a threshold, redemption is paused platform-wide (or per-workspace, whichever the code space allows) and an alert fires — a second layer behind the per-identifier limit, not a replacement for it | `T-JOIN-01` (fixed number of distinct-IP failures in a rolling hour trips the global budget, independent of any single IP's own count)     |
| **Invite links leaking their token via the `Referer` header.** The invite accept screen (F-ID-04 §4.5) carries the token in the URL. If that page links out anywhere (a help link, an external image), a permissive `Referrer-Policy` leaks the full URL — and the token in it — to the destination                                                                                                                    | Invite/accept routes set **`Referrer-Policy: no-referrer`** specifically, stricter than the site-wide `strict-origin-when-cross-origin` default in §5.2, because these are the one route class where the URL itself is a bearer credential                                                                                                                     | `T-HEADER-02` (Playwright: response headers on `/invite/[token]` and `/accept-invite` assert `Referrer-Policy: no-referrer`)               |
| **Fee/payment IPN validated against the wrong tenant's store id.** SSLCommerz IPN validation (§2.5 Finding 4, `T-PAY-01`) confirms the callback is genuinely from the gateway, but does not by itself prove it belongs to the **school** the order claims — a forged or misrouted callback naming school A's order but validated using school B's store credentials must not be accepted as authoritative for school A | IPN processing cross-checks the **store id / merchant credential** the callback validated against, against the store id on file for the **tenant the referenced order belongs to**; mismatch is rejected and logged as a security event, not silently accepted                                                                                                 | **`T-PAY-05`** (a fee/order IPN for school A's order, validated using school B's store id, is rejected; the reverse case is also asserted) |
| **Public-bucket writes are a manual review convention (§5.3), not a mechanical gate.** "A review comment is required on any PR that puts something new in it" depends on a human noticing                                                                                                                                                                                                                              | A **CI assertion** enumerating every code path that writes to the `public` bucket (mirroring `coverage.sql`'s allowlist pattern for RLS) fails the build if a new write path appears that isn't on the reviewed allowlist                                                                                                                                      | `CI / storage-coverage` (new gate, same shape as `T-RLS-COVERAGE`)                                                                         |

---

## 4. Findings from the "Also confirmed" list — where each is answered

| Prototype issue                                               | Rebuild answer                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/messaging` unguarded, Admin channel one click from any role | Every route under `(school)/app` is behind the shell's context resolution; channel membership is a row, and posting is policy-checked per channel |
| `User.list()` to find one user                                | No client-side user directory; lookups are server actions returning only the fields the caller may see                                            |
| ParentPortal fetched all students then filtered in React      | Banned by rule (HANDBOOK §1.4); parent policies are guardian-scoped in RLS, so the query cannot over-return                                       |
| Teacher CVs / applicant résumés / ID docs with no RLS         | Tenant/subject-scoped policies plus private-bucket signed URLs; hiring tables are in `coverage.sql`                                               |
| `main_file_url` for paid listings in the public feed          | Browse payloads select explicit columns; asset URLs are entitlement-gated (`T-MARKET-03`)                                                         |
| AI quota never checked before `InvokeLLM`                     | `reserveCredits` precedes the provider call (`T-AI-01`)                                                                                           |
| `SchoolSubscription` plan/status client-writable              | Plan changes only via the platform console or a validated payment event                                                                           |
| Invitations: no RLS, no expiry, email binding never checked   | `T-INVITE-01/02`                                                                                                                                  |
| `getUserRole()` failed open to `teacher`                      | Default deny, with an explicit unit test for the unknown-role path                                                                                |
| `school_id: 'default'` collapsing tenants                     | `workspace_id` is `not null` with an FK on every tenant table; no default sentinel exists                                                         |
| Invite codes from `Math.random()`, no rate limit              | CSPRNG codes + rate-limited lookup (`T-AUTH-03`)                                                                                                  |
| Tables with no tenant field at all                            | Schema review gate: a new table either has `workspace_id` or is on the reviewed non-tenant allowlist                                              |

The prototype's **clean** results are commitments we keep: no hardcoded secrets (gitleaks enforces it), no `dangerouslySetInnerHTML` / `innerHTML` / `eval` (Semgrep rule + lint), allowlisted same-origin redirects, no PAN/CVV storage.

---

## 5. Secure coding rules

### 5.1 Input validation

Every value that crosses a boundary is parsed by a Zod schema from `packages/contracts` before use — server action arguments, route handler bodies, query and path params, webhook payloads, job payloads, file metadata, and AI structured output. `safeParse`, then a typed `VALIDATION` error; never `as`, never optional chaining over unvalidated input. Bound every collection (`.max()` on arrays and strings) — an unbounded array is a DoS and a cost incident. Ids are `z.uuid()`; dates are `z.iso.date()`; money is a positive integer in paisa and is **never accepted from the client** for a price.

### 5.2 Output encoding

React escapes by default and we keep it that way: `dangerouslySetInnerHTML` is forbidden repository-wide (Semgrep, error severity). Markdown renders through `react-markdown` **without** `rehype-raw`. CSP is set in `next.config` middleware headers: `default-src 'self'`, no `unsafe-eval`, `script-src` with per-request nonces, `frame-ancestors 'none'`, `object-src 'none'`, connect/img limited to Supabase, Sentry and the gateway origins. Also set: `Strict-Transport-Security` (2 years, preload), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy`. Data rendered into non-HTML contexts (CSV export, PDF, email) is escaped for that context — CSV cells starting with `= + - @` are prefixed to prevent formula injection.

### 5.3 File handling

Upload: extension allowlist ∧ declared MIME ∧ **magic-byte sniff** must agree, or reject. Size cap per type, quota per plan. The server assigns the stored name (uuid); the original name is metadata only, never a path. No user input ever reaches a storage path. Office/PDF/image types only for student and KYC documents — **no SVG, no HTML** in any bucket that can be served to another user.

Download: only through `/api/files/[id]`, which resolves `WorkspaceContext`, checks the policy for that file's owning row, writes `file_access_log`, then issues a **5-minute** signed URL. Signed URLs are never stored, cached, logged, emailed or embedded in a list payload. Responses carry `Content-Disposition: attachment` and the sniffed content type. The `public` bucket holds marketing assets and avatars only, and a review comment is required on any PR that puts something new in it.

### 5.4 Secrets

No secret in the repository, in a log, in an error message, in an issue, or in a terminal transcript that gets pasted somewhere. `.env.local` is git-ignored; `.env.example` carries keys with empty values. gitleaks runs pre-commit and in CI on the full history of the PR range. Server-only variables must never be prefixed `NEXT_PUBLIC_` — a lint rule fails the build if a non-public secret name appears in a client component. The service-role key is used only inside `withServiceRole(reason, fn)` (webhooks, cron, reviewed admin ops), which logs the reason; any PR adding a call site must justify it in the description. Rotation: immediately on suspected exposure, on any team change, and on a 180-day schedule for gateway and email keys. A secret that ever appeared in a commit is rotated even after the commit is removed — history is not a control.

### 5.5 Logging and PII

Structured JSON (pino). **Allowed fields:** `correlation_id`, `workspace_id`, `user_id`, `role`, `route`, `action`, `status`, `duration_ms`, `error_code`, `flag`. **Never logged:** names, emails, phone numbers, addresses, dates of birth, health information, national ID numbers, file contents or names, tokens, signed URLs, request bodies, gateway payloads, AI prompts or completions containing student data. Log the _id_, not the person.

A redaction layer strips known-sensitive keys at the logger, so a careless `log.info({ student })` cannot leak — but relying on it is not an excuse; review flags the call anyway. Sentry runs with `sendDefaultPii: false`, a `beforeSend` scrubber over breadcrumbs, request bodies and URL query strings, and session replay disabled on any route under `(school)/app` that renders student data. Error messages returned to users are typed codes with generic text; the detail stays server-side behind the correlation id. See `docs/engineering/OBSERVABILITY.md` §1.

### 5.6 Rate limits

Per identifier (user id, or hashed IP when unauthenticated), sliding window, enforced in middleware for routes and at the top of sensitive actions, backed by a Postgres counter table (no Redis in the stack).

| Surface                             | Limit                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Login, password reset, OTP request  | 5 / 15 min per identifier **and** per IP                                                    |
| Invite code / token lookup          | 10 / hour per IP (prototype had none, with `Math.random()` codes)                           |
| Registration                        | 3 / hour per IP                                                                             |
| Generic write action                | 60 / min per user                                                                           |
| Checkout creation                   | 10 / hour per user                                                                          |
| File download signing               | 120 / hour per user                                                                         |
| AI invocation                       | plan-dependent credits + 20 / hour per user hard ceiling                                    |
| Job application submission (hiring) | 10 / day per user, 30 / day per IP                                                          |
| Webhook endpoints                   | per-IP ceiling; **replay/retry counted per provider event id**; validation failures alerted |

Exceeding a limit returns `429` with `Retry-After`, is logged with `error_code: RATE_LIMITED`, and repeated hits on auth surfaces raise an alert (OBSERVABILITY §5).

### 5.7 Authentication hardening

The login screen is the surface every attacker tries first, and it is where "it works" and "it is safe" diverge most quietly. This checklist is derived from the login/security review in `docs/reference/EXTERNAL-ASSETS.md` §3, mapped onto our actual surfaces. Items 1–5 are verified at build time and re-verified before each release; the offensive checklists in §8 are how we _test_ them, this is how we _prevent_ them.

1. **The session lives in a cookie, never in JavaScript-readable storage.** `@supabase/ssr` only, with the session in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. No auth token in `localStorage`, `sessionStorage` or IndexedDB — including in the Capacitor and Tauri wrappers (D-13), which must reuse the same cookie session rather than bridging a token into native storage. **Verification:** DevTools → Application → Local Storage shows no token, asserted in a Playwright journey so it cannot silently regress.

2. **Every mutating path re-checks the role server-side.** Enrolling a student, approving a listing, granting AI credits, posting a job, approving a payout: each resolves `WorkspaceContext` and calls `can()` on the server, and each has a matching RLS policy so the database still refuses if a route is ever missed. A client-supplied role or tenant flag is an input to a lookup, never a grant. This is the prevention side of what `offensive-idor` and `offensive-business-logic` verify in §8.

3. **Email verification gates sensitive actions, not just signup.** `email_confirmed_at` is checked **server-side** before any write, and unverified accounts are read-only. Because this system moves money and holds student records, the bar is higher for privileged roles: **owner and admin must have a verified email before approving a payout, changing payment settings, changing a plan, or altering another member's role.** MFA is required for `is_platform_admin` accounts and offered to owner/admin; it is not imposed on teachers, staff or parents, who sign in from shared school phones and would be locked out by it.

4. **Rate limits cover money and abuse surfaces, not only login.** Brute force is one abuse pattern among several. The table in §5.6 therefore covers checkout, webhook replay, job applications and AI generation alongside login, reset and OTP — the AI path in particular is a cost-exhaustion vector, which is why credits are reserved _before_ the provider call.

5. **Password policy with a breach check.** Minimum 12 characters, and Supabase Auth's HaveIBeenPwned leaked-password rejection enabled. The sign-up and reset UI states the requirement up front and reports a rejected password as "this password has appeared in a known data breach" — a message people act on, rather than a generic strength meter they fight. Applies to every self-registering role: teachers, parents, sellers.

6. **Uploads are not covered by login hardening.** Marketplace resources and the school library are a separate surface with its own controls (§5.3: allowlist ∧ MIME ∧ magic bytes, server-assigned names, no SVG or HTML, `Content-Disposition: attachment`, entitlement-gated signed URLs) and its own verification checklist (`offensive-file-upload` in §8). Treating upload security as a subset of auth security is the mistake that ships stored XSS.

### 5.8 Database and queries

Parameterised queries only, through repositories — no string-built SQL anywhere, and Semgrep blocks template literals passed to `rpc`/raw execution. `SECURITY DEFINER` functions pin `search_path` and do the narrowest possible job. New tables default to `revoke all` then explicit grants. Indexes support every RLS predicate, because a policy that forces a sequential scan becomes a DoS at scale.

### 5.9 Server actions and CSRF

Next.js Server Actions are POST-only with an origin check; we additionally verify `Origin`/`Host` agreement in middleware and set session cookies `HttpOnly`, `Secure`, `SameSite=Lax`. Route handlers that mutate require an authenticated context; none accept `GET` for a mutation.

---

## 6. Dependency policy

- **pnpm, lockfile committed, `--frozen-lockfile` in CI.** A PR that changes `pnpm-lock.yaml` without a matching `package.json` change is rejected.
- **`pnpm audit --audit-level high` is a blocking gate.** High or critical fails `CI / security`. An accepted exception needs an entry in `.audit-exceptions.json` with a CVE, a reason, a mitigating control and an expiry date ≤ 30 days; the weekly job fails on expired exceptions.
- **Dependabot** (`.github/dependabot.yml`): weekly for npm (grouped: minor/patch together, majors individually) and for GitHub Actions; security updates immediately. Patch and minor updates to non-runtime dev tooling can merge on green CI; anything touching auth, Supabase, the payment adapter or Next.js gets a human read of the changelog.
- **New dependency checklist:** is it in the lockfile already via a transitive path; last publish and maintainer count; does it run an install script; does it pull in a large tree; could 30 lines of our own code replace it. Justify the addition in the PR description. Packages with install scripts require explicit approval and are listed in `pnpm.onlyBuiltDependencies`.
- **GitHub Actions are pinned to commit SHAs**, never tags — a tag is mutable and a compromised action runs with our secrets.
- **Supply-chain scanning:** weekly audit job plus a dependency review action on PRs that flags new advisories and license changes. Unused dependencies are removed on sight (the prototype shipped `@stripe/stripe-js` never imported and `react-quill` unused — dead dependencies are attack surface with no owner).

---

## 7. Incident response

**Severity**

| Sev    | Definition                                                                                                                             | Response                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **S1** | Confirmed or strongly suspected exposure of personal data (student records, KYC, IDs), cross-tenant access, or money moved incorrectly | Immediate; everything else stops |
| **S2** | Auth/authorisation defect with no confirmed exploitation; secret leaked; production down                                               | Same day                         |
| **S3** | Security defect requiring specific unusual conditions; defence-in-depth gap                                                            | Next working day, tracked        |
| **S4** | Hygiene: outdated dependency without a known exploit path, missing header                                                              | Normal backlog                   |

**Steps**

1. **Declare.** One owner (the incident lead), one channel, one timestamped running log from the first minute. Times, actions, evidence. Write it as it happens — reconstruction is worthless.
2. **Contain.** Options, in order of preference: disable the feature flag; revoke sessions for affected users; rotate the exposed credential; Vercel instant rollback (`RELEASES.md` §7); tighten an RLS policy by forward migration. Prefer containment that is reversible and fast over a perfect fix.
3. **Assess.** Query `audit_events`, `file_access_log`, `inbound_events` and Vercel/Supabase logs by `correlation_id`, workspace and time window. Determine: what data, whose, how many, over what period, and whether it was actually accessed or merely accessible. This is exactly why the audit trail is trigger-written — the prototype could not answer "who changed this child's medical record".
4. **Eradicate.** Fix forward on a branch with the normal gates (a security fix does not skip tests; it gets a _new_ test that fails without the fix). Hotfix path in `RELEASES.md` §8.
5. **Recover.** Verify with the new test in production conditions; restore any affected data from PITR if needed; re-enable the flag.
6. **Notify.** If personal data was exposed, the owner decides on notification to affected schools and guardians and any regulator, with the timeline and scope from step 3. Draft the notice during step 3, not after.
7. **Review.** Blameless write-up within 5 working days: timeline, root cause, why our controls did not catch it, what test now exists so it cannot recur. Filed as a decision entry if it changes how we build (`HANDBOOK.md` §11).

Preserve evidence before you clean up: export the relevant audit and log rows first. Do not `DELETE` suspicious rows — mark and keep them.

---

## 8. Security testing plan

| Layer                  | Tool                                                                                                                         | When                                                        | Gate                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Secrets                | **gitleaks** over the PR commit range and full history on `main`                                                             | pre-commit hook + every PR                                  | `CI / security` blocks on any finding                    |
| SAST                   | **Semgrep** — `p/typescript`, `p/react`, `p/nextjs`, `p/owasp-top-ten`, `p/secrets` plus `.semgrep/acadigma.yml` (see below) | every PR                                                    | blocks on ERROR severity; WARN annotated                 |
| Dependencies           | **`pnpm audit --audit-level high`** + dependency review action                                                               | every PR, and weekly                                        | blocks on high/critical outside `.audit-exceptions.json` |
| Authorisation          | **pgTAP** RLS isolation + escalation, `coverage.sql`                                                                         | every PR                                                    | `CI / db` blocks                                         |
| Authorisation (server) | Vitest integration tests: non-member, wrong role, tampered body                                                              | every PR                                                    | `CI / unit` blocks                                       |
| Runtime a11y/headers   | Playwright assertions on CSP and security headers                                                                            | every PR                                                    | `CI / e2e` blocks                                        |
| Advisors               | **Supabase advisors** (security + performance lints)                                                                         | weekly + before release                                     | weekly job fails on new security advisories              |
| DAST                   | **Authorized dynamic testing against a preview deployment** (below)                                                          | before each release, and after any auth/payment/file change | manual gate before promotion                             |

**Custom Semgrep rules** (`.semgrep/acadigma.yml`) encode our non-negotiables, because a linter catches them faster than a reviewer: a repository method called without a `WorkspaceContext` first argument; `createServiceRoleClient` used outside `withServiceRole`; `dangerouslySetInnerHTML`; `select('*')` on a table with private columns; a Supabase mutation (`insert`/`update`/`delete`/`upsert`) inside a `'use client'` file; a server action whose body does not call `safeParse` before the first `await`; `Math.random()` in anything named token/code/key/secret; a `NEXT_PUBLIC_` variable read in a server-only module that also holds a secret.

### Authorized dynamic testing

Preview deployments are our own infrastructure, testing them is authorized, and the scope is **only** `*.vercel.app` previews of `Mahadezz/acadigma-campus` plus the Supabase dev branch. Production and any real user data are out of scope. Never test against a URL you do not control.

The offensive checklists in `docs/reference/TOOLING-AND-REFERENCES.md` (Claude-Red skills: IDOR, business logic, API security, file upload, JWT, race conditions, SSRF, XSS) map onto our surfaces as follows, and each run is recorded as a test report under `docs/test-reports/security-<date>.md`:

| Checklist           | Aimed at                                                                                       | What a finding would mean                             |
| ------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **IDOR**            | `/api/files/[id]`, every `<entity>/[id]` route, workspace switching                            | Findings 1, 3 and 6 recurring — the highest-value run |
| **Business logic**  | Checkout, commission, earnings state machine, refunds, credit reservation, plan limits         | Finding 4 recurring                                   |
| **API security**    | Server actions and route handlers: method, auth, mass assignment, enumeration, error verbosity | Tampering controls (§2.1)                             |
| **File upload**     | Student documents, KYC, listing assets: MIME/magic-byte bypass, traversal, stored XSS via SVG  | §5.3 controls                                         |
| **JWT / session**   | Token handling, expiry, membership-removal propagation                                         | Finding 6                                             |
| **Race conditions** | Idempotency keys, credit reservation, earnings hold release, invite redemption                 | Double-spend and double-grant                         |
| **SSRF**            | Any server-side fetch of a user-supplied URL (avatar import, webhook config)                   | Should be none by design — verify that                |
| **XSS**             | Markdown rendering, message content, listing descriptions, PDF/CSV export                      | §5.2 controls + CSP                                   |

Rules for a run: use a dedicated preview with seeded synthetic data; two accounts in two workspaces plus one non-member, since most of the interesting findings are cross-tenant; never run destructive or high-volume tests against a shared dev branch without saying so first; log every finding with reproduction steps, and convert each confirmed finding into a **failing automated test** before fixing it — that is what stops it coming back.

---

## 9. Disclosure

The public policy is `SECURITY.md` at the repository root. Summary: report privately via GitHub Security Advisories on `Mahadezz/acadigma-campus` (or email the address in that file); we acknowledge within 3 working days, trial-triage within 5, and target 30 days to a fix for high severity; we will credit you unless you prefer otherwise; please do not access other people's data, degrade the service, or test against production. Full text, scope and safe-harbour wording live in the root file so that it is where researchers look for it.
