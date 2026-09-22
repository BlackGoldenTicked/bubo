/**
 * @purpose Provide label maps and display-only P&L math for contract positions.
 * @role    Pure renderer helper shared by the contract list and detail panel.
 * @deps    Shared contract fields only.
 * @gotcha  Display math only; contracts never feed net worth — margin balances enter
 *          through asset snapshots the user records on the assets page.
 */

import type {
  ContractMarginMode,
  ContractPositionStatus,
  ContractPositionSummary,
  ContractSide,
} from "@bubo/shared/contracts"

export const CONTRACT_SIDE_LABELS: Record<ContractSide, string> = {
  long: "多",
  short: "空",
}

export const CONTRACT_SIDE_OPTIONS: ContractSide[] = ["long", "short"]

export const MARGIN_MODE_LABELS: Record<ContractMarginMode, string> = {
  isolated: "逐仓",
  cross: "全仓",
}

export const MARGIN_MODE_OPTIONS: ContractMarginMode[] = ["isolated", "cross"]

export const CONTRACT_STATUS_LABELS: Record<ContractPositionStatus, string> = {
  open: "持仓中",
  closed: "已平仓",
  liquidated: "已爆仓",
}

/** Leverage shown as a multiple; 10000 bps renders as "1×". */
export function formatLeverage(leverageBps: number): string {
  const leverage = leverageBps / 10_000
  return `${Number.isInteger(leverage) ? leverage : leverage.toFixed(1)}×`
}

export interface ContractPnl {
  /** Entry price × quantity, in the row's currency. */
  notionalValue: number
  /** Recorded margin, or the notional/leverage estimate used for display math. */
  effectiveMargin: number
  leverage: number
  /** Open positions only; 0-free null pattern mirrors the domain rule. */
  unrealizedPnl: number | null
  /** Return on margin (against effectiveMargin), not on notional. */
  unrealizedPnlPercent: number | null
  /** Fill-based result of a close, or the full margin lost on liquidation. */
  realizedPnl: number | null
}

type PnlInput = Pick<
  ContractPositionSummary,
  | "side"
  | "quantity"
  | "entryPrice"
  | "markPrice"
  | "exitPrice"
  | "marginAmount"
  | "leverageBps"
  | "status"
>

function toFinite(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Mirrors the domain rule: long profits when the price rises, short when it
 * falls. Without a mark price an open position is valued at its entry, so an
 * unpriced contract reports zero P&L instead of inventing gains. Liquidations
 * lose the posted margin in full.
 */
export function computeContractPnl(position: PnlInput): ContractPnl {
  const quantity = toFinite(position.quantity) ?? 0
  const entry = toFinite(position.entryPrice) ?? 0
  const notionalValue = quantity * entry
  const direction = position.side === "long" ? 1 : -1
  const leverage = position.leverageBps > 0 ? position.leverageBps / 10_000 : 1

  const recordedMargin = toFinite(position.marginAmount)
  const effectiveMargin =
    recordedMargin != null && recordedMargin > 0
      ? recordedMargin
      : leverage > 0
        ? notionalValue / leverage
        : notionalValue

  if (position.status === "liquidated") {
    return {
      notionalValue,
      effectiveMargin,
      leverage,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
      realizedPnl: -effectiveMargin,
    }
  }

  if (position.status === "closed") {
    const exit = toFinite(position.exitPrice)
    return {
      notionalValue,
      effectiveMargin,
      leverage,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
      realizedPnl: exit == null ? null : (exit - entry) * quantity * direction,
    }
  }

  const mark = toFinite(position.markPrice)
  const effectiveMark = mark != null && mark > 0 ? mark : entry
  const unrealizedPnl = (effectiveMark - entry) * quantity * direction
  return {
    notionalValue,
    effectiveMargin,
    leverage,
    unrealizedPnl,
    unrealizedPnlPercent: effectiveMargin > 0 ? (unrealizedPnl / effectiveMargin) * 100 : null,
    realizedPnl: null,
  }
}
