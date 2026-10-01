"use client"

import { useState, useSyncExternalStore } from "react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@acadigma/ui/components/tabs"
import { cn } from "@acadigma/ui/lib/utils"

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
        className="relative grid h-auto w-full grid-cols-5 rounded-full bg-foreground/[0.05] p-1 group-data-[orientation=horizontal]/tabs:h-auto sm:inline-grid sm:w-fit"
      >
        {/* D-411: one pill slides to the chosen tab (the website's segmented
            feel). Five equal columns, so the offset is the tab's index. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)] rounded-full bg-card shadow-flat transition-transform duration-500 ease-out-expo"
          style={{ transform: `translateX(${DEVICES.indexOf(device) * 100}%)` }}
        />
        {DEVICES.map((d) => (
          <TabsTrigger
            key={d}
            value={d}
            className="min-h-11 min-w-0 rounded-full px-1 text-[13px] text-muted-foreground sm:px-4 sm:text-sm data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none group-data-[variant=default]/tabs-list:data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent"
          >
            {t.devices[d]}
          </TabsTrigger>
        ))}
      </TabsList>

      {DEVICES.map((d) => (
        <TabsContent
          key={d}
          value={d}
          // Only a tab the person picks animates; the first panel replaces
          // the server-rendered steps in place.
          className={cn("space-y-5", chosen && "motion-panel-in")}
        >
          <InstallSteps steps={t.steps[d]} />
          {d !== "web" ? (
            <p className="max-w-2xl text-base leading-relaxed">{t.native[d]}</p>
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  )
}
