import type {
  AuditActionCatalogEntry,
  AuditSeverity,
} from "@acadigma/contracts/audit"

/**
 * The TypeScript mirror of `public.audit_action_catalog`
 * (`supabase/migrations/20260924000100_audit_substrate.sql` §4). Every action here
 * must exist there, byte for byte, and vice versa —
 * `scripts/check-audit-catalog-parity.mjs` fails CI when they diverge
 * (F-ID-09 §5.1, acceptance criterion 17).
 *
 * Curated (business) actions first, exactly as F-ID-09 §5.1 tables them. The
 * generic `<table>.<op>` rows the trigger actually writes are appended by
 * `GENERIC_AUDIT_TABLES` below, mirroring the migration's §4.2 DO block — kept as
 * one generated list rather than 48 more hand-typed rows, for the same reason the
 * SQL side loops instead of repeating itself.
 *
 * Sentences are what the UI renders. Since D-402 the generic rows read
 * "{actor} added a holiday", not "created a holidays record"; the SQL table
 * keeps its original wording, which no code reads (parity covers actions and
 * tables, not sentence text).
 */
export const AUDIT_ACTION_CATALOG: readonly AuditActionCatalogEntry[] = [
  {
    action: "account.registered",
    severity: "info",
    sentenceEn: "{actor} created an account",
    sentenceBn: "{actor} একটি অ্যাকাউন্ট তৈরি করেছেন",
    isGeneric: false,
  },
  {
    action: "account.email_verified",
    severity: "info",
    sentenceEn: "{actor} verified their email",
    sentenceBn: "{actor} তাদের ইমেইল যাচাই করেছেন",
    isGeneric: false,
  },
  {
    action: "account.login",
    severity: "info",
    sentenceEn: "{actor} signed in",
    sentenceBn: "{actor} সাইন ইন করেছেন",
    isGeneric: false,
  },
  {
    action: "account.logout",
    severity: "info",
    sentenceEn: "{actor} signed out",
    sentenceBn: "{actor} সাইন আউট করেছেন",
    isGeneric: false,
  },
  {
    action: "account.password_reset",
    severity: "notable",
    sentenceEn: "{actor} reset their password",
    sentenceBn: "{actor} তাদের পাসওয়ার্ড রিসেট করেছেন",
    isGeneric: false,
  },
  {
    action: "account.password_changed",
    severity: "notable",
    sentenceEn: "{actor} changed their password",
    sentenceBn: "{actor} তাদের পাসওয়ার্ড পরিবর্তন করেছেন",
    isGeneric: false,
  },
  {
    action: "account.deletion_requested",
    severity: "critical",
    sentenceEn: "{actor} scheduled their account for deletion",
    sentenceBn: "{actor} তাদের অ্যাকাউন্ট মুছে ফেলার জন্য নির্ধারণ করেছেন",
    isGeneric: false,
  },
  {
    action: "account.deletion_cancelled",
    severity: "critical",
    sentenceEn: "{actor} cancelled their scheduled account deletion",
    sentenceBn: "{actor} তাদের অ্যাকাউন্ট মুছে ফেলার সময়সূচি বাতিল করেছেন",
    isGeneric: false,
  },
  {
    action: "account.deletion_purged",
    severity: "critical",
    sentenceEn: "{actor}'s account was permanently deleted",
    sentenceBn: "{actor}-এর অ্যাকাউন্ট স্থায়ীভাবে মুছে ফেলা হয়েছে",
    isGeneric: false,
  },
  {
    action: "session.revoked",
    severity: "notable",
    sentenceEn: "{actor} signed out a device",
    sentenceBn: "{actor} একটি ডিভাইস থেকে সাইন আউট করেছেন",
    isGeneric: false,
  },
  {
    action: "session.revoked_all",
    severity: "notable",
    sentenceEn: "{actor} signed out {n} devices",
    sentenceBn: "{actor} {n}টি ডিভাইস থেকে সাইন আউট করেছেন",
    isGeneric: false,
  },
  {
    action: "profile.updated",
    severity: "info",
    sentenceEn: "{actor} updated their profile ({fields})",
    sentenceBn: "{actor} তাদের প্রোফাইল হালনাগাদ করেছেন ({fields})",
    isGeneric: false,
  },
  {
    action: "preferences.updated",
    severity: "info",
    sentenceEn: "{actor} updated their preferences ({fields})",
    sentenceBn: "{actor} তাদের পছন্দসমূহ হালনাগাদ করেছেন ({fields})",
    isGeneric: false,
  },
  {
    action: "workspace.created",
    severity: "notable",
    sentenceEn: "{actor} created {workspace}",
    sentenceBn: "{actor} {workspace} তৈরি করেছেন",
    isGeneric: false,
  },
  {
    action: "workspace.updated",
    severity: "notable",
    sentenceEn: "{actor} updated {workspace} ({fields})",
    sentenceBn: "{actor} {workspace} হালনাগাদ করেছেন ({fields})",
    isGeneric: false,
  },
  {
    action: "workspace.archived",
    severity: "notable",
    sentenceEn: "{actor} archived {workspace}",
    sentenceBn: "{actor} {workspace} আর্কাইভ করেছেন",
    isGeneric: false,
  },
  // Written by app.set_access_mode() (F-CM-06 plans/limits engine), one per access_mode value.
  {
    action: "workspace.access_mode_read_only",
    severity: "critical",
    sentenceEn: "{actor} put {workspace} into read-only mode",
    sentenceBn: "{actor} {workspace} শুধু-পড়া মোডে রেখেছেন",
    isGeneric: false,
  },
  {
    action: "workspace.access_mode_normal",
    severity: "notable",
    sentenceEn: "{actor} restored {workspace} to normal access",
    sentenceBn: "{actor} {workspace} স্বাভাবিক অ্যাক্সেসে ফিরিয়ে এনেছেন",
    isGeneric: false,
  },
  {
    action: "school_profile.created",
    severity: "notable",
    sentenceEn: "{actor} set up school settings",
    sentenceBn: "{actor} স্কুলের সেটিংস তৈরি করেছেন",
    isGeneric: false,
  },
  {
    action: "school_profile.updated",
    severity: "notable",
    sentenceEn: "{actor} changed school settings ({fields})",
    sentenceBn: "{actor} স্কুলের সেটিংস পরিবর্তন করেছেন ({fields})",
    isGeneric: false,
  },
  {
    action: "workspace.ownership_transferred",
    severity: "critical",
    sentenceEn: "{actor} transferred ownership to {subject}",
    sentenceBn: "{actor} মালিকানা {subject}-কে হস্তান্তর করেছেন",
    isGeneric: false,
  },
  {
    action: "workspace.module_visibility_changed",
    severity: "notable",
    sentenceEn: "{actor} hid the {module} module",
    sentenceBn: "{actor} {module} মডিউলটি লুকিয়েছেন",
    isGeneric: false,
  },
  {
    action: "member.invited",
    severity: "info",
    sentenceEn: "{actor} invited {masked_recipient} as {role}",
    sentenceBn:
      "{actor} {masked_recipient}-কে {role} হিসেবে আমন্ত্রণ জানিয়েছেন",
    isGeneric: false,
  },
  {
    action: "member.invitation_resent",
    severity: "info",
    sentenceEn: "{actor} resent the invitation to {masked_recipient}",
    sentenceBn: "{actor} {masked_recipient}-কে আমন্ত্রণ পুনরায় পাঠিয়েছেন",
    isGeneric: false,
  },
  {
    action: "member.invitation_revoked",
    severity: "notable",
    sentenceEn: "{actor} revoked the invitation to {masked_recipient}",
    sentenceBn: "{actor} {masked_recipient}-এর আমন্ত্রণ বাতিল করেছেন",
    isGeneric: false,
  },
  {
    action: "member.invitation_accepted",
    severity: "notable",
    sentenceEn: "{subject} accepted the invitation to join {workspace}",
    sentenceBn: "{subject} {workspace}-এ যোগদানের আমন্ত্রণ গ্রহণ করেছেন",
    isGeneric: false,
  },
  {
    action: "member.join_requested",
    severity: "notable",
    sentenceEn: "{subject} requested to join {workspace}",
    sentenceBn: "{subject} {workspace}-এ যোগদানের অনুরোধ করেছেন",
    isGeneric: false,
  },
  {
    action: "member.approved",
    severity: "notable",
    sentenceEn: "{actor} approved {subject}'s request to join",
    sentenceBn: "{actor} {subject}-এর যোগদানের অনুরোধ অনুমোদন করেছেন",
    isGeneric: false,
  },
  {
    action: "member.rejected",
    severity: "notable",
    sentenceEn: "{actor} rejected {subject}'s request to join",
    sentenceBn: "{actor} {subject}-এর যোগদানের অনুরোধ প্রত্যাখ্যান করেছেন",
    isGeneric: false,
  },
  {
    action: "member.role_changed",
    severity: "critical",
    sentenceEn: "{actor} changed {subject}'s role from {before} to {after}",
    sentenceBn:
      "{actor} {subject}-এর ভূমিকা {before} থেকে {after}-এ পরিবর্তন করেছেন",
    isGeneric: false,
  },
  {
    action: "member.staff_fields_updated",
    severity: "info",
    sentenceEn: "{actor} updated {subject}'s staff details ({fields})",
    sentenceBn:
      "{actor} {subject}-এর কর্মচারীর তথ্য হালনাগাদ করেছেন ({fields})",
    isGeneric: false,
  },
  {
    action: "member.label_assigned",
    severity: "info",
    sentenceEn: "{actor} assigned a label to {subject}",
    sentenceBn: "{actor} {subject}-কে একটি লেবেল বরাদ্দ করেছেন",
    isGeneric: false,
  },
  {
    action: "member.removed",
    severity: "critical",
    sentenceEn: "{actor} removed {subject} from {workspace}",
    sentenceBn: "{actor} {subject}-কে {workspace} থেকে সরিয়ে দিয়েছেন",
    isGeneric: false,
  },
  {
    action: "member.left",
    severity: "critical",
    sentenceEn: "{subject} left {workspace}",
    sentenceBn: "{subject} {workspace} ছেড়ে গেছেন",
    isGeneric: false,
  },
  {
    action: "join_code.created",
    severity: "notable",
    sentenceEn: "{actor} created a join code",
    sentenceBn: "{actor} একটি যোগদান কোড তৈরি করেছেন",
    isGeneric: false,
  },
  {
    action: "join_code.rotated",
    severity: "notable",
    sentenceEn: "{actor} rotated the join code",
    sentenceBn: "{actor} যোগদান কোড পরিবর্তন করেছেন",
    isGeneric: false,
  },
  {
    action: "join_code.disabled",
    severity: "notable",
    sentenceEn: "{actor} disabled the join code",
    sentenceBn: "{actor} যোগদান কোড নিষ্ক্রিয় করেছেন",
    isGeneric: false,
  },
  {
    action: "label.created",
    severity: "info",
    sentenceEn: "{actor} created the label {name}",
    sentenceBn: "{actor} {name} লেবেল তৈরি করেছেন",
    isGeneric: false,
  },
  {
    action: "label.updated",
    severity: "info",
    sentenceEn: "{actor} updated the label {name}",
    sentenceBn: "{actor} {name} লেবেল হালনাগাদ করেছেন",
    isGeneric: false,
  },
  {
    action: "label.deleted",
    severity: "info",
    sentenceEn: "{actor} deleted the label {name}",
    sentenceBn: "{actor} {name} লেবেল মুছে ফেলেছেন",
    isGeneric: false,
  },
  {
    action: "guardian.invited",
    severity: "notable",
    sentenceEn: "{actor} invited a guardian for {student}",
    sentenceBn: "{actor} {student}-এর জন্য একজন অভিভাবককে আমন্ত্রণ জানিয়েছেন",
    isGeneric: false,
  },
  {
    action: "guardian.linked",
    severity: "notable",
    sentenceEn: "{actor} linked {subject} to {student}",
    sentenceBn: "{actor} {subject}-কে {student}-এর সাথে যুক্ত করেছেন",
    isGeneric: false,
  },
  {
    action: "document_request.created",
    severity: "critical",
    sentenceEn: "{actor} requested a document from {subject}",
    sentenceBn: "{actor} {subject}-এর কাছ থেকে একটি নথি অনুরোধ করেছেন",
    isGeneric: false,
  },
  {
    action: "document_request.approved",
    severity: "critical",
    sentenceEn: "{subject} approved a document request from {workspace}",
    sentenceBn: "{subject} {workspace}-এর নথি অনুরোধ অনুমোদন করেছেন",
    isGeneric: false,
  },
  {
    action: "document_request.declined",
    severity: "critical",
    sentenceEn: "{subject} declined a document request from {workspace}",
    sentenceBn: "{subject} {workspace}-এর নথি অনুরোধ প্রত্যাখ্যান করেছেন",
    isGeneric: false,
  },
  {
    action: "document_request.revoked",
    severity: "critical",
    sentenceEn: "{actor} revoked a document request",
    sentenceBn: "{actor} একটি নথি অনুরোধ প্রত্যাহার করেছেন",
    isGeneric: false,
  },
  {
    action: "document_request.expired",
    severity: "critical",
    sentenceEn: "A document request from {workspace} expired",
    sentenceBn: "{workspace}-এর নথি অনুরোধের মেয়াদ শেষ হয়ে গেছে",
    isGeneric: false,
  },
  {
    action: "file.uploaded",
    severity: "info",
    sentenceEn: "{actor} uploaded {name}",
    sentenceBn: "{actor} {name} আপলোড করেছেন",
    isGeneric: false,
  },
  {
    action: "file.deleted",
    severity: "info",
    sentenceEn: "{actor} deleted {name}",
    sentenceBn: "{actor} {name} মুছে ফেলেছেন",
    isGeneric: false,
  },
  {
    action: "file.downloaded",
    severity: "notable",
    sentenceEn: "{actor} downloaded {name}",
    sentenceBn: "{actor} {name} ডাউনলোড করেছেন",
    isGeneric: false,
  },
  {
    action: "personal_attendance.saved",
    severity: "info",
    sentenceEn: "{actor} saved attendance for {date} ({n} students)",
    sentenceBn: "{actor} {date}-এর উপস্থিতি সংরক্ষণ করেছেন ({n} জন শিক্ষার্থী)",
    isGeneric: false,
  },
  {
    action: "diary_entry.saved",
    severity: "info",
    sentenceEn: "{actor} saved a diary entry",
    sentenceBn: "{actor} একটি ডায়েরি এন্ট্রি সংরক্ষণ করেছেন",
    isGeneric: false,
  },
  {
    action: "teacher_profile.updated",
    severity: "notable",
    sentenceEn: "{actor} updated their teacher profile ({fields})",
    sentenceBn: "{actor} তাদের শিক্ষক প্রোফাইল হালনাগাদ করেছেন ({fields})",
    isGeneric: false,
  },
  {
    action: "teacher_profile.open_to_work_changed",
    severity: "notable",
    sentenceEn: "{actor} turned Open to work {after}",
    sentenceBn: '{actor} "কাজের জন্য উন্মুক্ত" {after} করেছেন',
    isGeneric: false,
  },
  {
    action: "tenancy.context_rejected",
    severity: "critical",
    sentenceEn: "A request tried to use workspace {id} without membership",
    sentenceBn:
      "একটি অনুরোধ সদস্যপদ ছাড়াই {id} ওয়ার্কস্পেস ব্যবহারের চেষ্টা করেছে",
    isGeneric: false,
  },
  {
    action: "platform.console_opened",
    severity: "info",
    sentenceEn: "{actor} (Acadigma) opened the platform console",
    sentenceBn: "{actor} (Acadigma) প্ল্যাটফর্ম কনসোল খুলেছেন",
    isGeneric: false,
  },
  {
    action: "platform.workspace_viewed",
    severity: "info",
    sentenceEn: "{actor} (Acadigma) viewed this workspace",
    sentenceBn: "{actor} (Acadigma) এই ওয়ার্কস্পেসটি দেখেছেন",
    isGeneric: false,
  },
  {
    action: "platform.person_looked_up",
    severity: "info",
    sentenceEn: "{actor} (Acadigma) looked up a person",
    sentenceBn: "{actor} (Acadigma) একজন ব্যক্তির তথ্য খুঁজেছেন",
    isGeneric: false,
  },
  {
    action: "platform.support_read",
    severity: "critical",
    sentenceEn: "{actor} (Acadigma) read {table} under a support grant",
    sentenceBn:
      "{actor} (Acadigma) একটি সহায়তা অনুমোদনের আওতায় {table} পড়েছেন",
    isGeneric: false,
  },
  {
    action: "platform.workspace_suspended",
    severity: "critical",
    sentenceEn: "{actor} (Acadigma) suspended this workspace — {reason}",
    sentenceBn: "{actor} (Acadigma) এই ওয়ার্কস্পেসটি স্থগিত করেছেন — {reason}",
    isGeneric: false,
  },
  {
    action: "platform.workspace_reinstated",
    severity: "critical",
    sentenceEn: "{actor} (Acadigma) reinstated this workspace",
    sentenceBn: "{actor} (Acadigma) এই ওয়ার্কস্পেসটি পুনর্বহাল করেছেন",
    isGeneric: false,
  },
  {
    action: "platform.feature_flag_changed",
    severity: "notable",
    sentenceEn:
      "{actor} (Acadigma) changed the flag {key} to {after} — {reason}",
    sentenceBn:
      "{actor} (Acadigma) {key} ফ্ল্যাগটি {after}-এ পরিবর্তন করেছেন — {reason}",
    isGeneric: false,
  },
  {
    action: "platform.plan_updated",
    severity: "notable",
    sentenceEn: "{actor} (Acadigma) updated the plan {key}",
    sentenceBn: "{actor} (Acadigma) {key} প্ল্যানটি হালনাগাদ করেছেন",
    isGeneric: false,
  },
  {
    action: "platform.settings_changed",
    severity: "notable",
    sentenceEn: "{actor} (Acadigma) changed platform settings ({fields})",
    sentenceBn:
      "{actor} (Acadigma) প্ল্যাটফর্ম সেটিংস পরিবর্তন করেছেন ({fields})",
    isGeneric: false,
  },
  {
    action: "platform.broadcast_sent",
    severity: "info",
    sentenceEn: "{actor} (Acadigma) sent a broadcast",
    sentenceBn: "{actor} (Acadigma) একটি বার্তা পাঠিয়েছেন",
    isGeneric: false,
  },
  {
    action: "platform.audit_viewed",
    severity: "info",
    sentenceEn: "{actor} (Acadigma) viewed the audit trail",
    sentenceBn: "{actor} (Acadigma) অডিট ট্রেইল দেখেছেন",
    isGeneric: false,
  },
  {
    action: "audit.exported",
    severity: "notable",
    sentenceEn: "{actor} exported {n} audit events",
    sentenceBn: "{actor} {n}টি অডিট ইভেন্ট রপ্তানি করেছেন",
    isGeneric: false,
  },
  {
    action: "consent.recorded",
    severity: "notable",
    sentenceEn: "{actor} recorded consent for {subject}",
    sentenceBn: "{actor} {subject}-এর সম্মতি রেকর্ড করেছেন",
    isGeneric: false,
  },
  {
    action: "retention.audit_events_purged",
    severity: "info",
    sentenceEn: "The system purged {n} audit events past retention",
    sentenceBn:
      "সিস্টেমটি ধরে রাখার মেয়াদ পার হওয়া {n}টি অডিট ইভেন্ট মুছে ফেলেছে",
    isGeneric: false,
  }, // F-AC-06 Part 3 (D-304) — one paper-level event per save_marks.
  {
    action: "marks.entered",
    severity: "info",
    sentenceEn: "{actor} saved marks on an exam paper ({n})",
    sentenceBn: "{actor} একটি পরীক্ষার পেপারে নম্বর সংরক্ষণ করেছেন ({n})",
    isGeneric: false,
  },
  // F-AC-06 Part 5 (D-305) — one event per compute_results run.
  {
    action: "results.computed",
    severity: "notable",
    sentenceEn: "{actor} computed an exam's results ({n})",
    sentenceBn: "{actor} একটি পরীক্ষার ফলাফল তৈরি করেছেন ({n})",
    isGeneric: false,
  },
  // F-AC-06 Part 5 (D-305) — unlocking marks clears the exam's results.
  {
    action: "results.cleared",
    severity: "notable",
    sentenceEn: "{actor} unlocked marks and cleared an exam's results ({n})",
    sentenceBn: "{actor} নম্বর আনলক করে একটি পরীক্ষার ফলাফল মুছে ফেলেছেন ({n})",
    isGeneric: false,
  },
  // F-AC-06 Part 7 (D-306) — publishing and unpublishing an exam's results.
  {
    action: "results.published",
    severity: "notable",
    sentenceEn: "{actor} published an exam's results ({n})",
    sentenceBn: "{actor} একটি পরীক্ষার ফলাফল প্রকাশ করেছেন ({n})",
    isGeneric: false,
  },
  {
    action: "results.unpublished",
    severity: "notable",
    sentenceEn: "{actor} unpublished an exam's results ({n})",
    sentenceBn: "{actor} একটি পরীক্ষার ফলাফল প্রকাশ বাতিল করেছেন ({n})",
    isGeneric: false,
  },
]

