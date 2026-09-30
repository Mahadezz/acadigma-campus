import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey: needs the live project with migrations + seed (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/** F-AC-11 Part 1 (D-202): declare and remove a holiday, both viewports, axe. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

test("owner declares a 3-day holiday and removes it", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings")
  await page.getByLabel("Search settings").fill("eid")
  await page.getByRole("link", { name: /Holidays/ }).click()
  await expect(page).toHaveURL(/\/app\/settings\/calendar$/)
  await expectNoA11yViolations(page, testInfo)

  const name = `Test holiday ${testInfo.project.name} ${Date.now()}`
  await page.getByRole("button", { name: "Add holiday" }).click()
  await page.getByLabel("Name", { exact: true }).fill(name)
  await page.getByLabel("First day").fill("2026-12-20")
  await page.getByLabel("Last day").fill("2026-12-22")
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Save holiday" }).click()

  await expect(page.getByText("Holiday added.")).toBeVisible()
  const row = page.getByRole("listitem").filter({ hasText: name })
  await expect(row).toContainText("3 days")

  await row.getByRole("button", { name: /Remove/ }).click()
  await page.getByRole("button", { name: "Remove holiday" }).click()
  await expect(page.getByText("Holiday removed.")).toBeVisible()
  await expect(page.getByText(name)).toHaveCount(0)
})

test("a teacher sees holidays but no add or remove controls", async ({
  page,
}, testInfo) => {
  await signIn(page, "teacher@acadigma.test")
  await page.goto("/app/settings/calendar")
  await expect(page.getByRole("heading", { name: "Holidays" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Add holiday" })).toHaveCount(0)
  await expect(
    page.getByText("Only an owner or admin can change holidays.")
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
})

// F-AC-11 §4.3 (D-213): a make-up Friday, edited and removed.
test("owner opens a Friday, changes the reason, then removes the override", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/calendar")
  await expect(
    page.getByRole("heading", { name: "Make-up days and closures" })
  ).toBeVisible()

  const reason = `Make-up ${testInfo.project.name} ${Date.now()}`
  await page.getByRole("button", { name: "Override a day" }).click()
  await page.getByLabel("Date").fill("2026-12-25")
  await page.getByLabel("Reason").fill(reason)
  await expectNoA11yViolations(page, testInfo)
  await testInfo.attach("overrides-sheet", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
  await page.getByRole("button", { name: "Save override" }).click()
  await expect(page.getByText("Override saved.")).toBeVisible()
  const row = page.getByRole("listitem").filter({ hasText: reason })
  await expect(row).toContainText("School open")
  await testInfo.attach("overrides-owner-list", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })

  // The same date again replaces the row rather than adding a second.
  await row.getByRole("button", { name: /Edit/ }).click()
  await expect(page.getByLabel("Date")).toBeDisabled()
  await expect(
    page.getByRole("heading", { name: "Edit override" })
  ).toBeVisible()
  await testInfo.attach("overrides-edit-sheet", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
  await page.getByLabel("On this day").selectOption("no")
  await page.getByRole("button", { name: "Save override" }).click()
  await expect(page.getByText("Override saved.")).toBeVisible()
  await expect(
    page.getByRole("listitem").filter({ hasText: reason })
  ).toHaveCount(1)
  await expect(
    page.getByRole("listitem").filter({ hasText: reason })
  ).toContainText("School closed")

  await page
    .getByRole("listitem")
    .filter({ hasText: reason })
    .getByRole("button", { name: /Remove/ })
    .click()
  await page.getByRole("button", { name: "Remove override" }).click()
  await expect(page.getByText("Override removed.")).toBeVisible()
  await expect(page.getByText(reason)).toHaveCount(0)
})

test("a teacher sees overrides but no controls", async ({ page }, testInfo) => {
  await signIn(page, "teacher@acadigma.test")
  await page.goto("/app/settings/calendar")
  await expect(
    page.getByRole("heading", { name: "Make-up days and closures" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Override a day" })
  ).toHaveCount(0)
  await testInfo.attach("overrides-teacher-readonly", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
  await expectNoA11yViolations(page, testInfo)
})
