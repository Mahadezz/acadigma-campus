import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

import type { Marks } from "./roll-call"

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
  useOutbox: () => mockOutbox(),
}))
const mockOutbox = vi.fn()
vi.mock("@/app/(shared)/offline/offline-provider", () => ({
  useOfflineCopy: () => () => en.offline,
}))
// The server is 90 s ahead of this phone's clock.
vi.mock("@/lib/offline/check", () => ({ serverClockOffset: () => 90_000 }))
vi.mock("@/app/(shared)/offline/conflict-sheet", () => ({
  ConflictSheet: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">conflict sheet</div> : null,
}))

const { RollCall, saveErrorText, undoPayload } = await import("./roll-call")

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
  mockOutbox.mockReset().mockReturnValue([])
  // Once queued, the live outbox holds a waiting item for this class.
  mockQueueSave
    .mockReset()
    .mockImplementation(async (d: { entityKey: string }) => {
      mockOutbox.mockReturnValue([
        { entityKey: d.entityKey, status: "pending" },
      ])
      return "queued"
    })
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
    // ConfirmSheet's sr-only description names the two buttons (review fix:
    // it used to repeat this same sentence, so a screen reader said it
    // twice), so exactly one visible match is expected here, not a bug.
    // It's a `next/dynamic({ ssr: false })` import (D-406 addendum — off
    // the route's initial JS, same reason Marks/Students/Print already
    // are), so it mounts one tick after Save.
    expect(
      await screen.findAllByText(
        "Save attendance for Class 6 – ক? 2 present, 1 absent."
      )
    ).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  })

  // LOW 4 review fix (spec §10 coverage gap): the confirm sentence unit
  // coverage above was English-only — this proves `fill()` substitutes the
  // Bangla template's counts the same way, not just that a Bangla string
  // constant exists.
  it("confirms the plain sentence in Bangla with counts before saving", async () => {
    render(
      <RollCall
        {...BASE}
        t={bn.attendance.roll}
        locale="bn"
        basic
        basicCopy={bn.basicMode.classHub.attendance}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "সবাই উপস্থিত" }))
    fireEvent.click(screen.getByRole("button", { name: "সংরক্ষণ" }))
    expect(
      await screen.findAllByText(
        "Class 6 – ক-এর হাজিরা সংরক্ষণ করবেন? 3 জন উপস্থিত, 0 জন অনুপস্থিত।"
      )
    ).toHaveLength(1)
  })

  it("Go back closes the sheet without saving", async () => {
    render(<RollCall {...BASE} basic basicCopy={basicCopy} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Go back" }))
    expect(mockSave).not.toHaveBeenCalled()
  })

  it("offers Undo after editing an already-saved session, and Undo re-saves the previous values as one edit", async () => {
    // MEDIUM 2 review fix: an already-saved session (`sessionUpdatedAt` set)
    // can never have an unmarked student for real — the server rejects an
    // incomplete save (§5.3, "nothing is presumed present") — so the
    // fixture now carries real prior statuses instead of `status: null`,
    // proving Undo's re-save against a payload the server would accept.
    const savedStudents = students.map((s, i) => ({
      ...s,
      status: (["present", "absent", "present"] as const)[i]!,
    }))
    render(
      <RollCall
        {...BASE}
        students={savedStudents}
        sessionUpdatedAt="t0"
        basic
        basicCopy={basicCopy}
      />
    )
    // Edit: Student 2 (absent) -> present.
    const present2 = screen
      .getByRole("radiogroup", { name: "Student 2" })
      .querySelector('[aria-label="Present"]') as HTMLButtonElement
    fireEvent.click(present2)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, save" }))
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
    // The undo re-save carries the ORIGINAL (real, previously-saved)
    // statuses, not the edit this save just wrote — restoring what was on
    // the server before.
    expect(mockSave.mock.calls[1]?.[0]).toMatchObject({
      records: savedStudents.map((s) => ({
        studentId: s.studentId,
        status: s.status,
      })),
    })
  })

  it("Undo keeps a student's CURRENT mark when they joined after the last save (MEDIUM 2, corrected)", async () => {
    // `save_attendance` requires a status for EVERY currently enrolled
    // student (§5.3, `UNMARKED_STUDENTS`) — a student enrolled after the
    // last save has no entry in that save's records, so `lastSavedMarks`
    // seeds `null` for them. Undo cannot omit them (the server would still
    // reject the save, just with a different error) and cannot invent a
    // status they never had; the only sensible restore is their CURRENT
    // mark, which the "mark them so Save is enabled" step below sets.
    const mixedStudents = students.map((s, i) => ({
      ...s,
      status: (["present", "absent", null] as const)[i]!,
    }))
    render(
      <RollCall
        {...BASE}
        students={mixedStudents}
        sessionUpdatedAt="t0"
        basic
        basicCopy={basicCopy}
      />
    )
    // Student 3 is new and unmarked — mark them present so Save is enabled
    // (the `blocked` gate already refuses a save with any unmarked
    // student, before Undo is ever offered).
    const present3 = screen
      .getByRole("radiogroup", { name: "Student 3" })
      .querySelector('[aria-label="Present"]') as HTMLButtonElement
    fireEvent.click(present3)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    await screen.findByText(basicCopy.undoToast)
    const undoButton = screen.getByRole("button", {
      name: basicCopy.undo,
    }) as HTMLButtonElement
    await vi.waitFor(() => expect(undoButton.disabled).toBe(false))

    fireEvent.click(undoButton)
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2))
    // Every enrolled student is present, with a real status: students 1-2
    // restore their real prior statuses; student 3 keeps the mark she just
    // gave them (present) since there was never a saved value to go back to.
    expect(mockSave.mock.calls[1]?.[0]).toMatchObject({
      records: [
        { studentId: mixedStudents[0]!.studentId, status: "present" },
        { studentId: mixedStudents[1]!.studentId, status: "absent" },
        { studentId: mixedStudents[2]!.studentId, status: "present" },
      ],
    })
  })

  it("never offers Undo on a first save (nothing to go back to)", async () => {
    render(<RollCall {...BASE} basic basicCopy={basicCopy} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(basicCopy.undoToast)).toBeNull()
  })

  // Review fix (HIGH 1/2, MEDIUM 3): an offline save used to leave the
  // screen showing the pre-save values (HIGH 2) and never updated what Undo
  // points back to (HIGH 1) — tapping Undo after a queued save re-queued the
  // wrong, stale statuses. `recordLocalSave` now runs on both the online and
  // the queued success path.
  it("an offline save after an online one updates the screen and Undo's target (not the stale original)", async () => {
    render(
      <RollCall {...BASE} sessionUpdatedAt="t0" basic basicCopy={basicCopy} />
    )
    // Save A online: everyone present.
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    await screen.findByText(basicCopy.undoToast)
    let undoButton = screen.getByRole("button", {
      name: basicCopy.undo,
    }) as HTMLButtonElement
    await vi.waitFor(() => expect(undoButton.disabled).toBe(false))

    // Go offline, edit to B (student 2 -> absent), save — queued, not sent.
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    const absent = screen
      .getByRole("radiogroup", { name: "Student 2" })
      .querySelector('[aria-label="Absent"]') as HTMLButtonElement
    fireEvent.click(absent)
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockQueueSave).toHaveBeenCalledTimes(1))
    // `recordLocalSave` (inside `queue()`) runs after the queue promise
    // resolves, one tick after `mockQueueSave`'s call is recorded — wait for
    // the Save button's own re-render (pending clears) before reading state.
    await screen.findByRole("button", { name: "Save" })
    // HIGH 2: the rows show B (just queued), not the stale A.
    expect(screen.getByText("P 2 · A 1 · L 0")).toBeTruthy()

    // HIGH 1: Undo now must target A (the state right before B), not the
    // very first (pre-A) statuses.
    undoButton = screen.getByRole("button", {
      name: basicCopy.undo,
    }) as HTMLButtonElement
    await vi.waitFor(() => expect(undoButton.disabled).toBe(false))
    fireEvent.click(undoButton)
    await vi.waitFor(() => expect(mockQueueSave).toHaveBeenCalledTimes(2))
    expect(mockQueueSave.mock.calls[1]?.[0].payload.records).toEqual(
      students.map((s) => ({ studentId: s.studentId, status: "present" }))
    )
    expect(await screen.findByText("P 3 · A 0 · L 0")).toBeTruthy()
  })

  it("a second offline save moves the Undo target to the save right before it, not the first one", async () => {
    render(
      <RollCall {...BASE} sessionUpdatedAt="t0" basic basicCopy={basicCopy} />
    )
    fireEvent.click(screen.getByRole("button", { name: "Mark all present" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
    // Wait for the first save's `pending` to actually clear (its own
    // re-render swaps "Saving..." back to "Save") before the next action,
    // rather than racing it under system load (flaky otherwise).
    await screen.findByRole("button", { name: "Save" })

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)

    // First offline save (B): student 1 -> absent.
    const absent1 = screen
      .getByRole("radiogroup", { name: "Student 1" })
      .querySelector('[aria-label="Absent"]') as HTMLButtonElement
    fireEvent.click(absent1)
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockQueueSave).toHaveBeenCalledTimes(1))
    await screen.findByRole("button", { name: "Save" })

    // Second offline save (C): student 3 -> absent too.
    const absent3 = screen
      .getByRole("radiogroup", { name: "Student 3" })
      .querySelector('[aria-label="Absent"]') as HTMLButtonElement
    fireEvent.click(absent3)
    fireEvent.click(await screen.findByRole("button", { name: "Save" }))
    fireEvent.click(await screen.findByRole("button", { name: "Yes, save" }))
    await vi.waitFor(() => expect(mockQueueSave).toHaveBeenCalledTimes(2))

    // Undo must restore B (student 1 absent, the rest present) — the state
    // right before C — not the first save (everyone present).
    const undoButton = screen.getByRole("button", {
      name: basicCopy.undo,
    }) as HTMLButtonElement
    await vi.waitFor(() => expect(undoButton.disabled).toBe(false))
    fireEvent.click(undoButton)
    await vi.waitFor(() => expect(mockQueueSave).toHaveBeenCalledTimes(3))
    expect(mockQueueSave.mock.calls[2]?.[0].payload.records).toEqual([
      { studentId: students[0]!.studentId, status: "absent" },
      { studentId: students[1]!.studentId, status: "present" },
      { studentId: students[2]!.studentId, status: "present" },
    ])
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

describe("undoPayload (MEDIUM 2)", () => {
  const roster = students.map((s) => ({ studentId: s.studentId }))

  it("null when there is nothing to go back to (undoMarks null)", () => {
    expect(undoPayload(roster, null, { s1: "present" })).toBeNull()
  })

  it("falls back to a student's current mark when the saved snapshot has none for them", () => {
    const [s1, s2, s3] = students
    const undoMarks: Marks = {
      [s1!.studentId]: "present",
      [s2!.studentId]: "absent",
    }
    const marks: Marks = {
      [s1!.studentId]: "late",
      [s2!.studentId]: "excused",
      [s3!.studentId]: "half_day",
    }
    // s3 has no entry in `undoMarks` (enrolled after that save) — Undo
    // keeps her CURRENT mark from `marks`, not a fabricated or missing one.
    expect(undoPayload(roster, undoMarks, marks)).toEqual({
      [s1!.studentId]: "present",
      [s2!.studentId]: "absent",
      [s3!.studentId]: "half_day",
    })
  })

  it("no Undo offered when a student has no mark at all — not in the saved snapshot, not marked now", () => {
    const [s1, s2, s3] = students
    const undoMarks: Marks = {
      [s1!.studentId]: "present",
      [s2!.studentId]: "absent",
    }
    // s3 is missing from `undoMarks` AND still unmarked in `marks` — the
    // component's own `blocked` gate makes this unreachable through the
    // UI (every visible student must already be marked before any save
    // can succeed), so it is proven directly against the pure function.
    const marks: Marks = {
      [s1!.studentId]: "present",
      [s2!.studentId]: "absent",
      [s3!.studentId]: null,
    }
    expect(undoPayload(roster, undoMarks, marks)).toBeNull()
  })
})

const ENTITY = `attendance:${BASE.sectionId}:${BASE.date}`

describe("RollCall offline (F-ID-11 Part 2a)", () => {
  it("a queued roll refused as a CONFLICT says so, not 'waiting'", () => {
    mockOutbox.mockReturnValue([{ entityKey: ENTITY, status: "conflict" }])
    render(<RollCall {...BASE} />)
    expect(screen.getByText(en.offline.conflictReason)).toBeTruthy()
    expect(screen.queryByText(en.offline.savedOnPhone)).toBeNull()
  })

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

  it("an offline save records when it was taken, on the server's clock (D-310)", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-25T04:00:00Z"))
    render(<RollCall {...BASE} />)
    markAndSave()
    await screen.findByText(en.offline.savedOnPhone)
    expect(mockQueueSave.mock.calls[0]?.[0].payload.capturedAt).toBe(
      "2026-09-25T04:01:30.000Z"
    )
    vi.mocked(Date.now).mockRestore()
  })

  it("a conflict on the screen opens the choice sheet (D-310)", async () => {
    mockOutbox.mockReturnValue([
      { id: "i1", entityKey: ENTITY, status: "conflict" },
    ])
    render(<RollCall {...BASE} />)
    fireEvent.click(
      screen.getByRole("button", { name: en.offline.compareAndChoose })
    )
    expect(await screen.findByRole("dialog")).toBeTruthy()
  })

  it("a request that never came back is queued under the same key", async () => {
    mockSave.mockRejectedValue(new TypeError("Failed to fetch"))
    render(<RollCall {...BASE} />)
    markAndSave()
    await screen.findByText(en.offline.savedOnPhone)
    expect(mockQueueSave.mock.calls[0]?.[0].payload.idempotencyKey).toBe(
      mockSave.mock.calls[0]?.[0].idempotencyKey
    )
    // The same payload too: it may have landed, and a replay must match it.
    expect(mockQueueSave.mock.calls[0]?.[0].payload.capturedAt).toBeUndefined()
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
    mockOutbox.mockReturnValue([{ entityKey: ENTITY, status: "pending" }])
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
  it("if the phone cannot keep it (no IndexedDB), says so and keeps the marks", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    mockQueueSave.mockRejectedValue(new Error("QuotaExceededError"))
    render(<RollCall {...BASE} />)
    markAndSave()
    await screen.findByText(en.offline.saveOnPhoneFailed)
    expect(screen.getByText("P 3 · A 0 · L 0")).toBeTruthy()
  })

  it("a refused queued roll shows the reason in the reader's language", () => {
    mockOutbox.mockReturnValue([
      {
        entityKey: ENTITY,
        status: "needs_attention",
        lastError: {
          code: "forbidden",
          message: "This day is past the correction window. Ask an admin.",
          root: "OUTSIDE_EDIT_WINDOW",
        },
      },
    ])
    render(<RollCall {...BASE} t={bn.attendance.roll} locale="bn" />)
    expect(
      screen.getByText(bn.attendance.roll.errors.OUTSIDE_EDIT_WINDOW)
    ).toBeTruthy()
  })
})
