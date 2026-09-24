import "server-only"

import {
  getWorkspacePlanId,
  listEnabledModules,
  type AcadigmaSupabaseClient,
  type WorkspaceContext,
} from "@acadigma/db"
import {
  buildEntitledNavModules,
  FALLBACK_PLAN_MODULES_WHEN_UNKNOWN,
  type NavModuleKey,
} from "@acadigma/domain/nav"

/**
 * The entitled module set for `ctx`'s workspace, from the plans engine
 * (F-CM-06 Parts 1-3), translated into nav module keys by
 * `buildEntitledNavModules` (D-56).
 *
 * Uses `getWorkspacePlanId`, never `getWorkspacePlan` — `getWorkspacePlan`
 * embeds `plans(*)`, which is subject to `plans_select_public`'s RLS
 * (`status = 'active' and is_public`) and resolves to `null` for a private,
 * contact-sales or archived plan (e.g. `personal_free`, or a custom
 * enterprise contract), even though the caller can plainly read their own
 * `plan_id`. That RLS-embed-null previously reached `resolveEntitledNavModules`
 * as an ordinary "plan lookup failed" and hid Attendance/Students/Timetable/
 * Exams/Messages for every such workspace (PR #17 Opus review). `plan_modules`
 * itself has no such restriction (`plan_modules_select` is `using (true)`),
 * so once the id is known, `listEnabledModules` always succeeds regardless of
 * the plan's own visibility.
 *
 * A GENUINE failure — `plan_id` itself cannot be resolved (dependency down,
 * or a workspace mid-provisioning with no plan row yet) — degrades to
 * `FALLBACK_PLAN_MODULES_WHEN_UNKNOWN`: every daily-loop screen stays visible
 * (fail VISIBLE, never an empty nav), while the two unambiguously premium
 * bundles (hiring/cover/marketplace) stay hidden until a real plan is known.
 */
export async function resolveEntitledNavModules(
  ctx: WorkspaceContext,
  client: AcadigmaSupabaseClient
): Promise<readonly NavModuleKey[]> {
  const planIdResult = await getWorkspacePlanId(ctx, client)
  if (!planIdResult.ok) {
    return [...buildEntitledNavModules(FALLBACK_PLAN_MODULES_WHEN_UNKNOWN)]
  }

  const modulesResult = await listEnabledModules(client, planIdResult.data)
  if (!modulesResult.ok) {
    return [...buildEntitledNavModules(FALLBACK_PLAN_MODULES_WHEN_UNKNOWN)]
  }

  return [...buildEntitledNavModules(modulesResult.data)]
}
