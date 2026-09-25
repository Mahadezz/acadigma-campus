import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-01 §10 "add-section-and-assign-teacher" (demo cut, D-102), at both
 * configured viewports, with axe. An owner opens /app/classes, adds a
 * section to Class 6 with a class teacher and a room, sees it listed, then
 * archives it; the Subjects tab takes the NCTB starter list.
 *
 * Needs a seeded, verified owner of a school created through the wizard
 * (Class 6 present), so it carries the same skip guard as the other live
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

test("owner adds Class 6 – section with a class teacher, then archives it", async ({
  page,
}, testInfo) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL ?? "")
  await page.getByLabel("Password").fill(process.env.E2E_OWNER_PASSWORD ?? "")
  await page.getByRole("button", { name: "Sign in" }).click()

  await page.goto("/app/classes")
  await expect(page.getByRole("heading", { name: "Classes" })).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("button", { name: "Add a section to Class 6" }).click()
  const name = `E2E${Date.now() % 1000}`
  await page.getByLabel("Section name").fill(name)
  await page.getByLabel(/Class teacher/).selectOption({ index: 1 })
  await page.getByLabel(/Room/).fill("204")
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Save" }).click()

  await expect(page.getByText(`Class 6 – ${name}`)).toBeVisible()

  await page.getByRole("button", { name: `Archive Class 6 – ${name}?` }).click()
  await page.getByRole("button", { name: "Archive", exact: true }).click()
  await expect(page.getByText(`Class 6 – ${name}`)).toHaveCount(0)

  await page.getByRole("tab", { name: "Subjects" }).click()
  await page.getByRole("button", { name: "Use the NCTB starter list" }).click()
  await expect(page.getByText("Bangla 1st Paper")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
})
