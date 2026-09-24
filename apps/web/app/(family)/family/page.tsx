import { HeartHandshakeIcon } from "lucide-react"

import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { requireWorkspace } from "@/lib/workspace"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Family",
}

/**
 * Placeholder home for the family shell (F-ID-03 §8 Part 4). F-AC-10
 * replaces this with the real parent portal (child switcher + 13
 * guardian-scoped views); this page's only job is to prove the shell
 * renders for a resolved `parent` member instead of 404ing or landing them
 * on the school shell.
 */
export default async function FamilyHomePage() {
  const { role } = await requireWorkspace()

  return (
    <EmptyState
      icon={<HeartHandshakeIcon />}
      title="Your child's school, from here"
      description={`Signed in as ${role}. Attendance, results, messages and fees land here in a later part (F-AC-10).`}
    />
  )
}
