import Link from "next/link"

import { CompassIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { getMessages } from "@/lib/i18n"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Page not found",
}

export default async function NotFound() {
  const { t } = await getMessages()
  const s = t.errors.notFoundPage

  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-4 py-12"
    >
      <EmptyState
        icon={<CompassIcon />}
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
