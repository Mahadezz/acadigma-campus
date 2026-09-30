import Link from "next/link"

import { GridMark, PRODUCT_NAMES } from "@acadigma/ui/primitives/logo"

import { LanguageToggle } from "@/app/(auth)/language-toggle"
import type { Locale, Messages } from "@/lib/i18n"
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents"

import { CONTACT, PRODUCTS, WEBSITE_URL, productUrl } from "./products"

/**
 * The acadigma.com footer (`acadigma-website/src/components/site/site-footer.tsx`),
 * ported without `motion`: a `dark` section on any theme, product, follow and
 * company columns, and the static "Acadigma" wordmark (the website's
 * parallax is dropped, D-410). Adds the legal documents (D-114) and the
 * language switch, which the website does not have.
 */
export function SiteFooter({
  t,
  locale,
}: {
  t: Messages["frontDoor"]
  locale: Locale
}) {
  const f = t.footer
  const columns = [
    {
      label: f.follow,
      links: CONTACT.social.map((s) => ({ name: s.name, href: s.href })),
    },
    {
      label: f.company,
      links: [
        { name: f.website, href: WEBSITE_URL },
        { name: f.pricing, href: `${WEBSITE_URL}/#pricing` },
        { name: f.faq, href: `${WEBSITE_URL}/#faq` },
      ],
    },
  ]

  return (
    <footer className="dark relative overflow-hidden bg-background pt-16 text-foreground sm:pt-20">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 md:grid-cols-12 md:gap-12">
        <div className="md:col-span-4">
          <div className="flex items-center gap-3 text-lg font-medium tracking-[-0.02em]">
            <GridMark className="size-6" />
            Acadigma
          </div>
          <p className="mt-5 max-w-xs text-muted-foreground">{f.tagline}</p>
          <a
            className="mt-5 inline-flex min-h-11 items-center text-sm hover:underline"
            href={`mailto:${CONTACT.email}`}
          >
            {CONTACT.email}
          </a>
        </div>

        <nav aria-label={f.products} className="md:col-span-3">
          <h2 className="eyebrow text-muted-foreground">{f.products}</h2>
          <ul className="mt-4">
            {PRODUCTS.map((p) => (
              <li key={p.key}>
                <a
                  href={productUrl(p.key)}
                  className="group flex min-h-11 items-center gap-3 text-sm"
                >
                  <GridMark
                    mark={p.key}
                    className="size-4 opacity-60 transition-opacity group-hover:opacity-100"
                  />
                  {PRODUCT_NAMES[p.key]}
                  <span className="text-muted-foreground">
                    {t.apps.products[p.key].role}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {columns.map((c) => (
          <nav key={c.label} aria-label={c.label} className="md:col-span-2">
            <h2 className="eyebrow text-muted-foreground">{c.label}</h2>
            <ul className="mt-4">
              {c.links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="flex min-h-11 items-center text-sm hover:underline"
                  >
                    {l.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        {/* D-114: the documents people agree to, one tap from every public page. */}
        <nav aria-label={f.legal} className="md:col-span-12">
          <ul className="flex flex-wrap gap-x-6">
            {Object.entries(LEGAL_DOCUMENTS).map(([key, d]) => (
              <li key={key}>
                <Link
                  href={`/legal/${key}`}
                  className="flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mx-auto mt-10 flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-white/10 px-5 py-4 text-xs text-muted-foreground sm:px-8">
        <span>
          © {new Date().getFullYear()} Acadigma · {f.origin}
        </span>
        <LanguageToggle current={locale} />
      </div>

      {/* Decoration, not text: drawn by CSS `content` so contrast checks
          and screen readers never meet a 6%-opacity word. */}
      <div
        aria-hidden="true"
        className="pointer-events-none h-[18vw] overflow-hidden text-center text-[24vw] leading-[0.8] font-semibold tracking-[-0.07em] text-white/[0.06] select-none before:content-['Acadigma']"
      />
    </footer>
  )
}
