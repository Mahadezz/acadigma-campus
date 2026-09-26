import { z } from "zod"

import { emailSchema } from "../common"

/**
 * F-ID-01 §7 "Server contracts" — the schemas for Parts 1-4 (register + email
 * verification, sign in/out, forgot/reset password). Field names are camelCase
 * per HANDBOOK §8 ("Zod at the boundaries") and the existing `loginSchema`
 * precedent in `apps/web/app/(auth)/login/schema.ts`; the spec's table writes
 * them snake_case because it is describing the shape, not the literal casing.
 *
 * Parts 5-7 (phone OTP, magic link, sessions/devices, account deletion) are out
 * of scope for this file and are added when those Parts are built.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/**
 * Shape only — a non-empty string of sane size.
 *
 * `checkPassword` in `@acadigma/domain/auth` is the single source of the password
 * policy (minimum 12 per SECURITY.md §5.7.5, the 72-byte bcrypt cap, the
 * common-password list, identity similarity, the strength score), and every
 * action that accepts this field runs it: `registerWithPassword`,
 * `resetPassword` and `changePassword`.
 *
 * The floor is deliberately NOT duplicated here. When it was, Zod's generic
 * "at least 12 characters" pre-empted the specific rule the user needs: AC3
 * requires `password123` to be rejected as *too common*, and it is 11 characters
 * long. Two copies of a policy number is also two things to forget to change.
 */
export const passwordSchema = z
  .string()
  .min(1, "Enter a password.")
  .max(128, "Password is too long.")

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter a full name.")
  .max(80, "Full name is too long.")

/** Only same-origin, root-relative paths ever reach here; `safeReturnTo` re-checks
 * server-side regardless (AC16), so this is a shape check, not the security boundary. */
export const returnToSchema = z.string().max(2048).optional()

// ---------------------------------------------------------------------------
// Part 2 — register + email verification
// ---------------------------------------------------------------------------

/**
 * Where a new account lands after confirming its email. Only the guardian
 * invitation page is allowed (D-108); anything else is refused, and the
 * default is /onboarding.
 */
export const afterVerifySchema = z.literal("/invite").optional()

export const registerWithPasswordInputSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  termsAccepted: z.literal(true, {
    errorMap: () => ({
      message: "You must accept the Terms and Privacy Policy.",
    }),
  }),
  next: afterVerifySchema,
})
export type RegisterWithPasswordInput = z.infer<
  typeof registerWithPasswordInputSchema
>

export const registerWithPasswordOutputSchema = z.object({
  userId: z.string().uuid(),
  needsEmailVerification: z.literal(true),
})
export type RegisterWithPasswordOutput = z.infer<
  typeof registerWithPasswordOutputSchema
>

export const resendVerificationInputSchema = z.object({
  email: emailSchema,
  next: afterVerifySchema,
})
export type ResendVerificationInput = z.infer<
  typeof resendVerificationInputSchema
>

/** query `{token_hash, type, next}` — §7's `GET /api/auth/callback`. */
export const authCallbackQuerySchema = z.object({
  tokenHash: z.string().min(1),
  type: z.enum(["email", "recovery"]),
  next: returnToSchema,
})
export type AuthCallbackQuery = z.infer<typeof authCallbackQuerySchema>

// ---------------------------------------------------------------------------
// Part 3 — sign in (password) + sign out
// ---------------------------------------------------------------------------

export const signInWithPasswordInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
  // No `.default()`: zodResolver infers a form's TFieldValues from the schema's
  // *input* type, and a defaulted field's input/output types diverge just enough
  // to break that inference in react-hook-form. Callers that omit the flag
  // (server-to-server tests, mainly) get the "remember me" behaviour by supplying
  // `true` themselves; every UI form sets it via `defaultValues`.
  remember: z.boolean(),
  next: returnToSchema,
})
export type SignInWithPasswordInput = z.infer<
  typeof signInWithPasswordInputSchema
>

export const signInWithPasswordOutputSchema = z.object({
  landingRoute: z.string(),
})
export type SignInWithPasswordOutput = z.infer<
  typeof signInWithPasswordOutputSchema
>

// ---------------------------------------------------------------------------
// Part 4 — forgot / reset / change password
// ---------------------------------------------------------------------------

export const passwordResetRequestInputSchema = z.object({
  email: emailSchema,
})
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestInputSchema
>

export const passwordResetInputSchema = z.object({
  tokenHash: z.string().min(1),
  password: passwordSchema,
})
export type PasswordResetInput = z.infer<typeof passwordResetInputSchema>

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  password: passwordSchema,
  // See the `remember` field above for why this is not `.default(true)`.
  signOutOthers: z.boolean(),
})
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>

export const changePasswordOutputSchema = z.object({
  ok: z.literal(true),
  revokedSessions: z.number().int().min(0),
})
export type ChangePasswordOutput = z.infer<typeof changePasswordOutputSchema>
