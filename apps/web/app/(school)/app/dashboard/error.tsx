"use client"

import { useEffect } from "react"

import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { getClientLocale, type Locale } from "@/lib/locale"
import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

const MESSAGES = { en, bn } as const satisfies Record<Locale, unknown>

/**
 * Dashboard-scoped error boundary (D-400): a failure here keeps the shell and
 * its nav on screen. Same copy, digest rule and locale source as the
 * app-wide `error.tsx` (design pass, D-407) — this one previously had
 * hardcoded English strings that never became Bengali.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const s = MESSAGES[getClientLocale()].errors.appError

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <EmptyState
      icon={<TriangleAlertIcon />}
      title={s.title}
      description={
        error.digest
          ? s.descriptionWithDigest.replace("{digest}", error.digest)
          : s.description
      }
      action={
        <Button onClick={reset} variant="outline">
          {s.action}
        </Button>
      }
    />
  )
}
