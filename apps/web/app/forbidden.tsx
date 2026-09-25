import Link from "next/link"

import { ShieldXIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { getMessages } from "@/lib/i18n"

/**
 * Rendered with an HTTP 403 whenever `forbidden()` is called — a signed-in user who
 * is not an active member of the workspace they asked for, or whose role does not
 * cover the action. It never says *which* of those it was: that distinction would
 * confirm the workspace exists.
 */
export default async function Forbidden() {
  const { t } = await getMessages()
  const s = t.errors.forbiddenPage

  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-4 py-12"
    >
      <EmptyState
        icon={<ShieldXIcon />}
        title={s.title}
        description={s.description}
        action={
          <Button asChild variant="outline">
            <Link href="/">{s.action}</Link>
          </Button>
        }
      />
    </main>
  )
}
