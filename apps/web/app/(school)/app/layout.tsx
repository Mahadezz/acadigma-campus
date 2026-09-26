import { BellIcon } from "lucide-react"

import { planReadOnlyApiError } from "@acadigma/contracts"
import { requireWritable } from "@acadigma/db"
import { getNavConfig, type NavConfig } from "@acadigma/domain/nav"
import { Button } from "@acadigma/ui/components/button"
import { AppShell } from "@acadigma/ui/primitives/app-shell"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"
import { Logo } from "@acadigma/ui/primitives/logo"
import { TopBar } from "@acadigma/ui/primitives/top-bar"

import { listMyWorkspaces } from "@/app/(shared)/workspace/actions"
import { UserMenu } from "@/app/(shared)/workspace/user-menu"
import { WorkspaceSwitcher } from "@/app/(shared)/workspace/workspace-switcher"
import { getMessages } from "@/lib/i18n"
import { onlyImplemented } from "@/lib/implemented-routes"
import { resolveEntitledNavModules } from "@/lib/school-nav-entitlements"
import { getCachedSchoolProfile } from "@/lib/school-profile"
import { createClient } from "@/lib/supabase/server"
import { getUiPreferences } from "@/lib/ui-preferences"
import { requireShell } from "@/lib/workspace"

import { BasicShellWrapper } from "./basic-shell-wrapper"
import { SchoolBottomNav, SchoolSidebar } from "./nav"

/**
 * School workspace shell.
 *
 * Resolving the workspace here means every screen below `/app` has a verified
 * membership before it renders — there is no route in this group reachable without
 * one. `role` (and the workspace's plan) are what filter the nav: `getNavConfig`
 * picks the curated tree DESIGN-SYSTEM §3.2 defines for `(workspaceType, role)`
 * from the single nav system in `@acadigma/domain/nav` (D-56) — this shell used
 * to read neither that engine nor `packages/ui`'s curated trees, it hand-rolled
 * its own four-item list.
 *
 * `requireShell("school")` (F-ID-03 §8 Part 4) additionally checks that the
 * resolved membership actually belongs to THIS shell: a `parent` role or a
 * `personal` workspace is redirected to `/family`/`/personal` rather than
 * rendering the `family:parent`/`personal:owner` nav trees here, whose
 * `/family/*`/`/personal/*` hrefs this shell cannot serve (PR #17 review
 * follow-up). Every page under `/app` also calls `requireShell("school")`
 * itself — a layout does not re-run on every client-side navigation, so the
 * gate must not live only here (PR #30 review).
 *
 * The shell owns the single `<h1>`; pages below start their headings at `<h2>`.
 */
export default async function SchoolLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireShell("school")
  const { t, locale } = await getMessages()

  const client = await createClient()
  // Review fix (SHOULD): `getSchoolProfile` used to run only after this
  // `Promise.all` resolved, and only in the basic-mode branch below — a
  // second, sequential round trip on top of it (a request waterfall). It
  // depends on neither `writable` nor `ui`, only `ctx`/`client`, both
  // already resolved above, so it starts alongside them instead. Full mode
  // never reads `profile`, but the query is cheap (single indexed row) and
  // `getCachedSchoolProfile` (keyed on `ctx.workspaceId`) means a page that
  // also needs it in this request — `home/page.tsx`'s empty state — reuses
  // this result rather than paying for it twice.
  const [writable, ui, profileResult] = await Promise.all([
    requireWritable(ctx, client),
    getUiPreferences(),
    getCachedSchoolProfile(ctx.workspaceId),
  ])

  const readOnlyBanner = writable.ok ? null : (
    // F-CM-06 Part 4 (D-62): a Pro trial past trial_ends_at (or any other
    // access_mode=read_only cause) shows here, on every screen. D-300: every
    // write is refused (server action and database); reads, exports, billing,
    // sign-out and removing access still work.
    <InlineAlert
      tone="error"
      title={t.workspace.readOnly.title}
      className="mb-4"
    >
      {planReadOnlyApiError(writable.error).message}
    </InlineAlert>
  )

  // F-ID-10 §4.10 (D-403/D-405): basic mode replaces the ENTIRE shell below
  // (no sidebar, no bottom nav — "the home is the nav") for every page under
  // `/app`, not only `/app/home` — see `basic-shell-wrapper.tsx`'s docblock
  // for why that is deliberate rather than a narrower "only /app/home" check.
  // §2 note 4: hidden for `staff`, who have no classes.
  if (ui.uiMode === "basic" && ctx.role !== "staff") {
    const phone = profileResult.ok
      ? profileResult.data.fields.contact_phone
      : null
    const s = t.basicMode
    return (
      <BasicShellWrapper
        homeHref="/app/home"
        homeLabel={s.home.homeLabel}
        brand={
          <Logo
            product="campus"
            className="[&>span]:sr-only sm:[&>span]:not-sr-only"
          />
        }
        helpLabel={s.home.helpLabel}
        helpTitle={s.help.title}
        homeLines={s.help.routes.home}
        classHubLines={s.help.routes.classHub}
        defaultLines={s.help.routes.default}
        phone={phone}
        callLabel={s.help.callSchoolOffice.replace("{phone}", phone ?? "")}
        noPhoneLine={s.help.noPhoneYet}
        goBackLabel={s.help.goBack}
        addPhoneHref={
          ctx.role === "owner" || ctx.role === "admin"
            ? "/app/settings/school"
            : undefined
        }
        addPhoneLabel={s.help.addPhoneLink}
      >
        {readOnlyBanner}
        {children}
      </BasicShellWrapper>
    )
  }

  const [entitledModules, workspacesResult] = await Promise.all([
    resolveEntitledNavModules(ctx, client),
    listMyWorkspaces(),
  ])
  // Only links to pages that exist — no prefetch 404s (D-400).
  const config: NavConfig = onlyImplemented(
    getNavConfig(ctx.workspaceType, ctx.role) ?? { bottom: [], more: [] }
  )

  return (
    <AppShell
      sidebar={
        <SchoolSidebar
          config={config}
          role={ctx.role}
          entitledModules={entitledModules}
          locale={locale}
        />
      }
      bottomNav={
        <SchoolBottomNav
          config={config}
          role={ctx.role}
          entitledModules={entitledModules}
          locale={locale}
        />
      }
      topBar={
        <TopBar
          leading={
            <WorkspaceSwitcher
              workspaces={workspacesResult.ok ? workspacesResult.data : []}
              currentWorkspaceId={ctx.workspaceId}
              t={t.workspace.switcher}
            />
          }
          title={
            // Mark only on a phone, where the switcher and bell share the
            // bar; the wordmark stays in the accessible name.
            <Logo
              product="campus"
              className="[&>span]:sr-only sm:[&>span]:not-sr-only"
            />
          }
          subtitle={t.shell.signedInAs.replace(
            "{role}",
            t.shell.roles[ctx.role]
          )}
          actions={
            <>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.nav.notifications}
              >
                <BellIcon />
              </Button>
              <UserMenu
                locale={locale}
                t={{
                  ...t.workspace.userMenu,
                  ...t.auth.languageToggle,
                  signOut: t.auth.logout.button,
                  switchToBasicMode: t.basicMode.userMenu.switchToBasicMode,
                }}
                // F-ID-10 §2 note 4 (D-403): hidden for staff, who have no
                // classes.
                showBasicModeSwitch={ctx.role !== "staff"}
              />
            </>
          }
        />
      }
    >
      {readOnlyBanner}
      {children}
    </AppShell>
  )
}
