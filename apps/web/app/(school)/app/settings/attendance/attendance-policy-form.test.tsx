import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AttendanceStatus } from "@acadigma/contracts"
import type { AttendancePolicy } from "@acadigma/domain/settings"

import en from "@/messages/en.json"

import { AttendancePolicyForm } from "./attendance-policy-form"

const mockUpdateSchoolSettings = vi.fn()
const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock("../actions", () => ({
  updateSchoolSettings: (...a: unknown[]) => mockUpdateSchoolSettings(...a),
}))

const t = en.settings

const POLICY: AttendancePolicy = {
  mode: "daily",
  cutoff: "09:15",
  late_counts_present: true,
  half_day_counts_present: true,
  min_attendance_bp: 7500,
  block_exam_on_shortfall: false,
}

// 18 present, 1 late, 1 half day, 2 absent over 22 recorded days (same
// fixture as packages/domain/src/attendance/percentage.test.ts, AC5).
const SAMPLE = {
  studentName: "Ayesha",
  month: "2026-09",
  statuses: [
    ...Array<AttendanceStatus>(18).fill("present"),
    "late",
    "half_day",
    "absent",
    "absent",
  ] as AttendanceStatus[],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("AttendancePolicyForm (F-OP-07 Part 3 §4 W4)", () => {
  it("shows the live effect line and updates it when a toggle changes, before any save", () => {
    render(<AttendancePolicyForm policy={POLICY} sample={SAMPLE} t={t} />)

    // Saved policy: (18 + 1 + 1) / 22 = 90.91, unchanged either side while nothing is dirty.
    expect(screen.getByText(/90\.91 %.*90\.91 %/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText(t.attendance.halfDayCountsPresent))

    // Draft: half day no longer counts -> 19/22 = 86.36; the saved side stays 90.91.
    expect(screen.getByText(/86\.36 %.*90\.91 %/)).toBeTruthy()
    expect(screen.getByText(t.unsaved)).toBeTruthy()
  })

  it("saves the edited policy and clears the dirty state", async () => {
    mockUpdateSchoolSettings.mockResolvedValue({ ok: true, data: {} })
    render(<AttendancePolicyForm policy={POLICY} sample={SAMPLE} t={t} />)

    fireEvent.click(screen.getByLabelText(t.attendance.halfDayCountsPresent))
    fireEvent.click(screen.getByRole("button", { name: t.save }))

    await waitFor(() => expect(mockUpdateSchoolSettings).toHaveBeenCalledWith({
      attendance_policy: { ...POLICY, half_day_counts_present: false },
    }))
    await waitFor(() => expect(screen.queryByText(t.unsaved)).toBeNull())
  })

  it("no sample yet: shows the empty-data note instead of a fabricated number", () => {
    render(
      <AttendancePolicyForm
        policy={POLICY}
        sample={{ studentName: null, month: null, statuses: [] }}
        t={t}
      />
    )
    expect(screen.getByText(t.attendance.noSampleYet)).toBeTruthy()
  })
})
