/**
 * F-ID-03 Part 5 (D-110) against a real local PostgREST (D-73's
 * `db-integration` job): the roster read names a pending joiner the owner
 * cannot otherwise see, approving lets the joiner resolve the school on
 * their very next request, rejecting keeps them out, and a teacher cannot
 * read the roster. The rules themselves are pinned in
 * `supabase/tests/39a_team_roster.sql`.
 *
 * Opt-in, like `guardian-links.integration.test.ts`: DB_LOCAL_SUPABASE=1 with
 * DB_LOCAL_SUPABASE_ANON_KEY / _SERVICE_KEY from `supabase status`.
 */
import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

import { approveMember, listMembers, rejectMember } from "./members"
import { createSchoolWorkspace } from "./school"

import type { AcadigmaSupabaseClient } from "../client"
import type { Database } from "../types.generated"
import type { WorkspaceContext } from "../workspace-context"

const URL = process.env.DB_LOCAL_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY = process.env.DB_LOCAL_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.DB_LOCAL_SUPABASE_SERVICE_KEY
const RUN = process.env.DB_LOCAL_SUPABASE === "1" && !!ANON_KEY && !!SERVICE_KEY

describe.skipIf(!RUN)(
  "Team & Access roster: list, approve, reject (local Supabase, opt-in)",
  () => {
    let service: AcadigmaSupabaseClient
    let owner: AcadigmaSupabaseClient
    let ownerCtx: WorkspaceContext
    let workspaceId: string
    const joiners: {
      id: string
      name: string
      client: AcadigmaSupabaseClient
    }[] = []

    async function signUp(
      name: string
    ): Promise<{ id: string; client: AcadigmaSupabaseClient }> {
      const email = `d110-${randomUUID()}@test.local`
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

    /** What `resolveWorkspaceContext` asks: an active membership of mine here. */
    async function isActiveMember(
      client: AcadigmaSupabaseClient,
      userId: string
    ) {
      const { data } = await client
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("status", "active")
      return (data ?? []).length === 1
    }

    beforeAll(async () => {
      service = createClient<Database>(URL, SERVICE_KEY as string, {
        auth: { persistSession: false },
      })
      const o = await signUp("D-110 Owner")
      owner = o.client
      const school = await createSchoolWorkspace(
        owner,
        {
          name: "D-110 Roster School",
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
      ownerCtx = {
        workspaceId,
        userId: o.id,
        role: "owner",
        workspaceType: "school",
        plan: null,
      }

      // Two join requests, as app.join_workspace_by_code would leave them.
      for (const name of ["D-110 Joiner Anika", "D-110 Joiner Babul"]) {
        const j = await signUp(name)
        joiners.push({ ...j, name })
        const { error } = await service.from("workspace_members").insert({
          workspace_id: workspaceId,
          user_id: j.id,
          role: "teacher",
          status: "pending",
          created_by: j.id,
        })
        if (error) throw error
      }
    })

    it("names every pending joiner for the owner, who cannot read their profiles directly", async () => {
      const page = await listMembers(ownerCtx, owner, { status: "pending" })
      expect(page.ok && page.data.items.map((m) => m.fullName).sort()).toEqual([
        "D-110 Joiner Anika",
        "D-110 Joiner Babul",
      ])
      const { data } = await owner
        .from("profiles")
        .select("id")
        .in(
          "id",
          joiners.map((j) => j.id)
        )
      expect(data).toEqual([])
    })

    it("search narrows the page server-side", async () => {
      const page = await listMembers(ownerCtx, owner, {
        status: "pending",
        q: "babul",
      })
      expect(page.ok && page.data.items.map((m) => m.fullName)).toEqual([
        "D-110 Joiner Babul",
      ])
    })

    it("approving lets the joiner in on their next request; a second tap is still success", async () => {
      const [anika] = joiners
      if (!anika) throw new Error("fixture")
      expect(await isActiveMember(anika.client, anika.id)).toBe(false)
      const pending = await listMembers(ownerCtx, owner, {
        status: "pending",
        q: "anika",
      })
      const id = pending.ok ? pending.data.items[0]?.id : undefined
      if (!id) throw new Error("no pending row")

      expect(await approveMember(ownerCtx, owner, id)).toEqual({
        ok: true,
        data: { id, status: "active" },
      })
      expect(await isActiveMember(anika.client, anika.id)).toBe(true)
      expect(await approveMember(ownerCtx, owner, id)).toEqual({
        ok: true,
        data: { id, status: "active" },
      })
      const rejectAfter = await rejectMember(ownerCtx, owner, id)
      expect(!rejectAfter.ok && rejectAfter.error.fieldErrors).toEqual({
        _root: ["NOT_PENDING"],
      })
    })

    it("rejecting keeps the joiner out and shows them as never joined", async () => {
      const babul = joiners[1]
      if (!babul) throw new Error("fixture")
      const pending = await listMembers(ownerCtx, owner, { status: "pending" })
      const id = pending.ok ? pending.data.items[0]?.id : undefined
      if (!id) throw new Error("no pending row")

      const r = await rejectMember(ownerCtx, owner, id)
      expect(r.ok && r.data.status).toBe("removed")
      expect(await isActiveMember(babul.client, babul.id)).toBe(false)
      const removed = await listMembers(ownerCtx, owner, { status: "removed" })
      expect(removed.ok && removed.data.items).toEqual([
        expect.objectContaining({
          fullName: "D-110 Joiner Babul",
          joinedAt: null,
        }),
      ])
    })

    it("the approved teacher cannot read the roster", async () => {
      const [anika] = joiners
      if (!anika) throw new Error("fixture")
      const r = await listMembers(
        { ...ownerCtx, userId: anika.id, role: "teacher" },
        anika.client,
        { status: "active" }
      )
      expect(!r.ok && r.error.code).toBe("forbidden")
    })
  }
)
