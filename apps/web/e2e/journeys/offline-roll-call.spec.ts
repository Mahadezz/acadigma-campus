import { randomUUID } from "node:crypto"

import { expect, test, type Page } from "@playwright/test"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { expectNoA11yViolations } from "../axe"

/**
 * F-ID-11 Part 2a (D-309) `offline-roll-call`, with axe, at both viewports
 * (one per project):
 *
 * 1. The owner opens a class online, loses the signal, takes the roll,
 *    corrects it and saves again ("1 waiting": one item, not two), reloads
 *    the class offline and still sees what she saved, then comes back online:
 *    it sends by itself, the chip clears, and the server has exactly one
 *    register for the day, with her marks.
 * 2. While she is offline a colleague saves the same class: on reconnect her
 *    roll comes back as a conflict — shown on the screen and in the queue
 *    sheet under "Needs your choice" — and the colleague's register stands.
 *
 * Each test makes its own owner, school and three-student class through the
 * local service key, so the two viewports and other lanes' journeys never
 * share a register (a shared one would conflict — the server doing its job).
 * Local stack only, skip-gated like the other live journeys (OQ-27).
 */
test.skip(
  !process.env.E2E_LIVE_SUPABASE || !process.env.SUPABASE_SERVICE_ROLE_KEY,
  "needs the local stack and its service-role key (OQ-27)"
)

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
}).format(new Date())
const YEAR = TODAY.slice(0, 4)

type School = {
  email: string
  password: string
  workspaceId: string
  sectionId: string
  studentIds: string[]
  /** The owner's own API session: stands in for a colleague's device. */
  colleague: SupabaseClient
  admin: SupabaseClient
}

async function makeSchool(): Promise<School> {
  const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const email = `d309-${randomUUID()}@test.local`
  const password = `Pw-${randomUUID()}-Aa1`
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Offline Owner" },
  })
  if (error || !created.user) throw error
  const userId = created.user.id

  const colleague = createClient(
    URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  )
  const signIn = await colleague.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error

  const school = await colleague.rpc("create_school_workspace", {
    p_input: {
      name: "Offline Journey School",
      board: "dhaka",
      medium: "bangla",
      timezone: "Asia/Dhaka",
      working_days: [1, 2, 3, 4, 5, 6, 7],
      academic_year: {
        name: YEAR,
        starts_on: `${YEAR}-01-01`,
        ends_on: `${YEAR}-12-31`,
      },
      grade_levels: [
        {
          name: "Class 6",
          name_bn: "ষষ্ঠ শ্রেণি",
          level_number: 6,
          stage: "secondary",
        },
      ],
      idempotency_key: randomUUID(),
    },
  })
  if (school.error) throw school.error
  const workspaceId = (school.data as { workspace_id: string }).workspace_id

  const one = async <T>(q: PromiseLike<{ data: T | null; error: unknown }>) => {
    const { data, error } = await q
    if (error || !data) throw error ?? new Error("no row")
    return data
  }
  // The roster goes in the way the app puts it in, as the owner: the
  // section through an RLS-checked insert, the students through
  // `admit_student` (codes, roll numbers, enrolment, audit — all real).
  const owner = colleague
  const grade = await one(
    owner
      .from("grade_levels")
      .select("id")
      .eq("workspace_id", workspaceId)
      .single()
  )
  const year = await one(
    owner
      .from("academic_years")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_current", true)
      .single()
  )
  const section = await one(
    owner
      .from("sections")
      .insert({
        workspace_id: workspaceId,
        academic_year_id: year.id,
        grade_level_id: grade.id,
        name: "ক",
        created_by: userId,
      })
      .select("id")
      .single()
  )
  const studentIds: string[] = []
  for (const n of [1, 2, 3]) {
    const admitted = await one(
      owner.rpc("admit_student", {
        p_workspace_id: workspaceId,
        p_input: {
          idempotency_key: randomUUID(),
          first_name: "Student",
          last_name: `No${n}`,
          gender: "female",
          date_of_birth: "2013-01-15",
          section_id: section.id,
          roll_number: n,
          guardian: {
            relation: "mother",
            full_name: `Guardian No${n}`,
            phone: `+8801000009${String(n).padStart(3, "0")}`,
          },
        },
      }) as PromiseLike<{ data: { student_id: string } | null; error: unknown }>
    )
    studentIds.push(admitted.student_id)
  }
  // Straight into the school's shell on sign-in.
  await admin
    .from("profiles")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      last_active_workspace_id: workspaceId,
    })
    .eq("id", userId)

  return {
    email,
    password,
    workspaceId,
    sectionId: section.id,
    studentIds,
    colleague,
    admin,
  }
}

let school: School
test.beforeEach(async () => {
  // Setup makes a user, a school and a class through the API: give it room.
  test.setTimeout(90_000)
  school = await makeSchool()
})
test.afterEach(async () => {
  const { data } = await school.colleague.auth.getUser()
  await school.admin.from("workspaces").delete().eq("id", school.workspaceId)
  if (data.user) await school.admin.auth.admin.deleteUser(data.user.id)
})

const cachedPaths = (page: Page) =>
  page.evaluate(async () => {
    if (!(await caches.has("acadigma-data-pages"))) return []
    const cache = await caches.open("acadigma-data-pages")
    return (await cache.keys()).map((r) => new URL(r.url).pathname)
  })

