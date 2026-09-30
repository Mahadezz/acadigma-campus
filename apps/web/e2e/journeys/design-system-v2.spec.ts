import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey (CLAUDE.md "Rules learned in practice"): needs the
// live Supabase project with migrations + seed applied (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * D-408 (Design System v2), at both configured viewports (360×800 and
 * 1280×800) with axe: the theme control persists, the shell back chevron
 * steps back through in-app history or, on a deep link, goes to the logical
 * parent, and the lazily loaded quick-admit sheet opens.
 *
 * Theme lives in this browser context's localStorage (next-themes), so it
 * leaves no shared state on the seeded account.
 */
async function signIn(page: Page): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill("owner@acadigma.test")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

const html = (page: Page) => page.locator("html")
const shellBack = (page: Page) => page.getByRole("link", { name: /^Back/ })

test("Theme & language: light, dark and system apply at once and survive a reload", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await signIn(page)
  await page.goto("/app/settings/appearance")

  await page.getByRole("radio", { name: "Dark" }).click()
  await expect(html(page)).toHaveClass(/\bdark\b/)
  await expectNoA11yViolations(page, testInfo)
  await page.reload()
  await expect(html(page)).toHaveClass(/\bdark\b/)
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked()

  await page.getByRole("radio", { name: "Light" }).click()
  await expect(html(page)).toHaveClass(/\blight\b/)
  await expectNoA11yViolations(page, testInfo)
  await page.reload()
  await expect(html(page)).toHaveClass(/\blight\b/)
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked()

  // System follows the device: Playwright's default colour scheme is light.
  await page.getByRole("radio", { name: "System" }).click()
  await page.reload()
  await expect(page.getByRole("radio", { name: "System" })).toBeChecked()
  await expect(html(page)).toHaveClass(/\blight\b/)
})

test("shell back steps back through in-app history, and on a deep link goes to the logical parent", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await signIn(page)
  await page.goto("/app/dashboard")
  // A top-level page has no back control.
  await expect(shellBack(page)).toHaveCount(0)

  // (a) In-app: dashboard → avatar menu → Theme & language → back returns
  // to the dashboard, not to the page's logical parent (Settings).
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitem", { name: "Theme & language" }).click()
  await expect(page).toHaveURL(/\/app\/settings\/appearance$/)
  await expectNoA11yViolations(page, testInfo)
  await shellBack(page).click()
  await expect(page).toHaveURL(/\/app\/dashboard$/)

  // (b) Deep link: a fresh load has no in-app history, so back is a plain
  // link to the logical parent.
  await page.goto("/app/settings/appearance")
  await expect(shellBack(page)).toHaveAttribute("href", "/app/settings")
  await shellBack(page).click()
  await expect(page).toHaveURL(/\/app\/settings$/)
})

test("the quick-admit sheet opens from the students list", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  await signIn(page)
  await page.goto("/app/students")
  await expect(page.getByRole("heading", { name: "Students" })).toBeVisible()

  // Its code is loaded on first open (D-408, bundle budget).
  await page.getByRole("button", { name: "Admit student" }).click()
  const sheet = page.getByRole("dialog")
  await expect(sheet).toBeVisible()
  await expect(sheet.getByLabel("First name (English)")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
})
