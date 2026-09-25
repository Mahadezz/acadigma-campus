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
 * App-wide error boundary. Shows the digest, not the stack: Next replaces the
 * message with an opaque digest in production precisely so internals do not leak,
 * and that digest is what ties the screenshot in a bug report to the server log.
 *
 * Next requires this boundary to be a Client Component, so it cannot call the
 * server-only `getMessages()` every other page uses — it reads the locale
 * cookie itself (`getClientLocale`, computed fresh on every render rather
 * than mirrored into state) instead. Off-browser or before hydration it
 * falls back to `DEFAULT_LOCALE`, same as every other unresolved-cookie case
 * in this app.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const s = MESSAGES[getClientLocale()].errors.appError

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
    </main>
  )
}
