import { STUDENT_IMPORT_COLUMNS } from "@acadigma/contracts"

/**
 * F-AC-02 §4.7 step 1 (D-106): the template — one header row, English and
 * Bangla, in the order the importer expects. UTF-8 with a BOM so Excel
 * shows the Bangla correctly. No example row: a forgotten one would be
 * imported as a real student; the import page states the formats instead.
 */
export function GET(): Response {
  const header = STUDENT_IMPORT_COLUMNS.map(
    (c) => `"${`${c.en} / ${c.bn}`.replace(/"/g, '""')}"`
  ).join(",")
  return new Response(`${String.fromCharCode(0xfeff)}${header}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="acadigma-student-import-template.csv"',
      "Cache-Control": "no-store",
    },
  })
}
