"use client"

import { useState, useTransition } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { DownloadIcon, UploadIcon } from "lucide-react"

import {
  STUDENT_IMPORT_COLUMNS,
  type ApiError,
  type ImportReportRow,
  type ImportRowError,
  type StudentImportBatch,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acadigma/ui/components/card"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { commitStudentImport, previewStudentImport } from "./actions"

type T = Messages["students"]["import"]

function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? "")
  )
}

/** A whole-file or import error, in the reader's language. */
export function importErrorText(t: T, error: ApiError): string {
  if (error.code === "payment_required") return t.errors.readOnly
  if (error.code === "conflict") return t.errors.expired
  const code = error.fieldErrors?.file?.[0]
  if (code && Object.hasOwn(t.fileErrors, code)) {
    const columns = (error.fieldErrors?.columns ?? [])
      .map((c) => (Object.hasOwn(t.columns, c) ? t.columns[c as keyof T["columns"]] : c))
      .join(", ")
    return fill(t.fileErrors[code as keyof T["fileErrors"]], { columns })
  }
  return t.errors.generic
}

function rowErrorText(t: T, row: ImportReportRow, e: ImportRowError): string {
  const message = t.rowErrors[e.code]
  if (!e.column) return message
  const typed = row.raw?.[e.column]
  return `${t.columns[e.column]}: ${message}${typed ? ` (“${typed}”)` : ""}`
}

function RowProblems({ t, rows }: { t: T; rows: ImportReportRow[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((row) => (
        <li key={row.line} className="space-y-1 p-3">
          <p className="text-sm font-semibold tabular-nums">
            {fill(t.line, { line: row.line })}
          </p>
          <ul className="list-disc space-y-0.5 ps-5 text-sm">
            {row.errors.map((e, i) => (
              <li key={i}>{rowErrorText(t, row, e)}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

export function ImportView({
  t,
  batch,
  loadFailed,
}: {
  t: T
  batch: StudentImportBatch | null
  loadFailed: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function upload(form: HTMLFormElement) {
    setError(null)
    startTransition(async () => {
      const result = await previewStudentImport(new FormData(form))
      if (!result.ok) return setError(importErrorText(t, result.error))
      router.push(`/app/students/import?batch=${result.data.batchId}`)
    })
  }

  function commit(batchId: string) {
    setError(null)
    startTransition(async () => {
      const result = await commitStudentImport({ batchId })
      if (!result.ok) setError(importErrorText(t, result.error))
      router.refresh()
    })
  }

  const rows = batch?.report.rows ?? []
  const problems = rows.filter((r) => r.status === "error")
  const refused = rows.filter((r) => r.status === "failed")
  const ready = rows.filter((r) => r.status === "valid").length

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground text-sm">{t.lead}</p>
      </div>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {loadFailed ? (
        <InlineAlert tone="error">{t.errors.generic}</InlineAlert>
      ) : null}

      {!batch ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t.step1}</h2>
              </CardTitle>
              <CardDescription>{t.step1Hint}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="h-11">
                <a href="/app/students/import/template" download>
                  <DownloadIcon aria-hidden="true" />
                  {t.template}
                </a>
              </Button>
              <p className="text-muted-foreground mt-3 text-xs break-words">
                {STUDENT_IMPORT_COLUMNS.map((c) => c.en).join(" · ")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{t.step2}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  upload(event.currentTarget)
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="import-file">{t.fileLabel}</Label>
                  <Input
                    id="import-file"
                    name="file"
                    type="file"
                    required
                    accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    aria-describedby="import-file-hint"
                    className="h-11"
                  />
                  <p
                    id="import-file-hint"
                    className="text-muted-foreground text-sm"
                  >
                    {t.fileHint}
                  </p>
                </div>
                <Button type="submit" className="h-11" disabled={pending}>
                  <UploadIcon aria-hidden="true" />
                  {pending ? t.checking : t.check}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      ) : batch.status === "completed" ? (
        <div className="space-y-4">
          <InlineAlert tone="success">
            {fill(t.done, { count: batch.createdCount })}
          </InlineAlert>
          {refused.length ? (
            <section className="space-y-2">
              <h2 className="font-semibold">{t.failedHeading}</h2>
              <RowProblems t={t} rows={refused} />
            </section>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-11">
              <Link href="/app/students">{t.viewStudents}</Link>
            </Button>
            <Button asChild variant="outline" className="h-11">
              <Link href="/app/students/import">{t.another}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="space-y-1">
            <h2 className="font-semibold">{t.previewHeading}</h2>
            <p className="text-sm tabular-nums" data-testid="import-summary">
              {batch.filename} ·{" "}
              {fill(t.summary, {
                total: batch.totalRows,
                valid: batch.validRows,
                errors: batch.errorRows,
              })}
            </p>
          </section>
          {batch.report.ignoredColumns.length ? (
            <InlineAlert tone="info">
              {fill(t.ignoredColumns, {
                columns: batch.report.ignoredColumns.join(", "),
              })}
            </InlineAlert>
          ) : null}
          {problems.length ? (
            <section className="space-y-2">
              <h2 className="font-semibold">{t.problemsHeading}</h2>
              <p className="text-muted-foreground text-sm">{t.problemsHint}</p>
              <RowProblems t={t} rows={problems} />
            </section>
          ) : null}
          {refused.length ? (
            <section className="space-y-2">
              <h2 className="font-semibold">{t.failedHeading}</h2>
              <RowProblems t={t} rows={refused} />
            </section>
          ) : null}
          {ready === 0 ? (
            <InlineAlert tone="info">{t.nothingValid}</InlineAlert>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            {ready > 0 ? (
              <Button
                type="button"
                className="h-11"
                disabled={pending}
                onClick={() => commit(batch.id)}
              >
                {pending ? t.importing : fill(t.importButton, { count: ready })}
              </Button>
            ) : null}
            <Button asChild variant="outline" className="h-11">
              <Link href="/app/students/import">{t.another}</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
