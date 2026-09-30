# F-ID-12 — Public front door and "Get the app"

|                  |                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Area             | identity (entry) · design lane                                                                   |
| Status           | Part 1 built (D-410, PR #128)                                                                    |
| Owner branch     | `feat/design-front-door`                                                                         |
| Depends on       | F-ID-01 (sign-in, registration — unchanged), D-68 (product marks), D-114 (legal links), D-408    |
| Offline          | the page is public and static in content; the service worker's existing rules apply, nothing new |
| Base44 reference | none                                                                                             |

## 1. Purpose

`campus.acadigma.com/` is the first screen a principal, teacher or parent sees. Owner request (2026-09-30): it "can be drastically improved"; it must be "in the exact same theme as the main website" (read from `acadigma-website`'s code, not invented); it must tell people how to **get the app on their device** — Android, iPhone, Windows, Mac or the web — and let them **sign in or register**; it links back to acadigma.com; and it is "not only for Campus" — the same flow must later serve Parents, Students and Ledger.

The previous page claimed fees/bKash, timetables and messaging, none of which is live (LEGAL-AUDIT-2026-09-29 finding #7). This page says only what is live.

## 2. Roles

Public. No session, no workspace, no data read. Signed-in visitors are not redirected (the page is the same for everyone; "Sign in" on `/login` already redirects a signed-in user to the app).

## 3. Data

None. Copy lives in `apps/web/messages/{en,bn}.json` under `frontDoor`. Product facts live in one config object, `apps/web/app/(marketing)/front-door/products.ts`.

## 4. Screen (phone first, 360×800; verified at 1280×800)

1. **Header** — the Acadigma lockup for this product (`Logo`, D-68) links to `https://acadigma.com`; a "Sign in" link on the right.
2. **Hero** — the product's grid mark on a chalk tile over the website's cell texture (static; no pointer tracking), a two-line headline in the website's type (semibold, tight tracking), one honest value line, **Sign in** (primary ink pill) and **Create account** (secondary).
3. **Get the app** — real ARIA tabs (`packages/ui` `Tabs`): Web · Android · iPhone · Windows · Mac. The server renders **Web**; after hydration the tab matching the user agent is selected. Each tab gives 2–3 install steps for that device (the app is an installable PWA, `app/manifest.ts`). Where the browser fires `beforeinstallprompt`, an **Install** button calls the real prompt. Native store/desktop builds are labelled **"Coming later"** — no store badges, no store links, no dates.
4. **Acadigma apps** — Campus (live, "you are here"), Parents (coming soon as its own app, matching acadigma.com; the card says that parents a school has invited can already sign in here to see their child's published results and report cards, which is what `/family` shows today), Students (coming soon), Ledger (coming soon). Each card shows its grid mark and links to `https://acadigma.com/<product>`.
5. **One Acadigma account** — the same email sign-in works across the apps; phone-number sign-in is not available yet (no date).
6. **Footer** — mirrors the website footer (dark, product list, follow links, company links) plus the legal documents (D-114) and the language switch.

The `(auth)` layout (`/login`, `/register`, `/forgot`, `/reset`, `/verify`, `/invite`) gets the same background texture and a matching footer; forms, server actions and validation are untouched.

## 5. Rules

- Only live features are named as live. Anything else is "coming soon" / "coming later" with no date.
- The front door and auth pages use the acadigma.com look (D-410); the signed-in app keeps D-408 glass.
- Adding a front door for another product is a new entry in `products.ts` and a route that renders `<FrontDoor product="…" />`. No host routing is built now.
- Western digits in both languages (`bn-BD-u-nu-latn`, DESIGN-SYSTEM §1.6).

## 8. Parts

| Part | Scope                                                                       | Demo                                                   |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1    | Front door for Campus, device chooser, apps row, account note, auth restyle | Land on `/`, pick a device, reach `/login`/`/register` |

## 9. Acceptance criteria (Part 1)

1. `/` renders an `h1` and the value line naming only attendance (incl. offline), classes and exams, marks → results, report cards.
2. "Sign in" reaches `/login`; "Create account" reaches `/register`.
3. The device chooser is a tablist with five tabs; Web is selected in the server HTML; choosing a tab shows that device's steps; an Android/iPhone/Windows/Mac panel says the store/desktop app is coming later and links to no store.
4. When `beforeinstallprompt` fires, an Install button is shown and calls `prompt()`; otherwise no Install button exists.
5. The apps row has four products; each "learn more" link points to `https://acadigma.com/<product>`; Students and Ledger are marked coming soon.
6. The header logo links to `https://acadigma.com`; the footer carries the legal document links.
7. All new copy exists in `en.json` and `bn.json`.
8. axe (WCAG 2.1 AA) is clean on `/`, `/login` and `/register` at 360×800 and 1280×800; targets are ≥ 44px; reduced motion is respected.

## 10. Tests

- Unit: `detectDevice(userAgent)` maps real UA strings to the right tab.
- Playwright `front-door.spec.ts` at both viewports with axe, covering AC 1–3, 5, 6.

## 11. Status

Part 1 — built (D-410, PR #128). Deviations: the website's pointer spotlight, animated hero mark and parallax footer are static here (no `motion` dependency); the second headline line uses muted ink, not the website's #a3a3a3, for contrast. The manifest's dead "Timetable" shortcut and the unbuilt-feature claims in the manifest and root metadata were removed.
