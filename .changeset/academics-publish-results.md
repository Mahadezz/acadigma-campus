---
"@acadigma/web": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/contracts": minor
---

F-AC-06 Part 7 (D-306): publishing results. "Publish" on a marks-locked exam opens a sheet to withhold students (each with a reason); `publishResults` refuses until marks are complete and every result is computed and complete, then freezes each student's report card in the database so a later rename can never change what a family was shown. Unpublishing (with a reason) hides results again and is audited. Parents see their own linked children's published, non-withheld results on `/family`, with "Download report card". Adds `guardian_users` (parent ↔ child links; the invite flow that creates them comes with F-AC-02 Part 4) and the `results.publish` and `family.results.read` permissions.
