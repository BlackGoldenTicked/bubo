/**
 * @purpose Hold pure investment domain rules: trade replay, weighted-average cost, and P&L math.
 * @role    Domain layer for trade-driven investment positions.
 * @deps    Shared investment contract types only.
 * @gotcha  Position state is always replayed from trades; quotes and cashflow must never mutate it.
 */

import type { InstrumentKind, InvestmentTransactionSide } from "@bubo/shared/contracts"

export const INSTRUMENT_KINDS: InstrumentKind[] = [
  "stock",
  "fund",
  "crypto",
  "etf",
  "bond",
  "other",
]

export class InvestmentRuleError extends Error {}

export interface TradeInput {
  side: InvestmentTransactionSide
  quantity: string
  price: string
  feeAmount: string | null
}

export interface PositionState {
  quantity: number
  costBasisAmount: number
  avgCostPrice: number
  realizedPnlAmount: number
}

/** Symbols compare case-insensitively across positions and quotes. */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase()
}

export function isInstrumentKind(value: string): value is InstrumentKind {
  return (INSTRUMENT_KINDS as string[]).includes(value)
}

function parsePositive(value: string | null | undefined, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvestmentRuleError(`${label} must be a positive number`)
  }
  return parsed
}

function parseFee(value: string | null | undefined): number {
  if (value == null || value.trim() === "") return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InvestmentRuleError("fee must be a non-negative number")
  }
  return parsed
}

export function createEmptyPositionState(): PositionState {
  return { quantity: 0, costBasisAmount: 0, avgCostPrice: 0, realizedPnlAmount: 0 }
}

/**
 * Apply one trade to a position state.
 *
 * Buy: weighted-average cost — new basis = old basis + quantity * price + fee.
 * Sell: realized P&L = (price − avgCost) * quantity − fee; the cost basis shrinks
 * proportionally while the average cost stays fixed. Selling more than the open
 * quantity is rejected.
 */
export function applyTrade(state: PositionState, trade: TradeInput): PositionState {
  const quantity = parsePositive(trade.quantity, "quantity")
  const price = parsePositive(trade.price, "price")
  const fee = parseFee(trade.feeAmount)

  if (trade.side === "buy") {
    const nextQuantity = state.quantity + quantity
    const nextCostBasis = state.costBasisAmount + quantity * price + fee
    return {
      quantity: nextQuantity,
      costBasisAmount: nextCostBasis,
      avgCostPrice: nextCostBasis / nextQuantity,
      realizedPnlAmount: state.realizedPnlAmount,
    }
  }

  if (quantity > state.quantity + 1e-9) {
    throw new InvestmentRuleError("sell quantity exceeds the open position")
  }
  const nextQuantity = Math.max(0, state.quantity - quantity)
  const realized = (price - state.avgCostPrice) * quantity - fee
  return {
    quantity: nextQuantity,
    costBasisAmount: nextQuantity === 0 ? 0 : state.avgCostPrice * nextQuantity,
    avgCostPrice: nextQuantity === 0 ? 0 : state.avgCostPrice,
    realizedPnlAmount: state.realizedPnlAmount + realized,
  }
}

/** Replay trades in execution order; the result is the position's derived state. */
export function replayTrades(trades: TradeInput[]): PositionState {
  return trades.reduce(applyTrade, createEmptyPositionState())
}

export interface UnrealizedPnl {
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number | null
}

/**
 * Market value uses the latest manual quote, falling back to the average cost
 * when no quote has been recorded yet (so an unpriced position reports zero P&L
 * instead of dropping out of totals).
 */
export function computeUnrealizedPnl(
  state: PositionState,
  lastPrice: number | null,
): UnrealizedPnl {
  const effectivePrice =
    lastPrice != null && Number.isFinite(lastPrice) && lastPrice > 0
      ? lastPrice
      : state.avgCostPrice
  const marketValue = state.quantity * effectivePrice
  const unrealizedPnl = marketValue - state.costBasisAmount
  return {
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent:
      state.costBasisAmount > 0 ? (unrealizedPnl / state.costBasisAmount) * 100 : null,
  }
}
