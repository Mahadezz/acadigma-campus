"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import {
  MEMBER_ERROR,
  type ApiError,
  type OwnershipCandidate,
} from "@acadigma/contracts"
import type { WorkspaceRole } from "@acadigma/domain/permissions"
import { roleChangeDelta } from "@acadigma/domain/workspace"
import { Button } from "@acadigma/ui/components/button"
import { Checkbox } from "@acadigma/ui/components/checkbox"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { PasswordField } from "@acadigma/ui/primitives/password-field"

import type { Messages } from "@/lib/i18n"

import { leaveWorkspace, transferOwnership } from "./actions"

type T = Messages["settings"]["membership"]
type Notice = { tone: "success" | "error"; text: string }

function errorText(t: T, error: ApiError): string {
  const marker = error.fieldErrors?._root?.[0]
  if (marker === MEMBER_ERROR.LAST_OWNER_BLOCKED) return t.errors.lastOwner
  if (marker === MEMBER_ERROR.TARGET_NOT_ELIGIBLE) return t.errors.notEligible
  if (marker === MEMBER_ERROR.REAUTH_FAILED) return t.errors.password
  if (marker === MEMBER_ERROR.CONFIRM_NAME_MISMATCH) return t.errors.name
  // The server already localised the throttle message (retry-after).
  if (error.code === "rate_limited") return error.message
  if (error.code === "payment_required") return t.errors.readOnly
  if (error.code === "forbidden") return t.errors.forbidden
  return t.errors.generic
}

export function MembershipView({
  t,
  roles,
  capabilities,
  role,
  schoolName,
  candidates,
  candidatesFailed,
}: {
  t: T
  roles: Messages["team"]["roles"]
  capabilities: Messages["team"]["manage"]["capabilities"]
  role: WorkspaceRole
  schoolName: string
  candidates: OwnershipCandidate[] | null
  candidatesFailed: boolean
}) {
  const school = (text: string) => text.replaceAll("{school}", schoolName)
  // Held here, not in TransferSection: a transfer that makes the caller an
  // admin removes that section on the refresh, and the confirmation with it.
  const [done, setDone] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      <div aria-live="polite">
        {done ? <InlineAlert tone="success">{done}</InlineAlert> : null}
      </div>
      <p className="text-sm">
        {school(t.yourRole).replace("{role}", roles[role].toLowerCase())}
      </p>
      {candidates !== null || candidatesFailed ? (
        <TransferSection
          t={t}
          capabilities={capabilities}
          schoolName={schoolName}
          candidates={candidates ?? []}
          failed={candidatesFailed}
          onDone={setDone}
        />
      ) : null}
      <LeaveSection t={t} schoolName={schoolName} />
    </div>
  )
}

function LeaveSection({ t, schoolName }: { t: T; schoolName: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<Notice | null>(null)
  const school = (text: string) => text.replaceAll("{school}", schoolName)

  function leave() {
    setNotice(null)
    startTransition(async () => {
      const result = await leaveWorkspace()
      if (result.ok) {
        // A full navigation: every cached query belonged to this school.
        window.location.assign(result.data.landingRoute)
      } else {
        setNotice({ tone: "error", text: errorText(t, result.error) })
        setConfirming(false)
      }
    })
  }

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{t.leave.title}</h3>
      <p className="text-muted-foreground text-sm">{school(t.leave.lead)}</p>
      <div aria-live="polite">
        {notice ? (
          <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
        ) : null}
      </div>
      {confirming ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="destructive"
            className="h-11"
            disabled={pending}
            onClick={leave}
          >
            {school(t.leave.confirm)}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            {t.leave.cancel}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="text-destructive h-11"
          onClick={() => setConfirming(true)}
        >
          {school(t.leave.start)}
        </Button>
      )}
    </section>
  )
}

function TransferSection({
  t,
  capabilities,
  schoolName,
  candidates,
  failed,
  onDone,
}: {
  t: T
  capabilities: Messages["team"]["manage"]["capabilities"]
  schoolName: string
  candidates: OwnershipCandidate[]
  failed: boolean
  onDone: (text: string) => void
}) {
  const router = useRouter()
  const [memberId, setMemberId] = useState("")
  const [keepOwner, setKeepOwner] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmName, setConfirmName] = useState("")
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<Notice | null>(null)
  const target = candidates.find((c) => c.id === memberId)
  const lost = roleChangeDelta("owner", "admin").lost

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!target) return
    setNotice(null)
    startTransition(async () => {
      const result = await transferOwnership({
        memberId,
        keepOwner,
        currentPassword: password,
        confirmName,
      })
      setPassword("")
      if (result.ok) {
        onDone(
          t.transfer.done
            .replace("{name}", target.fullName)
            .replaceAll("{school}", schoolName)
        )
        setMemberId("")
        setConfirmName("")
        router.refresh()
      } else {
        setNotice({ tone: "error", text: errorText(t, result.error) })
      }
    })
  }

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{t.transfer.title}</h3>
      <p className="text-muted-foreground text-sm">{t.transfer.lead}</p>
      <div aria-live="polite">
        {notice ? (
          <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
        ) : null}
      </div>
      {failed ? (
        <InlineAlert tone="error">{t.errors.generic}</InlineAlert>
      ) : candidates.length === 0 ? (
        <p className="text-sm">{t.transfer.noCandidates}</p>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="transfer-to">{t.transfer.to}</Label>
            <NativeSelect
              id="transfer-to"
              className="h-11"
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              required
            >
              <NativeSelectOption value="">
                {t.transfer.choose}
              </NativeSelectOption>
              {candidates.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.fullName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="flex min-h-11 items-center gap-3">
            <Checkbox
              id="transfer-keep"
              checked={keepOwner}
              onCheckedChange={(value) => setKeepOwner(value === true)}
            />
            <Label htmlFor="transfer-keep">{t.transfer.keepOwner}</Label>
          </div>

          {target ? (
            <div className="bg-muted space-y-1 rounded-md p-3 text-sm">
              <p>{t.transfer.targetOwner.replace("{name}", target.fullName)}</p>
              <p>{keepOwner ? t.transfer.stayOwner : t.transfer.becomeAdmin}</p>
              {!keepOwner && lost.length > 0 ? (
                <>
                  <p>{t.transfer.lose}</p>
                  <ul className="text-muted-foreground list-disc pl-5">
                    {lost.map((key) => (
                      <li key={key}>{capabilities[key]}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="transfer-password">{t.transfer.password}</Label>
            <PasswordField
              id="transfer-password"
              autoComplete="current-password"
              className="h-11"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <p className="text-muted-foreground text-xs">
              {t.transfer.passwordHelp}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer-name">
              {t.transfer.confirmName.replaceAll("{school}", schoolName)}
            </Label>
            <Input
              id="transfer-name"
              className="h-11"
              autoComplete="off"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            className="h-11 w-full sm:w-auto"
            disabled={pending || !target}
          >
            {t.transfer.submit}
          </Button>
        </form>
      )}
    </section>
  )
}
