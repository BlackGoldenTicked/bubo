/**
 * @purpose Resolve and apply the renderer theme mode (light / dark / system) and visual style.
 * @role    Theme bridge between the preference atoms, the document, and the Tauri window.
 * @deps    Jotai theme atoms and the Tauri window API.
 * @gotcha  Keep the stored preferences in uiAtoms; this module only derives and applies them.
 *          Only the resolved mode reaches the native window — the style choice is DOM-only.
 */

import { useEffect } from "react"
import { useAtom } from "jotai"
import {
  themePreferenceAtom,
  themeStyleAtom,
  type ResolvedTheme,
  type ThemePreference,
  type ThemeStyle,
} from "./state/uiAtoms"

/** Style values accepted from storage; mirrored by the pre-paint script in index.html. */
export const THEME_STYLES: readonly ThemeStyle[] = ["bubo", "lumno"]

/** Skin applied when storage holds nothing usable. */
export const DEFAULT_THEME_STYLE: ThemeStyle = "bubo"

/** Pure resolution of a preference against the OS appearance — exported for tests. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light"
  return preference
}

/** Pure validation of a stored style value — exported for tests. */
export function resolveStyle(stored: unknown): ThemeStyle {
  return THEME_STYLES.includes(stored as ThemeStyle) ? (stored as ThemeStyle) : DEFAULT_THEME_STYLE
}

/** Sync the native window appearance; no-op outside the Tauri shell (browser dev). */
async function syncWindowTheme(theme: ResolvedTheme | null): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window")
    await getCurrentWindow().setTheme(theme)
  } catch {
    // Browser preview has no Tauri window; the DOM theme still applies above.
  }
}

/**
 * Apply the stored preferences to `<html>`: `data-style` selects the visual
 * language (bubo or Lumno token block) and `data-theme` selects the mode that
 * HeroUI and the shared tokens both key off. The native window only follows the
 * mode. While the preference is "system" the effect follows OS changes live;
 * `setTheme(null)` does the same for the native title bar.
 */
export function useThemeEffect(): void {
  const [preference] = useAtom(themePreferenceAtom)
  const [style] = useAtom(themeStyleAtom)

  useEffect(() => {
    document.documentElement.dataset.style = resolveStyle(style)
  }, [style])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const resolved = resolveTheme(preference, media.matches)
      document.documentElement.dataset.theme = resolved
      void syncWindowTheme(preference === "system" ? null : resolved)
    }

    apply()
    if (preference !== "system") return
    media.addEventListener("change", apply)
    return () => media.removeEventListener("change", apply)
  }, [preference])
}
