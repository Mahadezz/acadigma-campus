import { Skeleton } from "../components/ui/skeleton"
import { cn } from "../lib/utils"

/**
 * Shared route-loading layouts (D-409, app-polish #2): one per page type, so a
 * `loading.tsx` is three lines and no route grows a bespoke skeleton.
 * Server-safe (no client code). Geometry matches DESIGN-SYSTEM §3.7: the page
 * title bar, then 6 list rows (36px circle + 60% / 35% bars), a detail header
 * plus two cards, or five label+field pairs, so nothing jumps on arrival.
 */
export type PageSkeletonVariant = "list" | "detail" | "form"

function Heading() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-8 w-56 max-w-full" />
    </div>
  )
}

export function PageSkeleton({
  variant,
  className,
}: {
  variant: PageSkeletonVariant
  className?: string
}) {
  return (
    <div
      aria-busy="true"
      data-slot="page-skeleton"
      data-variant={variant}
      className={cn("space-y-6", className)}
    >
      <Heading />
      {variant === "list" ? (
        <ul className="divide-y rounded-lg border">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex h-16 items-center gap-3 px-4">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-3 w-[35%]" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {variant === "detail" ? (
        <>
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </>
      ) : null}
      {variant === "form" ? (
        <div className="max-w-2xl space-y-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
