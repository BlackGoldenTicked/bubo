/**
 * @purpose Provide label maps and display-only P&L math for the investments page.
 * @role    Pure renderer helper shared by the positions list and detail panel.
 * @deps    Shared investment contract fields only.
 * @gotcha  Display math only; materialized snapshots remain the single net-worth source.
 */

import type {
  InstrumentKind,
  InvestmentPositionStatus,
  InvestmentPositionSummary,
} from "@bubo/shared/contracts"

export const INSTRUMENT_LABELS: Record<InstrumentKind, string> = {
  stock: "股票",
  etf: "ETF",
  fund: "基金",
  bond: "债券",
  crypto: "加密货币",
  other: "其他",
}

export const INSTRUMENT_KIND_OPTIONS: InstrumentKind[] = [
  "stock",
  "etf",
  "fund",
  "bond",
  "crypto",
  "other",
]

export const STATUS_LABELS: Record<InvestmentPositionStatus, string> = {
  open: "持仓中",
  closed: "已清仓",
}

export const SIDE_LABELS = { buy: "买入", sell: "卖出" } as const

export interface PositionPnl {
  /** Market value using the latest quote, falling back to the average cost without one. */
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number | null
  /** Whether market value came from a recorded quote instead of the cost fallback. */
  priced: boolean
}

type PnlInput = Pick<
  InvestmentPositionSummary,
  "quantity" | "avgCostPrice" | "costBasisAmount" | "lastPrice"
>

/**
 * Unrealized P&L = market value − cost basis. Without a quote the position is
 * valued at its average cost (mirroring the materialized snapshot), so an
 * unpriced position reports zero P&L instead of dropping out of totals.
 */
export function computePositionPnl(position: PnlInput): PositionPnl {
  const quantity = Number(position.quantity || 0)
  const costBasis = Number(position.costBasisAmount ?? 0)
  const avgCost = Number(position.avgCostPrice ?? 0)
  const parsedPrice = Number(position.lastPrice ?? "")
  const priced = Number.isFinite(parsedPrice) && parsedPrice > 0
  const marketValue = quantity * (priced ? parsedPrice : avgCost)
  const unrealizedPnl = marketValue - costBasis
  return {
    marketValue,
    unrealizedPnl,
    unrealizedPnlPercent: costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : null,
    priced,
  }
}
