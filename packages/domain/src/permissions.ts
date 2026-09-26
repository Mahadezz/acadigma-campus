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
  // F-AC-02 §2 / §4.7: bulk import from a spreadsheet (D-106).
  "students.import",
  "marks.read",
  "marks.write",
  // F-AC-06 §2: grade scales, pass mark, GPA rules — owner/admin.
  "settings.grade_scale.write",
  // F-AC-06 §2: the exam schedule and papers.
  "exams.read",
  "exams.write",
  // F-AC-06 §2: results — read (RLS narrows teachers to the class teacher),
  // compute owner/admin.
  "results.read",
  "results.compute",
  // F-AC-06 §2 / Part 7 (D-306): publish, withhold and unpublish — owner/admin.
  "results.publish",
  // F-AC-10 §2: a parent reads their own children's published results
  // (RLS: published, not withheld, an active guardian link).
  "family.results.read",
  "timetable.read",
  "timetable.manage",
  // Workspace administration
  "members.read",
  "members.manage",
  "billing.read",
  "billing.manage",
  "settings.manage",
  // The F-OP-07 jsonb policy blobs (attendance/academic/cover/messaging/branding)
  // are {owner,admin} per school_profiles RLS — narrower than "settings.manage",
  // which is reserved for owner-only surfaces (modules, danger zone).
  "policies.manage",
  // Everyday use
  "reports.read",
  "messages.send",
  "ai.use",
  // Commerce
  "listing.create",
  "listing.review",
  "payouts.manage",
  // Audit (F-ID-09 §2)
  "audit.read",
  "audit.read.platform",
  "audit.read.self",
  "audit.export",
  // Platform console
  "platform.console",
  // -----------------------------------------------------------------------
  // Tenancy & membership (F-ID-03 §2). These are the fine-grained keys the
  // Team & Access screen, the workspace switcher and their server actions
  // gate on. `members.read` / `members.manage` above stay as the coarse,
  // pre-existing keys other areas already reference; the ones below narrow
  // "manage" into the exact actions F-ID-03 §2's table names, so a reviewer
  // can read one row of that table and one line of PERMISSIONS and know they
  // agree. Row-scoping nuances the table also states — "own row only",
  // "unless sole owner", "cannot target an owner" — are NOT modelled here on
  // purpose (see the file-level comment): they are enforced by
  // `memberLifecycle` guards and the database triggers, and are asserted by
  // their own tests, not by `can()`.
  "workspace.read",
  "workspace.settings.write",
  "workspace.branding.write",
  // F-AC-11 §2: declare/remove a holiday — owner/admin only.
  "calendar.holiday.write",
  "members.contact.read",
  "members.invite",
  "members.approve",
  "members.role.write",
  "members.staff_fields.write",
  "members.remove",
  "members.leave",
  "workspace.ownership.transfer",
  "labels.write",
  "labels.assign",
  "modules.visibility.write",
  "workspace.archive",
  "platform.workspace.suspend",
  // F-OP-03 §2 — Reports and PDF. Parts 1-2 needed only "open the reports
  // area" and "render the pipeline's own internal proof kind" (D-204). Part 3
  // (D-206) adds the report card's own key; "own sections¹" row-scoping from
  // the spec's full matrix waits for real section-teacher data (F-AC-0x) —
  // a plain role grant is the honest cut while the render source is a
  // fixture, same reasoning the sample kind already used. The rest of the
  // matrix (report.comment.*, report.publish, ...) still waits on its Parts.
  "report.view",
  "report.render.sample",
  "report.render.report_card",
  // Academic structure (F-AC-01 §2, D-102): owner/admin/teacher/staff read,
  // owner/admin write. Parents see structure only through their portal.
  "academics.structure.read",
  "academics.section.write",
  "academics.subject.write",
  // F-AC-02 §2 (D-103): date of birth and guardians. Teachers may attempt it;
  // RLS narrows it to the class teacher of the student's section.
  "students.read_sensitive",
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
    "students.import",
    "marks.read",
    "marks.write",
    "timetable.read",
    "timetable.manage",
    "members.read",
    "members.manage",
    "billing.read",
    "billing.manage",
    "settings.manage",
    "policies.manage",
    "settings.grade_scale.write",
    "exams.read",
    "exams.write",
    "results.read",
    "results.compute",
    "results.publish",
    "reports.read",
    "messages.send",
    "ai.use",
    "listing.create",
    // Tenancy & membership (F-ID-03 §2)
    "workspace.read",
    "workspace.settings.write",
    "workspace.branding.write",
    "calendar.holiday.write",
    "members.contact.read",
    "members.invite",
    "members.approve",
    "members.role.write",
    "members.staff_fields.write",
    "members.remove",
    "members.leave",
    "workspace.ownership.transfer",
    "labels.write",
    "labels.assign",
    "modules.visibility.write",
    "workspace.archive",
    // Audit (F-ID-09 §2)
    "audit.read",
    "audit.read.self",
    "audit.export",
    // F-OP-03 §2 — Reports and PDF (D-204, D-206)
    "report.view",
    "report.render.sample",
    "report.render.report_card",
    "academics.structure.read",
    "academics.section.write",
    "academics.subject.write",
    "students.read_sensitive",
  ],
  // Runs the school day to day. Money and owner-only settings (modules, danger
  // zone) stay with the owner; the F-OP-07 policy blobs do not (RLS §3.1).
  admin: [
    "attendance.read",
    "attendance.write",
    "students.read",
    "students.write",
    "students.import",
    "marks.read",
    "marks.write",
    "timetable.read",
    "timetable.manage",
    "members.read",
    "members.manage",
    "billing.read",
    "policies.manage",
    "settings.grade_scale.write",
    "exams.read",
    "exams.write",
    "results.read",
    "results.compute",
    "results.publish",
    "reports.read",
    "messages.send",
    "ai.use",
    "listing.create",
    // Tenancy & membership (F-ID-03 §2). Notably absent: ownership transfer,
    // module visibility and archiving stay owner-only; `members.role.write`
    // is granted but the row-scoping rule "an admin may never create, target
    // or produce an owner row" is enforced by the trigger and by
    // `memberLifecycle`, not by this coarse grant.
    "workspace.read",
    "workspace.settings.write",
    "workspace.branding.write",
    "calendar.holiday.write",
    "members.contact.read",
    "members.invite",
    "members.approve",
    "members.role.write",
    "members.staff_fields.write",
    "members.remove",
    "members.leave",
    "labels.write",
    "labels.assign",
    // NOT audit.read by default — DECISION-LOG D-25(2) / F-ID-09 §11 OQ-2:
    // the trail must be able to record what an admin did without that
    // admin curating it.
    "audit.read.self",
    // F-OP-03 §2 — Reports and PDF (D-204, D-206)
    "report.view",
    "report.render.sample",
    "report.render.report_card",
    "academics.structure.read",
    "academics.section.write",
    "academics.subject.write",
    "students.read_sensitive",
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
    // Tenancy & membership (F-ID-03 §2): reads the directory card, edits only
    // their own staff fields (row-scoping enforced elsewhere), can leave.
    "workspace.read",
    "members.read",
    "members.staff_fields.write",
    "members.leave",
    // Audit (F-ID-09 §2)
    "audit.read.self",
    // F-OP-03 §2 — Reports and PDF (D-204, D-206): a teacher may render only
    // report cards of sections they are class teacher of. Interim: not
    // enforced yet — the render source is a fixture — so a plain role grant;
    // the seam (`getReportCardData`) and RLS on `results` enforce it when
    // real data lands (F-AC-06 Part 5).
    "report.view",
    "report.render.sample",
    "report.render.report_card",
    "academics.structure.read",
    "exams.read",
    "results.read",
    "students.read_sensitive",
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
    // Tenancy & membership (F-ID-03 §2): same shape as teacher's grant.
    "workspace.read",
    "members.staff_fields.write",
    "members.leave",
    // Audit (F-ID-09 §2)
    "audit.read.self",
    "academics.structure.read",
    "exams.read",
    "results.read",
    // F-OP-03 §2 (D-206, lead decision 2026-09-26): the office prints report
    // cards, so staff may open reports and render a report card — not the
    // spec's "—". No 'sample' render: that is the pipeline's own proof.
    "report.view",
    "report.render.report_card",
  ],
  // Read-only parent portal (DECISION-LOG D-10), narrowed to their children by RLS.
  parent: [
    "attendance.read",
    "students.read",
    "marks.read",
    "timetable.read",
    "messages.send",
    // Tenancy & membership (F-ID-03 §2): name-only workspace read, can leave.
    "workspace.read",
    "members.leave",
    // Audit (F-ID-09 §2)
    "audit.read.self",
    "family.results.read",
  ],
  // Acadigma staff. Moderation and payouts only — never a tenant's academic data.
  platform: [
    "listing.review",
    "payouts.manage",
    "platform.console",
    "reports.read",
    // Tenancy & membership (F-ID-03 §2): the console's narrow, enumerated
    // reach into tenant tables (ARCHITECTURE §4 "never a blanket bypass") —
    // read the roster for support, archive on the owner's behalf, and the
    // one action that is platform-exclusive everywhere else in this matrix.
    "workspace.read",
    "members.read",
    "members.contact.read",
    "workspace.archive",
    "platform.workspace.suspend",
    // Audit (F-ID-09 §2)
    "audit.read",
    "audit.read.platform",
    "audit.read.self",
    "audit.export",
  ],
}

/**
 * May this role attempt this action? The only question this module answers.
 *
 * Deny-by-default in both arguments — including arguments TypeScript says
 * cannot happen. A role string that reaches here from a JWT claim, a database
 * row or a JSON body without passing `isRole()` used to throw `TypeError` on
 * `undefined.includes(...)`, and `assertCan` is the guard at the top of every
 * server action, so that throw surfaced as a 500 rather than a denial. A 500 is
 * a worse answer than "no": it is an unhandled path, and unhandled paths are
 * where bypasses live. Unknown role, unknown action, or neither: `false`.
 *
 * `PERMISSIONS[role]?.includes(...)` is NOT enough, which the tests for this
 * function prove: `PERMISSIONS` is an object literal, so a role of
 * `"__proto__"` resolves to `Object.prototype` and `"constructor"` to `Object`
 * — both truthy, so `?.` happily calls a `.includes` that does not exist and
 * throws anyway. The grant list is therefore looked up as an OWN property and
 * type-checked before it is used.
 */
export function can(role: Role, action: Action): boolean {
  if (!Object.hasOwn(PERMISSIONS, role)) return false
  const granted = PERMISSIONS[role]
  return Array.isArray(granted) && granted.includes(action)
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
