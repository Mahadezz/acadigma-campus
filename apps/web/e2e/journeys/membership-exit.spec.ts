import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-03 Part 7 (D-112), at both configured viewports, with axe. Every
 * destructive step stops at its confirmation (the seeded school is shared
 * by every journey): the owner reaches Your membership from "How this school
 * works", a wrong school name stops a transfer before any password check, the
 * owner opens a teacher's Manage sheet and backs out of the removal, and the
 * teacher sees Leave but no Transfer.
 *
 * The real remove / leave / transfer effects — including "the removed
 * teacher's next request fails" with two sessions — are proven against real
 * PostgREST in `packages/db/src/repositories/members-part7.integration.test.ts`.
 * Needs seeded accounts, so it carries the live skip guard (OQ-27).
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs seeded owner and teacher accounts (OQ-27)"
)

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test("owner: Your membership, a mistyped name stops the transfer, removal backs out", async ({
  page,
}, testInfo) => {
  const email = process.env.E2E_OWNER_EMAIL
  const password = process.env.E2E_OWNER_PASSWORD
  const teacher = process.env.E2E_TEACHER_EMAIL
  test.skip(!email || !password, "E2E_OWNER_EMAIL / _PASSWORD are not set")
  await signIn(page, email ?? "", password ?? "")

  await page.goto("/app/settings/overview")
  await page
    .getByRole("link", { name: /Your membership: leave or hand over/ })
    .click()
  await expect(page).toHaveURL(/\/app\/settings\/membership/)
  await expect(
    page.getByRole("heading", { name: "Your membership" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Transfer ownership" })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  const to = page.getByLabel("New owner")
  if (await to.isVisible()) {
    await to.selectOption({ index: 1 })
    await expect(page.getByText(/will become an owner/)).toBeVisible()
    await page.getByLabel("Your password").fill("not-checked-e2e")
    await page
      .getByLabel(/Type the school's name to confirm/)
      .fill("Not this school")
    await page.getByRole("button", { name: "Transfer ownership" }).click()
    await expect(
      page.getByText("The name you typed does not match the school's name.")
    ).toBeVisible()
  }

  await page.getByRole("button", { name: /^Leave .+…$/ }).click()
  await expect(page.getByRole("button", { name: "Stay" })).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: "Stay" }).click()

  test.skip(!teacher, "E2E_TEACHER_EMAIL is not set")
  await page.goto(`/app/staff/team?q=${encodeURIComponent(teacher ?? "")}`)
  await page
    .getByRole("button", { name: /^Manage / })
    .first()
    .click()
  const start = page.getByRole("button", { name: /^Remove .+…$/ })
  await expect(start).toBeVisible()
  await start.click()
  await expect(page.getByText(/will lose access straight away/)).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await page.getByRole("button", { name: /^Keep / }).click()
  await expect(start).toBeVisible()
})

test("teacher: Your membership offers Leave but not Transfer", async ({
  page,
}, testInfo) => {
  const email = process.env.E2E_TEACHER_EMAIL
  const password = process.env.E2E_TEACHER_PASSWORD
  test.skip(!email || !password, "E2E_TEACHER_EMAIL / _PASSWORD are not set")
  await signIn(page, email ?? "", password ?? "")

  await page.goto("/app/settings/membership")
  await expect(
    page.getByRole("heading", { name: "Leave this school" })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Transfer ownership" })
  ).toHaveCount(0)
  await expectNoA11yViolations(page, testInfo)
})
