import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-03 Part 5 (D-110) "team-roster-search-and-paginate", at both
 * configured viewports, with axe: the owner opens Team & access, finds
 * themselves by email on the Active tab (a server-side search), sees the
 * Waiting and Removed tabs, and a teacher is refused the page.
 *
 * Approve / turn down need a pending join request, which no product path
 * creates yet (join codes are F-ID-04); that journey is proven against real
 * PostgREST in `packages/db/src/repositories/members.integration.test.ts`.
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

test("owner searches the roster and moves between the tabs", async ({
  page,
}, testInfo) => {
  const email = process.env.E2E_OWNER_EMAIL
  const password = process.env.E2E_OWNER_PASSWORD
  test.skip(!email || !password, "E2E_OWNER_EMAIL / _PASSWORD are not set")
  await signIn(page, email ?? "", password ?? "")

  await page.goto("/app/staff/team")
  await expect(
    page.getByRole("heading", { name: "Team & access" })
  ).toBeVisible()
  const tabs = page.getByRole("navigation", { name: "Show members by status" })
  await expect(tabs.getByRole("link", { name: "Active" })).toHaveAttribute(
    "aria-current",
    "page"
  )
  await expectNoA11yViolations(page, testInfo)

  await page.getByLabel("Search by name or email").fill(email ?? "")
  await page.getByRole("button", { name: "Search" }).click()
  await expect(page).toHaveURL(/[?&]q=/)
  // DataList renders the card list and the table, one hidden per viewport:
  // assert on the one this viewport shows (e2e-live, D-76).
  await expect(
    page
      .getByText(email ?? "")
      .filter({ visible: true })
      .first()
  ).toBeVisible()

  await page.getByLabel("Search by name or email").fill("no-such-person-e2e")
  await page.getByRole("button", { name: "Search" }).click()
  await expect(page.getByText("No one matches that search.")).toBeVisible()

  await tabs.getByRole("link", { name: "Waiting" }).click()
  await expect(page).toHaveURL(/tab=pending/)
  await expect(tabs.getByRole("link", { name: "Waiting" })).toHaveAttribute(
    "aria-current",
    "page"
  )
  await expectNoA11yViolations(page, testInfo)

  await tabs.getByRole("link", { name: "Removed" }).click()
  await expect(page).toHaveURL(/tab=removed/)
  await expectNoA11yViolations(page, testInfo)
})

test("a teacher is refused Team & access", async ({ page }) => {
  const email = process.env.E2E_TEACHER_EMAIL
  const password = process.env.E2E_TEACHER_PASSWORD
  test.skip(!email || !password, "E2E_TEACHER_EMAIL / _PASSWORD are not set")
  await signIn(page, email ?? "", password ?? "")

  // D-409: a loading.tsx above the page streams a 200 before forbidden() runs, so
  // the contract is the 403 *page* (no data), not the status line.
  await page.goto("/app/staff/team")
  await expect(page.getByText("You do not have access")).toBeVisible()
  // The protected screen itself must be absent, not merely covered.
  await expect(
    page.getByRole("button", { name: /remove access/i })
  ).toHaveCount(0)
})
