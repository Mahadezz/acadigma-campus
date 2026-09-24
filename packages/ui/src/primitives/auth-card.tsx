import * as React from "react"

import { cn } from "../lib/utils"

/**
 * Frame for sign-in, registration, verification and password recovery
 * (DESIGN-SYSTEM §4.1, §8.2 wireframe 1: "No card, no icon tile above the title,
 * no illustration. The form is the page.").
 *
 * Card-less below `sm`: on a 360px phone a bordered card is wasted chrome around
 * a form that already fills the viewport. From `sm` up it gets the registry's
 * `Card` treatment so the page does not look unfinished on a laptop.
 */
export type AuthCardProps = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  /** Rendered below the form in the thumb zone — "Create an account", language toggle. */
  footer?: React.ReactNode
  className?: string
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full space-y-6 sm:rounded-xl sm:border sm:bg-card sm:p-8 sm:shadow-flat",
        className
      )}
    >
      <div className="space-y-1.5">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
      {footer ? (
        <div className="space-y-3 pt-2 text-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
