import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey (CLAUDE.md "Rules learned in practice"): needs the
// live Supabase project with migrations + seed applied (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * F-OP-07 Part 1 (settings shell, profile, branding preview) at both
 * viewports (`playwright.config.ts` phone/desktop), with axe on every screen.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test("owner finds a setting, edits the school profile and sees the save bar only when dirty", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings")
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // W1: search finds Branding by a synonym.
  await page.getByLabel("Search settings").fill("logo")
  await expect(page.getByRole("link", { name: /Branding/ })).toBeVisible()
  await expect(page.getByRole("link", { name: /School profile/ })).toHaveCount(
    0
  )
  await page.getByLabel("Search settings").fill("")

  await page.getByRole("link", { name: /School profile/ }).click()
  await expect(page).toHaveURL(/\/app\/settings\/school$/)
  await expectNoHorizontalScroll(page)
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0)

  const name = `Lakeview School ${testInfo.project.name} ${Date.now()}`
  await page.getByLabel("Legal name").fill(name)
  await expect(page.getByText("You have unsaved changes")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saved.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0)

  // An invalid EIIN is refused inline, not saved.
  await page.getByLabel("EIIN").fill("12")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText(/6 digits/).first()).toBeVisible()
})

test("owner previews the branding header live, and an unknown token is flagged", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/branding")
  await expectNoHorizontalScroll(page)

  await page.getByLabel("Header line 1").fill("{city} · {school_name}")
  await expect(page.getByText(/Unknown tokens print as blank/)).toContainText(
    "{school_name}"
  )
  await page.getByLabel("Header line 1").fill("EIIN {eiin}, {city}")
  await expect(page.getByText(/Unknown tokens/)).toHaveCount(0)
  await expect(page.getByTestId("header-preview")).toContainText("EIIN")
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saved.")).toBeVisible()
})

test("a teacher lands on the read-only overview and cannot open the profile form (AC4)", async ({
  page,
}, testInfo) => {
  await signIn(page, "teacher@acadigma.test")
  await page.goto("/app/settings")
  await expect(page).toHaveURL(/\/app\/settings\/overview$/)
  await expect(
    page.getByRole("heading", { name: "How this school works" })
  ).toBeVisible()
  await expect(page.getByText("Pass mark")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  const response = await page.goto("/app/settings/school")
  expect(response?.status()).toBe(403)
})
