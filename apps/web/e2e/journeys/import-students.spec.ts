import { readFile } from "node:fs/promises"

import { expect, test } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-02 §10 "csv-import-with-errors" (demo cut, D-106), at both
 * configured viewports, with axe. An owner uploads a 40-row register with
 * three bad rows (a 31 February birthday, a section that does not exist,
 * a non-Bangladeshi phone), sees exactly those three in the preview,
 * imports the other 37 and finds them on the roster. The preview survives
 * a reload (the report is in student_import_batches).
 *
 * Needs a seeded, verified owner of a school with Class 6 – ক in the
 * current year (supabase/seed/demo-class-6-ka.sql), so it carries the same
 * skip guard as the other live journeys (OQ-27). Each run tags the last
 * names so it finds only its own students.
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

test("owner imports a register: 3 errors previewed, 37 students added", async ({
  page,
}, testInfo) => {
  const tag = `Imp${Date.now() % 1000000}`
  const fixture = await readFile(
    new URL("../fixtures/student-import-40.csv", import.meta.url),
    "utf8"
  )
  // Tag the last name (column 2) of every data line.
  const csv = fixture
    .split("\r\n")
    .map((line, i) =>
      i === 0 || !line
        ? line
        : line.replace(/^([^,]*),([^,]*),/, `$1,$2${tag},`)
    )
    .join("\r\n")

  await page.goto("/login")
  await page.getByLabel("Email").fill(process.env.E2E_OWNER_EMAIL ?? "")
  await page.getByLabel("Password").fill(process.env.E2E_OWNER_PASSWORD ?? "")
  await page.getByRole("button", { name: "Sign in" }).click()

  await page.goto("/app/students")
  await page.getByRole("link", { name: "Import" }).click()
  await expect(
    page.getByRole("heading", { name: "Import students" })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  await page.getByLabel("Excel (.xlsx) or CSV file").setInputFiles({
    name: "register.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  })
  await page.getByRole("button", { name: "Check file" }).click()

  const summary = page.getByTestId("import-summary")
  await expect(summary).toContainText("40 rows · 37 ready · 3 with problems")
  for (const line of ["Line 8", "Line 20", "Line 33"]) {
    await expect(page.getByText(line, { exact: true })).toBeVisible()
  }
  await expect(page.getByText(/Date of birth: not a real date/)).toBeVisible()
  await expect(page.getByText(/Section: no such section/)).toBeVisible()
  await expect(
    page.getByText(/Guardian's mobile: not a Bangladeshi mobile number/)
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // The preview is stored, not held in the page.
  await page.reload()
  await expect(summary).toContainText("37 ready")

  await page.getByRole("button", { name: "Import 37 students" }).click()
  await expect(page.getByText("37 students imported.")).toBeVisible({
    timeout: 30_000,
  })
  await expectNoA11yViolations(page, testInfo)

  await page.getByRole("link", { name: "Go to students" }).click()
  await page.getByLabel("Search by name or student ID").fill(tag)
  await page.getByRole("button", { name: "Search" }).click()
  await expect(page.getByRole("link", { name: new RegExp(tag) })).toHaveCount(
    37
  )
})
