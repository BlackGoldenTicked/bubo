/**
 * @purpose Define browser-safe investment contracts shared by renderer and API.
 * @role    DTO and input type boundary for trade-driven positions, manual quotes, and P&L.
 * @deps    Shared bubo contract primitives.
 * @gotcha  Market value reaches net worth only through materialized asset snapshots; trades never create cashflow.
 */

import type { BuboId } from "../common/bubo-primitives.contract"

export type InstrumentKind = "stock" | "fund" | "crypto" | "etf" | "bond" | "other"

export type InvestmentTransactionSide = "buy" | "sell"

export type InvestmentPositionStatus = "open" | "closed"

export interface InvestmentPositionSummary {
  id: BuboId
  /** Optional linked present-asset account whose market value this position contributes to. */
  assetItemId: BuboId | null
  accountName: string | null
  symbol: string
  name: string | null
  instrumentKind: InstrumentKind
  currency: string
  quantity: string
  avgCostPrice: string | null
  costBasisAmount: string | null
  realizedPnlAmount: string
  /** Latest manually recorded quote for this symbol, when one exists. */
  lastPrice: string | null
  lastPriceQuotedAt: string | null
  status: InvestmentPositionStatus
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface InvestmentTransactionSummary {
  id: BuboId
  positionId: BuboId
  side: InvestmentTransactionSide
  quantity: string
  price: string
  feeAmount: string | null
  executedAt: string
  note: string | null
  createdAt: string
}

export interface InvestmentPositionDetail {
  position: InvestmentPositionSummary
  /** Trade history in execution order; position state is the replay of these rows. */
  transactions: InvestmentTransactionSummary[]
}

export interface ListInvestmentPositionsInput {
  status?: InvestmentPositionStatus
  assetItemId?: BuboId
}

export interface GetInvestmentPositionInput {
  id: BuboId
}

export interface CreateInvestmentPositionInput {
  symbol: string
  name?: string | null
  instrumentKind: InstrumentKind
  currency?: string
  assetItemId?: BuboId | null
  note?: string | null
  /** Opening trade: every position starts from its first buy. */
  initialQuantity: string
  initialPrice: string
  initialFeeAmount?: string | null
  initialExecutedAt?: string
}

export interface UpdateInvestmentPositionInput {
  id: BuboId
  symbol?: string
  name?: string | null
  instrumentKind?: InstrumentKind
  assetItemId?: BuboId | null
  note?: string | null
}

export interface AddInvestmentTransactionInput {
  positionId: BuboId
  side: InvestmentTransactionSide
  quantity: string
  price: string
  feeAmount?: string | null
  executedAt: string
  note?: string | null
}

export interface DeleteInvestmentTransactionInput {
  id: BuboId
}

export interface DeleteInvestmentPositionInput {
  id: BuboId
}

export interface RecordPriceQuoteInput {
  symbol: string
  price: string
  currency?: string
  quotedAt?: string
}

export interface ListPriceQuotesInput {
  symbol: string
  limit?: number
}

export interface PriceQuoteSummary {
  id: BuboId
  symbol: string
  price: string
  currency: string
  quotedAt: string
  source: string
}
