"use client"

import { useState, useTransition } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { SearchIcon } from "lucide-react"

import type {
  ApiError,
  CustomLabel,
  ListMembersInput,
  MemberRow,
  MemberStatusValue,
} from "@acadigma/contracts"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import { cn } from "@acadigma/ui/lib/utils"
import {
  DataList,
  type DataListColumn,
} from "@acadigma/ui/primitives/data-list"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { approveMember, rejectMember } from "./actions"
import { MemberSheet } from "./member-sheet"

type T = Messages["team"]

const TABS: readonly MemberStatusValue[] = ["active", "pending", "removed"]

function href(status: MemberStatusValue, q?: string, after?: string): string {
  const params = new URLSearchParams()
  if (status !== "active") params.set("tab", status)
  if (q) params.set("q", q)
  if (after) params.set("after", after)
  const qs = params.toString()
  return qs ? `/app/staff/team?${qs}` : "/app/staff/team"
}

/** A timestamp as a Dhaka calendar date; Western digits in Bangla too (DESIGN-SYSTEM §1.6). */
function dateFormatter(locale: Locale): (iso: string) => string {
  const format = new Intl.DateTimeFormat(
    locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }
  )
  return (iso) => format.format(new Date(iso))
}

function Name({ member }: { member: MemberRow }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium">{member.fullName}</span>
      {member.email ? (
        <span className="text-muted-foreground text-xs font-normal break-all">
          {member.email}
        </span>
      ) : null}
    </span>
  )
}

function Actions({
  t,
  member,
  disabled,
  onDecide,
}: {
  t: T
  member: MemberRow
  disabled: boolean
  onDecide: (member: MemberRow, approve: boolean) => void
}) {
  return (
    <span className="flex gap-2">
      <Button
        type="button"
        className="h-11 flex-1 lg:flex-none"
        disabled={disabled}
        aria-label={t.approveLabel.replace("{name}", member.fullName)}
        onClick={() => onDecide(member, true)}
      >
        {t.approve}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 flex-1 lg:flex-none"
        disabled={disabled}
        aria-label={t.rejectLabel.replace("{name}", member.fullName)}
        onClick={() => onDecide(member, false)}
      >
        {t.reject}
      </Button>
    </span>
  )
}

/** Every error approve / turn down can return, in the reader's language. */
export function decisionErrorText(t: T, error: ApiError): string {
  if (error.code === "payment_required") return t.errors.readOnly
  if (error.fieldErrors?._root?.[0] === "NOT_PENDING") {
    return t.errors.NOT_PENDING
  }
  if (error.code === "forbidden") return t.errors.forbidden
  if (error.code === "not_found") return t.errors.notFound
  return t.errors.generic
}