/** The statuses each waiting item holds, read straight from IndexedDB. */
const queuedMarks = (page: Page) =>
  page.evaluate(async () => {
    const out: string[] = []
    for (const d of await indexedDB.databases()) {
      if (!d.name?.startsWith("acadigma-")) continue
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open(d.name!)
        req.onsuccess = () => resolve(req.result)
      })
      const items = await new Promise<
        { payload: { records: { status: string }[] } }[]
      >((resolve) => {
        const req = db.transaction("outbox").objectStore("outbox").getAll()
        req.onsuccess = () => resolve(req.result)
      })
      db.close()
      for (const i of items) {
        out.push(i.payload.records.map((r) => r.status[0]).join(""))
      }
    }
    return out
  })

const statusOf = (page: Page, row: number, status: "Absent" | "Present") =>
  page.getByRole("radiogroup").nth(row).getByRole("radio", { name: status })

async function mark(page: Page, row: number, status: "Absent" | "Present") {
  await statusOf(page, row, status).click()
  await expect(statusOf(page, row, status)).toHaveAttribute(
    "aria-checked",
    "true"
  )
}

/** Signs in and opens the class with a full load, so the worker keeps it. */
async function openClassOnline(page: Page): Promise<string> {
  await page.goto("/login")
  await page.getByLabel("Email").fill(school.email)
  await page.getByLabel("Password").fill(school.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await page.waitForURL((url) => !url.pathname.startsWith("/login"))
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null)
  // The first check after sign-in wipes the cache (no snapshot yet, D-308);
  // let it finish before opening the class, or it takes that page with it.
  await page.waitForFunction(
    () => localStorage.getItem("acadigma-offline-snapshot") !== null
  )
  const path = `/app/attendance/${school.sectionId}`
  await page.goto(path)
  await expect
    .poll(() => cachedPaths(page), { timeout: 15_000 })
    .toContain(path)
  return path
}

async function registers() {
  const { data } = await school.admin
    .from("attendance_sessions")
    .select("id, absent_count, present_count")
    .eq("section_id", school.sectionId)
    .eq("date", TODAY)
  return data ?? []
}

test("roll call taken offline sends once when the signal returns", async ({
  page,
  context,
}, testInfo) => {
  await openClassOnline(page)
  await context.setOffline(true)

  await page.getByRole("button", { name: "Mark all present" }).click()
  await mark(page, 0, "Absent")
  await page.getByRole("button", { name: "Save" }).click()
  const waiting = page.getByText("Saved on this phone · waiting to send")
  await expect(waiting).toBeVisible()
  const chip = page.getByRole("button", { name: "1 waiting" })
  await expect(chip).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // She corrects one student and saves again: still one item, now holding
  // the correction (the phone kept it, not a second item).
  await mark(page, 1, "Absent")
  await page.getByRole("button", { name: "Save" }).click()
  await expect.poll(() => queuedMarks(page)).toEqual(["aap"])
  await expect(chip).toBeVisible()

  // Reopened offline, the class shows what she saved, not the old page.
  await page.reload()
  await expect(waiting).toBeVisible()
  for (const row of [0, 1]) {
    await expect(statusOf(page, row, "Absent")).toHaveAttribute(
      "aria-checked",
      "true"
    )
  }

  await chip.click()
  const sheet = page.getByRole("dialog", { name: "Saved on this phone" })
  await expect(sheet.getByText(/^Attendance · /)).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Send now" })).toBeDisabled()
  await expectNoA11yViolations(page, testInfo)
  await page.keyboard.press("Escape")
  expect(await registers()).toEqual([])

  // Signal back: it sends by itself, once.
  await context.setOffline(false)
  await expect(chip).toBeHidden({ timeout: 20_000 })
  await expect(waiting).toBeHidden()
  await expect
    .poll(registers)
    .toEqual([expect.objectContaining({ absent_count: 2, present_count: 1 })])
})

test("a colleague's save meanwhile comes back as a conflict, nothing overwritten", async ({
  page,
  context,
}, testInfo) => {
  await openClassOnline(page)
  await context.setOffline(true)
  await page.getByRole("button", { name: "Mark all present" }).click()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("button", { name: "1 waiting" })).toBeVisible()

  // Meanwhile, online elsewhere: every student absent.
  const { error } = await school.colleague.rpc("save_attendance", {
    p_workspace_id: school.workspaceId,
    p_input: {
      idempotency_key: randomUUID(),
      section_id: school.sectionId,
      date: TODAY,
      records: school.studentIds.map((student_id) => ({
        student_id,
        status: "absent",
      })),
      bulk_marked: false,
      allow_non_school_day: false,
      expected_updated_at: null,
    },
  })
  expect(error).toBeNull()

  await context.setOffline(false)
  const needsYou = page.getByRole("button", { name: "1 needs you" })
  await expect(needsYou).toBeVisible({ timeout: 20_000 })
  await expect(
    page.getByText(/Someone else saved this class meanwhile/)
  ).toBeVisible()
  await needsYou.click()
  const sheet = page.getByRole("dialog", { name: "Saved on this phone" })
  await expect(
    sheet.getByRole("heading", { name: "Needs your choice" })
  ).toBeVisible()
  await expectNoA11yViolations(page, testInfo)

  // The colleague's register stands; hers was not written over it.
  expect(await registers()).toEqual([
    expect.objectContaining({ absent_count: 3, present_count: 0 }),
  ])
})
