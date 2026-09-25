import { describe, expect, it } from "vitest"

import {
  AUDIT_ACTION_CATALOG,
  FULL_AUDIT_ACTION_CATALOG,
  GENERIC_AUDIT_TABLES,
  GENERIC_TABLE_NOUNS,
  catalogEntry,
  genericActionsForTable,
  isKnownAuditAction,
  severityForAction,
} from "./catalog"

describe("AUDIT_ACTION_CATALOG", () => {
  it("has no duplicate action names", () => {
    const actions = AUDIT_ACTION_CATALOG.map((entry) => entry.action)
    expect(new Set(actions).size).toBe(actions.length)
  })

  it("every action matches the domain.action pattern the SQL check enforces", () => {
    for (const entry of AUDIT_ACTION_CATALOG) {
      expect(entry.action).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
    }
  })

  it("every entry has both an English and a Bangla sentence", () => {
    for (const entry of AUDIT_ACTION_CATALOG) {
      expect(entry.sentenceEn.length).toBeGreaterThan(0)
      expect(entry.sentenceBn.length).toBeGreaterThan(0)
    }
  })

  it("includes the acceptance-criterion-3 action with critical severity", () => {
    expect(catalogEntry("member.role_changed")?.severity).toBe("critical")
  })

  it("includes the two pre-0005 call sites so they do not start raising", () => {
    expect(isKnownAuditAction("consent.recorded")).toBe(true)
    expect(isKnownAuditAction("retention.audit_events_purged")).toBe(true)
  })
})

describe("genericActionsForTable", () => {
  it("produces exactly insert/update/delete with the documented severities", () => {
    const rows = genericActionsForTable("workspace_members")
    expect(rows.map((r) => r.action)).toEqual([
      "workspace_members.insert",
      "workspace_members.update",
      "workspace_members.delete",
    ])
    expect(rows.map((r) => r.severity)).toEqual(["info", "notable", "critical"])
    expect(rows.every((r) => r.isGeneric)).toBe(true)
  })

  it("describes what the table holds, not its name (D-402)", () => {
    const [insertRow] = genericActionsForTable("school_profiles")
    expect(insertRow?.sentenceEn).toBe("{actor} added a school setting")
    expect(insertRow?.sentenceEn).not.toContain("school profiles")
  })

  it("falls back to 'a record' for a table with no noun yet", () => {
    const [, updateRow] = genericActionsForTable("not_a_table")
    expect(updateRow?.sentenceEn).toBe("{actor} updated a record")
    expect(updateRow?.sentenceBn).toBe("{actor} একটি রেকর্ড হালনাগাদ করেছেন")
  })
})

describe("FULL_AUDIT_ACTION_CATALOG", () => {
  it("has no duplicate action names across curated + generic rows", () => {
    const actions = FULL_AUDIT_ACTION_CATALOG.map((entry) => entry.action)
    expect(new Set(actions).size).toBe(actions.length)
  })

  it("contains 3 generic rows per table in GENERIC_AUDIT_TABLES", () => {
    const genericCount = FULL_AUDIT_ACTION_CATALOG.filter(
      (e) => e.isGeneric
    ).length
    expect(genericCount).toBe(GENERIC_AUDIT_TABLES.length * 3)
  })
})

describe("catalogEntry / isKnownAuditAction / severityForAction", () => {
  it("finds a curated action", () => {
    expect(catalogEntry("account.registered")?.severity).toBe("info")
  })

  it("finds a generic action", () => {
    expect(catalogEntry("profiles.update")?.severity).toBe("notable")
  })

  it("returns undefined / false / 'info' for an unknown action", () => {
    expect(catalogEntry("nothing.here")).toBeUndefined()
    expect(isKnownAuditAction("nothing.here")).toBe(false)
    expect(severityForAction("nothing.here")).toBe("info")
  })
})

describe("GENERIC_TABLE_NOUNS (D-402)", () => {
  it("has a readable noun for every audited table, in both languages", () => {
    for (const table of GENERIC_AUDIT_TABLES) {
      const noun = GENERIC_TABLE_NOUNS[table]
      expect(noun, `${table} needs a noun in GENERIC_TABLE_NOUNS`).toBeDefined()
      expect(noun?.en).not.toContain("_")
      expect(noun?.bn).not.toContain("_")
    }
  })
})
