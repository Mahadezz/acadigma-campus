import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Needs the live Supabase project with migrations + seed applied (CI sets
// E2E_LIVE_SUPABASE=1 once the Supabase secrets exist — OQ-26). Skipped, not
// silently passing, elsewhere.
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * F-ID-01 §9 AC1/AC2/AC3, Part 2 demo: "a new teacher registers on a phone
 * viewport ... lands on /verify with the masked address." Mailbox assertions
 * are out of scope here (no inbucket in this environment, per the feature
 * spec's e2e note); this journey stops at the verify screen the registration
 * hands back.
 */
test.describe("register then reach the verify screen", () => {
  test("a valid submission lands on /verify with the masked email", async ({
    page,
  }, testInfo) => {
    await page.goto("/register")

    const email = `e2e-${Date.now()}-${testInfo.workerIndex}@acadigma.test`
    await page.getByLabel("Full name").fill("Test Teacher")
    await page.getByLabel("Email").fill(email)
    await page
      .getByLabel("Password", { exact: true })
      .fill("Correct-Horse-Battery-99!")
    await page.getByLabel("Confirm password").fill("Correct-Horse-Battery-99!")
    await page.getByRole("checkbox").check()

    await page.getByRole("button", { name: "Create account" }).click()

    await expect(page).toHaveURL(/\/verify\?email=/)
    await expect(page.getByText(/@acadigma\.test/)).toBeVisible()
    await expect(page.getByRole("button", { name: /resend/i })).toBeVisible()

    await expectNoA11yViolations(page, testInfo)
  })

  test("AC2: registering the seeded owner email shows the duplicate-account message", async ({
    page,
  }, testInfo) => {
    await page.goto("/register")

    await page.getByLabel("Full name").fill("Duplicate Owner")
    await page.getByLabel("Email").fill("owner@acadigma.test")
    await page
      .getByLabel("Password", { exact: true })
      .fill("Correct-Horse-Battery-99!")
    await page.getByLabel("Confirm password").fill("Correct-Horse-Battery-99!")
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Create account" }).click()

    await expect(page.getByText(/already has an account/i)).toBeVisible()
    await expect(page).toHaveURL(/\/register$/)

    await expectNoA11yViolations(page, testInfo)
  })

  test('AC3: "password123" is rejected as too common, with no other rule cited', async ({
    page,
  }) => {
    await page.goto("/register")

    await page.getByLabel("Full name").fill("Weak Password")
    await page.getByLabel("Email").fill(`weak-${Date.now()}@acadigma.test`)
    await page.getByLabel("Password", { exact: true }).fill("password123")
    await page.getByLabel("Confirm password").fill("password123")
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Create account" }).click()

    await expect(page.getByText(/too common/i)).toBeVisible()
    await expect(page).toHaveURL(/\/register$/)
  })
})
