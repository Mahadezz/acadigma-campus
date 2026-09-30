import Link from "next/link"

import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"

import { buttonVariants } from "@acadigma/ui/components/button-variants"
import { cn } from "@acadigma/ui/lib/utils"
import { GridMark, Logo, PRODUCT_NAMES } from "@acadigma/ui/primitives/logo"

import type { Locale, Messages } from "@/lib/i18n"

import { CellField } from "./cell-field"
import { GetTheApp } from "./get-the-app"
import { PRODUCTS, WEBSITE_URL, productUrl } from "./products"
import { SiteFooter } from "./site-footer"

type Copy = Messages["frontDoor"]
/** Products that have a front door today; each needs its own hero copy. */
export type FrontDoorProduct = keyof Copy["hero"]

/**
 * The public front door (F-ID-12, D-410) in acadigma.com's look: the
 * website's hero type and pill buttons, its cell texture and its dark
 * footer, read from `acadigma-website` rather than invented. Everything
 * product-specific comes from `product` and the copy keyed by it.
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
    <div className="flex min-h-dvh flex-col bg-background">
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
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          {t.getApp.title}
        </a>
      </header>

      <main id="main" className="flex-1">
        <section className="relative isolate overflow-hidden">
          <CellField />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-6 pb-16 sm:px-8 sm:pt-12 lg:grid-cols-12 lg:gap-8 lg:pt-16 lg:pb-24">
            <div className="lg:col-span-7">
              <GridMark mark={product} className="size-12 lg:hidden" />
              <h1 className="mt-6 text-[clamp(2.5rem,8vw,6rem)] leading-[0.95] font-semibold tracking-[-0.05em] text-balance lg:mt-0">
                {hero.titleLine1}
                <br />
                {/* The website's second line is #a3a3a3 (2.3:1); muted ink passes AA. */}
                <span className="text-muted-foreground">{hero.titleLine2}</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
                {hero.lead}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
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

            <div className="hidden lg:col-span-5 lg:block">
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
          className="mx-auto max-w-7xl scroll-mt-4 px-5 py-16 sm:px-8 sm:py-24"
        >
          <h2
            id="get-the-app-title"
            className="text-[clamp(2rem,5vw,3.5rem)] leading-none font-semibold tracking-[-0.045em]"
          >
            {t.getApp.title}
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">{t.getApp.lead}</p>
          <div className="mt-8">
            <GetTheApp t={t.getApp} />
          </div>
        </section>

        <section
          aria-labelledby="apps-title"
          className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-24"
        >
          <h2
            id="apps-title"
            className="text-[clamp(2rem,5vw,3.5rem)] leading-none font-semibold tracking-[-0.045em]"
          >
            {t.apps.title}
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">{t.apps.lead}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCTS.map((p) => {
              const here = p.key === product
              const copy = t.apps.products[p.key]
              return (
                <li
                  key={p.key}
                  // The current product is the one inverted card (the website's dark tiles).
                  className={cn(
                    "flex flex-col rounded-3xl p-6 shadow-flat",
                    here ? "dark bg-background text-foreground" : "bg-card"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <GridMark mark={p.key} className="size-10" />
                    <span className="rounded-full px-3 py-1 text-xs font-medium ring-1 ring-foreground/15 ring-inset">
                      {here ? t.apps.here : p.live ? t.apps.live : t.apps.soon}
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
                    {t.apps.learnMore.replace("{name}", PRODUCT_NAMES[p.key])}
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                    />
                  </a>
                </li>
              )
            })}
          </ul>
        </section>

        <section
          aria-labelledby="account-title"
          className="border-t border-border"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-16 sm:flex-row sm:items-start sm:gap-10 sm:px-8">
            <GridMark className="size-10 shrink-0" />
            <div className="max-w-2xl">
              <h2
                id="account-title"
                className="text-2xl font-semibold tracking-[-0.03em]"
              >
                {t.account.title}
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {t.account.body}
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter t={t} locale={locale} />
    </div>
  )
}
