"use client"

import { useEffect, useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import {
  MEMBER_ERROR,
  type ApiError,
  type AssignableRole,
  type CustomLabel,
  type MemberDetail,
  type MemberRow,
} from "@acadigma/contracts"
import { roleChangeDelta } from "@acadigma/domain/workspace"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  NativeSelect,
  NativeSelectOption,
} from "@acadigma/ui/components/native-select"
import { Skeleton } from "@acadigma/ui/components/skeleton"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import type { Messages } from "@/lib/i18n"

import {
  assignMemberLabel,
  changeMemberRole,
  getMemberDetail,
  updateMemberStaffFields,
} from "./actions"

type T = Messages["team"]

const ASSIGNABLE: readonly AssignableRole[] = ["admin", "teacher", "staff"]

function errorText(t: T, error: ApiError): string {
  const marker = error.fieldErrors?._root?.[0]
  if (marker === MEMBER_ERROR.LAST_OWNER_BLOCKED)
    return t.manage.errors.lastOwner
  if (marker === MEMBER_ERROR.FORBIDDEN_OWNER_TARGET) {
    return t.manage.errors.ownerTarget
  }
  if (marker === MEMBER_ERROR.SELF_EDIT_FORBIDDEN)
    return t.manage.errors.selfEdit
  if (marker === MEMBER_ERROR.EMPLOYEE_NO_TAKEN)
    return t.manage.errors.codeTaken
  if (error.code === "payment_required") return t.errors.readOnly
  if (error.code === "forbidden") return t.errors.forbidden
  if (error.code === "not_found") return t.errors.notFound
  return t.errors.generic
}

export function MemberSheet({
  t,
  member,
  labels,
  onClose,
}: {
  t: T
  member: MemberRow
  labels: CustomLabel[]
  onClose: () => void
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<MemberDetail | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)

  useEffect(() => {
    let live = true
    getMemberDetail({ memberId: member.id }).then((result) => {
      if (!live) return
      if (result.ok) setDetail(result.data)
      else setLoadError(true)
    })
    return () => {
      live = false
    }
  }, [member.id])

  function run(
    action: () => Promise<{ ok: boolean; error?: ApiError }>,
    success: string
  ) {
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        setNotice({ tone: "success", text: success })
        const refetch = await getMemberDetail({ memberId: member.id })
        if (refetch.ok) setDetail(refetch.data)
        router.refresh()
      } else if (result.error) {
        setNotice({ tone: "error", text: errorText(t, result.error) })
      }
    })
  }

  const isOwnerTarget = member.role === "owner"

  return (
    <FormSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={member.fullName}
      description={member.email ?? undefined}
    >
      <div className="space-y-6 py-2">
        <div aria-live="polite">
          {notice ? (
            <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
          ) : null}
        </div>

        {loadError ? (
          <InlineAlert tone="error">{t.errors.generic}</InlineAlert>
        ) : detail === null ? (
          <div className="space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : (
          <>
            {isOwnerTarget ? (
              <p className="text-muted-foreground text-sm">
                {t.manage.ownerNote}
              </p>
            ) : (
              <RoleSection t={t} member={member} pending={pending} run={run} />
            )}

            <LabelSection
              t={t}
              detail={detail}
              labels={labels}
              memberId={member.id}
              pending={pending}
              run={run}
            />

            <StaffSection
              t={t}
              detail={detail}
              memberId={member.id}
              pending={pending}
              run={run}
            />
          </>
        )}
      </div>
    </FormSheet>
  )
}

