"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { useForm, type FieldPath } from "react-hook-form"

import {
  schoolBoardSchema,
  schoolMediumSchema,
} from "@acadigma/contracts/identity/school"
import {
  schoolProfileFieldsSchema,
  schoolProfilePatchSchema,
  schoolTypeSchema,
  type SchoolProfileFields,
} from "@acadigma/contracts/settings"
import type { SchoolProfile } from "@acadigma/db/repositories/settings"
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

import type { Messages } from "@/lib/i18n"

import { updateSchoolProfile } from "../profile-actions"
import { SaveNotice, type Notice } from "../save-notice"
import { StickySaveBar } from "../sticky-save-bar"

type FieldKey = keyof SchoolProfileFields
type FormValues = Record<FieldKey, string>

const SECTIONS: {
  key: "identity" | "address" | "contact" | "finance"
  fields: FieldKey[]
}[] = [
  {
    key: "identity",
    fields: ["legal_name", "eiin", "board", "medium", "school_type", "motto"],
  },
  {
    key: "address",
    fields: [
      "address_line1",
      "address_line2",
      "city",
      "district",
      "postal_code",
    ],
  },
  { key: "contact", fields: ["contact_phone", "contact_email", "website"] },
  { key: "finance", fields: ["bin_number", "vat_number"] },
]

const INPUT_TYPES: Partial<Record<FieldKey, string>> = {
  contact_email: "email",
  contact_phone: "tel",
  website: "url",
}

/** A stored value the select does not know (the legacy "BD National" default) shows as unset. */
function known(options: readonly string[], value: string | null): string {
  return value && options.includes(value) ? value : ""
}

function toFormValues(fields: SchoolProfile["fields"]): FormValues {
  const values = {} as FormValues
  for (const key of Object.keys(
    schoolProfileFieldsSchema.shape
  ) as FieldKey[]) {
    values[key] = fields[key] ?? ""
  }
  values.board = known(schoolBoardSchema.options, fields.board)
  values.medium = known(schoolMediumSchema.options, fields.medium)
  values.school_type = known(schoolTypeSchema.options, fields.school_type)
  return values
}

/** F-OP-07 §4 W2 step 1 — the profile form. Sends only the changed fields. */
export function ProfileForm({
  profile,
  t,
  wizard,
}: {
  profile: SchoolProfile
  t: Messages["settings"]
  wizard: Messages["onboarding"]["wizard"]
}) {
  const router = useRouter()
  const [version, setVersion] = useState(profile.version)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pending, startTransition] = useTransition()
  const form = useForm<FormValues>({
    defaultValues: toFormValues(profile.fields),
  })
  const p = t.profile

  function onSubmit(values: FormValues) {
    // An emptied optional field is saved as null, never as "".
    const patch: Record<string, string | null> = {}
    for (const key of Object.keys(form.formState.dirtyFields) as FieldKey[]) {
      patch[key] = values[key].trim() === "" ? null : values[key]
    }
    // City is required (NOT NULL column): say so in the reader's language
    // instead of letting a null reach Zod's generic type error.
    if (patch["city"] === null) {
      form.setError("city", { message: p.cityRequired })
      return
    }
    const local = schoolProfilePatchSchema.safeParse(patch)
    if (!local.success) {
      for (const issue of local.error.issues) {
        form.setError(issue.path[0] as FieldPath<FormValues>, {
          message: issue.message,
        })
      }
      return
    }
    startTransition(async () => {
      const result = await updateSchoolProfile({
        version,
        profile: local.data,
      })
      if (result.ok) {
        setVersion(result.data.version)
        form.reset(toFormValues(result.data.fields))
        setNotice({ tone: "success", text: t.saved })
        router.refresh()
        return
      }
      for (const [path, messages] of Object.entries(
        result.error.fieldErrors ?? {}
      )) {
        const field = path.replace(/^profile\./, "")
        if (Object.hasOwn(values, field)) {
          form.setError(field as FieldPath<FormValues>, {
            message: messages[0],
          })
        }
      }
      setNotice({
        tone: "error",
        text: result.error.message || t.saveError,
        stale: result.error.code === "conflict" && !result.error.fieldErrors,
      })
    })
  }

  function renderControl(key: FieldKey) {
    const selectOptions =
      key === "board"
        ? schoolBoardSchema.options.map((o) => [o, wizard.boards[o]] as const)
        : key === "medium"
          ? schoolMediumSchema.options.map(
              (o) => [o, wizard.mediums[o]] as const
            )
          : key === "school_type"
            ? schoolTypeSchema.options.map(
                (o) => [o, p.schoolTypes[o]] as const
              )
            : null
    const placeholder =
      key === "board"
        ? p.boardPlaceholder
        : key === "medium"
          ? p.mediumPlaceholder
          : p.schoolTypePlaceholder
    const description =
      key === "eiin" ? p.eiinHelp : key === "city" ? p.cityDefault : null

    return (
      <FormField
        key={key}
        control={form.control}
        name={key}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{p.fields[key]}</FormLabel>
            {selectOptions ? (
              // Native select (shadcn native-select): the phone's own picker,
              // and ~30 kB lighter than Radix Select on this route's budget.
              <FormControl>
                <NativeSelect {...field} className="min-h-11">
                  <NativeSelectOption value="" disabled>
                    {placeholder}
                  </NativeSelectOption>
                  {selectOptions.map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormControl>
            ) : (
              <FormControl>
                <Input
                  {...field}
                  type={INPUT_TYPES[key] ?? "text"}
                  inputMode={key === "eiin" ? "numeric" : undefined}
                  // D-100: the EIIN is set at school creation; support changes it.
                  readOnly={key === "eiin"}
                  className="min-h-11"
                />
              </FormControl>
            )}
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
        {SECTIONS.map((section) => (
          <fieldset key={section.key} className="space-y-4">
            <legend className="mb-2 text-sm font-semibold">
              {p[section.key]}
            </legend>
            <div className="grid gap-4 lg:grid-cols-2">
              {section.fields.map(renderControl)}
            </div>
          </fieldset>
        ))}
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
