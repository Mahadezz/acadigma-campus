import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-02 §10 "quick-admit" (demo cut, D-103), at both configured
 * viewports, with axe. An owner opens /app/students, admits a student into
 * a live section with a guardian, finds them by search, and opens the
 * profile, where the date of birth and the guardian's phone are shown.
 *
 * Needs a seeded, verified owner of a school with at least one section in
 * the current year, so it carries the same skip guard as the other live
 * journeys (OQ-27).
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs a seeded school owner account (OQ-27)"
)

test.beforeEach(() => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL || !process.env.E2E_OWNER_PASSWORD,
    "E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD are not set"
  )
})

test("owner admits a student, finds them and opens the profile", async ({
  page,
}, testInfo) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL ?? "")
  await page.getByLabel("Password").fill(process.env.E2E_OWNER_PASSWORD ?? "")
  await page.getByRole("button", { name: "Sign in" }).click()

  await page.goto("/app/students")
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  const last = `E2E${Date.now() % 100000}`
  await page.getByRole("button", { name: "Admit student" }).click()
  await page.getByLabel("First name (English)").fill("Rahim")
  await page.getByLabel("Last name (English)").fill(last)
  await page.getByLabel(/Full name in Bangla/).fill("রহিম উদ্দিন")
  await page.getByLabel("Male").check()
  await page.getByLabel("Date of birth").fill("2014-03-09")
  await page.getByLabel("Class and section").selectOption({ index: 1 })
  await page.getByLabel("Guardian's name").fill("Karim Uddin")
  await page.getByLabel("Guardian's mobile number").fill("01712345678")
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Admit student" }).last().click()

  await expect(page.getByText(/is admitted as STU-/)).toBeVisible()

  await page.getByLabel("Search by name or student ID").fill(last)
  await page.getByRole("button", { name: "Search" }).click()
  await page
    .getByRole("link", { name: new RegExp(`Rahim ${last}`) })
    .first()
    .click()

  await expect(
    page.getByRole("heading", { name: `Rahim ${last}` })
  ).toBeVisible()
  await expect(page.getByText("1712345678")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
})
