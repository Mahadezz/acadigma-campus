import { describe, expect, it } from "vitest"

import type { AttendanceDaySection, MySection } from "@acadigma/contracts"

import { buildClassBlocks, buildTodos, greetingPeriod } from "./index"

function section(
  overrides: Partial<AttendanceDaySection> & { sectionId: string }
): AttendanceDaySection {
  return {
    sectionName: "ক",
    gradeName: "Class 6",
    gradeNameBn: "ষষ্ঠ শ্রেণি",
    classTeacherName: null,
    isMine: false,
    enrolled: 40,
    session: null,
    ...overrides,
  }
}

function mySection(
  overrides: Partial<MySection> & { sectionId: string }
): MySection {
  return {
    sectionName: "ক",
    gradeLevelId: "grade-1",
    gradeName: "Class 6",
    gradeNameBn: "ষষ্ঠ শ্রেণি",
    levelNumber: 6,
    isClassTeacher: false,
    subjects: [],
    ...overrides,
  }
}

const SESSION = {
  id: "sess1",
  updatedAt: "",
  takenAt: "",
  takenByName: null,
  bulkMarked: false,
  expected: 38,
  present: 36,
  absent: 2,
  late: 0,
  excused: 0,
  halfDay: 0,
}

describe("greetingPeriod", () => {
  it("is morning before noon", () => {
    expect(greetingPeriod(0)).toBe("morning")
    expect(greetingPeriod(11)).toBe("morning")
  })
  it("is afternoon from noon to 5pm", () => {
    expect(greetingPeriod(12)).toBe("afternoon")
    expect(greetingPeriod(16)).toBe("afternoon")
  })
  it("is evening from 5pm", () => {
    expect(greetingPeriod(17)).toBe("evening")
    expect(greetingPeriod(23)).toBe("evening")
  })
})

describe("buildTodos", () => {
  const taken = section({ sectionId: "s1", session: SESSION })
  const notTaken = section({ sectionId: "s2" })

  it("is empty on a non-school day, even with unmarked sections", () => {
    expect(buildTodos(false, ["s2"], new Map([["s2", notTaken]]))).toEqual([])
  })

  it("is empty when every assigned section is already taken", () => {
    expect(buildTodos(true, ["s1"], new Map([["s1", taken]]))).toEqual([])
  })

  it("counts assigned sections without a session today", () => {
    expect(
      buildTodos(
        true,
        ["s1", "s2"],
        new Map([
          ["s1", taken],
          ["s2", notTaken],
        ])
      )
    ).toEqual([{ kind: "roll_calls_not_taken", count: 1 }])
  })
})

describe("buildClassBlocks", () => {
  it("carries isClassTeacher/subjects straight through for the caller to label", () => {
    const s = section({ sectionId: "s1" })
    const my = mySection({ sectionId: "s1", isClassTeacher: true })
    const [block] = buildClassBlocks(true, [my], [s])
    expect(block).toEqual({
      sectionId: "s1",
      gradeName: "Class 6",
      gradeNameBn: "ষষ্ঠ শ্রেণি",
      sectionName: "ক",
      isClassTeacher: true,
      subjects: [],
      studentCount: 40,
      attendanceToday: "not_taken",
    })
  })

  it("produces one block for a section where the caller is both class teacher and a subject teacher", () => {
    const s = section({ sectionId: "s1" })
    const my = mySection({
      sectionId: "s1",
      isClassTeacher: true,
      subjects: [{ subjectId: "sub1", name: "Bangla", nameBn: "বাংলা" }],
    })
    const blocks = buildClassBlocks(true, [my], [s])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.subjects).toEqual([
      { subjectId: "sub1", name: "Bangla", nameBn: "বাংলা" },
    ])
  })

  it("reports taken/expected from the saved session, not the live enrolled count", () => {
    const s = section({ sectionId: "s1", enrolled: 40, session: SESSION })
    const my = mySection({ sectionId: "s1", isClassTeacher: true })
    const [block] = buildClassBlocks(true, [my], [s])
    expect(block?.attendanceToday).toBe("taken")
    expect(block?.taken).toBe(38)
    expect(block?.expected).toBe(40)
  })

  it("marks a block not_school_day on a non-school day even with a session", () => {
    const s = section({ sectionId: "s1", session: SESSION })
    const my = mySection({ sectionId: "s1", isClassTeacher: true })
    const [block] = buildClassBlocks(false, [my], [s])
    expect(block?.attendanceToday).toBe("not_school_day")
    expect(block?.taken).toBeUndefined()
  })

  it("falls back to zero students / not_taken when attendance_day has no matching section", () => {
    const my = mySection({ sectionId: "ghost", isClassTeacher: true })
    const [block] = buildClassBlocks(true, [my], [])
    expect(block?.studentCount).toBe(0)
    expect(block?.attendanceToday).toBe("not_taken")
  })

  it("preserves listMySections' own order", () => {
    const a = mySection({ sectionId: "s1", isClassTeacher: true })
    const b = mySection({
      sectionId: "s2",
      sectionName: "খ",
      gradeName: "Class 7",
      isClassTeacher: true,
    })
    const blocks = buildClassBlocks(true, [b, a], [])
    expect(blocks.map((c) => c.sectionId)).toEqual(["s2", "s1"])
  })
})
