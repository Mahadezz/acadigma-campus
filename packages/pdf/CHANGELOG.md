# @acadigma/pdf

## 0.3.0

### Minor Changes

- 4a954d2: F-OP-03 Part 3 (D-206) — the report card ("প্রগতিপত্র" / "Progress Report") on the Parts 1-2 PDF engine. New `ReportCardDocument` in `@acadigma/pdf`: one A4 portrait layout, Bengali (Hind Siliguri) + English, subject table with marks/grade/GPA, totals, attendance summary with a below-minimum warning line, class-teacher/guardian signature lines. Bengali numerals render on the card only (DESIGN-SYSTEM §1.6). Grade letters/GPA come from `@acadigma/domain`'s `bandFor`/`BD_GRADE_BANDS` (the #46/D-302 grade scale) — `packages/pdf` still contains no grade-band logic of its own (spec §5.1).

  New `ReportCardDto`/`ReportCardParams` contracts (`@acadigma/contracts`). `report_kind` gains `'report_card'` (additive `alter type ... add value`, no shape change to `report_runs`; `42_report_card_kind.sql`). An incomplete or withheld result prints "অসম্পূর্ণ — ফলাফল স্থগিত" and hides totals, GPA, grade and rank; absent subjects print "অনুপস্থিত", the 4th subject and tied ranks are marked. New `report.render.report_card` permission (owner, admin, staff, teacher); the download route checks it too. `createReportRun` and `GET /api/pdf/[runId]` both render the new kind.

  Real exam/marks data (F-AC-06 marks entry) is not on `main` yet, so the render source is a 40-student Class 6-ক fixture behind one seam function (`getReportCardData`) — swapping in the real `results` read (F-AC-06 Part 5) touches only that function's body, not the DTO, params or any caller. The fixture never serves in production, and the demo button is hidden there.

### Patch Changes

- ee42f11: Bengali sentences in PDFs now end with a real danda (`।`) instead of a tofu box: `ScriptText` sends U+0964/U+0965 to Hind Siliguri. Adds a regression test that inflates every `FlateDecode` stream of a rendered PDF with `node:zlib` and checks the Bengali text layer.
- Updated dependencies [07780bc]
- Updated dependencies [9e5421e]
- Updated dependencies [4a954d2]
  - @acadigma/contracts@0.6.0
  - @acadigma/domain@0.6.0

## 0.2.1

### Patch Changes

- Updated dependencies [8d112a1]
- Updated dependencies [189fb24]
  - @acadigma/domain@0.5.0

## 0.2.0

### Minor Changes

- 5b4dbd6: F-OP-03 Parts 1-2 — the print/PDF engine. New `@acadigma/pdf` package: a
  `@react-pdf/renderer` document shell (letterhead header reading
  `school_profiles` through the existing `renderHeaderLine`, footer with real
  page numbers, watermark, signature block), Inter + Hind Siliguri embedded
  from disk (D-204 — Hind Siliguri over the spec's original Noto Sans Bengali
  default, to match DESIGN-SYSTEM/acadigma-website), locale-aware
  `formatNumber`/`formatDate`/`formatDateTime` (Bengali numerals opt-in), and
  a golden test proving Bengali conjuncts ("ক্ষ") and two schools' letterheads
  render correctly from real PDF bytes.

  The run pipeline (`report_runs`/`report_run_items`, migration + RLS +
  pgTAP `40_report_runs.sql`): `createReportRun` (parse -> context -> `can()`
  -> plan entitlement -> `requireWritable` -> repository -> render, D-300
  compliant) and `GET /api/pdf/[runId]` (parse -> context -> `can()` -> fetch
  via the caller's own RLS-scoped client -> render), both with route/action
  auth tests. `report_kind` ships with one value, `'sample'`, the pipeline's
  own proof (D-205) — no fake report-card data, since exam/marks tables do not
  exist yet. No `files`/Storage row is created in this PR (D-205); the
  download route re-renders deterministically instead. `/app/reports` and
  `/app/reports/runs/[id]` are new, minimal pages behind the existing
  `reports` plan-module entitlement (Starter+).

### Patch Changes

- Updated dependencies [d704c7e]
- Updated dependencies [d1f6cca]
- Updated dependencies [932f920]
- Updated dependencies [4091c9e]
- Updated dependencies [baa055e]
- Updated dependencies [5b4dbd6]
  - @acadigma/domain@0.4.0
