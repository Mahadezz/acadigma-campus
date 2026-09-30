"use client"

import { useEffect, useRef, useState, useTransition } from "react"

import { Loader2Icon, MonitorIcon, SmartphoneIcon } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@acadigma/ui/components/alert-dialog"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import { purgeOnSignOut } from "@/lib/offline/check"
import { deleteOwnOutbox } from "@/lib/offline/outbox-client"

import { revokeSession, signOutEverywhere } from "./session-actions"

type T = Messages["auth"]["devices"]

/** One device, dates already formatted on the server (no timezone drift). */
export type DeviceRow = {
  id: string
  label: string
  isCurrent: boolean
  signedIn: string
  lastActive: string
}

const PHONE = /Android|iOS/

/**
 * F-ID-01 §4.8 / §6 (D-116): one card per signed-in device, the current one
 * first and badged, a Sign out button on every other one, and Sign out
 * everywhere below, behind a confirmation. A revoke hides the card at once and puts it back if the
 * server says no (§6 "a failed revoke restores the row").
 */
export function SignedInDevices({
  t,
  userId,
  devices,
}: {
  t: T
  userId: string
  devices: DeviceRow[]
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const [message, setMessage] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)
  const [everywhere, startEverywhere] = useTransition()
  // After a card goes, focus moves to the next card's button (or the list),
  // never to <body> (a11y review).
  const focusId = useRef<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const list = useRef<HTMLUListElement>(null)

  const visible = devices.filter((d) => !hidden.has(d.id))

  // Runs after the render that removed the card.
  useEffect(() => {
    if (focusId.current === null) return
    const target = buttons.current.get(focusId.current) ?? list.current
    focusId.current = null
    target?.focus()
  })

  function without(set: ReadonlySet<string>, id: string) {
    const next = new Set(set)
    next.delete(id)
    return next
  }

  async function revoke(id: string) {
    const others = visible.filter((d) => !d.isCurrent).map((d) => d.id)
    const at = others.indexOf(id)
    const nextFocus = others[at + 1] ?? others[at - 1] ?? ""
    setMessage(null)
    setPending((p) => new Set(p).add(id))
    setHidden((h) => new Set(h).add(id))
    focusId.current = nextFocus
    try {
      const r = await revokeSession({ sessionId: id })
      if (r.ok) {
        setMessage({ tone: "success", text: t.revoked })
      } else {
        setHidden((h) => without(h, id))
        setMessage({ tone: "error", text: r.error.message })
      }
    } catch {
      setHidden((h) => without(h, id))
      setMessage({ tone: "error", text: t.error })
    } finally {
      setPending((p) => without(p, id))
    }
  }

  function signOutAll() {
    setMessage(null)
    startEverywhere(async () => {
      try {
        const r = await signOutEverywhere()
        if (!r.ok) {
          setMessage({ tone: "error", text: r.error.message })
          return
        }
        // Every session just ended server-side; clear this device too (§4.10).
        await deleteOwnOutbox(userId).catch(() => undefined)
        await purgeOnSignOut().catch(() => undefined)
        window.location.assign("/login")
      } catch {
        setMessage({ tone: "error", text: t.error })
      }
    })
  }

  return (
    <div className="space-y-4">
      <ul
        ref={list}
        tabIndex={-1}
        className="space-y-3 outline-none"
        aria-label={t.title}
      >
        {visible.map((d) => {
          const Icon = PHONE.test(d.label) ? SmartphoneIcon : MonitorIcon
          return (
            <li
              key={d.id}
              data-testid="device-row"
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-background/60 p-3"
            >
              <Icon
                aria-hidden
                className="size-5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span className="break-words">{d.label}</span>
                  {d.isCurrent ? (
                    <Badge variant="secondary">{t.thisDevice}</Badge>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t.signedIn.replace("{date}", d.signedIn)}
                  {" · "}
                  {t.lastActive.replace("{date}", d.lastActive)}
                </p>
              </div>
              {d.isCurrent ? null : (
                <Button
                  ref={(el) => {
                    if (el) buttons.current.set(d.id, el)
                    else buttons.current.delete(d.id)
                  }}
                  variant="outline"
                  className="h-11"
                  disabled={pending.has(d.id) || everywhere}
                  aria-label={t.signOutLabel.replace("{device}", d.label)}
                  onClick={() => void revoke(d.id)}
                >
                  {t.signOutButton}
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      <div aria-live="polite">
        {message ? (
          <InlineAlert tone={message.tone}>{message.text}</InlineAlert>
        ) : null}
      </div>

      <div className="space-y-2 border-t pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              disabled={everywhere}
            >
              {everywhere ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : null}
              {everywhere ? t.everywhereWorking : t.everywhereButton}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{t.confirmBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">
                {t.confirmCancel}
              </AlertDialogCancel>
              <AlertDialogAction className="h-11" onClick={signOutAll}>
                {t.confirmAction}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <p className="text-sm text-muted-foreground">{t.everywhereHint}</p>
      </div>
    </div>
  )
}
