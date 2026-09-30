import Link from "next/link"

import { Logo } from "@acadigma/ui/primitives/logo"

import { CellField } from "@/app/(shared)/brand/cell-field"
import { WEBSITE_URL } from "@/lib/acadigma-website"
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents"

/**
 * Frame for sign-in, registration and password recovery, in the same
 * acadigma.com look as the front door (D-410): the cell texture behind the
 * form, the Campus lockup, and a one-line footer. The forms are unchanged.
 * The front door's full dark footer is not repeated here: on a phone it
 * became the largest text in view and pushed Lighthouse's LCP for `/login`
 * from 2.6 s to 4.1 s (CI run 36747315850).
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background">
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
      <footer className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 px-5 pb-4 text-xs text-muted-foreground sm:px-8">
        <span>© {new Date().getFullYear()} Acadigma</span>
        <a
          href={WEBSITE_URL}
          className="inline-flex min-h-11 items-center hover:text-foreground hover:underline"
        >
          acadigma.com
        </a>
        {/* D-114: the documents people agree to, one tap from every public page. */}
        {Object.entries(LEGAL_DOCUMENTS).map(([key, d]) => (
          <Link
            key={key}
            href={`/legal/${key}`}
            className="inline-flex min-h-11 items-center hover:text-foreground hover:underline"
          >
            {d.title}
          </Link>
        ))}
      </footer>
    </div>
  )
}
