"use client"

import { PhoneIcon } from "lucide-react"

import { Button } from "../components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet"

/**
 * F-ID-10 §4.7/§6 — opens from every basic screen's top bar. `lines` is the
 * catalogue text for the current route (caller looks it up, this component
 * only renders it), always followed by Call school office. Read aloud
 * (§4.8) is Part 4, gated on a go/no-go device check — not built here.
 */
export type HelpSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  lines: string[]
  /** `tel:<phone>` when the school has one on file; `null` shows
   * `noPhoneLine` instead (§9 AC10). */
  phone: string | null
  callLabel: string
  noPhoneLine: string
  /** Owner/admin only (§4.7): a link to add the number. */
  addPhoneHref?: string
  addPhoneLabel?: string
}

export function HelpSheet({
  open,
  onOpenChange,
  title,
  lines,
  phone,
  callLabel,
  noPhoneLine,
  addPhoneHref,
  addPhoneLabel,
}: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] gap-0">
        <SheetHeader>
          <SheetTitle className="text-lg">{title}</SheetTitle>
          <SheetDescription className="sr-only">{title}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-2 text-base">
          {lines.map((line, i) => (
            // Catalogue copy in a fixed order, not user content — an index
            // key is fine here.
            <p key={i}>{line}</p>
          ))}
        </div>
        <SheetFooter>
          {phone ? (
            <Button asChild size="lg" className="min-h-14 gap-2 text-base">
              <a href={`tel:${phone}`}>
                <PhoneIcon className="size-7" aria-hidden="true" />
                {callLabel}
              </a>
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-base">{noPhoneLine}</p>
              {addPhoneHref ? (
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="min-h-14"
                >
                  <a href={addPhoneHref}>{addPhoneLabel}</a>
                </Button>
              ) : null}
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
