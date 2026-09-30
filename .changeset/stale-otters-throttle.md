---
"@acadigma/web": patch
---

Sign-in no longer spends the wrong-password throttle budget (`loginByEmail`/`loginByIp`) on a transient Supabase Auth error — only GoTrue's own `invalid_credentials` code counts as a guessed password. Any other error (timeout, 5xx, unreachable) returns the existing "could not sign you in, try again shortly" shape instead. Found via the e2e-live CI job (D-76): under real resource pressure a handful of transient errors on an otherwise-correct sign-in tripped the shared seeded account's real 5-attempts/900s bucket and locked out every later journey for the rest of the run.
