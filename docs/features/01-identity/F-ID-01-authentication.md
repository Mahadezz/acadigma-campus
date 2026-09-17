# F-ID-01 — Authentication, sessions and account lifecycle

|                  |                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area             | auth                                                                                                                                                                          |
| Status           | in-progress — Parts 1-4 built on `feat/identity-auth` (see §11 for deviations)                                                                                                |
| Owner branch     | `feat/identity-auth`                                                                                                                                                          |
| Depends on       | — (foundation feature; everything else depends on this)                                                                                                                       |
| Plan             | `docs/plan/ROADMAP.md` chunk 1                                                                                                                                                |
| Base44 reference | `docs/reference/base44-inventory/01-auth-tenancy-personal.md` §3 rows 1–10, §4.1–4.2, §5.1 B4–B6, §5.2 D2, §5.3 W12; `docs/reference/base44-security-review.md` findings 1, 6 |

## 1. Purpose

Every human who touches Acadigma Campus — a school owner, an admin, a teacher, a support staff member, a parent, a platform staff member — arrives through this feature. It owns account creation, proof of identity (email+password, phone OTP, magic link), email/phone verification, password recovery, the live session and device list, sign-out-everywhere, and account deletion with a grace period. "Done" from the user's chair: a teacher on a ৳8,000 Android phone can create an account in under 90 seconds on a 3G connection, is told exactly what is wrong when something fails, can get back in when they forget their password, can see and kill the session on the school's shared PC, and can permanently leave with a 30-day window to change their mind.

The Base44 prototype intended all of this and delivered about half of it. Registration, OTP verify/resend, forgot-password and reset-password worked against the Base44 SDK. What was fake or broken: the post-registration workspace creation sat in a swallowed `try/catch` so a silent failure produced an account with no workspace (`TeacherRegister.jsx:112`); login routed every non-seller to `/personal`, dropping school admins into the wrong shell (`Login.jsx:37`); "Update Password" inside the app had no `onClick` (`personal/Settings.jsx:104`); Connect Google/Apple/Microsoft had no handlers; the three-step "Delete Account" ceremony ended in `toast('…contact support to complete')`; there was no session or device list at all; logout never cleared `activeWorkspaceId`; and removed staff kept access because access was gated on a client-writable field (security review finding 6). The rebuild moves every one of these to Supabase Auth + server actions + RLS.

## 2. Roles and permissions

Authentication is mostly pre-membership, so most actions are gated on "is this your own account", not on a workspace role. `packages/domain/permissions.ts` keys are listed where a workspace role is involved.

| Action                                                         | Public                                   | Self (any signed-in user)                    | Workspace owner | Workspace admin | Platform staff                 | Permission key             |
| -------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- | --------------- | --------------- | ------------------------------ | -------------------------- |
| Register (email+password)                                      | ✅                                       | —                                            | —               | —               | —                              | —                          |
| Sign in (password / phone OTP / magic link)                    | ✅                                       | —                                            | —               | —               | —                              | —                          |
| Request email verification resend                              | ✅ (rate-limited)                        | ✅                                           | —               | —               | —                              | —                          |
| Request password reset                                         | ✅                                       | ✅                                           | —               | —               | —                              | —                          |
| Change password (knows current)                                | —                                        | ✅                                           | —               | —               | —                              | —                          |
| Add / change / verify phone number                             | —                                        | ✅                                           | —               | —               | —                              | —                          |
| List own sessions and devices                                  | —                                        | ✅                                           | —               | —               | —                              | —                          |
| Revoke one session / all other sessions                        | —                                        | ✅                                           | —               | —               | —                              | —                          |
| Request account deletion                                       | —                                        | ✅ (blocked while sole owner of a workspace) | —               | —               | —                              | `account.delete`           |
| Cancel account deletion during grace                           | —                                        | ✅                                           | —               | —               | ✅                             | `account.delete.cancel`    |
| Suspend / reinstate an account                                 | —                                        | —                                            | —               | —               | ✅                             | `platform.account.suspend` |
| Force sign-out of another user                                 | —                                        | —                                            | —               | —               | ✅                             | `platform.session.revoke`  |
| Read another user's auth metadata (last sign-in, device count) | —                                        | —                                            | —               | —               | ✅ (no credentials, no tokens) | `platform.account.read`    |
| Grant oneself `is_platform_admin`                              | ❌ never via the app — DB/migration only |                                              |                 |                 |                                |                            |

Removing a member from a workspace (F-ID-03) does **not** disable their account; it revokes workspace access via `workspace_members.status`. Suspending an account (platform staff) blocks all sign-in.

## 3. Data

Tenant key: **none** — this is the only area in the product whose primary rows are user-scoped, not workspace-scoped. `audit_events` rows written here carry `workspace_id = null`.

Tables touched (names per `docs/architecture/DATA-MODEL.md`; the columns below are **proposed; DATA-MODEL.md wins**):

**`auth.users`** — Supabase-managed. We never write it directly; only through `supabase.auth.*` and the admin API inside `withServiceRole(reason)`.

**`profiles`** (1:1 with `auth.users`, proposed; DATA-MODEL.md wins)

