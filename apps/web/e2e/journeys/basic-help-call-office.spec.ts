import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey (CLAUDE.md "Rules learned in practice"): needs the
// live Supabase project with migrations + seed applied (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * F-ID-10 §4.7/§9 AC10, §10 "basic-help-call-office". The seeded school's
 * `school_profiles.contact_phone` is `+8802222000000`
 * (`supabase/seed/seed.sql`), so the `tel:` href is asserted exactly rather
 * than merely "a tel: link exists".
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

test.afterEach(async ({ page }) => {
  if (!/\/app/.test(page.url())) return
  await page.goto("/app/settings/display")
  const basicSwitch = page.getByRole("switch", { name: "Basic mode" })
  if (await basicSwitch.isChecked().catch(() => false)) {
    await basicSwitch.click()
    await page.waitForURL(/\/app\/dashboard$/)
  }
})

test("Help opens a sheet with catalogue text and a Call school office tel: link (AC10)", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/display")
  const basicSwitch = page.getByRole("switch", { name: "Basic mode" })
  if (!(await basicSwitch.isChecked().catch(() => false))) {
    await basicSwitch.click()
  }
  await expect(page).toHaveURL(/\/app\/home$/)

  await page.getByRole("button", { name: "Help" }).click()
  const sheet = page.getByRole("dialog")
  await expect(sheet).toBeVisible()
  await expect(
    sheet.getByText(/one of your classes|basic-mode home/i)
  ).toBeVisible()

  const callLink = sheet.getByRole("link", { name: /Call school office/ })
  await expect(callLink).toHaveAttribute("href", "tel:+8802222000000")
  await expectNoA11yViolations(page, testInfo)
})

test("Help shows the same Call school office link from a page other than home (D-405: every /app page gets the basic shell)", async ({
  page,
}) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/settings/display")
  const basicSwitch = page.getByRole("switch", { name: "Basic mode" })
  if (!(await basicSwitch.isChecked().catch(() => false))) {
    await basicSwitch.click()
  }

  await page.goto("/app/classes/all")
  await page.getByRole("button", { name: "Help" }).click()
  const sheet = page.getByRole("dialog")
  await expect(
    sheet.getByRole("link", { name: /Call school office/ })
  ).toHaveAttribute("href", "tel:+8802222000000")

  // The Home button is present on any non-home basic page (§4.10).
  await page.getByRole("link", { name: /Home/ }).click()
  await expect(page).toHaveURL(/\/app\/home$/)
})
