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

/** §5: password minimum length 10, maximum 72 bytes (bcrypt) — the byte cap is
 * enforced by `checkPassword` in `packages/domain`, which needs the raw string;
 * Zod only gates the character-count floor and a sane upper bound here. */
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
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

export const registerWithPasswordInputSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  termsAccepted: z.literal(true, {
    errorMap: () => ({
      message: "You must accept the Terms and Privacy Policy.",
    }),
  }),
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
