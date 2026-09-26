import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
vi.mock("./actions", () => ({
  archiveSection: vi.fn(),
  createSection: vi.fn(),
  createSubject: vi.fn(),
  seedStarterSubjects: vi.fn(),
  setSectionSubjects: vi.fn(async () => ({ ok: true, data: { count: 2 } })),
}))

const { ClassesView, errorText } = await import("./classes-view")
const actions = await import("./actions")

const overview = {
  year: { id: "y", name: "2026" },
  grades: [
    {
      id: "g6",
      name: "Class 6",
      nameBn: "ষষ্ঠ শ্রেণি",
      levelNumber: 6,
      stage: "secondary" as const,
      sections: [
        {
          id: "s1",
          gradeLevelId: "g6",
          name: "A",
          classTeacherId: "m1",
          classTeacherName: "Nadia Rahman",
          room: "204",
          capacity: 40,
          subjects: [
            { subjectId: "sub1", teacherId: "m1" },
            // An archived subject: not in the live list, so not counted.
            { subjectId: "sub-archived", teacherId: null },
          ],
        },
      ],
    },
    {
      id: "g7",
      name: "Class 7",
      nameBn: "সপ্তম শ্রেণি",
      levelNumber: 7,
      stage: "secondary" as const,
      sections: [],
    },
  ],
}

const SUBJECTS = [
  {
    id: "sub2",
    name: "English 1st Paper",
    nameBn: null,
    code: "ENG1",
    category: "core" as const,
    subjectKind: "compulsory" as const,
  },
  {
    id: "sub1",
    name: "Bangla 1st Paper",
    nameBn: "বাংলা প্রথম পত্র",
    code: "BAN1",
    category: "core" as const,
    subjectKind: "compulsory" as const,
  },
]

function renderView(canWrite: boolean, locale: "en" | "bn" = "en") {
  const t = (locale === "bn" ? bn : en).classes
  render(
    <ClassesView
      t={t}
      locale={locale}
      overview={overview}
      subjects={SUBJECTS}
      teachers={[{ memberId: "m1", name: "Nadia Rahman" }]}
      canWriteSections={canWrite}
      canWriteSubjects={canWrite}
    />
  )
  return t
}

describe("ClassesView", () => {
  it("lists sections by their display name with teacher and room", () => {
    renderView(true)
    expect(screen.getByText("Class 6 – A")).toBeTruthy()
    expect(
      screen.getByText("Class teacher: Nadia Rahman · Room 204")
    ).toBeTruthy()
    expect(screen.getByText("1 subject")).toBeTruthy()
    expect(screen.getByText(en.classes.noSections)).toBeTruthy()
  })

  it("renders no write controls for a read-only role (AC10)", () => {
    renderView(false)
    expect(screen.queryByRole("button", { name: /add a section/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /subjects of/i })).toBeNull()
    expect(screen.getByText(en.classes.readOnlyNote)).toBeTruthy()
  })

  it("uses Bangla grade names in Bangla", () => {
    renderView(true, "bn")
    expect(screen.getByText("ষষ্ঠ শ্রেণি – A")).toBeTruthy()
  })
})

describe("section subjects sheet (D-107)", () => {
  it("adds a subject with its teacher and saves the whole list", async () => {
    renderView(true)
    fireEvent.click(
      screen.getByRole("button", { name: "Subjects of Class 6 – A" })
    )
    const bangla = screen.getByLabelText("Teacher for Bangla 1st Paper")
    expect((bangla as HTMLSelectElement).value).toBe("m1")
    expect(screen.queryByLabelText("Teacher for English 1st Paper")).toBeNull()

    fireEvent.click(screen.getByRole("checkbox", { name: "English 1st Paper" }))
    fireEvent.change(screen.getByLabelText("Teacher for English 1st Paper"), {
      target: { value: "m1" },
    })
    fireEvent.click(screen.getByRole("button", { name: en.classes.save }))

    await waitFor(() =>
      expect(actions.setSectionSubjects).toHaveBeenCalledWith({
        sectionId: "s1",
        subjects: [
          { subjectId: "sub1", teacherId: "m1" },
          // Archived after it was assigned: hidden, but kept (D-107).
          { subjectId: "sub-archived", teacherId: null },
          { subjectId: "sub2", teacherId: "m1" },
        ],
      })
    )
  })

  it("lists the section's subjects first and asks before discarding changes", () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal("confirm", confirm)
    renderView(true)
    fireEvent.click(
      screen.getByRole("button", { name: "Subjects of Class 6 – A" })
    )
    const boxes = screen.getAllByRole("checkbox").map((b) => b.id)
    expect(boxes).toEqual(["ss-sub1", "ss-sub2"])

    fireEvent.click(screen.getByRole("checkbox", { name: "English 1st Paper" }))
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    })
    expect(confirm).toHaveBeenCalled()
    expect(
      screen.getByRole("checkbox", { name: "English 1st Paper" })
    ).toBeTruthy()
  })

  it("names subjects in Bangla and keeps digits Western", () => {
    renderView(true, "bn")
    expect(screen.getByText(/1টি বিষয়/)).toBeTruthy()
    fireEvent.click(
      screen.getByRole("button", { name: "ষষ্ঠ শ্রেণি – A-এর বিষয়" })
    )
    expect(screen.getByLabelText("বাংলা প্রথম পত্র-এর শিক্ষক")).toBeTruthy()
  })
})

describe("errorText", () => {
  const t = en.classes
  it("maps field codes, read-only mode, and anything else", () => {
    expect(
      errorText(t, {
        code: "conflict",
        message: "x",
        fieldErrors: { name: ["SECTION_NAME_TAKEN"] },
      })
    ).toBe(t.errors.SECTION_NAME_TAKEN)
    expect(errorText(t, { code: "payment_required", message: "x" })).toBe(
      t.errors.readOnly
    )
    expect(errorText(t, { code: "internal", message: "x" })).toBe(
      t.errors.generic
    )
  })
})