/**
 * Every table `app.attach_audit()` is called for (migration §7) — must match that
 * list exactly. `scripts/check-audit-catalog-parity.mjs` diffs it against the SQL.
 */
export const GENERIC_AUDIT_TABLES: readonly string[] = [
  "workspaces",
  "school_profiles",
  "workspace_members",
  "workspace_invitations",
  "custom_labels",
  "files",
  "profiles",
  "data_requests",
  "plans",
  "plan_prices",
  "plan_limits",
  "plan_modules",
  "subscriptions",
  "workspace_member_capabilities",
  "user_preferences",
  "device_registrations",
  // F-OP-06 Part 1 (D-63) — seeded in
  // supabase/migrations/20260925000900_staff_schema.sql, not the original
  // audit-substrate migration (never edited after it applied).
  "staff_records",
  "staff_compensation",
  "staff_documents",
  // F-ID-05 Part 4 (D-100) — seeded in
  // supabase/migrations/20260925300101_create_school_workspace.sql.
  "grade_levels",
  "academic_years",
  // F-AC-11 Part 1 (D-202) — 20260925300301_school_calendar.sql.
  "holidays",
  "working_day_overrides",
  // F-AC-06 Part 1 (D-302) — seeded in
  // supabase/migrations/20260925300302_grade_scales.sql.
  "grade_scales",
  "grade_bands",
  // F-AC-01 demo cut (D-102) — 20260925300304_sections_and_subjects.sql.
  "sections",
  "subjects",
  // F-AC-06 Part 2 (D-303) — 20260925300305_exams.sql.
  "exams",
  "exam_sections",
  "exam_subjects",
  // F-AC-02 demo cut (D-103) — 20260925300306_students_and_guardians.sql.
  "students",
  "student_private_details",
  "guardians",
  "enrollments",
  // F-AC-03 demo cut (D-104) — 20260925300309_attendance.sql.
  "attendance_sessions",
  "attendance_records",
  // F-AC-06 Part 3 (D-304) — 20260925300312_marks.sql.
  "marks",
  // F-AC-02 §4.7 (D-106) — 20260925300316_student_import_batches.sql.
  "student_import_batches",
  // F-AC-06 Part 7 (D-306) — 20260926022352_publish_results.sql.
  "guardian_users",
]

