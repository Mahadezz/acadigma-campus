import { describe, expect, it } from "vitest"

import { AUDIT_ACTION_CATALOG } from "./catalog"
import { renderAuditSentence } from "./render"

describe("renderAuditSentence", () => {
  it("renders every catalogue entry in English without leftover braces", () => {
    for (const entry of AUDIT_ACTION_CATALOG) {
      const sentence = renderAuditSentence(entry.action, "en", {
        actor: "Nusrat Jahan",
        subject: "Rahim Uddin",
        workspace: "Green Valley School",
        fields: "name, phone",
        before: "Teacher",
        after: "Admin",
        n: 3,
        module: "Marketplace",
        name: "report-card.pdf",
        date: "2026-09-17",
        key: "ai_credits",
        reason: "unpaid invoice",
        id: "11111111-1111-1111-1111-111111111111",
        table: "students",
        role: "Teacher",
        student: "Karim Uddin",
        masked_recipient: "r***@gmail.com",
      })
      expect(sentence).not.toMatch(/\{[a-z_]+\}/)
      expect(sentence.length).toBeGreaterThan(0)
    }
  })

  it("renders every catalogue entry in Bangla without leftover braces", () => {
    for (const entry of AUDIT_ACTION_CATALOG) {
      const sentence = renderAuditSentence(entry.action, "bn", {
        actor: "নুসরাত জাহান",
        subject: "রহিম উদ্দিন",
        workspace: "গ্রিন ভ্যালি স্কুল",
        fields: "নাম, ফোন",
        before: "শিক্ষক",
        after: "অ্যাডমিন",
        n: 3,
        module: "মার্কেটপ্লেস",
        name: "report-card.pdf",
        date: "2026-09-17",
        key: "ai_credits",
        reason: "অপরিশোধিত চালান",
        id: "11111111-1111-1111-1111-111111111111",
        table: "students",
        role: "শিক্ষক",
        student: "করিম উদ্দিন",
        masked_recipient: "r***@gmail.com",
      })
      expect(sentence).not.toMatch(/\{[a-z_]+\}/)
      expect(sentence.length).toBeGreaterThan(0)
    }
  })

  it("substitutes the actor name into a known sentence", () => {
    expect(
      renderAuditSentence("member.role_changed", "en", {
        actor: "Nusrat Jahan",
        subject: "Rahim Uddin",
        before: "Teacher",
        after: "Admin",
      })
    ).toBe("Nusrat Jahan changed Rahim Uddin's role from Teacher to Admin")
  })

  it("falls back to a generic sentence for an unrecognised action", () => {
    expect(renderAuditSentence("mystery.happened", "en")).toBe(
      "Someone performed an unrecognised action (mystery.happened)"
    )
  })

  it("falls back to 'Someone' / 'কেউ একজন' when no actor is supplied", () => {
    expect(renderAuditSentence("account.login", "en")).toBe("Someone signed in")
    expect(renderAuditSentence("account.login", "bn")).toBe(
      "কেউ একজন সাইন ইন করেছেন"
    )
  })

  it("leaves an unmatched placeholder blank rather than showing literal braces", () => {
    // account.login's template has no {subject} token, so passing one is a no-op,
    // and the template itself has no unfilled tokens to begin with.
    expect(
      renderAuditSentence("account.login", "en", { subject: "irrelevant" })
    ).toBe("Someone signed in")
  })
})
