/**
 * F-ID-03 Part 6 (D-111) — the plain-language consequences of a role change
 * (§4.5 "Change role → confirmation sheet naming what the person gains or
 * loses"). The headline capabilities are DERIVED from the same `can()` matrix
 * the server enforces, so the sheet can never promise something the role does
 * not actually grant. The UI maps each `CapabilityKey` to a localised phrase.
 */

import { can, type Action, type Role } from "../permissions"

/** The few headline abilities worth naming when someone's role changes. */
export const CAPABILITY_KEYS = [
  "manageTeam",
  "manageBilling",
  "manageSettings",
  "editMarks",
  "takeAttendance",
  "viewReports",
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

/** Each headline capability's representative permission in the real matrix. */
const HEADLINE: ReadonlyArray<{ key: CapabilityKey; action: Action }> = [
  { key: "manageTeam", action: "members.role.write" },
  { key: "manageBilling", action: "billing.manage" },
  { key: "manageSettings", action: "workspace.settings.write" },
  { key: "editMarks", action: "marks.write" },
  { key: "takeAttendance", action: "attendance.write" },
  { key: "viewReports", action: "reports.read" },
]

/** The headline capabilities this role has, in display order. */
export function roleHeadlineCapabilities(role: Role): CapabilityKey[] {
  return HEADLINE.filter((h) => can(role, h.action)).map((h) => h.key)
}

/** What a member gains and loses moving from one role to another. */
export function roleChangeDelta(
  from: Role,
  to: Role
): { gained: CapabilityKey[]; lost: CapabilityKey[] } {
  const before = new Set(roleHeadlineCapabilities(from))
  const after = new Set(roleHeadlineCapabilities(to))
  return {
    gained: CAPABILITY_KEYS.filter((k) => after.has(k) && !before.has(k)),
    lost: CAPABILITY_KEYS.filter((k) => before.has(k) && !after.has(k)),
  }
}
