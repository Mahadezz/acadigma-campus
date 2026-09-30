import Link from "next/link"

import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"

import { buttonVariants } from "@acadigma/ui/components/button-variants"
import { cn } from "@acadigma/ui/lib/utils"
import { GridMark, Logo, PRODUCT_NAMES } from "@acadigma/ui/primitives/logo"

import { CellField } from "@/app/(shared)/brand/cell-field"
import { WEBSITE_URL } from "@/lib/acadigma-website"
import type { Locale, Messages } from "@/lib/i18n"

import { GetTheAppLazy } from "./get-the-app-lazy"
import { PRODUCTS, productUrl } from "./products"
import { SiteFooter } from "./site-footer"

type Copy = Messages["frontDoor"]
/** Products that have a front door today; each needs its own hero copy. */
export type FrontDoorProduct = keyof Copy["hero"]

/** acadigma.com's section headline (`suite.tsx`), shared by every section. */
const SECTION_TITLE =
  "text-[clamp(2.25rem,5vw,4.5rem)] leading-[0.98] font-semibold tracking-[-0.045em]"
/** acadigma.com's section rhythm. */
const SECTION = "mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32"

/**
 * The public front door (F-ID-12, D-410) in acadigma.com's look: the
 * website's hero scale and eyebrow, its pill buttons, its cell texture and
 * its dark footer, read from `acadigma-website` rather than invented.
 * Everything product-specific comes from `product` and the copy keyed by it.
 */
