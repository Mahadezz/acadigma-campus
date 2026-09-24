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

const UNKNOWN_ACTION_SENTENCE: Record<SupportedLanguage, string> = {
  en: "{actor} performed an unrecognised action ({action})",
  bn: "{actor} একটি অজানা কার্যক্রম সম্পন্ন করেছেন ({action})",
}

/**
 * Renders the catalogue's sentence template for `action` in `language`,
 * substituting every `{token}` the caller supplied. An unmatched token (the
 * placeholder was not relevant to this event) is left blank rather than showing
 * literal `{curly braces}` to a reader.
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
    action,
    ...Object.fromEntries(
      Object.entries(placeholders)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    ),
  }

  return template.replace(/\{(\w+)\}/g, (_match, token: string) =>
    token in values ? (values[token] ?? "") : ""
  )
}
