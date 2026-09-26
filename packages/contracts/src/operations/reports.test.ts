import { describe, expect, it } from "vitest"

import {
  reportKindSchema,
  reportLocaleSchema,
  reportRunInputSchema,
  reportStatusSchema,
} from "./reports"

describe("report enums — parity with the Postgres enums (report_runs migration)", () => {
  it("reportKindSchema accepts exactly the report_kind labels shipped so far", () => {
    expect(reportKindSchema.safeParse("sample").success).toBe(true)
    expect(reportKindSchema.safeParse("report_card").success).toBe(true)
    expect(reportKindSchema.safeParse("report_card_bulk").success).toBe(true)
    expect(reportKindSchema.safeParse("attendance_register").success).toBe(true)
    expect(reportKindSchema.safeParse("mark_sheet").success).toBe(true)
    expect(reportKindSchema.safeParse("id_card").success).toBe(false)
  })

  it("reportStatusSchema accepts exactly the five report_status labels", () => {
    for (const value of ["queued", "rendering", "ready", "failed", "expired"]) {
      expect(reportStatusSchema.safeParse(value).success).toBe(true)
    }
    expect(reportStatusSchema.safeParse("cancelled").success).toBe(false)
  })

  it("reportLocaleSchema accepts exactly bn and en", () => {
    expect(reportLocaleSchema.safeParse("bn").success).toBe(true)
    expect(reportLocaleSchema.safeParse("en").success).toBe(true)
    expect(reportLocaleSchema.safeParse("hi").success).toBe(false)
  })
})

describe("reportRunInputSchema", () => {
  it("accepts a sample request with a locale", () => {
    const parsed = reportRunInputSchema.safeParse({
      params: { kind: "sample" },
      locale: "bn",
    })
    expect(parsed.success).toBe(true)
  })

  it("accepts a report_card request with its own params", () => {
    const parsed = reportRunInputSchema.safeParse({
      params: {
        kind: "report_card",
        studentId: "11111111-1111-1111-1111-111111111111",
        examId: "22222222-2222-2222-2222-222222222222",
      },
      locale: "en",
    })
    expect(parsed.success).toBe(true)
  })

  it("accepts a report_card_bulk request, defaulting order and duplex", () => {
    const parsed = reportRunInputSchema.safeParse({
      params: {
        kind: "report_card_bulk",
        sectionId: "11111111-1111-1111-1111-111111111111",
        examId: "22222222-2222-2222-2222-222222222222",
      },
      locale: "bn",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.params.kind === "report_card_bulk") {
      expect(parsed.data.params.order).toBe("roll")
      expect(parsed.data.params.duplex).toBe(false)
    }
  })

  it("accepts an attendance_register request with its own params", () => {
    const parsed = reportRunInputSchema.safeParse({
      params: {
        kind: "attendance_register",
        sectionId: "11111111-1111-1111-1111-111111111111",
        month: "2026-09",
      },
      locale: "bn",
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an attendance_register request with a malformed month", () => {
    const parsed = reportRunInputSchema.safeParse({
      params: {
        kind: "attendance_register",
        sectionId: "11111111-1111-1111-1111-111111111111",
        month: "2026-13",
      },
      locale: "bn",
    })
    expect(parsed.success).toBe(false)
  })

  it("accepts a mark_sheet request with its own params", () => {
    const parsed = reportRunInputSchema.safeParse({
      params: {
        kind: "mark_sheet",
        sectionId: "11111111-1111-1111-1111-111111111111",
        examId: "22222222-2222-2222-2222-222222222222",
      },
      locale: "en",
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an unknown report kind", () => {
    const parsed = reportRunInputSchema.safeParse({
      params: { kind: "id_card" },
      locale: "en",
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a missing locale", () => {
    const parsed = reportRunInputSchema.safeParse({
      params: { kind: "sample" },
    })
    expect(parsed.success).toBe(false)
  })
})
