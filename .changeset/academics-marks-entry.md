---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
---

F-AC-06 Part 3 demo cut (D-304): marks entry. `marks` table and `public.save_marks` (the only writer: the paper's teacher, the class teacher or an owner/admin, only while the exam is in marks entry and the paper is not locked; idempotent; per-row version check and range check so valid rows still save). `/app/marks/[examSubjectId]` is the phone-first entry screen (72 px rows, big numeric input, Enter to the next student, Absent/Exempt chips, sticky "24/40 · Save"; ↑/↓, Esc, A, E and Ctrl+S on desktop). Exam papers get a subject teacher and a marks progress count. Publish is refused until every enrolled student in every paper has a mark, or is absent or exempt.