export function FrontDoor({
  product,
  t,
  locale,
}: {
  product: FrontDoorProduct
  t: Copy
  locale: Locale
}) {
  const hero = t.hero[product]
  const name = `Acadigma ${PRODUCT_NAMES[product]}`

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background">
      {/* The texture runs behind the header and the hero, as on acadigma.com. */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[56rem]">
        <CellField />
      </div>
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <a
          href={WEBSITE_URL}
          aria-label={t.homeLabel.replace("{name}", name)}
          className="inline-flex min-h-11 items-center"
        >
          <Logo product={product} />
        </a>
        <a
          href="#get-the-app"
          className={cn(
            buttonVariants({ variant: "secondary" }),
            "h-11 rounded-full px-5"
          )}
        >
          {t.getApp.title}
        </a>
      </header>
      <main id="main" className="flex-1">
        <section>
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pt-12 pb-16 sm:px-8 sm:pt-20 lg:grid-cols-12 lg:pt-10 lg:gap-8 lg:pb-24">
            <div className="lg:col-span-8">
              {/* acadigma.com's hero eyebrow, with an honest line. */}
              <p className="eyebrow inline-flex items-center gap-2.5 rounded-full bg-card/70 py-1.5 pr-4 pl-2 tracking-[0.14em] text-muted-foreground shadow-flat backdrop-blur">
                <span aria-hidden="true" className="relative flex size-2">
                  <span className="absolute inset-0 animate-ping rounded-full bg-foreground/40 motion-reduce:hidden" />
                  <span className="relative size-2 rounded-full bg-foreground" />
                </span>
                {t.eyebrow}
              </p>
              <h1 className="mt-8 text-[clamp(3rem,8.4vw,7.25rem)] leading-[0.92] font-semibold tracking-[-0.055em] text-balance">
                {hero.titleLine1}
                <br />
                {/* The website's second line is #a3a3a3 (2.3:1); muted ink passes AA. */}
                <span className="text-muted-foreground">{hero.titleLine2}</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
                {hero.lead}
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "group h-13 gap-3 rounded-full py-2 pr-2 pl-6 text-[15px]"
                  )}
                >
                  {t.signIn}
                  <span className="grid size-9 place-items-center rounded-full bg-primary-foreground text-primary">
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </span>
                </Link>
                <Link
                  href="/register"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "lg" }),
                    "h-13 rounded-full px-6 text-[15px] ring-1 ring-foreground/15 ring-inset hover:bg-foreground/[0.05]"
                  )}
                >
                  {t.createAccount}
                </Link>
              </div>
            </div>

            <div className="hidden lg:col-span-4 lg:block">
              <div className="relative mx-auto aspect-square w-full max-w-md">
                <div className="absolute inset-[6%] rounded-[2.5rem] bg-card shadow-[0_0_0_1px_rgb(11_11_11/0.05),0_40px_80px_-40px_rgb(11_11_11/0.35)]" />
                <div className="absolute inset-[24%]">
                  <GridMark mark={product} title={name} className="size-full" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="get-the-app"
          aria-labelledby="get-the-app-title"
          className={cn(SECTION, "scroll-mt-4")}
        >
          <h2 id="get-the-app-title" className={SECTION_TITLE}>
            {t.getApp.title}
          </h2>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            {t.getApp.lead}
          </p>
          <div className="mt-10">
            <GetTheAppLazy t={t.getApp} />
          </div>
        </section>

        <section
          aria-labelledby="apps-title"
          className={cn(SECTION, "pt-0 sm:pt-0")}
        >
          <h2 id="apps-title" className={SECTION_TITLE}>
            {t.apps.title}
          </h2>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            {t.apps.lead}
          </p>
          <ul className="mt-10 grid gap-3 lg:grid-cols-4">
            {PRODUCTS.map((p) => {
              const copy = t.apps.products[p.key]
              const about = t.apps.learnMore.replace(
                "{name}",
                PRODUCT_NAMES[p.key]
              )
              if (p.key === product) {
                // The current product is the one dark card (the website's dark tiles).
                return (
                  <li
                    key={p.key}
                    className="dark flex flex-col rounded-3xl bg-background p-6 text-foreground shadow-flat"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <GridMark mark={p.key} className="size-10" />
                      <span className="rounded-full px-3 py-1 text-xs font-medium ring-1 ring-foreground/15 ring-inset">
                        {t.apps.here}
                      </span>
                    </div>
                    <h3 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">
                      {PRODUCT_NAMES[p.key]}
                    </h3>
                    <p className="text-sm text-muted-foreground">{copy.role}</p>
                    <p className="mt-3 flex-1 text-[15px] leading-relaxed">
                      {copy.line}
                    </p>
                    <a
                      href={productUrl(p.key)}
                      className="group mt-6 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {about}
                      <ArrowUpRightIcon
                        aria-hidden="true"
                        className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                      />
                    </a>
                  </li>
                )
              }
              // Every other app: a compact row on a phone, a card from lg.
              return (
                <li
                  key={p.key}
                  className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-flat lg:flex-col lg:items-stretch lg:rounded-3xl lg:p-6"
                >
                  <GridMark mark={p.key} className="size-8 lg:size-10" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 lg:mt-6">
                      <h3 className="text-lg font-semibold tracking-[-0.02em] lg:text-2xl lg:tracking-[-0.03em]">
                        {PRODUCT_NAMES[p.key]}
                      </h3>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-foreground/15 ring-inset">
                        {p.live ? t.apps.live : t.apps.soon}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground lg:mt-3 lg:text-[15px] lg:text-foreground">
                      {copy.line}
                    </p>
                  </div>
                  <a
                    href={productUrl(p.key)}
                    aria-label={about}
                    className="grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-foreground/15 ring-inset hover:bg-foreground/[0.05] lg:mt-auto"
                  >
                    <ArrowUpRightIcon aria-hidden="true" className="size-4" />
                  </a>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="account-title" className="border-t">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-16 sm:flex-row sm:items-start sm:gap-10 sm:px-8 sm:py-20">
            <GridMark className="size-10 shrink-0" />
            <div className="max-w-2xl">
              <h2
                id="account-title"
                className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"
              >
                {t.account.title}
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                {t.account.body}
              </p>
              <p className="mt-4 text-[15px]">
                {t.account.support}{" "}
                <a
                  href={`${WEBSITE_URL}/#contact`}
                  className="inline-flex min-h-11 items-center font-medium underline underline-offset-4"
                >
                  {t.account.supportLink}
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter t={t} locale={locale} />
    </div>
  )
}
