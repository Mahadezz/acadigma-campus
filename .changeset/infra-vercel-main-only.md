---
"@acadigma/web": patch
---

Vercel now creates deployments for `main` only (D-74). Branch pushes no longer create (then cancel) a Vercel deployment, so WIP pushes stop using up the Hobby plan's daily deployment quota.
