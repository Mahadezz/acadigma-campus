import { redirect } from "next/navigation"

import { resolveOnboardingAccess } from "@acadigma/domain/onboarding"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { OnboardingShell } from "@acadigma/ui/primitives/onboarding-shell"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { getOnboardingState } from "../../actions"

import { CreateSchoolWizard } from "./wizard"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create your school",
}

/**
 * F-ID-05 Part 3 §4.3 "Create a school — the wizard", steps 1-2 only
 * (§8 Part 3). Same access gate as the chooser (`resolveOnboardingAccess`,
 * `/onboarding/page.tsx`) — this route is reachable from the same account
 * states.
 *
 * `getOnboardingState()` supplies the resume shape: a caller reopening this
 * route after closing the tab mid-step-2 gets `step` back at 3 (Part 3
 * saves the NEXT step number on advance, matching `onboarding_progress`'s
 * documented shape) with `draft` already containing everything they typed.
 * Clamped to what this Part actually built: step 1 or 2, or the "more on
 * the way" stopping screen once step 2 is already done (steps 3-5 are
 * Part 4).
 */
export default async function CreateSchoolWizardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = resolveOnboardingAccess({
    isSignedIn: Boolean(user),
    isEmailVerified: Boolean(user?.email_confirmed_at),
  })
  if (!access.allow) redirect(access.redirectTo)

  const { t } = await getMessages()
  const stateResult = await getOnboardingState()

  if (!stateResult.ok) {
    return (
      <OnboardingShell title={t.onboarding.wizard.step1Title}>
        <InlineAlert tone="error">{t.onboarding.chooser.loadError}</InlineAlert>
      </OnboardingShell>
    )
  }

  const state = stateResult.data
  const initialStage = state.step >= 3 ? "done" : state.step === 2 ? 2 : 1

  return (
    <CreateSchoolWizard
      t={t.onboarding.wizard}
      initialStage={initialStage}
      initialDraft={state.draft}
    />
  )
}
