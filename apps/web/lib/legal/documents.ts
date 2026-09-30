import { DPA_2026_09_30, PRIVACY_2026_09_30, TERMS_2026_09_30 } from "./texts"

/**
 * The current version of each document a person accepts (D-114). The version
 * is all the server sends to the database; the database looks up the hash of
 * the text it published under that version (`app.legal_documents`), so no
 * request can claim an acceptance of words that were never published.
 */
export const LEGAL_DOCUMENTS = {
  terms: {
    title: "Terms of Use",
    version: "2026-09-30-interim",
    text: TERMS_2026_09_30,
  },
  privacy: {
    title: "Privacy Notice",
    version: "2026-09-30-interim-2",
    text: PRIVACY_2026_09_30,
  },
  dpa: {
    title: "Data Processing Agreement",
    version: "2026-09-30-interim",
    text: DPA_2026_09_30,
  },
} as const

export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS
