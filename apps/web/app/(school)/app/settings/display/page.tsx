import { getMessages } from "@/lib/i18n"
import { getUiPreferences } from "@/lib/ui-preferences"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { DisplaySettingsForm } from "./display-settings-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Display" }

/**
 * F-ID-10 §6 `/app/settings/display` (D-403), Part 1: text size (both modes,
 * every role) and the basic-mode switch. The switch is hidden for `staff`
 * (F-ID-10 §2 note 4, D-403g) — a UI-only hide, not a new permission: the
 * server action never checks the caller's role, because `ui_mode` is a
 * layout choice, not a capability (F-ID-10 §4.3 "never grants anything").
 */
export default async function DisplaySettingsPage() {
  const ctx = await requireShell("school")
  const { t } = await getMessages()
  const prefs = await getUiPreferences()
  const s = t.basicMode.settings

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <SubPageHeader
        backLabel={t.settings.back}
        title={s.title}
        description={s.description}
      />
      <DisplaySettingsForm
        textSize={prefs.textSize}
        uiMode={prefs.uiMode}
        showBasicModeSwitch={ctx.role !== "staff"}
        t={s}
      />
    </div>
  )
}
