import { AlertTriangleIcon, InfoIcon, ShieldAlertIcon } from "lucide-react"

import type { AuditSeverity } from "@acadigma/contracts/audit"
import { StatusChip } from "@acadigma/ui/primitives/status-chip"

/**
 * Severity is never colour-only (F-ID-09 §6 accessibility note): the icon and the
 * label both carry the meaning, `StatusChip` already renders the tone as text, and
 * the icon here is `aria-hidden` with the word doing the real work.
 */
const SEVERITY_CONFIG: Record<
  AuditSeverity,
  {
    tone: "info" | "pending" | "negative"
    icon: typeof InfoIcon
    label: string
  }
> = {
  info: { tone: "info", icon: InfoIcon, label: "Info" },
  notable: { tone: "pending", icon: AlertTriangleIcon, label: "Notable" },
  critical: { tone: "negative", icon: ShieldAlertIcon, label: "Critical" },
}

export function SeverityChip({ severity }: { severity: AuditSeverity }) {
  const { tone, icon: Icon, label } = SEVERITY_CONFIG[severity]
  return (
    <StatusChip tone={tone} icon={<Icon />}>
      {label}
    </StatusChip>
  )
}
