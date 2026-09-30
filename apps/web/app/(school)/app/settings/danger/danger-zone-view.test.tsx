import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

import { DangerZoneView, sameName } from "./danger-zone-view"

const mockArchive = vi.fn()
const mockUnarchive = vi.fn()
const mockSchedule = vi.fn()
const mockCancel = vi.fn()
const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))
vi.mock("./actions", () => ({
  archiveSchool: (...a: unknown[]) => mockArchive(...a),
  unarchiveSchool: (...a: unknown[]) => mockUnarchive(...a),
  scheduleSchoolDeletion: (...a: unknown[]) => mockSchedule(...a),
  cancelSchoolDeletion: (...a: unknown[]) => mockCancel(...a),
}))

const t = en.dangerZone

function view(over: Partial<Parameters<typeof DangerZoneView>[0]> = {}) {
  return render(
    <DangerZoneView
      t={t}
      schoolName="Ideal School"
      archived={false}
      archivedOn={null}
      deletionOn={null}
      {...over}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("sameName", () => {
  it("ignores case and runs of spaces, not letters", () => {
    expect(sameName("  ideal   SCHOOL ", "Ideal School")).toBe(true)
    expect(sameName("Ideal Schoo", "Ideal School")).toBe(false)
  })
})

describe("DangerZoneView (D-211)", () => {
  it("keeps the destructive button disabled until the school's name is typed", async () => {
    mockSchedule.mockResolvedValue({
      ok: true,
      data: { deletionScheduledAt: "2026-10-29T00:00:00Z" },
    })
    view()
    fireEvent.click(screen.getByRole("button", { name: t.delete.action }))

    const confirm = screen.getByRole("button", { name: t.delete.confirm })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    // The consequences are on screen before the input (a11y, §10).
    expect(screen.getByText(t.delete.consequences[0]!)).toBeTruthy()

    const input = screen.getByLabelText("Type Ideal School to confirm")
    fireEvent.change(input, { target: { value: "Ideal" } })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: "ideal school" } })
    expect((confirm as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mockSchedule).toHaveBeenCalledWith({ confirmName: "ideal school" })
    )
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  it("shows the database's refusal, naming the subscription", async () => {
    mockArchive.mockResolvedValue({
      ok: false,
      error: {
        code: "conflict",
        message: "The Pro subscription is active. Cancel it first.",
        fieldErrors: { _root: ["ACTIVE_SUBSCRIPTION"] },
      },
    })
    view()
    fireEvent.click(screen.getByRole("button", { name: t.archive.action }))
    fireEvent.change(screen.getByLabelText("Type Ideal School to confirm"), {
      target: { value: "Ideal School" },
    })
    fireEvent.click(screen.getByRole("button", { name: t.archive.confirm }))
    expect(
      await screen.findByText(
        "The Pro subscription is active. Cancel it first."
      )
    ).toBeTruthy()
  })

  it("offers cancel instead of delete while a deletion is scheduled", async () => {
    mockCancel.mockResolvedValue({ ok: true, data: undefined })
    view({ deletionOn: "29 October 2026" })
    expect(
      screen.getByText("This school will be deleted on 29 October 2026.")
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: t.delete.action })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: t.scheduled.cancel }))
    expect(await screen.findByText(t.scheduled.cancelled)).toBeTruthy()
  })

  it("offers restore instead of archive for an archived school", () => {
    view({ archived: true, archivedOn: "1 October 2026" })
    expect(
      screen.getByRole("button", { name: t.unarchive.action })
    ).toBeTruthy()
    expect(screen.queryByRole("button", { name: t.archive.action })).toBeNull()
  })
})
