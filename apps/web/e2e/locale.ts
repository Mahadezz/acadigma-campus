import { expect, type Page } from "@playwright/test"

/**
 * D-408: the language picker lives only on Settings → Theme & language
 * (`/app/settings/appearance`), in both full and basic mode. Its radio
 * labels are "English" and "বাংলা" in either locale, so this works from any
 * starting language. Selecting the already-checked option is a no-op.
 */
export async function setLocale(page: Page, locale: "en" | "bn") {
  await page.goto("/app/settings/appearance")
  await page
    .getByRole("radio", { name: locale === "bn" ? "বাংলা" : "English" })
    .click()
  await expect(page.locator("html")).toHaveAttribute("lang", locale)
}
