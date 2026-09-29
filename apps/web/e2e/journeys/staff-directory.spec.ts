import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

// Seeded-account journey: needs the live project with migrations + seed (OQ-27).
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

/**
 * F-OP-06 Part 2 (D-209): the directory shows every active non-parent
 * member — including the owner, who has no `staff_records` row in the seed
 * (the exact gap D-209 fixes) — search narrows it, and the person sheet
 * shows designation, department and a working Call action.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

test("owner sees the whole directory, searches Farhana, and opens her sheet", async ({
  page,
}, testInfo) => {
  await signIn(page, "owner@acadigma.test")
  await page.goto("/app/staff")
  await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible()

  // The owner has no staff_records row in the seed — D-209's own bug, proven
  // live: they still appear, by their own directory search.
  await page.getByLabel("Search by name, code, email or phone").fill("Rezaul")
  await page.getByRole("button", { name: "Search" }).click()
  await expect(page.getByText("Rezaul Karim")).toBeVisible()

  await page.getByLabel("Search by name, code, email or phone").fill("Farhana")
  await page.getByRole("button", { name: "Search" }).click()
  await expect(page.getByText("Farhana Akter")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  await page
    .getByRole("link", { name: /Farhana Akter/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/app\/staff\/.+/)
  await expect(
    page.getByRole("heading", { name: "Farhana Akter" })
  ).toBeVisible()
  await expect(page.getByText("Senior Teacher")).toBeVisible()
  await expect(page.getByText("Science")).toBeVisible()
  await expect(page.getByRole("link", { name: "Call" })).toHaveAttribute(
    "href",
    "tel:+8801711000002"
  )
  await expectNoA11yViolations(page, testInfo)
})

test("a parent is redirected away from the staff directory", async ({
  page,
}) => {
  // The seeded parent lands on their Personal workspace (seed.sql §5), not
  // /app; switching to the school puts the `parent` membership in play, as
  // shell-gate.spec.ts does.
  await page.goto("/login")
  await page.getByLabel("Email").fill("parent@acadigma.test")
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/personal")
  await page.getByRole("button", { name: /switch workspace/i }).click()
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("button", { name: "Acadigma Model School" })
    .click()
  await expect(page).toHaveURL("/family")

  await page.goto("/app/staff")
  // A parent's canonical shell is /family (F-ID-03 §4.4); requireShell("school")
  // redirects them there before staff.view is ever checked.
  await expect(page).toHaveURL(/\/family/)

  // Leave the seeded parent on Personal for later journeys (D-76).
  await page.getByRole("button", { name: /switch workspace/i }).click()
  await page
    .getByRole("dialog", { name: "Switch workspace" })
    .getByRole("button", { name: /Personal/ })
    .click()
  await expect(page).toHaveURL("/personal")
})
