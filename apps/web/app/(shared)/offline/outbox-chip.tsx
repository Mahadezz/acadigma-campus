"use client"

import * as React from "react"

import dynamic from "next/dynamic"

import { CloudUploadIcon, TriangleAlertIcon } from "lucide-react"

import type { ApiError } from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { signOut } from "@/app/(auth)/actions"
import { saveErrorText } from "@/app/(school)/app/attendance/[sectionId]/roll-call"
import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"
import { othersWaiting } from "@/lib/offline/check"
import type { OutboxItem } from "@/lib/offline/outbox"
import {
  deleteItem,
  outboxPaused,
  retryItem,
  sendQueued,
  useOutbox,
  watchSuccessfulRequests,
} from "@/lib/offline/outbox-client"
import { outboxEvents } from "@/lib/offline/outbox-db"
import { useOnline } from "@/lib/offline/use-online"

import { useOfflineCopy, type OfflineCopy } from "./offline-provider"
import { useGuardedSignOut } from "./sign-out-guard"

// Opened only on a conflict (D-310): kept out of every page's first load.
const ConflictSheet = dynamic(() =>
  import("./conflict-sheet").then((m) => m.ConflictSheet)
)

const WEEK_MS = 7 * 24 * 60 * 60_000
/** "{count} …", or the singular sentence for one (Bangla has the same). */
const count = (s: string, n: number, one?: string) =>
  n === 1 && one ? one : s.replace("{count}", String(n))

type RollCopy = Messages["attendance"]["roll"]

/** The refusal in the reader's language, by its named reason (not the server's English). */
function refusalText(t: RollCopy, item: OutboxItem): string {
  const e = item.lastError
  if (!e) return t.errors.generic
  return saveErrorText(t, {
    code: e.code as ApiError["code"],
    message: e.message,
    ...(e.root ? { fieldErrors: { _root: [e.root] } } : {}),
  })
}

/**
 * F-ID-11 Part 2a (§4.4, §4.10, D-309): the pending chip in the top bar and
 * the queue sheet it opens. Hidden when nothing waits. It also runs replay:
 * on open, on the `online` event and when the app comes back to the
 * foreground (iOS has no Background Sync, so one path everywhere).
 */
export function OutboxChip({
  userId,
  rollCopy,
  locale,
}: {
  userId: string
  /** For the refusal reasons of queued roll calls. */
  rollCopy: RollCopy
  locale: Locale
}) {
  const items = useOutbox(userId)
  const getCopy = useOfflineCopy()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const send = () => void sendQueued(userId)
    const visible = () => {
      if (document.visibilityState === "visible") send()
    }
    // The `online` event often fires before the network carries traffic
    // (Wi-Fi still joining, mobile data waking up): the first try fails, so
    // three more follow within ~15 s. Each is free when nothing waits.
    const timers: number[] = []
    const online = () => {
      timers.forEach(clearTimeout)
      timers.length = 0
      send()
      for (const ms of [2_000, 5_000, 15_000]) {
        timers.push(window.setTimeout(send, ms))
      }
    }
    send()
    window.addEventListener("online", online)
    document.addEventListener("visibilitychange", visible)
    // §4.4 (D-310): and after any successful request while items wait.
    const stopWatching = watchSuccessfulRequests(send)
    return () => {
      window.removeEventListener("online", online)
      document.removeEventListener("visibilitychange", visible)
      timers.forEach(clearTimeout)
      stopWatching()
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
          needsYou > 0 ? "border-destructive text-destructive h-11" : "h-11"
        }
        onClick={() => setOpen(true)}
      >
        {needsYou > 0 ? (
          <TriangleAlertIcon aria-hidden="true" />
        ) : (
          <CloudUploadIcon aria-hidden="true" />
        )}
        {needsYou > 0
          ? count(copy.chipNeedsYou, needsYou, copy.chipNeedsYouOne)
          : count(copy.chipWaiting, items.length)}
      </Button>
      <QueueSheet
        open={open}
        onOpenChange={setOpen}
        items={items}
        userId={userId}
        copy={copy}
        rollCopy={rollCopy}
        locale={locale}
      />
    </>
  )
}

const subscribe = (fn: () => void) => {
  outboxEvents?.addEventListener("change", fn)
  return () => outboxEvents?.removeEventListener("change", fn)
}

/**
 * §4.10: a banner that stays while anything has waited a week or more.
 * §4.6 (D-310): "Sign in again" while the queue is paused by an expired
 * session; and another teacher's unsent changes on this phone — a plain
 * count, never their contents — with a one-time choice to continue or sign
 * out so that teacher can send them.
 */
