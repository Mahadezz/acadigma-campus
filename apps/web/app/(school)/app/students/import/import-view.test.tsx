import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { StudentImportBatch } from "@acadigma/contracts"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock("./actions", () => ({
  previewStudentImport: vi.fn(),
  commitStudentImport: vi.fn(),
}))

const { ImportView, importErrorText } = await import("./import-view")

const INPUT = {
  first_name: "Rahim",
  last_name: "Uddin",
  full_name_bn: null,
  gender: "male" as const,
  date_of_birth: "2014-03-09",
  section_id: "6a1d3b2f-9c8e-4d4b-8f70-2b3c4d5e6f7a",
  roll_number: null,
  guardian: {
    relation: "father",
    full_name: "Karim Uddin",
    full_name_bn: null,
    phone: "+8801000000001",
  },
}

const batch: StudentImportBatch = {
  id: "7b2e4c3a-0d9f-4e5c-9a81-3c4d5e6f7a8b",
  filename: "register.xlsx",
  status: "preview",
  totalRows: 2,
  validRows: 1,
  errorRows: 1,
  createdCount: 0,
  createdAt: "2026-09-26T00:00:00Z",
  finishedAt: null,
  report: {
    ignoredColumns: ["Religion"],
    rows: [
      { line: 2, status: "valid", errors: [], input: INPUT },
      {
        line: 3,
        status: "error",
        errors: [{ column: "date_of_birth", code: "invalid_date" }],
        raw: { date_of_birth: "31/02/2014" },
      },
    ],
  },
}

describe("ImportView", () => {
  it("offers the template and an upload before a file is checked", () => {
    render(
      <ImportView t={en.students.import} batch={null} loadFailed={false} />
    )
    expect(
      screen
        .getByRole("link", { name: /Download template/ })
        .getAttribute("href")
    ).toBe("/app/students/import/template")
    expect(screen.getByLabelText("Excel (.xlsx) or CSV file")).toBeTruthy()
  })

  it("previews counts and each bad row with its line and cell", () => {
    render(
      <ImportView t={en.students.import} batch={batch} loadFailed={false} />
    )
    expect(screen.getByTestId("import-summary").textContent).toContain(
      "2 rows · 1 ready · 1 with problems"
    )
    expect(screen.getByText("Line 3")).toBeTruthy()
    expect(
      screen.getByText(
        "Date of birth: not a real date — use 2014-03-09 or 09/03/2014 (“31/02/2014”)"
      )
    ).toBeTruthy()
    expect(screen.getByText(/Religion/)).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Import 1 students" })
    ).toBeTruthy()
  })

  it("shows the result and the refused rows after the import, in Bangla too", () => {
    const done: StudentImportBatch = {
      ...batch,
      status: "completed",
      createdCount: 1,
      report: {
        ignoredColumns: [],
        rows: [
          {
            ...batch.report.rows[0]!,
            status: "created",
            student_code: "STU-2026-00001",
          },
          {
            line: 4,
            status: "failed",
            errors: [{ column: null, code: "ROLL_TAKEN" }],
          },
        ],
      },
    }
    render(
      <ImportView t={bn.students.import} batch={done} loadFailed={false} />
    )
    expect(screen.getByText("1 জন শিক্ষার্থী আমদানি হয়েছে।")).toBeTruthy()
    expect(
      screen.getByText("এই শাখায় রোল নম্বরটি আগেই নেওয়া হয়েছে।")
    ).toBeTruthy()
  })

  it("explains file and import errors in plain words", () => {
    const t = en.students.import
    expect(
      importErrorText(t, {
        code: "validation_failed",
        message: "x",
        fieldErrors: { file: ["missing_columns"], columns: ["guardian_phone"] },
      })
    ).toBe(
      "These columns are missing: Guardian's mobile. Start from the template."
    )
    expect(importErrorText(t, { code: "payment_required", message: "x" })).toBe(
      t.errors.readOnly
    )
    expect(importErrorText(t, { code: "conflict", message: "x" })).toBe(
      t.errors.expired
    )
    expect(importErrorText(t, { code: "internal", message: "x" })).toBe(
      t.errors.generic
    )
  })
})
