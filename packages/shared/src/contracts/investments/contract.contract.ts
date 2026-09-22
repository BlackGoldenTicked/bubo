/**
 * @purpose Define browser-safe contract types for leveraged contract positions.
 * @role    DTO and input boundary for futures/perpetual tracking shared by renderer and API.
 * @deps    Shared bubo contract primitives.
 * @gotcha  Contract P&L never reaches net worth; only a margin balance recorded as an asset snapshot does.
 */

import type { BuboId } from "../common/bubo-primitives.contract"

export type ContractSide = "long" | "short"

export type ContractMarginMode = "isolated" | "cross"

export type ContractPositionStatus = "open" | "closed" | "liquidated"

export interface ContractPositionSummary {
  id: BuboId
  symbol: string
  side: ContractSide
  marginMode: ContractMarginMode
  /** Leverage ×10000 (10x = 100000) so the stored value stays an integer. */
  leverageBps: number
  quantity: string
  entryPrice: string
  /** Latest manually marked price; a long/short P&L uses it when present. */
  markPrice: string | null
  /** Fill price of the closing trade, recorded only when the user closes. */
  exitPrice: string | null
  liquidationPrice: string | null
  /** Margin posted for this position; falls back to notional/leverage for display math. */
  marginAmount: string | null
  currency: string
  status: ContractPositionStatus
  openedAt: string
  closedAt: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface ListContractPositionsInput {
  status?: ContractPositionStatus
}

export interface CreateContractPositionInput {
  symbol: string
  side: ContractSide
  marginMode?: ContractMarginMode
  /** Leverage ×10000; defaults to 1x (10000). Range: 1x to 125x. */
  leverageBps?: number
  quantity: string
  entryPrice: string
  markPrice?: string | null
  liquidationPrice?: string | null
  marginAmount?: string | null
  currency?: string
  openedAt?: string
  note?: string | null
}

export interface UpdateContractPositionInput {
  id: BuboId
  symbol?: string
  /** Manual mark update: the only price that moves open P&L. */
  markPrice?: string | null
  liquidationPrice?: string | null
  marginAmount?: string | null
  note?: string | null
}

export interface CloseContractPositionInput {
  id: BuboId
  /** Closed with a fill price, or liquidated with the margin lost in full. */
  outcome?: "closed" | "liquidated"
  exitPrice?: string | null
  closedAt?: string
}

export interface DeleteContractPositionInput {
  id: BuboId
}
