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
vi.mock("./actions", () => ({
  archiveSection: vi.fn(),
  createSection: vi.fn(),
  createSubject: vi.fn(),
  seedStarterSubjects: vi.fn(),
}))

const { ClassesView, errorText } = await import("./classes-view")

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

function renderView(canWrite: boolean, locale: "en" | "bn" = "en") {
  const t = (locale === "bn" ? bn : en).classes
  render(
    <ClassesView
      t={t}
      locale={locale}
      overview={overview}
      subjects={[]}
      teachers={[]}
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
    expect(screen.getByText(en.classes.noSections)).toBeTruthy()
  })

  it("renders no write controls for a read-only role (AC10)", () => {
    renderView(false)
    expect(screen.queryByRole("button", { name: /add a section/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull()
    expect(screen.getByText(en.classes.readOnlyNote)).toBeTruthy()
  })

  it("uses Bangla grade names in Bangla", () => {
    renderView(true, "bn")
    expect(screen.getByText("ষষ্ঠ শ্রেণি – A")).toBeTruthy()
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
