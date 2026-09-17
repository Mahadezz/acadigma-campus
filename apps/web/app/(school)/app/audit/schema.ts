import { z } from "zod"

import {
  auditCategorySchema,
  auditSeveritySchema,
} from "@acadigma/contracts/audit"

/**
 * The filter SHEET's own form shape (F-ID-09 §4.2). `datePreset` is translated into
 * `from`/`to` ISO instants client-side before the server action is called — the
 * contract (`ListAuditEventsInput`) only ever sees resolved instants, never a
 * preset name, so the server has no preset vocabulary to keep in sync with the UI.
 *
 * "Custom" date range is a documented Part 1-3 scope cut (a date-range picker
 * component does not exist in `packages/ui` yet); the presets cover the three most
 * common asks and the field is easy to extend later.
 */
export const DATE_PRESETS = ["today", "7d", "30d", "all"] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

export const auditFilterFormSchema = z.object({
  // No `.default()` here on purpose: zodResolver's input/output types diverge the
  // moment a field has one, which react-hook-form's generics then reject. The
  // default lives in code instead — see AUDIT_FILTERS_DEFAULT below.
  datePreset: z.enum(DATE_PRESETS),
  category: auditCategorySchema.optional(),
  severity: auditSeveritySchema.optional(),
  q: z.string().trim().max(200).optional(),
})
export type AuditFilterFormValues = z.infer<typeof auditFilterFormSchema>

export const AUDIT_FILTERS_DEFAULT: AuditFilterFormValues = {
  datePreset: "all",
}

export const AUDIT_CATEGORY_LABELS: Record<string, string> = {
  account: "Account",
  session: "Sessions",
  profile: "Profile",
  preferences: "Preferences",
  workspace: "Workspace",
  school_profile: "School settings",
  member: "People",
  join_code: "Join code",
  label: "Labels",
  guardian: "Guardians",
  document_request: "Document requests",
  file: "Files",
  personal_attendance: "Attendance",
  diary_entry: "Diary",
  teacher_profile: "Teacher profile",
  tenancy: "Security",
  platform: "Platform",
  audit: "Audit",
  consent: "Consent",
  retention: "Retention",
}
