/**
 * D-77 (security audit Part 2, L1) against a real local PostgREST:
 * `report_runs` is insertable only on the columns `createReportRun` sends,
 * so the repository still works through PostgREST while a client insert
 * that sets `status` (a run born `ready`) is refused. The column rules are
 * pinned in `supabase/tests/25_security_audit_p2.sql`.
 *
 * Opt-in, like `marks.integration.test.ts`: DB_LOCAL_SUPABASE=1 with
 * DB_LOCAL_SUPABASE_ANON_KEY / _SERVICE_KEY from `supabase status`.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

import { createReportRun } from "./reports"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

describe.skipIf(!RUN)(
  "report_runs column grants (local Supabase, opt-in)",
  () => {
    let owner: AcadigmaSupabaseClient
    let ctx: WorkspaceContext

    beforeAll(async () => {
      const service = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })
      const email = `d77-${randomUUID()}@test.local`
      const password = `Pw-${randomUUID()}-Aa1`
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "D-77 Owner" },
      })
      if (error || !data.user) throw error ?? new Error("user")
      const anon = createClient<Database>(URL, ANON_KEY as string)
      const { data: session, error: signInError } =
        await anon.auth.signInWithPassword({ email, password })
      if (signInError || !session.session) {
        throw signInError ?? new Error("session")
      }
      owner = createClient<Database>(URL, ANON_KEY as string, {
        global: {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        },
      })

      const school = await createSchoolWorkspace(owner, {
        name: "D-77 Reports School",
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
      if (!school.ok) throw new Error(JSON.stringify(school.error))
      ctx = {
        workspaceId: school.data.workspaceId,
        userId: data.user.id,
        role: "owner",
        workspaceType: "school",
        plan: null,
      }
    })

    it("createReportRun still inserts a queued run", async () => {
      const run = await createReportRun(owner, ctx, {
        kind: "sample",
        params: {},
        locale: "en",
      })
      expect(run.ok && run.data.status).toBe("queued")
    })

    it("a direct insert that sets status is refused", async () => {
      const { error } = await owner.from("report_runs").insert({
        workspace_id: ctx.workspaceId,
        kind: "sample",
        params: {},
        locale: "en",
        requested_by: ctx.userId,
        idempotency_key: randomUUID(),
        status: "ready",
      })
      expect(error?.code).toBe("42501")
    })
  }
)
