"use client"

import * as React from "react"

import {
  AlertTriangleIcon,
  ArrowLeftRightIcon,
  BarChart3Icon,
  BookMarkedIcon,
  BookOpenIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  CreditCardIcon,
  EllipsisIcon,
  FileCheckIcon,
  FileTextIcon,
  FolderLockIcon,
  FolderOpenIcon,
  GaugeIcon,
  HandCoinsIcon,
  HeartHandshakeIcon,
  HistoryIcon,
  HomeIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  LifeBuoyIcon,
  ListChecksIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  NotebookIcon,
  PackageIcon,
  PrinterIcon,
  ReceiptIcon,
  SchoolIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StoreIcon,
  TagIcon,
  TrendingUpIcon,
  UserCogIcon,
  UserRoundSearchIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { Slot } from "radix-ui"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet"
import { cn } from "../lib/utils"

import {
  aggregateMoreBadgeCount,
  useFilteredNav,
  type IconName,
  type NavConfig,
  type NavFilterContext,
  type NavGroup,
  type NavItem,
} from "./nav-config"

/**
 * Phone tab bar (ARCHITECTURE §6). Hidden from `lg` up, where the sidebar takes over.
 *
 * Five items is the ceiling: past that, thumb targets get too narrow to hit. A role
 * with more destinations puts the remainder behind a "More" item that opens a Sheet.
 *
 * Routing stays in the app: `asChild` hands the rendered content to whatever link
 * component the consumer passes, so this package never depends on `next`.
 *
 * ```tsx
 * <BottomNav>
 *   <BottomNavItem asChild active={pathname === "/app/dashboard"}
 *     icon={<HomeIcon />} label="Home">
 *     <Link href="/app/dashboard" />
 *   </BottomNavItem>
 * </BottomNav>
 * ```
 */
export const BOTTOM_NAV_MAX_ITEMS = 5

export function BottomNav({
  children,
  className,
  label = "Main",
}: {
  children: React.ReactNode
  className?: string
  /** Names the landmark when a screen has more than one navigation region. */
  label?: string
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "bg-background/95 border-border supports-[backdrop-filter]:bg-background/85 fixed inset-x-0 bottom-0 z-[var(--z-bottomnav)] border-t backdrop-blur lg:hidden",
        className
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-14 items-stretch justify-around">{children}</ul>
    </nav>
  )
}

export type BottomNavItemProps = {
  icon: React.ReactNode
  label: string
  /** Marks the current destination for both styling and assistive tech. */
  active?: boolean
  /** Unread count. Anything above 9 renders as "9+". */
  badge?: number
  /** Render the consumer's link component instead of an `<a>`. */
  asChild?: boolean
  className?: string
} & React.ComponentPropsWithoutRef<"a">

export function BottomNavItem({
  icon,
  label,
  active = false,
  badge,
  asChild = false,
  className,
  ...props
}: BottomNavItemProps) {
  // A trigger with no `href` (the "More" tab) is a real `<button>`, not a link
  // with no destination — that is what makes it reachable by role="button"
  // for assistive tech and keyboard users, not just visually button-shaped.
  const Comp = (
    asChild ? Slot.Root : props.href ? "a" : "button"
  ) as React.ElementType
  const extraProps = Comp === "button" ? { type: "button" as const } : {}

  return (
    <li className="relative flex-1">
      {/* §3.1: the active bar sits on the TOP edge of the slot — the bottom
       * edge is under the thumb and often under the gesture bar. */}
      {active ? (
        <span
          aria-hidden="true"
          className="bg-primary absolute inset-x-0 top-0 h-0.5"
        />
      ) : null}
      <Comp
        // `page` is the correct value for a nav item pointing at the current screen.
        aria-current={active ? "page" : undefined}
        {...extraProps}
        className={cn(
          // Full 56px column height is the target, not just the icon (§3.1).
          "flex h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.6875rem]",
          "focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-inset",
          "[transition-duration:var(--duration-fast)] [transition-property:color] [transition-timing-function:var(--ease-standard)]",
          active
            ? "text-primary font-semibold"
            : "text-muted-foreground hover:text-foreground font-medium",
          className
        )}
        {...props}
      >
        <span className="relative flex size-6 items-center justify-center [&_svg]:size-5">
          {icon}
          {badge && badge > 0 ? (
            <span
              className="bg-destructive text-background absolute -top-1 -right-2 min-w-4 rounded-full px-1 text-[0.625rem] leading-4 font-semibold"
              aria-label={`${badge} unread`}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </span>
        <span className="max-w-full truncate">{label}</span>
      </Comp>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Nav-config composition: renders a `NavConfig` (DESIGN-SYSTEM §3.2) as the
// primary `BottomNav` slots plus a "More" slot opening a grouped `Sheet`.
// ---------------------------------------------------------------------------

export const ICON_MAP: Record<IconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboardIcon,
  "clipboard-check": ClipboardCheckIcon,
  users: UsersIcon,
  "message-circle": MessageCircleIcon,
  school: SchoolIcon,
  "calendar-days": CalendarDaysIcon,
  "file-check": FileCheckIcon,
  "list-checks": ListChecksIcon,
  "book-open": BookOpenIcon,
  "clipboard-list": ClipboardListIcon,
  notebook: NotebookIcon,
  "user-cog": UserCogIcon,
  "shield-check": ShieldCheckIcon,
  briefcase: BriefcaseIcon,
  "user-round-search": UserRoundSearchIcon,
  tag: TagIcon,
  "bar-chart-3": BarChart3Icon,
  printer: PrinterIcon,
  megaphone: MegaphoneIcon,
  library: LibraryIcon,
  sparkles: SparklesIcon,
  "credit-card": CreditCardIcon,
  wallet: WalletIcon,
  store: StoreIcon,
  "trending-up": TrendingUpIcon,
  history: HistoryIcon,
  settings: SettingsIcon,
  "life-buoy": LifeBuoyIcon,
  "book-marked": BookMarkedIcon,
  "heart-handshake": HeartHandshakeIcon,
  "alert-triangle": AlertTriangleIcon,
  "file-text": FileTextIcon,
  "folder-open": FolderOpenIcon,
  gauge: GaugeIcon,
  "folder-lock": FolderLockIcon,
  "id-card": IdCardIcon,
  home: HomeIcon,
  package: PackageIcon,
  receipt: ReceiptIcon,
  "hand-coins": HandCoinsIcon,
  "building-2": Building2Icon,
  "arrow-left-right": ArrowLeftRightIcon,
  "more-horizontal": EllipsisIcon,
}

/**
 * `NavItem.icon` is a plain `string` in `@acadigma/domain/nav` (that package
 * has no UI dependency, so it cannot reference `IconName`). Looking it up
 * here is the one place a config's icon name and this map's keys can drift —
 * an unrecognised name falls back to `EllipsisIcon` rather than crashing the
 * shell, since a mis-typed icon string is a content bug, not a reason to
 * break navigation.
 */
export function resolveNavIcon(icon: string): LucideIcon {
  return (ICON_MAP as Record<string, LucideIcon>)[icon] ?? EllipsisIcon
}

/**
 * Renders one nav destination as the consumer's link component — this package
 * never depends on `next`. The implementation is expected to render its link
 * with `className` applied and `aria-current="page"` set when `active` is
 * true, and to call `onNavigate` (if given) on click, e.g.:
 *
 * ```tsx
 * renderLink={({ href, className, active, children, onNavigate }) => (
 *   <Link href={href} className={className}
 *     aria-current={active ? "page" : undefined} onClick={onNavigate}>
 *     {children}
 *   </Link>
 * )}
 * ```
 */
export type NavLinkRenderer = (item: {
  href: string
  label: string
  active: boolean
  className: string
  children: React.ReactNode
  /** Set on a `MoreSheet` item so tapping it also closes the sheet. */
  onNavigate?: () => void
}) => React.ReactNode

/**
 * The "More" sheet (§3.1 "Slot 5 is always More, opening a sheet"): every
 * `NavGroup` the filtered config still has, each item a full 44px row.
 */
export function MoreSheet({
  open,
  onOpenChange,
  groups,
  locale = "en",
  isActive,
  renderLink,
  title = "More",
  contentId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: readonly NavGroup[]
  locale?: "en" | "bn"
  isActive: (href: string) => boolean
  renderLink: NavLinkRenderer
  title?: string
  /** Wired to the "More" trigger's `aria-controls` (§7.1: disclosure widgets
   * need both `aria-expanded` and `aria-controls`). */
  contentId?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id={contentId}
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {groups.map((group) => (
            <div key={group.id}>
              <h3 className="text-muted-foreground mb-1 px-1 text-xs font-semibold tracking-wide uppercase">
                {locale === "bn" ? group.labelBn : group.labelEn}
              </h3>
              <ul className="divide-border divide-y">
                {group.items.map((navItem) => {
                  const Icon = resolveNavIcon(navItem.icon)
                  const active = isActive(navItem.href)
                  const label =
                    locale === "bn" ? navItem.labelBn : navItem.labelEn
                  return (
                    <li key={navItem.id}>
                      {renderLink({
                        href: navItem.href,
                        label,
                        active,
                        className: cn(
                          "focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-2",
                          active
                            ? "text-primary font-medium"
                            : "text-foreground hover:bg-muted"
                        ),
                        onNavigate: () => onOpenChange(false),
                        children: (
                          <>
                            <Icon
                              className="size-4 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">{label}</span>
                            {navItem.badge?.count ? (
                              <span
                                className="bg-destructive text-background ml-auto min-w-4 rounded-full px-1 text-center text-[0.625rem] leading-4 font-semibold"
                                aria-label={`${navItem.badge.count} unread`}
                              >
                                {navItem.badge.count > 9
                                  ? "9+"
                                  : navItem.badge.count}
                              </span>
                            ) : null}
                          </>
                        ),
                      })}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The full `NavConfig` → phone shell composition: `BottomNav` for the primary
 * items (filtered by role/plan/owner-visibility), always followed by a "More"
 * slot when any group has visible items.
 */
export function BottomNavFromConfig({
  config,
  filter,
  pathname,
  renderLink,
  locale = "en",
  navLabel = "Main",
  className,
}: {
  config: NavConfig
  filter: NavFilterContext
  pathname: string
  renderLink: NavLinkRenderer
  locale?: "en" | "bn"
  navLabel?: string
  className?: string
}) {
  const filtered = useFilteredNav(config, filter)
  const [moreOpen, setMoreOpen] = React.useState(false)
  // Stable across renders (and unique even if this component renders more
  // than once on a page), so the More trigger's aria-controls always points
  // at a real id rather than one derived from label text that could repeat
  // or contain characters unsafe in an id.
  const moreSheetId = React.useId()
  const isActive = React.useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname]
  )
  const moreBadgeCount = aggregateMoreBadgeCount(filtered)
  const hasMore = filtered.more.length > 0

  return (
    <>
      <BottomNav label={navLabel} className={className}>
        {filtered.bottom.map((navItem: NavItem) => {
          const Icon = resolveNavIcon(navItem.icon)
          const label = locale === "bn" ? navItem.labelBn : navItem.labelEn
          const active = isActive(navItem.href)
          const badge = navItem.badge?.count
          return (
            <li key={navItem.id} className="relative flex-1">
              {active ? (
                <span
                  aria-hidden="true"
                  className="bg-primary absolute inset-x-0 top-0 h-0.5"
                />
              ) : null}
              {renderLink({
                href: navItem.href,
                label,
                active,
                className: cn(
                  "flex h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.6875rem]",
                  "focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  "[transition-duration:var(--duration-fast)] [transition-property:color]",
                  active
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground font-medium"
                ),
                children: (
                  <>
                    <span className="relative flex size-6 items-center justify-center [&_svg]:size-5">
                      <Icon aria-hidden="true" />
                      {badge && badge > 0 ? (
                        <span
                          className="bg-destructive text-background absolute -top-1 -right-2 min-w-4 rounded-full px-1 text-[0.625rem] leading-4 font-semibold"
                          aria-label={`${badge} unread`}
                        >
                          {badge > 9 ? "9+" : badge}
                        </span>
                      ) : null}
                    </span>
                    <span className="max-w-full truncate">{label}</span>
                  </>
                ),
              })}
            </li>
          )
        })}
        {hasMore ? (
          <BottomNavItem
            icon={<EllipsisIcon />}
            label={locale === "bn" ? "আরও" : "More"}
            badge={moreBadgeCount}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls={moreSheetId}
            onClick={() => setMoreOpen(true)}
          />
        ) : null}
      </BottomNav>
      {hasMore ? (
        <MoreSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          groups={filtered.more}
          locale={locale}
          isActive={isActive}
          renderLink={renderLink}
          title={locale === "bn" ? "আরও" : "More"}
          contentId={moreSheetId}
        />
      ) : null}
    </>
  )
}
