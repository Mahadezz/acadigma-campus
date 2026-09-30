/**
 * The Acadigma apps, as the public front door shows them (F-ID-12, D-410).
 * One object, so a Parents/Students/Ledger front door later is a route that
 * renders `<FrontDoor product="…" />`, not new code. Status follows
 * acadigma.com (`acadigma-website/src/lib/site.ts`): only Campus is live;
 * Parents is "coming soon" as its own app even though invited parents can
 * already sign in to Campus (the copy says so).
 */
export const PRODUCTS = [
  { key: "campus", live: true },
  { key: "parents", live: false },
  { key: "students", live: false },
  { key: "ledger", live: false },
] as const

export type ProductKey = (typeof PRODUCTS)[number]["key"]

export const WEBSITE_URL = "https://acadigma.com"

/** acadigma.com/<product> is each app's detail page on the main website. */
export const productUrl = (key: ProductKey) => `${WEBSITE_URL}/${key}`

/** Copied from acadigma-website `src/lib/site.ts` `site.contact`. */
export const CONTACT = {
  email: "info@acadigma.com",
  social: [
    { name: "Instagram", href: "https://www.instagram.com/acadigma.app/" },
    {
      name: "Facebook",
      href: "https://www.facebook.com/profile.php?id=61590465128032",
    },
    { name: "LinkedIn", href: "https://www.linkedin.com/company/acadigma/" },
    { name: "WhatsApp", href: "https://wa.me/14027445283" },
  ],
} as const
