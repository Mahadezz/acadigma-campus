import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Needs the live Supabase project with migrations + seed applied, like
// school-shell-nav.spec.ts (seeded owner/teacher — supabase/seed/seed.sql).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * D-400: the school "today" dashboard. View-only — this journey never
 * writes. Owners see plan, setup checklist, people and recent activity;
 * teachers get the lighter view. Attendance and results are empty slots,
 * never sample numbers.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
  await page.goto("/app/dashboard")
}

test("owner sees the full today dashboard, axe clean", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")

  await expect(page.getByRole("heading", { level: 2 })).toBeVisible()
  await expect(page.getByText("Today's attendance")).toBeVisible()
  await expect(page.getByText("No attendance taken yet")).toBeVisible()
  await expect(page.getByText("No results yet")).toBeVisible()
  await expect(page.getByText("Plan", { exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Members" })).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Open the audit trail" })
  ).toBeVisible()

  await expectNoA11yViolations(page, testInfo)
})

test("teacher gets the lighter view", async ({ page }, testInfo) => {
  await signIn(page, "teacher@acadigma.test")

  await expect(page.getByText("No attendance taken yet")).toBeVisible()
  await expect(page.getByText("Plan", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Finish setting up your school")).toHaveCount(0)
  await expect(page.getByText("Recent activity")).toHaveCount(0)

  await expectNoA11yViolations(page, testInfo)
})