export function OutboxStaleBanner({ userId }: { userId: string }) {
  const items = useOutbox(userId)
  const getCopy = useOfflineCopy()
  const others = React.useSyncExternalStore(subscribe, othersWaiting, () => 0)
  const paused = React.useSyncExternalStore(
    subscribe,
    outboxPaused,
    () => false
  )
  // Read once per render from the device clock: a week is not precise work.
  // eslint-disable-next-line react-hooks/purity -- the current time is the value
  const now = Date.now()
  const stale = items.filter((i) => now - i.createdAt >= WEEK_MS).length
  const waiting = items.filter(
    (i) => i.status === "pending" || i.status === "sending"
  ).length
  const showPaused = paused && waiting > 0
  if (stale === 0 && others === 0 && !showPaused) return null
  const copy = getCopy()
  return (
    <>
      {showPaused ? (
        <InlineAlert tone="offline" className="mb-3">
          <span className="block">
            {count(copy.pausedBanner, waiting, copy.pausedBannerOne)}
          </span>
          <Button asChild variant="outline" className="mt-2 h-11">
            <a href="/login">{copy.signInAgain}</a>
          </Button>
        </InlineAlert>
      ) : null}
      {others > 0 ? <OthersOnPhone userId={userId} copy={copy} /> : null}
      {stale > 0 ? (
        <InlineAlert tone="offline" className="mb-3">
          {count(copy.staleBanner, stale, copy.staleBannerOne)}
        </InlineAlert>
      ) : null}
      {others > 0 ? (
        <InlineAlert tone="info" className="mb-3">
          {count(copy.othersWaiting, others, copy.othersWaitingOne)}
        </InlineAlert>
      ) : null}
    </>
  )
}

const SEEN_KEY = "acadigma-others-seen"

/**
 * §4.6 (D-310): once per sign-in, the choice the spec asks for when a phone
 * holds another account's unsent work. Their work is never deleted or shown
 * here; the choice is only whether to hand the phone back.
 */
function OthersOnPhone({
  userId,
  copy,
}: {
  userId: string
  copy: OfflineCopy
}) {
  // Client-only (the banner renders nothing on the server), so storage is
  // readable here. No storage: asked each time the banner mounts.
  const [open, setOpen] = React.useState(() => {
    try {
      return sessionStorage.getItem(SEEN_KEY) !== userId
    } catch {
      return true
    }
  })
  const guardedSignOut = useGuardedSignOut(() => signOut(), userId)
  function close() {
    try {
      sessionStorage.setItem(SEEN_KEY, userId)
    } catch {
      // Asked again next time.
    }
    setOpen(false)
  }
  return (
    <>
      {guardedSignOut.dialog}
      <FormSheet
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        title={copy.othersTitle}
        footer={
          <>
            <Button className="h-11" onClick={close}>
              {copy.othersContinue}
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={guardedSignOut.pending}
              onClick={() => {
                close()
                guardedSignOut.request()
              }}
            >
              {copy.othersSignOut}
            </Button>
          </>
        }
      >
        <p className="pb-4 text-sm">{copy.othersBody}</p>
      </FormSheet>
    </>
  )
}

function QueueSheet({
  open,
  onOpenChange,
  items,
  userId,
  copy,
  rollCopy,
  locale,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: OutboxItem[]
  userId: string
  copy: OfflineCopy
  rollCopy: RollCopy
  locale: Locale
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
                    rollCopy={rollCopy}
                    online={online}
                    locale={locale}
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
  rollCopy,
  online,
  locale,
}: {
  item: OutboxItem
  userId: string
  copy: OfflineCopy
  rollCopy: RollCopy
  online: boolean
  locale: Locale
}) {
  const [shown, setShown] = React.useState(false)
  const [choosing, setChoosing] = React.useState(false)
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
        <p className="text-destructive text-sm">
          {refusalText(rollCopy, item)}
        </p>
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
          {item.status === "conflict" ? (
            <Button
              className="h-11"
              disabled={!online}
              onClick={() => setChoosing(true)}
            >
              {copy.compareAndChoose}
            </Button>
          ) : null}
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
      {choosing ? (
        <ConflictSheet
          item={item}
          userId={userId}
          copy={copy}
          locale={locale}
          open
          onOpenChange={setChoosing}
        />
      ) : null}
    </li>
  )
}
