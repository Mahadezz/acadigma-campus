import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { BottomNavFromConfig, type NavLinkRenderer } from "./bottom-nav"

import type { NavConfig, NavFilterContext } from "./nav-config"

const testConfig: NavConfig = {
  bottom: [
    {
      id: "home",
      href: "/app/dashboard",
      labelEn: "Home",
      labelBn: "হোম",
      icon: "home",
    },
    {
      id: "attendance",
      href: "/app/attendance",
      labelEn: "Attendance",
      labelBn: "হাজিরা",
      icon: "clipboard-check",
      roles: ["teacher"],
    },
    {
      id: "billing",
      href: "/app/billing",
      labelEn: "Billing",
      labelBn: "বিলিং",
      icon: "credit-card",
      module: "billing",
    },
  ],
  more: [
    {
      id: "group-1",
      labelEn: "Other",
      labelBn: "অন্যান্য",
      items: [
        {
          id: "reports",
          href: "/app/reports",
          labelEn: "Reports",
          labelBn: "রিপোর্ট",
          icon: "bar-chart-3",
          badge: { count: 3 },
        },
        {
          id: "audit",
          href: "/app/audit",
          labelEn: "Audit log",
          labelBn: "অডিট লগ",
          icon: "shield-check",
          // Owner-only within More (DESIGN-SYSTEM §3.2 footnote) is
          // `roles: ["owner"]`, not a separate `ownerOnly` flag — `owner` is
          // already its own `WorkspaceRole` (D-56).
          roles: ["owner"],
        },
      ],
    },
  ],
}

const testRenderLink: NavLinkRenderer = ({
  href,
  className,
  active,
  children,
  onNavigate,
}) => (
  <a
    href={href}
    className={className}
    aria-current={active ? "page" : undefined}
    onClick={onNavigate}
  >
    {children}
  </a>
)

function renderNav(filter: NavFilterContext, pathname = "/app") {
  return render(
    <BottomNavFromConfig
      config={testConfig}
      filter={filter}
      pathname={pathname}
      renderLink={testRenderLink}
    />
  )
}

describe("BottomNavFromConfig — role/plan/owner filtering", () => {
  it("hides a role-gated item for a role that lacks it", () => {
    renderNav({ role: "staff", hasModule: () => true })
    expect(screen.queryByText("Attendance")).not.toBeInTheDocument()
  })

  it("shows a role-gated item for a role that has it", () => {
    renderNav({ role: "teacher", hasModule: () => true })
    expect(screen.getByText("Attendance")).toBeInTheDocument()
  })

  it("hides a module-gated item when the module is not entitled", () => {
    renderNav({ role: "teacher", hasModule: () => false })
    expect(screen.queryByText("Billing")).not.toBeInTheDocument()
  })

  it("shows a module-gated item once the module is entitled", () => {
    renderNav({ role: "teacher", hasModule: () => true })
    expect(screen.getByText("Billing")).toBeInTheDocument()
  })

  it("marks the item matching the current route as active", () => {
    renderNav({ role: "teacher", hasModule: () => true }, "/app/attendance")
    expect(screen.getByText("Attendance").closest("a")).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(screen.getByText("Home").closest("a")).not.toHaveAttribute(
      "aria-current"
    )
  })
})

describe("BottomNavFromConfig — the More sheet", () => {
  it("renders a More tab that opens a sheet with the remaining items", async () => {
    const user = userEvent.setup()
    renderNav({ role: "teacher", hasModule: () => true })

    expect(screen.queryByText("Reports")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /more/i }))
    expect(screen.getByText("Reports")).toBeInTheDocument()
  })

  it("hides an owner-only item from a non-owner", async () => {
    const user = userEvent.setup()
    renderNav({ role: "teacher", hasModule: () => true })
    await user.click(screen.getByRole("button", { name: /more/i }))
    expect(screen.queryByText("Audit log")).not.toBeInTheDocument()
  })

  it("shows an owner-only item to the owner", async () => {
    const user = userEvent.setup()
    renderNav({ role: "owner", hasModule: () => true })
    await user.click(screen.getByRole("button", { name: /more/i }))
    expect(screen.getByText("Audit log")).toBeInTheDocument()
  })

  it("points the More trigger's aria-controls at the sheet content's id", async () => {
    const user = userEvent.setup()
    renderNav({ role: "teacher", hasModule: () => true })

    const trigger = screen.getByRole("button", { name: /more/i })
    const controlsId = trigger.getAttribute("aria-controls")
    expect(controlsId).toBeTruthy()

    await user.click(trigger)
    // The sheet content Radix renders (role="dialog") carries that same id.
    const sheet = screen.getByRole("dialog")
    expect(sheet).toHaveAttribute("id", controlsId)
  })

  it("does not render a More tab when every group is filtered to empty", () => {
    const emptyMoreConfig: NavConfig = {
      bottom: testConfig.bottom,
      more: [
        {
          id: "owner-only",
          labelEn: "Owner",
          labelBn: "মালিক",
          items: [
            {
              id: "x",
              href: "/x",
              labelEn: "X",
              labelBn: "এক্স",
              icon: "settings",
              roles: ["owner"],
            },
          ],
        },
      ],
    }
    render(
      <BottomNavFromConfig
        config={emptyMoreConfig}
        filter={{ role: "teacher", hasModule: () => true }}
        pathname="/app"
        renderLink={testRenderLink}
      />
    )
    expect(
      screen.queryByRole("button", { name: /more/i })
    ).not.toBeInTheDocument()
  })
})
