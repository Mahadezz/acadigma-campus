"use client"

import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

export type Notice = { tone: "error" | "success"; text: string; stale?: boolean }

/** Form-level save result. A stale-version conflict (§7) offers a reload. */
export function SaveNotice({
  notice,
  reloadLabel,
}: {
  notice: Notice | null
  reloadLabel: string
}) {
  if (!notice) return null
  return (
    <InlineAlert tone={notice.tone}>
      {notice.text}{" "}
      {notice.stale ? (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          onClick={() => window.location.reload()}
        >
          {reloadLabel}
        </Button>
      ) : null}
    </InlineAlert>
  )
}
