import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Needs the live Supabase project with migrations + seed applied (CI sets
// E2E_LIVE_SUPABASE=1 once the Supabase secrets exist — OQ-26). Skipped, not
// silently passing, elsewhere.
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * M0 wrap-up (D-56): the school shell (`apps/web/app/(school)/app/layout.tsx`)
 * now picks its nav from the single nav system in `@acadigma/domain/nav`
 * (`getNavConfig(workspaceType, role)`, filtered by the plans engine's
 * entitled modules) and renders `BottomNavFromConfig` on phone /
 * `SidebarFromConfig` on desktop — replacing the old hand-rolled `SCHOOL_NAV`
 * that never read either nav engine. This proves the role -> curated tree
 * selection end to end for the two seeded school-workspace roles
 * (`owner@acadigma.test`, `teacher@acadigma.test` — `supabase/seed/seed.sql`),
 * on both viewports (`playwright.config.ts`'s `phone`/`desktop` projects).
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

test.describe("school shell nav — owner", () => {
  test("owner sees the owner/admin bottom-nav slots, and the owner-only More items", async ({
    page,
  }, testInfo) => {
    await signIn(page, "owner@acadigma.test")
    await expect(page.getByText("Role owner", { exact: false })).toBeVisible()

    const isPhone = testInfo.project.name === "phone"
    const nav = page.getByRole("navigation", { name: "School" })

    // DESIGN-SYSTEM §3.2 school owner/admin: Overview, Attendance, Students, Messages.
    await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Students" })).toBeVisible()

    if (isPhone) {
      await page.getByRole("button", { name: /more/i }).click()
      // Owner-only within More (DESIGN-SYSTEM §3.2 footnote): Billing & plan, Audit log.
      await expect(page.getByText("Billing & plan")).toBeVisible()
      await expect(page.getByText("Audit log")).toBeVisible()
    } else {
      await expect(
        page.getByRole("link", { name: "Billing & plan" })
      ).toBeVisible()
      await expect(page.getByRole("link", { name: "Audit log" })).toBeVisible()
    }

    await expectNoA11yViolations(page, testInfo)
  })
})

test.describe("school shell nav — teacher", () => {
  test("teacher sees the teacher's daily-loop bottom-nav slots, and no owner-only items", async ({
    page,
  }, testInfo) => {
    await signIn(page, "teacher@acadigma.test")
    await expect(page.getByText("Role teacher", { exact: false })).toBeVisible()

    const isPhone = testInfo.project.name === "phone"
    const nav = page.getByRole("navigation", { name: "School" })

    // DESIGN-SYSTEM §3.2 school teacher: Today, Attendance, Timetable, Messages.
    await expect(nav.getByRole("link", { name: "Today" })).toBeVisible()
    await expect(nav.getByRole("link", { name: "Timetable" })).toBeVisible()

    if (isPhone) {
      await page.getByRole("button", { name: /more/i }).click()
      await expect(page.getByText("Audit log")).not.toBeVisible()
    } else {
      await expect(
        page.getByRole("link", { name: "Audit log" })
      ).not.toBeVisible()
    }

    await expectNoA11yViolations(page, testInfo)
  })
})
