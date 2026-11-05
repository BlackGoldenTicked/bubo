/**
 * @purpose Define renderer UI state atoms shared across pages.
 * @role    Client-side state module for view preferences and transient UI state.
 * @deps    Jotai atoms and local renderer state types.
 * @gotcha  Keep persisted finance data in the API/database layer, not UI atoms.
 */

import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

/** Persisted theme choice; "system" follows the OS appearance. */
export type ThemePreference = "light" | "dark" | "system"

/** Concrete theme actually applied to the document and the native window. */
export type ResolvedTheme = "light" | "dark"

/**
 * Visual language applied to the document. "bubo" is the original flat green skin;
 * "lumno" is the crx-ui skin (gray page, white cards, pill controls, blue brand).
 * The two are independent: each ships its own light and dark token block.
 */
export type ThemeStyle = "bubo" | "lumno"

/** When true, every money amount renders masked (for demos, screenshots, or onlookers). */
export const amountsHiddenAtom = atomWithStorage<boolean>("bubo.amountsHidden", false)

/** Global voice capture overlay; transient, so it is a plain in-memory atom. */
export const voiceCaptureOpenAtom = atom<boolean>(false)

/** Theme preference applied by `useThemeEffect`; also read by the boot script in index.html. */
export const themePreferenceAtom = atomWithStorage<ThemePreference>("bubo.theme", "system")

/** Style preference applied by `useThemeEffect`; also read by the boot script in index.html. */
export const themeStyleAtom = atomWithStorage<ThemeStyle>("bubo.style", "bubo")
