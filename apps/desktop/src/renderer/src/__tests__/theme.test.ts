/**
 * @purpose Verify theme mode and visual style resolution in the renderer test suite.
 * @role    Regression test for the pure resolution applied at boot and at runtime.
 * @deps    Vitest and the theme module under test.
 * @gotcha  Keep it pure — the OS state is an argument, so no matchMedia mock is needed.
 */

import { describe, expect, it } from "vitest"
import { resolveStyle, resolveTheme } from "../lib/theme"

describe("resolveTheme", () => {
  it("follows the OS appearance while the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
  })

  it("keeps explicit preferences regardless of the OS appearance", () => {
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })
})

describe("resolveStyle", () => {
  it("keeps a style the token sheets define", () => {
    expect(resolveStyle("bubo")).toBe("bubo")
    expect(resolveStyle("lumno")).toBe("lumno")
  })

  it("falls back to the bubo skin for missing or unknown stored values", () => {
    expect(resolveStyle(null)).toBe("bubo")
    expect(resolveStyle(undefined)).toBe("bubo")
    expect(resolveStyle("")).toBe("bubo")
    expect(resolveStyle("crx")).toBe("bubo")
  })
})
