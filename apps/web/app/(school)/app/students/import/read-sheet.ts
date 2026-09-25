import "server-only"

import { unzipSync } from "fflate"
import Papa from "papaparse"
import { readSheet as readXlsx } from "read-excel-file/node"

import {
  STUDENT_IMPORT_MAX_BYTES,
  type ImportFileErrorCode,
} from "@acadigma/contracts"

const BOM = String.fromCharCode(0xfeff)

/** Zip-bomb guard: a 1 MB .xlsx may not unpack past these. */
const MAX_ENTRY_BYTES = 10_000_000
const MAX_TOTAL_BYTES = 20_000_000
const KEEP = /^xl\/(workbook|styles|sharedStrings|worksheets\/[^/]+)\.xml$/

class TooLarge extends Error {}

/** Reads every entry's declared unpacked size before anything else touches
 * the zip, and unpacks only the parts a sheet needs. Throws TooLarge. */
function checkUnpackedSize(bytes: Uint8Array): void {
  let total = 0
  unzipSync(bytes, {
    filter(entry) {
      total += entry.originalSize
      if (entry.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) {
        throw new TooLarge()
      }
      return KEEP.test(entry.name)
    },
  })
}

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
      const bytes = Buffer.from(await file.arrayBuffer())
      checkUnpackedSize(bytes)
      // A Buffer, never a string: read-excel-file treats a string as a path.
      const rows = await readXlsx(bytes)
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
  } catch (error) {
    return { fileError: error instanceof TooLarge ? "too_large" : "unreadable" }
  }
  return { fileError: "wrong_type" }
}
