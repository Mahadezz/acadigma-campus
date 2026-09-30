import { strFromU8, unzipSync } from "fflate"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { buildExportZip } = await import("./workspace-export")

describe("buildExportZip (D-211)", () => {
  it("writes one CSV per table, with a BOM, JSON for nested values and safe formulae", () => {
    const zip = buildExportZip([
      {
        table: "students",
        rows: [
          { id: "s1", name: 'রহিম, "R"', tags: ["a"], note: "=HYPERLINK(1)" },
        ],
      },
      { table: "files", rows: [] },
    ])
    const files = unzipSync(zip)
    expect(Object.keys(files).sort()).toEqual(["files.csv", "students.csv"])

    const bytes = files["students.csv"]!
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const csv = strFromU8(bytes.slice(3))
    const [header, row] = csv.split("\r\n")
    expect(header).toBe("id,name,tags,note")
    expect(row).toBe(`s1,"রহিম, ""R""","[""a""]","'=HYPERLINK(1)"`)
  })
})
