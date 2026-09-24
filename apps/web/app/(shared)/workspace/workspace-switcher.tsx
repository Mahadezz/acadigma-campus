"use client"

import * as React from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  ChevronsUpDownIcon,
  HomeIcon,
  Loader2Icon,
  PlusIcon,
  SchoolIcon,
} from "lucide-react"

import type { MembershipSummary } from "@acadigma/contracts"
import { Avatar, AvatarFallback } from "@acadigma/ui/components/avatar"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import { FormSheet } from "@acadigma/ui/primitives/form-sheet"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { switchWorkspace } from "./actions"

/**
 * F-ID-03 §4.2 / §6 "Workspace switcher (top bar chip, every shell)".
 *
 * Sits in `TopBar`'s `leading` slot on every shell (school/personal/family) —
 * present on phone and desktop both, unlike the Base44 prototype's `hidden
 * lg:flex` (D16). Reuses `FormSheet` (bottom Sheet below 1024px, centred
 * Dialog above it, ARCHITECTURE §6) rather than a bespoke Sheet-on-phone /
 * anchored-Dropdown-on-desktop pair the spec's UI table sketches: one
 * container, already accessible and tested, gives the same rows at both
 * widths with less code (spec deviation, recorded in F-ID-03 §11).
 *
 * `workspaces` is fetched server-side by the shell layout (`listMyWorkspaces()`)
 * and passed down — the chip's own label must be correct on first paint, not
 * after a client fetch.
 */
export type WorkspaceSwitcherProps = {
  workspaces: MembershipSummary[]
  currentWorkspaceId: string
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?"
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
}: WorkspaceSwitcherProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [open, setOpen] = React.useState(false)
  const [switchingId, setSwitchingId] = React.useState<string | null>(null)
  const [expandedPendingId, setExpandedPendingId] = React.useState<
    string | null
  >(null)
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, startTransition] = React.useTransition()

  // The switcher never offers a removed membership as a destination — §4.2's
  // sheet lists what you can switch to, not your full history (that view is
  // `/personal/workspaces`, F-ID-06).
  const selectable = React.useMemo(
    () => workspaces.filter((w) => w.status !== "removed"),
    [workspaces]
  )
  const current = selectable.find((w) => w.workspaceId === currentWorkspaceId)

  function handleSelect(workspace: MembershipSummary) {
    if (workspace.status === "pending") {
      setExpandedPendingId((id) =>
        id === workspace.workspaceId ? null : workspace.workspaceId
      )
      return
    }
    if (workspace.workspaceId === currentWorkspaceId) {
      setOpen(false)
      return
    }

    setError(null)
    setSwitchingId(workspace.workspaceId)
    startTransition(async () => {
      try {
        const result = await switchWorkspace({
          workspaceId: workspace.workspaceId,
        })
        if (!result.ok) {
          setError(result.error.message)
          setSwitchingId(null)
          return
        }
        // F-ID-03 §4.2: "clears the TanStack Query cache" — every query key
        // in the product is workspace-prefixed, so the whole cache is stale
        // the instant the tenant changes.
        queryClient.clear()
        setOpen(false)
        router.push(result.data.landingRoute)
      } catch {
        setError("Could not switch workspaces. Check your connection.")
        setSwitchingId(null)
      }
    })
  }

  if (selectable.length <= 1) {
    // §6: "Only one workspace → the chip is not tappable and shows no chevron."
    return (
      <div className="flex min-w-0 items-center gap-2 px-1">
        <Avatar size="sm">
          <AvatarFallback>{initialOf(current?.name ?? "?")}</AvatarFallback>
        </Avatar>
        <span className="max-w-[9rem] truncate text-sm font-medium">
          {current?.name ?? "Workspace"}
        </span>
      </div>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="min-w-0 gap-2 px-1"
        onClick={() => setOpen(true)}
        aria-label={`Switch workspace, currently ${current?.name ?? "unknown"}`}
      >
        <Avatar size="sm">
          <AvatarFallback>{initialOf(current?.name ?? "?")}</AvatarFallback>
        </Avatar>
        <span className="max-w-[9rem] truncate text-sm font-medium">
          {current?.name ?? "Workspace"}
        </span>
        <ChevronsUpDownIcon
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden="true"
        />
      </Button>

      <FormSheet
        open={open}
        onOpenChange={(next) => {
          if (!isPending) setOpen(next)
        }}
        title="Switch workspace"
        description="Choose which workspace you want to work in."
      >
        <div className="space-y-3">
          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

          <ul className="space-y-1" aria-label="Your workspaces">
            {selectable.map((workspace) => {
              const isCurrent = workspace.workspaceId === currentWorkspaceId
              const isPendingRow = workspace.status === "pending"
              const isSwitchingThis = switchingId === workspace.workspaceId

              return (
                <li key={workspace.workspaceId}>
                  <button
                    type="button"
                    disabled={isPending && !isSwitchingThis}
                    onClick={() => handleSelect(workspace)}
                    aria-current={isCurrent ? "true" : undefined}
                    className="hover:bg-accent focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-left disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Avatar>
                      <AvatarFallback>
                        {initialOf(workspace.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5">
                        {workspace.type === "school" ? (
                          <SchoolIcon
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <HomeIcon
                            className="text-muted-foreground size-3.5 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate font-medium">
                          {workspace.name}
                        </span>
                      </span>
                      <span className="text-muted-foreground text-xs capitalize">
                        {workspace.role}
                      </span>
                      {isPendingRow &&
                      expandedPendingId === workspace.workspaceId ? (
                        <span
                          role="status"
                          className="text-muted-foreground mt-1 text-xs"
                        >
                          Your request to join is waiting for an owner or admin
                          to approve it.
                        </span>
                      ) : null}
                    </span>
                    {isSwitchingThis ? (
                      <Loader2Icon
                        className="size-4 shrink-0 animate-spin"
                        aria-hidden="true"
                      />
                    ) : isPendingRow ? (
                      <Badge variant="secondary">Pending approval</Badge>
                    ) : isCurrent ? (
                      <CheckIcon
                        className="text-primary size-4 shrink-0"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>

          <Button asChild variant="outline" className="w-full">
            <Link href="/onboarding" onClick={() => setOpen(false)}>
              <PlusIcon aria-hidden="true" />
              Create or join a workspace
            </Link>
          </Button>
        </div>
      </FormSheet>
    </>
  )
}
