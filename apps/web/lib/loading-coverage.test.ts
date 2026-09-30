import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"

import { describe, expect, it } from "vitest"

const APP = join(__dirname, "..", "app")
// Data shells. Auth, onboarding, marketing, /~offline and /design fetch
// nothing worth a skeleton.
const SHELLS = ["(school)", "(family)", "(personal)", "(platform)", "(account)"]

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return pages(p)
    return n === "page.tsx" ? [p] : []
  })
}

// D-409: every data route falls under a loading.tsx (its own or an ancestor's,
// up to its shell), so a slow navigation never shows a blank screen.
describe("loading.tsx coverage", () => {
  const routes = SHELLS.flatMap((s) => pages(join(APP, s)))

  it("finds the routes", () => expect(routes.length).toBeGreaterThan(20))

  it.each(routes.map((p) => [relative(APP, p).split(sep).join("/"), p]))(
    "%s",
    (_name, page) => {
      let dir = dirname(page!)
      let found = false
      for (; dir.startsWith(APP) && dirname(dir) !== APP; dir = dirname(dir)) {
        if (existsSync(join(dir, "loading.tsx"))) found = true
      }
      expect(found).toBe(true)
    }
  )
})
