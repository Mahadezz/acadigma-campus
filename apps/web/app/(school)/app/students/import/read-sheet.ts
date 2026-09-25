import "server-only"

import { unzipSync, zipSync } from "fflate"
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
const KEEP =
  /^(\[Content_Types\]\.xml|_rels\/\.rels|xl\/_rels\/workbook\.xml\.rels|xl\/(workbook|styles|sharedStrings|worksheets\/[^/]+)\.xml)$/

class TooLarge extends Error {}

/** Zip-bomb guard: unpacks only the parts a sheet needs, from the central
 * directory, each into a buffer of its declared size (fflate never writes
 * past it, so a lying size truncates rather than expands), refusing
 * declared sizes over the caps. Returns a fresh zip of just those parts:
 * read-excel-file never sees the uploaded bytes, so an entry hidden from the
 * central directory is simply gone. Throws TooLarge. */
function safeXlsx(bytes: Uint8Array): Buffer {
  let total = 0
  const entries = unzipSync(bytes, {
    filter(entry) {
      total += entry.originalSize
      if (entry.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) {
        throw new TooLarge()
      }
      return KEEP.test(entry.name)
    },
  })
  return Buffer.from(zipSync(entries))
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
      const bytes = safeXlsx(new Uint8Array(await file.arrayBuffer()))
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
