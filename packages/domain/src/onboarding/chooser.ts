/**
 * F-ID-05 §4.2 "The onboarding chooser" and §4.7 "Abandonment and resume" —
 * what the chooser screen shows, derived from `getOnboardingState`'s output.
 * Pure: the page component owns fetching that state and rendering the view
 * this function returns.
 */
export type OnboardingPath = "undecided" | "create_school" | "join_school"

export type OnboardingChooserState = {
  path: OnboardingPath
  draft: Record<string, unknown>
  completedAt: string | null
  /** True when the caller already has at least one active membership
   * (§4.2: "A user who already has memberships sees the same two cards plus
   * a 'Back to {current workspace}' link"). */
  hasActiveMembership: boolean
  /** The membership to link back to, if any — `null` when there is none or
   * when the caller has more than one and no single obvious default. */
  activeWorkspaceName: string | null
}

export type OnboardingChooserView =
  | {
      /** §4.7: "Continue setting up {draft name}" is the primary card. */
      mode: "resume"
      path: "create_school" | "join_school"
      /** The draft's `name` field, when present and a string — the wizard's
       * `name` field lands in `draft.name` once Part 3 exists; `null` until
       * then or when the field has not been filled in yet. */
      draftName: string | null
      showBackLink: boolean
      activeWorkspaceName: string | null
    }
  | {
      mode: "fresh"
      showBackLink: boolean
      activeWorkspaceName: string | null
    }

function hasDraftContent(draft: Record<string, unknown>): boolean {
  return Object.keys(draft).length > 0
}

export function resolveOnboardingChooserView(
  state: OnboardingChooserState
): OnboardingChooserView {
  const showBackLink = state.hasActiveMembership

  const isResumable =
    !state.completedAt &&
    (state.path === "create_school" || state.path === "join_school") &&
    hasDraftContent(state.draft)

  if (isResumable) {
    const draftName =
      typeof state.draft["name"] === "string"
        ? (state.draft["name"] as string)
        : null
    return {
      mode: "resume",
      // Narrowed by `isResumable` above (path is one of the two literal
      // values, never 'undecided').
      path: state.path as "create_school" | "join_school",
      draftName,
      showBackLink,
      activeWorkspaceName: state.activeWorkspaceName,
    }
  }

  return {
    mode: "fresh",
    showBackLink,
    activeWorkspaceName: state.activeWorkspaceName,
  }
}
