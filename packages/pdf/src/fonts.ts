/**
 * F-OP-03 §3.6 — Inter (Latin + every digit) and Hind Siliguri (Bengali)
 * embedded straight from disk, registered once with `@react-pdf/renderer`'s
 * `Font.register`. DESIGN-SYSTEM §1.6 is the source of truth for *which*
 * fonts the product uses everywhere, screen or paper — Hind Siliguri, not
 * the spec's original Noto Sans Bengali default, so a printed report reads
 * as the same product as the app and acadigma-website (D-204).
 *
 * `@react-pdf/renderer` embeds through `fontkit`, which (like PDFKit under
 * it) subsets the embedded font program to the glyphs a given document
 * actually uses — the spec's "subset to the Unicode ranges actually used"
 * happens per rendered PDF for free; there is no separate build-time
 * subsetting step to run or maintain.
 *
 * Hyphenation is disabled: `@react-pdf/renderer`'s default Latin hyphenation
 * breaks Bengali conjuncts (যুক্তাক্ষর) apart mid-word.
 */
import { fileURLToPath } from "node:url"

import { Font } from "@react-pdf/renderer"

/**
 * `Font.register`'s `src` wants a file path (or a data/remote URL) — it hands
 * unrecognised strings straight to `fontkit.open(path)`, which reads the file
 * itself. Resolved as an absolute path rather than imported as a bundler
 * asset module: this package is loaded from plain Node (vitest) and from a
 * Next.js Node runtime route (F-OP-03 §7 — deliberately not Edge), never
 * from client webpack, so there is no asset loader to depend on in either
 * case. The literal, static `new URL('../assets/...')` shape is what Next's
 * file tracer needs to see to bundle these fonts into the deployed function.
 */
function fontPath(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url))
}

const interRegular = fontPath("../assets/fonts/Inter-Regular.ttf")
const interSemiBold = fontPath("../assets/fonts/Inter-SemiBold.ttf")
const hindSiliguriRegular = fontPath("../assets/fonts/HindSiliguri-Regular.ttf")
const hindSiliguriSemiBold = fontPath(
  "../assets/fonts/HindSiliguri-SemiBold.ttf"
)

export const FONT_INTER = "Inter"
export const FONT_HIND_SILIGURI = "HindSiliguri"

let registered = false

/**
 * Idempotent: safe to call at the top of every render. `Font.register` keeps
 * a module-level registry inside `@react-pdf/renderer` itself, but guarding
 * here too avoids re-reading the font buffers from disk on every call.
 */
export function registerFonts(): void {
  if (registered) return

  Font.register({
    family: FONT_INTER,
    fonts: [
      { src: interRegular, fontWeight: 400 },
      { src: interSemiBold, fontWeight: 600 },
    ],
  })

  Font.register({
    family: FONT_HIND_SILIGURI,
    fonts: [
      { src: hindSiliguriRegular, fontWeight: 400 },
      { src: hindSiliguriSemiBold, fontWeight: 600 },
    ],
  })

  // One word -> itself: no hyphenation break points anywhere. Applies
  // globally (there is no per-family hook in @react-pdf/renderer), which is
  // fine here — no template in this product wants English hyphenation either
  // (DESIGN-SYSTEM's tabular, records-office register never breaks a word
  // across a line).
  Font.registerHyphenationCallback((word) => [word])

  registered = true
}

/** Test-only: lets a test re-register into a fresh `@react-pdf/renderer` font registry. */
export function __resetFontRegistrationForTests(): void {
  registered = false
}
