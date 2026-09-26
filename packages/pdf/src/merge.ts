/**
 * F-OP-03 Part 5 (bulk report cards, demo cut) — D-207.
 *
 * Merges N single-document PDF buffers (one per student, already rendered
 * by `renderPdfToBuffer(ReportCardDocument(...))`) into one PDF, in the
 * order given. `@react-pdf/renderer` renders one `<Document>` per call —
 * this is the one place bulk output is assembled, via `pdf-lib` (already-
 * shipped PDF byte manipulation; hand-rolling page-tree merging would be
 * reinventing PDF internals for no reason).
 *
 * Duplex padding (spec §4 W2 `duplex_friendly`): when `duplex` is on, a
 * blank A4 page is appended after any student block that leaves the
 * running page count odd, so every student always starts on an odd
 * (front-side) page — the printed stack can be cut and stapled per student
 * without one student's card bleeding onto the back of another's last page.
 */
import { PDFDocument } from "pdf-lib"

// A4 in points (72 dpi), matching `document-shell.tsx`'s `<Page size="A4">`.
const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89

export type ReportCardBulkPageRange = { from: number; to: number }

export type ReportCardBulkMergeResult = {
  buffer: Buffer
  /** Total pages in the merged output, including duplex padding. */
  pageCount: number
  /** One 1-indexed, inclusive page range per input buffer, in input order. */
  pageRanges: readonly ReportCardBulkPageRange[]
}

/**
 * `buffers` is one already-rendered single-student PDF per student, in the
 * print order the caller has already decided (roll or name, §4 W2). Never
 * throws for an individual bad buffer — a caller that wants per-student
 * failure isolation filters those out before calling this; this function's
 * contract is "every buffer given to it merges".
 */
export async function mergeReportCardBulkPdf(
  buffers: readonly Buffer[],
  duplex: boolean
): Promise<ReportCardBulkMergeResult> {
  const merged = await PDFDocument.create()
  const pageRanges: ReportCardBulkPageRange[] = []
  let cumulative = 0

  for (const source of buffers) {
    const doc = await PDFDocument.load(source)
    const copiedPages = await merged.copyPages(doc, doc.getPageIndices())
    const from = cumulative + 1
    copiedPages.forEach((page) => merged.addPage(page))
    cumulative += copiedPages.length
    pageRanges.push({ from, to: cumulative })

    if (duplex && cumulative % 2 !== 0) {
      merged.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])
      cumulative += 1
    }
  }

  const bytes = await merged.save()
  return { buffer: Buffer.from(bytes), pageCount: cumulative, pageRanges }
}
