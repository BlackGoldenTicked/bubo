/**
 * @purpose Verify the investments page display math for market value and unrealized P&L.
 * @role    Unit test for the pure renderer helper.
 * @deps    Vitest and the local investmentDisplay module.
 * @gotcha  Keep expectations aligned with the API-side materialization fallback rules.
 */

import { describe, expect, it } from "vitest"
import { computePositionPnl } from "./investmentDisplay"

describe("computePositionPnl", () => {
  it("uses the latest quote when one is recorded", () => {
    const pnl = computePositionPnl({
      quantity: "10",
      avgCostPrice: "100.00",
      costBasisAmount: "1000.00",
      lastPrice: "120.00",
    })
    expect(pnl.priced).toBe(true)
    expect(pnl.marketValue).toBe(1200)
    expect(pnl.unrealizedPnl).toBe(200)
    expect(pnl.unrealizedPnlPercent).toBe(20)
  })

  it("falls back to the average cost without a quote", () => {
    const pnl = computePositionPnl({
      quantity: "10",
      avgCostPrice: "100.00",
      costBasisAmount: "1005.00",
      lastPrice: null,
    })
    expect(pnl.priced).toBe(false)
    expect(pnl.marketValue).toBe(1000)
    expect(pnl.unrealizedPnl).toBe(-5)
  })

  it("returns null percent when there is no cost basis", () => {
    const pnl = computePositionPnl({
      quantity: "0",
      avgCostPrice: null,
      costBasisAmount: "0.00",
      lastPrice: "50.00",
    })
    expect(pnl.unrealizedPnlPercent).toBeNull()
    expect(pnl.marketValue).toBe(0)
  })
})
