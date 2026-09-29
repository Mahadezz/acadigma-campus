import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MemberRow } from "@acadigma/contracts"

import bn from "@/messages/bn.json"
import en from "@/messages/en.json"

import { decisionErrorText, TeamView } from "./team-view"

const mockApprove = vi.fn()
const mockReject = vi.fn()
const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))
vi.mock("./actions", () => ({
  approveMember: (...a: unknown[]) => mockApprove(...a),
  rejectMember: (...a: unknown[]) => mockReject(...a),
}))

const t = en.team

function member(over: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    fullName: "Anika Rahman",
    email: "anika@test.local",
    role: "teacher",
    status: "pending",
    viaInvitation: false,
    requestedAt: "2026-09-28T04:00:00Z",
    joinedAt: null,
    removedAt: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("TeamView (D-110)", () => {
  it("marks the current tab and keeps the search in the tab links", () => {
    render(
      <TeamView
        t={t}
        locale="en"
        input={{ status: "pending", q: "ani" }}
        members={[member()]}
        nextCursor={null}
        labels={[]}
      />
    )
    const current = screen.getByRole("link", { name: t.tabs.pending })
    expect(current.getAttribute("aria-current")).toBe("page")
    expect(
      screen.getByRole("link", { name: t.tabs.active }).getAttribute("href")
    ).toBe("/app/staff/team?q=ani")
    expect(screen.getAllByText(t.via.code).length).toBeGreaterThan(0)
  })

  it("approving says who can now use the school and refreshes", async () => {
    mockApprove.mockResolvedValue({
      ok: true,
      data: { id: member().id, status: "active" },
    })
    render(
      <TeamView
        t={t}
        locale="en"
        input={{ status: "pending" }}
        members={[member()]}
        nextCursor={null}
        labels={[]}
      />
    )
    fireEvent.click(
      screen.getAllByRole("button", { name: "Approve Anika Rahman" })[0]!
    )
    await waitFor(() =>
      expect(
        screen.getByText("Anika Rahman can now use the school as a teacher.")
      ).toBeTruthy()
    )
    expect(mockApprove).toHaveBeenCalledWith({ memberId: member().id })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("a decided request says so", async () => {
    mockReject.mockResolvedValue({
      ok: false,
      error: {
        code: "conflict",
        message: "x",
        fieldErrors: { _root: ["NOT_PENDING"] },
      },
    })
    render(
      <TeamView
        t={t}
        locale="en"
        input={{ status: "pending" }}
        members={[member()]}
        nextCursor={null}
        labels={[]}
      />
    )
    fireEvent.click(
      screen.getAllByRole("button", { name: "Turn down Anika Rahman" })[0]!
    )
    await waitFor(() =>
      expect(screen.getByText(t.errors.NOT_PENDING)).toBeTruthy()
    )
  })

  it("tells a turned-down request from a removed member", () => {
    render(
      <TeamView
        t={t}
        locale="en"
        input={{ status: "removed" }}
        members={[
          member({ status: "removed", removedAt: "2026-09-28T05:00:00Z" }),
          member({
            id: "00000000-0000-4000-8000-000000000002",
            fullName: "Babul Hossain",
            status: "removed",
            joinedAt: "2026-01-01T00:00:00Z",
            removedAt: "2026-09-28T05:00:00Z",
          }),
        ]}
        nextCursor={null}
        labels={[]}
      />
    )
    expect(screen.getAllByText(t.rejectedChip).length).toBeGreaterThan(0)
    expect(screen.getAllByText(t.removedChip).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull()
  })

  it("pages forward by cursor and back to the first page", () => {
    render(
      <TeamView
        t={t}
        locale="en"
        input={{ status: "active", after: member().id }}
        members={[member({ status: "active" })]}
        nextCursor="00000000-0000-4000-8000-000000000009"
        labels={[]}
      />
    )
    expect(
      screen.getByRole("link", { name: t.next }).getAttribute("href")
    ).toBe("/app/staff/team?after=00000000-0000-4000-8000-000000000009")
    expect(
      screen.getByRole("link", { name: t.first }).getAttribute("href")
    ).toBe("/app/staff/team")
  })

  it("an empty waiting list explains how people get there, in Bangla too", () => {
    render(
      <TeamView
        t={bn.team}
        locale="bn"
        input={{ status: "pending" }}
        members={[]}
        nextCursor={null}
        labels={[]}
      />
    )
    expect(screen.getByText(bn.team.empty.pending)).toBeTruthy()
    expect(screen.getByText(bn.team.emptyPendingDescription)).toBeTruthy()
  })
})

describe("decisionErrorText", () => {
  it.each([
    [{ code: "payment_required", message: "x" }, t.errors.readOnly],
    [{ code: "forbidden", message: "x" }, t.errors.forbidden],
    [{ code: "not_found", message: "x" }, t.errors.notFound],
    [{ code: "internal", message: "x" }, t.errors.generic],
  ] as const)("%o", (error, text) => {
    expect(decisionErrorText(t, error)).toBe(text)
  })
})
