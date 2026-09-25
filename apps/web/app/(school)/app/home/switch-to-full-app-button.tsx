"use client"

import * as React from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"

import { updateUiPreferences } from "@/app/(shared)/workspace/actions"

/**
 * F-ID-10 §4.2: one tap, no confirmation — reversible the same way basic
 * mode was turned on. A client component calling the shared server action
 * (the same `updateUiPreferences` + `startTransition` shape
 * `DisplaySettingsForm`/`UserMenu` already use), not an inline per-page
 * server action closure.
 */
export function SwitchToFullAppButton({ label }: { label: string }) {
  const router = useRouter()
  const [, startTransition] = React.useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await updateUiPreferences({ uiMode: "full" })
      if (result.ok) router.push("/app/dashboard")
    })
  }

  return (
    <Button
      type="button"
      size="lg"
      className="min-h-14 min-w-56"
      onClick={handleClick}
    >
      {label}
    </Button>
  )
}
