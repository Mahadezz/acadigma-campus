import type { AuditEventDto } from "@acadigma/contracts/audit"
import { renderAuditSentence } from "@acadigma/domain/audit"
import { BnEnText } from "@acadigma/ui/primitives/bn-en-text"

type Language = "en" | "bn"

/** The plain-language sentence for one event (D-402) — never a raw code. */
export function auditSentence(event: AuditEventDto, language: Language) {
  return renderAuditSentence(event.action, language, {
    actor: event.actorName,
    subject: event.subjectName,
  })
}

/**
 * The same sentence, rendered through `BnEnText` so an English actor name in a
 * Bengali sentence (or the reverse) gets the right font and line height.
 */
export function AuditSentence({
  event,
  language,
}: {
  event: AuditEventDto
  language: Language
}) {
  return <BnEnText text={auditSentence(event, language)} />
}
