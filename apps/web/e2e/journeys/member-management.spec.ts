import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-03 Part 6 (D-111), at both configured viewports, with axe: an owner
 * manages the school's custom labels (create → see → delete) and opens a
 * member's management sheet. Needs a seeded owner, so it carries the live
 * skip guard (OQ-27). The role/staff/label writes themselves are proven
 * against real PostgREST in
 * `packages/db/src/repositories/members-part6.integration.test.ts` and in
 * `supabase/tests/39b_member_staff_fields.sql`.
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs a seeded owner account (OQ-27)"
)

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test("owner creates and deletes a custom label", async ({ page }, testInfo) => {
  const email = process.env.E2E_OWNER_EMAIL
  const password = process.env.E2E_OWNER_PASSWORD
  test.skip(!email || !password, "E2E_OWNER_EMAIL / _PASSWORD are not set")
  await signIn(page, email ?? "", password ?? "")

  await page.goto("/app/settings/labels")
  await expect(
    page.getByRole("heading", { name: "Custom labels" })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  const name = `E2E Coordinator ${Date.now()}`
  await page.getByRole("button", { name: "New label" }).click()
  await page.getByLabel("Name").fill(name)
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Save" }).click()

  await expect(page.getByText(name)).toBeVisible()

  await page.getByRole("button", { name: `Delete ${name}` }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.getByText(name)).toHaveCount(0)
})

test("owner opens a member management sheet", async ({ page }, testInfo) => {
  const email = process.env.E2E_OWNER_EMAIL
  const password = process.env.E2E_OWNER_PASSWORD
  test.skip(!email || !password, "E2E_OWNER_EMAIL / _PASSWORD are not set")
  await signIn(page, email ?? "", password ?? "")

  await page.goto("/app/staff/team")
  const manage = page.getByRole("button", { name: /^Manage/ }).first()
  await expect(manage).toBeVisible()
  await manage.click()
  await expect(
    page.getByRole("button", { name: "Save staff details" })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
})
