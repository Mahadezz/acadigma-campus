"use client"

import { useState, useTransition } from "react"

import { Loader2Icon, MonitorIcon, SmartphoneIcon } from "lucide-react"

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
 * everywhere below. A revoke hides the card at once and puts it back if the
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
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)
  const [everywhere, startEverywhere] = useTransition()

  async function revoke(id: string) {
    setBusyId(id)
    setMessage(null)
    setHidden((h) => new Set(h).add(id))
    const restore = () =>
      setHidden((h) => {
        const next = new Set(h)
        next.delete(id)
        return next
      })
    try {
      const r = await revokeSession({ sessionId: id })
      if (r.ok) {
        setMessage({ tone: "success", text: t.revoked })
      } else {
        restore()
        setMessage({ tone: "error", text: r.error.message })
      }
    } catch {
      restore()
      setMessage({ tone: "error", text: t.error })
    } finally {
      setBusyId(null)
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

  const visible = devices.filter((d) => !hidden.has(d.id))

  return (
    <div className="space-y-4">
      <ul className="space-y-3" aria-label={t.title}>
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
                  variant="outline"
                  className="h-11"
                  disabled={busyId !== null || everywhere}
                  aria-label={t.signOutLabel.replace("{device}", d.label)}
                  onClick={() => void revoke(d.id)}
                >
                  {busyId === d.id ? (
                    <Loader2Icon className="animate-spin" aria-hidden />
                  ) : null}
                  {busyId === d.id ? t.signingOut : t.signOutButton}
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
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={everywhere || busyId !== null}
          onClick={signOutAll}
        >
          {everywhere ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : null}
          {everywhere ? t.everywhereWorking : t.everywhereButton}
        </Button>
        <p className="text-sm text-muted-foreground">{t.everywhereHint}</p>
      </div>
    </div>
  )
}
