/**
 * The action-level authorisation matrix (ARCHITECTURE §3, §5).
 *
 * This is the *first* of two walls. Every server action calls `can()` before it
 * touches a repository; RLS in Postgres is the second wall and re-checks the same
 * intent at row level. Row scoping — "a parent sees only their own children" — is
 * deliberately not modelled here: this file answers "may this role attempt the
 * action at all", never "which rows".
 */

/** Workspace membership roles, plus Acadigma platform staff (DECISION-LOG D-16). */
export const ROLES = [
  "owner",
  "admin",
  "teacher",
  "staff",
  "parent",
  "platform",
] as const

export type Role = (typeof ROLES)[number]

/** Roles that come from `workspace_members`. `platform` is not one of them. */
export const WORKSPACE_ROLES = [
  "owner",
  "admin",
  "teacher",
  "staff",
  "parent",
] as const

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

export const ACTIONS = [
  // Academic core
  "attendance.read",
  "attendance.write",
  "students.read",
  "students.write",
  "marks.read",
  "marks.write",
  "timetable.read",
  "timetable.manage",
  // Workspace administration
  "members.read",
  "members.manage",
  "billing.read",
  "billing.manage",
  "settings.manage",
  // Everyday use
  "reports.read",
  "messages.send",
  "ai.use",
  // Commerce
  "listing.create",
  "listing.review",
  "payouts.manage",
  // Platform console
  "platform.console",
] as const

export type Action = (typeof ACTIONS)[number]

/**
 * What each role may attempt. Written out per role rather than derived by
 * inheritance: a reviewer can read one line and know exactly what a teacher can do,
 * and a widened role can never silently widen another.
 */
export const PERMISSIONS: Readonly<Record<Role, readonly Action[]>> = {
  owner: [
    "attendance.read",
    "attendance.write",
    "students.read",
    "students.write",
    "marks.read",
    "marks.write",
    "timetable.read",
    "timetable.manage",
    "members.read",
    "members.manage",
    "billing.read",
    "billing.manage",
    "settings.manage",
    "reports.read",
    "messages.send",
    "ai.use",
    "listing.create",
  ],
  // Runs the school day to day. Money and workspace settings stay with the owner.
  admin: [
    "attendance.read",
    "attendance.write",
    "students.read",
    "students.write",
    "marks.read",
    "marks.write",
    "timetable.read",
    "timetable.manage",
    "members.read",
    "members.manage",
    "billing.read",
    "reports.read",
    "messages.send",
    "ai.use",
    "listing.create",
  ],
  teacher: [
    "attendance.read",
    "attendance.write",
    "students.read",
    "marks.read",
    "marks.write",
    "timetable.read",
    "reports.read",
    "messages.send",
    "ai.use",
    "listing.create",
  ],
  // Office staff: sees the school, changes almost nothing.
  staff: [
    "attendance.read",
    "students.read",
    "marks.read",
    "timetable.read",
    "members.read",
    "reports.read",
    "messages.send",
  ],
  // Read-only parent portal (DECISION-LOG D-10), narrowed to their children by RLS.
  parent: [
    "attendance.read",
    "students.read",
    "marks.read",
    "timetable.read",
    "messages.send",
  ],
  // Acadigma staff. Moderation and payouts only — never a tenant's academic data.
  platform: [
    "listing.review",
    "payouts.manage",
    "platform.console",
    "reports.read",
  ],
}

/** May this role attempt this action? The only question this module answers. */
export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role].includes(action)
}

/** True when the role may attempt every one of the actions. */
export function canAll(role: Role, actions: readonly Action[]): boolean {
  return actions.every((action) => can(role, action))
}

/** True when the role may attempt at least one of the actions. */
export function canAny(role: Role, actions: readonly Action[]): boolean {
  return actions.some((action) => can(role, action))
}

/** Everything this role may attempt, for building nav and permission debug views. */
export function actionsForRole(role: Role): readonly Action[] {
  return PERMISSIONS[role]
}

/** Every role that may attempt this action, for documentation and tests. */
export function rolesWithAction(action: Action): Role[] {
  return ROLES.filter((role) => can(role, action))
}

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  )
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  )
}

/** Thrown by `assertCan`. Callers map it to a `forbidden` ApiError. */
export class PermissionDeniedError extends Error {
  constructor(
    readonly role: Role,
    readonly action: Action
  ) {
    super(`Role "${role}" may not perform "${action}".`)
    this.name = "PermissionDeniedError"
  }
}

/** Guard form of `can`, for the top of a server action. */
export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) throw new PermissionDeniedError(role, action)
}
