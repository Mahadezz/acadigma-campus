import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"
import { setLocale } from "../locale"

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

// D-408: the language picker moved from the avatar menu to Settings →
// Theme & language; the avatar menu keeps a link to it.
async function switchToBengali(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Account menu" }).click()
  await page.getByRole("menuitem", { name: "Theme & language" }).click()
  await expect(page).toHaveURL(/\/app\/settings\/appearance$/)
  await setLocale(page, "bn")
  await page.goto("/app/dashboard")
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// D-401: the switch now persists to `profiles.locale` (`updateLocale`), not
// only the per-context cookie — on the shared seeded `owner@acadigma.test`
// account, that is durable, cross-test state every other seeded-account
// journey in this repo assumes is English. Always leave it English behind
// this suite, pass or fail, to keep that assumption true for tests running
// in other workers/files (this narrows the contamination window; it does not
// eliminate a race with a test that happens to run concurrently while this
// suite is mid-বাংলা — a dedicated account is the real fix, tracked as a
// follow-up rather than built here).
test.afterEach(async ({ page }, testInfo) => {
  // The reset gets its own budget: sharing the test's 30 s, a slow body left
  // it cut off mid-way and the seeded owner stuck in বাংলা/basic mode for the
  // rest of the e2e-live shard (D-76).
  testInfo.setTimeout(testInfo.timeout + 30_000)
  // Re-render from the server first: a test cut off mid-switch can leave
  // the stored locale বাংলা behind an English page (D-76).
  if (/\/app/.test(page.url())) await setLocale(page, "en")
})

test("switching to বাংলা from Theme & language translates dashboard, nav and settings", async ({
  page,
}, testInfo) => {
  // A locale write + refresh and two axe scans of বাংলা pages: past the
  // 30 s default on the e2e-live runner (D-76).
  test.setTimeout(90_000)
  await signIn(page, "owner@acadigma.test")
  await switchToBengali(page)

  // Dashboard: the shell chrome and the page itself both read বাংলা.
  await expect(page).toHaveURL(/\/app\/dashboard$/)
  // The real dashboard (D-400/D-407) replaced the "Workspace resolved"
  // placeholder this journey was written against; "আজ" alone, since
  // "আজকের হাজিরা" also starts with it (e2e-live, D-76).
  await expect(
    page.getByRole("heading", { name: "আজ", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "আজকের হাজিরা" })
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

test("switching back to English is reachable from the same screen", async ({
  page,
}) => {
  // A locale write + refresh and two axe scans of বাংলা pages: past the
  // 30 s default on the e2e-live runner (D-76).
  test.setTimeout(90_000)
  await signIn(page, "owner@acadigma.test")
  await switchToBengali(page)

  await setLocale(page, "en")
  await page.goto("/app/dashboard")
  await expect(
    page.getByRole("heading", { name: "Today's attendance" })
  ).toBeVisible()
})
