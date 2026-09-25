import { describe, expect, it } from "vitest"

import bn from "../messages/bn.json"
import en from "../messages/en.json"

/**
 * F-ID-02 §3/§10 "missing-key lint": `en.json` is the schema, `bn.json` must
 * carry exactly the same dotted key paths. A key present in one and not the
 * other either ships an untranslated English string to a বাংলা session or is
 * dead copy nobody reads. `docs/engineering/I18N.md` §3 describes this as a
 * CI script (`check-i18n-keys.ts`); this Part adds it as a unit test instead
 * (BUILDER-BRIEF: "extend an existing scripts/check-*.mjs or add a unit
 * test") — it runs on every `pnpm test`, same enforcement, no new script.
 * Lives under `lib/`, not `messages/`, because the vitest "web" project only
 * collects `{app,lib,components}/**` (`vitest.config.ts`).
 */
function flatten(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key)
  )
}

describe("en.json / bn.json key parity", () => {
  it("has the exact same set of keys in both catalogues", () => {
    const enKeys = new Set(flatten(en))
    const bnKeys = new Set(flatten(bn))

    const missingInBn = [...enKeys].filter((k) => !bnKeys.has(k)).sort()
    const missingInEn = [...bnKeys].filter((k) => !enKeys.has(k)).sort()

    expect(missingInBn, "keys in en.json but missing from bn.json").toEqual([])
    expect(missingInEn, "keys in bn.json but missing from en.json").toEqual([])
  })
})
