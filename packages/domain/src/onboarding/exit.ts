/**
 * F-ID-05 §4.5 "Landing shell resolution after onboarding" — the slice
 * `completeOnboarding` (§7) needs: where each exit reason lands.
 *
 * `created` and `joined` are placeholders here, spec-accurate but not yet
 * exercised by any UI — Part 2 only ships the `personal` exit (the tutoring
 * link). Parts 4 and 5 wire `createSchoolWorkspace` and the join flow to
 * call `completeOnboarding` with those reasons; both already land on the
 * routes §4.5's table names (`/app` with the first-run checklist, `/personal`
 * with a pending-join card), so this function does not need to change when
 * those Parts ship — only their call sites do.
 */
export type OnboardingExit = "personal" | "created" | "joined"

export function resolveOnboardingExitRoute(exit: OnboardingExit): string {
  switch (exit) {
    case "personal":
      return "/personal"
    case "created":
      return "/app"
    case "joined":
      return "/personal"
  }
}
