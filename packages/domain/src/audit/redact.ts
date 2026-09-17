/**
 * The TypeScript mirror of `app.tg_audit()`'s redaction rules (F-ID-09 §5.3). Used
 * by the UI's `DiffView` to decide whether a field renders `••••` with a "why is
 * this hidden" link, and by tests that assert the SQL and TypeScript deny-lists
 * agree.
 */

/**
 * Same pattern the SQL trigger tests column names against
 * (`k ~* '(token|secret|password|account_number)'`). Case-insensitive, matches
 * anywhere in the name — `provider_customer_ref` is NOT matched (correctly: it is
 * redacted per-table by name, not by this universal net); `payout_account_number`
 * IS matched.
 */
export const SECRET_COLUMN_PATTERN = /(token|secret|password|account_number)/i

export function isSecretColumnName(columnName: string): boolean {
  return SECRET_COLUMN_PATTERN.test(columnName)
}

/**
 * Free-text columns never carry their content into `before`/`after` — only the
 * field name survives in `changed_fields` (F-ID-09 §5.3 row 1). Kept as an
 * allow-list rather than a pattern: guessing "sounds like prose" from a column
 * name is exactly the kind of heuristic that misses one and leaks a diary entry.
 * Extended by each area's migration via `app.attach_audit`'s `p_freetext` argument;
 * this list documents what is configured, for the UI's "Why is this hidden?" copy.
 */
export const FREE_TEXT_COLUMNS: ReadonlySet<string> = new Set([
  "body",
  "notes",
  "note",
  "message",
  "bio",
  "description",
])

export function isFreeTextColumnName(columnName: string): boolean {
  return FREE_TEXT_COLUMNS.has(columnName)
}

export type RedactionReason =
  "secret" | "free_text" | "health" | "contact_masked"

const REASON_COPY_EN: Record<RedactionReason, string> = {
  secret:
    "This value is never recorded, even in the audit trail — it could be used to access the account.",
  free_text:
    "The content is never recorded, only that it changed — this trail is not a second copy of private writing.",
  health:
    "Health and medical details are never recorded, only that they changed.",
  contact_masked:
    "Contact details are partly hidden to limit what a trail exposes if read by the wrong person.",
}

const REASON_COPY_BN: Record<RedactionReason, string> = {
  secret:
    "এই মানটি কখনো রেকর্ড করা হয় না, এমনকি অডিট ট্রেইলেও নয় — এটি অ্যাকাউন্টে প্রবেশের জন্য ব্যবহৃত হতে পারত।",
  free_text:
    "বিষয়বস্তু কখনো রেকর্ড করা হয় না, শুধু জানানো হয় যে এটি পরিবর্তিত হয়েছে।",
  health:
    "স্বাস্থ্য ও চিকিৎসা সংক্রান্ত তথ্য কখনো রেকর্ড করা হয় না, শুধু জানানো হয় যে এটি পরিবর্তিত হয়েছে।",
  contact_masked:
    "যোগাযোগের তথ্য আংশিকভাবে লুকানো থাকে যাতে ভুল ব্যক্তির হাতে ট্রেইল পড়লেও কম প্রকাশ পায়।",
}

export function redactionCopy(
  reason: RedactionReason,
  language: "en" | "bn"
): string {
  return language === "bn" ? REASON_COPY_BN[reason] : REASON_COPY_EN[reason]
}

/** `r***@gmail.com` — F-ID-09 §5.3. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at <= 1) return "***" + email.slice(at)
  return email.slice(0, 1) + "***" + email.slice(at)
}

/**
 * `+8801*****678` — F-ID-09 §5.3. Fixed-width mask (5 stars) rather than one
 * scaled to the input length: a Bangladeshi mobile number is always 14
 * characters (`phoneSchema`), and a constant mask avoids leaking length for
 * any other format handed to this function.
 */
export function maskPhone(phone: string): string {
  if (phone.length < 9) return "*".repeat(phone.length)
  const head = phone.slice(0, 5)
  const tail = phone.slice(-3)
  return `${head}*****${tail}`
}
