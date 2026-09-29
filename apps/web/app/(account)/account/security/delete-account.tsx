"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { Loader2Icon } from "lucide-react"

import {
  ACCOUNT_DELETION_CONFIRMATION,
  type AccountDeletionBlocker,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { PasswordField } from "@acadigma/ui/primitives/password-field"

import { switchWorkspace } from "@/app/(shared)/workspace/actions"
import type { Messages } from "@/lib/i18n"
import { purgeOnSignOut } from "@/lib/offline/check"
import { deleteOwnOutbox } from "@/lib/offline/outbox-client"

import { requestAccountDeletion } from "./actions"

type T = Messages["auth"]["deleteAccount"]

/**
 * F-ID-01 §4.9 / §6 "Delete-account flow" (D-113). Blocked: the schools the
 * person alone owns, each with a way to hand it over. Otherwise one red
 * button opens a two-step sheet — what happens, then DELETE + password.
 */
export function DeleteAccount({
  t,
  userId,
  graceDays,
  blockers,
}: {
  t: T
  userId: string
  graceDays: number
  blockers: AccountDeletionBlocker[]
}) {
  const days = (s: string) => s.replace("{days}", String(graceDays))

  if (blockers.length > 0) {
    return <Blocked t={t} blockers={blockers} />
  }
  return <Ceremony t={t} userId={userId} days={days} />
}

function Blocked({
  t,
  blockers,
}: {
  t: T
  blockers: AccountDeletionBlocker[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <InlineAlert tone="info" title={t.blockedTitle}>
      <p>{t.blockedBody}</p>
      <ul className="mt-2 space-y-2">
        {blockers.map((b) => (
          <li
            key={b.workspaceId}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="font-medium">{b.name}</span>
            <Button
              variant="outline"
              className="h-11"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await switchWorkspace({
                    workspaceId: b.workspaceId,
                  })
                  if (r.ok) router.push("/app/settings/membership")
                })
              }
            >
              {t.transferButton}
            </Button>
          </li>
        ))}
      </ul>
    </InlineAlert>
  )
}

function Ceremony({
  t,
  userId,
  days,
}: {
  t: T
  userId: string
  days: (s: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmation, setConfirmation] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const ready =
    confirmation.trim() === ACCOUNT_DELETION_CONFIRMATION && password !== ""

  function reset(next: boolean) {
    setOpen(next)
    if (!next) {
      setStep(1)
      setConfirmation("")
      setPassword("")
      setError(null)
    }
  }

  function submit() {
    setError(null)
    start(async () => {
      try {
        const result = await requestAccountDeletion({
          confirmation: confirmation.trim(),
          password,
        })
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        // Every session was just ended server-side; clear this device too.
        await deleteOwnOutbox(userId).catch(() => undefined)
        await purgeOnSignOut().catch(() => undefined)
        window.location.assign("/login")
      } catch {
        setError("Could not reach the server. Try again.")
      }
    })
  }

  return (
    <>
      <Button
        variant="destructive"
        className="h-11"
        onClick={() => reset(true)}
      >
        {t.openButton}
      </Button>
      <FormSheet
        open={open}
        onOpenChange={reset}
        title={t.sheetTitle}
        description={t.step.replace("{n}", String(step))}
        footer={
          step === 1 ? (
            <>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => reset(false)}
              >
                {t.cancelButton}
              </Button>
              <Button className="h-11" onClick={() => setStep(2)}>
                {t.continueButton}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="h-11"
                disabled={pending}
                onClick={() => setStep(1)}
              >
                {t.backButton}
              </Button>
              <Button
                variant="destructive"
                className="h-11"
                disabled={!ready || pending}
                onClick={submit}
              >
                {pending ? (
                  <>
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                    {t.submittingButton}
                  </>
                ) : (
                  t.submitButton
                )}
              </Button>
            </>
          )
        }
      >
        {step === 1 ? (
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-semibold">{days(t.removedTitle)}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {t.removedItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="font-semibold">{t.keptTitle}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {t.keptItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <p className="text-muted-foreground">{days(t.graceNote)}</p>
          </div>
        ) : (
          <form
            className="space-y-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (ready && !pending) submit()
            }}
          >
            {error ? (
              <InlineAlert tone="error">
                <span aria-live="polite">{error}</span>
              </InlineAlert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">{t.confirmLabel}</Label>
              <Input
                id="delete-confirmation"
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-password">{t.passwordLabel}</Label>
              <PasswordField
                id="delete-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {/* Enter submits from either field. */}
            <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
          </form>
        )}
      </FormSheet>
    </>
  )
}
