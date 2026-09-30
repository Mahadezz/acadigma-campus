"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  upsertWorkingDayOverrideInputSchema,
  type WorkingDayOverride,
} from "@acadigma/contracts/calendar"
import { Button } from "@acadigma/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acadigma/ui/components/dialog"
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import { deleteWorkingDayOverride, saveWorkingDayOverride } from "./actions"

type T = Messages["settings"]["calendar"]["overrides"]

// The form holds strings; the shared schema runs on submit.
const formSchema = z.object({
  date: z.string(),
  isWorking: z.enum(["yes", "no"]),
  reason: z.string(),
})
type FormValues = z.infer<typeof formSchema>

const EMPTY: FormValues = { date: "", isWorking: "yes", reason: "" }

function fieldMessage(field: string, t: T): string {
  if (field === "reason") return t.errors.reasonRequired
  if (field === "date") return t.errors.invalidDate
  return t.error
}

function codeMessage(code: string, t: T): string {
  switch (code) {
    case "forbidden":
      return t.errors.forbidden
    case "payment_required":
      return t.errors.readOnly
    case "not_found":
      return t.errors.notFound
    default:
      return t.error
  }
}

/**
 * F-AC-11 §4.3: "Override a day" — a make-up Friday or a closure on a
 * working day. One row per date, so saving a date again edits it. A sheet on
 * a phone, a dialog on desktop (FormSheet); removal is confirmed.
 */
export function OverridesManager({
  overrides,
  canWrite,
  today,
  locale,
  t,
}: {
  overrides: WorkingDayOverride[]
  canWrite: boolean
  today: string
  locale: string
  t: T
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState<WorkingDayOverride | null>(null)
  const [notice, setNotice] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  })

  // Western digits in both languages (DESIGN-SYSTEM §1.6).
  const dateFormat = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }
  )
  const formatDate = (d: string) =>
    dateFormat.format(new Date(`${d}T00:00:00Z`))

  function open(values: FormValues) {
    setNotice(null)
    form.reset(values)
    setEditing(true)
  }

  function close() {
    setEditing(false)
    form.reset(EMPTY)
  }

  function onSubmit(values: FormValues) {
    const local = upsertWorkingDayOverrideInputSchema.safeParse({
      date: values.date,
      isWorking: values.isWorking === "yes",
      reason: values.reason,
    })
    if (!local.success) {
      for (const issue of local.error.issues) {
        const field = String(issue.path[0])
        if (Object.hasOwn(EMPTY, field)) {
          form.setError(field as keyof FormValues, {
            message: fieldMessage(field, t),
          })
        }
      }
      return
    }
    startTransition(async () => {
      const result = await saveWorkingDayOverride(local.data)
      if (result.ok) {
        close()
        setNotice({ tone: "success", text: t.saved })
        router.refresh()
        return
      }
      form.setError("root", { message: codeMessage(result.error.code, t) })
    })
  }

  function confirmRemove() {
    if (!removing) return
    const target = removing
    startTransition(async () => {
      const result = await deleteWorkingDayOverride({ date: target.date })
      setRemoving(null)
      setNotice(
        result.ok
          ? { tone: "success", text: t.removed }
          : { tone: "error", text: codeMessage(result.error.code, t) }
      )
      if (result.ok) router.refresh()
    })
  }

  return (
    <section className="space-y-4" aria-labelledby="overrides-heading">
      <div>
        <h2 id="overrides-heading" className="text-lg font-semibold">
          {t.title}
        </h2>
        <p className="text-muted-foreground text-sm">{t.description}</p>
      </div>

      {notice ? (
        <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
      ) : null}

      {canWrite ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => open(EMPTY)}
        >
          <PlusIcon aria-hidden />
          {t.add}
        </Button>
      ) : null}

      {overrides.length === 0 ? (
        <EmptyState title={t.empty} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {overrides.map((o) => (
            <li
              key={o.id}
              className="flex min-h-14 items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={
                    o.date < today
                      ? "text-muted-foreground font-medium"
                      : "font-medium"
                  }
                >
                  {formatDate(o.date)} · {o.isWorking ? t.working : t.closed}
                </p>
                <p className="text-muted-foreground text-sm break-words">
                  {o.reason}
                </p>
              </div>
              {canWrite ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 shrink-0"
                    onClick={() =>
                      open({
                        date: o.date,
                        isWorking: o.isWorking ? "yes" : "no",
                        reason: o.reason,
                      })
                    }
                    aria-label={`${t.edit}: ${formatDate(o.date)}`}
                  >
                    {t.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 shrink-0"
                    onClick={() => setRemoving(o)}
                    aria-label={`${t.delete}: ${formatDate(o.date)}`}
                  >
                    {t.delete}
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <FormSheet
        open={editing}
        onOpenChange={(next) => (next ? setEditing(true) : close())}
        title={t.addTitle}
        description={t.addDescription}
        isDirty={form.formState.isDirty}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={close}
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              form="override-form"
              disabled={pending}
              className="min-h-11"
            >
              {pending ? t.saving : t.save}
            </Button>
          </>
        }
      >
        <Form {...form}>
          <form
            id="override-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {form.formState.errors.root ? (
              <InlineAlert tone="error">
                {form.formState.errors.root.message}
              </InlineAlert>
            ) : null}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.date}</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" className="min-h-11" />
                  </FormControl>
                  <FormDescription>{t.dateHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isWorking"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.kind}</FormLabel>
                  <FormControl>
                    <NativeSelect {...field} className="min-h-11">
                      <NativeSelectOption value="yes">
                        {t.kindWorking}
                      </NativeSelectOption>
                      <NativeSelectOption value="no">
                        {t.kindClosed}
                      </NativeSelectOption>
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.reason}</FormLabel>
                  <FormControl>
                    <Input {...field} className="min-h-11" maxLength={300} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </FormSheet>

      <Dialog
        open={removing !== null}
        onOpenChange={(next) => (next ? null : setRemoving(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.deleteTitle}</DialogTitle>
            <DialogDescription>
              {t.deleteDescription.replace("{date}", () =>
                removing ? formatDate(removing.date) : ""
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setRemoving(null)}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              onClick={confirmRemove}
            >
              {pending ? t.deleting : t.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
