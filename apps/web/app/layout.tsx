import { SkipToContent } from "@acadigma/ui/primitives/app-shell"

import { getMessages } from "@/lib/i18n"
import { getUiPreferences } from "@/lib/ui-preferences"

import { hindSiliguri, inter, jetbrainsMono } from "./fonts"
import { Providers } from "./providers"

import type { Metadata, Viewport } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Acadigma Campus",
    template: "%s · Acadigma Campus",
  },
  description:
    "School operations for Bangladesh: attendance that works offline, exams, marks, results and report cards, built for the phone in a teacher's hand.",
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
    // Matches --background in packages/ui/tokens/tokens.css (D-57 ink/paper).
    { media: "(prefers-color-scheme: light)", color: "#f4f4f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0b" },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // F-ID-02 §5 "Language resolution order" (demo cut, this Part): the same
  // `acadigma_locale` cookie the auth screens already read (`lib/i18n.ts`)
  // decides `<html lang>` for the whole app, signed in or not — this is what
  // makes `:lang(bn)` in tokens.css (D-68: Bengali font, zero letter-spacing)
  // apply from first paint instead of only inside components that set their
  // own `lang`.
  const { locale, t } = await getMessages()

  // F-ID-10 §5.2/§3 (D-403): `data-text-size` drives the root font-size scale
  // (tokens.css) from the very first server render — the same "cookie/row on
  // <html>, no client measurement" trick the line above uses for language.
  // `data-ui-mode` is read by Parts 2-3's basic shell; carried here so it is
  // never missing on the first paint of any page, this Part or later ones.
  const { uiMode, textSize } = await getUiPreferences()

  return (
    // suppressHydrationWarning is required by next-themes, which sets the theme
    // class on <html> from an inline script before React hydrates.
    <html
      lang={locale}
      data-text-size={textSize}
      data-ui-mode={uiMode}
      className={`${inter.variable} ${hindSiliguri.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: "(function(){var of=window.fetch;window.fetch=function(i,o){var u=String(i&&i.url?i.url:i);var h=(o&&o.headers)||{};var act=!!(h[\"Next-Action\"]||h[\"next-action\"]);var rsc=u.indexOf(\"_rsc\")>-1;var p=of.apply(window,arguments);if((act||rsc)&&u.indexOf(\"/app/\")>-1){var t=performance.now();var tag=(act?\"POST \":\"GET \")+u.replace(location.origin,\"\").slice(-28);p.then(function(r){var c=r.clone();var rd=c.body.getReader();var parts=[];var dec=new TextDecoder();var sizes=[];function pump(){return rd.read().then(function(x){if(x.done){console.log(\"[fx] END \"+tag+\" chunks=\"+sizes.join(\",\")+\" t=\"+Math.round(performance.now()-t));if(u.indexOf(\"_rsc\")>-1||act){console.log(\"[fxbody] \"+tag+\" \"+JSON.stringify(sizes)+\" \"+btoa(String.fromCharCode.apply(null,[].concat.apply([],parts.map(function(a){return Array.prototype.slice.call(a)}))).slice(0,200000)))}return}sizes.push(x.value.length);parts.push(x.value);return pump()})}pump().catch(function(e){console.log(\"[fx] ERR \"+tag+\" \"+e)})},function(){});}return p}})()" }} />
        
        <SkipToContent />
        <Providers offlineCopy={t.offline}>{children}</Providers>
      </body>
    </html>
  )
}
