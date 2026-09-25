---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/db": minor
"@acadigma/domain": minor
---

F-AC-06 Part 2 (demo cut, D-303): exams. Migration `20260925300305_exams.sql` adds
`exams`, `exam_sections` and `exam_subjects`, a grading snapshot written at creation and
never changed afterwards, the §5.12 status chain enforced in the database, and
`public.create_exam`. `@acadigma/domain/academic` adds `checkExamTransition`,
`nextExamStatus`, `reversalFrom` and `defaultPassMarks`; there are new contracts and an
exams repository; new permissions `exams.read` and `exams.write`. New screens:
`/app/exams` (list and "New exam") and `/app/exams/[id]` (status actions, reasons for
reversals, and editing each paper's date, full marks and pass marks).
