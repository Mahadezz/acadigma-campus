"use client"

import { useEffect, useState, useTransition } from "react"

import type { GuardianInvitationPreview } from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { acceptInvitation, previewInvitation } from "./actions"

/** Where the token waits while the parent signs in or registers. */
const STORAGE_KEY = "acadigma_invite"

function readToken(): string | null {
  const fromHash = window.location.hash.slice(1)
  try {
    if (fromHash) {
      window.localStorage.setItem(STORAGE_KEY, fromHash)
      // Drop the token from the address bar (and so from history).
      window.history.replaceState(null, "", window.location.pathname)
      return fromHash
    }
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return fromHash || null
  }
}

function forgetToken() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: nothing was kept.
  }
}

type State =
  | { kind: "loading" }
  | { kind: "no-token" }
  | { kind: "error"; message: string }
  | { kind: "preview"; preview: GuardianInvitationPreview }

export function InviteAccept({
  t,
  relations,
  locale,
  signedIn,
}: {
  t: Messages["invite"]
  relations: Messages["students"]["relation"]
  locale: Locale
  signedIn: boolean
}) {
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<State>({ kind: "loading" })
  const [pending, startTransition] = useTransition()
  const [acceptError, setAcceptError] = useState<string | null>(null)

  useEffect(() => {
    const found = readToken()
    setToken(found)
    if (!found) {
      setState({ kind: "no-token" })
      return
    }
    if (!signedIn) return
    void previewInvitation({ token: found }).then((r) =>
      setState(
        r.ok
          ? { kind: "preview", preview: r.data }
          : { kind: "error", message: r.error.message }
      )
    )
  }, [signedIn])

  if (state.kind === "no-token") {
    return <InlineAlert tone="error">{t.noToken}</InlineAlert>
  }

  if (!signedIn && token) {
    return (
      <div className="space-y-4">
        <p className="text-sm">{t.signedOut}</p>
        <div className="grid gap-2">
          <Button asChild className="h-11">
            <a href="/login?next=/invite">{t.signIn}</a>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <a href="/register">{t.register}</a>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{t.afterRegister}</p>
      </div>
    )
  }

  if (state.kind === "loading") {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        {t.checking}
      </p>
    )
  }

  if (state.kind === "error") {
    return <InlineAlert tone="error">{state.message}</InlineAlert>
  }

  const p = state.preview
  if (p.status !== "pending") {
    const done = p.status === "accepted" && p.acceptedByMe
    return (
      <div className="space-y-4">
        <InlineAlert tone={done ? "info" : "error"}>
          {done ? t.alreadyAccepted : t.status[p.status]}
        </InlineAlert>
        {done ? (
          <Button asChild className="h-11 w-full">
            <a href="/family">{t.open}</a>
          </Button>
        ) : null}
      </div>
    )
  }

  const student =
    locale === "bn" && p.studentNameBn ? p.studentNameBn : p.studentName

  function accept() {
    if (!token) return
    setAcceptError(null)
    startTransition(async () => {
      const r = await acceptInvitation({ token })
      if (!r.ok) {
        setAcceptError(r.error.message)
        return
      }
      forgetToken()
      window.location.assign("/family")
    })
  }

  return (
    <div className="space-y-4">
      <p>
        {t.preview
          .replace("{school}", p.schoolName)
          .replace("{student}", student)
          .replace("{relation}", relations[p.relation])}
      </p>
      <p className="text-muted-foreground text-sm">
        {t.whatYouSee.replace("{student}", student)}
      </p>
      {acceptError ? (
        <InlineAlert tone="error">{acceptError}</InlineAlert>
      ) : null}
      <Button className="h-11 w-full" onClick={accept} disabled={pending}>
        {pending ? t.accepting : t.accept}
      </Button>
    </div>
  )
}
