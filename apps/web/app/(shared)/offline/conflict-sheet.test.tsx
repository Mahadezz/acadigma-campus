import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OutboxItem } from "@/lib/offline/outbox"
import en from "@/messages/en.json"

// FormSheet picks Sheet vs Dialog with matchMedia; jsdom has none.
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}))

/**
 * F-ID-11 §4.5 (D-310), AC-4: only the students whose status differs are
 * shown; nothing is written until she chooses; her picks go out on the
 * colleague's version; Keep theirs deletes only her item.
 */

const getAttendanceConflict = vi.fn()
vi.mock("@/app/(school)/app/attendance/actions", () => ({
  getAttendanceConflict: (input: unknown) => getAttendanceConflict(input),
}))
const resolveItem = vi.fn(async (..._args: unknown[]) => undefined)
const deleteItem = vi.fn(async (..._args: unknown[]) => undefined)
vi.mock("@/lib/offline/outbox-client", () => ({
  resolveItem: (...args: unknown[]) => resolveItem(...args),
  deleteItem: (...args: unknown[]) => deleteItem(...args),
}))

const { ConflictSheet } = await import("./conflict-sheet")

const THEIRS = "2026-09-27T03:12:00.000Z"

const item = {
  id: "i1",
  userId: "u1",
  workspaceId: "w1",
  kind: "attendance.save",
  entityKey: "attendance:s:2026-09-27",
  payload: {
    idempotencyKey: "k-old",
    sectionId: "s",
    date: "2026-09-27",
    records: [
      { studentId: "a", status: "absent" },
      { studentId: "b", status: "present" },
      { studentId: "c", status: "late" },
    ],
    bulkMarked: false,
    allowNonSchoolDay: false,
    expectedUpdatedAt: "v1",
    capturedAt: "2026-09-27T02:55:00.000Z",
  },
  summary: "Attendance · 6 – ক",
  detail: "",
  createdAt: 1,
  attempts: 1,
  status: "conflict",
  lastError: null,
} as OutboxItem

beforeEach(() => {
  vi.clearAllMocks()
  getAttendanceConflict.mockResolvedValue({
    ok: true,
    data: {
      updatedAt: THEIRS,
      takenByName: "Nadia Rahman",
      students: [
        {
          studentId: "a",
          fullName: "Amina",
          fullNameBn: null,
          status: "present",
        },
        {
          studentId: "b",
          fullName: "Babul",
          fullNameBn: null,
          status: "present",
        },
        {
          studentId: "c",
          fullName: "Chaya",
          fullNameBn: null,
          status: "absent",
        },
      ],
    },
  })
})

const open = () =>
  render(
    <ConflictSheet
      item={item}
      userId="u1"
      copy={en.offline}
      locale="en"
      open
      onOpenChange={() => {}}
    />
  )

describe("ConflictSheet", () => {
  it("shows only the differing students and writes nothing on open", async () => {
    open()
    expect(await screen.findByText("Amina")).toBeTruthy()
    expect(screen.getByText("Chaya")).toBeTruthy()
    expect(screen.queryByText("Babul")).toBeNull()
    expect(screen.getByText(/Nadia Rahman/)).toBeTruthy()
    expect(resolveItem).not.toHaveBeenCalled()
    expect(deleteItem).not.toHaveBeenCalled()
  })

  it("Save my choices: her pick for one student, theirs for the rest, on their version", async () => {
    open()
    await screen.findByText("Chaya")
    const chaya = screen.getAllByRole("listitem")[1] as HTMLElement
    fireEvent.click(within(chaya).getByText(en.offline.mine))
    fireEvent.click(
      screen.getByRole("button", { name: en.offline.saveChoices })
    )
    await waitFor(() => expect(resolveItem).toHaveBeenCalledTimes(1))
    expect(resolveItem).toHaveBeenCalledWith(
      "u1",
      "i1",
      [
        { studentId: "a", status: "present" },
        { studentId: "b", status: "present" },
        { studentId: "c", status: "late" },
      ],
      THEIRS
    )
  })

  it("Use mine re-sends all of hers on their version", async () => {
    open()
    fireEvent.click(
      await screen.findByRole("button", { name: en.offline.useMine })
    )
    await waitFor(() => expect(resolveItem).toHaveBeenCalledTimes(1))
    expect(resolveItem).toHaveBeenCalledWith(
      "u1",
      "i1",
      item.payload.records,
      THEIRS
    )
  })

  it("Keep theirs deletes only her item", async () => {
    open()
    fireEvent.click(
      await screen.findByRole("button", { name: en.offline.keepTheirs })
    )
    await waitFor(() => expect(deleteItem).toHaveBeenCalledWith("u1", "i1"))
    expect(resolveItem).not.toHaveBeenCalled()
  })

  it("a register it cannot read offers no save", async () => {
    getAttendanceConflict.mockResolvedValue({
      ok: false,
      error: { code: "forbidden", message: "" },
    })
    open()
    expect(await screen.findByText(en.offline.conflictLoadFailed)).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: en.offline.useMine })
    ).toBeNull()
  })
})
