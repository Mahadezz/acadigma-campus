---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/pdf": minor
---

F-OP-03 Part 6, demo cut (D-208): two new report kinds on the existing PDF engine and run pipeline. The **monthly attendance register** (`attendance_register`) prints one section's whole month landscape, every calendar day as a column, non-school days greyed, per-student P/A/L/E/H codes with totals and percentages, per-day present counts, the school's own late/half-day policy in the legend, and an "n days not yet taken" banner. The **exam mark sheet** (`mark_sheet`) prints one section x exam landscape, students x papers, with totals/GPA/grade/rank from F-AC-06's already-computed results — a student without a computed result still gets a row and prints "Incomplete"/"অসম্পূর্ণ"; an exam with no computed results at all fails the run with a clear "compute results first" message. New permissions `report.render.attendance_register` and `report.render.mark_sheet` (owner/admin/teacher, not staff). `attendance_register_signoffs` (sign/countersign/lock) is explicitly deferred, not tiny — see D-208.
