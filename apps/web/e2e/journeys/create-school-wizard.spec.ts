import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-05 Parts 3-4 §8: the whole create-school wizard, at both configured
 * viewports (`playwright.config.ts`), with axe on every step.
 *
 * Demo (§8 Part 4): create "Ideal School & College" on a phone with
 * Class 6–10 and land in `/app`. Along the way it proves AC5 (a reload at
 * step 3 resumes there with the draft intact) and AC15 (Sat–Thu preselected).
 *
 * Needs a seeded, verified account with zero school memberships (OQ-27), so
 * it carries the same skip guard as the other live journeys. It creates a
 * real school, so each run needs a fresh account: the database allows three
 * schools per user per day (AC16) and this spec runs once per viewport.
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs a seeded, verified Supabase account with zero school memberships (OQ-27)"
)

test.beforeEach(() => {
  test.skip(
    !process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD,
    "E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD are not set"
  )
})

test("create-school wizard: identity → where and when → classes → review → /app", async ({
  page,
}, testInfo) => {
  await page.goto("/login")
  await page.getByLabel("Email").fill(process.env.E2E_TEST_USER_EMAIL ?? "")
  await page
    .getByLabel("Password")
    .fill(process.env.E2E_TEST_USER_PASSWORD ?? "")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/onboarding$/)

  await page.getByRole("link", { name: /create a school/i }).click()
  await expect(page).toHaveURL(/\/onboarding\/create-school$/)

  // --- Step 1: Identity -----------------------------------------------------
  await expect(
    page.getByRole("heading", { name: /tell us about your school/i })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await page.getByLabel("School name").fill("Ideal School & College")
  // EIIN left blank: optional (§4.3), and every run would otherwise collide.
  await page.getByRole("radio", { name: "Bangla" }).click()
  await page.getByLabel("Education board").click()
  await page.getByRole("option", { name: "Dhaka" }).click()
  await page.getByRole("button", { name: "Continue" }).click()

  // --- Step 2: Where and when -------------------------------------------------
  await expect(
    page.getByRole("heading", { name: /where and when/i })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await expect(page.getByRole("button", { name: "Saturday" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(page.getByRole("button", { name: "Friday" })).toHaveAttribute(
    "aria-pressed",
    "false"
  )
  await page.getByRole("button", { name: "Continue" }).click()

  // --- Step 3: Classes, then a reload resumes here (AC5) ----------------------
  const classesHeading = page.getByRole("heading", {
    name: /which classes does your school have/i,
  })
  await expect(classesHeading).toBeVisible()
  await page.reload()
  await expect(classesHeading).toBeVisible()

  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByText("Pick at least one class.")).toBeVisible()

  await page.getByRole("button", { name: "Class 6–10" }).click()
  await expect(page.getByText("5 classes selected")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Continue" }).click()

  // --- Step 4: Review and create ------------------------------------------------
  await expect(
    page.getByRole("heading", { name: /review and create/i })
  ).toBeVisible()
  await expect(page.getByText("Ideal School & College")).toBeVisible()
  await expect(page.getByText(/day Pro trial starts now/)).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("button", { name: "Create school" }).click()
  await expect(page).toHaveURL(/\/app(\/|$)/, { timeout: 30_000 })
})
