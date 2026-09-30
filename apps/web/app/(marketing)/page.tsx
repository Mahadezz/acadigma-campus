import { getMessages } from "@/lib/i18n"

import { FrontDoor } from "./front-door/front-door"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "Acadigma Campus: run your school from your phone" },
  description:
    "Attendance that works offline, classes and exams, marks that become results, and report cards ready to print. Install Campus on Android, iPhone, Windows, Mac or use it on the web.",
}

/** campus.acadigma.com/ (F-ID-12, D-410). */
export default async function HomePage() {
  const { locale, t } = await getMessages()
  return <FrontDoor product="campus" t={t.frontDoor} locale={locale} />
}
