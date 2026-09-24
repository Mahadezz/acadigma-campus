import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SidebarFromConfig } from "./sidebar-from-config"

import type { NavLinkRenderer } from "./bottom-nav"
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
      module: "attendance",
    },
  ],
  more: [
    {
      id: "admin",
      labelEn: "Admin",
      labelBn: "প্রশাসন",
      items: [
        {
          id: "audit",
          href: "/app/audit",
          labelEn: "Audit log",
          labelBn: "অডিট লগ",
          icon: "history",
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
}) => (
  <a
    href={href}
    className={className}
    aria-current={active ? "page" : undefined}
  >
    {children}
  </a>
)

function renderSidebar(filter: NavFilterContext, pathname = "/app") {
  return render(
    <SidebarFromConfig
      config={testConfig}
      filter={filter}
      pathname={pathname}
      renderLink={testRenderLink}
    />
  )
}

describe("SidebarFromConfig — DESIGN-SYSTEM §3.1 desktop rail", () => {
  it("renders the primary items with no More grouping (they are always visible)", () => {
    renderSidebar({ role: "teacher", hasModule: () => true })
    expect(screen.getByText("Home")).toBeInTheDocument()
    expect(screen.getByText("Attendance")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /more/i })).toBeNull()
  })

  it("renders every More group inline, with its label as a heading", () => {
    renderSidebar({ role: "owner", hasModule: () => true })
    expect(screen.getByText("Admin")).toBeInTheDocument()
    expect(screen.getByText("Audit log")).toBeInTheDocument()
  })

  it("hides an owner-only item from a non-owner, using the same filterNav as BottomNavFromConfig", () => {
    renderSidebar({ role: "teacher", hasModule: () => true })
    expect(screen.queryByText("Audit log")).not.toBeInTheDocument()
  })

  it("hides a module-gated item once the module is not entitled", () => {
    renderSidebar({ role: "teacher", hasModule: () => false })
    expect(screen.queryByText("Attendance")).not.toBeInTheDocument()
  })

  it("marks the item matching the current route as active", () => {
    renderSidebar({ role: "teacher", hasModule: () => true }, "/app/attendance")
    expect(screen.getByText("Attendance").closest("a")).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(screen.getByText("Home").closest("a")).not.toHaveAttribute(
      "aria-current"
    )
  })
})
