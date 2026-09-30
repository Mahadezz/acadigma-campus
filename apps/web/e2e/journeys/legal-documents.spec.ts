import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * D-114 (legal audit item 4): the documents the sign-up box asks people to
 * agree to exist, are public, and are linked from the box itself. Needs no
 * database state, so it runs on every e2e job at both viewports.
 */
test.describe("legal documents", () => {
  for (const [path, heading] of [
    ["/legal/terms", "Terms of Use (interim)"],
    ["/legal/privacy", "Privacy Notice (interim)"],
    ["/legal/dpa", "Data Processing Agreement (interim)"],
  ] as const) {
    test(`${path} is public and readable`, async ({ page }, testInfo) => {
      await page.goto(path)
      await expect(
        page.getByRole("heading", { level: 1, name: heading })
      ).toBeVisible()
      await expect(
        page.getByText(/not yet been reviewed by a lawyer/)
      ).toBeVisible()
      await expectNoA11yViolations(page, testInfo)
    })
  }

  test("an unknown document is a 404", async ({ page }) => {
    const response = await page.goto("/legal/cookies")
    expect(response?.status()).toBe(404)
  })

  test("the sign-up box links to the Terms and the Privacy Notice", async ({
    page,
  }) => {
    await page.goto("/register")
    // Scoped to the form: the site footer (D-410) links the same documents.
    await expect(
      page.getByRole("main").getByRole("link", { name: "Terms of Use" })
    ).toHaveAttribute("href", "/legal/terms")
    await expect(
      page.getByRole("main").getByRole("link", { name: "Privacy Notice" })
    ).toHaveAttribute("href", "/legal/privacy")
    await expect(page.getByText(/I am 18 or older/)).toBeVisible()
  })
})
