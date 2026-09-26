import type * as React from "react"

/**
 * Renders one destination as the consumer's link component — mirrors
 * `bottom-nav.tsx`'s `NavLinkRenderer` (this package never depends on
 * `next`), trimmed to what a plain "tap to navigate" block needs: no
 * `active`/`onNavigate`, since these are not nav-highlighted items.
 *
 * ```tsx
 * renderLink={({ href, className, children }) => (
 *   <Link href={href} className={className}>{children}</Link>
 * )}
 * ```
 */
export type SimpleLinkRenderer = (item: {
  href: string
  className: string
  children: React.ReactNode
}) => React.ReactNode
