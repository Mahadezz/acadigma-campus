import "server-only"

import { cache } from "react"

import { getSchoolProfile } from "@acadigma/db/repositories/settings"

import { createClient } from "@/lib/supabase/server"

import type { WorkspaceContext } from "@acadigma/db"

/**
 * Review fix (SHOULD, PR #72): `(school)/app/layout.tsx`'s basic-mode branch
 * and `home/page.tsx`'s empty state both need the school's phone number in
 * the same request — before this, each ran its own `getSchoolProfile` query
 * (a request waterfall in the layout, then a second query in the page).
 *
 * `React.cache()` dedupes by argument identity, not by value — `ctx`, and
 * the client from `createClient()`, are freshly built by every caller's own
 * `requireShell()`/`createClient()` call, so passing either through would
 * defeat the cache. This takes only `workspaceId` (a plain string, the one
 * field `getSchoolProfile` actually reads) so two calls for the same
 * workspace in the same request — layout and page — resolve to the same
 * cached promise, and resolves its own client rather than accepting the
 * caller's.
 */
export const getCachedSchoolProfile = cache((workspaceId: string) =>
  createClient().then((client) =>
    getSchoolProfile(client, { workspaceId } as WorkspaceContext)
  )
)
