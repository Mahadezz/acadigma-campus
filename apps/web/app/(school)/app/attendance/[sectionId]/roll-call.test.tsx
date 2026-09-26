import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const mockSave = vi.fn()
vi.mock("../actions", () => ({
  saveAttendanceSession: (...a: unknown[]) => mockSave(...a),
}))

const mockQueued = vi.fn()
const mockQueueSave = vi.fn()
const mockSendQueued = vi.fn()
vi.mock("@/lib/offline/outbox-client", () => ({
  queuedItem: (...a: unknown[]) => mockQueued(...a),
  queueSave: (...a: unknown[]) => mockQueueSave(...a),
  sendQueued: (...a: unknown[]) => mockSendQueued(...a),
  onOutboxSent: () => () => undefined,
}))
vi.mock("@/app/(shared)/offline/offline-provider", () => ({
  useOfflineCopy: () => () => en.offline,
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
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
}

beforeEach(() => {
  mockSave.mockReset()
  mockQueued.mockReset().mockResolvedValue(undefined)
  mockQueueSave.mockReset().mockResolvedValue("queued")
  mockSendQueued.mockReset().mockResolvedValue(undefined)
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true)
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

describe("RollCall offline (F-ID-11 Part 2a)", () => {
  function markAndSave() {
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
  }

  it("offline: keeps the roll on the phone instead of sending it", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    render(<RollCall {...BASE} />)
    markAndSave()
    await screen.findByText(en.offline.savedOnPhone)
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockQueueSave.mock.calls[0]?.[0]).toMatchObject({
      userId: BASE.userId,
      workspaceId: BASE.workspaceId,
      kind: "attendance.save",
      entityKey: `attendance:${BASE.sectionId}:${BASE.date}`,
      summary: "Attendance · Class 6 – ক · 25 Sept 2026",
      detail: "Everyone present",
      payload: { bulkMarked: true, expectedUpdatedAt: null },
    })
    expect(mockSendQueued).not.toHaveBeenCalled()
  })

  it("a request that never came back is queued under the same key", async () => {
    mockSave.mockRejectedValue(new TypeError("Failed to fetch"))
    render(<RollCall {...BASE} />)
    markAndSave()
    await screen.findByText(en.offline.savedOnPhone)
    expect(mockQueueSave.mock.calls[0]?.[0].payload.idempotencyKey).toBe(
      mockSave.mock.calls[0]?.[0].idempotencyKey
    )
  })

  it("online with an earlier save still waiting: queues behind it, then sends", async () => {
    mockQueued.mockResolvedValue({ payload: { records: [] } })
    render(<RollCall {...BASE} />)
    markAndSave()
    await vi.waitFor(() => expect(mockQueueSave).toHaveBeenCalled())
    expect(mockSave).not.toHaveBeenCalled()
    await vi.waitFor(() =>
      expect(mockSendQueued).toHaveBeenCalledWith(BASE.userId)
    )
  })

  it("says so when the phone's waiting list is full, and keeps the marks", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    mockQueueSave.mockResolvedValue("full")
    render(<RollCall {...BASE} />)
    markAndSave()
    await screen.findByText(en.offline.queueFull)
    expect(screen.queryByText(en.offline.savedOnPhone)).toBeNull()
  })

  it("reopened offline, shows the roll she queued rather than the cached one", async () => {
    mockQueued.mockResolvedValue({
      payload: {
        records: students.map((s) => ({
          studentId: s.studentId,
          status: "absent",
        })),
      },
    })
    render(<RollCall {...BASE} />)
    await screen.findByText(en.offline.savedOnPhone)
    expect(screen.getByText("P 0 · A 3 · L 0")).toBeTruthy()
  })
})
