import * as React from "react"

import { cn } from "../lib/utils"

/**
 * What a list shows when it has nothing to show. Every empty state names the thing
 * that is missing and offers the action that fixes it — "No students yet" plus an
 * "Add student" button, never a bare "No data".
 */
export type EmptyStateProps = {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** The one action that resolves the emptiness. */
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className
      )}
    >
      {icon ? (
        <div
          className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full [&_svg]:size-5"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm text-balance">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
