import { describe, expect, it } from "vitest"

import type { AttendanceDaySection } from "@acadigma/contracts"

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
  const taken = section({
    sectionId: "s1",
    session: {
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
    },
  })
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

  it("does not double count a section id repeated in the assignment list", () => {
    expect(buildTodos(true, ["s2", "s2"], new Map([["s2", notTaken]]))).toEqual(
      [{ kind: "roll_calls_not_taken", count: 1 }]
    )
  })
})

describe("buildClassBlocks", () => {
  it("labels a class-teacher assignment with no subject", () => {
    const s = section({ sectionId: "s1" })
    const blocks = buildClassBlocks(
      true,
      [{ sectionId: "s1", subject: null, subjectBn: null }],
      [s]
    )
    expect(blocks).toEqual([
      {
        sectionId: "s1",
        gradeName: "Class 6",
        gradeNameBn: "ষষ্ঠ শ্রেণি",
        sectionName: "ক",
        subject: null,
        subjectBn: null,
        studentCount: 40,
        attendanceToday: "not_taken",
      },
    ])
  })

  it("gives a class teacher who also teaches a subject there two blocks", () => {
    const s = section({ sectionId: "s1" })
    const blocks = buildClassBlocks(
      true,
      [
        { sectionId: "s1", subject: null, subjectBn: null },
        { sectionId: "s1", subject: "Bangla", subjectBn: "বাংলা" },
      ],
      [s]
    )
    expect(blocks).toHaveLength(2)
    expect(blocks[1]?.subject).toBe("Bangla")
  })

  it("reports taken/expected from the saved session, not the live enrolled count", () => {
    const s = section({
      sectionId: "s1",
      enrolled: 40,
      session: {
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
      },
    })
    const [block] = buildClassBlocks(
      true,
      [{ sectionId: "s1", subject: null, subjectBn: null }],
      [s]
    )
    expect(block?.attendanceToday).toBe("taken")
    expect(block?.taken).toBe(38)
    expect(block?.expected).toBe(40)
  })

  it("marks every block not_school_day on a non-school day even with a session", () => {
    const s = section({
      sectionId: "s1",
      session: {
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
      },
    })
    const [block] = buildClassBlocks(
      false,
      [{ sectionId: "s1", subject: null, subjectBn: null }],
      [s]
    )
    expect(block?.attendanceToday).toBe("not_school_day")
    expect(block?.taken).toBeUndefined()
  })

  it("drops an assignment for a section id the caller did not pass in orderedSections", () => {
    const blocks = buildClassBlocks(
      true,
      [{ sectionId: "ghost", subject: null, subjectBn: null }],
      []
    )
    expect(blocks).toEqual([])
  })

  it("preserves the grade/section order of orderedSections", () => {
    const a = section({ sectionId: "s1", sectionName: "ক" })
    const b = section({
      sectionId: "s2",
      sectionName: "খ",
      gradeName: "Class 7",
    })
    const blocks = buildClassBlocks(
      true,
      [
        { sectionId: "s2", subject: null, subjectBn: null },
        { sectionId: "s1", subject: null, subjectBn: null },
      ],
      [a, b]
    )
    expect(blocks.map((c) => c.sectionId)).toEqual(["s1", "s2"])
  })
})
