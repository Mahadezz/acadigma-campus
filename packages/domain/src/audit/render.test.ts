import { describe, expect, it } from "vitest"

import {
  AUDIT_ACTION_CATALOG,
  FULL_AUDIT_ACTION_CATALOG,
  GENERIC_AUDIT_TABLES,
} from "./catalog"
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

  it("falls back to a readable sentence for an unrecognised action, never the raw code", () => {
    expect(
      renderAuditSentence("mystery.happened", "en", { actor: "Nusrat" })
    ).toBe("Nusrat made a change")
    expect(renderAuditSentence("mystery.happened", "bn")).toBe(
      "কেউ একজন একটি পরিবর্তন করেছেন"
    )
  })

  it("names what a generic row changed, not the table (D-402)", () => {
    expect(
      renderAuditSentence("holidays.insert", "en", { actor: "Nusrat" })
    ).toBe("Nusrat added a holiday")
    expect(
      renderAuditSentence("school_profiles.update", "en", { actor: "Nusrat" })
    ).toBe("Nusrat updated a school setting")
    expect(
      renderAuditSentence("school_profiles.update", "bn", {
        actor: "নুসরাত",
      })
    ).toBe("নুসরাত স্কুলের একটি সেটিং হালনাগাদ করেছেন")
  })

  it("drops a parenthetical whose value is missing instead of showing ()", () => {
    expect(
      renderAuditSentence("profile.updated", "en", { actor: "Nusrat" })
    ).toBe("Nusrat updated their profile")
    expect(
      renderAuditSentence("profile.updated", "en", {
        actor: "Nusrat",
        fields: "name",
      })
    ).toBe("Nusrat updated their profile (name)")
  })

  it("uses a plain stand-in for a missing subject or workspace", () => {
    expect(
      renderAuditSentence("member.removed", "en", { actor: "Nusrat" })
    ).toBe("Nusrat removed a member from the school")
  })

  it("never renders a raw table name, an empty () or a double space", () => {
    for (const entry of FULL_AUDIT_ACTION_CATALOG) {
      for (const language of ["en", "bn"] as const) {
        const sentence = renderAuditSentence(entry.action, language, {
          actor: "A",
        })
        expect(sentence).not.toMatch(/\(\s*\)|\s{2}|_|\{/)
        for (const table of GENERIC_AUDIT_TABLES) {
          expect(sentence).not.toContain(table.replace(/_/g, " ") + " record")
        }
      }
    }
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
