"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          // D-408: glass tint; the blur/saturate themselves are applied to
          // [data-sonner-toast] in tokens.css, since sonner renders its own
          // element outside this component's className reach.
          "--normal-bg": "var(--glass-bg-overlay)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--glass-border)",
          "--border-radius": "var(--radius-glass)",
          // richColors: our soft/ink pairs (≥ 4.5:1); sonner's own success
          // green is 4.25:1 on its background.
          "--success-bg": "var(--success-soft)",
          "--success-text": "var(--success-ink)",
          "--success-border": "var(--success-soft)",
          "--info-bg": "var(--info-soft)",
          "--info-text": "var(--info-ink)",
          "--info-border": "var(--info-soft)",
          "--warning-bg": "var(--warning-soft)",
          "--warning-text": "var(--warning-ink)",
          "--warning-border": "var(--warning-soft)",
          "--error-bg": "var(--danger-soft)",
          "--error-text": "var(--danger-ink)",
          "--error-border": "var(--danger-soft)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
