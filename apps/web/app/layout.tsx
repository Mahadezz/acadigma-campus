import { SkipToContent } from "@acadigma/ui/primitives/app-shell"

import { hindSiliguri, inter } from "./fonts"
import { Providers } from "./providers"

import type { Metadata, Viewport } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Acadigma Campus",
    template: "%s · Acadigma Campus",
  },
  description:
    "School operations for Bangladesh: attendance, timetables, marks, billing and messaging, built for the phone in a teacher's hand.",
  applicationName: "Acadigma Campus",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Acadigma",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom stays available — capping it fails WCAG 1.4.4.
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning is required by next-themes, which sets the theme
    // class on <html> from an inline script before React hydrates.
    <html
      lang="en"
      className={`${inter.variable} ${hindSiliguri.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <SkipToContent />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
