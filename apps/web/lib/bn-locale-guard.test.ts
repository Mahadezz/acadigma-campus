import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * DESIGN-SYSTEM §1.6: digits default to Western (0-9) everywhere, including
 * in বাংলা UI — Bengali numerals are opt-in only, on `MoneyText`/`BnEnText`'s
 * own `numerals="bn"` prop for printed report cards. Calling
 * `Intl.NumberFormat`/`Intl.DateTimeFormat` with the bare `"bn-BD"` tag
 * renders Bengali digits by default (its own CLDR numbering system), so
 * every other call site must use `toIntlLocale("bn")` (`lib/locale.ts`,
 * `"bn-BD-u-nu-latn"`) instead — this guards against a bare `"bn-BD"`
 * string literal creeping back in anywhere outside the two components that
 * are allowed to choose the digit script on purpose.
 */
// apps/web/lib -> apps/web -> apps -> repo root. `engines.node >=24`
// (package.json), so `import.meta.dirname` (Node 21+) needs no polyfill.
const ROOT = path.resolve(import.meta.dirname, "../../..")
const SCAN_DIRS = ["apps/web", "packages"]
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "dist",
  ".turbo",
  "coverage",
  ".worktrees",
])
const ALLOWED_FILES = new Set([
  "packages/ui/src/primitives/money-text.tsx",
  "packages/ui/src/primitives/money-text.test.tsx",
  "packages/ui/src/primitives/bn-en-text.tsx",
  "packages/ui/src/primitives/bn-en-text.test.tsx",
])
const BARE_BN_BD = /["']bn-BD["']/

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
}

/** Strips comments so a docs mention of `"bn-BD"` doesn't trip the guard. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
}

describe("no bare bn-BD locale tag outside MoneyText/BnEnText", () => {
  it("scans apps/web and packages for the offending literal", () => {
    const files: string[] = []
    for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir), files)

    const offenders = files
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .filter((rel) => !ALLOWED_FILES.has(rel))
      .filter((rel) =>
        BARE_BN_BD.test(
          stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"))
        )
      )

    expect(offenders).toEqual([])
  })
})
