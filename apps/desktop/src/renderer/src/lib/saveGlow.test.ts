/**
 * @purpose Cover which mutations replay the save glow and how bursts are coalesced.
 * @role    Unit tests for the renderer save-glow trigger rules.
 * @deps    Vitest, jotai's default store, and the save-glow module.
 * @gotcha  An archive, delete, or settings write must stay silent: the glow means "a record
 *          landed", so firing it on a delete would read as a success confirmation for the wrong act.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getDefaultStore } from "jotai"
import { saveGlowNonceAtom } from "./state/uiAtoms"
import { mutationTriggersSaveGlow, playSaveGlow } from "./saveGlow"

/** tRPC's mutation key is a nested array: [["cashflow","create"]]. */
function key(...path: string[]): unknown[] {
  return [path]
}

describe("mutationTriggersSaveGlow", () => {
  it("fires for record-creating mutations across the finance domains", () => {
    expect(mutationTriggersSaveGlow(key("cashflow", "create"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("subscriptions", "update"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("assets", "addSnapshot"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("investments", "recordQuote"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("cards", "create"))).toBe(true)
    expect(mutationTriggersSaveGlow(key("imports", "convertStatementLines"))).toBe(true)
  })

  it("stays silent for deletes, archives, settings, and non-save mutations", () => {
    expect(mutationTriggersSaveGlow(key("cashflow", "delete"))).toBe(false)
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
  const store = getDefaultStore()

  beforeEach(() => {
    store.set(saveGlowNonceAtom, 0)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-18T06:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("bumps the nonce once per burst so a voice batch flashes a single time", () => {
    playSaveGlow()
    playSaveGlow()
    playSaveGlow()
    expect(store.get(saveGlowNonceAtom)).toBe(1)

    vi.advanceTimersByTime(800)
    playSaveGlow()
    expect(store.get(saveGlowNonceAtom)).toBe(2)
  })
})
