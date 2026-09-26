import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const mockSave = vi.fn()
vi.mock("../actions", () => ({
  saveAttendanceSession: (...a: unknown[]) => mockSave(...a),
}))

const { RollCall, saveErrorText } = await import("./roll-call")

const students = [1, 2, 3].map((n) => ({
  studentId: `00000000-0000-4000-8000-00000000000${n}`,
  rollNumber: n,
  fullName: `Student ${n}`,
  fullNameBn: `ছাত্র ${n}`,
  status: null,
}))

const BASE = {
  t: en.attendance.roll,
  locale: "en" as const,
  sectionId: "33333333-3333-4333-8333-333333333333",
  title: "Class 6 – ক",
  date: "2026-09-25",
  dateLabel: "25 Sept 2026",
  isSchoolDay: true,
  students,
  sessionUpdatedAt: null,
  readOnlyReason: null,
}

beforeEach(() => {
  mockSave.mockReset()
  mockSave.mockResolvedValue({
    ok: true,
    data: { sessionId: "s", updatedAt: "t", present: 2, absent: 1 },
  })
})

describe("RollCall", () => {
  it("opens with everyone unmarked and Save disabled (D-22)", () => {
    render(<RollCall {...BASE} />)
    expect(screen.getByText("3 unmarked")).toBeTruthy()
    expect(
      (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.getAttribute("aria-checked")).toBe("false")
    }
  })

  it("marks all present, flips one to absent, saves with the bulk stamp", async () => {
    render(<RollCall {...BASE} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    const absent = screen
      .getByRole("radiogroup", { name: "Student 2" })
      .querySelector('[aria-label="Absent"]') as HTMLButtonElement
    fireEvent.click(absent)
    expect(screen.getByText("P 2 · A 1 · L 0")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalled())
    expect(mockSave.mock.calls[0]?.[0]).toMatchObject({
      bulkMarked: true,
      records: [
        { studentId: students[0]!.studentId, status: "present" },
        { studentId: students[1]!.studentId, status: "absent" },
        { studentId: students[2]!.studentId, status: "present" },
      ],
    })
  })

  it("does not re-stamp bulk marking on the next save after a successful one", async () => {
    render(<RollCall {...BASE} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    await screen.findByRole("button", { name: "Save" })
    const absent = screen
      .getByRole("radiogroup", { name: "Student 1" })
      .querySelector('[aria-label="Absent"]') as HTMLButtonElement
    fireEvent.click(absent)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2))
    expect(mockSave.mock.calls[0]?.[0]).toMatchObject({ bulkMarked: true })
    expect(mockSave.mock.calls[1]?.[0]).toMatchObject({
      bulkMarked: false,
      expectedUpdatedAt: "t",
    })
  })

  it("undo returns to unmarked and drops the bulk stamp", () => {
    render(<RollCall {...BASE} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(screen.getByText("3 unmarked")).toBeTruthy()
  })

  it("needs a confirmation on a non-school day", () => {
    render(<RollCall {...BASE} isSchoolDay={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    const save = screen.getByRole("button", {
      name: "Save",
    }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(screen.getByRole("checkbox"))
    expect(save.disabled).toBe(false)
  })

  it("is read-only for someone who may not mark", () => {
    render(<RollCall {...BASE} readOnlyReason="cannotMark" />)
    expect(screen.getByText(en.attendance.roll.readOnlyCannotMark)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Mark all present" })
    ).toBeNull()
  })

  it("speaks Bangla with the Bangla names", () => {
    render(<RollCall {...BASE} t={bn.attendance.roll} locale="bn" />)
    expect(screen.getByRole("button", { name: "সবাই উপস্থিত" })).toBeTruthy()
    expect(screen.getByRole("radiogroup", { name: "ছাত্র 1" })).toBeTruthy()
  })
})

describe("RollCall — basic mode (F-ID-10 Part 3)", () => {
  const basicCopy = en.basicMode.classHub.attendance

  it("confirms the plain sentence with counts before saving, and saves nothing until Yes, save", async () => {
    render(<RollCall {...BASE} basic basicCopy={basicCopy} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    const absent = screen
      .getByRole("radiogroup", { name: "Student 2" })
      .querySelector('[aria-label="Absent"]') as HTMLButtonElement
    fireEvent.click(absent)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(mockSave).not.toHaveBeenCalled()
    // ConfirmSheet renders the sentence as both its visible title and a
    // sr-only description (same pattern HelpSheet already uses), so two
    // matches is correct here, not a bug.
    expect(
      screen.getAllByText(
        "Save attendance for Class 6 – ক? 2 present, 1 absent."
      )
    ).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  })

  it("Go back closes the sheet without saving", () => {
    render(<RollCall {...BASE} basic basicCopy={basicCopy} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Go back" }))
    expect(mockSave).not.toHaveBeenCalled()
  })

  it("offers Undo after editing an already-saved session, and Undo re-saves the previous values as one edit", async () => {
    render(
      <RollCall {...BASE} sessionUpdatedAt="t0" basic basicCopy={basicCopy} />
    )
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    await screen.findByText(basicCopy.undoToast)
    // The Undo button is disabled while a save transition is in flight; wait
    // for the first save's `pending` flag to actually clear before clicking,
    // rather than racing it (flaky under a slower/instrumented test run).
    const undoButton = screen.getByRole("button", {
      name: basicCopy.undo,
    }) as HTMLButtonElement
    await vi.waitFor(() => expect(undoButton.disabled).toBe(false))

    fireEvent.click(undoButton)
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2))
    // The undo re-save carries the ORIGINAL (all-unmarked) statuses, not the
    // values this save just wrote — restoring what was on the server before.
    expect(mockSave.mock.calls[1]?.[0]).toMatchObject({
      records: students.map((s) => ({ studentId: s.studentId, status: null })),
    })
  })

  it("never offers Undo on a first save (nothing to go back to)", async () => {
    render(<RollCall {...BASE} basic basicCopy={basicCopy} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(basicCopy.undoToast)).toBeNull()
  })
})

describe("saveErrorText", () => {
  it("maps codes and read-only mode to copy", () => {
    const t = en.attendance.roll
    expect(
      saveErrorText(t, {
        code: "conflict",
        message: "x",
        fieldErrors: { _root: ["CONFLICT"] },
      })
    ).toBe(t.errors.CONFLICT)
    expect(saveErrorText(t, { code: "payment_required", message: "x" })).toBe(
      t.errors.readOnly
    )
    expect(saveErrorText(t, { code: "internal", message: "x" })).toBe(
      t.errors.generic
    )
  })
})
