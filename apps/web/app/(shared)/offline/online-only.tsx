"use client"

import * as React from "react"

import { CloudOffIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"

import { useOnline } from "@/lib/offline/use-online"

import { useOfflineCopy } from "./offline-provider"

/**
 * F-ID-11 §4.9 (Part 1, D-308): anything that generates or sends — PDFs and
 * report cards, publishing results, invitations, imports, creating a school —
 * shows "Needs internet" while offline instead of failing. It never queues: a
 * report card made later is made from stale data.
 *
 * Wraps the real control; offline it renders a disabled button in its place,
 * with the one-line reason below it.
 */
export function OnlineOnly({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const online = useOnline()
  const copy = useOfflineCopy()
  const hintId = React.useId()

  if (online) return <>{children}</>

  return (
    <div className={className}>
      <Button
        variant="outline"
        disabled
        aria-describedby={hintId}
        className="w-full sm:w-auto"
      >
        <CloudOffIcon aria-hidden="true" />
        {copy.needsInternet}
      </Button>
      <p id={hintId} className="text-muted-foreground mt-1 text-xs">
        {copy.needsInternetHint}
      </p>
    </div>
  )
}
