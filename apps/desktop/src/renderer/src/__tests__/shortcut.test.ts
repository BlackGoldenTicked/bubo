/**
 * @purpose Pin the key-press → shortcut-string mapping the native layer depends on.
 * @role    Unit tests for lib/shortcut.ts.
 * @deps    Vitest only.
 * @gotcha  The native parser accepts `Modifier+…+KeyCode` with the key last; a bare letter or a
 *          modifier-only press must be rejected here, otherwise registration fails at runtime.
 */

import { describe, expect, it } from "vitest"

import { formatShortcut, isModifierKey, shortcutFromKeyEvent } from "../lib/shortcut"

function press(overrides: Partial<Parameters<typeof shortcutFromKeyEvent>[0]> = {}) {
  return shortcutFromKeyEvent({
    key: "v",
    code: "KeyV",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  })
}

describe("shortcutFromKeyEvent", () => {
  it("builds a registrable string from the key code, not the produced character", () => {
    expect(press({ ctrlKey: true, shiftKey: true })).toBe("Control+Shift+V")
  })

  it("uses Super for Command so macOS registers the meta key", () => {
    expect(press({ metaKey: true })).toBe("Super+V")
  })

  it("puts the key last and keeps modifiers in a stable order", () => {
    expect(press({ metaKey: true, shiftKey: true, altKey: true, ctrlKey: true })).toBe(
      "Control+Alt+Shift+Super+V",
    )
  })

  it("maps digits, space and function keys to their codes", () => {
    expect(press({ code: "Digit1", key: "1", altKey: true })).toBe("Alt+1")
    expect(press({ code: "Space", key: " ", ctrlKey: true })).toBe("Control+Space")
    expect(press({ code: "F5", key: "F5", ctrlKey: true })).toBe("Control+F5")
  })

  it("rejects a modifier-only press", () => {
    expect(press({ key: "Shift", code: "ShiftLeft", shiftKey: true })).toBeNull()
    expect(isModifierKey({ key: "Fn" })).toBe(true)
  })

  it("rejects a bare letter, which a global hotkey must not swallow", () => {
    expect(press()).toBeNull()
  })
})

describe("formatShortcut", () => {
  it("renders the stored string as macOS symbols", () => {
    expect(formatShortcut("Control+Shift+KeyV")).toBe("⌃⇧V")
    expect(formatShortcut("Super+Alt+Digit1")).toBe("⌘⌥1")
  })

  it("translates key names that would read badly", () => {
    expect(formatShortcut("Control+Space")).toBe("⌃空格")
    expect(formatShortcut("Alt+ArrowUp")).toBe("⌥↑")
    expect(formatShortcut("Control+Escape")).toBe("⌃Esc")
  })

  it("keeps a legacy Fn request readable instead of dropping it", () => {
    expect(formatShortcut("Fn+P")).toBe("Fn+P")
  })

  it("falls back to a placeholder when empty", () => {
    expect(formatShortcut("")).toBe("未设置")
  })
})
