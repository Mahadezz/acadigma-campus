---
"@acadigma/pdf": minor
"@acadigma/contracts": minor
"@acadigma/domain": minor
"@acadigma/db": patch
"@acadigma/web": minor
---

F-OP-03 Part 3 (D-206) — the report card template on the Parts 1-2 PDF engine. New `ReportCardDocument` in `@acadigma/pdf`: one A4 portrait layout, Bengali (Hind Siliguri) + English, subject table with marks/grade/GPA, totals, attendance summary with a below-minimum warning line, class-teacher/guardian signature lines. Bengali numerals render on the card only (DESIGN-SYSTEM §1.6). Grade letters/GPA come from `@acadigma/domain`'s `bandFor`/`BD_GRADE_BANDS` (the #46/D-302 grade scale) — `packages/pdf` still contains no grade-band logic of its own (spec §5.1).

New `ReportCardDto`/`ReportCardParams` contracts (`@acadigma/contracts`). `report_kind` gains `'report_card'` (additive `alter type ... add value`, no shape change to `report_runs`; `42_report_card_kind.sql`). New `report.render.report_card` permission (owner, admin, teacher). `createReportRun` and `GET /api/pdf/[runId]` both render the new kind.

Real exam/marks data (F-AC-06 marks entry) is not on `main` yet, so the render source is a 40-student Class 6-ক fixture behind one seam function (`getReportCardData`) — swapping in the real `app.compute_exam_result` query touches only that function's body, not the DTO, params or any caller.
