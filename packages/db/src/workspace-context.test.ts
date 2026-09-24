import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  WORKSPACE_HEADER,
  isPlatformAdmin,
  resolveWorkspaceContext,
} from "./workspace-context"

import type { AcadigmaSupabaseClient } from "./client"

const WORKSPACE_ID = "3f1a2e5c-9b7d-4c2e-8f1a-2b3c4d5e6f70"
const OTHER_WORKSPACE_ID = "5f2b3e6d-1a8e-4d3f-9a2b-3c4d5e6f7081"
const USER_ID = "8c2b1d4e-5f60-4a7b-9c8d-0e1f2a3b4c5d"

type MembershipRow = Record<string, unknown> | null

/**
 * The narrowest possible stand-in for supabase-js: enough of the builder chain to
 * answer the queries `resolveWorkspaceContext` makes across its whole resolution
 * order (header -> profiles.last_active_workspace_id -> first active membership),
 * plus the `log_tenancy_context_rejected` RPC tripwire.
 */
function fakeClient(options: {
  user?: { id: string } | null
  userError?: boolean
  /** Row `workspace_members` returns for the header-candidate query. */
  headerRow?: MembershipRow
  headerQueryError?: boolean
  /**
   * Row `workspace_members` returns for the header path's SECOND query — "does
   * the caller have ANY row for this workspace, any status" — only reached
   * when `headerRow` is null (F-ID-03 review: removed/pending vs. forger).
   */
  anyMembershipRow?: MembershipRow
  anyMembershipQueryError?: boolean
  /** `profiles.last_active_workspace_id` for the fallback chain. */
  lastActiveWorkspaceId?: string | null
  profileQueryError?: boolean
  /** Row `workspace_members` returns when re-verifying the last-active hint. */
  lastActiveRow?: MembershipRow
  lastActiveQueryError?: boolean
  /** Rows for "every active membership", used by the final fallback step. */
  activeMemberships?: MembershipRow[]
  activeMembershipsError?: boolean
  profile?: Record<string, unknown> | null
  rpc?: ReturnType<typeof vi.fn>
  /** Records every `.select(...)` string, so a test can assert the columns asked for. */
  onSelect?: (table: string, columns: string) => void
}): AcadigmaSupabaseClient {
  const {
    user = { id: USER_ID },
    userError = false,
    headerRow = null,
    headerQueryError = false,
    anyMembershipRow = null,
    anyMembershipQueryError = false,
    lastActiveWorkspaceId = null,
    profileQueryError = false,
    lastActiveRow = null,
    lastActiveQueryError = false,
    activeMemberships = [],
    activeMembershipsError = false,
    rpc = vi.fn(async () => ({ data: null, error: null })),
    onSelect = () => {},
  } = options

  // Persists across every `.from("workspace_members")` call this ONE fakeClient
  // makes, so the header path's second query (the any-status membership check,
  // only reached when the first comes back empty) can answer differently from
  // the first without the two queries needing to look different structurally —
  // resolveWorkspaceContext only ever runs one `.select(...).maybeSingle()` on
  // this table per candidate; the header path is the one place it can run two.
  let workspaceMembersSelectCount = 0

  return {
    auth: {
      getUser: async () => ({
        data: { user: userError ? null : user },
        error: userError ? { message: "invalid token" } : null,
      }),
    },
    rpc,
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: (columns: string) => {
            onSelect("profiles", columns)
            return {
              eq: () => ({
                maybeSingle: async () => ({
                  data: profileQueryError
                    ? null
                    : (options.profile ?? {
                        last_active_workspace_id: lastActiveWorkspaceId,
                      }),
                  error: profileQueryError
                    ? { message: "connection reset" }
                    : null,
                }),
              }),
            }
          },
        }
      }

      if (table === "workspace_members") {
        // Either for the header, or (only when there is no header) for the
        // `last_active_workspace_id` hint, never both in the same call. So
        // `headerRow` and `lastActiveRow` (only one of which a given test
        // sets; the other stays at its `null` default) can simply be
        // coalesced into a single response, with no need to pattern-match on
        // the candidate id.
        const singleCandidateRow = headerRow ?? lastActiveRow
        const singleCandidateErrored = headerQueryError || lastActiveQueryError
        const builder = {
          select: (columns: string) => {
            workspaceMembersSelectCount += 1
            onSelect("workspace_members", columns)
            return builder
          },
          eq: () => builder,
          maybeSingle: async () => {
            if (workspaceMembersSelectCount <= 1) {
              return {
                data: singleCandidateErrored ? null : singleCandidateRow,
                error: singleCandidateErrored
                  ? { message: "connection reset" }
                  : null,
              }
            }
            // The header path's second query: "any row at all for this
            // workspace, regardless of status" (removed/pending vs. forger).
            return {
              data: anyMembershipQueryError ? null : anyMembershipRow,
              error: anyMembershipQueryError
                ? { message: "connection reset" }
                : null,
            }
          },
          // `.order(...)` is awaited directly by resolveWorkspaceContext (no
          // `.maybeSingle()` follows it for this query shape), so it must
          // itself resolve to `{ data, error }`.
          order: async () => ({
            data: activeMembershipsError ? null : activeMemberships,
            error: activeMembershipsError
              ? { message: "connection reset" }
              : null,
          }),
        }
        return builder
      }

      throw new Error(`fakeClient: unexpected table "${table}"`)
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
      workspaces: { type: "school", plans: { code: "standard" } },
    }
  })

  it("returns the verified context for an active member via the header", () => {
    return resolveWorkspaceContext(
      fakeClient({ headerRow: activeMembership }),
      headers(WORKSPACE_ID)
    ).then((result) => {
      expect(result).toEqual({
        ok: true,
        data: {
          workspaceId: WORKSPACE_ID,
          userId: USER_ID,
          role: "teacher",
          workspaceType: "school",
          plan: "standard",
        },
      })
    })
  })

  it("asks PostgREST only for columns that exist in the schema", async () => {
    // Regression guard for the F-ID-03 review finding: this file selected
    // `workspaces(plan, type)`, but `public.workspaces` has no `plan` column —
    // it has `plan_id`, an FK to `public.plans`, whose slug is `plans.code`.
    // PostgREST answers 400 for an unknown column, which resolveWorkspaceContext
    // turns into `dependency_unavailable` and requireWorkspace() into a 403, so
    // the typo locked every signed-in user out of every route while every mocked
    // unit test stayed green. Mocks cannot see the real schema, so the *columns
    // asked for* are pinned here instead, next to the migration that defines them.
    const selects: string[] = []
    await resolveWorkspaceContext(
      fakeClient({
        headerRow: activeMembership,
        onSelect: (_table, columns) => selects.push(columns),
      }),
      headers(WORKSPACE_ID)
    )

    expect(selects).toEqual(["role, status, workspaces(type, plans(code))"])
    // Named explicitly so a reviewer sees WHY, not just a changed string.
    expect(selects.join(" ")).not.toMatch(/workspaces\([^)]*\bplan\b[^_]/)
  })

  it("reports no plan as null rather than undefined", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({
        headerRow: {
          role: "owner",
          status: "active",
          workspaces: { type: "personal" },
        },
      }),
      headers(WORKSPACE_ID)
    )
    expect(result.ok && result.data.plan).toBeNull()
    expect(result.ok && result.data.workspaceType).toBe("personal")
  })

  it("fails closed when the joined workspace row is missing a type (data integrity)", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ headerRow: { role: "owner", status: "active" } }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.reason).toBe("invalid_workspace_type")
  })

  it("is unauthenticated when there is no valid session", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ userError: true }),
      headers(WORKSPACE_ID)
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe("unauthenticated")
    expect(!result.ok && result.error.reason).toBe("unauthenticated")
  })

  // A malformed id is never a legitimate client, and echoing it back would confirm
  // what the server does with it. Also must NOT fire the tripwire (noise, not a
  // targeted forgery of a real-looking id).
  it("refuses a malformed workspace id without echoing it, and without a tripwire", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const result = await resolveWorkspaceContext(
      fakeClient({ headerRow: activeMembership, rpc }),
      headers("'; drop table students; --")
    )
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(!result.ok && result.error.reason).toBe("malformed_workspace_id")
    expect(!result.ok && result.error.message).not.toContain("drop table")
    expect(rpc).not.toHaveBeenCalled()
  })

  // The heart of D-04: the header is a hint, membership is the answer. A
  // well-formed header for a workspace the caller is not a member of is exactly
  // the forged-header attack (AC1) and must write the tripwire.
  it("refuses a workspace the user is not a member of, and fires the tripwire", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }))
    const result = await resolveWorkspaceContext(
      fakeClient({ headerRow: null, rpc }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(!result.ok && result.error.reason).toBe("not_a_member")
    expect(rpc).toHaveBeenCalledWith("log_tenancy_context_rejected", {
      p_attempted_workspace_id: WORKSPACE_ID,
    })
  })

  it("never lets a tripwire RPC failure turn a 403 into a 500", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("network blip")
    })
    const result = await resolveWorkspaceContext(
      fakeClient({ headerRow: null, rpc }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.reason).toBe("not_a_member")
  })

  // F-ID-03 review follow-up: a removed or pending member replaying a stale
  // header is not a forger. AC6 still refuses the request (403); the
  // difference is which reason comes back and whether the tripwire fires.
  describe("removed/pending member vs. a genuine forger (F-ID-03 review)", () => {
    it("fails membership_inactive, WITHOUT the tripwire, for a REMOVED member", async () => {
      const rpc = vi.fn(async () => ({ data: null, error: null }))
      const result = await resolveWorkspaceContext(
        fakeClient({
          headerRow: null, // no ACTIVE row
          anyMembershipRow: { status: "removed" }, // but a row exists
          rpc,
        }),
        headers(WORKSPACE_ID)
      )
      expect(!result.ok && result.error.code).toBe("forbidden")
      expect(!result.ok && result.error.reason).toBe("membership_inactive")
      expect(rpc).not.toHaveBeenCalled()
    })

    it("fails membership_inactive, WITHOUT the tripwire, for a PENDING member", async () => {
      const rpc = vi.fn(async () => ({ data: null, error: null }))
      const result = await resolveWorkspaceContext(
        fakeClient({
          headerRow: null,
          anyMembershipRow: { status: "pending" },
          rpc,
        }),
        headers(WORKSPACE_ID)
      )
      expect(!result.ok && result.error.reason).toBe("membership_inactive")
      expect(rpc).not.toHaveBeenCalled()
    })

    it("still fails not_a_member and fires the tripwire exactly once for someone who never joined", async () => {
      const rpc = vi.fn(async () => ({ data: null, error: null }))
      const result = await resolveWorkspaceContext(
        fakeClient({
          headerRow: null,
          anyMembershipRow: null, // no row at all, in any status
          rpc,
        }),
        headers(WORKSPACE_ID)
      )
      expect(!result.ok && result.error.reason).toBe("not_a_member")
      expect(rpc).toHaveBeenCalledTimes(1)
      expect(rpc).toHaveBeenCalledWith("log_tenancy_context_rejected", {
        p_attempted_workspace_id: WORKSPACE_ID,
      })
    })

    it("reports a database failure on the any-row check as a dependency problem, not a tripwire", async () => {
      const rpc = vi.fn(async () => ({ data: null, error: null }))
      const result = await resolveWorkspaceContext(
        fakeClient({
          headerRow: null,
          anyMembershipQueryError: true,
          rpc,
        }),
        headers(WORKSPACE_ID)
      )
      expect(!result.ok && result.error.reason).toBe("dependency_unavailable")
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  it("refuses a role it does not recognise", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ headerRow: { role: "superuser", status: "active" } }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.code).toBe("forbidden")
    expect(!result.ok && result.error.reason).toBe("invalid_role")
  })

  it("refuses the platform role as a workspace membership", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ headerRow: { role: "platform", status: "active" } }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.reason).toBe("invalid_role")
  })

  it("refuses a row whose shape does not match", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ headerRow: { role: 42, status: "active" } }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.reason).toBe("invalid_role")
  })

  // Fails closed, and says so distinctly — an outage is not a permission decision.
  it("reports a database failure on the header path as a dependency problem", async () => {
    const result = await resolveWorkspaceContext(
      fakeClient({ headerQueryError: true }),
      headers(WORKSPACE_ID)
    )
    expect(!result.ok && result.error.code).toBe("dependency_unavailable")
    expect(!result.ok && result.error.reason).toBe("dependency_unavailable")
  })

  describe("no header present — the fallback chain (F-ID-03 §4.3)", () => {
    it("falls back to profiles.last_active_workspace_id when it is still an active membership", async () => {
      const result = await resolveWorkspaceContext(
        fakeClient({
          lastActiveWorkspaceId: WORKSPACE_ID,
          lastActiveRow: activeMembership,
        }),
        headers()
      )
      expect(result.ok && result.data.workspaceId).toBe(WORKSPACE_ID)
      expect(result.ok && result.data.role).toBe("teacher")
    })

    it("does NOT fire the tripwire for a stale last_active_workspace_id", async () => {
      const rpc = vi.fn(async () => ({ data: null, error: null }))
      await resolveWorkspaceContext(
        fakeClient({
          lastActiveWorkspaceId: WORKSPACE_ID,
          lastActiveRow: null, // membership since removed
          activeMemberships: [],
          rpc,
        }),
        headers()
      )
      expect(rpc).not.toHaveBeenCalled()
    })

    it("falls through to the first active membership when there is no hint at all", async () => {
      const result = await resolveWorkspaceContext(
        fakeClient({
          lastActiveWorkspaceId: null,
          activeMemberships: [
            {
              workspace_id: WORKSPACE_ID,
              role: "owner",
              status: "active",
              joined_at: "2026-01-01T00:00:00Z",
              workspaces: { type: "school", plans: null },
            },
          ],
        }),
        headers()
      )
      expect(result.ok && result.data.workspaceId).toBe(WORKSPACE_ID)
      expect(result.ok && result.data.role).toBe("owner")
    })

    it("orders the fallback personal-workspace first, regardless of join order", async () => {
      const result = await resolveWorkspaceContext(
        fakeClient({
          lastActiveWorkspaceId: null,
          activeMemberships: [
            {
              workspace_id: OTHER_WORKSPACE_ID,
              role: "teacher",
              status: "active",
              joined_at: "2020-01-01T00:00:00Z", // joined first, but is a school
              workspaces: { type: "school", plans: { code: "standard" } },
            },
            {
              workspace_id: WORKSPACE_ID,
              role: "owner",
              status: "active",
              joined_at: "2026-01-01T00:00:00Z", // joined later, but is personal
              workspaces: { type: "personal", plans: null },
            },
          ],
        }),
        headers()
      )
      expect(result.ok && result.data.workspaceId).toBe(WORKSPACE_ID)
    })

    it("fails closed with no_workspace_selected when even the fallback finds nothing", async () => {
      const result = await resolveWorkspaceContext(
        fakeClient({ lastActiveWorkspaceId: null, activeMemberships: [] }),
        headers()
      )
      expect(!result.ok && result.error.reason).toBe("no_workspace_selected")
    })

    it("reports a database failure while reading profiles.last_active_workspace_id as a dependency problem", async () => {
      const result = await resolveWorkspaceContext(
        fakeClient({ profileQueryError: true }),
        headers()
      )
      expect(!result.ok && result.error.reason).toBe("dependency_unavailable")
    })

    it("reports a database failure while re-verifying the last-active hint itself as a dependency problem", async () => {
      const result = await resolveWorkspaceContext(
        fakeClient({
          lastActiveWorkspaceId: WORKSPACE_ID,
          lastActiveQueryError: true,
        }),
        headers()
      )
      expect(!result.ok && result.error.reason).toBe("dependency_unavailable")
    })

    it("reports a database failure while listing active memberships as a dependency problem", async () => {
      const result = await resolveWorkspaceContext(
        fakeClient({ activeMembershipsError: true }),
        headers()
      )
      expect(!result.ok && result.error.reason).toBe("dependency_unavailable")
    })
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
