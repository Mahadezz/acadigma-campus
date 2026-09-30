/**
 * D-408: the pathnames visited in this tab since the app loaded, so the
 * shell back control knows whether `router.back()` stays inside the app.
 * Module scope: survives shell remounts, resets on a full load — exactly
 * "in-app". A step is popped only after a real `popstate` (browser back or
 * forward, `router.back()`), so a Link that revisits an earlier page counts
 * as a new visit. Kept tiny and eager (every shell records from its first
 * page); the control that reads it (`ShellBack`) loads lazily.
 */

const visited: string[] = []
let popped = false
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    popped = true
  })
}

export function record(pathname: string) {
  if (visited.at(-1) !== pathname) {
    if (popped && visited.at(-2) === pathname) visited.pop()
    else visited.push(pathname)
  }
  popped = false
}

export const canGoBack = () => visited.length > 1
