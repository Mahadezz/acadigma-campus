/** Fills `{name}` placeholders (mirrors `../home/format.ts`'s `fill` — no
 * shared cross-route helper exists in this codebase yet). */
export function fill(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    String(values[key] ?? "")
  )
}

/** English "1 student" / "40 students"; Bangla has one form for any count. */
export function pluralize(count: number, one: string, other: string): string {
  return fill(count === 1 ? one : other, { count })
}
