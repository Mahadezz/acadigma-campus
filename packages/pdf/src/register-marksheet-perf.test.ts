/**
 * F-OP-03 Part 6 (D-208) — the spec §10 performance budget ("attendance
 * register for 26 sessions x 40 students <= 4 s") for the actual render
 * path, measured here with directly-constructed DTOs (same approach
 * `bulk-perf.test.ts`, D-207, already established) rather than a seeded
 * database. Also renders a 40-student, 6-paper mark sheet for the same
 * verification (no spec §10 budget names this template explicitly; 5 s is
 * this test's own generous ceiling).
 *
 * Set `OPS_REGISTER_OUTPUT_DIR` to also write both PDFs to disk for a
 * manual pymupdf check (opt-in — CI does not have an `F:\` drive).
 *
 * `beforeAll` below renders a throwaway, 1-student register once before
 * either budget is timed: the first `renderPdfToBuffer` call in a process
 * pays for `@react-pdf/renderer`'s cold module init and the Bangla font
 * file's first load, which is a fixed one-time cost, not part of what the
 * 4 s/5 s budgets are meant to measure (flaky in CI on a slow first run —
 * D-76 security-and-testing lane). `performance.now()` replaces `Date.now()`
 * for the timed measurements themselves — sub-millisecond resolution, and
 * immune to wall-clock adjustments `Date.now()` is not.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { performance } from "node:perf_hooks"

import { beforeAll, describe, expect, it } from "vitest"

import type { AttendanceRegisterDto, MarkSheetDto } from "@acadigma/contracts"

import { renderPdfToBuffer } from "./render"
import { AttendanceRegisterDocument } from "./templates/attendance-register"
import { MarkSheetDocument } from "./templates/mark-sheet"

const STUDENT_COUNT = 40
const REGISTER_BUDGET_MS = 4_000 // spec §10
const MARK_SHEET_BUDGET_MS = 5_000 // no spec §10 figure named; this test's own ceiling
const GENERATED_AT = new Date("2026-09-26T09:00:00.000Z")

const BRANDING = {
  schoolName: "আদর্শ উচ্চ বিদ্যালয়",
  headerLines: ["Dhaka, Bangladesh", "EIIN 123456"],
  accentColor: "#1f4e79",
  footerNote: "School copy",
}

/** 2026-10: 31 calendar days (the task's own "40 x 31"), Sat-Thu working (BD
 * default), Friday off. */
function buildRegisterDto(): AttendanceRegisterDto {
  const year = 2026
  const month = 10
  const dayCount = 31
  const days = Array.from({ length: dayCount }, (_, i) => {
    const dayOfMonth = i + 1
    const date = `${year}-10-${String(dayOfMonth).padStart(2, "0")}`
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() // 0=Sun..6=Sat
    const isSchoolDay = weekday !== 5 // Friday off
    return { date, dayOfMonth, isSchoolDay, sessionTaken: isSchoolDay }
  })
  const schoolDayCount = days.filter((d) => d.isSchoolDay).length

  const students = Array.from({ length: STUDENT_COUNT }, (_, i) => {
    const roll = i + 1
    const cells = days.map((day, di) => {
      if (!day.isSchoolDay) return null
      // A little variety: every 7th student has one absence, everyone else present.
      return roll % 7 === 0 && di === 3
        ? ("absent" as const)
        : ("present" as const)
    })
    const recorded = cells.filter((c) => c !== null).length
    const present = cells.filter((c) => c === "present").length
    return {
      studentId: `00000000-0000-0000-0000-${String(roll).padStart(12, "0")}`,
      rollNumber: roll,
      studentNameEn: `Student ${roll}`,
      studentNameBn: `শিক্ষার্থী ${roll}`,
      cells,
      presentEquivalent: present,
      recordedDays: recorded,
      percent: recorded === 0 ? null : Math.round((100 * present) / recorded),
    }
  })

  const daysWithCounts = days.map((day, di) => ({
    ...day,
    presentCount: day.sessionTaken
      ? students.filter((s) => s.cells[di] === "present").length
      : 0,
  }))

  return {
    className: "Class 6",
    sectionName: "ক",
    year,
    month,
    days: daysWithCounts,
    students,
    incompleteDaysCount: 0,
    totalSchoolDays: schoolDayCount,
    policy: { lateCountsPresent: true, halfDayCountsPresent: true },
  }
}

const SUBJECTS = [
  "Bangla",
  "English",
  "Mathematics",
  "Science",
  "Bangladesh and Global Studies",
  "Religion and Moral Education",
]

