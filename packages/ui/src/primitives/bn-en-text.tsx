import * as React from "react"

import { cn } from "../lib/utils"

/**
 * Renders a mixed Bengali/English string with the correct `lang` attribute on
 * each run (DESIGN-SYSTEM §4.13, §7.1 "`lang` is correct per text run — Bengali
 * announced by a Bengali voice"). Every user-generated name — a student's, a
 * school's, a teacher's — goes through this component rather than being
 * printed as plain text, because the font (`--font-bn` vs `--font-sans`), line
 * height and screen-reader voice all depend on getting this right per run, not
 * once for the whole page.
 *
 * The whole thing is `<bdi>`-wrapped so a Bengali run embedded in a
 * right-to-left neighbour (an Arabic name, say) is never reordered by it.
 */

const BENGALI_SCRIPT = /[ঀ-৿]/
const LATIN_LETTER = /[a-zA-Z]/

type Lang = "bn" | "en"

function scriptOf(char: string): Lang | "neutral" {
  if (BENGALI_SCRIPT.test(char)) return "bn"
  if (LATIN_LETTER.test(char)) return "en"
  return "neutral"
}

export type TextRun = { lang: Lang; text: string }

/**
 * Splits into consecutive same-language runs. A "neutral" character (space,
 * digit, punctuation) joins whichever run it follows, so `"Class 6"` is one
 * English run rather than three — a run boundary should only appear where the
 * script genuinely changes.
 */
export function splitBnEnRuns(text: string): TextRun[] {
  const runs: TextRun[] = []
  let currentLang: Lang | null = null
  let buffer = ""

  for (const char of Array.from(text)) {
    const script = scriptOf(char)
    const lang: Lang = script === "neutral" ? (currentLang ?? "en") : script

    if (currentLang !== null && lang !== currentLang) {
      runs.push({ lang: currentLang, text: buffer })
      buffer = ""
    }
    currentLang = lang
    buffer += char
  }

  if (buffer) runs.push({ lang: currentLang ?? "en", text: buffer })
  return runs
}

const EN_TO_BN_DIGITS: Record<string, string> = {
  "0": "০",
  "1": "১",
  "2": "২",
  "3": "৩",
  "4": "৪",
  "5": "৫",
  "6": "৬",
  "7": "৭",
  "8": "৮",
  "9": "৯",
}
const BN_TO_EN_DIGITS: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_BN_DIGITS).map(([en, bn]) => [bn, en])
)

/** Converts every digit in `text` to the requested numeral system. */
export function applyNumeralPreference(text: string, numerals: Lang): string {
  const map = numerals === "bn" ? EN_TO_BN_DIGITS : BN_TO_EN_DIGITS
  const pattern = numerals === "bn" ? /[0-9]/g : /[০-৯]/g
  return text.replace(pattern, (digit) => map[digit] ?? digit)
}

export type BnEnTextProps = Omit<
  React.ComponentPropsWithoutRef<"bdi">,
  "children"
> & {
  text: string
  /** Converts every digit in `text` before splitting into runs. Omit to leave digits as given. */
  numerals?: Lang
}

export function BnEnText({
  text,
  numerals,
  className,
  ...props
}: BnEnTextProps) {
  const normalized = numerals ? applyNumeralPreference(text, numerals) : text
  const runs = React.useMemo(() => splitBnEnRuns(normalized), [normalized])

  return (
    <bdi className={cn(className)} {...props}>
      {runs.map((run, index) => (
        <span
          key={index}
          lang={run.lang}
          className={run.lang === "bn" ? "font-bn" : "font-sans"}
        >
          {run.text}
        </span>
      ))}
    </bdi>
  )
}
