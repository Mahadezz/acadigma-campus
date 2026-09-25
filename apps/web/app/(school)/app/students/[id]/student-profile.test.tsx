import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

import { StudentProfile } from "./student-profile"

const student = {
  id: "33333333-3333-4333-8333-333333333333",
  studentCode: "STU-2026-00001",
  fullName: "Rahim Uddin",
  fullNameBn: "রহিম উদ্দিন",
  gender: "male" as const,
  status: "active" as const,
  sectionId: "s1",
  rollNumber: 7,
  sectionName: "ক",
  gradeName: "Class 6",
  gradeNameBn: "ষষ্ঠ শ্রেণি",
}

const details = {
  dateOfBirth: "2014-03-09",
  guardians: [
    {
      id: "g1",
      relation: "father" as const,
      fullName: "Karim Uddin",
      fullNameBn: null,
      phone: "+8801712345678",
      isPrimary: true,
    },
  ],
}

describe("StudentProfile", () => {
  it("shows date of birth, age and a callable guardian when allowed", () => {
    render(
      <StudentProfile
        t={en.students}
        locale="en"
        student={student}
        details={details}
        privateError={false}
        today="2026-09-25"
      />
    )
    expect(screen.getByRole("heading", { name: "Rahim Uddin" })).toBeTruthy()
    expect(screen.getByText(/9 Mar 2014 · 12 y 6 m/)).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: "Call Karim Uddin" })
        .getAttribute("href")
    ).toBe("tel:+8801712345678")
  })

  it("locks the private block when RLS returned nothing (AC7)", () => {
    render(
      <StudentProfile
        t={en.students}
        locale="en"
        student={student}
        details={null}
        privateError={false}
        today="2026-09-25"
      />
    )
    expect(screen.getByText(en.students.profile.locked)).toBeTruthy()
    expect(screen.queryByText(/2014/)).toBeNull()
    expect(screen.queryByText(/1712345678/)).toBeNull()
  })

  it("reads in Bangla with Western digits", () => {
    render(
      <StudentProfile
        t={bn.students}
        locale="bn"
        student={student}
        details={details}
        privateError={false}
        today="2026-09-25"
      />
    )
    expect(screen.getByRole("heading", { name: "রহিম উদ্দিন" })).toBeTruthy()
    expect(screen.getByText("ষষ্ঠ শ্রেণি – ক")).toBeTruthy()
    expect(screen.getByText(/2014/)).toBeTruthy()
    expect(screen.getByText(/12 বছর 6 মাস/)).toBeTruthy()
  })
})
