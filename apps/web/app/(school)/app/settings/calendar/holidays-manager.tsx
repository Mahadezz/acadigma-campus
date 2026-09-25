"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import {
  createHolidayInputSchema,
  holidayKindSchema,
  type Holiday,
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

import { createHoliday, deleteHoliday } from "./actions"

type T = Messages["settings"]["calendar"]

// The form holds strings; blanks become null before the shared schema runs.
const formSchema = z.object({
  name: z.string(),
  nameBn: z.string(),
  kind: holidayKindSchema,
  startsOn: z.string(),
  endsOn: z.string(),
  note: z.string(),
})
type FormValues = z.infer<typeof formSchema>

const EMPTY: FormValues = {
  name: "",
  nameBn: "",
  kind: "school",
  startsOn: "",
  endsOn: "",
  note: "",
}

function dayCount(h: Pick<Holiday, "startsOn" | "endsOn">): number {
  const ms =
    Date.parse(`${h.endsOn}T00:00:00Z`) - Date.parse(`${h.startsOn}T00:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
}

/**
 * F-AC-11 Part 1 (D-202): the holiday list, the add sheet (a sheet on a
 * phone, a dialog on desktop — FormSheet) and a confirmed remove.
 */
export function HolidaysManager({
  holidays,
  canWrite,
  today,
  locale,
  t,
}: {
  holidays: Holiday[]
  canWrite: boolean
  today: string
  locale: string
  t: T
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Holiday | null>(null)
  const [notice, setNotice] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)
  const [pending, startTransition] = useTransition()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY,
  })

  const dateFormat = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
  )
  const formatDate = (d: string) =>
    dateFormat.format(new Date(`${d}T00:00:00Z`))
  const formatRange = (h: Holiday) =>
    h.startsOn === h.endsOn
      ? formatDate(h.startsOn)
      : `${formatDate(h.startsOn)} – ${formatDate(h.endsOn)}`

  function onSubmit(values: FormValues) {
    const input = {
      name: values.name,
      nameBn: values.nameBn.trim() || null,
      kind: values.kind,
      startsOn: values.startsOn,
      endsOn: values.endsOn || values.startsOn,
      note: values.note.trim() || null,
    }
    const local = createHolidayInputSchema.safeParse(input)
    if (!local.success) {
      for (const issue of local.error.issues) {
        form.setError(issue.path[0] as keyof FormValues, {
          message: issue.message,
        })
      }
      return
    }
    startTransition(async () => {
      const result = await createHoliday(local.data)
      if (result.ok) {
        setAdding(false)
        form.reset(EMPTY)
        setNotice({ tone: "success", text: t.saved })
        router.refresh()
        return
      }
      for (const [path, messages] of Object.entries(
        result.error.fieldErrors ?? {}
      )) {
        if (Object.hasOwn(EMPTY, path)) {
          form.setError(path as keyof FormValues, { message: messages[0] })
        }
      }
      form.setError("root", { message: result.error.message || t.error })
    })
  }

  function confirmRemove() {
    if (!removing) return
    const target = removing
    startTransition(async () => {
      const result = await deleteHoliday({ holidayId: target.id })
      setRemoving(null)
      setNotice(
        result.ok
          ? { tone: "success", text: t.removed }
          : { tone: "error", text: result.error.message || t.error }
      )
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
      ) : null}

      {canWrite ? (
        <Button
          type="button"
          onClick={() => {
            setNotice(null)
            setAdding(true)
          }}
          className="min-h-11"
        >
          <PlusIcon aria-hidden />
          {t.add}
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">{t.readOnlyNote}</p>
      )}

      {holidays.length === 0 ? (
        <EmptyState title={t.empty} />
      ) : (
        <ul className="divide-y rounded-lg border">
          {holidays.map((h) => {
            const n = dayCount(h)
            const past = h.endsOn < today
            const name = locale === "bn" && h.nameBn ? h.nameBn : h.name
            return (
              <li
                key={h.id}
                className="flex min-h-14 items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      past ? "text-muted-foreground font-medium" : "font-medium"
                    }
                  >
                    {name}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatRange(h)} ·{" "}
                    {n === 1 ? t.day : t.days.replace("{n}", String(n))} ·{" "}
                    {t.kinds[h.kind]}
                    {past ? ` · ${t.past}` : ""}
                  </p>
                </div>
                {canWrite ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 shrink-0"
                    onClick={() => setRemoving(h)}
                    aria-label={`${t.delete}: ${name}`}
                  >
                    {t.delete}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <FormSheet
        open={adding}
        onOpenChange={(open) => {
          setAdding(open)
          if (!open) form.reset(EMPTY)
        }}
        title={t.addTitle}
        description={t.addDescription}
        isDirty={form.formState.isDirty}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => {
                setAdding(false)
                form.reset(EMPTY)
              }}
            >
              {t.cancel}
            </Button>
            <Button
              type="submit"
              form="holiday-form"
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
            id="holiday-form"
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.name}</FormLabel>
                  <FormControl>
                    <Input {...field} className="min-h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nameBn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.nameBn}</FormLabel>
                  <FormControl>
                    <Input {...field} lang="bn" className="min-h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.kind}</FormLabel>
                  <FormControl>
                    <NativeSelect {...field} className="min-h-11">
                      {holidayKindSchema.options.map((kind) => (
                        <NativeSelectOption key={kind} value={kind}>
                          {t.kinds[kind]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startsOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.startsOn}</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className="min-h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endsOn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.endsOn}</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className="min-h-11" />
                    </FormControl>
                    <FormDescription>{t.endsOnHelp}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.note}</FormLabel>
                  <FormControl>
                    <Input {...field} className="min-h-11" />
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
        onOpenChange={(open) => (open ? null : setRemoving(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.deleteTitle}</DialogTitle>
            <DialogDescription>
              {t.deleteDescription.replace(
                "{name}",
                () => removing?.name ?? ""
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
    </div>
  )
}
