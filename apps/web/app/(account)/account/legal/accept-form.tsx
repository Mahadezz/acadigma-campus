"use client"

import { useState, useTransition, type ReactNode } from "react"

import { useRouter } from "next/navigation"

import { Loader2Icon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { Checkbox } from "@acadigma/ui/components/checkbox"
import { Label } from "@acadigma/ui/components/label"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { fillNodes, LegalLink } from "@/lib/legal/legal-text"

import { acceptLegalDocuments } from "./actions"

type Copy = {
  termsLabel: string
  termsLink: string
  privacyLink: string
  dpaLabel: string
  dpaLink: string
  termsRequired: string
  dpaRequired: string
  continueButton: string
  savingButton: string
  error: string
}

/**
 * D-115: the sign-up box (Terms + Privacy) and the school-creation box
 * (DPA), with their own words, for whichever is outstanding; one Continue.
 */
export function AcceptForm({
  versions,
  t,
}: {
  versions: { terms?: string; privacy?: string; dpa?: string }
  t: Copy
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const askTerms = Boolean(versions.terms || versions.privacy)
  const askDpa = Boolean(versions.dpa)
  const [terms, setTerms] = useState(false)
  const [dpa, setDpa] = useState(false)
  const [missing, setMissing] = useState({ terms: false, dpa: false })
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const nowMissing = { terms: askTerms && !terms, dpa: askDpa && !dpa }
    setMissing(nowMissing)
    if (nowMissing.terms || nowMissing.dpa) return
    setError(null)
    startTransition(async () => {
      const result = await acceptLegalDocuments(versions)
      if (result.ok) {
        router.replace(result.data.redirectTo)
        return
      }
      setError(
        result.error.code === "conflict" ? result.error.message : t.error
      )
    })
  }

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {askTerms ? (
        <ConsentBox
          id="accept-terms"
          checked={terms}
          onChange={(v) => {
            setTerms(v)
            setMissing((m) => ({ ...m, terms: false }))
          }}
          missing={missing.terms ? t.termsRequired : null}
        >
          {fillNodes(t.termsLabel, {
            terms: <LegalLink href="/legal/terms">{t.termsLink}</LegalLink>,
            privacy: (
              <LegalLink href="/legal/privacy">{t.privacyLink}</LegalLink>
            ),
          })}
        </ConsentBox>
      ) : null}

      {askDpa ? (
        <ConsentBox
          id="accept-dpa"
          checked={dpa}
          onChange={(v) => {
            setDpa(v)
            setMissing((m) => ({ ...m, dpa: false }))
          }}
          missing={missing.dpa ? t.dpaRequired : null}
        >
          {fillNodes(t.dpaLabel, {
            dpa: <LegalLink href="/legal/dpa">{t.dpaLink}</LegalLink>,
          })}
        </ConsentBox>
      ) : null}

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2Icon className="animate-spin" aria-hidden="true" />
            {t.savingButton}
          </>
        ) : (
          t.continueButton
        )}
      </Button>
    </form>
  )
}

/** The same checkbox + label + reason the wizard's DPA box uses. */
function ConsentBox({
  id,
  checked,
  onChange,
  missing,
  children,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  missing: string | null
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex min-h-11 items-start gap-3">
        <Checkbox
          id={id}
          className="mt-0.5"
          checked={checked}
          aria-invalid={missing ? true : undefined}
          aria-describedby={missing ? `${id}-required` : undefined}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <Label htmlFor={id} className="block leading-snug font-normal">
          {children}
        </Label>
      </div>
      {missing ? (
        <p
          id={`${id}-required`}
          role="alert"
          className="text-destructive text-sm"
        >
          {missing}
        </p>
      ) : null}
    </div>
  )
}
