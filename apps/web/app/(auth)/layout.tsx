import Link from "next/link"

import { Logo } from "@acadigma/ui/primitives/logo"

import { CellField } from "@/app/(marketing)/front-door/cell-field"
import { SiteFooter } from "@/app/(marketing)/front-door/site-footer"
import { getMessages } from "@/lib/i18n"

/**
 * Frame for sign-in, registration and password recovery, in the same
 * acadigma.com look as the front door (D-410): the cell texture behind the
 * form and the website's footer below it. The forms themselves are unchanged.
 * The language switch stays in each page's `AuthCard` footer, so the site
 * footer here omits its own.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { t } = await getMessages()

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="relative isolate flex flex-1 flex-col overflow-hidden">
        <CellField />
        <header className="mx-auto w-full max-w-7xl px-5 py-3 sm:px-8">
          <Link
            href="/"
            aria-label="Acadigma Campus home"
            className="inline-flex min-h-11 items-center"
          >
            <Logo product="campus" />
          </Link>
        </header>
        <main
          id="main"
          className="flex flex-1 items-start justify-center px-4 pt-4 pb-16 sm:items-center sm:pt-0"
        >
          <div className="w-full max-w-sm sm:max-w-md">{children}</div>
        </main>
      </div>
      <SiteFooter t={t.frontDoor} />
    </div>
  )
}
