/**
 * F-OP-03 §3.4 / §9 acceptance criterion 1 — "no report template may contain
 * a hardcoded school name, address or logo... enforced by a CI test that
 * greps `packages/pdf` for the banned strings." This is that test: it scans
 * every source file in this package (never `node_modules`, never `dist`) for
 * the Base44 and placeholder names Base44's report engines hardcoded.
 */
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const SRC_DIR = fileURLToPath(new URL(".", import.meta.url))

const BANNED_STRINGS = [
  "TeachFlow",
  "School Troop",
  "Acadigma Academy",
] as const

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(full)))
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      // Test files legitimately reference the banned strings as literals
      // (this file's own BANNED_STRINGS, golden.test.ts's "must not
      // contain" assertions) — only *product* source is scanned.
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(full)
    }
  }
  return files
}

describe("packages/pdf contains no hardcoded school identity", () => {
  it("no source file mentions a banned placeholder school name", async () => {
    const files = await listSourceFiles(SRC_DIR)
    const offenders: string[] = []
    for (const file of files) {
      const source = await readFile(file, "utf8")
      for (const banned of BANNED_STRINGS) {
        if (source.includes(banned)) offenders.push(`${file}: "${banned}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})
