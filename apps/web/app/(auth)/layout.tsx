import Link from "next/link"

import { Logo } from "@acadigma/ui/primitives/logo"

/** Centred, chrome-free frame for sign-in, registration and password recovery. */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-6">
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
        className="flex flex-1 items-start justify-center px-4 pb-16 sm:items-center"
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  )
}
