/**
 * F-ID-03 Part 7 (D-112) against a real local PostgREST (D-73's
 * `db-integration` job) — the spec's "removed member loses access on the next
 * request" proof with two real sessions: the teacher's own client resolves an
 * active membership before the owner removes them and none after. Also
 * leaving, the sole-owner block, and the one-transaction ownership transfer.
 * The database rules themselves are pinned in
 * `supabase/tests/39c_leave_and_transfer.sql`.
 *
 * Opt-in, like `members.integration.test.ts`: DB_LOCAL_SUPABASE=1 with
 * DB_LOCAL_SUPABASE_ANON_KEY / _SERVICE_KEY from `supabase status`.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

import {
  leaveWorkspace,
  listOwnershipCandidates,
  removeMember,
  transferOwnership,
} from "./members"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

type Person = { id: string; client: AcadigmaSupabaseClient; memberId: string }

describe.skipIf(!RUN)(
  "Remove, leave, transfer ownership (local Supabase, opt-in)",
  () => {
    let service: AcadigmaSupabaseClient
    let workspaceId: string
    let owner: Person
    const people: Record<"teacher" | "leaver" | "admin", Person> = {} as never

    async function signUp(
      name: string
    ): Promise<{ id: string; client: AcadigmaSupabaseClient }> {
      const email = `d112-${randomUUID()}@test.local`
      const password = `Pw-${randomUUID()}-Aa1`
      const { data, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      })
      if (error || !data.user) throw error ?? new Error("user")
      const anon = createClient<Database>(URL, ANON_KEY as string)
      const { data: session, error: signInError } =
        await anon.auth.signInWithPassword({ email, password })
      if (signInError || !session.session) {
        throw signInError ?? new Error("session")
      }
      const client = createClient<Database>(URL, ANON_KEY as string, {
        global: {
          headers: { Authorization: `Bearer ${session.session.access_token}` },
        },
      })
      return { id: data.user.id, client }
    }

    const ctxFor = (p: Person, role: WorkspaceContext["role"]) =>
      ({
        workspaceId,
        userId: p.id,
        role,
        workspaceType: "school",
        plan: null,
      }) satisfies WorkspaceContext

    /** What `resolveWorkspaceContext` asks: an active membership of mine here. */
    async function isActiveMember(p: Person) {
      const { data } = await p.client
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", p.id)
        .eq("status", "active")
      return (data ?? []).length === 1
    }

    async function roleOf(p: Person) {
      const { data } = await service
        .from("workspace_members")
        .select("role, status")
        .eq("id", p.memberId)
        .single()
      return `${data?.role}/${data?.status}`
    }

    beforeAll(async () => {
      service = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })
      const o = await signUp("D-112 Owner")
      const school = await createSchoolWorkspace(
        o.client,
        {
          name: "D-112 Leave School",
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
        },
        "2026-09-30-interim"
      )
      if (!school.ok) throw new Error(JSON.stringify(school.error))
      workspaceId = school.data.workspaceId
      const { data: ownerRow } = await service
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", o.id)
        .single()
      owner = { ...o, memberId: ownerRow?.id as string }

      for (const [key, role] of [
        ["teacher", "teacher"],
        ["leaver", "teacher"],
        ["admin", "admin"],
      ] as const) {
        const p = await signUp(`D-112 ${key}`)
        const { data, error } = await service
          .from("workspace_members")
          .insert({
            workspace_id: workspaceId,
            user_id: p.id,
            role,
            status: "active",
            created_by: o.id,
          })
          .select("id")
          .single()
        if (error) throw error
        people[key] = { ...p, memberId: data.id }
      }
    })

    it("a removed teacher loses access on their very next request", async () => {
      const { teacher } = people
      expect(await isActiveMember(teacher)).toBe(true)
      const r = await removeMember(
        ctxFor(owner, "owner"),
        owner.client,
        teacher.memberId
      )
      expect(r).toEqual({
        ok: true,
        data: { id: teacher.memberId, status: "removed" },
      })
      expect(await isActiveMember(teacher)).toBe(false)
      const { data: roster } = await teacher.client
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .neq("user_id", teacher.id)
      expect(roster).toEqual([])
    })

    it("a teacher leaves; the sole owner cannot", async () => {
      const { leaver } = people
      expect(
        (await leaveWorkspace(ctxFor(leaver, "teacher"), leaver.client)).ok
      ).toBe(true)
      expect(await isActiveMember(leaver)).toBe(false)

      const blocked = await leaveWorkspace(ctxFor(owner, "owner"), owner.client)
      expect(!blocked.ok && blocked.error.fieldErrors?._root).toEqual([
        "LAST_OWNER_BLOCKED",
      ])
      expect(await isActiveMember(owner)).toBe(true)
    })

    it("lists the admin as the only candidate, then transfers in one step", async () => {
      const { admin } = people
      const candidates = await listOwnershipCandidates(
        ctxFor(owner, "owner"),
        owner.client
      )
      expect(candidates.ok && candidates.data.map((c) => c.id)).toEqual([
        admin.memberId,
      ])

      const r = await transferOwnership(ctxFor(owner, "owner"), owner.client, {
        memberId: admin.memberId,
        keepOwner: false,
      })
      expect(r).toEqual({ ok: true, data: { id: admin.memberId } })
      expect(await roleOf(admin)).toBe("owner/active")
      expect(await roleOf(owner)).toBe("admin/active")

      // The previous owner is an admin now and cannot transfer it back.
      const again = await transferOwnership(
        ctxFor(owner, "admin"),
        owner.client,
        { memberId: admin.memberId, keepOwner: false }
      )
      expect(!again.ok && again.error.code).toBe("forbidden")
    })
  }
)
