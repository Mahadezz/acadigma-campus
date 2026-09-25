import Link from "next/link"

import { ChevronLeftIcon } from "lucide-react"

/** Full-screen settings sub-page header (F-OP-07 §4 W9): back chevron + title. */
export function SubPageHeader({
  backLabel,
  title,
  description,
}: {
  backLabel: string
  title: string
  description: string
}) {
  return (
    <div className="space-y-1">
      <Link
        href="/app/settings"
        className="text-muted-foreground hover:text-foreground -ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        {backLabel}
      </Link>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  )
}
