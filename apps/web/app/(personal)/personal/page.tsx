import { UserIcon } from "lucide-react"

import { EmptyState } from "@acadigma/ui/primitives/empty-state"

import { requireWorkspace } from "@/lib/workspace"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Personal workspace",
}

/**
 * Placeholder home for the personal shell (F-ID-03 §8 Part 4). F-ID-06
 * replaces this with the real tutoring/attendance/diary home; this page's
 * only job is to prove the shell renders for a resolved `personal` context
 * instead of 404ing.
 */
export default async function PersonalHomePage() {
  const { role } = await requireWorkspace()

  return (
    <EmptyState
      icon={<UserIcon />}
      title="Your personal workspace"
      description={`Signed in as ${role}. Tutoring students, attendance, diary and files land here in a later part (F-ID-06).`}
    />
  )
}
