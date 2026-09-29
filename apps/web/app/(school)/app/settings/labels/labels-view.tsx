"use client"

import { useState, useTransition } from "react"

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"

import {
  MEMBER_ERROR,
  type ApiError,
  type AssignableRole,
  type CustomLabel,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import {
  createCustomLabel,
  deleteCustomLabel,
  updateCustomLabel,
} from "./actions"

type T = Messages["labels"]

const ROLES: readonly AssignableRole[] = ["admin", "teacher", "staff"]
const DEFAULT_COLOR = "#3B82F6"

function errorText(t: T, error: ApiError): string {
  const marker = error.fieldErrors?._root?.[0]
  if (marker === MEMBER_ERROR.LABEL_NAME_TAKEN) return t.errors.nameTaken
  if (error.code === "payment_required") return t.errors.readOnly
  if (error.code === "forbidden") return t.errors.forbidden
  if (error.code === "not_found") return t.errors.notFound
  if (error.code === "validation_failed") return t.errors.validation
  return t.errors.generic
}

type Sheet =
  | { kind: "create" }
  | { kind: "edit"; label: CustomLabel }
  | { kind: "delete"; label: CustomLabel }
  | null

export function LabelsView({ t, labels }: { t: T; labels: CustomLabel[] }) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)

  function run(
    action: () => Promise<{ ok: boolean; error?: ApiError }>,
    success: string
  ) {
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        setSheet(null)
        setNotice({ tone: "success", text: success })
      } else if (result.error) {
        setNotice({ tone: "error", text: errorText(t, result.error) })
      }
    })
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite">
        {notice ? (
          <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
        ) : null}
      </div>

      <p className="text-muted-foreground text-sm">{t.notPermissions}</p>

      <Button
        type="button"
        className="h-11 w-full sm:w-auto"
        onClick={() => setSheet({ kind: "create" })}
      >
        <PlusIcon aria-hidden="true" />
        {t.add}
      </Button>

      {labels.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyDescription} />
      ) : (
        <ul className="divide-border divide-y rounded-lg border" role="list">
          {labels.map((label) => (
            <li key={label.id} className="flex items-center gap-3 p-3">
              <span
                aria-hidden="true"
                className="size-4 shrink-0 rounded-full border"
                style={{ backgroundColor: label.color }}
              />
              <span className="flex-1">
                <span className="font-medium">{label.name}</span>
                <span className="text-muted-foreground block text-xs">
                  {t.overRole.replace("{role}", t.roles[label.baseRole])}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={t.editLabel.replace("{name}", label.name)}
                onClick={() => setSheet({ kind: "edit", label })}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={t.deleteLabelAria.replace("{name}", label.name)}
                onClick={() => setSheet({ kind: "delete", label })}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {sheet?.kind === "create" || sheet?.kind === "edit" ? (
        <LabelFormSheet
          t={t}
          pending={pending}
          label={sheet.kind === "edit" ? sheet.label : null}
          onClose={() => setSheet(null)}
          onSubmit={(values) => {
            if (sheet.kind === "edit") {
              run(
                () => updateCustomLabel({ id: sheet.label.id, ...values }),
                t.updated.replace("{name}", values.name)
              )
            } else {
              run(
                () => createCustomLabel(values),
                t.created.replace("{name}", values.name)
              )
            }
          }}
        />
      ) : null}

      {sheet?.kind === "delete" ? (
        <FormSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet(null)
          }}
          title={t.deleteTitle}
          description={t.deleteConfirm.replace("{name}", sheet.label.name)}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setSheet(null)}
              >
                {t.cancel}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="h-11"
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteCustomLabel({ id: sheet.label.id }),
                    t.deleted.replace("{name}", sheet.label.name)
                  )
                }
              >
                {t.delete}
              </Button>
            </>
          }
        >
          <span className="sr-only">{sheet.label.name}</span>
        </FormSheet>
      ) : null}
    </div>
  )
}

function LabelFormSheet({
  t,
  label,
  pending,
  onClose,
  onSubmit,
}: {
  t: T
  label: CustomLabel | null
  pending: boolean
  onClose: () => void
  onSubmit: (values: {
    name: string
    baseRole: AssignableRole
    color: string
  }) => void
}) {
  const [name, setName] = useState(label?.name ?? "")
  const [baseRole, setBaseRole] = useState<AssignableRole>(
    label?.baseRole ?? "admin"
  )
  const [color, setColor] = useState(label?.color ?? DEFAULT_COLOR)

  const formId = "label-form"
  return (
    <FormSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={label ? t.editTitle : t.addTitle}
      description={t.notPermissions}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={onClose}
          >
            {t.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            className="h-11"
            disabled={pending}
          >
            {t.save}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4 py-2"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({ name: name.trim(), baseRole, color })
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="label-name">{t.nameLabel}</Label>
          <Input
            id="label-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
            className="h-11"
            placeholder={t.namePlaceholder}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="label-role">{t.baseRole}</Label>
          <NativeSelect
            id="label-role"
            className="h-11"
            value={baseRole}
            onChange={(event) =>
              setBaseRole(event.target.value as AssignableRole)
            }
          >
            {ROLES.map((role) => (
              <NativeSelectOption key={role} value={role}>
                {t.roles[role]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-muted-foreground text-xs">{t.baseRoleHelp}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="label-color">{t.color}</Label>
          <input
            id="label-color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="border-input h-11 w-16 cursor-pointer rounded-md border bg-transparent p-1"
          />
        </div>
      </form>
    </FormSheet>
  )
}
