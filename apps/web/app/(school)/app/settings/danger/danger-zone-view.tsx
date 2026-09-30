"use client"

import { useState, useTransition } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { ChevronLeftIcon } from "lucide-react"

import {
  apiErrorSchema,
  DANGER_ERROR,
  type ApiError,
  type Result,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import {
  archiveSchool,
  cancelSchoolDeletion,
  scheduleSchoolDeletion,
  unarchiveSchool,
} from "./actions"

type T = Messages["dangerZone"]
type Mode = "archive" | "unarchive" | "delete"
type Notice = { tone: "success" | "error"; text: string } | null

/** Same rule as the database: letters matter, case and runs of spaces do not. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase()
  return norm(a) === norm(b)
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) =>
    Object.hasOwn(values, key) ? (values[key] ?? "") : m
  )
}

function errorText(t: T, error: ApiError): string {
  const marker = error.fieldErrors?._root?.[0]
  if (marker && Object.hasOwn(DANGER_ERROR, marker)) {
    // The billing blockers carry the subscription's name in the message.
    if (
      marker === DANGER_ERROR.ACTIVE_SUBSCRIPTION ||
      marker === DANGER_ERROR.UNPAID_BALANCE
    ) {
      return error.message
    }
    return t.errors[marker as keyof typeof DANGER_ERROR]
  }
  return error.code === "forbidden" ? t.errors.forbidden : t.errors.generic
}

export function DangerZoneView({
  t,
  schoolName,
  archived,
  archivedOn,
  deletionOn,
}: {
  t: T
  schoolName: string
  archived: boolean
  archivedOn: string | null
  deletionOn: string | null
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [pending, startTransition] = useTransition()

  function run(
    action: () => Promise<Result<unknown, ApiError>>,
    success: string
  ) {
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        setMode(null)
        setNotice({ tone: "success", text: success })
        router.refresh()
      } else {
        setNotice({ tone: "error", text: errorText(t, result.error) })
      }
    })
  }

  async function downloadExport() {
    setNotice({ tone: "success", text: t.export.working })
    try {
      const response = await fetch("/api/settings/export")
      if (!response.ok) {
        const error = apiErrorSchema.safeParse(
          await response.json().catch(() => null)
        )
        setNotice({
          tone: "error",
          text: error.success ? errorText(t, error.data) : t.errors.generic,
        })
        return
      }
      const url = URL.createObjectURL(await response.blob())
      const a = document.createElement("a")
      a.href = url
      a.download =
        /filename="([^"]+)"/.exec(
          response.headers.get("content-disposition") ?? ""
        )?.[1] ?? "acadigma-export.zip"
      a.click()
      URL.revokeObjectURL(url)
      setNotice({ tone: "success", text: t.export.done })
    } catch {
      setNotice({ tone: "error", text: t.errors.generic })
    }
  }

  const alert = notice ? (
    <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
  ) : null

  if (mode) {
    const copy = t[mode]
    return (
      <ConfirmByName
        t={t}
        title={fill(copy.confirmTitle, { school: schoolName })}
        consequences={copy.consequences}
        confirmLabel={copy.confirm}
        schoolName={schoolName}
        pending={pending}
        alert={alert}
        onBack={() => {
          setMode(null)
          setNotice(null)
        }}
        onConfirm={(confirmName) =>
          run(
            () =>
              mode === "archive"
                ? archiveSchool({ confirmName })
                : mode === "unarchive"
                  ? unarchiveSchool({ confirmName })
                  : scheduleSchoolDeletion({ confirmName }),
            mode === "delete" ? t.scheduled.title : t[mode].done
          )
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite">{alert}</div>

      {deletionOn ? (
        <section className="border-destructive/40 space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">{t.scheduled.title}</h3>
          <p className="text-sm">
            {fill(t.scheduled.body, { date: deletionOn })}
          </p>
          <Button
            className="min-h-11 w-full sm:w-auto"
            disabled={pending}
            onClick={() =>
              run(() => cancelSchoolDeletion(), t.scheduled.cancelled)
            }
          >
            {t.scheduled.cancel}
          </Button>
        </section>
      ) : null}

      <ul className="divide-y rounded-lg border">
        <Row title={t.export.title} body={t.export.body}>
          <Button
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending}
            onClick={() => void downloadExport()}
          >
            {t.export.action}
          </Button>
        </Row>
        <Row title={t.transfer.title} body={t.transfer.body}>
          <Button
            asChild
            variant="outline"
            className="min-h-11 w-full sm:w-auto"
          >
            <Link href="/app/settings/membership">{t.transfer.action}</Link>
          </Button>
        </Row>
      </ul>

      <ul className="border-destructive/40 divide-y rounded-lg border">
        {archived ? (
          <Row
            title={t.unarchive.title}
            body={fill(t.unarchive.body, { date: archivedOn ?? "" })}
          >
            <Button
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => setMode("unarchive")}
            >
              {t.unarchive.action}
            </Button>
          </Row>
        ) : (
          <Row title={t.archive.title} body={t.archive.body}>
            <Button
              variant="outline"
              className="text-destructive min-h-11 w-full sm:w-auto"
              onClick={() => setMode("archive")}
            >
              {t.archive.action}
            </Button>
          </Row>
        )}
        {deletionOn ? null : (
          <Row title={t.delete.title} body={t.delete.body}>
            <Button
              variant="destructive"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => setMode("delete")}
            >
              {t.delete.action}
            </Button>
          </Row>
        )}
      </ul>
    </div>
  )
}

function Row({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  )
}

/**
 * The second deliberate step (§4 W9): the consequences are read before the
 * input, and the button stays disabled until the typed name matches. The
 * server checks the name again.
 */
function ConfirmByName({
  t,
  title,
  consequences,
  confirmLabel,
  schoolName,
  pending,
  alert,
  onBack,
  onConfirm,
}: {
  t: T
  title: string
  consequences: string[]
  confirmLabel: string
  schoolName: string
  pending: boolean
  alert: React.ReactNode
  onBack: () => void
  onConfirm: (confirmName: string) => void
}) {
  const [typed, setTyped] = useState("")
  const matches = sameName(typed, schoolName)

  return (
    <form
      className="space-y-4"
      aria-labelledby="danger-confirm-title"
      onSubmit={(event) => {
        event.preventDefault()
        if (matches && !pending) onConfirm(typed)
      }}
    >
      <Button
        type="button"
        variant="ghost"
        className="-ml-2 min-h-11"
        onClick={onBack}
      >
        <ChevronLeftIcon aria-hidden />
        {t.confirm.back}
      </Button>
      <h3 id="danger-confirm-title" className="text-lg font-semibold">
        {title}
      </h3>
      <ul id="danger-consequences" className="list-disc space-y-1 pl-5 text-sm">
        {consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="space-y-2">
        <Label htmlFor="danger-confirm-name">
          {fill(t.confirm.label, { name: schoolName })}
        </Label>
        <Input
          id="danger-confirm-name"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          aria-describedby="danger-consequences"
          className="min-h-11"
        />
      </div>
      <div aria-live="polite">{alert}</div>
      <Button
        type="submit"
        variant="destructive"
        className="min-h-11 w-full"
        disabled={!matches || pending}
      >
        {pending ? t.confirm.working : confirmLabel}
      </Button>
    </form>
  )
}
