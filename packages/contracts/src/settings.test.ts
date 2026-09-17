import { describe, expect, it } from "vitest"

import {
  schoolAttendancePolicyPatchSchema,
  schoolAttendancePolicySchema,
  schoolSettingsPatchSchema,
} from "./settings"

describe("schoolAttendancePolicySchema — full shape", () => {
  const valid = {
    mode: "daily",
    cutoff: "09:15",
    late_counts_present: true,
    half_day_counts_present: true,
    min_attendance_bp: 7500,
    block_exam_on_shortfall: false,
  }

  it("accepts a fully-populated valid policy", () => {
    expect(schoolAttendancePolicySchema.safeParse(valid).success).toBe(true)
  })

  it("rejects an out-of-range basis-points value", () => {
    const result = schoolAttendancePolicySchema.safeParse({
      ...valid,
      min_attendance_bp: 10_001,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a mode outside daily|period", () => {
    const result = schoolAttendancePolicySchema.safeParse({
      ...valid,
      mode: "weekly",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a malformed cutoff time", () => {
    const result = schoolAttendancePolicySchema.safeParse({
      ...valid,
      cutoff: "9:15am",
    })
    expect(result.success).toBe(false)
  })

  it("requires every field on the full shape", () => {
    expect(
      schoolAttendancePolicySchema.safeParse({ mode: "daily" }).success
    ).toBe(false)
  })
})

describe("schoolAttendancePolicyPatchSchema — partial", () => {
  it("accepts an empty patch", () => {
    expect(schoolAttendancePolicyPatchSchema.safeParse({}).success).toBe(true)
  })

  it("accepts a single-key patch without requiring the rest", () => {
    const result = schoolAttendancePolicyPatchSchema.safeParse({
      min_attendance_bp: 8000,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // A patch schema must never backfill keys the caller did not send.
      expect(Object.keys(result.data)).toEqual(["min_attendance_bp"])
    }
  })

  it("still rejects an invalid value on the one key supplied", () => {
    expect(
      schoolAttendancePolicyPatchSchema.safeParse({ mode: "annually" }).success
    ).toBe(false)
  })
})

describe("schoolSettingsPatchSchema", () => {
  it("accepts an empty patch", () => {
    expect(schoolSettingsPatchSchema.safeParse({}).success).toBe(true)
  })

  it("accepts a patch touching only one blob's one key", () => {
    const result = schoolSettingsPatchSchema.safeParse({
      attendance_policy: { late_counts_present: false },
    })
    expect(result.success).toBe(true)
  })

  it("accepts a patch to timezone and working_days without any policy blob", () => {
    const result = schoolSettingsPatchSchema.safeParse({
      timezone: "Asia/Dhaka",
      working_days: [6, 7, 1, 2, 3, 4],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown top-level key", () => {
    const result = schoolSettingsPatchSchema.safeParse({
      not_a_real_section: { foo: "bar" },
    })
    expect(result.success).toBe(false)
  })

  it("rejects working_days outside 1-7", () => {
    const result = schoolSettingsPatchSchema.safeParse({
      working_days: [0, 1, 2],
    })
    expect(result.success).toBe(false)
  })

  it("rejects a bad branding accent colour", () => {
    const result = schoolSettingsPatchSchema.safeParse({
      branding: { accent: "blue" },
    })
    expect(result.success).toBe(false)
  })

  it("accepts a null value for a nullable branding field", () => {
    const result = schoolSettingsPatchSchema.safeParse({
      branding: { logo_file_id: null },
    })
    expect(result.success).toBe(true)
  })
})