const GENERIC_SEVERITY: Record<"insert" | "update" | "delete", AuditSeverity> =
  {
    insert: "info",
    update: "notable",
    delete: "critical",
  }

/**
 * What each generic-audit table holds, in words a school reads (D-402) — never
 * the table name. A table missing here falls back to "a record", and
 * `catalog.test.ts` fails, so a new audited table has to add its noun.
 */
export const GENERIC_TABLE_NOUNS: Readonly<
  Record<string, { en: string; bn: string }>
> = {
  workspaces: { en: "the workspace", bn: "ওয়ার্কস্পেস" },
  school_profiles: { en: "a school setting", bn: "স্কুলের একটি সেটিং" },
  workspace_members: { en: "a member", bn: "একজন সদস্য" },
  workspace_invitations: { en: "an invitation", bn: "একটি আমন্ত্রণ" },
  custom_labels: { en: "a custom label", bn: "একটি কাস্টম লেবেল" },
  files: { en: "a file", bn: "একটি ফাইল" },
  profiles: { en: "a user profile", bn: "একটি ব্যবহারকারী প্রোফাইল" },
  data_requests: { en: "a data request", bn: "একটি ডেটা অনুরোধ" },
  plans: { en: "a plan", bn: "একটি প্ল্যান" },
  plan_prices: { en: "a plan price", bn: "একটি প্ল্যানের মূল্য" },
  plan_limits: { en: "a plan limit", bn: "একটি প্ল্যানের সীমা" },
  plan_modules: { en: "a plan module", bn: "একটি প্ল্যান মডিউল" },
  subscriptions: { en: "the subscription", bn: "সাবস্ক্রিপশন" },
  workspace_member_capabilities: {
    en: "a member's permissions",
    bn: "একজন সদস্যের অনুমতি",
  },
  user_preferences: { en: "their preferences", bn: "নিজের পছন্দসমূহ" },
  device_registrations: { en: "a device", bn: "একটি ডিভাইস" },
  staff_records: { en: "a staff record", bn: "একটি স্টাফ রেকর্ড" },
  staff_compensation: { en: "a staff pay record", bn: "একটি বেতন রেকর্ড" },
  staff_documents: { en: "a staff document", bn: "একটি স্টাফ নথি" },
  grade_levels: { en: "a class", bn: "একটি শ্রেণি" },
  academic_years: { en: "an academic year", bn: "একটি শিক্ষাবর্ষ" },
  holidays: { en: "a holiday", bn: "একটি ছুটি" },
  working_day_overrides: {
    en: "a working-day change",
    bn: "একটি কর্মদিবস পরিবর্তন",
  },
  grade_scales: { en: "a grading scale", bn: "একটি গ্রেডিং স্কেল" },
  grade_bands: { en: "a grade band", bn: "একটি গ্রেড ব্যান্ড" },
  sections: { en: "a section", bn: "একটি শাখা" },
  subjects: { en: "a subject", bn: "একটি বিষয়" },
  exams: { en: "an exam", bn: "একটি পরীক্ষা" },
  exam_sections: { en: "an exam's section", bn: "পরীক্ষার একটি শাখা" },
  exam_subjects: { en: "an exam paper", bn: "একটি পরীক্ষার পেপার" },
  students: { en: "a student", bn: "একজন শিক্ষার্থী" },
  student_private_details: {
    en: "a student's private details",
    bn: "একজন শিক্ষার্থীর ব্যক্তিগত তথ্য",
  },
  guardians: { en: "a guardian", bn: "একজন অভিভাবক" },
  guardian_users: {
    en: "a parent's link to a child",
    bn: "সন্তানের সাথে অভিভাবকের সংযোগ",
  },
  enrollments: { en: "an enrolment", bn: "একটি ভর্তি" },
  attendance_sessions: {
    en: "a class's attendance",
    bn: "একটি শ্রেণির হাজিরা",
  },
  attendance_records: {
    en: "a student's attendance",
    bn: "একজন শিক্ষার্থীর হাজিরা",
  },
  marks: { en: "a student's mark", bn: "একজন শিক্ষার্থীর নম্বর" },
  student_import_batches: {
    en: "a student import",
    bn: "একটি শিক্ষার্থী আমদানি",
  },
}

