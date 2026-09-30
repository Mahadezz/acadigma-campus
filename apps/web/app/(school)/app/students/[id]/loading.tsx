import { PageSkeleton } from "@acadigma/ui/primitives/page-skeleton"

/** Route-loading fallback: the shared "detail" skeleton (D-409). */
export default function Loading() {
  return <PageSkeleton variant="detail" />
}
