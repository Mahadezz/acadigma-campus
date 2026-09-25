import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { buildSetupChecklist } from "@acadigma/domain/dashboard"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

import { DashboardView, type DashboardViewProps } from "./dashboard-view"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const BASE: DashboardViewProps = {
  t: en.dashboard,
  dateLabel: "Thursday 25 September",
  schoolName: "Acadigma Demo School",
  subtitle: null,
  isManager: true,
  plan: { label: "pro", trial: "14 days left in your trial", readOnly: false },
  membersByRole: { owner: 1, admin: 0, teacher: 2, staff: 0, parent: 0 },
  staffRecordCount: 0,
  checklist: buildSetupChecklist({
    hasSchoolProfile: true,
    teacherCount: 2,
    staffRecordCount: 0,
    hasAcademicYear: false,
    studentCount: 0,
  }),
  activity: [
    {
      id: "9",
      sentence: "Rahim changed the school name",
      when: "25 Sept, 09:10",
    },
  ],
}

describe("DashboardView", () => {
  it("shows an owner the school, plan, real counts, setup and activity", () => {
    render(<DashboardView {...BASE} />)
    expect(
      screen.getByRole("heading", { level: 2, name: "Acadigma Demo School" })
    ).toBeTruthy()
    expect(screen.getByText("14 days left in your trial")).toBeTruthy()
    expect(screen.getByText("3 active")).toBeTruthy()
    expect(screen.getByText("No staff records yet")).toBeTruthy()

    const setup = screen.getByRole("region", {
      name: "Finish setting up your school",
    })
    expect(within(setup).getByText("2 of 5 done")).toBeTruthy()
    expect(
      within(setup)
        .getByRole("link", { name: "Add students, To do" })
        .getAttribute("href")
    ).toBe("/app/students")
    expect(
      within(setup).getByRole("link", { name: "Invite your teachers, Done" })
    ).toBeTruthy()

    expect(screen.getByText("Rahim changed the school name")).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: "Open the audit trail" })
        .getAttribute("href")
    ).toBe("/app/audit")
  })

  it("shows attendance and results as empty slots, never a sample number", () => {
    render(<DashboardView {...BASE} />)
    expect(screen.getByText("No attendance taken yet")).toBeTruthy()
    expect(screen.getByText("No results yet")).toBeTruthy()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it("gives a teacher the lighter view: no plan, setup or activity", () => {
    render(<DashboardView {...BASE} isManager={false} activity={null} />)
    expect(screen.queryByText("Plan")).toBeNull()
    expect(screen.queryByText("Finish setting up your school")).toBeNull()
    expect(screen.queryByText("Recent activity")).toBeNull()
    expect(screen.getByText("No attendance taken yet")).toBeTruthy()
    expect(screen.getByText("Members")).toBeTruthy()
  })

  it("marks a read-only workspace on the plan card", () => {
    render(<DashboardView {...BASE} plan={{ ...BASE.plan, readOnly: true }} />)
    expect(screen.getByText("Read-only")).toBeTruthy()
  })

  it("hides the checklist once every step is done", () => {
    render(
      <DashboardView
        {...BASE}
        checklist={BASE.checklist.map((s) => ({ ...s, done: true }))}
      />
    )
    expect(screen.queryByText("Finish setting up your school")).toBeNull()
  })

  it("renders in Bengali from the same messages shape", () => {
    render(<DashboardView {...BASE} t={bn.dashboard} />)
    expect(screen.getByText("আজকের হাজিরা")).toBeTruthy()
    // Western digits inside Bengali copy (DESIGN-SYSTEM §1.6).
    expect(screen.getByText("5টির মধ্যে 2টি সম্পন্ন")).toBeTruthy()
  })
})
