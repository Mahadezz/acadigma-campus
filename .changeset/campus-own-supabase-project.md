---
"@acadigma/web": patch
"@acadigma/db": patch
---

Campus now runs on its own Supabase project `kekfmibwjejdhxjkmezo` (DECISION-LOG D-53, superseding D-19): the Next.js remote-image host, `.env.example`, CI's public env and `supabase/config.toml` point at the new project. The marketing site keeps the old project for its waitlist. `packages/db/src/types.generated.ts` is now generated from the live schema (it was a placeholder); `updateSchoolSettings` and the web audit helper are typed against it, which exposed and fixed four null-vs-optional argument mismatches.
