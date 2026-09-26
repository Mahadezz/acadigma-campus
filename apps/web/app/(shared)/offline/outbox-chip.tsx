"use client"

import * as React from "react"

import { CloudUploadIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { OutboxItem } from "@/lib/offline/outbox"
import {
  deleteItem,
  retryItem,
  sendQueued,
  useOutbox,
} from "@/lib/offline/outbox-client"
import { useOnline } from "@/lib/offline/use-online"

import { useOfflineCopy, type OfflineCopy } from "./offline-provider"

const WEEK_MS = 7 * 24 * 60 * 60_000
const count = (s: string, n: number) => s.replace("{count}", String(n))

/**
 * F-ID-11 Part 2a (§4.4, §4.10, D-309): the pending chip in the top bar and
 * the queue sheet it opens. Hidden when nothing waits. It also runs replay:
 * on open, on the `online` event and when the app comes back to the
 * foreground (iOS has no Background Sync, so one path everywhere).
 */
export function OutboxChip({ userId }: { userId: string }) {
  const items = useOutbox(userId)
  const getCopy = useOfflineCopy()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const send = () => void sendQueued(userId)
    const visible = () => {
      if (document.visibilityState === "visible") send()
    }
    send()
    window.addEventListener("online", send)
    document.addEventListener("visibilitychange", visible)
    return () => {
      window.removeEventListener("online", send)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [userId])

  if (items.length === 0) return null
  const copy = getCopy()
  const needsYou = items.filter(
    (i) => i.status === "conflict" || i.status === "needs_attention"
  ).length

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={
          needsYou > 0 ? "border-destructive text-destructive h-9" : "h-9"
        }
        onClick={() => setOpen(true)}
      >
        {needsYou > 0 ? (
          <TriangleAlertIcon aria-hidden="true" />
        ) : (
          <CloudUploadIcon aria-hidden="true" />
        )}
        {needsYou > 0
          ? count(copy.chipNeedsYou, needsYou)
          : count(copy.chipWaiting, items.length)}
      </Button>
      <QueueSheet
        open={open}
        onOpenChange={setOpen}
        items={items}
        userId={userId}
        copy={copy}
      />
    </>
  )
}

/** §4.10: a banner that stays while anything has waited a week or more. */
export function OutboxStaleBanner({ userId }: { userId: string }) {
  const items = useOutbox(userId)
  const getCopy = useOfflineCopy()
  // Read once per render from the device clock: a week is not precise work.
  // eslint-disable-next-line react-hooks/purity -- the current time is the value
  const now = Date.now()
  const stale = items.filter((i) => now - i.createdAt >= WEEK_MS).length
  if (stale === 0) return null
  return (
    <InlineAlert tone="offline" className="mb-3">
      {count(getCopy().staleBanner, stale)}
    </InlineAlert>
  )
}

function QueueSheet({
  open,
  onOpenChange,
  items,
  userId,
  copy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: OutboxItem[]
  userId: string
  copy: OfflineCopy
}) {
  const online = useOnline()
  const [sending, startSending] = React.useTransition()
  const groups = [
    {
      title: copy.groupWaiting,
      items: items.filter(
        (i) => i.status === "pending" || i.status === "sending"
      ),
    },
    {
      title: copy.groupChoice,
      items: items.filter((i) => i.status === "conflict"),
    },
    {
      title: copy.groupAttention,
      items: items.filter((i) => i.status === "needs_attention"),
    },
  ].filter((g) => g.items.length > 0)

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={copy.queueTitle}
      description={copy.queueDescription}
      footer={
        <Button
          className="h-11 w-full sm:w-auto"
          disabled={!online || sending}
          onClick={() => startSending(() => sendQueued(userId))}
        >
          <CloudUploadIcon aria-hidden="true" />
          {sending ? copy.sending : copy.sendNow}
        </Button>
      }
    >
      {groups.length === 0 ? (
        <p className="text-muted-foreground py-4 text-sm">
          {copy.nothingWaiting}
        </p>
      ) : (
        <div className="space-y-5 pb-4">
          {groups.map((g) => (
            <section key={g.title} className="space-y-2">
              <h3 className="text-sm font-semibold">{g.title}</h3>
              <ul className="divide-y rounded-md border">
                {g.items.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    userId={userId}
                    copy={copy}
                    online={online}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </FormSheet>
  )
}

function QueueRow({
  item,
  userId,
  copy,
  online,
}: {
  item: OutboxItem
  userId: string
  copy: OfflineCopy
  online: boolean
}) {
  const [shown, setShown] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [busy, startBusy] = React.useTransition()
  const detailId = React.useId()
  const waiting = item.status === "pending" || item.status === "sending"

  return (
    <li className="space-y-2 p-3">
      <p className="text-sm font-medium">
        {item.summary}
        {item.status === "sending" ? (
          <span className="text-muted-foreground font-normal">
            {" "}
            · {copy.sending}
          </span>
        ) : null}
      </p>
      {item.status === "conflict" ? (
        <p className="text-muted-foreground text-sm">{copy.conflictReason}</p>
      ) : item.status === "needs_attention" && item.lastError ? (
        <p className="text-destructive text-sm">{item.lastError.message}</p>
      ) : null}
      {/* Always in the DOM so the toggle's aria-controls resolves. */}
      <p id={detailId} hidden={!shown} className="bg-muted rounded p-2 text-sm">
        {item.detail}
      </p>
      {confirming ? (
        <div className="space-y-2">
          <p className="text-sm">
            {copy.deleteConfirm.replace("{summary}", item.summary)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              className="h-11"
              disabled={busy}
              onClick={() => startBusy(() => deleteItem(userId, item.id))}
            >
              {copy.delete}
            </Button>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setConfirming(false)}
            >
              {copy.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {item.status === "needs_attention" ? (
            <Button
              variant="outline"
              className="h-11"
              disabled={!online || busy}
              onClick={() => startBusy(() => retryItem(userId, item.id))}
            >
              {copy.tryAgain}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className="h-11"
            aria-expanded={shown}
            aria-controls={detailId}
            onClick={() => setShown((v) => !v)}
          >
            {shown ? copy.hideEntered : copy.showEntered}
          </Button>
          {waiting ? null : (
            <Button
              variant="ghost"
              className="text-destructive h-11"
              onClick={() => setConfirming(true)}
            >
              {copy.delete}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
