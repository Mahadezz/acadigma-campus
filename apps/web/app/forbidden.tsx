import Link from "next/link"

import { ShieldXIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

/**
 * Rendered with an HTTP 403 whenever `forbidden()` is called — a signed-in user who
 * is not an active member of the workspace they asked for, or whose role does not
 * cover the action. It never says *which* of those it was: that distinction would
 * confirm the workspace exists.
 */
export default function Forbidden() {
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-4 py-12"
    >
      <EmptyState
        icon={<ShieldXIcon />}
        title="You do not have access"
        description="Your account is not an active member of this workspace. Ask an owner or admin to invite you, then sign in again."
        action={
          <Button asChild variant="outline">
            <Link href="/">Back to the home page</Link>
          </Button>
        }
      />
    </main>
  )
}
