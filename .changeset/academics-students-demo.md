---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
---

F-AC-02 demo cut (D-103): students, their private details (date of birth), guardians and enrolments, with the sensitive fields readable only by owner/admin and the class teacher; `public.admit_student` admits a student, guardian and enrolment in one transaction. `/app/students` searches the roster by English or Bangla name or student ID with a class filter and a quick-admit sheet; `/app/students/[id]` shows the profile, with date of birth and guardians locked for other roles.
