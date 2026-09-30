"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import { DownloadIcon } from "lucide-react"

import { Button } from "@acadigma/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@acadigma/ui/components/tabs"

import type { Messages } from "@/lib/i18n"

import { DEVICES, detectDevice, type Device } from "./device"

type Copy = Messages["frontDoor"]["getApp"]

/** The user agent never changes during a visit. */
const subscribeNever = () => () => {}

/** Chromium's install event; not in lib.dom yet. */
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> }

/**
 * "Get the app" (F-ID-12 §4.3). The server renders the Web tab; after
 * hydration the tab for this device is selected. Campus is a PWA today, so
 * each tab gives the browser's own install steps, and a real Install button
 * appears only when the browser fires `beforeinstallprompt`. Store and
 * desktop apps are "coming later": no badges, no links (D-410).
 */
export function GetTheApp({ t }: { t: Copy }) {
  // The server cannot know the device: it renders Web, the browser then
  // switches to its own tab (progressive enhancement, no hydration mismatch).
  const detected = useSyncExternalStore(
    subscribeNever,
    () => detectDevice(navigator.userAgent, navigator.maxTouchPoints),
    () => "web" as const
  )
  const [chosen, setChosen] = useState<Device | null>(null)
  const device = chosen ?? detected
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(
    null
  )

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => setInstallEvent(null)
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    // The event can only be used once, whatever the person chose.
    setInstallEvent(null)
  }

  return (
    <Tabs
      value={device}
      onValueChange={(v) => setChosen(v as Device)}
      className="gap-6"
    >
      <TabsList
        aria-label={t.tabsLabel}
        className="grid h-auto w-full grid-cols-5 rounded-full bg-foreground/[0.05] p-1 group-data-[orientation=horizontal]/tabs:h-auto sm:inline-flex sm:w-fit"
      >
        {DEVICES.map((d) => (
          <TabsTrigger
            key={d}
            value={d}
            className="min-h-11 min-w-0 rounded-full px-1 text-[13px] text-muted-foreground sm:flex-none sm:px-4 sm:text-sm data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-flat dark:data-[state=active]:bg-card"
          >
            {t.devices[d]}
          </TabsTrigger>
        ))}
      </TabsList>

      {DEVICES.map((d) => (
        <TabsContent key={d} value={d} className="space-y-6">
          <ol className="grid gap-3 sm:grid-cols-3">
            {t.steps[d].map((step, i) => (
              <li
                key={step}
                className="flex gap-4 rounded-2xl bg-card p-5 shadow-flat sm:flex-col sm:gap-6"
              >
                <span
                  aria-hidden="true"
                  className="font-mono text-xs text-muted-foreground tabular-nums"
                >
                  0{i + 1}
                </span>
                <span className="text-[15px] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {installEvent ? (
              <Button
                type="button"
                onClick={install}
                className="h-12 rounded-full px-6"
              >
                <DownloadIcon aria-hidden="true" />
                {t.install}
              </Button>
            ) : null}
            {d !== "web" ? (
              <p className="text-sm text-muted-foreground">{t.native[d]}</p>
            ) : null}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  )
}
