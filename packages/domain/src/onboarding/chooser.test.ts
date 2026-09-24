import { describe, expect, it } from "vitest"

import { resolveOnboardingChooserView } from "./chooser"

const FRESH = {
  path: "undecided" as const,
  draft: {},
  completedAt: null,
  hasActiveSchoolMembership: false,
  activeWorkspaceName: null,
}

describe("resolveOnboardingChooserView", () => {
  it("shows the fresh chooser for a brand-new account, with the tutoring exit visible", () => {
    expect(resolveOnboardingChooserView(FRESH)).toEqual({
      mode: "fresh",
      showBackLink: false,
      activeWorkspaceName: null,
      showTutoringExit: true,
    })
  })

  it("shows the fresh chooser when path is set but no draft content exists yet", () => {
    // Picking "Create a school" alone, before typing anything, should not
    // claim there is something to resume.
    expect(
      resolveOnboardingChooserView({
        ...FRESH,
        path: "create_school",
      })
    ).toMatchObject({ mode: "fresh" })
  })

  it("offers to resume a mid-wizard draft (§4.7)", () => {
    const view = resolveOnboardingChooserView({
      ...FRESH,
      path: "create_school",
      draft: { name: "Ideal School & College" },
    })
    expect(view).toEqual({
      mode: "resume",
      path: "create_school",
      draftName: "Ideal School & College",
      showBackLink: false,
      activeWorkspaceName: null,
      showTutoringExit: true,
    })
  })

  it("offers to resume a join-with-code draft too", () => {
    const view = resolveOnboardingChooserView({
      ...FRESH,
      path: "join_school",
      draft: { code: "ACD-4K2P-9XQ7" },
    })
    expect(view.mode).toBe("resume")
    if (view.mode === "resume") {
      expect(view.path).toBe("join_school")
      // The draft has no `name` field — draftName stays null rather than
      // guessing at some other key.
      expect(view.draftName).toBeNull()
    }
  })

  it("never offers to resume a completed onboarding, even with leftover draft content", () => {
    expect(
      resolveOnboardingChooserView({
        ...FRESH,
        path: "create_school",
        draft: { name: "Ideal School" },
        completedAt: "2026-09-25T12:00:00Z",
      })
    ).toMatchObject({ mode: "fresh" })
  })

  it("shows the back link, and hides the tutoring exit, when the user already has an active school membership (§4.6)", () => {
    expect(
      resolveOnboardingChooserView({
        ...FRESH,
        hasActiveSchoolMembership: true,
        activeWorkspaceName: "Ideal School",
      })
    ).toEqual({
      mode: "fresh",
      showBackLink: true,
      activeWorkspaceName: "Ideal School",
      showTutoringExit: false,
    })
  })

  it("still shows both cards and the tutoring exit for a user whose only membership is personal (AC3 — not 'any membership')", () => {
    // Every account has exactly one personal workspace from registration —
    // this must NOT be mistaken for "already has memberships" (Opus review,
    // PR #24): a brand-new user always has a personal workspace, and must
    // still see the fresh chooser with the tutoring exit link.
    expect(
      resolveOnboardingChooserView({
        ...FRESH,
        hasActiveSchoolMembership: false,
        activeWorkspaceName: null,
      })
    ).toMatchObject({
      mode: "fresh",
      showBackLink: false,
      showTutoringExit: true,
    })
  })

  it("hides the tutoring exit even in resume mode once a school membership exists", () => {
    const view = resolveOnboardingChooserView({
      ...FRESH,
      path: "join_school",
      draft: { code: "ACD-4K2P-9XQ7" },
      hasActiveSchoolMembership: true,
      activeWorkspaceName: "Ideal School",
    })
    expect(view).toMatchObject({ mode: "resume", showTutoringExit: false })
  })
})
