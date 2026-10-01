"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

/**
 * Runs a server action and, when it reports success, refreshes the page.
 *
 * The action is awaited in a plain event handler and `router.refresh()` gets
 * its own synchronous transition. Calling `router.refresh()` after an `await`
 * inside `startTransition(async ...)` left that transition pending forever
 * now and then when the route sits under a `loading.tsx` (D-409, D-411).
 * `pending` covers both the action and the refresh.
 */
export function useRefreshingAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [refreshing, startRefresh] = useTransition()

  async function run(action: () => Promise<boolean>) {
    setBusy(true)
    try {
      if (await action()) startRefresh(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  return { pending: busy || refreshing, run }
}
