---
"@acadigma/db": patch
---

Fix `/app/classes` returning the generic error for every owner: `workspace_members` has four foreign keys to `profiles`, so `getClassesOverview` and `listClassTeacherOptions` now hint the intended one (`profiles!workspace_members_user_id_fkey`) instead of leaving PostgREST's embed ambiguous.
