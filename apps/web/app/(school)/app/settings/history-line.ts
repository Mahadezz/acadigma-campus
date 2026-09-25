import type { AuditEventDto } from "@acadigma/contracts"

/**
 * One "{fields} changed by {name}, {date}" line (F-OP-07 AC6). Single-pass
 * substitution, so a stored value containing `{name}` or `$&` is printed
 * literally instead of being substituted again. Returns null when none of the
 * changed columns belong to this screen.
 */
export function historyLine(
  event: Pick<
    AuditEventDto,
    "changedFields" | "before" | "after" | "actorName" | "createdAt"
  >,
  fieldLabels: Record<string, string>,
  t: { line: string; someone: string },
  formatDate: (iso: string) => string
): string | null {
  const fields = (event.changedFields ?? [])
    .filter((f) => Object.hasOwn(fieldLabels, f))
    .map((f) => {
      const before = event.before?.[f]
      const after = event.after?.[f]
      const label = fieldLabels[f] ?? f
      return typeof after === "string" || typeof before === "string"
        ? `${label} (${String(before ?? "—")} → ${String(after ?? "—")})`
        : label
    })
  if (fields.length === 0) return null
  const values: Record<string, string> = {
    fields: fields.join(", "),
    name: event.actorName ?? t.someone,
    date: formatDate(event.createdAt),
  }
  return t.line.replace(
    /\{(fields|name|date)\}/g,
    (_, key: string) => values[key] ?? ""
  )
}
