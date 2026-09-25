/**
 * Byte-level integrity of a rendered PDF (F-OP-03 §11, 2026-09-26): every
 * FlateDecode stream must inflate with node:zlib, and the text layer must
 * carry a Bengali word. Guards against anything between the renderer and the
 * bytes on disk (bundling, a Buffer/string conversion) silently corrupting the
 * streams — a PDF that opens in one viewer and fails in another.
 */
import { inflateSync } from "node:zlib"

import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { describe, expect, it } from "vitest"

import { renderPdfToBuffer } from "./render"
import { SampleDocument } from "./templates/sample"

/** Inflates every `/FlateDecode` stream; throws on the first one zlib rejects. */
function inflateAllStreams(pdf: Buffer): number {
  const text = pdf.toString("latin1")
  const header = /<<((?:(?!>>\s*stream)[\s\S])*?)>>\s*stream\r?\n/g
  let count = 0
  for (let m = header.exec(text); m; m = header.exec(text)) {
    const dict = m[1] ?? ""
    if (!dict.includes("/FlateDecode")) continue
    const length = Number(/\/Length (\d+)/.exec(dict)?.[1])
    inflateSync(
      pdf.subarray(m.index + m[0].length, m.index + m[0].length + length)
    )
    count++
  }
  return count
}

async function renderSample(): Promise<Buffer> {
  return renderPdfToBuffer(
    SampleDocument({
      locale: "bn",
      schoolName: "আদর্শ উচ্চ বিদ্যালয়",
      headerLines: [],
      accentColor: null,
      footerNote: null,
      generatedAt: new Date("2026-09-26T00:00:00.000Z"),
    })
  )
}

describe("rendered PDF bytes", () => {
  it("inflates every FlateDecode stream and carries Bengali text", async () => {
    const pdf = await renderSample()
    expect(inflateAllStreams(pdf)).toBeGreaterThan(0)
    const text = (await pdfParse(pdf)).text
    expect(text).toContain("নমুনা")
    // The danda is drawn in Hind Siliguri, not Inter's tofu box.
    expect(text).toContain("।")
  })

  it("rejects bytes that went through a UTF-8 string round trip", async () => {
    const pdf = await renderSample()
    const mangled = Buffer.from(pdf.toString("utf8"), "latin1")
    expect(() => inflateAllStreams(mangled)).toThrow(/incorrect header check/)
  })
})
