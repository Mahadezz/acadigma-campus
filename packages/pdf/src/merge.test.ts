import { PDFDocument } from "pdf-lib"
import { describe, expect, it } from "vitest"

import { mergeReportCardBulkPdf } from "./merge"

/** A minimal valid one-document PDF with `pageCount` blank pages, for
 * exercising the merge/duplex-padding algorithm without paying for a real
 * `@react-pdf/renderer` render per case. */
async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([595.28, 841.89])
  return Buffer.from(await doc.save())
}

async function loadedPageCount(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer)
  return doc.getPageCount()
}

describe("mergeReportCardBulkPdf", () => {
  it("merges N one-page documents into one N-page PDF, in order, no duplex", async () => {
    const buffers = await Promise.all([makePdf(1), makePdf(1), makePdf(1)])
    const result = await mergeReportCardBulkPdf(buffers, false)

    expect(result.pageCount).toBe(3)
    expect(await loadedPageCount(result.buffer)).toBe(3)
    expect(result.pageRanges).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 2 },
      { from: 3, to: 3 },
    ])
  })

  it("duplex-pads a run of one-page cards so every card starts on an odd page (2x the input count)", async () => {
    const buffers = await Promise.all([makePdf(1), makePdf(1), makePdf(1)])
    const result = await mergeReportCardBulkPdf(buffers, true)

    // Every card is 1 content page + 1 blank pad, including the last —
    // §4 W2's `duplex_friendly`: each student's block is a whole number of
    // physical sheets, never sharing one with the next student.
    expect(result.pageCount).toBe(6)
    expect(await loadedPageCount(result.buffer)).toBe(6)
    expect(result.pageRanges).toEqual([
      { from: 1, to: 1 },
      { from: 3, to: 3 },
      { from: 5, to: 5 },
    ])
    // Every range's `from` is odd.
    for (const range of result.pageRanges) {
      expect(range.from % 2).toBe(1)
    }
  })

  it("40 one-page cards duplex-pad to exactly 80 pages (spec verification budget)", async () => {
    const buffers = await Promise.all(
      Array.from({ length: 40 }, () => makePdf(1))
    )
    const result = await mergeReportCardBulkPdf(buffers, true)
    expect(result.pageCount).toBe(80)
  })

  it("does not pad a two-page card that already lands the next card on an odd page", async () => {
    const buffers = await Promise.all([makePdf(2), makePdf(1)])
    const result = await mergeReportCardBulkPdf(buffers, true)

    // Card 1: pages 1-2 (even total, no pad needed). Card 2 already starts
    // odd (page 3): pages 3-3, then pads to keep the invariant for any card
    // that might follow.
    expect(result.pageRanges).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 3 },
    ])
    expect(result.pageCount).toBe(4)
  })

  it("no padding at all when duplex is off, regardless of odd/even page counts", async () => {
    const buffers = await Promise.all([makePdf(1), makePdf(3), makePdf(1)])
    const result = await mergeReportCardBulkPdf(buffers, false)

    expect(result.pageRanges).toEqual([
      { from: 1, to: 1 },
      { from: 2, to: 4 },
      { from: 5, to: 5 },
    ])
    expect(result.pageCount).toBe(5)
  })

  it("returns pageCount 0 and no ranges for zero input buffers (never hit in practice — the caller only calls this with at least one rendered student)", async () => {
    const result = await mergeReportCardBulkPdf([], true)
    expect(result.pageCount).toBe(0)
    expect(result.pageRanges).toEqual([])
    // Not asserted via `loadedPageCount`: pdf-lib's own save/load round trip
    // reports 1 page for a truly zero-page document (a pdf-lib quirk, not
    // this function's accounting) — `result.pageCount` above is this
    // function's own count and is what every real caller relies on.
  })
})
