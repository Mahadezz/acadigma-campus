/**
 * F-ID-01 Part 3: "resolveLandingRoute() stub returning /onboarding until
 * F-ID-03 lands." A single call site (in `app/(auth)/actions.ts`) means F-ID-03
 * replaces one function.
 *
 * Lives outside `actions.ts` on purpose: a `"use server"` file may only export
 * async functions (Next.js treats every export as a Server Action), and this is
 * a plain synchronous helper.
 */
export function resolveLandingRoute(): string {
  return "/onboarding"
}
