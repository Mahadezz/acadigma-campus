// @vitest-environment node
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { zipSync } from "fflate"
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
      "01700000001",
    ])
  })

  it("refuses a zip bomb as too large before parsing it", async () => {
    // 11 MB of zeros packs into a few KB.
    const bomb = zipSync(
      { "xl/worksheets/sheet1.xml": new Uint8Array(11_000_000) },
      { level: 1 }
    )
    expect(bomb.length).toBeLessThan(1_000_000)
    expect(await readSheetFile(new File([bomb], "bomb.xlsx"))).toEqual({
      fileError: "too_large",
    })
    // Three 7 MB entries: each under the entry cap, together over 20 MB.
    const wide = zipSync(
      Object.fromEntries(
        Array.from({ length: 3 }, (_, i) => [
          `xl/media/f${i}.bin`,
          new Uint8Array(7_000_000),
        ])
      ),
      { level: 1 }
    )
    expect(await readSheetFile(new File([wide], "wide.xlsx"))).toEqual({
      fileError: "too_large",
    })
  }, 30_000)

  it("caps an entry that lies about its unpacked size", async () => {
    const zip = zipSync(
      { "xl/worksheets/sheet1.xml": new Uint8Array(20_000_000) },
      { level: 1 }
    )
    const dv = new DataView(zip.buffer)
    dv.setUint32(22, 100, true) // local header: uncompressed size
    for (let i = zip.length - 22; i > 0; i--) {
      if (dv.getUint32(i, true) === 0x02014b50) {
        dv.setUint32(i + 24, 100, true) // central directory: same
        break
      }
    }
    // Truncated to 100 bytes, it is no longer a readable workbook.
    expect(await readSheetFile(new File([zip], "lie.xlsx"))).toEqual({
      fileError: "unreadable",
    })
  }, 30_000)

  it("never unpacks an entry missing from the central directory", async () => {
    const good = new Uint8Array(await readFile(XLSX))
    const dv = new DataView(good.buffer, good.byteOffset, good.byteLength)
    const eocd = good.length - 22
    const cdOffset = dv.getUint32(eocd + 16, true)
    // A 30 MB entry's local header + data, spliced in before the central
    // directory and listed nowhere in it.
    const bomb = zipSync(
      { "xl/worksheets/bomb.xml": new Uint8Array(30_000_000) },
      { level: 1 }
    )
    const bombDv = new DataView(bomb.buffer)
    const bombLocal = bomb.subarray(
      0,
      bombDv.getUint32(bomb.length - 22 + 16, true)
    )
    const spliced = new Uint8Array(good.length + bombLocal.length)
    spliced.set(good.subarray(0, cdOffset), 0)
    spliced.set(bombLocal, cdOffset)
    spliced.set(good.subarray(cdOffset), cdOffset + bombLocal.length)
    new DataView(spliced.buffer).setUint32(
      eocd + bombLocal.length + 16,
      cdOffset + bombLocal.length,
      true
    )
    const rows = await readSheetFile(new File([spliced], "hidden.xlsx"))
    if (!Array.isArray(rows)) throw new Error(rows.fileError)
    expect(rows[1]?.[0]).toBe("Rahim")
  }, 30_000)

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
