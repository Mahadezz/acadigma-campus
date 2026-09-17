import * as React from "react"

/**
 * ARCHITECTURE §6: the shell switches from bottom-nav + sheets to sidebar + panels
 * at `lg` (1024px). shadcn ships this hook at 768px; using 1024 here keeps Sidebar,
 * FormSheet and BottomNav flipping on the same pixel instead of two breakpoints
 * apart.
 */
export const MOBILE_BREAKPOINT = 1024

/**
 * True below 1024px. Returns false during SSR and on the first client render, then
 * corrects after mount — so render the desktop-safe branch by default, and never
 * gate content that must exist in the server HTML on this hook.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    query.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
