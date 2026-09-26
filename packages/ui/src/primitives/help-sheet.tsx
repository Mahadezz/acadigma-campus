"use client"

import { PhoneIcon } from "lucide-react"

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
  /**
   * Review fix (SHOULD, PR #72): `SheetContent`'s own default close control
   * is a 16px "X" with an English-only sr-only "Close" — not something the
   * §1 persona (an older teacher on a 360px phone, possibly in বাংলা) can
   * reliably see or hear. This replaces it with a full-width 56px button in
   * the footer, so closing Help is exactly as discoverable as everything
   * else in this sheet.
   */
  goBackLabel: string
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
  goBackLabel,
}: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] gap-0"
        showCloseButton={false}
      >
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
            // Review fix (found via the manual screenshot pass, PR #72): at
            // 360px + Extra large text, `callLabel` (the office phone number
            // interpolated into a full sentence) no longer fits one
            // `whitespace-nowrap` line and was clipped past the button's own
            // edge. `h-auto`/`py-3`/`whitespace-normal` let it wrap onto a
            // second line instead, same `min-h-14` floor either way.
            <Button
              asChild
              size="lg"
              className="h-auto min-h-14 gap-2 py-3 text-base whitespace-normal"
            >
              <a href={`tel:${phone}`}>
                <PhoneIcon className="size-7 shrink-0" aria-hidden="true" />
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
                  className="min-h-14 text-base"
                >
                  <a href={addPhoneHref}>{addPhoneLabel}</a>
                </Button>
              ) : null}
            </div>
          )}
          <SheetClose asChild>
            <Button variant="outline" size="lg" className="min-h-14 text-base">
              {goBackLabel}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
