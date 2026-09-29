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
 * F-OP-07 Part 6 (D-211), J6: two deliberate steps from Settings to a danger
 * action, and the typed-name gate. Non-mutating, so it runs on both viewports
 * against the shared seeded school.
 */
test("owner reaches the delete confirmation in two steps and must type the name", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings")
  await page.getByRole("link", { name: /Danger zone/ }).click()
  await expect(page).toHaveURL(/\/app\/settings\/danger$/)
  await expect(
    page.getByRole("button", { name: "Download export" })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("button", { name: "Delete school…" }).click()
  const confirm = page.getByRole("button", { name: "Schedule deletion" })
  await expect(confirm).toBeDisabled()
  const name = page.getByLabel(/Type Acadigma Model School to confirm/)
  await name.fill("Acadigma School")
  await expect(confirm).toBeDisabled()
  await name.fill("  acadigma model school ")
  await expect(confirm).toBeEnabled()
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("button", { name: "Back" }).click()
  await expect(
    page.getByRole("button", { name: "Delete school…" })
  ).toBeVisible()
})

test("a teacher sees no danger action", async ({ page }) => {
  await signIn(page, "teacher@acadigma.test")
  await page.goto("/app/settings/danger")
  await expect(
    page.getByText(
      "Only the school's owner can export, archive or delete this school."
    )
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Delete school…" })
  ).toHaveCount(0)
})

/**
 * Schedules and cancels a real deletion — on the seeded read-only school
 * (a lapsed trial can still leave, D-211), desktop only so the two projects
 * never race on the same row.
 */
test("the owner of a lapsed school schedules its deletion, sees the banner and cancels", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "mutates shared seed data")
  await signIn(page, "lapsed@acadigma.test")
  await page.goto("/app/settings/danger")

  await page.getByRole("button", { name: "Delete school…" }).click()
  await page
    .getByLabel(/Type Acadigma Lapsed School to confirm/)
    .fill("Acadigma Lapsed School")
  await page.getByRole("button", { name: "Schedule deletion" }).click()

  await expect(
    page.getByRole("heading", { name: "Deletion scheduled" })
  ).toBeVisible()
  await expect(page.getByText(/will be deleted on/).first()).toBeVisible()

  await page.getByRole("button", { name: "Cancel deletion" }).click()
  await expect(
    page.getByText("Deletion cancelled. The school stays.")
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Delete school…" })
  ).toBeVisible()
})