| column                      | type                           | notes                                                        |
| --------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `id`                        | uuid PK                        | = `auth.users.id`, FK on delete cascade                      |
| `full_name`                 | text not null                  |                                                              |
| `avatar_url`                | text                           | `public` bucket                                              |
| `email`                     | citext not null unique         | mirrored from `auth.users` by trigger, read-only to the user |
| `phone`                     | text                           | E.164, unique when not null                                  |
| `phone_verified_at`         | timestamptz                    |                                                              |
| `is_platform_admin`         | boolean not null default false | never settable by the row owner (trigger guard)              |
| `status`                    | enum `profile_status`          | `active \| suspended \| pending_deletion \| deleted`         |
| `last_workspace_id`         | uuid                           | server-written only, after membership verification           |
| `onboarding_completed_at`   | timestamptz                    | drives F-ID-05                                               |
| `created_at` / `updated_at` | timestamptz                    |                                                              |

Indexes: unique on `lower(email)`, unique on `phone` where not null, partial index on `status` where `status <> 'active'`.

**`account_deletion_requests`** (proposed; DATA-MODEL.md wins): `id`, `user_id`, `requested_at`, `scheduled_purge_at`, `reason text`, `status enum(pending|cancelled|completed)`, `cancelled_at`, `cancelled_by`, `completed_at`. Unique partial index: one `pending` row per user.

**`device_registrations`** (shared with the wrapper phase and F-ID-07): `id`, `user_id`, `platform enum(web|android|windows)`, `label text`, `user_agent text`, `ip_hash text`, `push_token text`, `session_ref text` (Supabase refresh-token id, never the token), `first_seen_at`, `last_seen_at`, `revoked_at`, `revoked_by`. Index `(user_id, last_seen_at desc)`.

**`auth_throttle`** (proposed; DATA-MODEL.md wins): `key text pk` (e.g. `login:sha256(email)`, `otp:+8801…`, `reset:ip_hash`), `window_started_at`, `attempts int`, `blocked_until`. Cleaned nightly by pg_cron. Used by the server actions; Supabase's own rate limits remain as a second wall.

**`email_log`** — one row per transactional send (ARCHITECTURE §5). `audit_events` — append-only; see F-ID-09.

**RLS, in words**

- `profiles` **select**: the row owner; any user who shares an active workspace membership with the row owner, but only through the view `member_directory` (id, full_name, avatar_url, custom label) — the base table never exposes `phone`, `email`, `status` or `is_platform_admin` to peers; platform staff read all.
- `profiles` **update**: row owner only, and a `BEFORE UPDATE` trigger rejects any change to `id`, `email`, `is_platform_admin`, `status`, `last_workspace_id` unless the statement runs with the service role or `app.is_platform_admin()`.
- `profiles` **insert**: only by the `handle_new_user()` trigger on `auth.users` (SECURITY DEFINER). No client insert grant.
- `profiles` **delete**: no grant to anyone. Deletion is the purge job cascading from `auth.users`.
- `account_deletion_requests`: select/insert/update by the row owner; select/update by platform staff; no delete.
- `device_registrations`: full CRUD by the row owner only; select by platform staff; `push_token` is never returned to any client other than the owner's.
- `auth_throttle`: no grants at all — touched exclusively by SECURITY DEFINER functions.

Private files: none owned by this feature. Avatars live in the `public` bucket (ARCHITECTURE §4) and carry no other PII.

## 4. Workflows

### 4.1 Register with email + password

**Trigger:** `/register`.
**Phone layout:** single scrolling column, no wizard chrome; the keyboard must never cover the submit button (`position: sticky` footer button, 44 px tall, bottom-thumb zone).

