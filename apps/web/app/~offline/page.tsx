import { WifiOffIcon } from "lucide-react"

import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { RetryButton } from "./retry-button"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Offline",
}

/**
 * Served by the service worker when a navigation fails and the page was never
 * opened on this phone (F-ID-11 §4.2). Deliberately static — it has to render
 * with no network and no session — so it speaks both languages at once.
 */
export default function OfflinePage() {
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-4 py-12"
    >
      <EmptyState
        icon={<WifiOffIcon />}
        title="This needs internet the first time · প্রথমবার ইন্টারনেট দরকার"
        description="You are offline and this page has not been opened on this phone yet. Pages you opened before still work. · আপনি অফলাইনে, আর এই পাতাটি এই ফোনে আগে খোলা হয়নি। আগে খোলা পাতাগুলো এখনও দেখা যাবে।"
        action={<RetryButton />}
      />
    </main>
  )
}
