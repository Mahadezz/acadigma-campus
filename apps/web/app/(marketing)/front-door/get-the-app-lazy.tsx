"use client"

import { useEffect, useState } from "react"

import { DownloadIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"

import type { Messages } from "@/lib/i18n"

import { InstallSteps, OpenCampusLink, PILL } from "./install-parts"

import type { GetTheApp as GetTheAppType } from "./get-the-app"

type Copy = Messages["frontDoor"]["getApp"]

/** Chromium's install event; not in lib.dom yet. */
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> }

/**
 * "Get the app" (F-ID-12 §4.3). The one filled action (Open Campus) and, only
 * when the browser fires `beforeinstallprompt`, a real Install button. The
 * device tabs sit below the fold, so their code (radix Tabs) loads after
 * hydration instead of on the hero's path (Lighthouse LCP, PR #128). Until
 * it arrives, the server-rendered fallback is the Web tab's steps, so nothing
 * is missing without JavaScript. The install listener lives here, not in the
 * lazy part, so an early `beforeinstallprompt` is not missed.
 */
export function GetTheAppLazy({ t }: { t: Copy }) {
  const [Chooser, setChooser] = useState<typeof GetTheAppType | null>(null)
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(
    null
  )

  useEffect(() => {
    let live = true
    void import("./get-the-app").then((m) => {
      if (live) setChooser(() => m.GetTheApp)
    })
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => setInstallEvent(null)
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      live = false
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  async function install() {
    if (!installEvent) return
    try {
      await installEvent.prompt()
    } finally {
      // The event can only be used once, whatever the person chose, and a
      // rejected prompt() must not leave a dead button behind.
      setInstallEvent(null)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <OpenCampusLink label={t.openCampus} />
        {installEvent ? (
          <Button
            type="button"
            variant="outline"
            onClick={install}
            className={PILL}
          >
            <DownloadIcon aria-hidden="true" />
            {t.install}
          </Button>
        ) : null}
      </div>
      {Chooser ? <Chooser t={t} /> : <InstallSteps steps={t.steps.web} />}
    </div>
  )
}
