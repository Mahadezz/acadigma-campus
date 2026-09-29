"use client"

import * as React from "react"

import { Button } from "@acadigma/ui/components/button"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"

import { purgeOnSignOut } from "@/lib/offline/check"
import {
  countQueued,
  deleteOwnOutbox,
  sendQueued,
} from "@/lib/offline/outbox-client"

import { useOfflineCopy } from "./offline-provider"

/**
 * F-ID-11 §4.7 (D-308, D-309): every sign-out control goes through this.
 * With changes still on the phone it first asks "Stay and send / Sign out
 * and delete them"; signing out wipes the user's own outbox and every data
 * cache before the session ends. Another teacher's queue on a shared phone
 * is neither counted nor deleted (D-309). (The unconditional wipe on
 * arriving at /login clears pages only: an expired session keeps its
 * queue, §4.6.)
 *
 * `userId` is who the server says is signed in (`ctx.userId`), never the
 * device's last snapshot: that can still name the previous teacher on a
 * shared phone when a check never got through (D-310, review of #89).
 */
export function useGuardedSignOut(
  signOutNow: () => Promise<void>,
  userId: string
): {
  request: () => void
  pending: boolean
  dialog: React.ReactNode
} {
  const [waiting, setWaiting] = React.useState(0)
  const [pending, start] = React.useTransition()
  const getCopy = useOfflineCopy()

  async function finish() {
    await deleteOwnOutbox(userId).catch(() => undefined)
    await purgeOnSignOut()
    await signOutNow()
  }

  function request() {
    start(async () => {
      const n = await countQueued(userId).catch(() => 0)
      if (n > 0) setWaiting(n)
      else await finish()
    })
  }

  function stay() {
    setWaiting(0)
    if (navigator.onLine) void sendQueued(userId)
  }

  const dialog =
    waiting > 0 ? (
      <FormSheet
        open
        onOpenChange={(open) => {
          if (!open) setWaiting(0)
        }}
        title={
          waiting === 1
            ? getCopy().signOutTitleOne
            : getCopy().signOutTitle.replace("{count}", String(waiting))
        }
        footer={
          <>
            <Button className="h-11" onClick={stay}>
              {getCopy().stayAndSend}
            </Button>
            <Button
              variant="destructive"
              className="h-11"
              disabled={pending}
              onClick={() => start(finish)}
            >
              {getCopy().signOutAndDelete}
            </Button>
          </>
        }
      >
        <p className="text-sm">{getCopy().signOutBody}</p>
      </FormSheet>
    ) : null

  return { request, pending, dialog }
}

/** A plain sign-out button with the same guard (basic mode's essentials row). */
export function GuardedSignOutButton({
  signOutNow,
  userId,
  className,
  children,
}: {
  signOutNow: () => Promise<void>
  /** The signed-in user (`ctx.userId`). */
  userId: string
  className?: string
  children: React.ReactNode
}) {
  const { request, pending, dialog } = useGuardedSignOut(signOutNow, userId)
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={request}
      >
        {children}
      </button>
      {dialog}
    </>
  )
}
