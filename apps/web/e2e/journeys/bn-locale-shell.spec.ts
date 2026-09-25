import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey (CLAUDE.md "Rules learned in practice"): needs the
// live Supabase project with migrations + seed applied (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * F-ID-02 §4.3 / Part 4 (demo cut): the বাংলা switch now covers the whole
 * signed-in school shell, not just the auth screens (`docs/features/01-identity/
 * F-ID-02-profiles-and-preferences.md` §11 OQ-1). Runs at both viewports
 * (`playwright.config.ts` phone/desktop) with axe on every screen — §10's
 * "Bengali strings commonly run 20-40% longer than English" is exactly what
 * `expectNoHorizontalScroll` catches at 360px that a text-content assertion
 * would not.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

async function switchToBengali(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitemradio", { name: "বাংলা" }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "bn")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test("switching to বাংলা from the school shell's user menu translates dashboard, nav and settings", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await switchToBengali(page)

  // Dashboard: the shell chrome and the page itself both read বাংলা.
  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await expect(page.getByRole("heading", { name: /^আজ/ })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "ওয়ার্কস্পেস নিশ্চিত হয়েছে" })
  ).toBeVisible()
  await expect(page.getByText(/সাইন ইন করা আছে/)).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectNoA11yViolations(page, testInfo)

  // Nav: `SchoolBottomNav`/`SchoolSidebar` now receive `locale` (previously
  // hardcoded to "en" regardless of the active locale).
  const nav = page.getByRole("navigation", { name: "School" })
  await expect(nav.getByRole("link", { name: "সারসংক্ষেপ" })).toBeVisible()

  // Settings: F-OP-07's screens already went through `getMessages()`, this
  // only proves the cookie set by the in-app switch (not a fresh sign-in
  // with a pre-set cookie) still resolves বাংলা on the next navigation
  // (F-ID-02 AC6).
  await page.goto("/app/settings")
  await expect(page.getByRole("heading", { name: "সেটিংস" })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectNoA11yViolations(page, testInfo)

  // The read-only banner's own title (it only renders on a read-only
  // workspace) is covered by unit/message-catalogue coverage, not this
  // journey — the seeded owner account is on a writable plan.
})

test("switching back to English is reachable from the same menu", async ({
  page,
}) => {
  await signIn(page, "owner@acadigma.test")
  await switchToBengali(page)

  await page.getByRole("button", { name: "অ্যাকাউন্ট মেনু" }).click()
  await page.getByRole("menuitemradio", { name: "English" }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(
    page.getByRole("heading", { name: "Workspace resolved" })
  ).toBeVisible()
})
