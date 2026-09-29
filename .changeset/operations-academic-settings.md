---
"@acadigma/web": patch
"@acadigma/contracts": patch
"@acadigma/db": patch
"@acadigma/domain": patch
---

F-OP-07 Part 2 (D-210): Settings → Academic — academic years (create, set current with a confirmation naming what changes), terms within a year (add/delete, validated against the year's range and other terms), exam weighting (a live sum, blocked unless it adds to 100 or is empty), and the pass-mark/GPA-rule/rank/grade-scale-code form. New `terms` table (`47_terms.sql`, class T2 RLS) and `public.set_current_academic_year` RPC for the atomic `is_current` swap. New: `checkTermRange`/`checkExamWeights` (`@acadigma/domain/academic`), `listAcademicYears`/`createAcademicYear`/`setCurrentAcademicYear`/`listTerms`/`createTerm`/`deleteTerm`/`getExamWeights`/`updateExamWeights` (`@acadigma/db/repositories/academic-years`), their Zod contracts (`@acadigma/contracts`).
