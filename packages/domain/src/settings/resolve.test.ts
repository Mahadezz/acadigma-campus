import { describe, expect, it } from "vitest"

import {
  schoolAcademicSettingsPatchSchema,
  schoolAttendancePolicyPatchSchema,
  schoolBrandingPatchSchema,
  schoolCoverPolicyPatchSchema,
  schoolMessagingPolicyPatchSchema,
} from "@acadigma/contracts"

import {
  DEFAULT_ACADEMIC_SETTINGS,
  DEFAULT_ATTENDANCE_POLICY,
  DEFAULT_BRANDING,
  DEFAULT_COVER_POLICY,
  DEFAULT_MESSAGING_POLICY,
  DEFAULT_TIMEZONE,
  DEFAULT_WORKING_DAYS,
} from "./defaults"
import { resolve, type SchoolProfileRow } from "./resolve"

describe("defaults <-> contracts key parity (guards the two from drifting apart)", () => {
  it("has exactly the same keys as the matching Zod patch schema, for every blob", () => {
    const pairs: [
      Record<string, unknown>,
      { shape: Record<string, unknown> },
    ][] = [
      [DEFAULT_ATTENDANCE_POLICY, schoolAttendancePolicyPatchSchema],
      [DEFAULT_ACADEMIC_SETTINGS, schoolAcademicSettingsPatchSchema],
      [DEFAULT_COVER_POLICY, schoolCoverPolicyPatchSchema],
      [DEFAULT_MESSAGING_POLICY, schoolMessagingPolicyPatchSchema],
      [DEFAULT_BRANDING, schoolBrandingPatchSchema],
    ]
    for (const [defaults, schema] of pairs) {
      expect(Object.keys(defaults).sort()).toEqual(
        Object.keys(schema.shape).sort()
      )
    }
  })
})

