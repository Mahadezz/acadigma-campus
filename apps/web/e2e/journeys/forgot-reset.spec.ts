import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-01 §9 AC8, Part 4 demo (the request half — the actual mailbox round trip
 * needs a real inbox, out of scope for this environment per the feature spec's
 * e2e note). Both an existing and a non-existent address must produce the
 * identical response.
 */
test.describe("forgot password request is enumeration-safe", () => {
  test("a known address shows the generic success message", async ({
    page,
  }, testInfo) => {
    await page.goto("/forgot")
    await page.getByLabel("Email").fill("owner@acadigma.test")
    await page.getByRole("button", { name: "Send reset link" }).click()

    await expect(
      page.getByText(/if that address has an account/i)
    ).toBeVisible()

    await expectNoA11yViolations(page, testInfo)
  })

  test("an address with no account shows the SAME generic message", async ({
    page,
  }) => {
    await page.goto("/forgot")
    await page
      .getByLabel("Email")
      .fill(`no-such-user-${Date.now()}@acadigma.test`)
    await page.getByRole("button", { name: "Send reset link" }).click()

    await expect(
      page.getByText(/if that address has an account/i)
    ).toBeVisible()
  })
})

test.describe("reset with an invalid token", () => {
  test("shows a dedicated invalid-link state, not a toast", async ({
    page,
  }, testInfo) => {
    await page.goto("/reset")

    await expect(
      page.getByRole("heading", { name: /link has expired/i })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: /send a new link/i })
    ).toBeVisible()

    await expectNoA11yViolations(page, testInfo)
  })
})
