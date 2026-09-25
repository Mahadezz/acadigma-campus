---
"@acadigma/web": patch
---

D-70: `apps/web/vercel.json` now sets `ignoreCommand` so only pushes to `main` build on Vercel — PR previews are dropped (`CI / build` already proves the app builds on every PR). No runtime behaviour changes.
