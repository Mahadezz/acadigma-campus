import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { CreateSchoolDraft } from "@acadigma/contracts"

import en from "@/messages/en.json"

/**
 * Focus: `useFocusHeadingOnMount` must move focus to a step's `<h1>` only on
 * a genuine stage transition, never on the first render (final react review
 * of PR #34). Steps 3-4 (Part 4): the class picker and review-and-create.
 */
const saveOnboardingDraft = vi.fn()
const createSchoolWorkspace = vi.fn()

vi.mock("../../actions", () => ({
  checkEiinAvailability: vi.fn(),
  saveOnboardingDraft: (...args: unknown[]) => saveOnboardingDraft(...args),
  createSchoolWorkspace: (...args: unknown[]) => createSchoolWorkspace(...args),
}))

const { CreateSchoolWizard, reviewError } = await import("./wizard")

const t = en.onboarding.wizard

const COMPLETE_DRAFT: CreateSchoolDraft = {
  name: "Ideal School & College",
  board: "dhaka",
  medium: "bangla",
  timezone: "Asia/Dhaka",
  working_days: [6, 7, 1, 2, 3, 4],
  academic_year: {
    name: "2026",
    starts_on: "2026-01-01",
    ends_on: "2026-12-31",
  },
  grade_levels: [
    {
      name: "Class 6",
      name_bn: "ষষ্ঠ শ্রেণি",
      level_number: 6,
      stage: "secondary",
    },
  ],
  idempotency_key: "0b6f4a8e-3c1d-4e2a-9f7b-5d8c6e4a2b10",
}

