"use client"

import { useState, useTransition } from "react"

import { useRouter } from "next/navigation"

import { CopyIcon, SendIcon, UserPlusIcon } from "lucide-react"

import type { Guardian, GuardianLink } from "@acadigma/contracts"
import { formatIsoDate } from "@acadigma/domain"
import { Badge } from "@acadigma/ui/components/badge"
import { Button } from "@acadigma/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@acadigma/ui/components/dialog"
import { Input } from "@acadigma/ui/components/input"
import { InlineAlert } from "@acadigma/ui/primitives/inline-alert"

import { OnlineOnly } from "@/app/(shared)/offline/online-only"
import type { Messages } from "@/lib/i18n"
import type { Locale } from "@/lib/locale"

import { inviteGuardian, revokeGuardianLink } from "../actions"

type Invite = { guardian: string; phone: string; url: string; expires: string }

/**
 * F-AC-02 Part 4 (D-108), owner/admin: invite a guardian to the parent app
 * (a single-use link to copy or send on WhatsApp — no SMS yet) and remove a
 * linked account's access.
 */
export function GuardianAccess({
  t,
  locale,
  studentName,
  guardians,
  links,
}: {
  t: Messages["students"]["access"]
  locale: Locale
  studentName: string
  guardians: Guardian[]
  links: GuardianLink[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<GuardianLink | null>(null)

  const linked = new Set(links.map((l) => l.guardianId))
  const nameOf = (g: Guardian) =>
    locale === "bn" && g.fullNameBn ? g.fullNameBn : g.fullName

  function start(g: Guardian) {
    setError(null)
    startTransition(async () => {
      const r = await inviteGuardian({ guardianId: g.id })
      if (!r.ok) {
        setError(r.error.message)
        return
      }
      setCopied(false)
      setInvite({
        guardian: nameOf(g),
        phone: g.phone,
        url: `${window.location.origin}/invite#${r.data.token}`,
        expires: formatIsoDate(
          r.data.expiresAt.slice(0, 10),
          locale === "bn" ? "bn-BD-u-nu-latn" : "en-GB"
        ),
      })
    })
  }

  function revoke(link: GuardianLink) {
    setError(null)
    startTransition(async () => {
      const r = await revokeGuardianLink({ linkId: link.id })
      setRevoking(null)
      if (!r.ok) setError(r.error.message)
      else router.refresh()
    })
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const whatsapp = invite
    ? `https://wa.me/${invite.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
        t.whatsappText
          .replace("{student}", studentName)
          .replace("{url}", invite.url)
      )}`
    : ""
  const account = (l: GuardianLink) =>
    l.accountName ?? l.accountEmail ?? t.unknownAccount

  return (
    <div className="space-y-3 border-t pt-3">
      <h3 className="text-sm font-medium">{t.title}</h3>
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

      {links.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.none}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex min-h-11 items-center justify-between gap-2"
            >
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{account(l)}</p>
                {l.accountName && l.accountEmail ? (
                  <p className="text-muted-foreground truncate text-xs">
                    {l.accountEmail}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary">{t.linked}</Badge>
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={pending}
                  onClick={() => setRevoking(l)}
                >
                  {t.revoke}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {guardians
        .filter((g) => !linked.has(g.id))
        .map((g) => (
          // F-ID-11 §4.9: an invitation is made on the server.
          <OnlineOnly key={g.id}>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              disabled={pending}
              onClick={() => start(g)}
            >
              <UserPlusIcon aria-hidden="true" />
              {t.invite.replace("{name}", nameOf(g))}
            </Button>
          </OnlineOnly>
        ))}

      <Dialog
        open={invite !== null}
        onOpenChange={(o) => !o && setInvite(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.linkTitle.replace("{name}", invite?.guardian ?? "")}
            </DialogTitle>
            <DialogDescription>
              {t.linkHelp
                .replace("{student}", studentName)
                .replace("{date}", invite?.expires ?? "")
                .replace("{name}", invite?.guardian ?? "")}
            </DialogDescription>
          </DialogHeader>
          <Input
            readOnly
            value={invite?.url ?? ""}
            aria-label={t.linkLabel}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11"
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => invite && void copy(invite.url)}
            >
              <CopyIcon aria-hidden="true" />
              {copied ? t.copied : t.copy}
            </Button>
            <Button asChild className="h-11">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                <SendIcon aria-hidden="true" />
                {t.whatsapp}
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t.revokeTitle.replace(
                "{account}",
                revoking ? account(revoking) : ""
              )}
            </DialogTitle>
            <DialogDescription>
              {t.revokeBody.replace("{student}", studentName)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setRevoking(null)}
            >
              {t.cancel}
            </Button>
            <Button
              variant="destructive"
              className="h-11"
              disabled={pending}
              onClick={() => revoking && revoke(revoking)}
            >
              {t.revoke}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
