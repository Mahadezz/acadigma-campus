---
"@acadigma/web": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": minor
"@acadigma/pdf": minor
---

F-OP-03 Part 5 bulk report cards, demo cut (D-207): owners, admins and teachers render one merged A4 PDF of every student's report card in a section for one exam, ordered by roll or name, with duplex padding so every card starts on an odd page when "print both sides" is on. New `report_card_bulk` report kind on the existing run pipeline (synchronous, D-205's precedent); a per-student failure is recorded as a `report_run_items` row without failing the run. New permission `report.render.report_card_bulk` (owner/admin/teacher, not staff). Security hardening: `report_runs`/`report_run_items` SELECT now restrict staff to `report_card` runs at the RLS layer itself (defence in depth, #63 review).
