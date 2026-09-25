/**
 * Regression for the PGRST201 "Classes" outage
 * (fix/academics-classes-profile-embed): `public.workspace_members` has
 * FOUR foreign keys to `public.profiles` (user_id, invited_by, removed_by,
 * created_by), so an un-hinted `profiles(full_name)` embed is ambiguous and
 * PostgREST rejects it with PGRST201 — both `getClassesOverview` and
 * `listClassTeacherOptions` returned `dependency_unavailable` ("Something
 * went wrong") for every owner opening /app/classes.
 *
 * `academics.test.ts`'s `fakeClient` is a pure in-memory Proxy that never
 * talks to real PostgREST, so it cannot see this class of error. Neither
 * can pgTAP — CI's `db` job runs bare `postgres:17` for pgTAP with no
 * PostgREST at all (`.github/workflows/ci.yml` `db` job / `db.yml`'s own
 * comment on the production smoke test: "CI's Postgres has no PostgREST").
 * The one e2e journey that opens /app/classes as an owner
 * (`add-section-and-assign-teacher.spec.ts`) is `test.skip`-gated on
 * `E2E_LIVE_SUPABASE` + a seeded owner account (OQ-27, unresolved), which
 * CI never sets — so it is always skipped in CI too. This test closes that
 * gap by running the real repository functions against a real local
 * PostgREST.
 *
 * Opt-in, same philosophy as the `E2E_LIVE_SUPABASE` journeys — needs a
 * local Supabase stack (`supabase start`, Docker Desktop running), then the
 * URL and the two JWTs it prints (`supabase status` shows them again):
 *
 *   DB_LOCAL_SUPABASE=1 \
 *   DB_LOCAL_SUPABASE_ANON_KEY=<ANON_KEY> \
 *   DB_LOCAL_SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY> \
 *   pnpm --filter @acadigma/db test
 *
 * No default keys in source on purpose (CLAUDE.md §"No secrets in the repo"
 * — a gitleaks-shaped JWT string is one even when it is the well-known
 * local-CLI demo value). Not wired into CI: no CI job today runs a full
 * Supabase stack with PostgREST. See
 * docs/features/02-academics/F-AC-01-academic-structure.md §11.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { getClassesOverview, listClassTeacherOptions } from "./academics"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

describe.skipIf(!RUN)(
  "getClassesOverview + listClassTeacherOptions (local Supabase, opt-in)",
  () => {
    // Constructed inside beforeAll, never at describe-body scope: vitest
    // still evaluates a skipped suite's describe body (just not its hooks
    // or tests), and createClient throws synchronously on an undefined key
    // — exactly the case when RUN is false and these are unset.
    let serviceClient: AcadigmaSupabaseClient
    let ctx: WorkspaceContext
    let userId: string

    beforeAll(async () => {
      // RUN guarantees both keys are set; not narrowed by TS.
      const anonKey = ANON_KEY as string
      serviceClient = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })

      const email = `d102-regress-${randomUUID()}@test.local`
      const password = `Pw-${randomUUID()}-Aa1`

      const { data: created, error: createError } =
        await serviceClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: "Regression Owner" },
        })
      if (createError || !created.user) {
        throw createError ?? new Error("createUser returned no user")
      }
      userId = created.user.id

      const anonClient = createClient<Database>(URL, anonKey)
      const { data: session, error: signInError } =
        await anonClient.auth.signInWithPassword({ email, password })
      if (signInError || !session.session) {
        throw signInError ?? new Error("sign-in returned no session")
      }

      // A real user JWT: `create_school_workspace` reads `auth.uid()`.
      const userClient = createClient<Database>(URL, anonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        },
      })

      const school = await createSchoolWorkspace(userClient, {
        name: "PGRST201 Regression School",
        board: "dhaka",
        medium: "bangla",
        timezone: "Asia/Dhaka",
        working_days: [6, 7, 1, 2, 3, 4],
        academic_year: {
          name: "2026",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
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
      })
      if (!school.ok) {
        throw new Error(
          `createSchoolWorkspace failed: ${JSON.stringify(school.error)}`
        )
      }
      const workspaceId = school.data.workspaceId

      const { data: member, error: memberError } = await serviceClient
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .single()
      if (memberError || !member) {
        throw memberError ?? new Error("owner membership not found")
      }

      const { data: grade, error: gradeError } = await serviceClient
        .from("grade_levels")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", "Class 6")
        .single()
      if (gradeError || !grade) {
        throw gradeError ?? new Error("Class 6 grade level not found")
      }

      const { data: year, error: yearError } = await serviceClient
        .from("academic_years")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("is_current", true)
        .single()
      if (yearError || !year) {
        throw yearError ?? new Error("current academic year not found")
      }

      // The owner is eligible as class teacher (role owner/admin/teacher) —
      // no second test user needed.
      const { error: sectionError } = await serviceClient
        .from("sections")
        .insert({
          workspace_id: workspaceId,
          academic_year_id: year.id,
          grade_level_id: grade.id,
          name: "A",
          class_teacher_id: member.id,
          created_by: userId,
        })
      if (sectionError) throw sectionError

      ctx = {
        workspaceId,
        userId,
        role: "owner",
        workspaceType: "school",
        plan: null,
      }
    }, 30_000)

    afterAll(async () => {
      if (ctx?.workspaceId) {
        await serviceClient
          .from("workspaces")
          .delete()
          .eq("id", ctx.workspaceId)
      }
      if (userId) {
        await serviceClient.auth.admin.deleteUser(userId)
      }
    })

    it("getClassesOverview embeds the class teacher's name instead of failing with PGRST201", async () => {
      const result = await getClassesOverview(serviceClient, ctx)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const section = result.data.grades
        .flatMap((grade) => grade.sections)
        .find((s) => s.name === "A")
      expect(section?.classTeacherName).toBe("Regression Owner")
    })

    it("listClassTeacherOptions embeds the member's name instead of failing with PGRST201", async () => {
      const result = await listClassTeacherOptions(serviceClient, ctx)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.data.map((option) => option.name)).toContain(
        "Regression Owner"
      )
    })
  }
)
