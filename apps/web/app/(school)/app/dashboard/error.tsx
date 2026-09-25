"use client"

import { useEffect } from "react"

import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

/**
 * Dashboard-scoped error boundary (D-400): a failure here keeps the shell and
 * its nav on screen. Same copy and digest rule as the app-wide `error.tsx`.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <EmptyState
      icon={<TriangleAlertIcon />}
      title="Something went wrong"
      description={
        error.digest
          ? `We could not load the dashboard. Quote reference ${error.digest} if you report it.`
          : "We could not load the dashboard. Try again in a moment."
      }
      action={
        <Button onClick={reset} variant="outline">
          Try again
        </Button>
      }
    />
  )
}
