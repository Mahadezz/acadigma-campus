---
"@acadigma/web": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/contracts": minor
---

F-AC-06 Part 5 (D-305): results and section rank computed in SQL. `public.compute_results` (owner/admin, marks locked and complete) replaces an exam's `results` and `result_subject_lines` in one transaction from the exam's grading snapshot — paper percentage to 2 decimals with no rounding before banding, absent fails the paper, exempt is left out, an F zeroes the GPA, `rank()` per section by GPA, total, percentage. "Compute results" on the exam page and a results preview per section (`/app/exams/[id]/results`). `computeResults` in `@acadigma/domain/grading` is the TypeScript reference, held to the same golden fixture as the SQL. `getReportCardResult` returns a result shaped for F-OP-03's report card.
