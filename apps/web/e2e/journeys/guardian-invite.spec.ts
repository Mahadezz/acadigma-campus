import { expect, test, type Page } from "@playwright/test"

import { expectNoA11yViolations } from "../axe"

/**
 * F-AC-02 §10 "guardian-invite-accept-see-only-own-children" (Part 4 demo
 * cut, D-108) — the demo's last step, at both viewports, with axe:
 *
 *   owner publishes an exam → invites a student's guardian (copyable link)
 *   → the parent opens the link signed out, signs in, sees which child it is
 *   for and accepts → /family lists that child and the published result →
 *   the owner removes the access → the child is gone from /family.
 *
 * Needs a seeded, verified school owner (grade scale, a subject, Class 6 – ক
 * from supabase/seed/demo-class-6-ka.sql) and a second verified account
 * that is not a member of the school, so it carries the live skip guard
 * (OQ-27). Each viewport uses its own student (roll 1 / roll 2) and ends by
 * revoking, so the journey can run again.
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE,
  "needs seeded owner and parent accounts (OQ-27)"
)

test.beforeEach(() => {
  test.skip(
    !process.env.E2E_OWNER_EMAIL ||
      !process.env.E2E_OWNER_PASSWORD ||
      !process.env.E2E_PARENT_EMAIL ||
      !process.env.E2E_PARENT_PASSWORD,
    "E2E_OWNER_* / E2E_PARENT_* are not set"
  )
})

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

async function publishAnExam(page: Page, name: string) {
  await page.goto("/app/exams")
  await page.getByRole("button", { name: "New exam" }).click()
  await page.getByLabel("Exam name").fill(name)
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
  await expect(page).toHaveURL(/\/app\/marks\/[0-9a-f-]{36}$/)
  await page.waitForLoadState("networkidle") // typed marks need a hydrated page
  const inputs = page.getByRole("textbox")
  const count = await inputs.count()
  await inputs.first().click()
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.type(String(60 + (i % 40)))
    await page.keyboard.press("Enter")
  }
  await expect(page.getByText(`${count}/${count}`)).toBeVisible()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Saved.")).toBeVisible()
  await page.getByRole("link", { name: "Back to the exam" }).click()
  await page.getByRole("button", { name: "Lock marks" }).click()
  await page.getByRole("button", { name: "Compute results" }).click()
  await expect(page.getByText(/Results computed: \d+ students/)).toBeVisible()
  await page.getByRole("button", { name: "Publish", exact: true }).click()
  await page
    .getByRole("dialog", { name: /^Publish .+ results for / })
    .getByRole("button", { name: `Publish · parents will see ${count}` })
    .click()
  await expect(page.getByText("Published", { exact: true })).toBeVisible()
}

/** Opens the student with this code and mints a guardian link for them. */
async function inviteFor(page: Page, code: string) {
  await page.goto(`/app/students?q=${code}`)
  // The search leaves one row: its name links to the profile.
  await page
    .locator('main a[href^="/app/students/"]:not([href$="/import"]):visible')
    .first()
    .click()
  await expect(page).toHaveURL(/\/app\/students\/[0-9a-f-]{36}$/)
  const profileUrl = page.url()
  const studentName =
    (await page
      .getByRole("main")
      .getByRole("heading", { level: 1 })
      .textContent()) ?? ""
  await page
    .getByRole("button", { name: /^Invite .+ to the parent app$/ })
    .click()
  const linkBox = page.getByRole("textbox", { name: "Invitation link" })
  await expect(linkBox).toHaveValue(/\/invite#[0-9a-f]{64}$/)
  return { profileUrl, studentName, inviteUrl: await linkBox.inputValue() }
}

async function removeAccess(page: Page, profileUrl: string) {
  await page.goto(profileUrl)
  await page.getByRole("button", { name: "Remove access" }).first().click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove access" })
    .click()
  await expect(
    page.getByRole("button", { name: /^Invite .+ to the parent app$/ }).first()
  ).toBeVisible()
}

test("admin invites a guardian, the parent accepts and sees the published result", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240_000)
  const examName = `Guardian ${testInfo.project.name} ${Date.now()}`
  const code = `STU-2026-0000${testInfo.project.name === "phone" ? 1 : 2}`

  // --- Owner: publish, then invite the student's guardian ---------------
  await page.goto("/login")
  await signIn(
    page,
    process.env.E2E_OWNER_EMAIL ?? "",
    process.env.E2E_OWNER_PASSWORD ?? ""
  )
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
  await publishAnExam(page, examName)

  const { profileUrl, studentName, inviteUrl } = await inviteFor(page, code)
  await expect(
    page.getByRole("link", { name: "Send on WhatsApp" })
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/8801\d{9}\?text=/)
  await expectNoA11yViolations(page, testInfo)
  await page.screenshot({
    path: testInfo.outputPath(`invite-link-${testInfo.project.name}.png`),
  })

  // --- Parent: open the link signed out, sign in, accept ---------------
  const parentContext = await browser.newContext({
    viewport: page.viewportSize(),
  })
  const parent = await parentContext.newPage()
  await parent.goto(inviteUrl)
  await expect(parent).toHaveURL(/\/invite$/) // the token left the address bar
  await parent.getByRole("link", { name: "Sign in" }).click()
  await signIn(
    parent,
    process.env.E2E_PARENT_EMAIL ?? "",
    process.env.E2E_PARENT_PASSWORD ?? ""
  )
  await expect(parent).toHaveURL(/\/invite$/)
  await expect(
    parent.getByText(new RegExp(`E2E Demo School|${studentName}`)).first()
  ).toBeVisible()
  await expectNoA11yViolations(parent, testInfo)
  await parent.getByRole("button", { name: "Accept" }).click()

  await expect(parent).toHaveURL(/\/family$/)
  await expect(
    parent.getByRole("heading", { name: "Your children" })
  ).toBeVisible()
  await expect(parent.getByText(studentName).first()).toBeVisible()
  await expect(parent.getByText(new RegExp(examName)).first()).toBeVisible()
  await expectNoA11yViolations(parent, testInfo)
  await parent.screenshot({
    path: testInfo.outputPath(`family-${testInfo.project.name}.png`),
    fullPage: true,
  })

  // --- Owner removes the access; the child leaves /family ----------------
  await removeAccess(page, profileUrl)

  await parent.reload()
  await expect(parent.getByText(new RegExp(examName))).toHaveCount(0)
  await parentContext.close()
})

