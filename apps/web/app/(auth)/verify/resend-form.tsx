"use client"

import { useState, useTransition } from "react"

import { CountdownButton } from "@acadigma/ui/primitives/countdown-button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import {
  describeSubmitFailure,
  type SubmitFailureTone,
} from "@/lib/submit-failure"

import { requestEmailVerification } from "../actions"

const RESEND_COOLDOWN_SECONDS = 60

export function ResendForm({
  email,
  t,
  network,
}: {
  email: string
  t: Messages["auth"]["verify"]
  network: Messages["auth"]["network"]
}) {
  const [seconds, setSeconds] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorTone, setErrorTone] = useState<SubmitFailureTone>("error")
  const [isPending, startTransition] = useTransition()

  function handleResend() {
    setToast(null)
    setError(null)
    setErrorTone("error")
    startTransition(async () => {
      try {
        const result = await requestEmailVerification({ email })
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        setToast(t.resentToast)
        setSeconds(RESEND_COOLDOWN_SECONDS)
      } catch {
        // D-35: never start a 60s cooldown for a send that never happened.
        const failure = describeSubmitFailure(network)
        setErrorTone(failure.tone)
        setError(failure.message)
      }
    })
  }

  return (
    <div className="space-y-3">
      {error ? <InlineAlert tone={errorTone}>{error}</InlineAlert> : null}
      {toast ? <InlineAlert tone="success">{toast}</InlineAlert> : null}
      <CountdownButton
        type="button"
        variant="outline"
        className="w-full"
        seconds={seconds}
        onClick={handleResend}
        disabled={isPending}
        countingLabel={(s) => t.resendCooldown.replace("{seconds}", String(s))}
        readyLabel={t.resendButton}
      />
      <a
        href="/register"
        className="text-muted-foreground block text-center text-sm underline-offset-4 hover:underline"
      >
        {t.changeEmailLink}
      </a>
    </div>
  )
}
