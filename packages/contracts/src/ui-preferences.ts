import { z } from "zod"

/**
 * F-ID-10 Part 1 (D-403, D-404): `user_preferences.ui_mode`/`text_size`
 * (`20260925300312_user_preferences_ui.sql`). Enum parity with the Postgres
 * types `public.ui_mode` / `public.text_size` is asserted in
 * `ui-preferences.test.ts`, the same pattern `plans.test.ts` uses for
 * `subscription_status`/`access_mode` — kept in sync by hand, not generated,
 * same as every other enum in this package.
 */
export const uiModeSchema = z.enum(["full", "basic"])
export type UiMode = z.infer<typeof uiModeSchema>

export const textSizeSchema = z.enum(["normal", "large", "xlarge"])
export type TextSize = z.infer<typeof textSizeSchema>

/** `getUiPreferences` output (§7): the resolved, always-defined pair. */
export const uiPreferencesSchema = z
  .object({
    uiMode: uiModeSchema,
    textSize: textSizeSchema,
  })
  .strict()
export type UiPreferences = z.infer<typeof uiPreferencesSchema>

/**
 * `updateUiPreferences` input (§7): a genuine patch — at least one of the
 * two fields, `.strict()` rejects an unknown key. Unlike `updateLocale`
 * (a single bare string), this one changes two independent settings from
 * one screen (`/app/settings/display`), so it takes an object like every
 * other patch input in this package.
 */
export const updateUiPreferencesInputSchema = z
  .object({
    uiMode: uiModeSchema.optional(),
    textSize: textSizeSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.uiMode !== undefined || value.textSize !== undefined,
    {
      message: "Provide uiMode or textSize.",
    }
  )
export type UpdateUiPreferencesInput = z.infer<
  typeof updateUiPreferencesInputSchema
>