describe("resolve() — defaults table (F-OP-07 §3, DATA-MODEL.md §1.3)", () => {
  it("returns every documented default for a row with no overrides at all", () => {
    const resolved = resolve(null)
    expect(resolved.workspaceId).toBeNull()
    expect(resolved.timezone).toBe("Asia/Dhaka")
    expect(resolved.workingDays).toEqual([6, 7, 1, 2, 3, 4])
    expect(resolved.attendancePolicy).toEqual({
      mode: "daily",
      cutoff: "09:15",
      late_counts_present: true,
      half_day_counts_present: true,
      min_attendance_bp: 7500,
      block_exam_on_shortfall: false,
    })
    expect(resolved.academicSettings).toEqual({
      grade_scale_code: "BD_GPA5",
      pass_mark_percent: 33,
      fail_any_subject_zero_gpa: true,
      rank_by: "gpa_then_total",
      exam_weights: {},
    })
    expect(resolved.coverPolicy).toEqual({
      missed_punch_grace_minutes: 30,
      enable_missed_punch: false,
      cover_credited: true,
      unpaid_absence: false,
    })
    expect(resolved.messagingPolicy).toEqual({
      parents_can_reply: true,
      announcement_roles: ["owner", "admin"],
      quiet_hours: {},
    })
    expect(resolved.branding).toEqual({
      logo_file_id: null,
      header_line_1: null,
      header_line_2: null,
      accent: null,
      report_footer: null,
    })
  })

  it("resolves undefined the same as null", () => {
    expect(resolve(undefined)).toEqual(resolve(null))
  })

  it("resolves an empty row the same as a row with empty {} blobs", () => {
    const row: SchoolProfileRow = {
      workspace_id: "11111111-1111-1111-1111-111111111111",
      attendance_policy: {},
      academic_settings: {},
      cover_policy: {},
      messaging_policy: {},
      branding: {},
    }
    const resolved = resolve(row)
    expect(resolved.attendancePolicy).toEqual(DEFAULT_ATTENDANCE_POLICY)
    expect(resolved.academicSettings).toEqual(DEFAULT_ACADEMIC_SETTINGS)
    expect(resolved.coverPolicy).toEqual(DEFAULT_COVER_POLICY)
    expect(resolved.messagingPolicy).toEqual(DEFAULT_MESSAGING_POLICY)
    expect(resolved.branding).toEqual(DEFAULT_BRANDING)
  })

  it("applies a school's override on top of the default for each blob independently", () => {
    const row: SchoolProfileRow = {
      attendance_policy: { mode: "period", min_attendance_bp: 8000 },
      academic_settings: { pass_mark_percent: 40 },
      cover_policy: { unpaid_absence: true },
      messaging_policy: { parents_can_reply: false },
      branding: { accent: "#1F4E79" },
    }
    const resolved = resolve(row)

    expect(resolved.attendancePolicy).toEqual({
      ...DEFAULT_ATTENDANCE_POLICY,
      mode: "period",
      min_attendance_bp: 8000,
    })
    expect(resolved.academicSettings).toEqual({
      ...DEFAULT_ACADEMIC_SETTINGS,
      pass_mark_percent: 40,
    })
    expect(resolved.coverPolicy).toEqual({
      ...DEFAULT_COVER_POLICY,
      unpaid_absence: true,
    })
    expect(resolved.messagingPolicy).toEqual({
      ...DEFAULT_MESSAGING_POLICY,
      parents_can_reply: false,
    })
    expect(resolved.branding).toEqual({
      ...DEFAULT_BRANDING,
      accent: "#1F4E79",
    })
  })

  it("ignores keys on the stored row that are not in the defaults object", () => {
    const row: SchoolProfileRow = {
      attendance_policy: {
        min_attendance_percent: 75, // renamed to min_attendance_bp; must be dropped
        payroll_enabled: true, // never a real key; must never surface (§2.2 story)
      },
    }
    const resolved = resolve(row)
    expect(resolved.attendancePolicy).toEqual(DEFAULT_ATTENDANCE_POLICY)
    expect(resolved.attendancePolicy).not.toHaveProperty(
      "min_attendance_percent"
    )
    expect(resolved.attendancePolicy).not.toHaveProperty("payroll_enabled")
  })

  it("falls back to the default for a key whose stored value has the wrong type", () => {
    const row: SchoolProfileRow = {
      attendance_policy: {
        late_counts_present: "yes", // legacy shape: string, not boolean
        min_attendance_bp: null,
      },
    }
    const resolved = resolve(row)
    expect(resolved.attendancePolicy.late_counts_present).toBe(true)
    expect(resolved.attendancePolicy.min_attendance_bp).toBe(7500)
  })

  it("never throws on a completely malformed row", () => {
    const malformed = {
      attendance_policy: "not-an-object",
      academic_settings: 42,
      cover_policy: [1, 2, 3],
      messaging_policy: null,
      branding: undefined,
      working_days: "Sat-Thu",
      timezone: 12345,
    } as unknown as SchoolProfileRow

    expect(() => resolve(malformed)).not.toThrow()
    const resolved = resolve(malformed)
    expect(resolved.attendancePolicy).toEqual(DEFAULT_ATTENDANCE_POLICY)
    expect(resolved.academicSettings).toEqual(DEFAULT_ACADEMIC_SETTINGS)
    expect(resolved.coverPolicy).toEqual(DEFAULT_COVER_POLICY)
    expect(resolved.messagingPolicy).toEqual(DEFAULT_MESSAGING_POLICY)
    expect(resolved.branding).toEqual(DEFAULT_BRANDING)
    expect(resolved.workingDays).toEqual(DEFAULT_WORKING_DAYS)
    expect(resolved.timezone).toBe(DEFAULT_TIMEZONE)
  })

  it("rejects a working_days array with an out-of-range day and keeps the default", () => {
    const resolved = resolve({ working_days: [0, 1, 2] })
    expect(resolved.workingDays).toEqual(DEFAULT_WORKING_DAYS)
  })

  it("rejects an empty working_days array and keeps the default", () => {
    expect(resolve({ working_days: [] }).workingDays).toEqual(
      DEFAULT_WORKING_DAYS
    )
  })

  it("accepts a valid custom working_days array (e.g. a Friday working school)", () => {
    const resolved = resolve({ working_days: [1, 2, 3, 4, 5] })
    expect(resolved.workingDays).toEqual([1, 2, 3, 4, 5])
  })

  it("accepts a non-default but valid timezone", () => {
    expect(resolve({ timezone: "Asia/Kolkata" }).timezone).toBe("Asia/Kolkata")
  })

  it("treats a blank timezone string as unset", () => {
    expect(resolve({ timezone: "   " }).timezone).toBe(DEFAULT_TIMEZONE)
  })

  it("carries the workspace id through untouched", () => {
    const id = "22222222-2222-2222-2222-222222222222"
    expect(resolve({ workspace_id: id }).workspaceId).toBe(id)
  })

  it("accepts an object-shaped exam_weights/quiet_hours override without validating its inner keys", () => {
    const resolved = resolve({
      academic_settings: { exam_weights: { "half-yearly": 30, final: 70 } },
      messaging_policy: { quiet_hours: { start: "22:00", end: "07:00" } },
    })
    expect(resolved.academicSettings.exam_weights).toEqual({
      "half-yearly": 30,
      final: 70,
    })
    expect(resolved.messagingPolicy.quiet_hours).toEqual({
      start: "22:00",
      end: "07:00",
    })
  })

  it("keeps the default array/object when the stored value is the wrong container type", () => {
    const resolved = resolve({
      messaging_policy: { announcement_roles: "owner,admin" }, // string, not array
      academic_settings: { exam_weights: [1, 2, 3] }, // array, not object
    })
    expect(resolved.messagingPolicy.announcement_roles).toEqual([
      "owner",
      "admin",
    ])
    expect(resolved.academicSettings.exam_weights).toEqual({})
  })
})
