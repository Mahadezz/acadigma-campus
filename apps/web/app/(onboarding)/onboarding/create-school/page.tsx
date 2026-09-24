import { randomUUID } from "node:crypto"

import { redirect } from "next/navigation"

import { listPublicPlans } from "@acadigma/db"
import { resolveOnboardingAccess } from "@acadigma/domain/onboarding"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { OnboardingShell } from "@acadigma/ui/primitives/onboarding-shell"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { getOnboardingState } from "../../actions"

import { CreateSchoolWizard, type Stage } from "./wizard"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Create your school",
}

/**
 * F-ID-05 §4.3 "Create a school — the wizard" (Parts 3-4). Same access gate
 * as the chooser (`resolveOnboardingAccess`).
 *
 * Resume: `onboarding_progress.step` is the step to reopen on (each advance
 * saves the NEXT step). A draft that is finished (`completedAt`) or belongs
 * to the join path starts fresh at step 1. The idempotency key (§5) is
 * minted here the first time the wizard opens and rides in the draft from
 * then on, so a retried or double-submitted "Create school" can only ever
 * produce one school.
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

  const { locale, t } = await getMessages()
  const stateResult = await getOnboardingState()

  if (!stateResult.ok) {
    return (
      <OnboardingShell title={t.onboarding.wizard.step1Title}>
        <InlineAlert tone="error">{t.onboarding.chooser.loadError}</InlineAlert>
      </OnboardingShell>
    )
  }

  const state = stateResult.data
  const fresh = state.completedAt !== null || state.path !== "create_school"
  const draft = fresh ? {} : state.draft
  const initialStage: Stage = fresh
    ? 1
    : (Math.min(Math.max(state.step, 1), 4) as Stage)

  // The review step's trial line reads the catalogue, never a hardcoded
  // number (PRODUCT-DECISIONS §5.2 moved it from 14 to 30 days once already).
  const plans = await listPublicPlans(supabase)
  const trialDays = plans.ok
    ? (plans.data.find((plan) => plan.code === "pro")?.trialDays ?? 0)
    : 0

  return (
    <CreateSchoolWizard
      t={t.onboarding.wizard}
      initialStage={initialStage}
      initialDraft={{
        ...draft,
        idempotency_key: draft.idempotency_key ?? randomUUID(),
      }}
      backLabel={t.common.actions.back}
      locale={locale}
      trialDays={trialDays}
    />
  )
}
