import { redirect } from "next/navigation"

import { GraduationCapIcon, KeyRoundIcon } from "lucide-react"

import {
  resolveOnboardingAccess,
  resolveOnboardingChooserView,
} from "@acadigma/domain/onboarding"
import { resolveLandingRoute } from "@acadigma/domain/workspace"
import { ChoiceCard } from "@acadigma/ui/primitives/choice-card"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { OnboardingShell } from "@acadigma/ui/primitives/onboarding-shell"

import { getMessages } from "@/lib/i18n"
import { createClient } from "@/lib/supabase/server"

import { getOnboardingState } from "../actions"

import { StartOverLink } from "./start-over-link"
import { TutoringExitLink } from "./tutoring-exit-link"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Let's get you set up",
}

/**
 * F-ID-05 Part 2 §4.2 "The onboarding chooser" + §6's UI table.
 *
 * The access gate (`resolveOnboardingAccess`) is the redirect matrix §8
 * Part 2's tests name: signed out -> /login, signed in unverified ->
 * /verify, everyone else (0 memberships or already has some — §2's table
 * allows both) renders the chooser below.
 */
export default async function OnboardingChooserPage() {
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
    // §6 wireframe: "Full-width InlineAlert if the membership query fails,
    // with retry" — a full page reload is the retry here; there is no other
    // state on this server component to re-run client-side.
    return (
      <OnboardingShell title={t.onboarding.chooser.title}>
        <InlineAlert tone="error">{t.onboarding.chooser.loadError}</InlineAlert>
      </OnboardingShell>
    )
  }

  const state = stateResult.data
  // school only — every account also has a personal-workspace membership
  // from registration, which must not count as "already has a workspace"
  // here (Opus review, PR #24: AC3/§4.6).
  const activeMembership = state.memberships.find(
    (membership) =>
      membership.status === "active" && membership.type === "school"
  )

  const view = resolveOnboardingChooserView({
    path: state.path,
    draft: state.draft,
    completedAt: state.completedAt,
    hasActiveSchoolMembership: Boolean(activeMembership),
    activeWorkspaceName: activeMembership?.name ?? null,
  })

  const backHref =
    view.showBackLink && activeMembership
      ? resolveLandingRoute({
          workspaceType: activeMembership.type,
          role: activeMembership.role,
        })
      : undefined

  const backLabel = view.activeWorkspaceName
    ? t.onboarding.chooser.backToWorkspace.replace(
        "{workspace}",
        view.activeWorkspaceName
      )
    : undefined

  return (
    <OnboardingShell
      title={t.onboarding.chooser.title}
      backHref={backHref}
      backLabel={backLabel}
    >
      <div className="space-y-4">
        {view.mode === "resume" ? (
          <>
            <ChoiceCard
              icon={
                view.path === "create_school" ? (
                  <GraduationCapIcon aria-hidden="true" />
                ) : (
                  <KeyRoundIcon aria-hidden="true" />
                )
              }
              title={
                view.draftName
                  ? t.onboarding.chooser.resumeTitle.replace(
                      "{name}",
                      view.draftName
                    )
                  : t.onboarding.chooser.resumeFallbackTitle
              }
              description={t.onboarding.chooser.resumeDescription}
              // Parts 3-5 ship the wizard/join routes this links to; until
              // then it is disabled rather than a link that 404s.
              disabled
              badge={t.onboarding.chooser.comingSoon}
            />
            <StartOverLink label={t.onboarding.chooser.startOver} />
          </>
        ) : (
          <>
            <ChoiceCard
              icon={<GraduationCapIcon aria-hidden="true" />}
              title={t.onboarding.chooser.createSchoolTitle}
              description={t.onboarding.chooser.createSchoolDescription}
              disabled
              badge={t.onboarding.chooser.comingSoon}
            />
            <ChoiceCard
              icon={<KeyRoundIcon aria-hidden="true" />}
              title={t.onboarding.chooser.joinSchoolTitle}
              description={t.onboarding.chooser.joinSchoolDescription}
              disabled
              badge={t.onboarding.chooser.comingSoon}
            />
          </>
        )}

        {view.showTutoringExit ? (
          <div className="pt-2 text-center sm:text-left">
            <TutoringExitLink
              label={t.onboarding.chooser.tutoringLink}
              errorLabel={t.onboarding.chooser.tutoringExitError}
            />
          </div>
        ) : null}
      </div>
    </OnboardingShell>
  )
}
