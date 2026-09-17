import { expect, test } from "@playwright/test"

/**
 * F-ID-01 §9 AC6: "five consecutive wrong passwords for one email within 15
 * minutes, the sixth is RATE_LIMITED with a countdown and no credential check
 * is performed." Uses a unique email per run so parallel workers and repeated
 * runs never share a throttle bucket.
 *
 * Requires migration 20260917020000_identity_auth.sql (the `auth_throttle`
 * table and `public.throttle_*` RPCs) to be applied to the target Supabase
 * project — see the test report for whether that was true when this ran.
 */
test.describe("sign-in throttling", () => {
  test("the sixth consecutive failure shows a rate-limit countdown", async ({
    page,
  }) => {
    const email = `throttle-${Date.now()}-${Math.random().toString(36).slice(2)}@acadigma.test`

    await page.goto("/login")
    await page.getByLabel("Email").fill(email)

    for (let attempt = 1; attempt <= 5; attempt++) {
      await page.getByLabel("Password").fill(`wrong-password-${attempt}`)
      await page.getByRole("button", { name: "Sign in" }).click()
      await expect(
        page.getByText(/email or password is incorrect/i)
      ).toBeVisible()
    }

    await page.getByLabel("Password").fill("wrong-password-6")
    await page.getByRole("button", { name: /sign in/i }).click()

    await expect(page.getByText(/too many attempts/i)).toBeVisible()
    await expect(
      page.getByRole("button", { name: /try again in \d+s/i })
    ).toBeVisible()
  })
})
