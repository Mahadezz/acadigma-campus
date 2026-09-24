import { GatedShell } from "@/app/(shared)/workspace/gated-shell"
import { getMessages } from "@/lib/i18n"

/**
 * Parent/guardian shell (F-ID-03 §8 Part 4 / ROADMAP M1 1.1).
 *
 * Minimal on purpose: F-AC-10 owns the real parent portal (child switcher +
 * 13 guardian-scoped views — `family:parent`'s curated nav in
 * `packages/domain/src/nav/config.ts` already lists them). Until that Part
 * lands, this shell exists only so `resolveLandingRoute`'s `/family`
 * destination is real and gated for a `parent` member, instead of leaving
 * them on the school shell's `/app` (which they must never see, F-ID-03
 * §4.4 OQ-1) or 404ing. No bottom nav/sidebar is wired here yet —
 * deliberately, so nothing here links to a route that doesn't exist.
 *
 * `GatedShell` (shared with `(personal)`) owns the gate and the top bar.
 */
export default async function FamilyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { t } = await getMessages()

  return (
    <GatedShell shell="family" title={t.workspace.family.shellTitle}>
      {children}
    </GatedShell>
  )
}