function RoleSection({
  t,
  member,
  pending,
  run,
}: {
  t: T
  member: MemberRow
  pending: boolean
  run: (
    action: () => Promise<{ ok: boolean; error?: ApiError }>,
    success: string
  ) => void
}) {
  const current: AssignableRole = ASSIGNABLE.includes(
    member.role as AssignableRole
  )
    ? (member.role as AssignableRole)
    : "teacher"
  const [role, setRole] = useState<AssignableRole>(current)
  const delta = roleChangeDelta(current, role)
  const changed = role !== current

  return (
    <section className="space-y-2">
      <Label htmlFor="member-role">{t.manage.changeRole}</Label>
      <NativeSelect
        id="member-role"
        className="h-11"
        value={role}
        onChange={(event) => setRole(event.target.value as AssignableRole)}
      >
        {ASSIGNABLE.map((r) => (
          <NativeSelectOption key={r} value={r}>
            {t.roles[r]}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      {changed && (delta.gained.length > 0 || delta.lost.length > 0) ? (
        <div className="bg-muted space-y-1 rounded-md p-3 text-sm">
          {delta.gained.map((key) => (
            <p key={key}>+ {t.manage.capabilities[key]}</p>
          ))}
          {delta.lost.map((key) => (
            <p key={key} className="text-muted-foreground">
              − {t.manage.capabilities[key]}
            </p>
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        className="h-11 w-full"
        disabled={pending || !changed}
        onClick={() =>
          run(
            () => changeMemberRole({ memberId: member.id, role }),
            t.manage.roleChanged
              .replace("{name}", member.fullName)
              .replace("{role}", t.roles[role])
          )
        }
      >
        {t.manage.applyRole}
      </Button>
    </section>
  )
}

function LabelSection({
  t,
  detail,
  labels,
  memberId,
  pending,
  run,
}: {
  t: T
  detail: MemberDetail
  labels: CustomLabel[]
  memberId: string
  pending: boolean
  run: (
    action: () => Promise<{ ok: boolean; error?: ApiError }>,
    success: string
  ) => void
}) {
  const [labelId, setLabelId] = useState<string>(detail.labelId ?? "")

  return (
    <section className="space-y-2">
      <Label htmlFor="member-label">{t.manage.assignLabel}</Label>
      <NativeSelect
        id="member-label"
        className="h-11"
        value={labelId}
        onChange={(event) => setLabelId(event.target.value)}
      >
        <NativeSelectOption value="">{t.manage.noLabel}</NativeSelectOption>
        {labels.map((label) => (
          <NativeSelectOption key={label.id} value={label.id}>
            {label.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p className="text-muted-foreground text-xs">{t.manage.labelHelp}</p>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={pending || labelId === (detail.labelId ?? "")}
        onClick={() =>
          run(
            () =>
              assignMemberLabel({
                memberId,
                labelId: labelId === "" ? null : labelId,
              }),
            t.manage.labelSaved
          )
        }
      >
        {t.manage.saveLabel}
      </Button>
    </section>
  )
}

function StaffSection({
  t,
  detail,
  memberId,
  pending,
  run,
}: {
  t: T
  detail: MemberDetail
  memberId: string
  pending: boolean
  run: (
    action: () => Promise<{ ok: boolean; error?: ApiError }>,
    success: string
  ) => void
}) {
  const [employeeCode, setEmployeeCode] = useState(detail.employeeCode ?? "")
  const [department, setDepartment] = useState(detail.department ?? "")
  const [phone, setPhone] = useState(detail.phone ?? "")

  const formId = "staff-form"
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{t.manage.staffDetails}</h3>
      <form
        id={formId}
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          run(
            () =>
              updateMemberStaffFields({
                memberId,
                employeeCode: employeeCode.trim(),
                department: department.trim(),
                phone: phone.trim(),
              }),
            t.manage.staffSaved
          )
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="staff-code">{t.manage.employeeCode}</Label>
          <Input
            id="staff-code"
            value={employeeCode}
            onChange={(event) => setEmployeeCode(event.target.value)}
            maxLength={32}
            className="h-11"
            placeholder={t.manage.employeeCodePlaceholder}
          />
          <p className="text-muted-foreground text-xs">
            {t.manage.employeeCodeHelp}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-dept">{t.manage.department}</Label>
          <Input
            id="staff-dept"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            maxLength={60}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-phone">{t.manage.workPhone}</Label>
          <Input
            id="staff-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={32}
            className="h-11"
          />
        </div>
        <Button
          type="submit"
          form={formId}
          className="h-11 w-full"
          disabled={pending}
        >
          {t.manage.saveStaff}
        </Button>
      </form>
    </section>
  )
}