function renderWizard(
  initialStage: 1 | 2 | 3 | 4,
  initialDraft: CreateSchoolDraft = {}
) {
  return render(
    <CreateSchoolWizard
      t={t}
      initialStage={initialStage}
      initialDraft={initialDraft}
      backLabel="Back"
      locale="en"
      trialDays={30}
    />
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe("CreateSchoolWizard focus management", () => {
  it("does not steal focus to the step heading on the very first render", () => {
    renderWizard(2)
    const heading = screen.getByRole("heading", { name: t.step2Title })
    expect(document.activeElement).not.toBe(heading)
  })

  it("focuses the new step's heading after a genuine stage transition", async () => {
    renderWizard(2)
    await act(async () => {
      screen.getByRole("button", { name: "Back" }).click()
    })
    const step1Heading = screen.getByRole("heading", { name: t.step1Title })
    expect(document.activeElement).toBe(step1Heading)
  })
})

describe("step 2 — working days survive a reload", () => {
  it("saves a day toggle without Continue, and a reload restores it", async () => {
    saveOnboardingDraft.mockResolvedValue({ ok: true, data: { savedAt: "x" } })
    const { unmount } = renderWizard(2, COMPLETE_DRAFT)

    await act(async () => {
      screen.getByRole("button", { name: "Sunday" }).click()
    })
    await waitFor(() => expect(saveOnboardingDraft).toHaveBeenCalled())

    const saved = saveOnboardingDraft.mock.calls.at(-1)?.[0] as {
      step: number
      draft: CreateSchoolDraft
    }
    expect(saved.step).toBe(2)
    expect([...(saved.draft.working_days ?? [])].sort()).toEqual([
      1, 2, 3, 4, 6,
    ])

    // "Reload": the page renders again from the saved draft.
    unmount()
    renderWizard(2, saved.draft)
    expect(
      screen
        .getByRole("button", { name: "Sunday" })
        .getAttribute("aria-pressed")
    ).toBe("false")
    expect(
      screen
        .getByRole("button", { name: "Saturday" })
        .getAttribute("aria-pressed")
    ).toBe("true")
  })

  it("does not write on first render", async () => {
    renderWizard(2, COMPLETE_DRAFT)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(saveOnboardingDraft).not.toHaveBeenCalled()
  })
})

describe("step 3 — classes", () => {
  it("a range shortcut selects the whole range and the count follows", async () => {
    renderWizard(3)
    expect(screen.getByText("0 classes selected")).toBeTruthy()

    await act(async () => {
      screen.getByRole("button", { name: t.presetSecondary }).click()
    })

    expect(screen.getByText("5 classes selected")).toBeTruthy()
    expect(
      screen
        .getByRole("button", { name: "Class 8" })
        .getAttribute("aria-pressed")
    ).toBe("true")
  })

  it("blocks Continue with a reason when nothing is picked", async () => {
    renderWizard(3)
    await act(async () => {
      screen.getByRole("button", { name: t.continueButton }).click()
    })
    expect(screen.getByText(t.classesRequired)).toBeTruthy()
    expect(saveOnboardingDraft).not.toHaveBeenCalled()
  })

  it("adds a custom level and saves an ordered payload on Continue", async () => {
    saveOnboardingDraft.mockResolvedValue({ ok: true, data: { savedAt: "x" } })
    renderWizard(3)

    await act(async () => {
      screen.getByRole("button", { name: "Class 10" }).click()
    })
    await act(async () => {
      screen.getByRole("button", { name: "Class 9" }).click()
    })
    fireEvent.change(screen.getByLabelText(t.customLabel), {
      target: { value: "Hifz" },
    })
    await act(async () => {
      screen.getByRole("button", { name: t.customAdd }).click()
    })
    expect(screen.getByRole("button", { name: "Remove Hifz" })).toBeTruthy()

    await act(async () => {
      screen.getByRole("button", { name: t.continueButton }).click()
    })

    const saved = saveOnboardingDraft.mock.calls[0]?.[0] as {
      step: number
      draft: CreateSchoolDraft
    }
    expect(saved.step).toBe(4)
    expect(saved.draft.grade_levels?.map((l) => l.name)).toEqual([
      "Class 9",
      "Class 10",
      "Hifz",
    ])
    expect(screen.getByRole("heading", { name: t.step4Title })).toBeTruthy()
  })

  it("resumes with the saved selection", () => {
    renderWizard(3, COMPLETE_DRAFT)
    expect(
      screen
        .getByRole("button", { name: "Class 6" })
        .getAttribute("aria-pressed")
    ).toBe("true")
    expect(screen.getByText("1 class selected")).toBeTruthy()
  })
})

describe("step 4 — review and create", () => {
  it("summarises the draft and states the trial from the catalogue", () => {
    renderWizard(4, COMPLETE_DRAFT)
    expect(screen.getByText("Ideal School & College")).toBeTruthy()
    expect(screen.getByText(t.reviewEiinNone)).toBeTruthy()
    expect(
      screen.getByText("Saturday, Sunday, Monday, Tuesday, Wednesday, Thursday")
    ).toBeTruthy()
    expect(screen.getByText(t.trialLine.replace("{days}", "30"))).toBeTruthy()
  })

  it("Edit jumps back to that step", async () => {
    renderWizard(4, COMPLETE_DRAFT)
    await act(async () => {
      screen.getByRole("button", { name: `Edit ${t.reviewClasses}` }).click()
    })
    expect(screen.getByRole("heading", { name: t.step3Title })).toBeTruthy()
  })

  it("creates the school with the draft (including its idempotency key) and navigates", async () => {
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign })
    createSchoolWorkspace.mockResolvedValue({
      ok: true,
      data: { workspaceId: "w", landingRoute: "/app" },
    })
    renderWizard(4, COMPLETE_DRAFT)

    await act(async () => {
      screen.getByRole("button", { name: t.createButton }).click()
    })

    expect(createSchoolWorkspace).toHaveBeenCalledWith(COMPLETE_DRAFT)
    expect(assign).toHaveBeenCalledWith("/app")
    vi.unstubAllGlobals()
  })

  it("names an EIIN collision, moves focus to it, and offers to edit step 1", async () => {
    createSchoolWorkspace.mockResolvedValue({
      ok: false,
      error: {
        code: "conflict",
        message: "x",
        fieldErrors: { eiin: ["EIIN_TAKEN"] },
      },
    })
    renderWizard(4, { ...COMPLETE_DRAFT, eiin: "108263" })

    await act(async () => {
      screen.getByRole("button", { name: t.createButton }).click()
    })

    const alert = screen.getByText(t.eiinTaken)
    expect(document.activeElement?.contains(alert)).toBe(true)
    // The alert's own button (first); the card's Edit is second.
    const [editIdentity] = screen.getAllByRole("button", {
      name: t.reviewEditLabel.replace("{section}", t.reviewIdentity),
    })
    await act(async () => {
      editIdentity?.click()
    })
    expect(screen.getByRole("heading", { name: t.step1Title })).toBeTruthy()
  })

  it("refuses an incomplete draft without calling the server", async () => {
    renderWizard(4, { name: "Half done" })
    await act(async () => {
      screen.getByRole("button", { name: t.createButton }).click()
    })
    expect(screen.getByText(t.createIncomplete)).toBeTruthy()
    expect(createSchoolWorkspace).not.toHaveBeenCalled()
  })
})

describe("reviewError — every create error has its own copy and a way forward", () => {
  it.each([
    [
      { code: "conflict", fieldErrors: { eiin: ["EIIN_TAKEN"] } },
      t.eiinTaken,
      1,
    ],
    [{ code: "rate_limited" }, t.createRateLimited, undefined],
    [{ code: "forbidden" }, t.createLimitReached, undefined],
    [{ code: "conflict" }, t.createAlreadyUsed, undefined],
    [
      {
        code: "validation_failed",
        fieldErrors: { timezone: ["INVALID_TIMEZONE"] },
      },
      t.createInvalid,
      2,
    ],
    [{ code: "validation_failed" }, t.createInvalid, 1],
    [{ code: "dependency_unavailable" }, t.createError, undefined],
  ])("%o", (error, message, editStage) => {
    expect(reviewError(t, error)).toEqual(
      editStage === undefined ? { message } : { message, editStage }
    )
  })
})
