import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "./axe"

/**
 * Visual + a11y smoke test for every `packages/ui` primitive (M0 chunk 0.9),
 * rendered on the dev-only `/design` page. Runs at both configured
 * viewports (360×800 phone, 1280×800 desktop — `playwright.config.ts`).
 *
 * The page 404s only on the real Vercel production deployment
 * (`VERCEL_ENV === "production"`, unset here), so it renders normally against
 * this suite's `next start` server. If this test ever 404s in CI, that is a
 * real regression in the guard, not a flake to retry away.
 */
test.describe("design smoke — packages/ui primitives", () => {
  test("renders every primitive and is axe clean", async ({
    page,
  }, testInfo) => {
    await page.goto("/design")

    // One <h1> (TopBar) plus one <h2> per primitive section.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Design smoke"
    )

    for (const heading of [
      "StatusChip",
      "MoneyText",
      "AttendanceToggle",
      "MarkCell",
      "PeriodGrid",
      "BnEnText",
      "DataList",
      "EmptyState",
      "FormSheet",
    ]) {
      await expect(
        page.getByRole("heading", { level: 2, name: heading })
      ).toBeVisible()
    }

    // StatusChip: every attendance status renders its glyph + name.
    await expect(page.getByText("Present").first()).toBeVisible()
    await expect(page.getByText("Half day").first()).toBeVisible()

    // MoneyText: Indian grouping in both numeral scripts.
    await expect(page.getByText("৳12,50,000.00")).toBeVisible()
    await expect(page.getByText("৳১২,৫০,০০০.০০")).toBeVisible()

    // AttendanceToggle: a real radiogroup, operable by role.
    const group = page.getByRole("radiogroup", { name: "Ayaan Rahman" })
    await expect(group).toBeVisible()
    await group.getByRole("radio", { name: "Absent" }).click()
    await expect(group.getByRole("radio", { name: "Absent" })).toHaveAttribute(
      "aria-checked",
      "true"
    )

    // MarkCell: derived grade chip for the seeded value (78/100 -> C).
    await expect(page.getByText("C", { exact: true })).toBeVisible()

    // FormSheet opens and is dismissible.
    await page.getByRole("button", { name: "Add student" }).click()
    await expect(
      page.getByRole("heading", { name: "Add student" })
    ).toBeVisible()
    await expect(page.getByLabel("Full name")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("heading", { name: "Add student" })
    ).toBeHidden()

    await expectNoA11yViolations(page, testInfo)
  })
})