/**
 * The same link for a parent with no account yet (PR #78 review): "Create an
 * account" keeps `next=/invite` through registration and the confirmation
 * email, so the parent comes back to the link, not to the school wizard.
 * Needs a mailbox to read the confirmation from — the local stack's Mailpit
 * (`E2E_MAILPIT_URL`, e.g. http://127.0.0.1:54324) — so it is local-only.
 */
test("a new parent signs up from the link and lands back on it", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!process.env.E2E_MAILPIT_URL, "needs E2E_MAILPIT_URL (local stack)")
  test.setTimeout(180_000)
  const code = `STU-2026-0000${testInfo.project.name === "phone" ? 3 : 4}`
  const email = `parent-${testInfo.project.name}-${Date.now()}@e2e.local`

  await page.goto("/login")
  await signIn(
    page,
    process.env.E2E_OWNER_EMAIL ?? "",
    process.env.E2E_OWNER_PASSWORD ?? ""
  )
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
  const { profileUrl, studentName, inviteUrl } = await inviteFor(page, code)

  const parentContext = await browser.newContext({
    viewport: page.viewportSize(),
  })
  const parent = await parentContext.newPage()
  await parent.goto(inviteUrl)
  await parent.getByRole("link", { name: "Create an account" }).click()
  await expect(parent).toHaveURL(/\/register\?next=\/invite$/)
  await expect(
    parent.getByText("No email? Ask the school office for help.")
  ).toBeVisible()
  await parent.getByLabel("Full name").fill("New Parent")
  await parent.getByLabel("Email").fill(email)
  await parent
    .getByLabel("Password", { exact: true })
    .fill("Correct-Horse-Battery-99!")
  await parent.getByLabel("Confirm password").fill("Correct-Horse-Battery-99!")
  await parent.getByRole("checkbox").check()
  await parent.getByRole("button", { name: "Create account" }).click()
  await expect(parent).toHaveURL(/\/verify\?email=.+&next=\/invite$/)

  // The confirmation email: its token is the hash our callback verifies,
  // exactly as the project's email template links it.
  const mailpit = process.env.E2E_MAILPIT_URL
  let token = ""
  await expect(async () => {
    const found = (await (
      await fetch(
        `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
      )
    ).json()) as { messages: { ID: string }[] }
    const message = (await (
      await fetch(`${mailpit}/api/v1/message/${found.messages[0]?.ID}`)
    ).json()) as { Text: string }
    token = /token=([^&\s)]+)/.exec(message.Text)?.[1] ?? ""
    expect(token).not.toBe("")
    expect(message.Text).toContain("next%3D%2Finvite")
  }).toPass({ timeout: 30_000 })
  await parent.goto(
    `${new URL(inviteUrl).origin}/api/auth/callback?token_hash=${token}&type=email&next=/invite`
  )
  // The callback sends the new account back to /invite, not /onboarding.
  // (`next start` names its own origin "localhost" in redirects, while the
  // session cookie lives on 127.0.0.1, so the check reads the path and the
  // journey continues on the page's origin.)
  expect(new URL(parent.url()).pathname).toBe("/invite")
  await parent.goto(`${new URL(inviteUrl).origin}/invite`)
  await expect(parent.getByText(studentName).first()).toBeVisible()
  await parent.getByRole("button", { name: "Accept" }).click()
  await expect(parent).toHaveURL(/\/family$/)
  await expect(parent.getByText(studentName).first()).toBeVisible()
  await expectNoA11yViolations(parent, testInfo)

  await removeAccess(page, profileUrl)
  await parentContext.close()
})

/**
 * D-109: a teacher of the school who is also a parent there. The same link,
 * accepted by the teacher's own account, adds the child without touching the
 * teacher's membership: /family shows only that child, the switcher's
 * "School app" goes back to /app and "My children" returns to /family; once
 * the owner removes the access, /family sends the teacher back to /app.
 * Needs a verified teacher of the owner's school (`E2E_TEACHER_*`).
 */
test("a teacher who is also a parent sees only their own child and keeps the school app", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(
    !process.env.E2E_TEACHER_EMAIL || !process.env.E2E_TEACHER_PASSWORD,
    "E2E_TEACHER_* are not set"
  )
  test.setTimeout(240_000)
  const examName = `Teacher-parent ${testInfo.project.name} ${Date.now()}`
  const code = `STU-2026-0000${testInfo.project.name === "phone" ? 5 : 6}`

  await page.goto("/login")
  await signIn(
    page,
    process.env.E2E_OWNER_EMAIL ?? "",
    process.env.E2E_OWNER_PASSWORD ?? ""
  )
  await expect(page).toHaveURL(/\/app(\/.*)?$/)
  await publishAnExam(page, examName)
  const { profileUrl, studentName, inviteUrl } = await inviteFor(page, code)

  const teacherContext = await browser.newContext({
    viewport: page.viewportSize(),
  })
  const teacher = await teacherContext.newPage()
  await teacher.goto("/login")
  await signIn(
    teacher,
    process.env.E2E_TEACHER_EMAIL ?? "",
    process.env.E2E_TEACHER_PASSWORD ?? ""
  )
  // Signed in (the landing is whichever workspace was last active).
  await expect(teacher).not.toHaveURL(/\/login/)
  await teacher.goto(inviteUrl)
  await expect(teacher.getByText(studentName).first()).toBeVisible()
  await teacher.getByRole("button", { name: "Accept" }).click()

  await expect(teacher).toHaveURL(/\/family$/)
  // Only their own child, although as a teacher they read all 40 students.
  await expect(
    teacher
      .locator("section", {
        has: teacher.getByRole("heading", { name: "Your children" }),
      })
      .getByRole("listitem")
  ).toHaveCount(1)
  await expect(teacher.getByText(new RegExp(examName)).first()).toBeVisible()
  const resultNames = await teacher.locator("main li h3").allTextContents()
  expect(new Set(resultNames)).toEqual(new Set([studentName]))
  await expectNoA11yViolations(teacher, testInfo)
  await teacher.screenshot({
    path: testInfo.outputPath(`teacher-family-${testInfo.project.name}.png`),
    fullPage: true,
  })

  // Back to the school app, and to the children again, from the switcher.
  await teacher.getByRole("button", { name: /^Switch workspace/ }).click()
  await teacher.getByRole("link", { name: "School app" }).click()
  await expect(teacher).toHaveURL(/\/app(\/.*)?$/)
  await teacher.getByRole("button", { name: /^Switch workspace/ }).click()
  await expectNoA11yViolations(teacher, testInfo)
  await teacher.getByRole("link", { name: "My children" }).click()
  await expect(teacher).toHaveURL(/\/family$/)

  // The owner removes the access: the teacher keeps the school app only.
  await removeAccess(page, profileUrl)
  await teacher.goto("/family")
  await expect(teacher).toHaveURL(/\/app(\/.*)?$/)
  await teacherContext.close()
})
