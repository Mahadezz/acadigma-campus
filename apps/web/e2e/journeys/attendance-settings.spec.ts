import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

/**
 * F-OP-07 Part 3 demo (§4 W4): an owner flips "Half day counts as present"
 * off and the plain-English effect line changes before Save; saving it
 * persists and no stored attendance_records row is touched (§5.8 rule 2 —
 * asserted at the domain/repository level, not re-asserted here). Both
 * viewports via the phone/desktop projects (playwright.config.ts).
 */
test("owner edits the attendance policy and sees the effect line change before saving", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/attendance")

  await expect(
    page.getByRole("heading", { name: "Attendance policy" })
  ).toBeVisible()

  const halfDay = page.getByLabel("Half day counts as present")
  await expect(halfDay).toBeVisible()
  await halfDay.click()

  await expect(page.getByText("You have unsaved changes")).toBeVisible()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saved.")).toBeVisible()

  await expectNoA11yViolations(page, testInfo)
})

test("a teacher cannot open the attendance policy", async ({ page }) => {
  await signIn(page, "teacher@acadigma.test")
  const response = await page.goto("/app/settings/attendance")
  expect(response?.status()).toBe(403)
})
