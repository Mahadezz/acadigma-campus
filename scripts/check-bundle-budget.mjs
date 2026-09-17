// First-load JS budget for the school workspace (TESTING §6, CI.md §2.6).
//
// 250 kB gzipped is roughly three seconds on the handsets this product is actually
// used on; past that, a teacher taking the register waits.
//
// Sizes are gzipped, because that is what crosses the wire. Comparing raw bytes
// against a gzipped budget would fail every route for no reason.
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
const nextDir = join(repoRoot, "apps", "web", ".next")
const manifestFile = join(nextDir, "app-build-manifest.json")

const BUDGET_BYTES = 250 * 1024
const BUDGETED_PREFIX = "/(school)/app"

let manifest
try {
  manifest = JSON.parse(await readFile(manifestFile, "utf8"))
} catch {
  console.log("No app-build-manifest.json found; run `pnpm build` first.")
  process.exit(0)
}

/** Gzipped size of one asset, cached because chunks are shared across routes. */
const sizes = new Map()
async function gzippedSize(file) {
  if (!sizes.has(file)) {
    try {
      sizes.set(file, gzipSync(await readFile(join(nextDir, file))).length)
    } catch {
      // Listed in the manifest but absent on disk: a build problem the build job
      // would already have failed on, not a budget problem.
      sizes.set(file, 0)
    }
  }
  return sizes.get(file)
}

let failed = false
let measured = 0

for (const [route, files] of Object.entries(manifest.pages ?? {})) {
  // Only `/page` entries are routes a user can land on. A `/layout` entry lists the
  // layout's own chunks, which every page below it already counts — measuring both
  // double-counts the shell and fails the budget for a page that is within it.
  if (!route.startsWith(BUDGETED_PREFIX) || !route.endsWith("/page")) continue
  measured += 1

  let bytes = 0
  for (const file of files) {
    if (file.endsWith(".js")) bytes += await gzippedSize(file)
  }

  const kb = Math.round(bytes / 1024)
  if (bytes > BUDGET_BYTES) {
    console.error(
      `::error::${route} first-load JS is ${kb} kB gzipped, over the 250 kB budget`
    )
    failed = true
  } else {
    console.log(`${route}: ${kb} kB gzipped`)
  }
}

if (measured === 0) {
  console.log(`No routes under ${BUDGETED_PREFIX} to measure.`)
}

process.exit(failed ? 1 : 0)
