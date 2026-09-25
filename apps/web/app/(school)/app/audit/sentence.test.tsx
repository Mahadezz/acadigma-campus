import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { AuditEventDto } from "@acadigma/contracts/audit"

import { AuditSentence, auditSentence } from "./sentence"

const EVENT: AuditEventDto = {
  id: "1",
  workspaceId: null,
  actorId: null,
  actorKind: "user",
  actorName: "Demo Owner",
  action: "school_profiles.update",
  tableName: "school_profiles",
  rowId: null,
  subjectUserId: null,
  subjectName: null,
  before: null,
  after: null,
  changedFields: ["header_line_1"],
  correlationId: null,
  requestIpHash: null,
  userAgentFamily: null,
  severity: "notable",
  createdAt: "2026-09-25T06:20:00.000Z",
}

describe("AuditSentence (D-402)", () => {
  it("reads as a sentence, with no table name or empty ()", () => {
    expect(auditSentence(EVENT, "en")).toBe(
      "Demo Owner updated a school setting"
    )
  })

  it("marks the Bengali run and the English actor name separately", () => {
    const { container } = render(<AuditSentence event={EVENT} language="bn" />)
    expect(container.textContent).toBe(
      "Demo Owner স্কুলের একটি সেটিং হালনাগাদ করেছেন"
    )
    const langs = Array.from(container.querySelectorAll("span[lang]")).map(
      (span) => span.getAttribute("lang")
    )
    expect(langs).toContain("en")
    expect(langs).toContain("bn")
  })
})
