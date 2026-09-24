"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Loader2Icon } from "lucide-react"

import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { saveOnboardingDraft } from "../actions"

/**
 * F-ID-05 §4.7: "Continue setting up {draft name}" as the primary card with
 * a "Start over" secondary. Reuses `saveOnboardingDraft` to reset the
 * progress row back to its fresh shape rather than a dedicated action —
 * there is nothing this needs that a plain draft save does not already do.
 */
export function StartOverLink({
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
      const result = await saveOnboardingDraft({
        path: "undecided",
        step: 1,
        draft: {},
      })
      if (!result.ok) {
        setHasError(true)
        return
      }
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
