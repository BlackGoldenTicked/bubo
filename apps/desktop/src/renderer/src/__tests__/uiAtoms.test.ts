/**
 * @purpose Verify ui atoms.test behavior in the renderer test suite.
 * @role    Regression test for renderer utilities and shared UI behavior.
 * @deps    Vitest and the module under test.
 * @gotcha  Keep assertions deterministic and independent of live SQLite data.
 */

import { createStore } from "jotai/vanilla"
import { beforeEach, describe, expect, it } from "vitest"
import { amountsHiddenAtom, themePreferenceAtom, themeStyleAtom } from "../lib/state/uiAtoms"

describe("uiAtoms", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("defaults the amount-masking preference to visible", () => {
    const store = createStore()

    expect(store.get(amountsHiddenAtom)).toBe(false)
  })

  it("keeps the amount-masking preference in local UI state and storage", () => {
    const store = createStore()

    store.set(amountsHiddenAtom, true)

    expect(store.get(amountsHiddenAtom)).toBe(true)
    expect(window.localStorage.getItem("bubo.amountsHidden")).toBe("true")
  })

  it("defaults the theme preference to following the system", () => {
    const store = createStore()

    expect(store.get(themePreferenceAtom)).toBe("system")
  })

  it("persists an explicit theme preference in storage", () => {
    const store = createStore()

    store.set(themePreferenceAtom, "dark")

    expect(store.get(themePreferenceAtom)).toBe("dark")
    expect(window.localStorage.getItem("bubo.theme")).toBe('"dark"')
  })

  it("defaults the visual style to the bubo skin", () => {
    const store = createStore()

    expect(store.get(themeStyleAtom)).toBe("bubo")
  })

  it("persists the visual style independently of the theme mode", () => {
    const store = createStore()

    store.set(themeStyleAtom, "lumno")
    store.set(themePreferenceAtom, "dark")

    expect(store.get(themeStyleAtom)).toBe("lumno")
    expect(window.localStorage.getItem("bubo.style")).toBe('"lumno"')
    expect(window.localStorage.getItem("bubo.theme")).toBe('"dark"')
  })
})
