import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "live Supabase journey: set E2E_LIVE_SUPABASE=1 with a migrated project"
)

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("password123")
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
}

/**
 * F-AC-06 Part 2 demo (D-303): the owner makes sure a grade scale exists,
 * creates "Half-Yearly" for the current year's sections and one subject,
 * lands on the exam with its papers, and schedules it. Needs the seeded
 * school to have a current year, a section and a subject (F-AC-01).
 */
test("owner creates and schedules an exam", async ({ page }, testInfo) => {
  await signIn(page, "owner@acadigma.test")

  await page.goto("/app/settings/grade-scale")
  const seed = page.getByRole("button", { name: "Use the Bangladesh default" })
  if (await seed.isVisible()) await seed.click()

  await page.goto("/app/exams")
  await page.getByRole("button", { name: "New exam" }).click()
  const name = `Half-Yearly ${testInfo.project.name} ${Date.now()}`
  await page.getByLabel("Exam name").fill(name)
  await page
    .getByRole("group", { name: "Subjects" })
    .getByRole("checkbox")
    .first()
    .check()
  await page.getByRole("button", { name: "Create exam" }).click()

  await expect(page).toHaveURL(/\/app\/exams\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name })).toBeVisible()
  await expect(page.getByText(/pass mark 33 %/)).toBeVisible()
  await expect(page.getByText("Draft")).toBeVisible()

  await page.getByRole("button", { name: "Schedule" }).click()
  await expect(page.getByText("Scheduled")).toBeVisible()
  await expectNoA11yViolations(page, testInfo)
})

test("a teacher reads exams but cannot create one", async ({ page }) => {
  await signIn(page, "teacher@acadigma.test")
  await page.goto("/app/exams")
  await expect(page.getByRole("heading", { name: /Exams/ })).toBeVisible()
  await expect(page.getByRole("button", { name: "New exam" })).toHaveCount(0)
})
