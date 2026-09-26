/**
 * F-OP-03 Part 5 (D-207) — the spec §10 performance budget ("bulk 40
 * students ≤ 25 s") for the actual render+merge path, measured here with 40
 * directly-constructed `ReportCardDto`s rather than a seeded database or the
 * now-deleted `apps/web/.../report-card-fixture.ts` (F-AC-06 Part 5, #68,
 * D-305, replaced the fixture seam with a real query) — this test proves
 * the render/merge budget on its own, independent of where the data comes
 * from, in `packages/pdf` alone.
 *
 * Set `OPS_BULK_OUTPUT_DIR` to also write the merged PDFs to disk for a
 * manual pymupdf check (opt-in — CI does not have an `F:\` drive).
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import type { ReportCardDto } from "@acadigma/contracts"

import { mergeReportCardBulkPdf } from "./merge"
import { renderPdfToBuffer } from "./render"
import { ReportCardDocument } from "./templates/report-card"

const STUDENT_COUNT = 40
const BUDGET_MS = 25_000 // spec §10
const GENERATED_AT = new Date("2026-09-26T09:00:00.000Z")

const BRANDING = {
  schoolName: "আদর্শ উচ্চ বিদ্যালয়",
  headerLines: ["Dhaka, Bangladesh", "EIIN 123456"],
  accentColor: "#1f4e79",
  footerNote: "School copy",
}

/** One plausible, self-contained `ReportCardDto` — no fixture import. */
function buildDto(roll: number): ReportCardDto {
  const obtained = 60 + (roll % 35)
  const pct = obtained
  return {
    studentNameEn: `Student ${roll}`,
    studentNameBn: `শিক্ষার্থী ${roll}`,
    studentCode: `STU-2026-${String(roll).padStart(5, "0")}`,
    rollNumber: roll,
    className: "Class 6",
    sectionName: "ক",
    examNameEn: "Half-Yearly Examination 2026",
    examNameBn: "অর্ধ-বার্ষিক পরীক্ষা ২০২৬",
    subjects: [
      "Bangla",
      "English",
      "Mathematics",
      "Science",
      "Bangladesh and Global Studies",
      "Religion and Moral Education",
    ].map((name) => ({
      subjectNameEn: name,
      subjectNameBn: name,
      subjectKind: "compulsory" as const,
      status: "entered" as const,
      marksObtained: obtained,
      fullMarks: 100,
      letter: pct >= 80 ? "A+" : "A",
      gradePoint: pct >= 80 ? 5 : 4,
    })),
    totalObtained: obtained * 6,
    totalFull: 600,
    percentage: pct,
    gpa: pct >= 80 ? 5 : 4,
    gpaWithoutOptional: null,
    overallLetter: pct >= 80 ? "A+" : "A",
    result: "pass",
    rank: roll,
    rankTied: false,
    rankOf: STUDENT_COUNT,
    attendance: {
      presentDays: 20,
      totalDays: 22,
      percent: 91,
      belowMinimum: false,
    },
  }
}

async function renderAndMerge(duplex: boolean) {
  const dtos = Array.from({ length: STUDENT_COUNT }, (_, i) => buildDto(i + 1))
  const started = Date.now()
  const buffers = await Promise.all(
    dtos.map((dto) =>
      renderPdfToBuffer(
        ReportCardDocument({
          locale: "bn",
          ...BRANDING,
          ...dto,
          generatedAt: GENERATED_AT,
        })
      )
    )
  )
  const merged = await mergeReportCardBulkPdf(buffers, duplex)
  const durationMs = Date.now() - started
  return { merged, durationMs }
}

describe("bulk report cards — render + merge performance budget (§10, D-207)", () => {
  it(
    `renders and merges ${STUDENT_COUNT} cards, no duplex, within the ${BUDGET_MS}ms budget`,
    async () => {
      const { merged, durationMs } = await renderAndMerge(false)
      // eslint-disable-next-line no-console -- the number this test exists to report
      console.log(
        `[bulk-perf] ${STUDENT_COUNT} cards, no duplex: ${durationMs}ms, ${merged.pageCount} pages`
      )
      expect(merged.pageCount).toBe(STUDENT_COUNT)
      expect(durationMs).toBeLessThan(BUDGET_MS)

      if (process.env.OPS_BULK_OUTPUT_DIR) {
        await mkdir(process.env.OPS_BULK_OUTPUT_DIR, { recursive: true })
        await writeFile(
          join(process.env.OPS_BULK_OUTPUT_DIR, "bulk-40-bn.pdf"),
          merged.buffer
        )
      }
    },
    BUDGET_MS + 10_000
  )

  it(
    `renders and merges ${STUDENT_COUNT} cards with duplex padding into ${STUDENT_COUNT * 2} pages`,
    async () => {
      const { merged, durationMs } = await renderAndMerge(true)
      // eslint-disable-next-line no-console -- the number this test exists to report
      console.log(
        `[bulk-perf] ${STUDENT_COUNT} cards, duplex: ${durationMs}ms, ${merged.pageCount} pages`
      )
      expect(merged.pageCount).toBe(STUDENT_COUNT * 2)
      expect(durationMs).toBeLessThan(BUDGET_MS)

      if (process.env.OPS_BULK_OUTPUT_DIR) {
        await mkdir(process.env.OPS_BULK_OUTPUT_DIR, { recursive: true })
        await writeFile(
          join(process.env.OPS_BULK_OUTPUT_DIR, "bulk-40-bn-duplex.pdf"),
          merged.buffer
        )
      }
    },
    BUDGET_MS + 10_000
  )
})
