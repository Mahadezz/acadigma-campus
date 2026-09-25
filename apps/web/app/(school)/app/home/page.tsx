import { getMessages } from "@/lib/i18n"
import { requireShell } from "@/lib/workspace"

import { SwitchToFullAppButton } from "./switch-to-full-app-button"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Basic mode" }

/**
 * F-ID-10 §4.3/§6 `/app/home` — this Part's landing target for `ui_mode
 * ='basic'` (AC1), kept deliberately minimal. The class-by-class home
 * (`TodayStrip`, `ClassBlock`, `getBasicHome`) is F-ID-10 Part 2, not this
 * PR: this screen only proves the preference actually took effect (AC1,
 * AC2) and says outright, in its own copy, that the real home is still
 * coming — it does not pretend to be the finished feature.
 */
export default async function BasicHomePlaceholderPage() {
  await requireShell("school")
  const { t } = await getMessages()
  const s = t.basicMode.home

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
      <p className="text-muted-foreground text-sm">{s.message}</p>
      <SwitchToFullAppButton label={s.switchToFullApp} />
    </div>
  )
}
