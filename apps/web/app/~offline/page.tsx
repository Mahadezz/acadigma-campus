import { WifiOffIcon } from "lucide-react"

import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Offline",
}

/**
 * Served by the service worker when a navigation fails and nothing is cached.
 * Deliberately static: it has to render with no network and no session.
 */
export default function OfflinePage() {
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-4 py-12"
    >
      <EmptyState
        icon={<WifiOffIcon />}
        title="You are offline"
        description="Acadigma will pick up where you left off as soon as you have a connection. Anything you saved on this device is still here."
      />
    </main>
  )
}
