/**
 * @purpose Hold pure contract-position rules: P&L direction, margin fallback, and leverage bounds.
 * @role    Domain layer for leveraged futures/perpetual positions.
 * @deps    Shared contract types and investment rule errors.
 * @gotcha  Contract P&L never reaches net worth; margin balances enter through asset snapshots only.
 */

import type {
  ContractMarginMode,
  ContractPositionStatus,
  ContractSide,
} from "@bubo/shared/contracts"
import { InvestmentRuleError } from "./investment-rules"

export const CONTRACT_SIDES: ContractSide[] = ["long", "short"]
export const CONTRACT_MARGIN_MODES: ContractMarginMode[] = ["isolated", "cross"]
export const CONTRACT_STATUSES: ContractPositionStatus[] = ["open", "closed", "liquidated"]

/** Leverage bounds in bps (×10000): 1x up to 125x, the common exchange ceiling. */
export const MIN_LEVERAGE_BPS = 10_000
export const MAX_LEVERAGE_BPS = 1_250_000

export function isContractSide(value: string): value is ContractSide {
  return (CONTRACT_SIDES as string[]).includes(value)
}

export function isContractMarginMode(value: string): value is ContractMarginMode {
  return (CONTRACT_MARGIN_MODES as string[]).includes(value)
}

export function isContractStatus(value: string): value is ContractPositionStatus {
  return (CONTRACT_STATUSES as string[]).includes(value)
}

export function parseContractQuantity(value: string | null | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvestmentRuleError("quantity must be a positive number")
  }
  return parsed
}

export function parseContractPrice(value: string | null | undefined, label: string): number
export function parseContractPrice(
  value: string | null | undefined,
  label: string,
  options: { optional: boolean },
): number | null
export function parseContractPrice(
  value: string | null | undefined,
  label: string,
  options?: { optional?: boolean },
): number | null {
  if (value == null || value.trim() === "") {
    if (options?.optional) return null
    throw new InvestmentRuleError(`${label} must be a positive number`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvestmentRuleError(`${label} must be a positive number`)
  }
  return parsed
}

export function parseOptionalAmount(
  value: string | null | undefined,
  label: string,
): number | null {
  if (value == null || value.trim() === "") return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InvestmentRuleError(`${label} must be a non-negative number`)
  }
  return parsed
}

/** Defaults to 1x and rejects leverage outside the supported 1x–125x range. */
export function normalizeLeverageBps(value: number | null | undefined): number {
  if (value == null) return MIN_LEVERAGE_BPS
  if (!Number.isFinite(value)) throw new InvestmentRuleError("leverage must be a number")
  const leverage = Math.trunc(value)
  if (leverage < MIN_LEVERAGE_BPS || leverage > MAX_LEVERAGE_BPS) {
    throw new InvestmentRuleError("leverage must be between 1x and 125x")
  }
  return leverage
}

function toFinite(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export interface ContractPnlInput {
  side: ContractSide
  quantity: string
  entryPrice: string
  markPrice: string | null
  exitPrice: string | null
  marginAmount: string | null
  leverageBps: number
  status: ContractPositionStatus
}

export interface ContractPnl {
  /** entry price × quantity. */
  notionalValue: number
  /** Recorded margin, or the notional/leverage estimate used for display math. */
  effectiveMargin: number
  /** Open positions only; null once the row is closed or liquidated. */
  unrealizedPnl: number | null
  /** Return on margin (against effectiveMargin), not on notional. */
  unrealizedPnlPercent: number | null
  /** Fill-based result of a close, or the full margin lost on liquidation. */
  realizedPnl: number | null
}

/**
 * Long profits when the price rises, short when it falls. Without a mark price an
 * open position is valued at its entry (zero P&L), mirroring the spot fallback so
 * unpriced rows never invent gains.
 */
export function computeContractPnl(input: ContractPnlInput): ContractPnl {
  const quantity = toFinite(input.quantity) ?? 0
  const entry = toFinite(input.entryPrice) ?? 0
  const notionalValue = quantity * entry
  const direction = input.side === "long" ? 1 : -1

  const recordedMargin = toFinite(input.marginAmount)
  const leverage = input.leverageBps > 0 ? input.leverageBps / 10_000 : 1
  const effectiveMargin =
    recordedMargin != null && recordedMargin > 0
      ? recordedMargin
      : leverage > 0
        ? notionalValue / leverage
        : notionalValue

  if (input.status === "liquidated") {
    return {
      notionalValue,
      effectiveMargin,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
      // A liquidation loses the posted margin in full by definition.
      realizedPnl: -effectiveMargin,
    }
  }

  if (input.status === "closed") {
    const exit = toFinite(input.exitPrice)
    return {
      notionalValue,
      effectiveMargin,
      unrealizedPnl: null,
      unrealizedPnlPercent: null,
      realizedPnl: exit == null ? null : (exit - entry) * quantity * direction,
    }
  }

  const mark = toFinite(input.markPrice)
  const effectiveMark = mark != null && mark > 0 ? mark : entry
  const unrealizedPnl = (effectiveMark - entry) * quantity * direction
  return {
    notionalValue,
    effectiveMargin,
    unrealizedPnl,
    unrealizedPnlPercent: effectiveMargin > 0 ? (unrealizedPnl / effectiveMargin) * 100 : null,
    realizedPnl: null,
  }
}
