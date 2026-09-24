"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { useForm, type FieldPath } from "react-hook-form"

import { updateBrandingInputSchema } from "@acadigma/contracts"
import {
  renderHeaderLine,
  unknownHeaderTokens,
  type HeaderValues,
} from "@acadigma/domain/settings"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@acadigma/ui/components/form"
import { Input } from "@acadigma/ui/components/input"
import { Textarea } from "@acadigma/ui/components/textarea"

import type { Messages } from "@/lib/i18n"

import { updateBranding } from "../actions"
import { SaveNotice, type Notice } from "../save-notice"
import { StickySaveBar } from "../sticky-save-bar"

import type { SchoolProfile } from "@acadigma/db/repositories/settings"

const KEYS = [
  "header_line_1",
  "header_line_2",
  "accent",
  "report_footer",
] as const
type Key = (typeof KEYS)[number]
type FormValues = Record<Key, string>

function toFormValues(branding: SchoolProfile["branding"]): FormValues {
  return {
    header_line_1: branding.header_line_1 ?? "",
    header_line_2: branding.header_line_2 ?? "",
    accent: branding.accent ?? "",
    report_footer: branding.report_footer ?? "",
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")
}

/**
 * F-OP-07 §4 W2 step 2 — branding with a live report-card header preview.
 * The preview renders through the same pure `renderHeaderLine` a PDF renderer
 * will use (F-OP-03), so what you see is what prints. Logo upload is deferred
 * (D-200); the preview shows the school's initials in its place.
 */
export function BrandingForm({
  profile,
  t,
}: {
  profile: SchoolProfile
  t: Messages["settings"]
}) {
  const router = useRouter()
  const [version, setVersion] = useState(profile.version)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, startTransition] = useTransition()
  const form = useForm<FormValues>({
    defaultValues: toFormValues(profile.branding),
  })
  const b = t.branding
  const values = form.watch()
  const tokenValues: HeaderValues = profile.fields
  const legalName = profile.fields.legal_name
  const lines = [values.header_line_1, values.header_line_2]
    .map((line) => renderHeaderLine(line, tokenValues))
    .filter(Boolean)
  const unknown = [
    ...new Set([
      ...unknownHeaderTokens(values.header_line_1),
      ...unknownHeaderTokens(values.header_line_2),
    ]),
  ]
  const accent = /^#[0-9A-Fa-f]{6}$/.test(values.accent)
    ? values.accent
    : undefined

  function onSubmit(submitted: FormValues) {
    const branding: Record<string, string | null> = {}
    for (const key of Object.keys(form.formState.dirtyFields) as Key[]) {
      branding[key] = submitted[key].trim() === "" ? null : submitted[key]
    }
    const local = updateBrandingInputSchema.safeParse({ version, branding })
    if (!local.success) {
      for (const issue of local.error.issues) {
        form.setError(issue.path.at(-1) as FieldPath<FormValues>, {
          message: issue.message,
        })
      }
      return
    }
    startTransition(async () => {
      const result = await updateBranding(local.data)
      if (result.ok) {
        setVersion(result.data.version)
        form.reset(toFormValues(result.data.branding))
        setNotice({ tone: "success", text: t.saved })
        router.refresh()
        return
      }
      for (const [path, messages] of Object.entries(
        result.error.fieldErrors ?? {}
      )) {
        const field = path.replace(/^branding\./, "")
        if ((KEYS as readonly string[]).includes(field)) {
          form.setError(field as Key, { message: messages[0] })
        }
      }
      setNotice({
        tone: "error",
        text: result.error.message || t.saveError,
        stale: result.error.code === "conflict",
      })
    })
  }

  function textField(key: Key, description: string | null) {
    return (
      <FormField
        control={form.control}
        name={key}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{b.fields[key]}</FormLabel>
            <FormControl>
              {key === "report_footer" ? (
                <Textarea {...field} rows={2} />
              ) : (
                <Input {...field} className="min-h-11" />
              )}
            </FormControl>
            {description ? (
              <FormDescription>{description}</FormDescription>
            ) : null}
            <FormMessage />
          </FormItem>
        )}
      />
    )
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
        noValidate
      >
        <SaveNotice notice={notice} reloadLabel={t.reload} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            {textField("header_line_1", b.tokensHelp)}
            {textField("header_line_2", null)}
            {textField("accent", b.accentHelp)}
            {textField("report_footer", b.footerDefault)}
          </div>

          <section aria-labelledby="branding-preview" className="space-y-2">
            <h3 id="branding-preview" className="text-sm font-semibold">
              {b.preview}
            </h3>
            <p className="text-muted-foreground text-sm">{b.previewNote}</p>
            <div
              className="bg-card rounded-lg border p-4"
              data-testid="header-preview"
            >
              <div
                className="flex items-center gap-3 border-b-4 pb-3"
                style={accent ? { borderBottomColor: accent } : undefined}
              >
                <div
                  className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
                  aria-hidden
                >
                  {initials(legalName ?? "") || "—"}
                </div>
                <div className="min-w-0 text-center sm:text-left">
                  <p className="font-semibold break-words">
                    {legalName ?? b.legalNameMissing}
                  </p>
                  {lines.map((line, index) => (
                    <p
                      key={index}
                      className="text-muted-foreground text-sm break-words"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              </div>
              {values.report_footer ? (
                <p className="text-muted-foreground pt-3 text-xs break-words">
                  {values.report_footer}
                </p>
              ) : null}
            </div>
            {unknown.length > 0 ? (
              <p className="text-destructive text-sm" role="status">
                {b.unknownTokens.replace(
                  "{tokens}",
                  unknown.map((token) => `{${token}}`).join(", ")
                )}
              </p>
            ) : null}
            <p className="text-muted-foreground text-xs">{b.logoLater}</p>
          </section>
        </div>
        <StickySaveBar
          dirty={form.formState.isDirty}
          pending={pending}
          onDiscard={() => {
            form.reset()
            setNotice(null)
          }}
          t={t}
        />
      </form>
    </Form>
  )
}
