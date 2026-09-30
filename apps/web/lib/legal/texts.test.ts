// @vitest-environment node
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { GUARDIAN_CONSENT, LEGAL_DOCUMENTS } from "./documents"

/**
 * D-114: the database records agreement to a text by the hash it published
 * in `app.legal_documents`. If a string here drifts from the hash a
 * migration published, people would be recorded as agreeing to words they
 * never saw — so this fails instead.
 */
const MIGRATIONS = fileURLToPath(
  new URL("../../../../supabase/migrations/", import.meta.url)
)

const published = new Map<string, string>()
for (const file of readdirSync(MIGRATIONS)) {
  const sql = readFileSync(MIGRATIONS + file, "utf8")
  const row =
    /\(\s*'(\w+)',\s*'([\w-]+)',\s*'(en|bn)',\s*'\\x([0-9a-f]{64})'\)/g
  for (const [, document, version, locale, hex] of sql.matchAll(row)) {
    published.set(`${document}/${version}/${locale}`, hex!)
  }
}

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex")

const current: [string, string][] = [
  ...Object.entries(LEGAL_DOCUMENTS).map(([document, d]): [string, string] => [
    `${document}/${d.version}/en`,
    d.text,
  ]),
  ...Object.entries(GUARDIAN_CONSENT.text).map(
    ([locale, text]): [string, string] => [
      `guardian_consent/${GUARDIAN_CONSENT.version}/${locale}`,
      text,
    ]
  ),
]

describe("published legal texts", () => {
  it.each(current)("%s matches the hash a migration published", (key, text) => {
    expect(published.get(key)).toBe(sha256(text))
  })

  it("the texts use LF line endings only, whatever the checkout does", () => {
    for (const [, text] of current) expect(text).not.toMatch(/\r/)
  })
})
