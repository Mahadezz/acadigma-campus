import { catalogEntry } from "./catalog"

/**
 * Turns a raw audit action into the plain-language sentence the viewer renders
 * (F-ID-09 §4.1: "sentences, not raw action strings"). Pure and synchronous — the
 * repository resolves ids to display names first, and hands this function only
 * strings.
 */
export type SentencePlaceholders = Readonly<{
  actor?: string | null
  subject?: string | null
  workspace?: string | null
  fields?: string | null
  before?: string | null
  after?: string | null
  n?: string | number | null
  module?: string | null
  name?: string | null
  date?: string | null
  key?: string | null
  reason?: string | null
  id?: string | null
  table?: string | null
  role?: string | null
  student?: string | null
  /** Matches the `{masked_recipient}` template token literally. */
  masked_recipient?: string | null
}>

export type SupportedLanguage = "en" | "bn"

const FALLBACK_ACTOR: Record<SupportedLanguage, string> = {
  en: "Someone",
  bn: "কেউ একজন",
}

/** An action the catalogue does not know yet: readable, never the raw code (D-402). */
const UNKNOWN_ACTION_SENTENCE: Record<SupportedLanguage, string> = {
  en: "{actor} made a change",
  bn: "{actor} একটি পরিবর্তন করেছেন",
}

/**
 * Stand-ins for the nouns a sentence cannot do without when the caller has no
 * value for them ("{actor} removed {subject} from {workspace}").
 */
const MISSING_NOUN: Record<SupportedLanguage, Record<string, string>> = {
  en: { subject: "a member", workspace: "the school" },
  bn: { subject: "একজন সদস্য", workspace: "স্কুল" },
}

/**
 * Renders the catalogue's sentence template for `action` in `language`,
 * substituting every `{token}` the caller supplied. A token with no value
 * never shows as `{braces}`, an empty "()" or a double space (D-402): a
 * missing subject or workspace gets a plain stand-in, a parenthetical whose
 * value is missing is dropped, and anything else is left out.
 */
export function renderAuditSentence(
  action: string,
  language: SupportedLanguage,
  placeholders: SentencePlaceholders = {}
): string {
  const entry = catalogEntry(action)
  const template = entry
    ? language === "bn"
      ? entry.sentenceBn
      : entry.sentenceEn
    : UNKNOWN_ACTION_SENTENCE[language]

  const values: Record<string, string> = {
    actor: FALLBACK_ACTOR[language],
    ...MISSING_NOUN[language],
    ...Object.fromEntries(
      Object.entries(placeholders)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    ),
  }

  return template
    .replace(/\s*\(\{(\w+)\}\)/g, (match, token: string) =>
      values[token] ? match : ""
    )
    .replace(/\{(\w+)\}/g, (_match, token: string) => values[token] ?? "")
    .replace(/\s{2,}/g, " ")
    .trim()
}
