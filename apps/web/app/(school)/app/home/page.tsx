import { redirect } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"

import { updateUiPreferences } from "@/app/(shared)/workspace/actions"
import { getMessages } from "@/lib/i18n"
import { requireShell } from "@/lib/workspace"

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

  async function switchToFullApp() {
    "use server"
    // F-ID-10 §4.2: one tap, no confirmation — reversible the same way it
    // was turned on.
    await updateUiPreferences({ uiMode: "full" })
    redirect("/app/dashboard")
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
      <p className="text-muted-foreground text-sm">{s.message}</p>
      <form action={switchToFullApp}>
        <Button type="submit" size="lg" className="min-h-14 min-w-56">
          {s.switchToFullApp}
        </Button>
      </form>
    </div>
  )
}
