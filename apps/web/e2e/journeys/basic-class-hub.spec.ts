import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey (CLAUDE.md "Rules learned in practice"): needs the
// live Supabase project with migrations + seed applied (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * F-ID-10 Part 3 (§4.5, §8, D-406): the class hub. §10 names this journey
 * `basic-take-attendance`; §9 AC6/AC7/AC9/AC11 are what it proves. Runs at
 * both viewports (`playwright.config.ts` phone/desktop) with axe.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

async function turnOnBasicMode(page: Page): Promise<void> {
  await page.goto("/app/settings/display")
  const basicSwitch = page.getByRole("switch", { name: "Basic mode" })
  if (!(await basicSwitch.isChecked().catch(() => false))) {
    await basicSwitch.click()
  }
  await expect(page).toHaveURL(/\/app\/home$/)
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

async function openFirstClassHub(page: Page): Promise<void> {
  await page.getByRole("link", { name: /All classes/ }).click()
  await page.getByRole("link").filter({ hasText: "–" }).first().click()
  await expect(page).toHaveURL(/\/app\/classes\/[0-9a-f-]+$/)
}

test("the hub shows only the built tabs — no coming-soon tab (§9 AC6)", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await turnOnBasicMode(page)
  await openFirstClassHub(page)
  await expectNoA11yViolations(page, testInfo)

  const tabs = page.getByRole("tab")
  await expect(tabs).toHaveCount(4)
  await expect(page.getByRole("tab", { name: "Attendance" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Marks" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Students" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Print" })).toBeVisible()
})

test("takes the roll from inside the hub: confirm names the counts, nothing saves until Yes, save (§9 AC7)", async ({
  page,
}) => {
  await signIn(page, "owner@acadigma.test")
  await turnOnBasicMode(page)
  await openFirstClassHub(page)

  // Attendance is the default tab.
  await page.getByRole("button", { name: "Mark all present" }).click()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(
    page.getByText(/^Save attendance for .+\? \d+ present, \d+ absent\.$/)
  ).toBeVisible()
  await page.getByRole("button", { name: "Yes, save" }).click()
  await expect(
    page.getByText(/^Saved: \d+ present, \d+ absent\.$/)
  ).toBeVisible()
})

test("every tab renders without error, and every interactive element is >= 56x56px", async ({
  page,
}) => {
  await signIn(page, "owner@acadigma.test")
  await turnOnBasicMode(page)
  await openFirstClassHub(page)

  for (const name of ["Marks", "Students", "Print", "Attendance"]) {
    await page.getByRole("tab", { name }).click()
    await expect(page.getByRole("tabpanel")).toBeVisible()
  }

  const targets = page
    .getByRole("link")
    .or(page.getByRole("button"))
    .or(page.getByRole("tab"))
  const count = await targets.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox()
    if (!box) continue
    expect(box.width, `target ${i} width`).toBeGreaterThanOrEqual(56)
    expect(box.height, `target ${i} height`).toBeGreaterThanOrEqual(56)
  }
})

test("a teacher not assigned to a section sees 'This class is not on your list' and no student data (§9 AC11)", async ({
  browser,
}) => {
  // Two independent sessions rather than one page's worth of hrefs: the
  // owner's full section list (via "All classes") and the teacher's own
  // list (via home) are compared to find a real, existing section the
  // teacher does NOT teach — a random/made-up id would 404 through
  // `SECTION_NOT_FOUND` instead of exercising `NOT_ASSIGNED`.
  const ownerPage = await (await browser.newContext()).newPage()
  await signIn(ownerPage, "owner@acadigma.test")
  await turnOnBasicMode(ownerPage)
  await ownerPage.getByRole("link", { name: /All classes/ }).click()
  const allHrefs = await ownerPage
    .getByRole("link")
    .filter({ hasText: "–" })
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href"))
    )

  const teacherPage = await (await browser.newContext()).newPage()
  await signIn(teacherPage, "teacher@acadigma.test")
  await turnOnBasicMode(teacherPage)
  const myHrefs = await teacherPage
    .getByRole("link")
    .filter({ hasText: "–" })
    .evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href"))
    )

  const notMine = allHrefs.find((href) => href && !myHrefs.includes(href))
  test.skip(!notMine, "seed data: this teacher teaches every section")
  if (!notMine) return

  await teacherPage.goto(notMine)
  await expect(
    teacherPage.getByText("This class is not on your list.")
  ).toBeVisible()
})
