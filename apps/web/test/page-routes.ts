import { readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const APP_DIR = fileURLToPath(new URL("../app", import.meta.url))

/** Every URL path that has a page.tsx, with (route-group) segments removed
 * and `[param]` segments kept. For tests that check routes against app/. */
function pageRoutes(dir: string, segments: string[] = []): string[] {
  const routes: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isGroup = /^\(.*\)$/.test(entry.name)
      routes.push(
        ...pageRoutes(
          path.join(dir, entry.name),
          isGroup ? segments : [...segments, entry.name]
        )
      )
    } else if (entry.name === "page.tsx") {
      routes.push("/" + segments.join("/"))
    }
  }
  return routes
}

export const PAGE_ROUTES: readonly string[] = pageRoutes(APP_DIR)
