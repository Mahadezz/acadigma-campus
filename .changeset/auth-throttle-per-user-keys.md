---
"@acadigma/web": patch
"@acadigma/contracts": minor
---

D-101: per-user throttle keys are derived from `auth.uid()` in the database (nobody can lock another user out of a bucket), and a rate-limited sign-in shows the wait once, in minutes, with the button a disabled "Sign in". `ApiError` gains an optional `retryAfterSeconds`.
