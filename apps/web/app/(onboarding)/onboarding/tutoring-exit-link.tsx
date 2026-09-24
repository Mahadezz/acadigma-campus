"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Loader2Icon } from "lucide-react"

import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { completeOnboarding } from "../actions"

/**
 * F-ID-05 §4.2: "a quiet third affordance ... which sets
 * `onboarding_completed_at` and routes to `/personal`. It is a text link,
 * not a card, because it is an exit rather than a setup path." AC11:
 * "signing in later never forces onboarding again."
 */
export function TutoringExitLink({
  label,
  errorLabel,
}: {
  label: string
  errorLabel: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hasError, setHasError] = useState(false)

  function onClick() {
    setHasError(false)
    startTransition(async () => {
      const result = await completeOnboarding({ exit: "personal" })
      if (!result.ok) {
        setHasError(true)
        return
      }
      router.push(result.data.landingRoute)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {hasError ? <InlineAlert tone="error">{errorLabel}</InlineAlert> : null}
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4 disabled:opacity-60"
      >
        {isPending ? (
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
        ) : null}
        {hasError ? `${label} — retry` : label}
      </button>
    </div>
  )
}
