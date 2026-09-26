import { act, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { MembershipSummary } from "@acadigma/contracts"

const mockSwitchWorkspace = vi.fn()
vi.mock("./actions", () => ({
  switchWorkspace: mockSwitchWorkspace,
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const mockQueryClientClear = vi.fn()
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ clear: mockQueryClientClear }),
}))

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// jsdom has no `matchMedia`; `FormSheet` (via `useIsMobile`) probes for it to
// pick Sheet vs Dialog. Same polyfill as `packages/ui/vitest.setup.ts` — this
// project's `test/rtl-cleanup.ts` doesn't need it for anything else yet, so
// it stays local to the one test file that renders a `FormSheet`.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

const { WorkspaceSwitcher } = await import("./workspace-switcher")

const T = {
  ariaLabel: "Switch workspace, currently {name}",
  unknownWorkspace: "unknown",
  fallbackName: "Workspace",
  title: "Switch workspace",
  description: "Choose which workspace you want to work in.",
  yourWorkspaces: "Your workspaces",
  pendingApproval: "Pending approval",
  pendingDescription:
    "Your request to join is waiting for an owner or admin to approve it.",
  createOrJoin: "Create or join a workspace",
  switchError: "Could not switch workspaces. Check your connection.",
  myChildren: "My children",
  schoolApp: "School app",
  alsoParent: "You are also a parent here",
}

const WORKSPACES: MembershipSummary[] = [
  {
    workspaceId: "11111111-1111-1111-1111-111111111111",
    name: "Acadigma Model School",
    type: "school",
    role: "owner",
    status: "active",
    logoUrl: null,
  },
  {
    workspaceId: "22222222-2222-2222-2222-222222222222",
    name: "Personal",
    type: "personal",
    role: "owner",
    status: "active",
    logoUrl: null,
  },
]

/**
 * React review of PR #30 (HIGH #1): the row a user just clicked used to be
 * the only one still enabled while its own `switchWorkspace` call was in
 * flight (`disabled={isPending && !isSwitchingThis}`), so a second click on
 * that same row fired a second RPC before the first resolved. Every row must
 * disable together.
 *
 * HIGH #2: the trigger opens a sheet/dialog but is a plain `Button`, not a
 * Radix `DialogTrigger` — it needs `aria-haspopup`/`aria-expanded` itself.
 */
describe("WorkspaceSwitcher", () => {
  it("has aria-haspopup and aria-expanded on the trigger, expanded only while the sheet is open", async () => {
    render(
      <WorkspaceSwitcher
        workspaces={WORKSPACES}
        currentWorkspaceId={WORKSPACES[0]!.workspaceId}
        t={T}
      />
    )

    const trigger = screen.getByRole("button", { name: /switch workspace/i })
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    await act(async () => {
      trigger.click()
    })

    expect(trigger.getAttribute("aria-expanded")).toBe("true")
  })

  it("disables the row it just switched while the switch is in flight, so a second click cannot fire a second call", async () => {
    let resolveSwitch!: (value: unknown) => void
    mockSwitchWorkspace.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSwitch = resolve
      })
    )

    render(
      <WorkspaceSwitcher
        workspaces={WORKSPACES}
        currentWorkspaceId={WORKSPACES[0]!.workspaceId}
        t={T}
      />
    )

    await act(async () => {
      screen.getByRole("button", { name: /switch workspace/i }).click()
    })

    const personalRow = screen.getByRole("button", { name: /personal/i })
    await act(async () => {
      personalRow.click()
    })

    // The bug: `disabled={isPending && !isSwitchingThis}` left the row just
    // clicked enabled (only OTHER rows were disabled), so it could be
    // clicked again before the first `switchWorkspace` call resolved.
    expect((personalRow as HTMLButtonElement).disabled).toBe(true)
    expect(mockSwitchWorkspace).toHaveBeenCalledTimes(1)

    // A disabled native <button> does not dispatch a click at all, so this
    // must not increase the call count.
    personalRow.click()
    expect(mockSwitchWorkspace).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSwitch({ ok: true, data: { landingRoute: "/personal" } })
    })
  })

  it("offers the other shell of the same school to a staff member who is also a parent (D-109)", async () => {
    render(
      <WorkspaceSwitcher
        workspaces={[WORKSPACES[0]!]}
        currentWorkspaceId={WORKSPACES[0]!.workspaceId}
        t={T}
        shellLink={{ href: "/family", label: T.myChildren }}
      />
    )

    // One workspace, but the chip is still tappable because of the link.
    await act(async () => {
      screen.getByRole("button", { name: /switch workspace/i }).click()
    })
    expect(
      screen.getByRole("link", { name: "My children" }).getAttribute("href")
    ).toBe("/family")
    expect(screen.getByText("You are also a parent here")).toBeTruthy()
  })

  it("shows no shell link without one", async () => {
    render(
      <WorkspaceSwitcher
        workspaces={WORKSPACES}
        currentWorkspaceId={WORKSPACES[0]!.workspaceId}
        t={T}
      />
    )
    await act(async () => {
      screen.getByRole("button", { name: /switch workspace/i }).click()
    })
    expect(screen.queryByRole("link", { name: "My children" })).toBeNull()
  })
})
