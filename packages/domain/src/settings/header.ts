/**
 * F-OP-07 §3.5: branding header lines support `{token}` interpolation from
 * `school_profiles` columns; an unknown token renders as empty and is flagged.
 * Pure, so the settings preview and (later) the F-OP-03 PDF renderer produce
 * the same text from the same template.
 */

export const HEADER_TOKENS = [
  "legal_name",
  "eiin",
  "board",
  "motto",
  "address_line1",
  "address_line2",
  "city",
  "district",
  "postal_code",
  "contact_phone",
  "contact_email",
  "website",
] as const
export type HeaderToken = (typeof HEADER_TOKENS)[number]

export type HeaderValues = Partial<Record<HeaderToken, string | null>>

const TOKEN = /\{([a-z0-9_]+)\}/g

function isHeaderToken(name: string): name is HeaderToken {
  return (HEADER_TOKENS as readonly string[]).includes(name)
}

/** Tokens in `template` that are not in `HEADER_TOKENS`, in order, de-duplicated. */
export function unknownHeaderTokens(template: string): string[] {
  const unknown = new Set<string>()
  for (const [, name] of template.matchAll(TOKEN)) {
    if (name && !isHeaderToken(name)) unknown.add(name)
  }
  return [...unknown]
}

/** Fills known tokens from `values` (missing value -> empty); unknown tokens -> empty. */
export function renderHeaderLine(
  template: string,
  values: HeaderValues
): string {
  return template
    .replace(TOKEN, (_, name: string) =>
      isHeaderToken(name) ? (values[name] ?? "") : ""
    )
    .replace(/\s{2,}/g, " ")
    .trim()
}
