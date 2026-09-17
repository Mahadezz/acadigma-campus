import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "./axe"

/**
 * The journey that must never break: a visitor lands, finds the way in, and reaches
 * a sign-in form that is usable with a keyboard and a screen reader. It runs at
 * 360×800 and 1280×800, and it needs no database state — so it is a genuine smoke
 * test of the deployed artefact rather than of a fixture.
 */
test.describe("smoke", () => {
  test("home page renders and links to sign-in", async ({ page }) => {
    await page.goto("/")

    await expect(
      page.getByRole("heading", { level: 1, name: /run your school/i })
    ).toBeVisible()

    await page.getByRole("link", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test("login page is accessible and rejects an empty submit", async ({
    page,
  }, testInfo) => {
    await page.goto("/login")

    const email = page.getByLabel("Email")
    const password = page.getByLabel("Password")
    await expect(email).toBeVisible()
    await expect(password).toBeVisible()

    // Client-side validation fires before any network call.
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page.getByText("Enter a valid email address.")).toBeVisible()

    await expectNoA11yViolations(page, testInfo)
  })

  test("signed-out users are sent to sign-in with a return path", async ({
    page,
  }) => {
    await page.goto("/app/dashboard")
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fdashboard$/)
  })

  test("health endpoint reports on Supabase", async ({ request }) => {
    const response = await request.get("/api/health")
    const body = await response.json()

    // Either answer is a pass: the point is that the check ran and reported.
    expect([200, 503]).toContain(response.status())
    expect(body).toMatchObject({
      status: expect.stringMatching(/^(ok|degraded)$/),
      checks: { supabase: { ok: expect.any(Boolean) } },
    })
  })
})
