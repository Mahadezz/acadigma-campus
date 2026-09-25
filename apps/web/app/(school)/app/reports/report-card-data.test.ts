import { afterEach, describe, expect, it, vi } from "vitest"

import type { AcadigmaSupabaseClient, WorkspaceContext } from "@acadigma/db"

import {
  getReportCardBulkStudentIds,
  getReportCardData,
} from "./report-card-data"
import {
  FIXTURE_EXAM_ID,
  FIXTURE_SECTION_ID,
  FIXTURE_STUDENT_IDS,
} from "./report-card-fixture"

/**
 * F-OP-03 Part 3 (D-206) — the seam function's own contract test. When
 * F-AC-06 marks entry lands and this function's body is replaced with a
 * real query, these three cases are exactly what the real implementation
 * must still satisfy: a known (studentId, examId) resolves, an unknown
 * studentId is `not_found`, an unknown examId is `not_found` — never a
 * throw, never a silent empty card.
 */
const CLIENT = {} as AcadigmaSupabaseClient
const CTX = {} as WorkspaceContext

describe("getReportCardData (fixture seam)", () => {
  it("resolves a fixture student for the fixture exam", async () => {
    const result = await getReportCardData(
      CLIENT,
      CTX,
      FIXTURE_STUDENT_IDS[0]!,
      FIXTURE_EXAM_ID
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.rollNumber).toBe(1)
      expect(result.data.subjects).toHaveLength(6)
    }
  })

  it("returns not_found for a studentId not in the fixture", async () => {
    const result = await getReportCardData(
      CLIENT,
      CTX,
      "00000000-0000-0000-0000-000000000000",
      FIXTURE_EXAM_ID
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
  })

  it("returns not_found for an examId that is not the fixture exam", async () => {
    const result = await getReportCardData(
      CLIENT,
      CTX,
      FIXTURE_STUDENT_IDS[0]!,
      "11111111-1111-1111-1111-111111111111"
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("never serves the fixture in production (D-206)", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const result = await getReportCardData(
      CLIENT,
      CTX,
      FIXTURE_STUDENT_IDS[0]!,
      FIXTURE_EXAM_ID
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
  })
})

/**
 * F-OP-03 Part 5 (D-207) — the bulk roster resolver's own contract test,
 * same shape as the seam's above: it never returns a `ReportCardDto`, only
 * the ids `getReportCardData` is then called with, one at a time.
 */
describe("getReportCardBulkStudentIds (fixture)", () => {
  it("resolves all 40 fixture student ids for the fixture section and exam", async () => {
    const result = await getReportCardBulkStudentIds(
      CLIENT,
      CTX,
      FIXTURE_SECTION_ID,
      FIXTURE_EXAM_ID
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toEqual(FIXTURE_STUDENT_IDS)
  })

  it("returns not_found for a sectionId that is not the fixture section", async () => {
    const result = await getReportCardBulkStudentIds(
      CLIENT,
      CTX,
      "11111111-1111-1111-1111-111111111111",
      FIXTURE_EXAM_ID
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
  })

  it("never serves the fixture roster in production (D-206 rule, same for bulk)", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const result = await getReportCardBulkStudentIds(
      CLIENT,
      CTX,
      FIXTURE_SECTION_ID,
      FIXTURE_EXAM_ID
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe("not_found")
    vi.unstubAllEnvs()
  })
})
