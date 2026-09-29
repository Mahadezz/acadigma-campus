"use client"

import { useCallback, useEffect, useState, useTransition } from "react"

import Link from "next/link"

import { SearchIcon } from "lucide-react"

import type { StaffDirectoryRow } from "@acadigma/contracts"
import { Alert, AlertDescription } from "@acadigma/ui/components/alert"
import { Avatar, AvatarFallback } from "@acadigma/ui/components/avatar"
import { Button } from "@acadigma/ui/components/button"
import { Input } from "@acadigma/ui/components/input"
import { Label } from "@acadigma/ui/components/label"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@acadigma/ui/components/toggle-group"
import { DataList, DataListSkeleton } from "@acadigma/ui/primitives/data-list"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

import type { Messages } from "@/lib/i18n"

import { listStaff } from "./actions"
import { statusTone } from "./format"

type T = Messages["staff"]

const PAGE_SIZE = 30

/** The single-select chip row (spec W1: "All · Teachers · Admin · Staff ·
 * On notice · Pending") maps onto two independent query params: a base
 * role or an employment status, never both at once. */
type FilterValue = "all" | "teacher" | "admin" | "staff" | "on_notice" | "pending_join"
const ROLE_FILTERS = new Set(["teacher", "admin", "staff"])
const STATUS_FILTERS = new Set(["on_notice", "pending_join"])

function roleForFilter(filter: FilterValue) {
  return ROLE_FILTERS.has(filter) ? (filter as "teacher" | "admin" | "staff") : undefined
}

function statusForFilter(filter: FilterValue) {
  return STATUS_FILTERS.has(filter)
    ? (filter as "on_notice" | "pending_join")
    : undefined
}

export function StaffDirectory({
  t,
  currentUserId,
}: {
  t: T
  currentUserId: string
}) {
  const [filter, setFilter] = useState<FilterValue>("all")
  const [q, setQ] = useState("")
  const [appliedQ, setAppliedQ] = useState("")
  const [rows, setRows] = useState<StaffDirectoryRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(
    (append: boolean, cursorValue: string | null) => {
      setErrorMessage(null)
      startTransition(async () => {
        const result = await listStaff({
          q: appliedQ || undefined,
          role: roleForFilter(filter),
          status: statusForFilter(filter),
          cursor: cursorValue ?? undefined,
          limit: PAGE_SIZE,
        })
        setHasLoadedOnce(true)
        if (!result.ok) {
          setErrorMessage(t.errorGeneric)
          return
        }
        setRows((prev) =>
          append ? [...prev, ...result.data.items] : result.data.items
        )
        setCursor(result.data.nextCursor)
      })
    },
    [filter, appliedQ, t.errorGeneric]
  )

  useEffect(() => {
    // Fetching data when a dependency (filter/search) changes — the
    // documented valid use of an Effect (react.dev "Fetching data").
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    load(false, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` already depends on filter/appliedQ
  }, [filter, appliedQ])

  const filtered = filter !== "all" || appliedQ.length > 0

  return (
    <div className="space-y-4">
      <form
        role="search"
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault()
          setAppliedQ(q.trim())
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="staff-q">{t.searchLabel}</Label>
          <Input
            id="staff-q"
            type="search"
            maxLength={100}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t.searchPlaceholder}
            className="h-11"
          />
        </div>
        <Button type="submit" variant="outline" className="h-11">
          <SearchIcon aria-hidden="true" />
          {t.search}
        </Button>
      </form>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filter}
          onValueChange={(value) => {
            if (value) setFilter(value as FilterValue)
          }}
          aria-label={t.title}
          className="w-max"
        >
          {(
            [
              "all",
              "teacher",
              "admin",
              "staff",
              "on_notice",
              "pending_join",
            ] as const
          ).map((value) => (
            <ToggleGroupItem key={value} value={value} className="h-9 px-3">
              {t.filters[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {errorMessage ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {errorMessage}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => load(false, null)}
            >
              {t.retry}
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      <DataList
        items={rows}
        isLoading={isPending && !hasLoadedOnce}
        loadingRows={8}
        getRowId={(row) => row.membershipId}
        caption={t.caption}
        renderCardTitle={(row) => (
          <StaffLink t={t} row={row} currentUserId={currentUserId} />
        )}
        renderRowAction={(row, children) => (
          <Link
            href={`/app/staff/${row.membershipId}`}
            className="focus-visible:ring-ring block w-full rounded-lg outline-none focus-visible:ring-2"
          >
            {children}
          </Link>
        )}
        columns={[
          {
            key: "name",
            header: t.columns.name,
            hideOnCard: true,
            cell: (row) => (
              <StaffLink t={t} row={row} currentUserId={currentUserId} />
            ),
          },
          {
            key: "role",
            header: t.columns.role,
            cell: (row) => (
              <span className="flex flex-wrap items-center gap-1">
                <span>{row.designationLabel ?? t.roles[row.baseRole ?? "staff"]}</span>
                {row.designationLabel ? (
                  <StatusChip tone="neutral">
                    {t.roles[row.baseRole ?? "staff"]}
                  </StatusChip>
                ) : null}
              </span>
            ),
          },
          {
            key: "department",
            header: t.columns.department,
            cell: (row) => row.department ?? "—",
          },
          {
            key: "subjects",
            header: t.columns.subjects,
            cell: (row) =>
              row.subjectIds.length > 0 ? row.subjectIds.length : t.noSubjects,
          },
          {
            key: "contact",
            header: t.columns.contact,
            cell: (row) => row.workPhone ?? row.workEmail ?? t.noContact,
          },
          {
            key: "status",
            header: t.columns.status,
            cell: (row) => (
              <StatusChip tone={statusTone(row.employmentStatus)}>
                {t.status[row.employmentStatus]}
              </StatusChip>
            ),
          },
        ]}
        empty={
          <EmptyState
            title={filtered ? t.noMatches : t.empty}
            description={filtered ? undefined : t.emptyDescription}
            action={
              filtered ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFilter("all")
                    setQ("")
                    setAppliedQ("")
                  }}
                >
                  {t.clearFilters}
                </Button>
              ) : undefined
            }
          />
        }
      />

      {isPending && hasLoadedOnce ? <DataListSkeleton rows={3} /> : null}

      {cursor && !isPending ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => load(true, cursor)}
        >
          {t.loadMore}
        </Button>
      ) : null}
    </div>
  )
}

function StaffLink({
  t,
  row,
  currentUserId,
}: {
  t: T
  row: StaffDirectoryRow
  currentUserId: string
}) {
  const isSelf = row.userId === currentUserId
  return (
    <span className="flex min-h-11 items-center gap-2">
      <Avatar className="size-8">
        <AvatarFallback>{row.fullName.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="flex flex-col">
        <span className="font-medium">{row.fullName}</span>
        {isSelf ? (
          <span className="text-muted-foreground text-xs">{t.you}</span>
        ) : null}
      </span>
    </span>
  )
}
