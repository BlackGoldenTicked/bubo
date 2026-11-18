/**
 * @purpose Cover which mutations replay the save glow and how bursts are coalesced.
 * @role    Unit tests for the renderer save-glow trigger rules.
 * @deps    Vitest, jotai's default store, and the save-glow module.
 * @gotcha  An archive, delete, or settings write must stay silent: the glow means "a record
 *          landed", so firing it on a delete would read as a success confirmation for the wrong act.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { saveGlowNonceAtom } from "./state/uiAtoms"
import { appStore } from "./state/store"
import { mutationTriggersSaveGlow, playSaveGlow } from "./saveGlow"

/** tRPC's mutation key is a nested array: [["cashflow","create"]]. */
function key(...path: string[]): unknown[] {
  return [path]
}

describe("mutationTriggersSaveGlow", () => {
  it("fires for record-creating mutations across the finance domains", () => {
    expect(mutationTriggersSaveGlow(key("subscriptions", "create"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("subscriptions", "update"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("assets", "addSnapshot"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("investments", "recordQuote"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("cards", "create"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("imports", "convertStatementLines"))).toBe(true)
  })

  it("stays silent for deletes, archives, settings, and non-save mutations", () => {
    expect(mutationTriggersSaveGlow(key("cashflow", "delete"))).toBe(false)
    // The 记一笔 dialog and the batch window own this save and celebrate inside themselves.
    expect(mutationTriggersSaveGlow(key("cashflow", "create"))).toBe(false)
    expect(mutationTriggersSaveGlow(key("cashflow", "update"))).toBe(false)
    expect(mutationTriggersSaveGlow(key("cards", "archive"))).toBe(false)
    expect(mutationTriggersSaveGlow(key("reference", "updateCategory"))).toBe(false)
    expect(mutationTriggersSaveGlow(key("voice", "parseIntent"))).toBe(false)
    expect(mutationTriggersSaveGlow(key("assets", "change"))).toBe(false)
  })

  it("ignores malformed keys", () => {
    expect(mutationTriggersSaveGlow(undefined)).toBe(false)
    expect(mutationTriggersSaveGlow([])).toBe(false)
    expect(mutationTriggersSaveGlow([["cashflow"]])).toBe(false)
  })
})

describe("playSaveGlow", () => {
  const store = appStore
  // The coalescing window lives in module state, so each test needs its own clock
  // slot; resetting to the same instant would look like a burst to the guard.
  let clock = Date.UTC(2026, 10, 18, 6, 0, 0)

  beforeEach(() => {
    clock += 5_000
    store.set(saveGlowNonceAtom, 0)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(clock))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("bumps the nonce once per burst so a voice batch sweeps a single time", () => {
    playSaveGlow({ delayMs: 0 })
    playSaveGlow({ delayMs: 0 })
    playSaveGlow({ delayMs: 0 })
    expect(store.get(saveGlowNonceAtom)).toBe(1)

    vi.advanceTimersByTime(800)
    playSaveGlow({ delayMs: 0 })
    expect(store.get(saveGlowNonceAtom)).toBe(2)
  })

  it("defers playback so the closing dialog cannot sit on top of the wave", () => {
    playSaveGlow()
    expect(store.get(saveGlowNonceAtom)).toBe(0)

    vi.advanceTimersByTime(300)
    expect(store.get(saveGlowNonceAtom)).toBe(1)
  })
})
