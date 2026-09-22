/**
 * @purpose Verify pure investment domain rules for trade replay and P&L math.
 * @role    Unit regression tests for weighted-average cost and realized/unrealized P&L.
 * @deps    Vitest and the pure investment rules module.
 * @gotcha  P&L is derived from trades; these rules must never fabricate cashflow or asset rows.
 */

import { describe, expect, it } from "vitest"
import {
  applyTrade,
  computeUnrealizedPnl,
  createEmptyPositionState,
  InvestmentRuleError,
  normalizeSymbol,
  replayTrades,
} from "../src/domain/investments/investment-rules"

function buy(quantity: string, price: string, feeAmount: string | null = null) {
  return { side: "buy" as const, quantity, price, feeAmount }
}

function sell(quantity: string, price: string, feeAmount: string | null = null) {
  return { side: "sell" as const, quantity, price, feeAmount }
}

describe("applyTrade", () => {
  it("builds weighted-average cost across buys", () => {
    const state = replayTrades([buy("100", "10"), buy("100", "12")])
    expect(state.quantity).toBe(200)
    expect(state.costBasisAmount).toBeCloseTo(2200, 6)
    expect(state.avgCostPrice).toBeCloseTo(11, 6)
  })

  it("includes buy fees in the cost basis", () => {
    const state = applyTrade(createEmptyPositionState(), buy("100", "10", "5"))
    expect(state.quantity).toBe(100)
    expect(state.costBasisAmount).toBeCloseTo(1005, 6)
    expect(state.avgCostPrice).toBeCloseTo(10.05, 6)
  })

  it("books realized P&L on partial sells and keeps the average cost", () => {
    const held = replayTrades([buy("200", "11")])
    const state = applyTrade(held, sell("100", "13", "6"))
    expect(state.quantity).toBe(100)
    expect(state.realizedPnlAmount).toBeCloseTo(194, 6)
    expect(state.avgCostPrice).toBeCloseTo(11, 6)
    expect(state.costBasisAmount).toBeCloseTo(1100, 6)
  })

  it("resets the cost basis when a position is fully sold", () => {
    const state = replayTrades([buy("200", "11"), sell("200", "13")])
    expect(state.quantity).toBe(0)
    expect(state.costBasisAmount).toBe(0)
    expect(state.avgCostPrice).toBe(0)
    expect(state.realizedPnlAmount).toBeCloseTo(400, 6)
  })

  it("accumulates realized P&L across sell legs", () => {
    const state = replayTrades([buy("200", "11"), sell("100", "13"), sell("50", "9")])
    // (13-11)*100 + (9-11)*50 = 200 - 100
    expect(state.realizedPnlAmount).toBeCloseTo(100, 6)
    expect(state.quantity).toBe(50)
  })

  it("rejects selling more than the open position", () => {
    const held = replayTrades([buy("100", "10")])
    expect(() => applyTrade(held, sell("101", "11"))).toThrow(InvestmentRuleError)
  })

  it("rejects non-positive quantity, price, and negative fees", () => {
    expect(() => applyTrade(createEmptyPositionState(), buy("0", "10"))).toThrow(
      InvestmentRuleError,
    )
    expect(() => applyTrade(createEmptyPositionState(), buy("-1", "10"))).toThrow(
      InvestmentRuleError,
    )
    expect(() => applyTrade(createEmptyPositionState(), buy("1", "0"))).toThrow(InvestmentRuleError)
    expect(() => applyTrade(createEmptyPositionState(), buy("1", "abc"))).toThrow(
      InvestmentRuleError,
    )
    expect(() => applyTrade(createEmptyPositionState(), buy("1", "10", "-1"))).toThrow(
      InvestmentRuleError,
    )
  })

  it("supports fractional fund shares", () => {
    const state = replayTrades([buy("1234.5678", "1.2345")])
    expect(state.quantity).toBeCloseTo(1234.5678, 6)
    expect(state.avgCostPrice).toBeCloseTo(1.2345, 6)
  })
})

describe("computeUnrealizedPnl", () => {
  const held = replayTrades([buy("100", "10")])

  it("values the position at the latest quote", () => {
    const pnl = computeUnrealizedPnl(held, 12)
    expect(pnl.marketValue).toBeCloseTo(1200, 6)
    expect(pnl.unrealizedPnl).toBeCloseTo(200, 6)
    expect(pnl.unrealizedPnlPercent).toBeCloseTo(20, 6)
  })

  it("falls back to average cost when no quote exists", () => {
    const pnl = computeUnrealizedPnl(held, null)
    expect(pnl.marketValue).toBeCloseTo(1000, 6)
    expect(pnl.unrealizedPnl).toBeCloseTo(0, 6)
  })

  it("ignores non-positive or invalid prices and uses the fallback", () => {
    expect(computeUnrealizedPnl(held, 0).marketValue).toBeCloseTo(1000, 6)
    expect(computeUnrealizedPnl(held, Number.NaN).marketValue).toBeCloseTo(1000, 6)
  })

  it("reports a null percent for an empty position", () => {
    const pnl = computeUnrealizedPnl(createEmptyPositionState(), 12)
    expect(pnl.marketValue).toBe(0)
    expect(pnl.unrealizedPnlPercent).toBeNull()
  })
})

describe("normalizeSymbol", () => {
  it("trims and upper-cases symbols so quotes match positions", () => {
    expect(normalizeSymbol("  aapl ")).toBe("AAPL")
    expect(normalizeSymbol("005827")).toBe("005827")
  })
})
