/**
 * Navigation config (DESIGN-SYSTEM §3.2): one typed object per workspace type,
 * filtered by `role ∧ plan-entitlement ∧ owner-visibility`. `BottomNav` and the
 * desktop `Sidebar` both render from the same `NavConfig` — the shell changes,
 * the config does not.
 *
 * Route paths here are the ones §3.2 names explicitly; "More" items whose route
 * the design doc leaves implicit use a slug derived from the label under the
 * workspace's prefix. Feature areas own the real route as they ship it — this
 * file is the navigation *shape* (order, grouping, gating), not a route table.
 */
import * as React from "react"

/** One tree-shaken icon per item, resolved by name so a config stays serialisable. */
export type IconName =
  | "home"
  | "check-square"
  | "calendar"
  | "message-square"
  | "more-horizontal"
  | "users"
  | "graduation-cap"
  | "book-open"
  | "clipboard-list"
  | "clipboard-check"
  | "printer"
  | "file-text"
  | "bar-chart"
  | "briefcase"
  | "shield"
  | "settings"
  | "help-circle"
  | "wallet"
  | "store"
  | "package"
  | "receipt"
  | "banknote"
  | "user-check"
  | "megaphone"
  | "folder"
  | "trending-up"
  | "shield-check"
  | "layout-grid"
  | "credit-card"
  | "arrow-left-right"
  | "building-2"
  | "hand-coins"

/** `docs/architecture/DATA-MODEL.md` roles, widened to a plain string so a new
 * role (e.g. a future workspace type) never needs an edit here to compile. */
export type Role = string

/** A plan-gated module key, e.g. `"fees"`, `"marketplace"`, `"hiring"`. */
export type ModuleKey = string

export type BadgeSource = {
  /** Pre-resolved count. `AppShell`/`BottomNav` never fetch — the caller does. */
  count?: number
}

export type NavItem = {
  id: string
  href: string
  labelEn: string
  labelBn: string
  icon: IconName
  /** Omitted = every role in this workspace type. */
  roles?: Role[]
  /** Gated by plan entitlement + owner visibility. */
  module?: ModuleKey
  /** Visible to the workspace owner only, regardless of role (§3.2 "Owner-only within More"). */
  ownerOnly?: boolean
  badge?: BadgeSource
}

export type NavGroup = {
  id: string
  labelEn: string
  labelBn: string
  items: readonly NavItem[]
}

export type NavConfig = {
  /** The primary destinations. `BottomNav` renders these, then always appends
   * "More" as the final slot when `more` is non-empty — so this holds at most
   * 4 items, keeping the rendered bar at the documented 5-slot ceiling. */
  bottom: readonly NavItem[]
  more: readonly NavGroup[]
}

export const BOTTOM_NAV_PRIMARY_MAX = 4

export type NavFilterContext = {
  role: Role
  /** True for the workspace owner. Personal workspaces: every member is the owner. */
  isOwner: boolean
  /** Plan-entitlement + feature-flag check for a gated module. */
  hasModule: (module: ModuleKey) => boolean
}

function isItemVisible(item: NavItem, ctx: NavFilterContext): boolean {
  if (item.roles && !item.roles.includes(ctx.role)) return false
  if (item.ownerOnly && !ctx.isOwner) return false
  if (item.module && !ctx.hasModule(item.module)) return false
  return true
}

/**
 * Applies `role ∧ plan-entitlement ∧ owner-visibility` to a nav config. Pure —
 * safe to call on the server (to decide what to render) or memoised on the
 * client via `useFilteredNav`.
 */
export function filterNavConfig(
  config: NavConfig,
  ctx: NavFilterContext
): NavConfig {
  return {
    bottom: config.bottom
      .filter((item) => isItemVisible(item, ctx))
      .slice(0, BOTTOM_NAV_PRIMARY_MAX),
    more: config.more
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => isItemVisible(item, ctx)),
      }))
      .filter((group) => group.items.length > 0),
  }
}

/** Client-side memoised version of `filterNavConfig`, for `AppShell`/`BottomNav`. */
export function useFilteredNav(
  config: NavConfig,
  ctx: NavFilterContext
): NavConfig {
  const { role, isOwner, hasModule } = ctx
  return React.useMemo(
    () => filterNavConfig(config, { role, isOwner, hasModule }),
    [config, role, isOwner, hasModule]
  )
}

