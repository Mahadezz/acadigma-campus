import { getMessages } from "@/lib/i18n"
import { requireShell } from "@/lib/workspace"

import { SubPageHeader } from "../sub-page-header"

import { AppearanceForm } from "./appearance-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Appearance" }

/**
 * D-408: theme (light/dark/system) and language, in one place, reachable
 * from Settings and from the avatar menu's "Theme & language" link — not
 * from the header or the home screen (see `user-menu.tsx` and
 * `essentials-row.tsx`'s docblocks in this same PR).
 * Listed on `/app/settings` as "Theme & language".
 */
export default async function AppearancePage() {
  await requireShell("school")
  const { locale } = await getMessages()

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SubPageHeader
        title={locale === "bn" ? "থিম ও ভাষা" : "Theme & language"}
        description={
          locale === "bn"
            ? "অ্যাপের চেহারা ও ভাষা বেছে নিন।"
            : "Choose how the app looks and which language it speaks."
        }
      />
      <AppearanceForm locale={locale} />
    </div>
  )
}
