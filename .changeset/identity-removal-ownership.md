---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/db": minor
"@acadigma/domain": patch
---

F-ID-03 Part 7 — remove a member, leave a school, transfer ownership. Owners
and admins can remove a member from Team & access (access ends on their next
request; works even on a read-only plan). Every member can leave a school from
"Your membership" (`/app/settings/membership`), except its only owner, who
first hands ownership to an admin or teacher: a one-step transfer confirmed
with their password and the school's name, optionally staying an owner too.
