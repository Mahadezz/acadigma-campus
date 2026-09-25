// @vitest-environment node
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { readSheetFile } from "./read-sheet"

const XLSX = fileURLToPath(
  new URL("../../../../../test/fixtures/student-import.xlsx", import.meta.url)
)

describe("readSheetFile", () => {
  it("reads a CSV with a BOM, a quoted comma and a Bangla name", async () => {
    const csv =
      String.fromCharCode(0xfeff) +
      'first_name,last_name,full_name_bn\r\nRahim,"Uddin, Jr",রহিম উদ্দিন\r\n'
    const rows = await readSheetFile(
      new File([csv], "register.csv", { type: "text/csv" })
    )
    expect(rows).toEqual([
      ["first_name", "last_name", "full_name_bn"],
      ["Rahim", "Uddin, Jr", "রহিম উদ্দিন"],
      [""],
    ])
  })

  it("reads the first sheet of an .xlsx, with a date cell as YYYY-MM-DD", async () => {
    const bytes = await readFile(XLSX)
    const rows = await readSheetFile(new File([bytes], "Register.XLSX"))
    if (!Array.isArray(rows)) throw new Error(rows.fileError)
    expect(rows[1]).toEqual([
      "Rahim",
      "Uddin",
      "রহিম উদ্দিন",
      "2014-03-09",
      "male",
      "Class 6",
      "ক",
      "7",
      "father",
      "Karim Uddin",
      "01000000001",
    ])
  })

  it("refuses no file, a big file, other types and a broken workbook", async () => {
    expect(await readSheetFile(null)).toEqual({ fileError: "no_file" })
    expect(
      await readSheetFile(new File(["x".repeat(1_000_001)], "a.csv"))
    ).toEqual({ fileError: "too_large" })
    expect(await readSheetFile(new File(["x"], "a.pdf"))).toEqual({
      fileError: "wrong_type",
    })
    expect(await readSheetFile(new File(["not a zip"], "a.xlsx"))).toEqual({
      fileError: "unreadable",
    })
  })
})
