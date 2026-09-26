export { ReportShell, type ReportShellProps } from "./document-shell"
export {
  FONT_HIND_SILIGURI,
  FONT_INTER,
  registerFonts,
  __resetFontRegistrationForTests,
} from "./fonts"
export {
  formatDate,
  formatDateTime,
  formatMonthYear,
  formatNumber,
  type ReportLocale,
} from "./format"
export {
  mergeReportCardBulkPdf,
  type ReportCardBulkMergeResult,
  type ReportCardBulkPageRange,
} from "./merge"
export { renderPdfToBuffer } from "./render"
export {
  AttendanceRegisterDocument,
  type AttendanceRegisterDocumentProps,
} from "./templates/attendance-register"
export {
  MarkSheetDocument,
  type MarkSheetDocumentProps,
} from "./templates/mark-sheet"
export {
  ReportCardDocument,
  type ReportCardDocumentProps,
} from "./templates/report-card"
export { SampleDocument, type SampleDocumentProps } from "./templates/sample"