export function TeamView({
  t,
  locale,
  input,
  members,
  nextCursor,
  labels,
}: {
  t: T
  locale: Locale
  input: ListMembersInput
  members: MemberRow[]
  nextCursor: string | null
  labels: CustomLabel[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [managing, setManaging] = useState<MemberRow | null>(null)
  const [notice, setNotice] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)
  const status = input.status
  const date = dateFormatter(locale)

  function decide(member: MemberRow, approve: boolean) {
    setNotice(null)
    startTransition(async () => {
      const result = await (approve ? approveMember : rejectMember)({
        memberId: member.id,
      })
      if (result.ok) {
        setNotice({
          tone: "success",
          text: (approve ? t.approved : t.rejected)
            .replace("{name}", member.fullName)
            .replace("{role}", t.roles[member.role].toLowerCase()),
        })
      } else {
        setNotice({ tone: "error", text: decisionErrorText(t, result.error) })
      }
      router.refresh()
    })
  }

  const columns: DataListColumn<MemberRow>[] = [
    {
      key: "name",
      header: t.columns.name,
      hideOnCard: true,
      cell: (m) => <Name member={m} />,
    },
    { key: "role", header: t.columns.role, cell: (m) => t.roles[m.role] },
    status === "pending"
      ? {
          key: "how",
          header: t.columns.how,
          cell: (m) => (m.viaInvitation ? t.via.invitation : t.via.code),
        }
      : {
          key: "status",
          header: t.columns.status,
          cell: (m) =>
            m.status === "active" ? (
              <StatusChip tone="positive">{t.activeChip}</StatusChip>
            ) : m.joinedAt === null ? (
              <StatusChip tone="negative">{t.rejectedChip}</StatusChip>
            ) : (
              <StatusChip tone="neutral">{t.removedChip}</StatusChip>
            ),
        },
    {
      key: "date",
      header: t.columns.date,
      className: "tabular-nums",
      cell: (m) =>
        m.status === "removed" && m.removedAt
          ? t.left.replace("{date}", date(m.removedAt))
          : m.status === "active" && m.joinedAt
            ? t.joined.replace("{date}", date(m.joinedAt))
            : t.asked.replace("{date}", date(m.requestedAt)),
    },
  ]
  if (status === "pending") {
    columns.push({
      key: "actions",
      header: <span className="sr-only">{t.columns.actions}</span>,
      hideOnCard: true,
      cell: (m) => (
        <Actions t={t} member={m} disabled={pending} onDecide={decide} />
      ),
    })
  }
  if (status === "active") {
    columns.push({
      key: "manage",
      header: <span className="sr-only">{t.columns.manage}</span>,
      hideOnCard: true,
      cell: (m) => (
        <Button
          type="button"
          variant="outline"
          className="h-11"
          aria-label={t.manage.openLabel.replace("{name}", m.fullName)}
          onClick={() => setManaging(m)}
        >
          {t.manage.open}
        </Button>
      ),
    })
  }

  const searched = Boolean(input.q)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground text-sm">{t.lead}</p>
      </div>

      <nav aria-label={t.tabsLabel}>
        <ul className="bg-muted flex rounded-lg p-1" role="list">
          {TABS.map((tab) => (
            <li key={tab} className="flex-1">
              <Link
                href={href(tab, input.q)}
                aria-current={tab === status ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-2",
                  tab === status
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.tabs[tab]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form
        action="/app/staff/team"
        method="get"
        role="search"
        className="flex items-end gap-2"
      >
        {status !== "active" ? (
          <input type="hidden" name="tab" value={status} />
        ) : null}
        <div className="flex-1 space-y-2">
          <Label htmlFor="team-q">{t.searchLabel}</Label>
          <Input
            id="team-q"
            name="q"
            type="search"
            maxLength={60}
            defaultValue={input.q ?? ""}
            placeholder={t.searchPlaceholder}
            className="h-11"
          />
        </div>
        <Button type="submit" variant="outline" className="h-11">
          <SearchIcon aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t.search}</span>
        </Button>
      </form>

      {/* Mounted before any notice, so screen readers announce the change. */}
      <div aria-live="polite">
        {notice ? (
          <InlineAlert tone={notice.tone}>{notice.text}</InlineAlert>
        ) : null}
      </div>

      <DataList
        items={members}
        columns={columns}
        getRowId={(m) => m.id}
        caption={t.caption}
        virtualize={false}
        renderCardTitle={(m) => (
          <span className="flex flex-col gap-2">
            <Name member={m} />
            {status === "pending" ? (
              <Actions t={t} member={m} disabled={pending} onDecide={decide} />
            ) : null}
            {status === "active" ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                aria-label={t.manage.openLabel.replace("{name}", m.fullName)}
                onClick={() => setManaging(m)}
              >
                {t.manage.open}
              </Button>
            ) : null}
          </span>
        )}
        empty={
          <EmptyState
            title={searched ? t.noMatches : t.empty[status]}
            description={
              !searched && status === "pending"
                ? t.emptyPendingDescription
                : undefined
            }
          />
        }
      />

      {input.after || nextCursor ? (
        <nav
          aria-label={t.pageNav}
          className="flex items-center justify-between gap-2"
        >
          {input.after ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={href(status, input.q)}>{t.first}</Link>
            </Button>
          ) : (
            <span />
          )}
          {nextCursor ? (
            <Button asChild variant="outline" className="h-11">
              <Link href={href(status, input.q, nextCursor)}>{t.next}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}

      {managing ? (
        <MemberSheet
          t={t}
          member={managing}
          labels={labels}
          onClose={() => setManaging(null)}
        />
      ) : null}
    </div>
  )
}
