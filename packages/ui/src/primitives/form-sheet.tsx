"use client"

import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet"
import { useIsMobile } from "../hooks/use-mobile"

/**
 * One container for every form in the product (ARCHITECTURE §6): a bottom Sheet
 * below 1024px, a centred Dialog above it. Feature code writes the fields once and
 * never thinks about the breakpoint.
 *
 * `useIsMobile` reports false until after mount, so the first client render is the
 * Dialog. That is invisible to the user because nothing renders at all while
 * `open` is false, and forms are opened by interaction — never during SSR.
 *
 * ```tsx
 * <FormSheet
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Add student"
 *   description="They will appear on today's attendance sheet."
 *   footer={<Button type="submit" form="add-student">Save</Button>}
 * >
 *   <form id="add-student">…</form>
 * </FormSheet>
 * ```
 */
export type FormSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  /** Announced with the title. Say what will happen, not what the form is. */
  description?: React.ReactNode
  children: React.ReactNode
  /** Submit and cancel. Stacked on a phone, right-aligned on desktop. */
  footer?: React.ReactNode
  className?: string
}

export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: FormSheetProps) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          // Never taller than the visual viewport, so the submit button stays
          // reachable when the on-screen keyboard is up.
          className={className ?? "max-h-[90dvh] overflow-y-auto"}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>
          <div className="px-4">{children}</div>
          {footer ? <SheetFooter>{footer}</SheetFooter> : null}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={className ?? "max-h-[85dvh] overflow-y-auto sm:max-w-lg"}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