/**
 * Per-table severity overrides, mirrored from the migrations' `update
 * public.audit_action_catalog set severity` lines. grade_bands rows churn on
 * every save (delete + insert of the whole set), so they are info-level
 * (20260925300302_grade_scales.sql, review of PR #46).
 */
const GENERIC_SEVERITY_OVERRIDES: Readonly<
  Record<string, Partial<Record<"insert" | "update" | "delete", AuditSeverity>>>
> = {
  grade_bands: { update: "info", delete: "info" },
  // A re-save touches the session every morning (20260925300309_attendance.sql).
  attendance_sessions: { update: "info" },
}

const GENERIC_VERBS = {
  insert: { en: "added", bn: "যোগ করেছেন" },
  update: { en: "updated", bn: "হালনাগাদ করেছেন" },
  delete: { en: "removed", bn: "মুছে ফেলেছেন" },
} as const

/**
 * The three `<table>.<op>` rows the trigger writes for one table (migration
 * §4.2), phrased for a reader: "{actor} added a holiday". The changed columns
 * are not in the sentence; the detail sheet lists them.
 */
export function genericActionsForTable(
  table: string
): readonly AuditActionCatalogEntry[] {
  const noun = GENERIC_TABLE_NOUNS[table] ?? {
    en: "a record",
    bn: "একটি রেকর্ড",
  }
  return (["insert", "update", "delete"] as const).map((op) => ({
    action: `${table}.${op}`,
    severity: GENERIC_SEVERITY_OVERRIDES[table]?.[op] ?? GENERIC_SEVERITY[op],
    sentenceEn: `{actor} ${GENERIC_VERBS[op].en} ${noun.en}`,
    sentenceBn: `{actor} ${noun.bn} ${GENERIC_VERBS[op].bn}`,
    isGeneric: true,
  }))
}

/** The complete catalogue: curated actions + the generated generic rows. */
export const FULL_AUDIT_ACTION_CATALOG: readonly AuditActionCatalogEntry[] = [
  ...AUDIT_ACTION_CATALOG,
  ...GENERIC_AUDIT_TABLES.flatMap(genericActionsForTable),
]

const CATALOG_BY_ACTION = new Map(
  FULL_AUDIT_ACTION_CATALOG.map((entry) => [entry.action, entry])
)

export function catalogEntry(
  action: string
): AuditActionCatalogEntry | undefined {
  return CATALOG_BY_ACTION.get(action)
}

export function isKnownAuditAction(action: string): boolean {
  return CATALOG_BY_ACTION.has(action)
}

export function severityForAction(action: string): AuditSeverity {
  return catalogEntry(action)?.severity ?? "info"
}
