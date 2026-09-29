/**
 * Full-screen settings sub-page header (F-OP-07 §4 W9): title + description.
 * D-408: the back chevron moved to the shell header (`ShellBack`), which
 * every sub-page now gets; this no longer renders its own back link.
 * `backLabel` is accepted and ignored until the open PR adding
 * `settings/academic` (#110) merges — then drop it from the callers.
 */
export function SubPageHeader({
  title,
  description,
}: {
  backLabel?: string
  title: string
  description: string
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  )
}
