import { beforeEach, describe, expect, it } from "vitest"

import {
  WORKSPACE_HEADER,
  isPlatformAdmin,
  resolveWorkspaceContext,
} from "./workspace-context"

import type { AcadigmaSupabaseClient } from "./client"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"
const USER_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

type MembershipRow = Record<string, unknown> | null

/**
 * The narrowest possible stand-in for supabase-js: enough of the builder chain to
 * answer the one query `resolveWorkspaceContext` makes. A real client would need a
 * network; these tests are about the decision logic, which is the security-relevant
 * part.
 */
function fakeClient(options: {
  user?: { id: string } | null
  userError?: boolean
  row?: MembershipRow
  queryError?: boolean
  profile?: Record<string, unknown> | null
}): AcadigmaSupabaseClient {
  const {
    user = { id: USER_ID },
    userError = false,
    row = null,
    queryError = false,
  } = options

  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: queryError ? null : row,
      error: queryError ? { message: "connection reset" } : null,
    }),
  }

  return {
    auth: {
      getUser: async () => ({
        data: { user: userError ? null : user },
        error: userError ? { message: "invalid token" } : null,
      }),
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.profile ?? null,
                error: null,
              }),
            }),
          }),
        }
      }
      return builder
    },
  } as unknown as AcadigmaSupabaseClient
}

function headers(value?: string): { get: (name: string) => string | null } {
  return {
    get: (name) =>
      name.toLowerCase() === WORKSPACE_HEADER && value !== undefined
        ? value
        : null,
  }
}

describe("resolveWorkspaceContext", () => {
  let activeMembership: MembershipRow

  beforeEach(() => {
    activeMembership = {
      role: "teacher",
      status: "active",
      workspaces: { plan: "standard" },
    }
  })

  it("returns the verified context for an active member", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ row: activeMembership }),
      headers(WORKSPACE_ID)
    )

    expect(result).toEqual({
      ok: true,
      data: {
        workspaceId: WORKSPACE_ID,
        userId: USER_ID,
        role: "teacher",
        plan: "standard",
      },
    })
  })

  it("reports no plan as null rather than undefined", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ row: { role: "owner", status: "active" } }),
      headers(WORKSPACE_ID)
    )
    expect(result.ok && result.data.plan).toBeNull()
  })

  it("is unauthenticated when there is no valid session", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ userError: true }),
      headers(WORKSPACE_ID)
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe("unauthenticated")
  })

  it("refuses when no workspace was selected", async () => {
    const result = await resolveWorkspaceContext(fakeClient({}), headers())
    expect(!result.ok && result.error.code).toBe("forbidden")
  })

  // A malformed id is never a legitimate client, and echoing it back would confirm
  // what the server does with it.
  it("refuses a malformed workspace id without echoing it", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ row: activeMembership }),
      headers("'; drop table students; --")
    )
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(!result.ok && result.error.message).not.toContain("drop table")
  })

  // The heart of D-04: the header is a hint, membership is the answer.
  it("refuses a workspace the user is not a member of", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ row: null }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.code).toBe("forbidden")
  })

  it("refuses a role it does not recognise", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ row: { role: "superuser", status: "active" } }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.code).toBe("forbidden")
  })

  it("refuses the platform role as a workspace membership", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ row: { role: "platform", status: "active" } }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.code).toBe("forbidden")
  })

  it("refuses a row whose shape does not match", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ row: { role: 42, status: "active" } }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.code).toBe("forbidden")
  })

  // Fails closed, and says so distinctly — an outage is not a permission decision.
  it("reports a database failure as a dependency problem", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ queryError: true }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
  })
})

describe("isPlatformAdmin", () => {
  it("is true only when the profile flag is exactly true", async () => {
    expect(
      await isPlatformAdmin(
        fakeClient({ profile: { is_platform_admin: true } })
      )
    ).toBe(true)
    expect(
      await isPlatformAdmin(
        fakeClient({ profile: { is_platform_admin: "true" } })
      )
    ).toBe(false)
    expect(
      await isPlatformAdmin(
        fakeClient({ profile: { is_platform_admin: false } })
      )
    ).toBe(false)
  })

  it("is false with no profile row and with no session", async () => {
    expect(await isPlatformAdmin(fakeClient({ profile: null }))).toBe(false)
    expect(await isPlatformAdmin(fakeClient({ userError: true }))).toBe(false)
  })
})
