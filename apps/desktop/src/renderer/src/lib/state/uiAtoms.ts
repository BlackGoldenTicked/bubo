/**
 * @purpose Define renderer UI state atoms shared across pages.
 * @role    Client-side state module for view preferences and transient UI state.
 * @deps    Jotai atoms and local renderer state types.
 * @gotcha  Keep persisted finance data in the API/database layer, not UI atoms.
 */

import { atomWithStorage } from "jotai/utils"

/** Persisted theme choice; "system" follows the OS appearance. */
export type ThemePreference = "light" | "dark" | "system"

/** Concrete theme actually applied to the document and the native window. */
export type ResolvedTheme = "light" | "dark"

/** When true, every money amount renders masked (for demos, screenshots, or onlookers). */
export const amountsHiddenAtom = atomWithStorage<boolean>("bubo.amountsHidden", false)

/** Theme preference applied by `useThemeEffect`; also read by the boot script in index.html. */
export const themePreferenceAtom = atomWithStorage<ThemePreference>("bubo.theme", "system")
