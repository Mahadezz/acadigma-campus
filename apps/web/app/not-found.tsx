import Link from "next/link"

import { CompassIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Page not found",
}

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-4 py-12"
    >
      <EmptyState
        icon={<CompassIcon />}
        title="Page not found"
        description="That link has moved, or you do not have access to it."
        action={
          <Button asChild variant="outline">
            <Link href="/">Go to the home page</Link>
          </Button>
        }
      />
    </main>
  )
}
