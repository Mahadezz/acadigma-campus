// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

import { historyLine } from "./history-line"

const t = { line: "{fields} changed by {name}, {date}", someone: "Someone" }
const base = {
  changedFields: ["legal_name"],
  before: { legal_name: "Old" },
  after: { legal_name: "New" },
  actorName: "Rafiq",
  createdAt: "2026-09-25T10:00:00Z",
}

describe("historyLine", () => {
  it("renders before -> after, actor and date", () => {
    expect(
      historyLine(base, { legal_name: "Legal name" }, t, () => "25 Sep")
    ).toBe("Legal name (Old → New) changed by Rafiq, 25 Sep")
  })

  it("prints values containing {name} or $& literally (single pass)", () => {
    const line = historyLine(
      { ...base, after: { legal_name: "{name} $& $1" } },
      { legal_name: "Legal name" },
      t,
      () => "d"
    )
    expect(line).toBe("Legal name (Old → {name} $& $1) changed by Rafiq, d")
  })

  it("is null when no changed column belongs to this screen", () => {
    expect(
      historyLine(
        { ...base, changedFields: ["updated_at"] },
        { legal_name: "x" },
        t,
        () => "d"
      )
    ).toBeNull()
  })
})

// The audit trigger stores `schema.table`; the query must match that exactly.
const mockList = vi.fn(async () => ({ ok: true, data: { items: [] } }))
vi.mock("@acadigma/db", () => ({
  listAuditEvents: (...a: unknown[]) => mockList(...(a as [])),
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({})),
}))

describe("SettingsHistory query", () => {
  it("asks for table_name public.school_profiles", async () => {
    const { SettingsHistory } = await import("./settings-history")
    await SettingsHistory({
      ctx: {
        workspaceId: "w",
        userId: "u",
        role: "owner",
        workspaceType: "school",
        plan: "pro",
      },
      fieldLabels: {},
      t: { title: "", empty: "", line: "", someone: "" },
      locale: "en",
    })
    expect(mockList).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ tableName: "public.school_profiles" })
    )
  })
})
