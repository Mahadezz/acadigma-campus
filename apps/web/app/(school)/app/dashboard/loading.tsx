import { Skeleton } from "@acadigma/ui/components/skeleton"

/** Route-scoped fallback while the dashboard's counts load (D-400). */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4 md:grid-cols-2 lg:col-span-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-56" />
      </div>
    </div>
  )
}
