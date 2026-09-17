import { z } from "zod"

/**
 * One schema, checked twice: react-hook-form uses it for instant feedback, and the
 * Server Action re-parses the same shape because the client check is only a
 * courtesy (ARCHITECTURE §5).
 *
 * It lives outside `actions.ts` because a `"use server"` module may only export
 * async functions.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  /** Where to land after signing in. Validated server-side; never trusted as given. */
  next: z.string().optional(),
})

export type LoginInput = z.infer<typeof loginSchema>
