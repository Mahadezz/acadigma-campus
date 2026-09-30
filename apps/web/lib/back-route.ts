import type { NavConfig } from "@acadigma/domain/nav"

import { IMPLEMENTED_NAV_ROUTES } from "./implemented-routes"

/**
 * D-408: where the shell's back chevron goes when there is no in-app history
 * to step back through (a deep link, a new tab, a reload) — the page's
 * logical parent, derived from the URL itself: drop the last segment until
 * what is left is a nav destination (`IMPLEMENTED_NAV_ROUTES`), a named
 * non-nav page (`PARENT_PAGES`) or the shell root. `back-route.test.ts`
 * checks, against the real `app/` tree, that every page resolves to a
 * parent that exists.
 *
 * Deliberately free of the nav configs themselves: this runs in every
 * shell's client bundle, which sits at the 250 kB budget. A nav
 * destination's name is looked up lazily (`navLabel`, desktop only).
 */

export type BackTarget = { href: string; labelEn?: string; labelBn?: string }

/** Non-nav pages that other pages sit under. `[x]` matches one segment. */
const PARENT_PAGES = [
  { href: "/app/exams/[id]", labelEn: "Exam", labelBn: "পরীক্ষা" },
] as const

const SHELL_ROOTS = ["/app", "/family", "/personal"] as const

/** Top-level pages that are not nav destinations: basic mode's home. */
const EXTRA_TOP_LEVEL = new Set(["/app/home"])

/** `[x]` in `pattern` matches any one segment of `path`. */
export function matches(pattern: string, path: string): boolean {
  const a = pattern.split("/")
  const b = path.split("/")
  return (
    a.length === b.length &&
    a.every((seg, i) => seg === b[i] || /^\[.+\]$/.test(seg))
  )
}

/**
 * null on a top-level page — a shell root, basic home, or a nav destination
 * with no nav destination above it in the URL (so Team & access, under
 * Staff, still gets "‹ Staff"). Otherwise the nearest nameable ancestor, or
 * the shell root (which lands on the member's home) when there is none.
 */
export function backTarget(pathname: string): BackTarget | null {
  const path = pathname.replace(/\/+$/, "") || "/"
  const root = SHELL_ROOTS.find((r) => path === r || path.startsWith(`${r}/`))
  if (!root || path === root || EXTRA_TOP_LEVEL.has(path)) return null

  const segments = path.split("/")
  for (let n = segments.length - 1; n > root.split("/").length; n--) {
    const candidate = segments.slice(0, n).join("/")
    if (IMPLEMENTED_NAV_ROUTES.has(candidate)) return { href: candidate }
    const page = PARENT_PAGES.find((p) => matches(p.href, candidate))
    if (page) return { ...page, href: candidate }
  }
  if (IMPLEMENTED_NAV_ROUTES.has(path)) return null
  return { href: root, labelEn: "Home", labelBn: "হোম" }
}

/** A nav destination's name in the member's own nav config. */
export function navLabel(
  href: string,
  config: NavConfig | null
): { labelEn: string; labelBn: string } | undefined {
  return [
    ...(config?.bottom ?? []),
    ...(config?.more ?? []).flatMap((g) => g.items),
  ].find((item) => item.href === href)
}
