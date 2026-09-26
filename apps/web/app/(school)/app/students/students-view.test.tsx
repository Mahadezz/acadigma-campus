import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

// FormSheet picks Sheet vs Dialog with matchMedia; jsdom has none.
vi.stubGlobal("matchMedia", () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("./actions", () => ({ quickAdmitStudent: vi.fn() }))

const { StudentsView, admitErrorText } = await import("./students-view")
const { classLabel } = await import("./format")

const rahim = {
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

const sections = [{ id: "s1", label: "Class 6 – ক" }]

describe("StudentsView", () => {
  it("lists students with class, roll and code, linking to the profile", () => {
    render(
      <StudentsView
        t={en.students}
        locale="en"
        students={[rahim]}
        hasMore={false}
        query={{ page: 1 }}
        sections={sections}
        canAdmit
        canImport
      />
    )
    expect(
      screen
        .getAllByRole("link", { name: /Rahim Uddin/ })[0]
        ?.getAttribute("href")
    ).toBe(`/app/students/${rahim.id}`)
    expect(screen.getAllByText("STU-2026-00001").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Class 6 – ক").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Admit student" })).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Import" }).getAttribute("href")
    ).toBe("/app/students/import")
  })

  it("shows no admit control to a role that cannot admit", () => {
    render(
      <StudentsView
        t={en.students}
        locale="en"
        students={[rahim]}
        hasMore={false}
        query={{ page: 1 }}
        sections={sections}
        canAdmit={false}
        canImport={false}
      />
    )
    expect(screen.queryByRole("button", { name: "Admit student" })).toBeNull()
  })

  it("puts the Bangla name first in Bangla, with Western digits", () => {
    render(
      <StudentsView
        t={bn.students}
        locale="bn"
        students={[rahim]}
        hasMore
        query={{ page: 1, q: "রহিম" }}
        sections={sections}
        canAdmit={false}
        canImport={false}
      />
    )
    expect(screen.getAllByRole("link", { name: /রহিম উদ্দিন/ })[0]).toBeTruthy()
    expect(screen.getAllByText("7").length).toBeGreaterThan(0)
    expect(
      screen.getByRole("link", { name: "পরের" }).getAttribute("href")
    ).toBe("/app/students?q=%E0%A6%B0%E0%A6%B9%E0%A6%BF%E0%A6%AE&page=2")
  })

  it("tells a search with no result apart from an empty school", () => {
    render(
      <StudentsView
        t={en.students}
        locale="en"
        students={[]}
        hasMore={false}
        query={{ page: 1, q: "zz" }}
        sections={sections}
        canAdmit
        canImport
      />
    )
    expect(screen.getByText("No students match your search.")).toBeTruthy()
  })
})

describe("classLabel and admitErrorText", () => {
  it("names the class in the reader's language, or says not enrolled", () => {
    expect(classLabel(bn.students, "bn", rahim)).toBe("ষষ্ঠ শ্রেণি – ক")
    expect(
      classLabel(en.students, "en", {
        ...rahim,
        gradeName: null,
        sectionName: null,
      })
    ).toBe("Not enrolled")
  })

  it("maps named errors and read-only mode to copy", () => {
    expect(
      admitErrorText(en.students, {
        code: "conflict",
        message: "x",
        fieldErrors: { rollNumber: ["ROLL_TAKEN"] },
      })
    ).toBe("That roll number is taken in this section.")
    expect(
      admitErrorText(en.students, { code: "payment_required", message: "x" })
    ).toBe(en.students.errors.readOnly)
    expect(
      admitErrorText(en.students, {
        code: "validation_failed",
        message: "x",
        fieldErrors: { dateOfBirth: ["Enter a real date of birth"] },
      })
    ).toBe(en.students.errors.invalid)
  })
})
