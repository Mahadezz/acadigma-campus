"use client"

import { useEffect, useState, useTransition } from "react"

import type { ApiError, GuardianInvitationPreview } from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { OnlineOnly } from "@/app/(shared)/offline/online-only"
import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"
import { purgeOnSignOut } from "@/lib/offline/check"

import { signOut } from "../actions"

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

type InviteErrors = Messages["invite"]["errors"]
type ErrorCode = keyof InviteErrors

/** The SQL code the repository attached, if the screen has words for it. */
function errorCode(e: ApiError, t: InviteErrors): ErrorCode {
  const code = e.fieldErrors?._root?.[0]
  return code && Object.hasOwn(t, code) ? (code as ErrorCode) : "generic"
}

type State =
  | { kind: "loading" }
  | { kind: "no-token" }
  | { kind: "signed-out" }
  | { kind: "error"; error: ApiError }
  | { kind: "preview"; token: string; preview: GuardianInvitationPreview }

async function load(signedIn: boolean): Promise<State> {
  const token = readToken()
  if (!token) return { kind: "no-token" }
  if (!signedIn) return { kind: "signed-out" }
  const r = await previewInvitation({ token })
  // A used, replaced or expired link will never work again: drop it.
  if (r.ok && r.data.status !== "pending") forgetToken()
  return r.ok
    ? { kind: "preview", token, preview: r.data }
    : { kind: "error", error: r.error }
}

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
  const [state, setState] = useState<State>({ kind: "loading" })
  const [pending, startTransition] = useTransition()
  const [acceptError, setAcceptError] = useState<ApiError | null>(null)
  const [signingOut, startSignOut] = useTransition()

  function errorView(e: ApiError) {
    const code = errorCode(e, t.errors)
    return (
      <div className="space-y-4">
        <InlineAlert tone="error">{t.errors[code]}</InlineAlert>
        {code === "MEMBERSHIP_CONFLICT" ? (
          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={signingOut}
            onClick={() =>
              startSignOut(async () => {
                // F-ID-11 §4.7 (D-308): this sign-out ends on /register,
                // not /login, so it wipes the offline page cache itself.
                await purgeOnSignOut()
                await signOut("/invite")
              })
            }
          >
            {t.signOut}
          </Button>
        ) : null}
      </div>
    )
  }

  useEffect(() => {
    void load(signedIn).then(setState)
  }, [signedIn])

  if (state.kind === "no-token") {
    return <InlineAlert tone="error">{t.noToken}</InlineAlert>
  }

  if (state.kind === "signed-out") {
    return (
      <div className="space-y-4">
        <p className="text-sm">{t.signedOut}</p>
        <div className="grid gap-2">
          <Button asChild className="h-11">
            <a href="/login?next=/invite">{t.signIn}</a>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <a href="/register?next=/invite">{t.register}</a>
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

  if (state.kind === "error") return errorView(state.error)

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

  const token = state.token
  function accept() {
    setAcceptError(null)
    startTransition(async () => {
      const r = await acceptInvitation({ token })
      if (!r.ok) {
        setAcceptError(r.error)
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
      {acceptError ? errorView(acceptError) : null}
      {/* F-ID-11 §4.9: accepting an invitation needs the server. */}
      <OnlineOnly>
        <Button className="h-11 w-full" onClick={accept} disabled={pending}>
          {pending ? t.accepting : t.accept}
        </Button>
      </OnlineOnly>
    </div>
  )
}
