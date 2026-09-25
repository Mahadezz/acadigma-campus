---
"@acadigma/web": minor
"@acadigma/contracts": minor
---

Read-only mode now refuses every write (D-300). A workspace in
`access_mode = 'read_only'` (an expired trial) can no longer be changed through a
server action — `updateSchoolSettings` calls `requireWritable` and returns
`payment_required` with the read-only message (`planReadOnlyApiError`, new in
`@acadigma/contracts`) — or through a direct database write: migration
`20260925300100_require_writable_guard.sql` adds the `app.tg_require_writable()`
trigger to every tenant table. Reads, exports, billing and sign-out still work. The
school-shell banner now says what is actually blocked. CI gains
`scripts/check-require-writable.mjs` and `supabase/tests/50_require_writable.sql` so a
new write action or tenant table cannot skip the guard.
