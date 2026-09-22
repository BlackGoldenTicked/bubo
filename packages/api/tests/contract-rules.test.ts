/**
 * @purpose Verify pure contract-position rules for P&L direction, margin math, and leverage bounds.
 * @role    Unit regression tests for futures/perpetual display derivations.
 * @deps    Vitest and the pure contract rules module.
 * @gotcha  Contract P&L is derived math; these rules must never touch asset snapshots or cashflow.
 */

import { describe, expect, it } from "vitest"
import {
  computeContractPnl,
  normalizeLeverageBps,
  parseContractPrice,
  parseContractQuantity,
  parseOptionalAmount,
} from "../src/domain/investments/contract-rules"
import { InvestmentRuleError } from "../src/domain/investments/investment-rules"

function pnlInput(overrides: Partial<Parameters<typeof computeContractPnl>[0]> = {}) {
  return {
    side: "long" as const,
    quantity: "1",
    entryPrice: "100",
    markPrice: null as string | null,
    exitPrice: null as string | null,
    marginAmount: null as string | null,
    leverageBps: 10_000,
    status: "open" as const,
    ...overrides,
  }
}

describe("parseContractQuantity", () => {
  it("accepts positive quantities including fractional leverage sizes", () => {
    expect(parseContractQuantity("0.5")).toBeCloseTo(0.5, 8)
    expect(parseContractQuantity("100")).toBe(100)
  })

  it("rejects zero, negatives, and non-numeric values", () => {
    expect(() => parseContractQuantity("0")).toThrow(InvestmentRuleError)
    expect(() => parseContractQuantity("-1")).toThrow(InvestmentRuleError)
    expect(() => parseContractQuantity("abc")).toThrow(InvestmentRuleError)
    expect(() => parseContractQuantity(null)).toThrow(InvestmentRuleError)
  })
})

describe("parseContractPrice", () => {
  it("requires a positive price when not optional", () => {
    expect(parseContractPrice("100.5", "entryPrice")).toBeCloseTo(100.5, 8)
    expect(() => parseContractPrice("0", "entryPrice")).toThrow(InvestmentRuleError)
    expect(() => parseContractPrice("", "entryPrice")).toThrow(InvestmentRuleError)
  })

  it("returns null for empty input in optional mode and still validates non-empty values", () => {
    expect(parseContractPrice(null, "markPrice", { optional: true })).toBeNull()
    expect(parseContractPrice("", "markPrice", { optional: true })).toBeNull()
    expect(parseContractPrice("42", "markPrice", { optional: true })).toBe(42)
    expect(() => parseContractPrice("-1", "markPrice", { optional: true })).toThrow(
      InvestmentRuleError,
    )
  })
})

describe("parseOptionalAmount", () => {
  it("treats empty values as absent and requires non-negative numbers otherwise", () => {
    expect(parseOptionalAmount(null, "marginAmount")).toBeNull()
    expect(parseOptionalAmount("  ", "marginAmount")).toBeNull()
    expect(parseOptionalAmount("0", "marginAmount")).toBe(0)
    expect(parseOptionalAmount("120", "marginAmount")).toBe(120)
    expect(() => parseOptionalAmount("-1", "marginAmount")).toThrow(InvestmentRuleError)
  })
})

describe("normalizeLeverageBps", () => {
  it("defaults to 1x and truncates fractional bps", () => {
    expect(normalizeLeverageBps(null)).toBe(10_000)
    expect(normalizeLeverageBps(100_000.9)).toBe(100_000)
  })

  it("accepts the 1x–125x band and rejects values outside it", () => {
    expect(normalizeLeverageBps(1_250_000)).toBe(1_250_000)
    expect(() => normalizeLeverageBps(9_999)).toThrow(InvestmentRuleError)
    expect(() => normalizeLeverageBps(1_250_001)).toThrow(InvestmentRuleError)
    expect(() => normalizeLeverageBps(Number.NaN)).toThrow(InvestmentRuleError)
  })
})

describe("computeContractPnl", () => {
  it("values an open long above the entry and below it for a short", () => {
    const long = computeContractPnl(
      pnlInput({ side: "long", quantity: "2", entryPrice: "100", markPrice: "110" }),
    )
    expect(long.notionalValue).toBe(200)
    expect(long.unrealizedPnl).toBeCloseTo(20, 8)

    const short = computeContractPnl(
      pnlInput({ side: "short", quantity: "2", entryPrice: "100", markPrice: "90" }),
    )
    expect(short.unrealizedPnl).toBeCloseTo(20, 8)
  })

  it("falls back to the entry price when no mark exists, reporting zero P&L", () => {
    const pnl = computeContractPnl(pnlInput({ quantity: "2", entryPrice: "100", markPrice: null }))
    expect(pnl.unrealizedPnl).toBeCloseTo(0, 8)
    expect(pnl.unrealizedPnlPercent).toBeCloseTo(0, 8)
  })

  it("estimates the margin from notional/leverage and measures percent against it", () => {
    const pnl = computeContractPnl(
      pnlInput({
        quantity: "2",
        entryPrice: "100",
        markPrice: "110",
        leverageBps: 200_000,
      }),
    )
    // Notional 200 at 20x → 10 effective margin; +20 profit → +200% on margin.
    expect(pnl.effectiveMargin).toBeCloseTo(10, 8)
    expect(pnl.unrealizedPnlPercent).toBeCloseTo(200, 8)
  })

  it("prefers the recorded margin over the leverage estimate", () => {
    const pnl = computeContractPnl(
      pnlInput({
        quantity: "2",
        entryPrice: "100",
        markPrice: "110",
        leverageBps: 200_000,
        marginAmount: "50",
      }),
    )
    expect(pnl.effectiveMargin).toBeCloseTo(50, 8)
    expect(pnl.unrealizedPnlPercent).toBeCloseTo(40, 8)
  })

  it("computes realized P&L from the exit price once closed", () => {
    const closed = computeContractPnl(
      pnlInput({
        side: "short",
        quantity: "4",
        entryPrice: "3200",
        exitPrice: "2950",
        status: "closed",
      }),
    )
    expect(closed.unrealizedPnl).toBeNull()
    expect(closed.realizedPnl).toBeCloseTo(1000, 8)
  })

  it("reports a null realized P&L when a closed row has no exit price", () => {
    const closed = computeContractPnl(
      pnlInput({ quantity: "1", entryPrice: "100", exitPrice: null, status: "closed" }),
    )
    expect(closed.realizedPnl).toBeNull()
  })

  it("realizes the full effective margin as a loss on liquidation", () => {
    const liquidated = computeContractPnl(
      pnlInput({
        quantity: "50",
        entryPrice: "160",
        leverageBps: 200_000,
        status: "liquidated",
      }),
    )
    // Notional 8000 at 20x → 400 margin lost in full.
    expect(liquidated.realizedPnl).toBeCloseTo(-400, 8)
    expect(liquidated.unrealizedPnl).toBeNull()
  })
})
