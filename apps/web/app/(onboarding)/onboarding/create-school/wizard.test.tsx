import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import en from "@/messages/en.json"

/**
 * Final react review of PR #34's a6588dc (blocking): `useFocusHeadingOnMount`
 * used to fire on EVERY mount, including the wizard's very first render —
 * so a direct/hard load of `/onboarding/create-school`, or a resumed
 * session landing straight on step 2, stole focus on hydration for no
 * reason. Focus must move to a step's `<h1>` only on a genuine stage
 * transition, never on the first render.
 *
 * `initialStage={2}` here (not 1): it lets both cases below exercise the
 * same real stage transition (`OnboardingShell`'s plain "Back" button,
 * `onBack={() => setStage(1)}`) without needing to drive step 1's real
 * form (name/board/medium) through jsdom — this suite is about focus
 * timing, not step 1's validation, which `school.test.ts` and the e2e
 * journey already cover.
 */
vi.mock("../../actions", () => ({
  checkEiinAvailability: vi.fn(),
  saveOnboardingDraft: vi.fn(),
}))

const { CreateSchoolWizard } = await import("./wizard")

const t = en.onboarding.wizard

describe("CreateSchoolWizard focus management", () => {
  it("does not steal focus to the step heading on the very first render", () => {
    render(
      <CreateSchoolWizard
        t={t}
        initialStage={2}
        initialDraft={{}}
        backLabel="Back"
      />
    )

    const heading = screen.getByRole("heading", { name: t.step2Title })
    expect(document.activeElement).not.toBe(heading)
  })

  it("focuses the new step's heading after a genuine stage transition", async () => {
    render(
      <CreateSchoolWizard
        t={t}
        initialStage={2}
        initialDraft={{}}
        backLabel="Back"
      />
    )

    await act(async () => {
      screen.getByRole("button", { name: "Back" }).click()
    })

    const step1Heading = screen.getByRole("heading", { name: t.step1Title })
    expect(document.activeElement).toBe(step1Heading)
  })
})
