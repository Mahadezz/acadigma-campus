---
"@acadigma/web": minor
"@acadigma/db": minor
"@acadigma/domain": minor
"@acadigma/contracts": minor
---

F-AC-11 §4.3 (D-213): working-day overrides. `/app/settings/calendar` gains
a "Make-up days and closures" list under the holidays. An owner or admin
opens a normally closed day (a make-up Friday) or closes a normal school day,
with a required reason; saving a date that already has an override replaces
it. Every staff role can read the list. `app.is_school_day` already honoured
overrides; this is the screen for the table. New permission
`calendar.override.write` (owner, admin). No migration.
