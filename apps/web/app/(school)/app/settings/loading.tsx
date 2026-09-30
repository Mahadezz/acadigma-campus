import { PageSkeleton } from "@acadigma/ui/primitives/page-skeleton"

/** Route-loading fallback: the shared "form" skeleton (D-409). */
export default function Loading() {
  return <PageSkeleton variant="form" />
}
