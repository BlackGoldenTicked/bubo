/**
 * @purpose Verify display-layer unrealized P&L math for asset snapshots.
 * @role    Renderer regression test for the pure assetPnl helper.
 * @deps    Vitest and the pure asset P&L helper.
 * @gotcha  P&L is a display estimate from manually maintained cost basis; it never changes net worth.
 */

import { describe, expect, it } from "vitest"
import { computeAssetPnl } from "./assetPnl"

function snapshot(overrides: Partial<Parameters<typeof computeAssetPnl>[0]> = {}) {
  return {
    valueNumber: "380000",
    valueCurrency: "CNY",
    costBasisAmount: "334400",
    costBasisCurrency: "CNY",
    ...overrides,
  }
}

describe("computeAssetPnl", () => {
  it("computes unrealized gain against the recorded cost basis", () => {
    const pnl = computeAssetPnl(snapshot())
    expect(pnl).not.toBeNull()
    expect(pnl?.costBasis).toBe(334400)
    expect(pnl?.pnlAmount).toBeCloseTo(45600, 6)
    expect(pnl?.pnlPercent).toBeCloseTo(13.6364, 3)
  })

  it("computes unrealized loss with a negative percent", () => {
    const pnl = computeAssetPnl(snapshot({ valueNumber: "80000" }))
    expect(pnl?.pnlAmount).toBeCloseTo(-254400, 6)
    expect(pnl?.pnlPercent).toBeLessThan(0)
  })

  it("returns null without a usable cost basis", () => {
    expect(computeAssetPnl(snapshot({ costBasisAmount: null }))).toBeNull()
    expect(computeAssetPnl(snapshot({ costBasisAmount: "" }))).toBeNull()
    expect(computeAssetPnl(snapshot({ costBasisAmount: "0" }))).toBeNull()
    expect(computeAssetPnl(snapshot({ costBasisAmount: "abc" }))).toBeNull()
  })

  it("skips cross-currency cost bases instead of mixing units", () => {
    expect(computeAssetPnl(snapshot({ costBasisCurrency: "USD" }))).toBeNull()
    // A null cost-basis currency is accepted; only explicit mismatches are skipped.
    expect(computeAssetPnl(snapshot({ costBasisCurrency: null }))).not.toBeNull()
  })
})
