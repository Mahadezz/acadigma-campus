"use client"

import { useEffect } from "react"

import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

/**
 * App-wide error boundary. Shows the digest, not the stack: Next replaces the
 * message with an opaque digest in production precisely so internals do not leak,
 * and that digest is what ties the screenshot in a bug report to the server log.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Sentry captures this automatically when SENTRY_DSN is configured; the console
    // line keeps it visible in development, where Sentry is off.
    console.error(error)
  }, [error])

  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-4 py-12"
    >
      <EmptyState
        icon={<TriangleAlertIcon />}
        title="Something went wrong"
        description={
          error.digest
            ? `We could not load this screen. Quote reference ${error.digest} if you report it.`
            : "We could not load this screen. Try again in a moment."
        }
        action={
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
        }
      />
    </main>
  )
}
