import "server-only"

import { strToU8, zipSync } from "fflate"
import Papa from "papaparse"

/**
 * F-OP-07 Part 6 (D-211): the "export all data" zip — one CSV per table,
 * UTF-8 with a BOM so Excel shows Bangla correctly. Nested values (jsonb,
 * arrays) are written as JSON text. `escapeFormulae` stops a cell such as
 * `=HYPERLINK(...)` from running when the file is opened in a spreadsheet.
 * `files.csv` is the files manifest (metadata only: no bucket exists yet).
 */
export function buildExportZip(
  tables: { table: string; rows: Record<string, unknown>[] }[]
): Uint8Array {
  const entries: Record<string, Uint8Array> = {}
  for (const { table, rows } of tables) {
    const csv = Papa.unparse(
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            value !== null && typeof value === "object"
              ? JSON.stringify(value)
              : value,
          ])
        )
      ),
      { escapeFormulae: true, newline: "\r\n" }
    )
    entries[`${table}.csv`] = strToU8(String.fromCharCode(0xfeff) + csv)
  }
  return zipSync(entries, { level: 6 })
}
