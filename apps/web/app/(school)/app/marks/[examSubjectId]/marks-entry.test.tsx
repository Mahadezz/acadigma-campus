import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

const mockSave = vi.fn()
vi.mock("../actions", () => ({
  saveMarks: (...a: unknown[]) => mockSave(...a),
}))

const { MarksEntry } = await import("./marks-entry")

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`

const SHEET = {
  paperId: "33333333-3333-4333-8333-333333333333",
  examId: "44444444-4444-4444-8444-444444444444",
  examName: "Half-Yearly 2026",
  examStatus: "marks_entry",
  paperStatus: "entering",
  sectionLabel: "Class 6 – A",
  subjectName: "Mathematics",
  subjectNameBn: "গণিত",
  fullMarks: 50,
  passMarks: 16.5,
  rows: [
    {
      studentId: id(1),
      rollNumber: 1,
      fullName: "Ayaan R",
      fullNameBn: "আয়ান",
      status: "entered" as const,
      obtained: 40,
      updatedAt: "t1",
    },
    ...[2, 3, 4].map((n) => ({
      studentId: id(n),
      rollNumber: n,
      fullName: `Student ${n}`,
      fullNameBn: null,
      status: null,
      obtained: null,
      updatedAt: null,
    })),
  ],
}

const BASE = {
  t: en.marks,
  locale: "en" as const,
  sheet: SHEET,
  readOnlyReason: null,
}

const input = (name: RegExp) => screen.getByRole("textbox", { name })

beforeEach(() => {
  mockSave.mockReset()
})

describe("MarksEntry", () => {
  it("shows the saved mark and the progress 1/4", () => {
    render(<MarksEntry {...BASE} />)
    expect((input(/Ayaan R/) as HTMLInputElement).value).toBe("40")
    expect(screen.getByText("1/4")).toBeTruthy()
    expect(screen.getByText("Full marks 50 · pass 16.5")).toBeTruthy()
  })

  it("Enter moves to the next student, so the keypad stays up", () => {
    render(<MarksEntry {...BASE} />)
    const first = input(/Student 2/)
    first.focus()
    fireEvent.keyDown(first, { key: "Enter" })
    expect(document.activeElement).toBe(input(/Student 3/))
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" })
    expect(document.activeElement).toBe(input(/Student 2/))
  })

  it("saves valid rows, keeps an out-of-range row back with an inline error", async () => {
    mockSave.mockResolvedValue({
      ok: true,
      data: {
        saved: 2,
        entered: 3,
        enrolled: 4,
        rejected: [],
        marks: [
          {
            studentId: id(2),
            status: "entered",
            obtained: 45.5,
            updatedAt: "t2",
          },
          {
            studentId: id(3),
            status: "absent",
            obtained: null,
            updatedAt: "t3",
          },
        ],
      },
    })
    render(<MarksEntry {...BASE} />)
    fireEvent.change(input(/Student 2/), { target: { value: "45.5" } })
    const s3 = input(/Student 3/)
    s3.focus()
    fireEvent.keyDown(s3, { key: "a" })
    fireEvent.change(input(/Student 4/), { target: { value: "60" } })
    fireEvent.blur(input(/Student 4/))
    input(/Ayaan R/).focus()

    expect(screen.getByText("More than the full marks (50).")).toBeTruthy()
    expect(input(/Student 4/).getAttribute("aria-invalid")).toBe("true")
    expect(
      screen.getByText("Absent", { selector: "[data-slot=badge]" })
    ).toBeTruthy()
    expect(screen.getByText("3/4")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalled())
    expect(mockSave.mock.calls[0]?.[0]).toMatchObject({
      examSubjectId: SHEET.paperId,
      entries: [
        {
          studentId: id(2),
          status: "entered",
          obtained: 45.5,
          expectedUpdatedAt: null,
        },
        {
          studentId: id(3),
          status: "absent",
          obtained: null,
          expectedUpdatedAt: null,
        },
      ],
    })
    await screen.findByText("Saved.")
  })

  it("shows a server-rejected row inline and still reports the rest saved", async () => {
    mockSave.mockResolvedValue({
      ok: true,
      data: {
        saved: 0,
        entered: 1,
        enrolled: 4,
        rejected: [{ studentId: id(1), issue: "CONFLICT" }],
        marks: [
          {
            studentId: id(1),
            status: "entered",
            obtained: 41,
            updatedAt: "tX",
          },
        ],
      },
    })
    render(<MarksEntry {...BASE} />)
    fireEvent.change(input(/Ayaan R/), { target: { value: "45" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByText(
      "Someone else changed this mark meanwhile. Save again to keep yours, or press Esc to take theirs."
    )
    expect(mockSave.mock.calls[0]?.[0].entries[0].expectedUpdatedAt).toBe("t1")
    // The other person's newer value is not taken over silently.
    expect((input(/Ayaan R/) as HTMLInputElement).value).toBe("45")
    // Saving again names the server's version: a deliberate "keep mine".
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2))
    expect(mockSave.mock.calls[1]?.[0].entries[0]).toMatchObject({
      obtained: 45,
      expectedUpdatedAt: "tX",
    })
  })

  it("Esc after a CONFLICT takes the other person's value", async () => {
    mockSave.mockResolvedValue({
      ok: true,
      data: {
        saved: 0,
        entered: 1,
        enrolled: 4,
        rejected: [{ studentId: id(1), issue: "CONFLICT" }],
        marks: [
          {
            studentId: id(1),
            status: "entered",
            obtained: 41,
            updatedAt: "tX",
          },
        ],
      },
    })
    render(<MarksEntry {...BASE} />)
    fireEvent.change(input(/Ayaan R/), { target: { value: "45" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalled())
    await vi.waitFor(() =>
      expect(input(/Ayaan R/).getAttribute("aria-invalid")).toBe("true")
    )
    fireEvent.keyDown(input(/Ayaan R/), { key: "Escape" })
    expect((input(/Ayaan R/) as HTMLInputElement).value).toBe("41")
  })

  it("a dropped connection keeps every typed mark and the same key", async () => {
    mockSave.mockRejectedValueOnce(new Error("Failed to fetch"))
    render(<MarksEntry {...BASE} />)
    fireEvent.change(input(/Student 2/), { target: { value: "30" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await screen.findByText(en.marks.errors.generic)
    expect((input(/Student 2/) as HTMLInputElement).value).toBe("30")
    mockSave.mockResolvedValueOnce({
      ok: true,
      data: { saved: 1, entered: 2, enrolled: 4, rejected: [], marks: [] },
    })
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2))
    expect(mockSave.mock.calls[1]?.[0].idempotencyKey).toBe(
      mockSave.mock.calls[0]?.[0].idempotencyKey
    )
  })

  it("Ctrl+A selects the text; it does not mark the student absent", () => {
    render(<MarksEntry {...BASE} />)
    fireEvent.keyDown(input(/Ayaan R/), { key: "a", ctrlKey: true })
    fireEvent.keyDown(input(/Ayaan R/), { key: "e", metaKey: true })
    expect((input(/Ayaan R/) as HTMLInputElement).value).toBe("40")
    expect(
      screen.queryByText("Absent", { selector: "[data-slot=badge]" })
    ).toBeNull()
  })

  it("the Absent badge describes the input", () => {
    render(<MarksEntry {...BASE} />)
    fireEvent.keyDown(input(/Student 2/), { key: "a" })
    const describedBy = input(/Student 2/).getAttribute("aria-describedby")
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Absent"
    )
  })

  it("a saved mark cannot be emptied", () => {
    render(<MarksEntry {...BASE} />)
    fireEvent.change(input(/Ayaan R/), { target: { value: "" } })
    input(/Student 2/).focus()
    expect(
      screen.getByText(
        "A saved mark cannot be left empty. Type a mark, or choose Absent or Exempt."
      )
    ).toBeTruthy()
  })

  it("the Absent/Exempt chips act on the focused student", () => {
    render(<MarksEntry {...BASE} />)
    fireEvent.focus(input(/Student 2/))
    expect(screen.getByText("For Student 2:")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: "Exempt" }))
    expect(
      screen.getByText("Exempt", { selector: "[data-slot=badge]" })
    ).toBeTruthy()
  })

  it("a teacher of another subject sees no marks and no inputs", () => {
    render(
      <MarksEntry
        {...BASE}
        sheet={{ ...SHEET, rows: [] }}
        readOnlyReason="notAssigned"
      />
    )
    expect(screen.getByText(en.marks.readOnly.notAssigned)).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
  })

  it("renders in Bangla with Western digits", () => {
    render(<MarksEntry {...BASE} t={bn.marks} locale="bn" />)
    expect(screen.getByText("গণিত · Class 6 – A")).toBeTruthy()
    expect(screen.getByText("পূর্ণ নম্বর 50 · পাস 16.5")).toBeTruthy()
    expect(screen.getByRole("textbox", { name: /আয়ান/ })).toBeTruthy()
    expect(screen.getByText("1/4")).toBeTruthy()
  })
})
