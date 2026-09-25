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
import { Font } from "@react-pdf/renderer"

import {
  HIND_SILIGURI_REGULAR_TTF_BASE64,
  HIND_SILIGURI_SEMIBOLD_TTF_BASE64,
  INTER_REGULAR_TTF_BASE64,
  INTER_SEMIBOLD_TTF_BASE64,
} from "./fonts.generated"

/**
 * `Font.register`'s `src` also accepts a `data:` URL — `@react-pdf/font`
 * decodes it in memory (`fontkit.create`), no file read at all. Passed as a
 * base64-embedded constant rather than a file path: a path resolved from
 * `import.meta.url` (even one Next's file tracer is told to include) bakes
 * the *build machine's* absolute path into the compiled route, which does
 * not exist on Vercel's filesystem at request time — this is what actually
 * failed in production (every `/api/pdf/[runId]` render 500ing). A data URL
 * has no path to get wrong in the first place, and works identically in
 * vitest, `next build`, and on Vercel.
 */
function fontDataUrl(base64: string): string {
  return `data:font/ttf;base64,${base64}`
}

const interRegular = fontDataUrl(INTER_REGULAR_TTF_BASE64)
const interSemiBold = fontDataUrl(INTER_SEMIBOLD_TTF_BASE64)
const hindSiliguriRegular = fontDataUrl(HIND_SILIGURI_REGULAR_TTF_BASE64)
const hindSiliguriSemiBold = fontDataUrl(HIND_SILIGURI_SEMIBOLD_TTF_BASE64)

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
