"use client"

import { Button } from "@acadigma/ui/components/button"

/**
 * F-OP-07 §4 W9: appears only when the form is dirty, sits above the phone
 * bottom nav (AppShell reserves 4.5rem for it) and at the bottom on desktop.
 */
export function StickySaveBar({
  dirty,
  pending,
  onDiscard,
  t,
}: {
  dirty: boolean
  pending: boolean
  onDiscard: () => void
  t: { unsaved: string; save: string; saving: string; discard: string }
}) {
  if (!dirty) return null
  return (
    <div className="bg-background/95 sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center gap-2 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-8 lg:px-8">
      <p className="text-muted-foreground mr-auto text-sm" aria-live="polite">
        {t.unsaved}
      </p>
      <Button
        type="button"
        variant="ghost"
        onClick={onDiscard}
        disabled={pending}
        className="min-h-11"
      >
        {t.discard}
      </Button>
      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? t.saving : t.save}
      </Button>
    </div>
  )
}
