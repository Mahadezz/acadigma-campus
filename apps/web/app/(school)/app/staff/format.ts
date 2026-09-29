import type { StaffStatus } from "@acadigma/contracts"

/** The `StatusChip` tone for a `staff_status` value (F-OP-06 §5.2). Shared
 * by the directory list and the person sheet so a status reads the same
 * colour in both places. */
export function statusTone(
  status: StaffStatus
): "positive" | "pending" | "info" | "neutral" {
  if (status === "active") return "positive"
  if (status === "on_notice") return "pending"
  if (status === "pending_join") return "info"
  return "neutral"
}
