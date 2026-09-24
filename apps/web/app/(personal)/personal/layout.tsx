import { GatedShell } from "@/app/(shared)/workspace/gated-shell"
import { getMessages } from "@/lib/i18n"

/**
 * Personal workspace shell (F-ID-03 §8 Part 4 / ROADMAP M1 1.1).
 *
 * Minimal on purpose: F-ID-06 owns the personal workspace's real screens
 * (tutoring students, attendance, files, diary, CV — `personal:owner`'s
 * curated nav in `packages/domain/src/nav/config.ts` already lists them).
 * Until that Part lands, this shell exists only so `resolveLandingRoute`'s
 * `/personal` destination is real and gated, instead of 404ing for the
 * personal-only and tutoring users F-ID-05 Part 1 already creates. No bottom
 * nav/sidebar is wired here yet — deliberately, so nothing here links to a
 * route that doesn't exist (the exact bug this Part's gate closes for the
 * school shell).
 *
 * `GatedShell` (shared with `(family)`) owns the gate and the top bar.
 */
export default async function PersonalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { t } = await getMessages()

  return (
    <GatedShell shell="personal" title={t.workspace.personal.shellTitle}>
      {children}
    </GatedShell>
  )
}
