"use client"

import * as React from "react"

import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { countOnDevice } from "@/lib/offline/outbox-client"

import { useOfflineCopy } from "./offline-provider"

/**
 * F-ID-11 §4.6 (D-310), on the sign-in screen: changes saved on this phone
 * and not sent yet — an expired session's, or another teacher's. A count
 * only (never whose, never what), so the account that saved them signs in.
 */
export function WaitingOnDevice() {
  const [n, setN] = React.useState(0)
  const getCopy = useOfflineCopy()
  React.useEffect(() => {
    if (typeof indexedDB === "undefined") return
    countOnDevice()
      .then(setN)
      .catch(() => undefined)
  }, [])
  if (n === 0) return null
  const copy = getCopy()
  return (
    <div className="mb-4">
      <InlineAlert tone="offline">
        {n === 1
          ? copy.waitingOnDeviceOne
          : copy.waitingOnDevice.replace("{count}", String(n))}
      </InlineAlert>
    </div>
  )
}
