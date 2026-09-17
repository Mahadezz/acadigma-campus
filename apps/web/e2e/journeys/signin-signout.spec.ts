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
 * F-ID-01 §9 AC5/AC6, Part 3 demo: "sign in and out on a phone; after 5 bad
 * passwords the form shows a countdown." Uses the seeded `owner@acadigma.test`
 * / `password123` account from `supabase/seed/seed.sql`.
 */
test.describe("sign in and sign out", () => {
  test("wrong credentials show one generic message", async ({
    page,
  }, testInfo) => {
    await page.goto("/login")

    await page.getByLabel("Email").fill("owner@acadigma.test")
    await page.getByLabel("Password").fill("definitely-the-wrong-password")
    await page.getByRole("button", { name: "Sign in" }).click()

    await expect(
      page.getByText(/email or password is incorrect/i)
    ).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)

    await expectNoA11yViolations(page, testInfo)
  })

  test("a valid sign-in reaches the post-login landing route", async ({
    page,
  }) => {
    await page.goto("/login")

    await page.getByLabel("Email").fill("owner@acadigma.test")
    await page.getByLabel("Password").fill("password123")
    await page.getByRole("button", { name: "Sign in" }).click()

    // Part 3's resolveLandingRoute() stub always returns /onboarding until
    // F-ID-03 lands (F-ID-01 §7).
    await expect(page).toHaveURL(/\/onboarding$/)
  })

  test("signed-out visitors are redirected to /login with a return path", async ({
    page,
  }) => {
    await page.goto("/account/security")
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fsecurity$/)
  })
})
