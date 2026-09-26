"use client"

import { RotateCwIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"

/** Reloads the page the user asked for; the worker tries the network again. */
export function RetryButton() {
  return (
    <Button onClick={() => location.reload()}>
      <RotateCwIcon aria-hidden="true" />
      Retry · আবার চেষ্টা করুন
    </Button>
  )
}
