import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-06 §10 "enter-40-marks-on-phone" (Part 3 demo cut, D-304), at both
 * configured viewports (360×800 and 1280×800), with axe. The owner creates
 * an exam for the seeded class, opens marks entry, types a mark for every
 * student with Enter moving to the next one (the keypad never closes),
 * marks one student Absent, saves once, and sees the progress complete.
 * Then Publish is refused until every paper is complete (Part 4's gate).
 *
 * Needs a seeded, verified owner of a school with a grade scale, a subject
 * and an enrolled section (e.g. Class 6 – ক from
 * supabase/seed/demo-class-6-ka.sql), so it carries the same skip guard as
 * the other live journeys (OQ-27).
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

test("owner enters a whole class's marks in one pass and saves once", async ({
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
    .fill(`Marks ${testInfo.project.name} ${Date.now()}`)
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
  await expectNoA11yViolations(page, testInfo)

  await page
    .getByRole("link", { name: /^Enter marks — / })
    .first()
    .click()
  await expect(page).toHaveURL(/\/app\/marks\/[0-9a-f-]{36}$/)
  await expectNoA11yViolations(page, testInfo)

  const inputs = page.getByRole("textbox")
  const count = await inputs.count()
  expect(count).toBeGreaterThan(0)
  const started = Date.now()
  await inputs.first().focus()
  for (let i = 0; i < count; i += 1) {
    if (i === 1) await page.keyboard.press("a")
    else await page.keyboard.type(String(20 + (i % 30)))
    await page.keyboard.press("Enter")
  }
  await expect(page.getByText(`${count}/${count}`)).toBeVisible()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saved.")).toBeVisible()
  // Spec §1 / AC11: a whole class in under two minutes, one bulk save.
  expect(Date.now() - started).toBeLessThan(120_000)
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("link", { name: "Back to the exam" }).click()
  await page.getByRole("button", { name: "Lock marks" }).click()
  await page.getByRole("button", { name: "Publish" }).click()
  const papers = await page.getByRole("link", { name: /marks — / }).count()
  if (papers > 1) {
    // Other papers have no marks yet: Publish is refused (Part 4's gate).
    await expect(
      page.getByText(/Every student in every paper needs a mark/)
    ).toBeVisible()
  } else {
    await expect(page.getByText("Published")).toBeVisible()
  }
})