1. Full name, email, password, password confirm, a checkbox for Terms & Privacy. One screen, not three (the prototype's three-step wizard is collapsed — professional details move to F-ID-02 and F-ID-06, where they are optional).
2. Client validates with `RegisterWithPasswordInput`; server re-validates.
3. Server action `registerWithPassword` → `supabase.auth.signUp` with `emailRedirectTo=/verify`.
4. `handle_new_user()` trigger creates `profiles` + the personal workspace (F-ID-05 §4.1 owns the workspace half; it runs in the same transaction so there is no silent-failure window — this is the direct fix for `TeacherRegister.jsx:112`).
5. User lands on `/verify?email=…` — "We sent a link to _m…@gmail.com_". The screen offers **Resend** (60 s cooldown, visible countdown) and **Change email**.
6. Clicking the link → `/verify?token_hash=…&type=email` → server exchanges it, sets the session, redirects to `/onboarding` (F-ID-05).

**Outcome:** verified account + personal workspace + session.
**Notifications:** none (the verification email is transactional, logged to `email_log`, not a `notifications` row).
**Audit:** `account.registered` (workspace_id null), `account.email_verified`.
**Failure cases:** email already registered → generic success screen is **not** used here (registration cannot be enumeration-safe and usable at once); we show "This email already has an account — sign in or reset your password" because the address is the user's own to test anyway, and we rate-limit registration by IP to 5/hour. Weak password → inline strength meter with the specific failed rule. Network failure mid-signup → the action is idempotent on email, so a retry either signs in or re-sends verification.

### 4.2 Sign in with email + password

1. `/login` — email, password, "Remember this device", link to `/forgot`, tab/segmented control for **Password | Phone | Email link**.
2. `signInWithPassword` server action → on success, `resolveLandingRoute()` (F-ID-03 §5.3) decides `/app`, `/personal`, `/family` or `/onboarding`. The prototype's blanket redirect to `/personal` is gone.
3. A new `device_registrations` row is created when `session_ref` is unseen; if the user already had ≥1 device, emit notification `auth.new_device_signin`.

**Failure cases:** wrong credentials → one generic message ("Email or password is incorrect"), never distinguishing the two. 5 failures in 15 minutes for an email → `auth_throttle` blocks for 15 minutes and the user is told when they can retry. Unverified email → sign-in succeeds but the app renders a blocking `/verify` interstitial (they can still delete their account). `profiles.status = 'suspended'` → sign-out immediately with a support-contact screen.

### 4.3 Sign in with phone OTP

1. Phone tab → country code fixed to `+880` with a picker; `PhoneOtpRequestInput` normalises to E.164.
2. `requestPhoneOtp` → Supabase Auth phone OTP through the configured SMS adapter.
3. `/login/otp` — 6 separate `inputMode="numeric"` boxes with `autocomplete="one-time-code"`; paste fills all six; the resend countdown starts at 60 s.
4. `verifyPhoneOtp` → session → `resolveLandingRoute()`.

**Rules:** OTP 6 digits, TTL 10 minutes, max 5 verify attempts per code, max 5 codes per phone per hour, max 20 per IP per hour.
**Failure:** expired/incorrect code shows attempts remaining; exhausting attempts invalidates the code and requires a new request.
**Dependency:** an SMS provider is required — see §11 OQ-1.

### 4.4 Sign in with a magic link

`/login` → Email link tab → `requestMagicLink` → always renders the same "Check your inbox" screen regardless of whether the address exists (enumeration-safe). Link TTL 15 minutes, single use, invalidated by any later link request for the same address.

### 4.5 Forgot / reset password

1. `/forgot` → `requestPasswordReset` → always shows "If that address has an account, we've sent a reset link."
2. Email link → `/reset?token_hash=…` → new password + confirm → `resetPassword` server action.
3. On success: **all other sessions are revoked**, the user is signed in on the current device, and a "Your password was changed" email is sent.

**Audit:** `account.password_reset`, `session.revoked_all`.
**Failure:** invalid/expired token → dedicated state with a "Send a new link" button, not a toast.

### 4.6 Change password while signed in

Shell settings → Security → Change password. Requires the current password (re-authentication), then the new password twice. Same post-conditions as 4.5 except the user keeps their other sessions unless they tick "Sign out of other devices" (default **on**). This is the fix for prototype B5.

### 4.7 Add and verify a phone number

Security screen → Add phone → OTP → `profiles.phone`, `phone_verified_at`. A verified phone enables phone-OTP sign-in and SMS invitations/notifications. Changing the phone clears `phone_verified_at` until re-verified.

### 4.8 Sessions and devices

Security screen lists rows from `device_registrations` joined to live Supabase sessions: device label (derived from the user agent: "Chrome on Android"), approximate location (country from `ip_hash` lookup at creation time only), first seen, last seen, **This device** badge.

- **Revoke** one device → `revokeSession` → Supabase admin `signOut(scope: session)` on that refresh token + `revoked_at` set. The revoked device is signed out within one refresh cycle (≤ 1 h) and immediately on its next server action.
- **Sign out everywhere** → revokes all sessions including the current one, returns to `/login`.

**Realtime revocation is not reconnect-only.** On any `workspace_members.status` change (removal, suspension) or session revocation, the server pushes a **server-initiated disconnect broadcast** on that user's Realtime channel(s) — it does not wait for the client to reconnect and re-authorise. A test asserts that flipping `status` on an **already-open, subscribed socket** stops delivery within N seconds (target N = 5s), not merely that a fresh reconnect re-authorises correctly.

**Audit:** `session.revoked`, `session.revoked_all`, `session.realtime_disconnect_broadcast`.
**Phone layout:** a `DataList` of cards, one device per card, revoke is a secondary button inside the card (never a swipe-only action).

### 4.9 Account deletion with a grace period

**Trigger:** shell settings → Security → Delete account.

1. Blocking check: if the user is the **sole `owner` of any workspace with other active members**, the flow stops with a list of those workspaces and a link to F-ID-03's ownership transfer. Sole owner of a workspace with no other members is allowed (the workspace is archived with the account). The personal workspace is always deleted with the account.
2. Ceremony: type the word `DELETE`, then re-enter the password (or complete a phone OTP if the account has no password).
3. `requestAccountDeletion` → `account_deletion_requests{status:'pending', scheduled_purge_at = now() + 30 days}`, `profiles.status = 'pending_deletion'`, all sessions revoked, confirmation email sent.
4. During the grace period, signing in works and shows a full-width banner: "Your account is scheduled for deletion on 17 Oct 2026 — **Keep my account**." One tap cancels.
5. On day 30 a `jobs` row (`account.purge`) runs under `withServiceRole('account purge')`: personal workspace and its rows hard-deleted, files removed from storage, `workspace_members` rows in school workspaces set to `removed` with `removed_reason='account_deleted'`, `profiles` anonymised (`full_name='Deleted user'`, email/phone nulled, `status='deleted'`), `auth.users` deleted. `audit_events` rows are **retained** with the actor id intact — they are the evidence trail and are explicitly out of scope for erasure (stated in the deletion screen's fine print).

**Notifications:** `account.deletion_scheduled`, `account.deletion_cancelled` (in-app + email).
**Audit:** `account.deletion_requested`, `account.deletion_cancelled`, `account.purged`.
**Failure:** purge job failure retries with backoff up to 5 times, then raises a platform-console alert; the account stays in `pending_deletion` and is never half-purged (the job is one transaction per workspace, ordered children-first).

### 4.10 Sign out

Clears the Supabase session, deletes the `acx_ws` workspace cookie, clears the TanStack Query cache and the IndexedDB offline queue, and marks the device row `last_seen_at`. This is the fix for the prototype's "logout doesn't clear `activeWorkspaceId`" finding.

## 5. Business rules and calculations

| Rule                          | Value                                                                                                              | Where it lives                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Password minimum length       | **12 characters** (SECURITY.md §5.7.5 [MUST]; this table previously said 10 and was wrong)                         | `packages/domain/auth/passwordPolicy.ts`     |
| Password strength             | zxcvbn score ≥ 3; rejects the email local-part, the full name, and a bundled list of the 10k most common passwords | same                                         |
| Password maximum length       | 72 bytes (bcrypt limit) — enforced client and server                                                               | same                                         |
| Email verification link TTL   | 24 h                                                                                                               | Supabase Auth config, mirrored as a constant |
| Magic link TTL                | 15 min, single use                                                                                                 | Supabase Auth config                         |
| Password reset link TTL       | 60 min, single use                                                                                                 | Supabase Auth config                         |
| OTP length / TTL / attempts   | 6 digits / 10 min / 5 verify attempts                                                                              | `packages/domain/auth/otpPolicy.ts`          |
| Resend cooldown (any channel) | 60 s, visible countdown                                                                                            | `otpPolicy.ts`                               |
| OTP requests per phone        | 5 / hour, 15 / day                                                                                                 | `auth_throttle`                              |
| Sign-in failures              | 5 per (email, 15 min) → 15 min block; 30 per (IP, 15 min) → 60 min block                                           | `auth_throttle`                              |
| Registrations per IP          | 5 / hour                                                                                                           | `auth_throttle`                              |
| Session lifetime              | refresh token 30 days (sliding), access token 1 h                                                                  | Supabase project config                      |
| "Remember this device" off    | refresh token 24 h                                                                                                 | session cookie flag                          |
| Account deletion grace        | **30 days** (matches the document-request consent window in PRODUCT-DECISIONS §1.15)                               | `packages/domain/auth/deletionPolicy.ts`     |
| Purge job schedule            | daily 02:30 Asia/Dhaka                                                                                             | pg_cron → `jobs`                             |
| Sole-owner deletion block     | blocked when `count(active members in that workspace) > 1`                                                         | `packages/domain/workspace/ownership.ts`     |
| New-device notification       | fired when a `session_ref` is unseen **and** the user already has ≥ 1 non-revoked device                           | `packages/domain/auth/deviceRules.ts`        |
| Email enumeration             | reset, magic link and phone OTP responses are always identical; registration is not                                | `passwordPolicy.ts` docblock                 |

**Compensating controls for the 30-day sliding session, no-MFA posture (teachers/staff/parents).** The 30-day sliding refresh and the absence of MFA for teachers, staff and parents are both **kept as-is** — the product still needs a school-issued Android phone to stay signed in for a term. Instead of MFA, the following controls are mandatory [MUST]:

| Control                         | Value                                                                                                                                                              | Where it lives                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Step-up re-authentication       | Required (password or OTP, even on an otherwise-valid session) immediately before rendering any `read_sensitive` view, any health record, or the **Documents tab** | `packages/domain/auth/stepUp.ts`                     |
| Idle timeout on step-up screens | Step-up screens above auto-lock and demand re-authentication again after **5 minutes** of inactivity                                                               | same                                                 |
| App-level lock                  | A PIN or device biometric (WebAuthn platform authenticator) lock gates re-entry to the installed PWA after backgrounding — independent of the Supabase session     | `packages/domain/auth/appLock.ts`                    |
| Notification preview redaction  | Push/in-app previews never render marks, message content, or job/hiring activity in the lock-screen or notification-centre preview — only a generic event label    | `packages/domain/notifications/preview.ts` (F-ID-07) |

## 6. UI

All screens are designed at **360×800 first**. Components come from `packages/ui`: `AuthCard`, `FormSheet`, `OtpInput`, `PasswordField` (with strength meter), `CountdownButton`, `DataList`, `EmptyState`, `InlineAlert`, `ConfirmDialog` (a `Sheet` on phone), `Banner`.

| Route                                                            | 360×800                                                                                                                                                                                                 | ≥1024                                                                        | Primary action    | Empty                                                              | Loading                                           | Error                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/login`                                                         | Full-bleed card, logo 48 px, segmented control (Password/Phone/Email link) directly under the title, fields stacked, sticky submit above the keyboard, "Create an account" as a text link at the bottom | Centred 420 px card on the brand gradient, illustration column ≥1280         | Sign in           | n/a                                                                | Submit button → spinner + disabled, fields locked | `InlineAlert` above the form; field-level errors under fields; throttle shows a live countdown |
| `/register`                                                      | Same card; one column; Terms checkbox above the button                                                                                                                                                  | Centred 460 px card                                                          | Create account    | n/a                                                                | Skeleton not needed; button spinner               | Inline per field; duplicate-email alert links to `/login`                                      |
| `/login/otp`, `/verify` (OTP form)                               | 6 OTP boxes at 48×56 px filling the width, numeric keypad, resend countdown under them                                                                                                                  | Same card, boxes 56×64 px                                                    | Verify            | n/a                                                                | Auto-submit on 6th digit with a spinner           | "Code incorrect — 3 attempts left" under the boxes                                             |
| `/verify` (email link sent)                                      | Icon tile, the masked address, Resend + Change email                                                                                                                                                    | Same, centred                                                                | Resend            | n/a                                                                | Button spinner                                    | Alert with a support link                                                                      |
| `/forgot`                                                        | Single email field + button                                                                                                                                                                             | Centred card                                                                 | Send reset link   | n/a                                                                | Button spinner                                    | Generic success regardless                                                                     |
| `/reset`                                                         | Two password fields + strength meter                                                                                                                                                                    | Centred card                                                                 | Set new password  | n/a                                                                | Button spinner                                    | Invalid-token screen with "Send a new link"                                                    |
| `/app/settings/security` and `/personal/settings` → Security tab | Tab bar at the top of settings; sections stacked: Password, Phone, Devices, Delete account; each device is a card with Revoke                                                                           | Two-column settings layout: left nav, right panel; devices render as a table | Change password   | Devices list can't be empty (the current device is always present) | Skeleton cards ×3                                 | Section-level `InlineAlert`; a failed revoke restores the row                                  |
| Delete-account flow                                              | Full-screen `Sheet`, three steps (consequences → type DELETE → password), the destructive button is bottom-sticky and red                                                                               | `ConfirmDialog` at 480 px                                                    | Delete my account | n/a                                                                | Button spinner                                    | Blocking-owner state lists workspaces with links                                               |
| Deletion-grace banner                                            | Sticky under the top bar on every route, one line + "Keep my account"                                                                                                                                   | Same, inline with the shell header                                           | Keep my account   | n/a                                                                | —                                                 | —                                                                                              |

Accessibility: every field has a visible label (never placeholder-only), errors are `aria-live="polite"`, the OTP group is a single labelled `role="group"`, the password strength meter is announced as text not colour alone, contrast ≥ 4.5:1, 44 px minimum targets.

## 7. Server contracts

All in `apps/web/app/(auth)/actions.ts` unless noted. Schemas live in `packages/contracts/src/identity/auth.ts`. Every action returns `Result<T, ApiError>`; nothing throws to the client.

| Action / handler                         | Input schema (Zod)                                                                             | Output                                                                                     | Errors                                                         | Idempotency                                 | Rate limit                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| `registerWithPassword`                   | `RegisterWithPasswordInput` {full_name 2–80, email, password, terms_accepted: literal(true)}   | `{ userId, needsEmailVerification: true }`                                                 | `EMAIL_TAKEN`, `WEAK_PASSWORD`, `RATE_LIMITED`                 | by email — re-calling resends verification  | 5/h per IP                           |
| `signInWithPassword`                     | `SignInWithPasswordInput` {email, password, remember: boolean}                                 | `{ landingRoute }`                                                                         | `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED`, `RATE_LIMITED`     | n/a                                         | 5/15 min per email, 30/15 min per IP |
| `requestPhoneOtp`                        | `PhoneOtpRequestInput` {phone E.164}                                                           | `{ sentAt, cooldownSeconds: 60 }`                                                          | `RATE_LIMITED`, `SMS_UNAVAILABLE`                              | key = phone + 60 s window                   | 5/h per phone                        |
| `verifyPhoneOtp`                         | `PhoneOtpVerifyInput` {phone, code: 6 digits}                                                  | `{ landingRoute }`                                                                         | `OTP_INVALID`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED`          | n/a                                         | 5 attempts per code                  |
| `requestMagicLink`                       | `MagicLinkRequestInput` {email}                                                                | `{ ok: true }` (always)                                                                    | `RATE_LIMITED` only                                            | key = email + 60 s                          | 5/h per email                        |
| `requestEmailVerification`               | `ResendVerificationInput` {email}                                                              | `{ ok: true }`                                                                             | `RATE_LIMITED`                                                 | key = email + 60 s                          | 5/h                                  |
| `requestPasswordReset`                   | `PasswordResetRequestInput` {email}                                                            | `{ ok: true }` (always)                                                                    | `RATE_LIMITED`                                                 | key = email + 60 s                          | 5/h                                  |
| `resetPassword`                          | `PasswordResetInput` {token_hash, password}                                                    | `{ ok: true }`                                                                             | `TOKEN_INVALID`, `TOKEN_EXPIRED`, `WEAK_PASSWORD`              | single-use token                            | 10/h per IP                          |
| `changePassword`                         | `ChangePasswordInput` {current_password, password, sign_out_others: boolean default true}      | `{ ok, revokedSessions }`                                                                  | `INVALID_CREDENTIALS`, `WEAK_PASSWORD`                         | n/a                                         | 10/h per user                        |
| `addPhone` / `verifyPhone`               | `AddPhoneInput` {phone} / `VerifyPhoneInput` {phone, code}                                     | `{ phone, verified_at }`                                                                   | `PHONE_TAKEN`, `OTP_*`                                         | as 4.3                                      | 5/h per user                         |
| `listSessions`                           | `ListSessionsInput` {}                                                                         | `SessionSummary[]` {id, label, platform, country, first_seen_at, last_seen_at, is_current} | `UNAUTHENTICATED`                                              | n/a                                         | 60/min                               |
| `revokeSession`                          | `RevokeSessionInput` {device_id uuid}                                                          | `{ ok: true }`                                                                             | `NOT_FOUND`, `FORBIDDEN`                                       | by device_id (already-revoked is a success) | 30/h                                 |
| `revokeAllSessions`                      | `RevokeAllSessionsInput` {keep_current: boolean}                                               | `{ revoked: number }`                                                                      | —                                                              | idempotent                                  | 10/h                                 |
| `requestAccountDeletion`                 | `AccountDeletionRequestInput` {confirmation: literal('DELETE'), password?, otp_code?, reason?} | `{ scheduled_purge_at }`                                                                   | `SOLE_OWNER_BLOCKED` (+ `workspaces[]`), `INVALID_CREDENTIALS` | one pending row per user                    | 3/day                                |
| `cancelAccountDeletion`                  | `AccountDeletionCancelInput` {}                                                                | `{ ok: true }`                                                                             | `NOT_FOUND`                                                    | idempotent                                  | 10/day                               |
| `signOut`                                | —                                                                                              | redirect                                                                                   | —                                                              | idempotent                                  | —                                    |
| `GET /api/auth/callback` (route handler) | query `{token_hash, type, next}` — `AuthCallbackQuery`                                         | 302                                                                                        | `TOKEN_INVALID` → `/login?error=link_expired`                  | single-use                                  | 60/min per IP                        |
| `GET /api/health/auth`                   | —                                                                                              | `{ ok, provider_latency_ms }`                                                              | —                                                              | —                                           | —                                    |

`next` in the callback is validated against a same-origin allowlist (`packages/domain/auth/safeReturnTo.ts` — the port of the prototype's dead-but-correct `authReturnTo.js`, this time with call sites).

## 8. Parts (build chunks)

**Part 1 — Supabase Auth wiring and the session boundary** · Configure Supabase Auth (email+password, magic link, phone), `@supabase/ssr` server/browser/service clients in `packages/db`, middleware that refreshes the session on every request, `handle_new_user()` trigger creating `profiles`, `profiles` table + RLS + column-guard trigger, `withServiceRole(reason)` wrapper. · Files: `packages/db/src/clients/*`, `apps/web/middleware.ts`, `supabase/migrations/*_profiles.sql`. · Tests: pgTAP (a user cannot set `is_platform_admin`, cannot read another user's `phone`); unit test for the middleware refresh. · **Demo:** sign up via the Supabase dashboard, hit a protected route, get redirected to `/login`; a `profiles` row exists with the right defaults.

**Part 2 — Register + email verification** · `/register`, `/verify`, `registerWithPassword`, `requestEmailVerification`, Resend adapter + React Email template, `email_log`. · Tests: contract tests on `RegisterWithPasswordInput`, integration test on duplicate email, e2e at 360×800. · **Demo:** a new teacher registers on a phone viewport, receives a real email, clicks it, lands verified.

**Part 3 — Sign in (password) + landing route + sign out** · `/login` password tab, `signInWithPassword`, `resolveLandingRoute()` stub returning `/onboarding` until F-ID-03 lands, `signOut` clearing cookie + caches, throttling via `auth_throttle`. · Tests: unit for throttle windows, e2e for wrong-password messaging and lockout. · **Demo:** sign in and out on a phone; after 5 bad passwords the form shows a countdown.

**Part 4 — Forgot / reset / change password** · `/forgot`, `/reset`, the Security section's Change-password card, `safeReturnTo`, revoke-others on reset. · Tests: expired-token state, password-policy unit tests, e2e reset journey. · **Demo:** full reset round-trip from a real inbox, and the old session on a second browser is dead.

**Part 5 — Phone OTP + magic link** · Phone/Email-link tabs, `OtpInput`, `requestPhoneOtp`/`verifyPhoneOtp`/`requestMagicLink`, add-phone flow, SMS adapter behind `adapters/sms` with a console driver for dev. · Tests: OTP policy unit tests, adapter contract test, e2e with the console driver. · **Demo:** sign in with a phone number in dev using the logged code; magic link works from a real inbox.

**Part 6 — Sessions and devices** · `device_registrations`, session list UI, revoke one / revoke all, new-device detection hook that emits the notification payload (delivery arrives with F-ID-07). · Tests: pgTAP isolation on `device_registrations`, integration test that a revoked session's next server action 401s. · **Demo:** sign in on two browsers, revoke one from the other, watch it get kicked out.

**Part 7 — Account deletion with grace period** · Delete ceremony sheet, `requestAccountDeletion` with the sole-owner guard, grace banner, `cancelAccountDeletion`, the `account.purge` job + pg_cron schedule, anonymisation function. · Tests: domain unit tests on the sole-owner rule, pgTAP that a purge leaves `audit_events` intact, integration test on the purge job ordering. · **Demo:** request deletion, see the banner, cancel it; then request again and run the job manually to watch the account anonymise.

**Part 8 — Hardening and a11y pass** · Enumeration-safe copy audit, CSP + security headers, axe pass on all six auth screens, Playwright journeys at 360×800 and 1280×800, `docs/test-reports/F-ID-01.md`. · Tests: `@axe-core/playwright` zero serious/critical, Lighthouse PWA ≥ 90 on `/login`. · **Demo:** green CI with the report artifact attached.

## 9. Acceptance criteria

1. **Given** a visitor on a 360×800 viewport at `/register`, **when** they submit a valid name, email and a password scoring ≥ 3, **then** an account and a personal workspace exist in one transaction, a verification email is logged to `email_log`, and they see `/verify` with the masked address.
2. **Given** an email that already has an account, **when** it is submitted at `/register`, **then** no second account is created and the form shows "This email already has an account" with a link to `/login`.
3. **Given** a password of `password123`, **when** submitted, **then** registration is rejected with a named rule ("too common") and no network call to Supabase is made from the client beyond the server action.
4. **Given** an unverified account, **when** the user signs in, **then** they reach a blocking `/verify` interstitial and cannot open `/app` or `/personal`.
5. **Given** a verified account with one school membership, **when** the user signs in, **then** they land on `/app` — not `/personal` (the prototype's bug).
6. **Given** five consecutive wrong passwords for one email within 15 minutes, **when** a sixth is attempted, **then** the response is `RATE_LIMITED` with a countdown and no credential check is performed.
7. **Given** a phone number with a valid OTP, **when** the sixth digit is entered, **then** the form auto-submits and the user is signed in; **when** the code is wrong, **then** the remaining-attempt count is shown and decremented.
8. **Given** a request for a password reset for an address with no account, **when** submitted, **then** the response and the timing are indistinguishable from the address-exists case.
9. **Given** a completed password reset, **when** the user returns to a second browser that was signed in, **then** its next server action fails with `UNAUTHENTICATED` and it is redirected to `/login`.
10. **Given** two active sessions, **when** the user revokes the other device from the Security screen, **then** the device row shows `revoked_at`, the other browser is signed out on its next request, and `audit_events` contains `session.revoked`.
11. **Given** a user who is the sole owner of a school with three other active members, **when** they attempt account deletion, **then** the flow is blocked with `SOLE_OWNER_BLOCKED` and lists that school with a link to ownership transfer.
12. **Given** a pending deletion request, **when** the user signs in, **then** a banner shows the purge date and "Keep my account" cancels it in one tap, setting `profiles.status='active'`.
13. **Given** a deletion request whose `scheduled_purge_at` has passed, **when** the purge job runs, **then** the personal workspace and its files are gone, school memberships read `removed`, the profile is anonymised, and every `audit_events` row for that actor is still readable in F-ID-09.
14. **Given** any auth screen at 360×800, **when** the on-screen keyboard is open, **then** the primary button remains visible and tappable without scrolling.
15. **Given** a signed-out user, **when** they request any `/app/*`, `/personal/*` or `/platform/*` route, **then** they are redirected to `/login?next=<validated path>` and, after signing in, land on that path.
16. **Given** a crafted `next=https://evil.example/`, **when** the auth callback runs, **then** the redirect falls back to the resolved landing route and `safeReturnTo` logs the rejection.

## 10. Tests

- **Unit (`packages/domain`, Vitest, ≥ 80 %):** `passwordPolicy` (length, zxcvbn threshold, name/email similarity, 72-byte cap), `otpPolicy` (TTL, attempts, cooldown), `deviceRules.isNewDevice`, `deletionPolicy.canDelete` (sole-owner matrix), `safeReturnTo` (same-origin, `//`, backslash, encoded-scheme payloads).
- **DB (pgTAP):** `profiles` — owner can select self; peer in a shared workspace can select only through `member_directory`; stranger gets zero rows; owner cannot update `is_platform_admin`, `status` or `email`; no role has DELETE. `device_registrations` — cross-user select/update/delete all denied. `account_deletion_requests` — one pending row constraint; no DELETE grant. `auth_throttle` — no grants to `authenticated`.
- **Integration (server actions, Vitest + a seeded Supabase dev branch):** every action in §7 for happy path, each named error, and the rate limit; `registerWithPassword` twice with the same email creates exactly one `auth.users` row; purge job idempotency (running it twice is harmless).
- **E2E (Playwright, 360×800 and 1280×800):** `register-verify-onboard`, `signin-signout`, `forgot-reset`, `phone-otp` (console SMS driver), `device-revoke` (two browser contexts), `delete-account-and-cancel`. Mailbox assertions use a Resend test inbox; SMS uses the dev driver's log.
- **A11y:** `@axe-core/playwright` on `/login`, `/register`, `/verify`, `/forgot`, `/reset`, Security tab — zero serious or critical; keyboard-only completion of register and sign-in.
- **Performance budgets:** `/login` LCP ≤ 2.0 s on simulated 3G/360×800; auth server actions p95 ≤ 400 ms excluding the provider round-trip; the session list query ≤ 50 ms server-side.
- **Security:** Semgrep rule that no route handler outside `withServiceRole` imports the service-role client; a test asserting the auth callback rejects off-origin `next`.

## 11. Open questions

- **OQ-1 (blocking for Part 5): SMS provider.** PRODUCT-DECISIONS §7 defers "SMS/WhatsApp providers" to post-v1, but §1.3 requires SMS invitations and this feature specifies phone-OTP sign-in. **Default assumed:** an `adapters/sms` interface ships in v1 with a console driver for dev and a single BD provider (Twilio or a local aggregator) wired in production; if no provider is funded, the Phone tab and SMS invites are hidden behind the `auth.phone_otp` feature flag (F-ID-08) and the product is email-only at launch. Needs an owner decision.
- **OQ-2: Deletion grace period length.** Not fixed in PRODUCT-DECISIONS. **Default assumed: 30 days.**
- **OQ-3: Account-level settings route — RESOLVED by Parts 1-4.** ARCHITECTURE §2 (as merged in `chore/foundation`) now lists `(account)/account/` as the canonical user-level settings group. Part 4's Change-password card lives at `/account/security`, which this PR added to `middleware.ts`'s `PROTECTED_PREFIXES`. Sessions/devices and account deletion (Parts 6-7) extend the same page.
- **OQ-4: Social sign-in.** Google/Microsoft SSO is explicitly out of scope (PRODUCT-DECISIONS §7), so the prototype's "Connect Google/Apple/Microsoft" buttons are removed rather than wired. Confirmed removal, noted here so it is not re-added by mistake.
- **OQ-5: `audit_events.workspace_id` must be nullable** for account-level rows (`account.registered`, `session.revoked`, …), and those rows are written by a SECURITY DEFINER function rather than a table trigger. ARCHITECTURE §4 describes the table as trigger-filled per tenant table only. Raised as a conflict — see F-ID-09 §11 and `docs/decisions/DECISION-LOG.md`.

- **OQ-25 (blocking for launch, raised by the Parts 1-4 security review): breached-password rejection is not on.** SECURITY.md §5.7.5 is a [MUST] with two halves: minimum 12 characters (now enforced in `passwordPolicy.ts`, `packages/contracts` and `supabase/config.toml`'s `password_min_length`) **and** Supabase Auth's HaveIBeenPwned leaked-password rejection, reported to the user as "this password has appeared in a known data breach". The second half has no `config.toml` key — it is a dashboard / Management-API setting on the hosted project — so it is **not enabled**, and nothing in this PR can enable it. Until it is, the ~300-entry `commonPasswords.ts` list is standing in for a 900-million-entry corpus. **Owner action:** turn on _Authentication → Passwords → Leaked password protection_ on `bvqzhrvcrxebawjusrxk`, then add the "known data breach" copy to `messages/{en,bn}.json` and an e2e case.

### Deviations logged by Parts 1-4 (`feat/identity-auth`)

- **Password minimum raised 10 → 12.** §5's table said 10; SECURITY.md §5.7.5 says 12 and is a [MUST]. The baseline wins, §5's row is corrected, and `PASSWORD_MIN_LENGTH`, `passwordSchema` and `supabase/config.toml`'s `password_min_length` now all say 12. The breach-check half of the same control is deferred — see OQ-25.
- **Password strength is a heuristic, not zxcvbn.** §5 names zxcvbn (score ≥ 3). `zxcvbn` ships a multi-megabyte frequency dictionary; adding it is a HANDBOOK §8 dependency decision, not a default to make mid-Part. `packages/domain/src/auth/passwordPolicy.ts` implements a documented 0-4 heuristic (length, character-class variety, run-detection, a ~300-entry common-password list) that satisfies every acceptance criterion that exercises strength (AC1, AC3). Swapping in real zxcvbn later only touches that one file.
- **No parallel Resend pipeline for auth emails.** Part 2 names "Resend adapter + React Email template". Supabase Auth already sends the signUp-confirmation and password-recovery emails itself; a second send through Resend would double-send. `apps/web/lib/email-log.ts` instead logs a synthetic `email_log` row after asking Supabase to send, so "did the email go out" is answerable from the same table every other transactional send uses. It never throws — a missing `SUPABASE_SERVICE_ROLE_KEY` must not turn a successful `signUp` into a failed registration.
- **`app` schema functions are not reachable from `apps/web`.** `supabase/config.toml` exposes only `public` (and `graphql_public`) through PostgREST; `app` is deliberately not exposed ("those functions are for policies, not for clients"). The throttle functions and the new `log_auth_event` wrapper therefore live in `public`, not `app` — see migration `20260917020000_identity_auth.sql` and DATA-MODEL.md §1.8a. This same constraint applies to every future Part that needs a client-callable RPC (Parts 5-7, F-ID-03's `accept_invitation`/`join_workspace_by_code`, etc.) and is worth a DECISION-LOG entry before the next feature hits it.
- **No app-wide `next-intl` runtime yet.** ARCHITECTURE §4 names `next-intl`. Wiring app-wide locale routing/detection is a cross-cutting change that belongs to whichever Part first needs it everywhere, not to six auth screens. `apps/web/lib/i18n.ts` reads `messages/en.json`/`bn.json` directly via a small server-side helper (`getMessages()`), and `apps/web/lib/locale.ts` carries the client-safe `Locale` type/cookie name for the language toggle. Both languages render for real; swapping in `next-intl` later touches these two files and the client components that currently receive `t` as a prop.
- **`resolveLandingRoute()` returns `/onboarding`, which does not exist yet.** F-ID-05 (onboarding) has not been built. A successful sign-in or registration currently redirects to a route that 404s. This is the documented Part 3 stub ("returning /onboarding until F-ID-03 lands") working as specified — flagged here so it is not mistaken for a bug when F-ID-05 or F-ID-03 land and the redirect needs revisiting.
- **`packages/contracts` `remember`/`signOutOthers` are not `.default(true)`.** `zodResolver` infers a form's field-value type from the schema's _input_ shape; a `.default()`'d field's input/output types diverge just enough to break that inference with `react-hook-form` (a TS-only issue, confirmed via `tsc`). Every UI form supplies `true` through `defaultValues` instead; documented inline at both schema fields.
- **e2e coverage in this environment is partial** (see the Part 1-4 test report, `docs/test-reports/2026-09-17-F-ID-01-p1-4.md`, for exact numbers): this sandbox has no Supabase DB/service-role credentials and no way to apply `20260917020000_identity_auth.sql` or `supabase/seed/seed.sql` to the linked cloud project. Journeys that only need client-side validation or a failure response pass; journeys needing a live `signUp`/seeded sign-in or the new throttle RPCs are blocked by (respectively) the project's default email-send rate limit, an unseeded dev branch, and an unapplied migration — all CI-only conditions per this Part's build instructions.