/** Sum of every visible item's badge count, for the aggregate badge on "More". */
export function aggregateMoreBadgeCount(config: NavConfig): number {
  return config.more.reduce(
    (total, group) =>
      total +
      group.items.reduce((sum, item) => sum + (item.badge?.count ?? 0), 0),
    0
  )
}

// ---------------------------------------------------------------------------
// School workspace `/app` — teacher (DESIGN-SYSTEM §3.2)
// ---------------------------------------------------------------------------

export const schoolTeacherNav: NavConfig = {
  bottom: [
    {
      id: "today",
      href: "/app/dashboard",
      labelEn: "Today",
      labelBn: "আজ",
      icon: "home",
      roles: ["teacher"],
    },
    {
      id: "attendance",
      href: "/app/attendance",
      labelEn: "Attendance",
      labelBn: "হাজিরা",
      icon: "check-square",
      roles: ["teacher"],
    },
    {
      id: "timetable",
      href: "/app/timetable",
      labelEn: "Timetable",
      labelBn: "রুটিন",
      icon: "calendar",
      roles: ["teacher"],
    },
    {
      id: "messages",
      href: "/app/messages",
      labelEn: "Messages",
      labelBn: "বার্তা",
      icon: "message-square",
      roles: ["teacher"],
    },
  ],
  more: [
    {
      id: "teaching",
      labelEn: "Teaching",
      labelBn: "শিক্ষাদান",
      items: [
        item("classes", "/app/classes", "Classes", "ক্লাস", "users", [
          "teacher",
        ]),
        item("marks", "/app/marks", "Marks", "নম্বর", "clipboard-check", [
          "teacher",
        ]),
        item(
          "assignments",
          "/app/assignments",
          "Assignments",
          "অ্যাসাইনমেন্ট",
          "clipboard-list",
          ["teacher"]
        ),
        item(
          "lesson-plans",
          "/app/lesson-plans",
          "Lesson plans",
          "পাঠ পরিকল্পনা",
          "book-open",
          ["teacher"]
        ),
        item(
          "curriculum",
          "/app/curriculum",
          "Curriculum & pacing",
          "পাঠ্যক্রম",
          "book-open",
          ["teacher"]
        ),
        item(
          "lesson-log",
          "/app/lesson-log",
          "Lesson log",
          "পাঠ লগ",
          "file-text",
          ["teacher"]
        ),
      ],
    },
    {
      id: "students",
      labelEn: "Students",
      labelBn: "শিক্ষার্থী",
      items: [
        item("students", "/app/students", "Students", "শিক্ষার্থী", "users", [
          "teacher",
        ]),
        item(
          "behaviour-notes",
          "/app/behaviour-notes",
          "Behaviour notes",
          "আচরণ নোট",
          "file-text",
          ["teacher"]
        ),
        item("at-risk", "/app/at-risk", "At-risk", "ঝুঁকিপূর্ণ", "shield", [
          "teacher",
        ]),
      ],
    },
    {
      id: "exams",
      labelEn: "Exams",
      labelBn: "পরীক্ষা",
      items: [
        item("exams", "/app/exams", "Exams", "পরীক্ষা", "file-text", [
          "teacher",
        ]),
        item(
          "mark-entry",
          "/app/exams/mark-entry",
          "Mark entry",
          "নম্বর প্রবেশ",
          "clipboard-check",
          ["teacher"]
        ),
        item(
          "report-cards",
          "/app/report-cards",
          "Report cards",
          "রিপোর্ট কার্ড",
          "file-text",
          ["teacher"]
        ),
      ],
    },
    {
      id: "library",
      labelEn: "Library",
      labelBn: "লাইব্রেরি",
      items: [
        item(
          "my-resources",
          "/app/resources/mine",
          "My resources",
          "আমার রিসোর্স",
          "folder",
          ["teacher"]
        ),
        item(
          "school-library",
          "/app/resources",
          "School library",
          "স্কুল লাইব্রেরি",
          "folder",
          ["teacher"]
        ),
        item(
          "ai-tools",
          "/app/ai",
          "AI tools & credits",
          "এআই টুলস",
          "graduation-cap",
          ["teacher"]
        ),
      ],
    },
    {
      id: "work",
      labelEn: "Work",
      labelBn: "কর্ম",
      items: [
        item(
          "my-workload",
          "/app/workload/mine",
          "My workload",
          "আমার কর্মভার",
          "bar-chart",
          ["teacher"]
        ),
        item(
          "cover-requests",
          "/app/cover-requests",
          "Cover requests",
          "কভার অনুরোধ",
          "user-check",
          ["teacher"]
        ),
        item(
          "staff-attendance",
          "/app/staff-attendance/self",
          "Staff attendance",
          "স্টাফ হাজিরা",
          "check-square",
          ["teacher"]
        ),
      ],
    },
    {
      id: "other",
      labelEn: "Other",
      labelBn: "অন্যান্য",
      items: [
        item("reports", "/app/reports", "Reports", "রিপোর্ট", "bar-chart", [
          "teacher",
        ]),
        item(
          "print-queue",
          "/app/print",
          "Print queue",
          "প্রিন্ট সারি",
          "printer",
          ["teacher"]
        ),
        item(
          "marketplace",
          "/market",
          "Marketplace",
          "মার্কেটপ্লেস",
          "store",
          ["teacher"],
          "marketplace"
        ),
        item(
          "selling",
          "/sell",
          "Selling",
          "বিক্রয়",
          "wallet",
          ["teacher"],
          "marketplace"
        ),
        item("settings", "/app/settings", "Settings", "সেটিংস", "settings", [
          "teacher",
        ]),
        item("help", "/app/help", "Help & feedback", "সহায়তা", "help-circle", [
          "teacher",
        ]),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// School workspace `/app` — owner / admin
// ---------------------------------------------------------------------------

export const schoolAdminNav: NavConfig = {
  bottom: [
    {
      id: "overview",
      href: "/app/dashboard",
      labelEn: "Overview",
      labelBn: "সারসংক্ষেপ",
      icon: "home",
      roles: ["owner", "admin"],
    },
    {
      id: "attendance",
      href: "/app/attendance",
      labelEn: "Attendance",
      labelBn: "হাজিরা",
      icon: "check-square",
      roles: ["owner", "admin"],
    },
    {
      id: "students",
      href: "/app/students",
      labelEn: "Students",
      labelBn: "শিক্ষার্থী",
      icon: "users",
      roles: ["owner", "admin"],
    },
    {
      id: "messages",
      href: "/app/messages",
      labelEn: "Messages",
      labelBn: "বার্তা",
      icon: "message-square",
      roles: ["owner", "admin"],
    },
  ],
  more: [
    {
      id: "academic",
      labelEn: "Academic",
      labelBn: "একাডেমিক",
      items: [
        item(
          "classes-sections",
          "/app/classes",
          "Classes & sections",
          "ক্লাস ও শাখা",
          "users",
          ["owner", "admin"]
        ),
        item("timetable", "/app/timetable", "Timetable", "রুটিন", "calendar", [
          "owner",
          "admin",
        ]),
        item("exams", "/app/exams", "Exams", "পরীক্ষা", "file-text", [
          "owner",
          "admin",
        ]),
        item("marks", "/app/marks", "Marks", "নম্বর", "clipboard-check", [
          "owner",
          "admin",
        ]),
        item(
          "curriculum",
          "/app/curriculum",
          "Curriculum",
          "পাঠ্যক্রম",
          "book-open",
          ["owner", "admin"]
        ),
        item(
          "assignments",
          "/app/assignments",
          "Assignments",
          "অ্যাসাইনমেন্ট",
          "clipboard-list",
          ["owner", "admin"]
        ),
        item(
          "lesson-plans",
          "/app/lesson-plans",
          "Lesson plans",
          "পাঠ পরিকল্পনা",
          "book-open",
          ["owner", "admin"]
        ),
      ],
    },
    {
      id: "people",
      labelEn: "People",
      labelBn: "কর্মী",
      items: [
        item("staff", "/app/staff", "Staff", "স্টাফ", "users", [
          "owner",
          "admin",
        ]),
        item(
          "staff-attendance",
          "/app/staff-attendance",
          "Staff attendance",
          "স্টাফ হাজিরা",
          "check-square",
          ["owner", "admin"]
        ),
        item(
          "team-access",
          "/app/team",
          "Team & access",
          "দল ও প্রবেশাধিকার",
          "shield",
          ["owner", "admin"]
        ),
        item(
          "hiring",
          "/app/hiring",
          "Hiring",
          "নিয়োগ",
          "briefcase",
          ["owner", "admin"],
          "hiring"
        ),
        item(
          "cover-teacher",
          "/app/cover-requests",
          "Cover teacher",
          "কভার শিক্ষক",
          "user-check",
          ["owner", "admin"]
        ),
        item(
          "custom-labels",
          "/app/settings/labels",
          "Custom labels",
          "কাস্টম লেবেল",
          "layout-grid",
          ["owner", "admin"]
        ),
      ],
    },
    {
      id: "output",
      labelEn: "Output",
      labelBn: "আউটপুট",
      items: [
        item("reports", "/app/reports", "Reports", "রিপোর্ট", "bar-chart", [
          "owner",
          "admin",
        ]),
        item(
          "print-queue",
          "/app/print",
          "Print queue",
          "প্রিন্ট সারি",
          "printer",
          ["owner", "admin"]
        ),
        item(
          "announcements",
          "/app/announcements",
          "Announcements",
          "ঘোষণা",
          "megaphone",
          ["owner", "admin"]
        ),
      ],
    },
    {
      id: "library",
      labelEn: "Library",
      labelBn: "লাইব্রেরি",
      items: [
        item(
          "resource-library",
          "/app/resources",
          "Resource library",
          "রিসোর্স লাইব্রেরি",
          "folder",
          ["owner", "admin"]
        ),
        item(
          "ai-usage",
          "/app/ai",
          "AI usage & credits",
          "এআই ব্যবহার",
          "graduation-cap",
          ["owner", "admin"]
        ),
      ],
    },
    {
      id: "business",
      labelEn: "Business",
      labelBn: "ব্যবসা",
      items: [
        item(
          "billing-plan",
          "/app/billing",
          "Billing & plan",
          "বিলিং ও প্ল্যান",
          "credit-card",
          ["owner", "admin"],
          undefined,
          true
        ),
        item("expenses", "/app/expenses", "Expenses", "খরচ", "banknote", [
          "owner",
          "admin",
        ]),
        item(
          "marketplace",
          "/market",
          "Marketplace",
          "মার্কেটপ্লেস",
          "store",
          ["owner", "admin"],
          "marketplace"
        ),
        item(
          "analytics",
          "/app/analytics",
          "Analytics",
          "বিশ্লেষণ",
          "trending-up",
          ["owner", "admin"]
        ),
      ],
    },
    {
      id: "admin",
      labelEn: "Admin",
      labelBn: "প্রশাসন",
      items: [
        item(
          "audit-log",
          "/app/audit",
          "Audit log",
          "অডিট লগ",
          "shield-check",
          ["owner", "admin"],
          undefined,
          true
        ),
        item(
          "school-settings",
          "/app/settings",
          "School settings",
          "স্কুল সেটিংস",
          "settings",
          ["owner", "admin"]
        ),
        item("help", "/app/help", "Help & feedback", "সহায়তা", "help-circle", [
          "owner",
          "admin",
        ]),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// School workspace `/app` — staff (office, accounts, library)
// ---------------------------------------------------------------------------

export const schoolStaffNav: NavConfig = {
  bottom: [
    {
      id: "home",
      href: "/app/dashboard",
      labelEn: "Home",
      labelBn: "হোম",
      icon: "home",
      roles: ["staff"],
    },
    {
      id: "students",
      href: "/app/students",
      labelEn: "Students",
      labelBn: "শিক্ষার্থী",
      icon: "users",
      roles: ["staff"],
    },
    {
      id: "print",
      href: "/app/print",
      labelEn: "Print",
      labelBn: "প্রিন্ট",
      icon: "printer",
      roles: ["staff"],
    },
    {
      id: "messages",
      href: "/app/messages",
      labelEn: "Messages",
      labelBn: "বার্তা",
      icon: "message-square",
      roles: ["staff"],
    },
  ],
  more: [
    {
      id: "more",
      labelEn: "More",
      labelBn: "আরও",
      items: [
        item(
          "my-attendance",
          "/app/staff-attendance/self",
          "My attendance",
          "আমার হাজিরা",
          "check-square",
          ["staff"]
        ),
        item("timetable", "/app/timetable", "Timetable", "রুটিন", "calendar", [
          "staff",
        ]),
        item(
          "resource-library",
          "/app/resources",
          "Resource library",
          "রিসোর্স লাইব্রেরি",
          "folder",
          ["staff"]
        ),
        item("expenses", "/app/expenses", "Expenses", "খরচ", "banknote", [
          "staff",
        ]),
        item("files", "/app/files", "Files", "ফাইল", "folder", ["staff"]),
        item("reports", "/app/reports", "Reports", "রিপোর্ট", "bar-chart", [
          "staff",
        ]),
        item(
          "marketplace",
          "/market",
          "Marketplace",
          "মার্কেটপ্লেস",
          "store",
          ["staff"],
          "marketplace"
        ),
        item("settings", "/app/settings", "Settings", "সেটিংস", "settings", [
          "staff",
        ]),
        item("help", "/app/help", "Help", "সহায়তা", "help-circle", ["staff"]),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Parent shell `/family` — parent
// ---------------------------------------------------------------------------

export const parentNav: NavConfig = {
  bottom: [
    {
      id: "home",
      href: "/family",
      labelEn: "Home",
      labelBn: "হোম",
      icon: "home",
      roles: ["parent"],
    },
    {
      id: "attendance",
      href: "/family/attendance",
      labelEn: "Attendance",
      labelBn: "হাজিরা",
      icon: "check-square",
      roles: ["parent"],
    },
    {
      id: "results",
      href: "/family/results",
      labelEn: "Results",
      labelBn: "ফলাফল",
      icon: "file-text",
      roles: ["parent"],
    },
    {
      id: "messages",
      href: "/family/messages",
      labelEn: "Messages",
      labelBn: "বার্তা",
      icon: "message-square",
      roles: ["parent"],
    },
  ],
  more: [
    {
      id: "more",
      labelEn: "More",
      labelBn: "আরও",
      items: [
        item(
          "timetable",
          "/family/timetable",
          "Timetable",
          "রুটিন",
          "calendar",
          ["parent"]
        ),
        item(
          "exam-schedule",
          "/family/exams",
          "Exam schedule",
          "পরীক্ষার সময়সূচী",
          "file-text",
          ["parent"]
        ),
        item(
          "assignments",
          "/family/assignments",
          "Assignments",
          "অ্যাসাইনমেন্ট",
          "clipboard-list",
          ["parent"]
        ),
        item(
          "behaviour-notes",
          "/family/behaviour-notes",
          "Behaviour notes",
          "আচরণ নোট",
          "file-text",
          ["parent"]
        ),
        item(
          "announcements",
          "/family/announcements",
          "Announcements",
          "ঘোষণা",
          "megaphone",
          ["parent"]
        ),
        item(
          "fees-receipts",
          "/family/fees",
          "Fees & receipts",
          "ফি ও রসিদ",
          "receipt",
          ["parent"],
          "fees"
        ),
        item(
          "contact-school",
          "/family/contact",
          "Contact the school",
          "স্কুলের সাথে যোগাযোগ",
          "message-square",
          ["parent"]
        ),
        item(
          "switch-child",
          "/family/switch-child",
          "Switch child",
          "সন্তান পরিবর্তন",
          "users",
          ["parent"]
        ),
        item("settings", "/family/settings", "Settings", "সেটিংস", "settings", [
          "parent",
        ]),
        item("help", "/family/help", "Help", "সহায়তা", "help-circle", [
          "parent",
        ]),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Personal workspace `/personal` — flat, no role filtering
// ---------------------------------------------------------------------------

export const personalNav: NavConfig = {
  bottom: [
    {
      id: "home",
      href: "/personal",
      labelEn: "Home",
      labelBn: "হোম",
      icon: "home",
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
      labelBn: "হাজিরা",
      icon: "check-square",
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
      id: "more",
      labelEn: "More",
      labelBn: "আরও",
      items: [
        item(
          "file-vault",
          "/personal/files",
          "File vault",
          "ফাইল ভল্ট",
          "folder"
        ),
        item(
          "cv-profile",
          "/personal/profile",
          "CV & teacher profile",
          "সিভি ও প্রোফাইল",
          "graduation-cap"
        ),
        item(
          "job-applications",
          "/personal/applications",
          "Job applications",
          "চাকরির আবেদন",
          "briefcase",
          undefined,
          "hiring"
        ),
        item(
          "document-requests",
          "/personal/documents",
          "Document requests",
          "নথি অনুরোধ",
          "file-text"
        ),
        item("schools", "/personal/schools", "Schools", "স্কুল", "building-2"),
        item(
          "selling",
          "/sell",
          "Selling",
          "বিক্রয়",
          "wallet",
          undefined,
          "marketplace"
        ),
        item(
          "marketplace",
          "/market",
          "Marketplace",
          "মার্কেটপ্লেস",
          "store",
          undefined,
          "marketplace"
        ),
        item(
          "settings",
          "/personal/settings",
          "Settings",
          "সেটিংস",
          "settings"
        ),
        item("help", "/personal/help", "Help", "সহায়তা", "help-circle"),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Seller area `/sell` — a focused sub-shell, not a workspace
// ---------------------------------------------------------------------------

export const sellerNav: NavConfig = {
  bottom: [
    {
      id: "dashboard",
      href: "/sell",
      labelEn: "Dashboard",
      labelBn: "ড্যাশবোর্ড",
      icon: "home",
    },
    {
      id: "listings",
      href: "/sell/listings",
      labelEn: "Listings",
      labelBn: "তালিকা",
      icon: "package",
    },
    {
      id: "orders",
      href: "/sell/orders",
      labelEn: "Orders",
      labelBn: "অর্ডার",
      icon: "receipt",
    },
    {
      id: "earnings",
      href: "/sell/earnings",
      labelEn: "Earnings",
      labelBn: "আয়",
      icon: "hand-coins",
    },
  ],
  more: [
    {
      id: "more",
      labelEn: "More",
      labelBn: "আরও",
      items: [
        item(
          "kyc",
          "/sell/kyc",
          "Verification & KYC",
          "যাচাইকরণ ও কেওয়াইসি",
          "shield-check"
        ),
        item(
          "payout-methods",
          "/sell/payouts",
          "Payout methods",
          "পেআউট পদ্ধতি",
          "credit-card"
        ),
        item(
          "storefront",
          "/sell/storefront",
          "Storefront",
          "স্টোরফ্রন্ট",
          "store"
        ),
        item(
          "statements",
          "/sell/statements",
          "Monthly statements",
          "মাসিক বিবরণী",
          "file-text"
        ),
        item(
          "browse-marketplace",
          "/market",
          "Browse marketplace",
          "মার্কেটপ্লেস দেখুন",
          "store"
        ),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Platform console `/platform`
// ---------------------------------------------------------------------------

export const platformNav: NavConfig = {
  bottom: [
    {
      id: "queue",
      href: "/platform/queue",
      labelEn: "Queue",
      labelBn: "সারি",
      icon: "clipboard-list",
      roles: ["platform_staff"],
    },
    {
      id: "sellers",
      href: "/platform/sellers",
      labelEn: "Sellers",
      labelBn: "বিক্রেতা",
      icon: "store",
      roles: ["platform_staff"],
    },
    {
      id: "payouts",
      href: "/platform/payouts",
      labelEn: "Payouts",
      labelBn: "পেআউট",
      icon: "hand-coins",
      roles: ["platform_staff"],
    },
    {
      id: "workspaces",
      href: "/platform/workspaces",
      labelEn: "Workspaces",
      labelBn: "কর্মক্ষেত্র",
      icon: "building-2",
      roles: ["platform_staff"],
    },
  ],
  more: [
    {
      id: "more",
      labelEn: "More",
      labelBn: "আরও",
      items: [
        item(
          "refunds",
          "/platform/refunds",
          "Refunds",
          "ফেরত",
          "arrow-left-right",
          ["platform_staff"]
        ),
        item(
          "plans-pricing",
          "/platform/plans",
          "Plans & pricing",
          "প্ল্যান ও মূল্য",
          "credit-card",
          ["platform_staff"]
        ),
        item(
          "platform-settings",
          "/platform/settings",
          "Platform settings",
          "প্ল্যাটফর্ম সেটিংস",
          "settings",
          ["platform_staff"]
        ),
        item("audit", "/platform/audit", "Audit", "অডিট", "shield-check", [
          "platform_staff",
        ]),
        item(
          "exit",
          "/app/dashboard",
          "Exit to my workspace",
          "আমার কর্মক্ষেত্রে ফিরুন",
          "arrow-left-right",
          ["platform_staff"]
        ),
      ],
    },
  ],
}

/** Small builder so the tables above read close to the §3.2 source tables. */
function item(
  id: string,
  href: string,
  labelEn: string,
  labelBn: string,
  icon: IconName,
  roles?: Role[],
  module?: ModuleKey,
  ownerOnly?: boolean
): NavItem {
  return { id, href, labelEn, labelBn, icon, roles, module, ownerOnly }
}
