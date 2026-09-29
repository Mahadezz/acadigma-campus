import type { NavConfig } from "@acadigma/domain/nav"

/**
 * D-408: where the shell's back chevron goes when there is no in-app history
 * to step back through (a deep link, a new tab, a reload) — the page's
 * logical parent, derived from the URL itself: drop the last segment until
 * what is left is a page we can name. Nav destinations and the shell root
 * are always nameable; the few non-nav pages that have child pages are
 * named in `PARENT_PAGES`. `back-route.test.ts` checks, against the real
 * `app/` tree, that every page resolves to a parent that exists.
 */

export type BackTarget = { href: string; labelEn: string; labelBn: string }

type NavLink = { href: string; labelEn: string; labelBn: string }

/** Non-nav pages that other pages sit under. `[x]` matches one segment. */
const PARENT_PAGES: readonly NavLink[] = [
  { href: "/app/exams/[id]", labelEn: "Exam", labelBn: "পরীক্ষা" },
]

const SHELL_ROOTS = ["/app", "/family", "/personal"] as const

/** Top-level pages that are not in a nav config: basic mode's home. */
const EXTRA_TOP_LEVEL = new Set(["/app/home"])

const HOME: Pick<BackTarget, "labelEn" | "labelBn"> = {
  labelEn: "Home",
  labelBn: "হোম",
}

const pick = ({ labelEn, labelBn }: NavLink, href: string): BackTarget => ({
  href,
  labelEn,
  labelBn,
})

function navLinks(config: NavConfig | null): NavLink[] {
  if (!config) return []
  return [...config.bottom, ...config.more.flatMap((g) => g.items)]
}

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
 * null on a top-level page (a nav destination, a shell root, basic home) —
 * those get no back chevron. Otherwise the nearest nameable ancestor, or
 * the shell's home when there is none.
 */
export function backTarget(
  pathname: string,
  config: NavConfig | null
): BackTarget | null {
  const path = pathname.replace(/\/+$/, "") || "/"
  const root = SHELL_ROOTS.find((r) => path === r || path.startsWith(`${r}/`))
  if (!root) return null

  const links = navLinks(config)
  if (
    path === root ||
    EXTRA_TOP_LEVEL.has(path) ||
    links.some((l) => l.href === path)
  ) {
    return null
  }

  const segments = path.split("/")
  for (let n = segments.length - 1; n > root.split("/").length; n--) {
    const candidate = segments.slice(0, n).join("/")
    const nav = links.find((l) => l.href === candidate)
    if (nav) return pick(nav, candidate)
    const page = PARENT_PAGES.find((p) => matches(p.href, candidate))
    if (page) return pick(page, candidate)
  }

  // No nameable ancestor: the shell's home (its first tab, or its root).
  const first = config?.bottom.find((l) => l.href.startsWith(`${root}/`))
  return first ? pick(first, first.href) : { href: root, ...HOME }
}
