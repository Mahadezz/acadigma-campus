import { UserIcon } from "lucide-react"

import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { getMessages } from "@/lib/i18n"
import { requireShell } from "@/lib/workspace"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Personal workspace",
}

/**
 * Placeholder home for the personal shell (F-ID-03 §8 Part 4). F-ID-06
 * replaces this with the real tutoring/attendance/diary home; this page's
 * only job is to prove the shell renders for a resolved `personal` context
 * instead of 404ing.
 *
 * `EmptyState`'s `title` renders a `<p>` (it is normally a small in-list
 * "nothing here" message, not a page heading) — this page IS the whole
 * screen, so it needs its own `<h2>` to keep "shell owns `<h1>`, pages start
 * at `<h2>`" true. `sr-only` so the visual design (icon + one bold line) is
 * unchanged; not touching `EmptyState` itself, which is used elsewhere as an
 * in-list message where a heading would be wrong (PR #30 review).
 */
export default async function PersonalHomePage() {
  const { role } = await requireShell("personal")
  const { t } = await getMessages()

  return (
    <>
      <h2 className="sr-only">{t.workspace.personal.emptyTitle}</h2>
      <EmptyState
        icon={<UserIcon />}
        title={t.workspace.personal.emptyTitle}
        description={t.workspace.personal.emptyDescription.replace(
          "{role}",
          role
        )}
      />
    </>
  )
}
