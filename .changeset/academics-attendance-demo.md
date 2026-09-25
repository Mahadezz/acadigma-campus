---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
---

F-AC-03 demo cut (D-104): daily attendance. `public.save_attendance` is the only writer (class teacher or owner/admin, edit window, school days, exactly the enrolled students, audited "Mark all present", no silent overwrite); `/app/attendance` shows today's classes marked / not marked with the school's rate, `/app/attendance/[sectionId]` is the one-thumb roll call; the dashboard's attendance slot shows today's rate.
