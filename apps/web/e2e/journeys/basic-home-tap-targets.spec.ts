import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey (CLAUDE.md "Rules learned in practice"): needs the
// live Supabase project with migrations + seed applied (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * F-ID-10 Part 2 §9 AC9/AC16, §10 "basic home, 56px targets". The seeded
 * `owner@acadigma.test` account is used (not a teacher) specifically
 * because an owner's "All classes" block (§4.4 footnote ¹) does not depend
 * on any particular class-teacher seed data existing — `showAllClasses` is
 * `true` for every owner/admin regardless of their own assignments, so this
 * assertion holds even if no section in the seed happens to name this
 * account as `class_teacher_id`.
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
  // Same "narrow the contamination window on shared seeded state" rule
  // `basic-mode-toggle-sync.spec.ts` already follows.
  if (!/\/app/.test(page.url())) return
  await page.goto("/app/settings/display")
  const basicSwitch = page.getByRole("switch", { name: "Basic mode" })
  if (await basicSwitch.isChecked().catch(() => false)) {
    await basicSwitch.click()
    await page.waitForURL(/\/app\/dashboard$/)
  }
})

test("basic home shows the All classes block for an owner, essentials row, and every interactive element is >= 56x56px", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await turnOnBasicMode(page)
  await expectNoA11yViolations(page, testInfo)

  // §4.4 footnote ¹ / AC16.
  const allClasses = page.getByRole("link", { name: /All classes/ })
  await expect(allClasses).toBeVisible()

  // §4.4.3 essentials row.
  await expect(page.getByRole("link", { name: /Profile/ })).toBeVisible()
  await expect(page.getByRole("link", { name: /Settings/ })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Switch to full app" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Help" })).toBeVisible()

  // §5.1: every link/button on the page is >= 56x56px. No bottom nav is
  // rendered in basic mode, so this is genuinely every interactive element
  // on the screen, not a filtered subset — except the root layout's
  // sr-only "Skip to content" link (`apps/web/app/layout.tsx`), which is
  // deliberately invisible until keyboard-focused and exempt from a
  // pointer-sized-target rule the same way it is exempt from axe's
  // target-size check.
  const targets = page
    .getByRole("link")
    .or(page.getByRole("button"))
    .filter({ hasNotText: "Skip to content" })
  const count = await targets.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const box = await targets.nth(i).boundingBox()
    expect(box, `target ${i} has no bounding box`).not.toBeNull()
    if (!box) continue
    expect(box.width, `target ${i} width`).toBeGreaterThanOrEqual(56)
    expect(box.height, `target ${i} height`).toBeGreaterThanOrEqual(56)
  }
})

test("the All classes list is searchable and every row opens the existing roll call (D-405 interim)", async ({
  page,
}) => {
  await signIn(page, "owner@acadigma.test")
  await turnOnBasicMode(page)

  await page.getByRole("link", { name: /All classes/ }).click()
  await expect(page).toHaveURL(/\/app\/classes\/all$/)
  await expect(page.getByRole("heading", { name: "All classes" })).toBeVisible()

  const search = page.getByLabel("Search classes")
  await search.fill("zzz-does-not-exist-zzz")
  await expect(page.getByText("No classes match your search.")).toBeVisible()
  await search.fill("")

  const firstRow = page.getByRole("link").filter({ hasText: "–" }).first()
  await expect(firstRow).toBeVisible()
  await firstRow.click()
  await expect(page).toHaveURL(/\/app\/attendance\/[0-9a-f-]+$/)
})
