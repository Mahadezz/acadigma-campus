---
"@acadigma/web": minor
"@acadigma/db": minor
"@acadigma/domain": minor
"@acadigma/contracts": minor
---

F-AC-04 Part 1 (D-214): staff self check-in. Owners, admins, teachers and
office staff get a "Your attendance" card on `/app/dashboard` and the
basic-mode `/app/home`: one big Check in button, then "Present · in at 07:52"
(or "Late · in at 08:20 (20 min late)") and a Check out button. On a
non-school day it says "No school today" and offers nothing. The time, date
and status are the database's: `public.staff_check_in` / `staff_check_out`
take only the workspace id, a second tap returns the same row, check-out
never changes the status, and the new `staff_attendance` table has no write
grant (a member reads their own rows, owner/admin read the school's). New
permission `staff_attendance.self`. Policy defaults (on time until 08:00, 10
minutes grace) are code defaults; the editor, the admin grid and leave are
later Parts.
