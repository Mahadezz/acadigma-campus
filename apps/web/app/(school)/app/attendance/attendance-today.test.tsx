import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { AttendanceDay } from "@acadigma/contracts"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

import { AttendanceToday } from "./attendance-today"

const POLICY = { late_counts_present: true, half_day_counts_present: true }

const DAY: AttendanceDay = {
  date: "2026-09-25",
  today: "2026-09-25",
  isSchoolDay: true,
  editWindowDays: 2,
  sections: [
    {
      sectionId: "s1",
      sectionName: "ক",
      gradeName: "Class 6",
      gradeNameBn: "ষষ্ঠ শ্রেণি",
      classTeacherName: "Nadia Rahman",
      isMine: true,
      enrolled: 40,
      session: {
        id: "x",
        updatedAt: "2026-09-25T03:05:00Z",
        takenAt: "2026-09-25T03:05:00Z",
        takenByName: "Nadia Rahman",
        bulkMarked: true,
        expected: 40,
        present: 37,
        absent: 3,
        late: 0,
        excused: 0,
        halfDay: 0,
      },
    },
    {
      sectionId: "s2",
      sectionName: "খ",
      gradeName: "Class 6",
      gradeNameBn: "ষষ্ঠ শ্রেণি",
      classTeacherName: null,
      isMine: false,
      enrolled: 38,
      session: null,
    },
  ],
}

describe("AttendanceToday", () => {
  it("gives the owner the 9:30 picture: marked count, rate, who and when", () => {
    render(
      <AttendanceToday
        t={en.attendance}
        locale="en"
        day={DAY}
        dateLabel="25 Sept 2026"
        policy={POLICY}
        canMark
      />
    )
    expect(
      screen.getByText(/1 of 2 classes marked · Today's rate 92.5%/)
    ).toBeTruthy()
    expect(screen.getAllByText(/by Nadia Rahman at 9:05/).length).toBe(1)
    expect(
      screen
        .getByRole("link", { name: "Take attendance — Class 6 – খ" })
        .getAttribute("href")
    ).toBe("/app/attendance/s2")
  })

  it("puts the teacher's own class first and lets them cover any other (D-105)", () => {
    render(
      <AttendanceToday
        t={en.attendance}
        locale="en"
        day={DAY}
        dateLabel="25 Sept 2026"
        policy={POLICY}
        canMark
      />
    )
    expect(screen.getByText("Your class")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Take attendance — Class 6 – খ" })
    ).toBeTruthy()
  })

  it("only offers View to someone who cannot mark", () => {
    render(
      <AttendanceToday
        t={en.attendance}
        locale="en"
        day={DAY}
        dateLabel="25 Sept 2026"
        policy={POLICY}
        canMark={false}
      />
    )
    expect(
      screen.getByRole("link", { name: "View — Class 6 – খ" })
    ).toBeTruthy()
  })

  it("reads in Bangla with Western digits and flags a non-school day", () => {
    render(
      <AttendanceToday
        t={bn.attendance}
        locale="bn"
        day={{ ...DAY, isSchoolDay: false }}
        dateLabel="২৫"
        policy={POLICY}
        canMark
      />
    )
    expect(screen.getByText(bn.attendance.today.notSchoolDay)).toBeTruthy()
    expect(screen.getAllByText(/ষষ্ঠ শ্রেণি – ক/).length).toBeGreaterThan(0)
    expect(screen.getByText(/92.5%/)).toBeTruthy()
  })
})
