"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { ChevronLeftIcon } from "lucide-react"

/**
 * Back to /app, which resolves the right shell. Not on /account/legal
 * (D-115): /app sends a person who has not accepted straight back there.
 */
export function BackLink({ label }: { label: string }) {
  if (usePathname() === "/account/legal") return null
  return (
    <Link
      href="/app"
      className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm"
    >
      <ChevronLeftIcon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  )
}
