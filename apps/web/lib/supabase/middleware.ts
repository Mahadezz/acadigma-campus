import { NextResponse, type NextRequest } from "next/server"

import { WORKSPACE_HEADER, createServerClient } from "@acadigma/db"

/** Route prefixes that require a session. Everything else is public. */
const PROTECTED_PREFIXES = [
  "/app",
  "/personal",
  "/family",
  "/sell",
  "/platform",
  // ARCHITECTURE §2 (account) route group: user-level settings, added by
  // F-ID-01 Part 4 (Security > Change password).
  "/account",
]

/** Cookie the workspace switcher writes. Mirrored into the request header below. */
const WORKSPACE_COOKIE = "acadigma_workspace"

/**
 * Refreshes the Supabase session on every request, mirrors the active-workspace
 * cookie into `x-workspace-id`, and redirects signed-out users away from protected
 * areas.
 *
 * The cookie dance is prescribed by @supabase/ssr: a refreshed token must be written
 * onto *both* the request (so Server Components in this same pass see it) and the
 * response (so the browser keeps it). Rebuilding the response inside `setAll` is what
 * makes that possible.
 *
 * This is a convenience gate, not the security boundary. The boundary is RLS plus
 * `resolveWorkspaceContext`, which re-derives membership from the database
 * (ARCHITECTURE §1, §3).
 */
export async function updateSession(
  request: NextRequest
): Promise<NextResponse> {
  // Copying the cookie into a header is a convenience for Server Components, which
  // read headers rather than a caller-supplied cookie jar. The value is still
  // verified against workspace_members before anything trusts it.
  const requestHeaders = new Headers(request.headers)
  const activeWorkspace = request.cookies.get(WORKSPACE_COOKIE)?.value
  if (activeWorkspace) {
    requestHeaders.set(WORKSPACE_HEADER, activeWorkspace)
  } else {
    // Never let a client set this header directly.
    requestHeaders.delete(WORKSPACE_HEADER)
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value)
      }
      response = NextResponse.next({ request: { headers: requestHeaders } })
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options)
      }
    },
  })

  // Do not put code between createServerClient and getUser: anything that reads
  // cookies in between sees the stale token and can sign the user out at random.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const needsSession = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )

  if (!user && needsSession) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    // Send them back where they were going once they have signed in.
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}
