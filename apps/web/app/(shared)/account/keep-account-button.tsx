"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Button } from "@acadigma/ui/components/button"

import { cancelAccountDeletion } from "@/app/(account)/account/security/actions"

/** "Keep my account" — one tap (F-ID-01 AC12). Not optimistic: the banner
 * stays until the server confirms, then the page re-renders without it. */
export function KeepAccountButton({
  label,
  pendingLabel,
}: {
  label: string
  pendingLabel: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [failed, setFailed] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2">
      {failed ? (
        <span role="alert" className="text-destructive text-sm">
          {failed}
        </span>
      ) : null}
      <Button
        className="h-11"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setFailed(null)
            try {
              const result = await cancelAccountDeletion()
              if (!result.ok) {
                setFailed(result.error.message)
                return
              }
              router.refresh()
            } catch {
              setFailed("Could not reach the server. Try again.")
            }
          })
        }
      >
        {pending ? pendingLabel : label}
      </Button>
    </div>
  )
}
