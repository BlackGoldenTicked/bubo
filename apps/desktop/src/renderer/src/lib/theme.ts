/**
 * @purpose Resolve and apply the renderer theme (light / dark / system).
 * @role    Theme bridge between the preference atom, the document, and the Tauri window.
 * @deps    Jotai theme atom and the Tauri window API.
 * @gotcha  Keep the stored preference in uiAtoms; this module only derives and applies it.
 */

import { useEffect } from "react"
import { useAtom } from "jotai"
import { themePreferenceAtom, type ResolvedTheme, type ThemePreference } from "./state/uiAtoms"

/** Pure resolution of a preference against the OS appearance — exported for tests. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light"
  return preference
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
 * Apply the stored preference to `<html data-theme>` (HeroUI + bubo tokens both
 * key off it) and to the native window appearance. While the preference is
 * "system" the effect follows OS changes live; `setTheme(null)` does the same
 * for the native title bar.
 */
export function useThemeEffect(): void {
  const [preference] = useAtom(themePreferenceAtom)

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
