import "server-only"

import Papa from "papaparse"
import { readSheet as readXlsx } from "read-excel-file/node"

import {
  STUDENT_IMPORT_MAX_BYTES,
  type ImportFileErrorCode,
} from "@acadigma/contracts"

const BOM = String.fromCharCode(0xfeff)

/**
 * F-AC-02 §4.7 step 2 (D-106): an uploaded register → rows of strings.
 * CSV through papaparse (RFC 4180: quoted commas and line breaks), .xlsx
 * through read-excel-file (first sheet). A date cell becomes YYYY-MM-DD.
 */
export async function readSheetFile(
  file: File | null
): Promise<string[][] | { fileError: ImportFileErrorCode }> {
  if (!file || file.size === 0) return { fileError: "no_file" }
  if (file.size > STUDENT_IMPORT_MAX_BYTES) return { fileError: "too_large" }
  const name = file.name.toLowerCase()
  try {
    if (name.endsWith(".csv")) {
      const text = (await file.text()).replace(new RegExp(`^${BOM}`), "")
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false })
      if (parsed.errors.some((e) => e.type === "Quotes")) {
        return { fileError: "unreadable" }
      }
      return parsed.data
    }
    if (name.endsWith(".xlsx")) {
      // A Buffer, never a string: read-excel-file treats a string as a path.
      const rows = await readXlsx(Buffer.from(await file.arrayBuffer()))
      return rows.map((row) =>
        row.map((cell) =>
          cell === null || cell === undefined
            ? ""
            : cell instanceof Date
              ? cell.toISOString().slice(0, 10)
              : String(cell)
        )
      )
    }
  } catch {
    return { fileError: "unreadable" }
  }
  return { fileError: "wrong_type" }
}
