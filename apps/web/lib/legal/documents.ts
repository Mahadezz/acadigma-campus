import {
  DPA_2026_09_30,
  GUARDIAN_CONSENT_BN_2026_09_30,
  GUARDIAN_CONSENT_EN_2026_09_30,
  PRIVACY_2026_09_30,
  TERMS_2026_09_30,
} from "./texts"

/**
 * The current version of each document a person accepts (D-114). The version
 * is all the server sends to the database; the database looks up the hash of
 * the text it published under that version (`app.legal_documents`), so no
 * request can claim an acceptance of words that were never published.
 */
export const LEGAL_DOCUMENTS = {
  terms: { version: "2026-09-30-interim", text: TERMS_2026_09_30 },
  privacy: { version: "2026-09-30-interim", text: PRIVACY_2026_09_30 },
  dpa: { version: "2026-09-30-interim", text: DPA_2026_09_30 },
} as const

export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS

export function isLegalDocumentKey(key: string): key is LegalDocumentKey {
  return Object.hasOwn(LEGAL_DOCUMENTS, key)
}

/** The parent-link consent (purpose `guardian.portal_access`), in both
 * languages: the parent agrees to the words on their screen. */
export const GUARDIAN_CONSENT = {
  version: "2026-09-30",
  text: { en: GUARDIAN_CONSENT_EN_2026_09_30, bn: GUARDIAN_CONSENT_BN_2026_09_30 },
} as const
