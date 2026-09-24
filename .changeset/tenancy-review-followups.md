---
"@acadigma/web": patch
"@acadigma/db": patch
---

F-ID-03 review follow-ups (D-52): a stale `acadigma_workspace` cookie from a previous session on a shared device no longer survives into a new sign-in (`signInWithPassword`, `resetPassword`'s `verifyOtp`, `/api/auth/callback`'s `verifyOtp` all clear it, and `resolveLandingRoute` never trusts the request's `x-workspace-id` header); `resolveWorkspaceContext` distinguishes a removed/pending member (`membership_inactive`, no tripwire) from a genuine forged-header attempt (`not_a_member`, tripwire fires); and a new migration (`20260924010000_tenancy_freeze_cascade_exception.sql`) lets `app.tg_freeze_workspace` allow the one `ON DELETE SET NULL` cascade transition on `public.data_requests.workspace_id` that a platform hard-delete of a workspace needs, while still blocking every direct client re-parent.
