"use client"

import { useState, useSyncExternalStore } from "react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@acadigma/ui/components/tabs"

import type { Messages } from "@/lib/i18n"

import { DEVICES, detectDevice, type Device } from "./device"
import { InstallSteps } from "./install-parts"

type Copy = Messages["frontDoor"]["getApp"]

/** The user agent never changes during a visit. */
const subscribeNever = () => () => {}

/**
 * "Get the app" (F-ID-12 §4.3). The server renders the Web tab; after
 * hydration the tab for this device is selected. Campus is a PWA today, so
 * each tab gives the browser's own install steps. Store and desktop apps are
 * "coming later": no badges, no links (D-410). Loaded lazily by
 * `GetTheAppLazy`, which also owns the primary action and the Install button.
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
        <TabsContent key={d} value={d} className="space-y-5">
          <InstallSteps steps={t.steps[d]} />
          {d !== "web" ? (
            <p className="max-w-2xl text-base leading-relaxed">{t.native[d]}</p>
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  )
}
