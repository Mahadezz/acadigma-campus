import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/**
 * Test helper: the rows between `-- parity:<name>` and `-- /parity:<name>` in
 * supabase/tests/52_grade_scales.sql, where pgTAP asserts the SQL functions
 * against them. The TS tests assert the domain functions against the SAME rows,
 * so the two implementations cannot drift (F-AC-06 §10 parity tests).
 */
export function parityRows(name: string): string[][] {
  const sql = readFileSync(
    fileURLToPath(
      new URL("../../../../supabase/tests/52_grade_scales.sql", import.meta.url)
    ),
    "utf8"
  )
  const block = new RegExp(`-- parity:${name}\\n([\\s\\S]*?)-- /parity:${name}`)
  const body = block.exec(sql)?.[1]
  if (!body) throw new Error(`no parity:${name} block`)
  return [...body.matchAll(/\(([^)]*)\)/g)].map((m) =>
    (m[1] ?? "").split(",").map((cell) => cell.trim().replace(/^'|'$/g, ""))
  )
}
