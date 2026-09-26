// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * F-ID-11 §4.8 (D-308): how the session check maps every workspace-context
 * outcome onto what the cache purge understands — signed in (with or without
 * an active membership), signed out, or unknown (never a verdict).
 */

const mockResolve = vi.fn()
vi.mock("@acadigma/db", () => ({
  resolveWorkspaceContext: (...args: unknown[]) => mockResolve(...args),
}))
const mockGetUser = vi.fn()
/** `{ data, error }` for the caller's `guardian_users` / `workspace_members`. */
const mockLinks = vi.fn()
const mockMembers = vi.fn()
const query = (rows: () => unknown) => {
  const q = {
    select: () => q,
    eq: () => q,
    then: (resolve: (v: unknown) => void) => resolve(rows()),
  }
  return q
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) =>
      query(table === "guardian_users" ? mockLinks : mockMembers),
  }),
}))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))

const { GET } = await import("./route")

const fail = (reason: string) => ({ ok: false, error: { reason } })

async function check() {
  const res = await GET()
  return {
    status: res.status,
    cache: res.headers.get("cache-control"),
    body: await res.json(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } })
  mockLinks.mockReturnValue({ data: [], error: null })
  mockMembers.mockReturnValue({
    data: [{ workspace_id: "w1" }, { workspace_id: "w9" }],
    error: null,
  })
})

describe("GET /api/offline/session", () => {
  it("answers the user, active workspace and role", async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      data: { userId: "u1", workspaceId: "w1", role: "teacher" },
    })
    expect(await check()).toEqual({
      status: 200,
      cache: "no-store",
      body: {
        kind: "signed_in",
        userId: "u1",
        workspaceId: "w1",
        role: "teacher",
        scope: null,
        activeWorkspaceIds: ["w1", "w9"],
      },
    })
  })

  it("answers the guardian's linked students as a sorted scope", async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      data: { userId: "u1", workspaceId: "w1", role: "parent" },
    })
    mockLinks.mockReturnValue({
      data: [{ student_id: "s2" }, { student_id: "s1" }],
      error: null,
    })
    expect((await check()).body.scope).toBe("s1,s2")
  })

  it("a failed guardian-link read is unknown, not a verdict", async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      data: { userId: "u1", workspaceId: "w1", role: "parent" },
    })
    mockLinks.mockReturnValue({ data: null, error: { message: "down" } })
    expect(await check()).toEqual({
      status: 503,
      cache: "no-store",
      body: { kind: "unknown" },
    })
  })

  it("unauthenticated → signed_out", async () => {
    mockResolve.mockResolvedValue(fail("unauthenticated"))
    expect((await check()).body).toEqual({ kind: "signed_out" })
  })

  it("dependency_unavailable → 503 unknown, never a verdict", async () => {
    mockResolve.mockResolvedValue(fail("dependency_unavailable"))
    expect(await check()).toEqual({
      status: 503,
      cache: "no-store",
      body: { kind: "unknown" },
    })
  })

  it.each([
    "no_workspace_selected",
    "malformed_workspace_id",
    "not_a_member",
    "membership_inactive",
    "invalid_role",
    "invalid_workspace_type",
  ])("%s → signed in with no workspace (purges)", async (reason) => {
    mockResolve.mockResolvedValue(fail(reason))
    expect((await check()).body).toEqual({
      kind: "signed_in",
      userId: "u1",
      workspaceId: null,
      role: null,
      scope: null,
      activeWorkspaceIds: ["w1", "w9"],
    })
  })

  it("no membership and no user either → signed_out", async () => {
    mockResolve.mockResolvedValue(fail("not_a_member"))
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await check()).body).toEqual({ kind: "signed_out" })
  })
})

describe("GET /api/offline/session — memberships", () => {
  it("a failed membership read is unknown, not a verdict", async () => {
    mockResolve.mockResolvedValue({
      ok: true,
      data: { userId: "u1", workspaceId: "w1", role: "teacher" },
    })
    mockMembers.mockReturnValue({ data: null, error: { message: "down" } })
    expect((await check()).status).toBe(503)
  })
})
