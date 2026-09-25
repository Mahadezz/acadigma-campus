/**
 * F-OP-03 §7 — rendering runs in a Node runtime route (`@react-pdf/renderer`
 * needs Node APIs and the font buffers), never Edge and never a headless
 * browser. This is the one call site every route/job uses to turn a document
 * element into PDF bytes.
 */
import type { ReactElement } from "react"

import { renderToBuffer } from "@react-pdf/renderer"

/**
 * `document` is typed as a plain `ReactElement` rather than react-pdf's own
 * `ReactElement<DocumentProps>` — every caller passes a `<ReportShell>`
 * result (always a real `<Document>`), but a function component's JSX
 * return type does not carry that specific prop type through. The cast
 * below is the one place that gap is bridged.
 */
export async function renderPdfToBuffer(
  document: ReactElement
): Promise<Buffer> {
  return renderToBuffer(document as Parameters<typeof renderToBuffer>[0])
}
