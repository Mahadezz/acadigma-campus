import { HeartHandshakeIcon } from "lucide-react"

import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { getMessages } from "@/lib/i18n"
import { requireShell } from "@/lib/workspace"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Family",
}

/**
 * Placeholder home for the family shell (F-ID-03 §8 Part 4). F-AC-10
 * replaces this with the real parent portal (child switcher + 13
 * guardian-scoped views); this page's only job is to prove the shell
 * renders for a resolved `parent` member instead of 404ing or landing them
 * on the school shell.
 *
 * `EmptyState`'s `title` renders a `<p>` (it is normally a small in-list
 * "nothing here" message, not a page heading) — this page IS the whole
 * screen, so it needs its own `<h2>` to keep "shell owns `<h1>`, pages start
 * at `<h2>`" true, and so `shell-gate.spec.ts`'s
 * `getByRole("heading", ...)` finds one. `sr-only` so the visual design
 * (icon + one bold line) is unchanged; not touching `EmptyState` itself,
 * which is used elsewhere as an in-list message where a heading would be
 * wrong (PR #30 review).
 */
export default async function FamilyHomePage() {
  const { role } = await requireShell("family")
  const { t } = await getMessages()

  return (
    <>
      <h2 className="sr-only">{t.workspace.family.emptyTitle}</h2>
      <EmptyState
        icon={<HeartHandshakeIcon />}
        title={t.workspace.family.emptyTitle}
        description={t.workspace.family.emptyDescription.replace(
          "{role}",
          role
        )}
      />
    </>
  )
}
