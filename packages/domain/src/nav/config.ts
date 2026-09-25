import type { WorkspaceRole } from "../permissions"
import type { NavConfig, NavConfigKey } from "./types"

/**
 * The five curated nav layouts from DESIGN-SYSTEM §3.2, transcribed item for
 * item. These are genuinely different curated sets per role-group — not one
 * flat list filtered down — because the design intentionally shows a
 * teacher's daily loop (attendance → timetable → messages) and an owner's
 * monitoring loop (attendance → students → messages) differently even though
 * both roles are permitted to read both attendance and timetable. `can()`
 * from `../permissions` is necessary but not sufficient to reconstruct this;
 * the curated order is product decision, recorded here as data.
 */
export const NAV_CONFIGS: Record<NavConfigKey, NavConfig> = {
  // -----------------------------------------------------------------------
  // School workspace /app — owner / admin
  // -----------------------------------------------------------------------
  "school:owner_admin": {
    bottom: [
      {
        id: "dashboard",
        href: "/app/dashboard",
        labelEn: "Overview",
        labelBn: "সারসংক্ষেপ",
        icon: "layout-dashboard",
      },
      {
        id: "attendance",
        href: "/app/attendance",
        labelEn: "Attendance",
        labelBn: "উপস্থিতি",
        icon: "clipboard-check",
        module: "attendance",
      },
      {
        id: "students",
        href: "/app/students",
        labelEn: "Students",
        labelBn: "শিক্ষার্থী",
        icon: "users",
        module: "students",
      },
      {
        id: "messages",
        href: "/app/messages",
        labelEn: "Messages",
        labelBn: "বার্তা",
        icon: "message-circle",
        module: "messages",
      },
    ],
    more: [
      {
        id: "academic",
        labelEn: "Academic",
        labelBn: "একাডেমিক",
        items: [
          {
            id: "classes",
            href: "/app/classes",
            labelEn: "Classes & sections",
            labelBn: "শ্রেণি ও শাখা",
            icon: "school",
            module: "students",
          },
          {
            id: "timetable",
            href: "/app/timetable",
            labelEn: "Timetable",
            labelBn: "রুটিন",
            icon: "calendar-days",
            module: "timetable",
          },
          {
            id: "exams",
            href: "/app/exams",
            labelEn: "Exams",
            labelBn: "পরীক্ষা",
            icon: "file-check",
            module: "exams",
          },
          {
            id: "marks",
            href: "/app/marks",
            labelEn: "Marks",
            labelBn: "নম্বর",
            icon: "list-checks",
            module: "marks",
          },
          {
            id: "curriculum",
            href: "/app/curriculum",
            labelEn: "Curriculum",
            labelBn: "পাঠ্যক্রম",
            icon: "book-open",
            module: "curriculum",
          },
          {
            id: "assignments",
            href: "/app/assignments",
            labelEn: "Assignments",
            labelBn: "অ্যাসাইনমেন্ট",
            icon: "clipboard-list",
            module: "assignments",
          },
          {
            id: "lesson-plans",
            href: "/app/lessons",
            labelEn: "Lesson plans",
            labelBn: "পাঠ পরিকল্পনা",
            icon: "notebook",
            module: "lessons",
          },
        ],
      },
      {
        id: "people",
        labelEn: "People",
        labelBn: "কর্মী",
        items: [
          {
            id: "staff",
            href: "/app/staff",
            labelEn: "Staff",
            labelBn: "কর্মী তালিকা",
            icon: "user-cog",
            module: "staff",
          },
          {
            id: "staff-attendance",
            href: "/app/staff/attendance",
            labelEn: "Staff attendance",
            labelBn: "কর্মীর উপস্থিতি",
            icon: "clipboard-check",
            module: "attendance",
          },
          {
            id: "team",
            href: "/app/staff/team",
            labelEn: "Team & access",
            labelBn: "টিম ও অ্যাক্সেস",
            icon: "shield-check",
          },
          {
            id: "hiring",
            href: "/app/hiring",
            labelEn: "Hiring",
            labelBn: "নিয়োগ",
            icon: "briefcase",
            module: "hiring",
          },
          {
            id: "cover",
            href: "/app/cover",
            labelEn: "Cover teacher",
            labelBn: "কভার শিক্ষক",
            icon: "user-round-search",
            module: "cover",
          },
          {
            id: "labels",
            href: "/app/settings/labels",
            labelEn: "Custom labels",
            labelBn: "কাস্টম লেবেল",
            icon: "tag",
          },
        ],
      },
      {
        id: "output",
        labelEn: "Output",
        labelBn: "আউটপুট",
        items: [
          {
            id: "reports",
            href: "/app/reports",
            labelEn: "Reports",
            labelBn: "রিপোর্ট",
            icon: "bar-chart-3",
            module: "reports",
          },
          {
            id: "print",
            href: "/app/print",
            labelEn: "Print queue",
            labelBn: "প্রিন্ট সারি",
            icon: "printer",
            module: "print",
          },
          {
            id: "announcements",
            href: "/app/announcements",
            labelEn: "Announcements",
            labelBn: "ঘোষণা",
            icon: "megaphone",
            module: "messages",
          },
        ],
      },
      {
        id: "library",
        labelEn: "Library",
        labelBn: "লাইব্রেরি",
        items: [
          {
            id: "resource-library",
            href: "/app/library",
            labelEn: "Resource library",
            labelBn: "রিসোর্স লাইব্রেরি",
            icon: "library",
            module: "library",
          },
          {
            id: "ai-usage",
            href: "/app/ai",
            labelEn: "AI usage & credits",
            labelBn: "এআই ব্যবহার",
            icon: "sparkles",
            module: "ai",
          },
        ],
      },
      {
        id: "business",
        labelEn: "Business",
        labelBn: "ব্যবসা",
        items: [
          {
            id: "billing",
            href: "/app/settings/billing",
            labelEn: "Billing & plan",
            labelBn: "বিলিং ও প্ল্যান",
            icon: "credit-card",
            module: "billing",
            // Owner-only within More (F-ID-03 §6 table footnote).
            roles: ["owner"],
          },
          {
            id: "expenses",
            href: "/app/expenses",
            labelEn: "Expenses",
            labelBn: "খরচ",
            icon: "wallet",
          },
          {
            id: "marketplace",
            href: "/market",
            labelEn: "Marketplace",
            labelBn: "মার্কেটপ্লেস",
            icon: "store",
            module: "marketplace",
          },
          {
            id: "analytics",
            href: "/app/analytics",
            labelEn: "Analytics",
            labelBn: "অ্যানালিটিক্স",
            icon: "trending-up",
          },
        ],
      },
      {
        id: "admin",
        labelEn: "Admin",
        labelBn: "প্রশাসন",
        items: [
          {
            id: "audit-log",
            href: "/app/audit",
            labelEn: "Audit log",
            labelBn: "অডিট লগ",
            icon: "history",
            // Owner-only within More (F-ID-03 §6 table footnote).
            roles: ["owner"],
          },
          {
            id: "school-settings",
            // The settings home (F-OP-07, D-201); /app/settings/workspace is
            // the lifecycle sub-page it will link to once F-ID-03 Part 8 ships.
            href: "/app/settings",
            labelEn: "School settings",
            labelBn: "স্কুল সেটিংস",
            icon: "settings",
          },
          {
            id: "help",
            href: "/help",
            labelEn: "Help & feedback",
            labelBn: "সহায়তা",
            icon: "life-buoy",
          },
        ],
      },
    ],
  },

  // -----------------------------------------------------------------------
  // School workspace /app — teacher (the primary daily user)
  // -----------------------------------------------------------------------
  "school:teacher": {
    bottom: [
      {
        id: "dashboard",
        href: "/app/dashboard",
        labelEn: "Today",
        labelBn: "আজ",
        icon: "layout-dashboard",
      },
      {
        id: "attendance",
        href: "/app/attendance",
        labelEn: "Attendance",
        labelBn: "উপস্থিতি",
        icon: "clipboard-check",
        module: "attendance",
      },
      {
        id: "timetable",
        href: "/app/timetable",
        labelEn: "Timetable",
        labelBn: "রুটিন",
        icon: "calendar-days",
        module: "timetable",
      },
      {
        id: "messages",
        href: "/app/messages",
        labelEn: "Messages",
        labelBn: "বার্তা",
        icon: "message-circle",
        module: "messages",
      },
    ],
    more: [
      {
        id: "teaching",
        labelEn: "Teaching",
        labelBn: "শিক্ষাদান",
        items: [
          {
            id: "classes",
            href: "/app/classes",
            labelEn: "Classes",
            labelBn: "শ্রেণি",
            icon: "school",
            module: "students",
          },
          {
            id: "marks",
            href: "/app/marks",
            labelEn: "Marks",
            labelBn: "নম্বর",
            icon: "list-checks",
            module: "marks",
          },
          {
            id: "assignments",
            href: "/app/assignments",
            labelEn: "Assignments",
            labelBn: "অ্যাসাইনমেন্ট",
            icon: "clipboard-list",
            module: "assignments",
          },
          {
            id: "lesson-plans",
            href: "/app/lessons",
            labelEn: "Lesson plans",
            labelBn: "পাঠ পরিকল্পনা",
            icon: "notebook",
            module: "lessons",
          },
          {
            id: "curriculum",
            href: "/app/curriculum",
            labelEn: "Curriculum & pacing",
            labelBn: "পাঠ্যক্রম",
            icon: "book-open",
            module: "curriculum",
          },
          {
            id: "lesson-log",
            href: "/app/lessons/log",
            labelEn: "Lesson log",
            labelBn: "পাঠ লগ",
            icon: "book-marked",
            module: "lessons",
          },
        ],
      },
      {
        id: "students",
        labelEn: "Students",
        labelBn: "শিক্ষার্থী",
        items: [
          {
            id: "students",
            href: "/app/students",
            labelEn: "Students",
            labelBn: "শিক্ষার্থী",
            icon: "users",
            module: "students",
          },
          {
            id: "behaviour",
            href: "/app/students/behaviour",
            labelEn: "Behaviour notes",
            labelBn: "আচরণ নোট",
            icon: "heart-handshake",
            module: "students",
          },
          {
            id: "at-risk",
            href: "/app/students/at-risk",
            labelEn: "At-risk",
            labelBn: "ঝুঁকিতে থাকা",
            icon: "alert-triangle",
            module: "students",
          },
        ],
      },
      {
        id: "exams",
        labelEn: "Exams",
        labelBn: "পরীক্ষা",
        items: [
          {
            id: "exams",
            href: "/app/exams",
            labelEn: "Exams",
            labelBn: "পরীক্ষা",
            icon: "file-check",
            module: "exams",
          },
          {
            id: "mark-entry",
            href: "/app/exams/marks",
            labelEn: "Mark entry",
            labelBn: "নম্বর এন্ট্রি",
            icon: "list-checks",
            module: "marks",
          },
          {
            id: "report-cards",
            href: "/app/exams/report-cards",
            labelEn: "Report cards",
            labelBn: "রিপোর্ট কার্ড",
            icon: "file-text",
            module: "exams",
          },
        ],
      },
      {
        id: "library",
        labelEn: "Library",
        labelBn: "লাইব্রেরি",
        items: [
          {
            id: "my-resources",
            href: "/app/library/mine",
            labelEn: "My resources",
            labelBn: "আমার রিসোর্স",
            icon: "folder-open",
            module: "resources",
          },
          {
            id: "school-library",
            href: "/app/library",
            labelEn: "School library",
            labelBn: "স্কুল লাইব্রেরি",
            icon: "library",
            module: "library",
          },
          {
            id: "ai-tools",
            href: "/app/ai",
            labelEn: "AI tools & credits",
            labelBn: "এআই টুলস",
            icon: "sparkles",
            module: "ai",
          },
        ],
      },
      {
        id: "work",
        labelEn: "Work",
        labelBn: "কর্মজীবন",
        items: [
          {
            id: "workload",
            href: "/app/workload",
            labelEn: "My workload",
            labelBn: "আমার কর্মভার",
            icon: "gauge",
          },
          {
            id: "cover-requests",
            href: "/app/cover/requests",
            labelEn: "Cover requests",
            labelBn: "কভার অনুরোধ",
            icon: "user-round-search",
            module: "cover",
          },
          {
            id: "self-checkin",
            href: "/app/staff/attendance/self",
            labelEn: "Staff attendance (self check-in)",
            labelBn: "নিজ উপস্থিতি",
            icon: "clipboard-check",
            module: "attendance",
          },
        ],
      },
      {
        id: "other",
        labelEn: "Other",
        labelBn: "অন্যান্য",
        items: [
          {
            id: "reports",
            href: "/app/reports",
            labelEn: "Reports",
            labelBn: "রিপোর্ট",
            icon: "bar-chart-3",
            module: "reports",
          },
          {
            id: "print",
            href: "/app/print",
            labelEn: "Print queue",
            labelBn: "প্রিন্ট সারি",
            icon: "printer",
            module: "print",
          },
          {
            id: "marketplace",
            href: "/market",
            labelEn: "Marketplace",
            labelBn: "মার্কেটপ্লেস",
            icon: "store",
            module: "marketplace",
          },
          {
            id: "sell",
            href: "/sell",
            labelEn: "Selling",
            labelBn: "বিক্রয়",
            icon: "shopping-bag",
          },
          {
            id: "settings",
            href: "/app/settings",
            labelEn: "Settings",
            labelBn: "সেটিংস",
            icon: "settings",
          },
          {
            id: "help",
            href: "/help",
            labelEn: "Help & feedback",
            labelBn: "সহায়তা",
            icon: "life-buoy",
          },
        ],
      },
    ],
  },

  // -----------------------------------------------------------------------
  // School workspace /app — staff (office, accounts, library)
  // -----------------------------------------------------------------------
  "school:staff": {
    bottom: [
      {
        id: "dashboard",
        href: "/app/dashboard",
        labelEn: "Home",
        labelBn: "হোম",
        icon: "layout-dashboard",
      },
      {
        id: "students",
        href: "/app/students",
        labelEn: "Students",
        labelBn: "শিক্ষার্থী",
        icon: "users",
        module: "students",
      },
      {
        id: "print",
        href: "/app/print",
        labelEn: "Print",
        labelBn: "প্রিন্ট",
        icon: "printer",
        module: "print",
      },
      {
        id: "messages",
        href: "/app/messages",
        labelEn: "Messages",
        labelBn: "বার্তা",
        icon: "message-circle",
        module: "messages",
      },
    ],
    more: [
      {
        id: "other",
        labelEn: "Other",
        labelBn: "অন্যান্য",
        items: [
          {
            id: "self-checkin",
            href: "/app/staff/attendance/self",
            labelEn: "My attendance (self check-in)",
            labelBn: "নিজ উপস্থিতি",
            icon: "clipboard-check",
            module: "attendance",
          },
          {
            id: "timetable",
            href: "/app/timetable",
            labelEn: "Timetable",
            labelBn: "রুটিন",
            icon: "calendar-days",
            module: "timetable",
          },
          {
            id: "resource-library",
            href: "/app/library",
            labelEn: "Resource library",
            labelBn: "রিসোর্স লাইব্রেরি",
            icon: "library",
            module: "resources",
          },
          {
            id: "expenses",
            href: "/app/expenses",
            labelEn: "Expenses",
            labelBn: "খরচ",
            icon: "wallet",
          },
          {
            id: "files",
            href: "/app/files",
            labelEn: "Files",
            labelBn: "ফাইল",
            icon: "folder",
          },
          {
            id: "reports",
            href: "/app/reports",
            labelEn: "Reports",
            labelBn: "রিপোর্ট",
            icon: "bar-chart-3",
            module: "reports",
          },
          {
            id: "marketplace",
            href: "/market",
            labelEn: "Marketplace",
            labelBn: "মার্কেটপ্লেস",
            icon: "store",
            module: "marketplace",
          },
          {
            id: "settings",
            href: "/app/settings",
            labelEn: "Settings",
            labelBn: "সেটিংস",
            icon: "settings",
          },
          {
            id: "help",
            href: "/help",
            labelEn: "Help",
            labelBn: "সহায়তা",
            icon: "life-buoy",
          },
        ],
      },
    ],
  },

  // -----------------------------------------------------------------------
  // Parent shell /family — read-only throughout, no FAB anywhere.
  // -----------------------------------------------------------------------
  "family:parent": {
    bottom: [
      {
        id: "home",
        href: "/family",
        labelEn: "Home",
        labelBn: "হোম",
        icon: "layout-dashboard",
      },
      {
        id: "attendance",
        href: "/family/attendance",
        labelEn: "Attendance",
        labelBn: "উপস্থিতি",
        icon: "clipboard-check",
        module: "attendance",
      },
      {
        id: "results",
        href: "/family/results",
        labelEn: "Results",
        labelBn: "ফলাফল",
        icon: "file-check",
        module: "exams",
      },
      {
        id: "messages",
        href: "/family/messages",
        labelEn: "Messages",
        labelBn: "বার্তা",
        icon: "message-circle",
        module: "messages",
      },
    ],
    more: [
      {
        id: "other",
        labelEn: "Other",
        labelBn: "অন্যান্য",
        items: [
          {
            id: "timetable",
            href: "/family/timetable",
            labelEn: "Timetable",
            labelBn: "রুটিন",
            icon: "calendar-days",
            module: "timetable",
          },
          {
            id: "exam-schedule",
            href: "/family/exams",
            labelEn: "Exam schedule",
            labelBn: "পরীক্ষার সময়সূচী",
            icon: "calendar-clock",
            module: "exams",
          },
          {
            id: "assignments",
            href: "/family/assignments",
            labelEn: "Assignments",
            labelBn: "অ্যাসাইনমেন্ট",
            icon: "clipboard-list",
            module: "assignments",
          },
          {
            id: "behaviour",
            href: "/family/behaviour",
            labelEn: "Behaviour notes",
            labelBn: "আচরণ নোট",
            icon: "heart-handshake",
            module: "students",
          },
          {
            id: "announcements",
            href: "/family/announcements",
            labelEn: "Announcements",
            labelBn: "ঘোষণা",
            icon: "megaphone",
            module: "messages",
          },
          {
            id: "fees",
            href: "/family/fees",
            labelEn: "Fees & receipts",
            labelBn: "ফি ও রশিদ",
            icon: "receipt",
            module: "billing",
          },
          {
            id: "contact-school",
            href: "/family/contact",
            labelEn: "Contact the school",
            labelBn: "স্কুলে যোগাযোগ",
            icon: "phone",
          },
          {
            id: "switch-child",
            href: "/family/children",
            labelEn: "Switch child",
            labelBn: "সন্তান পরিবর্তন",
            icon: "repeat",
          },
          {
            id: "settings",
            href: "/family/settings",
            labelEn: "Settings",
            labelBn: "সেটিংস",
            icon: "settings",
          },
          {
            id: "help",
            href: "/help",
            labelEn: "Help",
            labelBn: "সহায়তা",
            icon: "life-buoy",
          },
        ],
      },
    ],
  },

  // -----------------------------------------------------------------------
  // Personal workspace /personal — flat, every member is its owner
  // (PRODUCT-DECISIONS 1.5, F-ID-03 §2), so no role filtering applies here.
  // -----------------------------------------------------------------------
  "personal:owner": {
    bottom: [
      {
        id: "home",
        href: "/personal",
        labelEn: "Home",
        labelBn: "হোম",
        icon: "layout-dashboard",
      },
      {
        id: "students",
        href: "/personal/students",
        labelEn: "Students",
        labelBn: "শিক্ষার্থী",
        icon: "users",
      },
      {
        id: "attendance",
        href: "/personal/attendance",
        labelEn: "Attendance",
        labelBn: "উপস্থিতি",
        icon: "clipboard-check",
      },
      {
        id: "diary",
        href: "/personal/diary",
        labelEn: "Diary",
        labelBn: "ডায়েরি",
        icon: "book-open",
      },
    ],
    more: [
      {
        id: "other",
        labelEn: "Other",
        labelBn: "অন্যান্য",
        items: [
          {
            id: "file-vault",
            href: "/personal/files",
            labelEn: "File vault",
            labelBn: "ফাইল ভল্ট",
            icon: "folder-lock",
          },
          {
            id: "cv",
            href: "/personal/cv",
            labelEn: "CV & teacher profile",
            labelBn: "সিভি",
            icon: "id-card",
          },
          {
            id: "job-applications",
            href: "/personal/jobs",
            labelEn: "Job applications",
            labelBn: "চাকরির আবেদন",
            icon: "briefcase",
          },
          {
            id: "document-requests",
            href: "/personal/documents",
            labelEn: "Document requests",
            labelBn: "নথি অনুরোধ",
            icon: "file-text",
          },
          {
            id: "schools",
            href: "/personal/workspaces",
            labelEn: "Schools (join / create / switch)",
            labelBn: "স্কুল",
            icon: "school",
          },
          {
            id: "sell",
            href: "/sell",
            labelEn: "Selling",
            labelBn: "বিক্রয়",
            icon: "shopping-bag",
          },
          {
            id: "marketplace",
            href: "/market",
            labelEn: "Marketplace",
            labelBn: "মার্কেটপ্লেস",
            icon: "store",
          },
          {
            id: "settings",
            href: "/personal/settings",
            labelEn: "Settings",
            labelBn: "সেটিংস",
            icon: "settings",
          },
          {
            id: "help",
            href: "/help",
            labelEn: "Help",
            labelBn: "সহায়তা",
            icon: "life-buoy",
          },
        ],
      },
    ],
  },
}

/**
 * Maps a resolved `WorkspaceContext` onto one of the five curated configs
 * above. `null` covers surfaces this module does not lay out — the seller
 * sub-shell (`/sell`) and the marketplace shell (`/market`) are entered from
 * the avatar menu / a link, not resolved from workspace type ∧ role
 * (DESIGN-SYSTEM §3.2), so they are out of scope here on purpose.
 */
export function resolveNavConfigKey(
  workspaceType: "school" | "personal",
  role: WorkspaceRole
): NavConfigKey | null {
  if (workspaceType === "personal") return "personal:owner"

  switch (role) {
    case "owner":
    case "admin":
      return "school:owner_admin"
    case "teacher":
      return "school:teacher"
    case "staff":
      return "school:staff"
    case "parent":
      return "family:parent"
    default:
      return null
  }
}

/** Convenience wrapper around `NAV_CONFIGS` + `resolveNavConfigKey`. */
export function getNavConfig(
  workspaceType: "school" | "personal",
  role: WorkspaceRole
): NavConfig | null {
  const key = resolveNavConfigKey(workspaceType, role)
  return key ? NAV_CONFIGS[key] : null
}
