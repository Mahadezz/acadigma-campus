import * as React from "react"

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  WifiOffIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert"
import { cn } from "../lib/utils"

/**
 * The one place feature code puts a form-level error, success or offline notice
 * (DESIGN-SYSTEM §3.9, F-ID-01 §6 "InlineAlert above the form"). Always
 * `aria-live="polite"` so screen-reader users hear it the moment it appears,
 * without the `role="alert"` interrupt that a merely informational notice does
 * not deserve.
 */
export type InlineAlertTone = "error" | "success" | "info" | "offline"

export type InlineAlertProps = {
  tone: InlineAlertTone
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
}

const ICONS: Record<
  InlineAlertTone,
  React.ComponentType<{ className?: string }>
> = {
  error: AlertTriangleIcon,
  success: CheckCircle2Icon,
  info: InfoIcon,
  offline: WifiOffIcon,
}

export function InlineAlert({
  tone,
  title,
  children,
  className,
}: InlineAlertProps) {
  const Icon = ICONS[tone]
  return (
    <Alert
      variant={tone === "error" ? "destructive" : "default"}
      aria-live="polite"
      className={cn(
        tone === "success" && "border-success/40 text-success-ink",
        tone === "offline" && "border-warning/40",
        className
      )}
    >
      <Icon aria-hidden="true" />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
