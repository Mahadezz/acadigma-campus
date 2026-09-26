"use client"

import { Button } from "../components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet"

/**
 * F-ID-10 §4.6/§6 "ConfirmSheet" (Part 3) — every basic-mode save asks
 * first, in the reader's own words, with the counts: "Save attendance for
 * 6-ক? 38 present, 2 absent." Two big buttons, **Yes, save** (primary,
 * does the save) and **Go back** (never "Cancel" — §4.6 says older users
 * read that as "delete"). Nothing is written until **Yes, save** is
 * pressed; closing the sheet any other way (Go back, outside tap, Esc)
 * discards nothing already on the screen — it only declines to save yet.
 */
export type ConfirmSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The plain sentence with its counts — the sheet's whole message. */
  title: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  pending?: boolean
}

export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  pending = false,
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0" showCloseButton={false}>
        <SheetHeader>
          <SheetTitle className="text-lg text-balance">{title}</SheetTitle>
          {/* Review fix (react): this used to repeat `title` verbatim, so a
           * screen reader said the same sentence twice. Radix's Dialog logs
           * a dev warning with no `Description` at all (the same tradeoff
           * `HelpSheet` accepts); naming the two buttons here is genuinely
           * distinct and reuses only already-localized props, no new copy. */}
          <SheetDescription className="sr-only">
            {confirmLabel} / {cancelLabel}
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button
            size="lg"
            className="min-h-14 text-base"
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </Button>
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-14 text-base"
              disabled={pending}
            >
              {cancelLabel}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