function buildMarkSheetDto(): MarkSheetDto {
  const students = Array.from({ length: STUDENT_COUNT }, (_, i) => {
    const roll = i + 1
    const obtained = 60 + (roll % 35)
    const lines = SUBJECTS.map((name) => ({
      subjectNameEn: name,
      status: "entered" as const,
      obtained,
      letter: obtained >= 80 ? "A+" : "A",
    }))
    return {
      studentId: `00000000-0000-0000-0000-${String(roll).padStart(12, "0")}`,
      rollNumber: roll,
      studentNameEn: `Student ${roll}`,
      studentNameBn: `শিক্ষার্থী ${roll}`,
      lines,
      totalObtained: obtained * SUBJECTS.length,
      totalFull: 100 * SUBJECTS.length,
      percentage: obtained,
      // A varied decimal, not a flat 4/5 — see the test report's known issue:
      // a Bengali-locale value ending in exactly ".00" (two identical zero
      // glyphs right after the isolated "." run `ScriptText` splits out)
      // loses its text-layer mapping for the period in pymupdf/pdf-parse
      // extraction (pre-existing in `document-shell.tsx`'s run-splitting,
      // also latent in the already-shipped report card whenever a GPA is
      // exactly 5.00 — visually unaffected, extraction-only).
      gpa: Math.round((obtained / 20) * 100) / 100,
      letter: obtained >= 80 ? "A+" : "A",
      result: "pass" as const,
      rank: roll,
    }
  })

  const columnStats = SUBJECTS.map((name) => ({
    subjectNameEn: name,
    highest: 94,
    lowest: 60,
    average: 76.5,
    passCount: STUDENT_COUNT,
    appeared: STUDENT_COUNT,
    passRate: 100,
  }))

  return {
    sectionLabel: "Class 6 – ক",
    examNameEn: "Half-Yearly Examination 2026",
    examNameBn: "অর্ধ-বার্ষিক পরীক্ষা ২০২৬",
    subjects: SUBJECTS.map((name) => ({
      subjectNameEn: name,
      subjectNameBn: name,
      fullMarks: 100,
    })),
    students,
    columnStats,
  }
}

async function writeIfRequested(name: string, buffer: Buffer) {
  if (!process.env.OPS_REGISTER_OUTPUT_DIR) return
  await mkdir(process.env.OPS_REGISTER_OUTPUT_DIR, { recursive: true })
  await writeFile(join(process.env.OPS_REGISTER_OUTPUT_DIR, name), buffer)
}

// Pays for @react-pdf/renderer's cold module init and the Bangla font's
// first load once, outside either budget below (see the file header).
beforeAll(async () => {
  await renderPdfToBuffer(
    AttendanceRegisterDocument({
      locale: "bn",
      ...BRANDING,
      className: "Class 6",
      sectionName: "ক",
      year: 2026,
      month: 1,
      days: [{ date: "2026-01-01", dayOfMonth: 1, isSchoolDay: true, sessionTaken: true }],
      students: [
        {
          studentId: "00000000-0000-0000-0000-000000000001",
          rollNumber: 1,
          studentNameEn: "Warm Up",
          studentNameBn: "ওয়ার্ম আপ",
          cells: ["present"],
          presentEquivalent: 1,
          recordedDays: 1,
          percent: 100,
        },
      ],
      incompleteDaysCount: 0,
      totalSchoolDays: 1,
      policy: { lateCountsPresent: true, halfDayCountsPresent: true },
      generatedAt: GENERATED_AT,
    })
  )
}, REGISTER_BUDGET_MS + MARK_SHEET_BUDGET_MS)

describe("attendance register — performance budget (§10, D-208)", () => {
  it(
    `renders a ${STUDENT_COUNT}-student, 31-day (${buildRegisterDto().totalSchoolDays} school day) register within ${REGISTER_BUDGET_MS}ms`,
    async () => {
      const dto = buildRegisterDto()
      const started = performance.now()
      const buffer = await renderPdfToBuffer(
        AttendanceRegisterDocument({
          locale: "bn",
          ...BRANDING,
          ...dto,
          generatedAt: GENERATED_AT,
        })
      )
      const durationMs = performance.now() - started
      // eslint-disable-next-line no-console -- the number this test exists to report
      console.log(
        `[register-perf] ${STUDENT_COUNT} students x ${dto.days.length} days (${dto.totalSchoolDays} school days): ${durationMs.toFixed(1)}ms, ${buffer.byteLength} bytes`
      )
      expect(durationMs).toBeLessThan(REGISTER_BUDGET_MS)
      await writeIfRequested("register-40x31-bn.pdf", buffer)
    },
    REGISTER_BUDGET_MS + 10_000
  )
})

describe("mark sheet — performance budget (D-208)", () => {
  it(
    `renders a ${STUDENT_COUNT}-student, ${SUBJECTS.length}-paper mark sheet within ${MARK_SHEET_BUDGET_MS}ms`,
    async () => {
      const dto = buildMarkSheetDto()
      const started = performance.now()
      const buffer = await renderPdfToBuffer(
        MarkSheetDocument({
          locale: "bn",
          ...BRANDING,
          ...dto,
          generatedAt: GENERATED_AT,
        })
      )
      const durationMs = performance.now() - started
      // eslint-disable-next-line no-console -- the number this test exists to report
      console.log(
        `[mark-sheet-perf] ${STUDENT_COUNT} students x ${SUBJECTS.length} papers: ${durationMs.toFixed(1)}ms, ${buffer.byteLength} bytes`
      )
      expect(durationMs).toBeLessThan(MARK_SHEET_BUDGET_MS)
      await writeIfRequested("mark-sheet-40x6-bn.pdf", buffer)
    },
    MARK_SHEET_BUDGET_MS + 10_000
  )
})
