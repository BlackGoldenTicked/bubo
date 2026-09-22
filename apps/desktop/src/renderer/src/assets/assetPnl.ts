/**
 * @purpose Compute display-only unrealized P&L for investment-class asset snapshots.
 * @role    Pure renderer helper shared by the assets page and asset detail panel.
 * @deps    Shared asset snapshot contract fields only.
 * @gotcha  Display math only; never feed the result back into net worth or cashflow.
 */

import type { AssetSnapshotSummary } from "@bubo/shared/contracts"

export interface AssetPnl {
  costBasis: number
  pnlAmount: number
  pnlPercent: number
}

type PnlInput = Pick<
  AssetSnapshotSummary,
  "valueNumber" | "valueCurrency" | "costBasisAmount" | "costBasisCurrency"
>

/**
 * Unrealized P&L = current value − cost basis, shown against the snapshot itself.
 * Returns null when there is no usable cost basis (most accounts) or when the
 * cost basis is recorded in a different currency that this display layer cannot
 * convert (cross-currency conversion stays in the FX-aware API layer).
 */
export function computeAssetPnl(asset: PnlInput): AssetPnl | null {
  const costBasis = Number(asset.costBasisAmount ?? "")
  if (!Number.isFinite(costBasis) || costBasis <= 0) return null
  if (asset.costBasisCurrency && asset.costBasisCurrency !== asset.valueCurrency) return null
  const currentValue = Number(asset.valueNumber || 0)
  if (!Number.isFinite(currentValue)) return null
  const pnlAmount = currentValue - costBasis
  return {
    costBasis,
    pnlAmount,
    pnlPercent: (pnlAmount / costBasis) * 100,
  }
}
