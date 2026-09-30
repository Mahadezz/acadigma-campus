/**
 * The parent-link consent (purpose `guardian.portal_access`, D-114), in
 * both languages: the parent agrees to the words on their own screen. Kept
 * apart from `texts.ts` so the accept screen's client bundle carries only
 * these few lines. Same rule as `texts.ts`: never edit a published string;
 * a change is a new version, a new `app.legal_documents` row and a new
 * constant here.
 */

/** Shown on the parent-link screen; `{school}` and `{student}` are filled in
 * for display. The hash is of this template, placeholders and all. */
export const GUARDIAN_CONSENT_EN_2026_09_30 = `I am {student}'s parent or guardian.

I agree that {school} uses Acadigma Campus to share {student}'s attendance, marks, results and school notices with me in this app.

I understand that {school} is responsible for {student}'s records, and that I can ask the school to stop sharing them with me at any time.
`

export const GUARDIAN_CONSENT_BN_2026_09_30 = `আমি {student}-এর মা-বাবা বা অভিভাবক।

আমি সম্মতি দিচ্ছি যে {school} এই অ্যাপে Acadigma Campus ব্যবহার করে {student}-এর উপস্থিতি, নম্বর, ফলাফল ও বিদ্যালয়ের নোটিশ আমার সঙ্গে শেয়ার করবে।

আমি বুঝি যে {student}-এর রেকর্ডের দায়িত্ব {school}-এর, এবং আমি যেকোনো সময় বিদ্যালয়কে আমার সঙ্গে শেয়ার করা বন্ধ করতে বলতে পারি।
`

export const GUARDIAN_CONSENT = {
  version: "2026-09-30",
  text: {
    en: GUARDIAN_CONSENT_EN_2026_09_30,
    bn: GUARDIAN_CONSENT_BN_2026_09_30,
  },
} as const
