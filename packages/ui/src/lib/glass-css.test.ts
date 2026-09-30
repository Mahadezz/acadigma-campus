import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

// D-408: the production minifier keeps only the last of a
// `backdrop-filter` / `-webkit-backdrop-filter` pair. With the prefix last,
// Chrome and Android shipped glass with no blur. The standard one must win.
describe("tokens.css backdrop-filter order", () => {
  it("puts backdrop-filter after every -webkit-backdrop-filter", () => {
    const css = readFileSync(
      resolve(__dirname, "../../tokens/tokens.css"),
      "utf8"
    )
    // Declarations only: an @supports condition names both, in either order.
    const body = css.replace(/@supports[^{]*{/g, "")
    const decls = [...body.matchAll(/(-webkit-)?backdrop-filter\s*:/g)].map(
      (m) => (m[1] ? "webkit" : "std")
    )
    expect(decls.length).toBeGreaterThan(0)
    decls.forEach((d, i) => {
      if (d === "webkit") expect(decls[i + 1]).toBe("std")
    })
  })
})
