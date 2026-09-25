# @acadigma/pdf

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
