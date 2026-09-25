import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-06 §10 "lock-compute-publish", the compute half (Part 5 demo cut,
 * D-305), at both configured viewports (360×800 and 1280×800), with axe.
 * The owner creates a one-subject exam for the seeded class, enters every
 * mark (one student Absent), locks marks, computes results, and opens the
 * results preview: ranked rows, the absent student failed, and a row that
 * opens to its per-subject grade.
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

test("owner locks marks, computes results and reads the ranked class", async ({
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
    .fill(`Results ${testInfo.project.name} ${Date.now()}`)
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
  expect(count).toBeGreaterThan(1)
  await inputs.first().focus()
  for (let i = 0; i < count; i += 1) {
    if (i === 1) await page.keyboard.press("a")
    else await page.keyboard.type(String(40 + (i % 50)))
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
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("link", { name: "View results" }).click()
  await expect(page).toHaveURL(/\/app\/exams\/[0-9a-f-]{36}\/results/)
  await expect(page.getByText(new RegExp(`${count} students`))).toBeVisible()
  // The absent student failed the paper, so the class has at least one Fail.
  await expect(page.getByText("Fail", { exact: true }).first()).toBeVisible()
  // The first row (rank 1) opens to its per-subject grades.
  await page.locator('[data-slot="accordion-trigger"]').first().click()
  await expect(page.getByRole("columnheader", { name: "Grade" })).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
  await page.screenshot({
    path: testInfo.outputPath(`results-${testInfo.project.name}.png`),
    fullPage: true,
  })
})
