import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-06 §10 "lock-compute-publish", the publish half (Part 7 demo cut,
 * D-306), at both configured viewports, with axe. The owner creates a
 * one-subject exam for the seeded class, enters every mark, locks, computes,
 * publishes with one student withheld (with a reason), then unpublishes with
 * a reason. The parent side is covered by pgTAP (56_publish_results.sql):
 * no parent is linked to a child in the product until F-AC-02 Part 4.
 *
 * Needs a seeded, verified owner of a school with a grade scale, a subject
 * and an enrolled section (supabase/seed/demo-class-6-ka.sql), so it carries
 * the same skip guard as the other live journeys (OQ-27).
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs a seeded school owner account (OQ-27)"
)

test.beforeEach(() => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL || !process.env.E2E_OWNER_PASSWORD,
    "E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD are not set"
  )
})

test("owner publishes results withholding one student, then unpublishes", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000)
  await page.goto("/login")
  await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL ?? "")
  await page.getByLabel("Password").fill(process.env.E2E_OWNER_PASSWORD ?? "")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)

  await page.goto("/app/exams")
  await page.getByRole("button", { name: "New exam" }).click()
  await page
    .getByLabel("Exam name")
    .fill(`Publish ${testInfo.project.name} ${Date.now()}`)
  await page
    .getByRole("group", { name: "Subjects" })
    .getByRole("checkbox")
    .first()
    .check()
  await page.getByRole("button", { name: "Create exam" }).click()
  await expect(page).toHaveURL(/\/app\/exams\/[0-9a-f-]{36}$/)
  for (const step of ["Schedule", "Start exam", "Open marks entry"]) {
    await page.getByRole("button", { name: step }).click()
    await expect(page.getByRole("button", { name: step })).toHaveCount(0)
  }

  await page
    .getByRole("link", { name: /^Enter marks — / })
    .first()
    .click()
  const inputs = page.getByRole("textbox")
  const count = await inputs.count()
  await inputs.first().focus()
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.type(String(40 + (i % 50)))
    await page.keyboard.press("Enter")
  }
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saved.")).toBeVisible()

  await page.getByRole("link", { name: "Back to the exam" }).click()
  await page.getByRole("button", { name: "Lock marks" }).click()
  await page.getByRole("button", { name: "Compute results" }).click()
  await expect(
    page.getByText(new RegExp(`Results computed: ${count} students`))
  ).toBeVisible()

  await page.getByRole("button", { name: "Publish", exact: true }).click()
  const sheet = page.getByRole("dialog", { name: /^Publish .+ results for / })
  await sheet.getByRole("checkbox").first().check()
  await sheet.getByRole("textbox").first().fill("Fees due")
  await expectNoA11yViolations(page, testInfo)
  await page.screenshot({
    path: testInfo.outputPath(`publish-sheet-${testInfo.project.name}.png`),
    fullPage: true,
  })
  await sheet
    .getByRole("button", { name: `Publish · parents will see ${count - 1}` })
    .click()
  await expect(
    page.getByText(
      `Results published: ${count - 1} shown to families, 1 withheld.`
    )
  ).toBeVisible()
  await expect(page.getByText("Published", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Unpublish" }).click()
  await page.getByLabel("Reason").fill("A mark was wrong")
  await page.getByRole("button", { name: "Confirm" }).click()
  await expect(page.getByText("Marks locked", { exact: true })).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
})
