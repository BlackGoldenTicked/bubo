/**
 * @purpose Define browser-safe asset contracts shared by renderer and API.
 * @role    DTO and input type boundary for present asset snapshot workflows.
 * @deps    Shared bubo contract primitives.
 * @gotcha  Asset snapshots are present-state records; do not infer them from imported cashflow.
 *          Cost basis is optional manual data used only for display-layer P&L.
 */

import type { BuboId, MoneyAmount } from "../common/bubo-primitives.contract"

export type AssetType =
  | "cash"
  | "bank"
  | "wallet"
  | "brokerage"
  | "fund"
  | "stock"
  | "crypto"
  | "real_estate"
  | "vehicle"
  | "fixed_asset"
  | "liability"
  | "other"

export type AssetSnapshotType = AssetType | "investment"

export interface AssetItemSummary {
  id: BuboId
  name: string
  assetType: AssetType
  institution: string | null
  defaultCurrency: string
  valuationMethod: string
  archived: boolean
  archivedAt: string | null
  note: string | null
}

export interface ListAssetItemsInput {
  assetType?: AssetType
  includeArchived?: boolean
}

export interface CreateAssetItemInput {
  name: string
  assetType: AssetType | "investment"
  institution?: string | null
  defaultCurrency?: string
  valuationMethod?: string
  displayOrder?: number
  note?: string | null
}

export interface UpdateAssetItemInput extends Partial<CreateAssetItemInput> {
  id: BuboId
}

export interface AssetSnapshotSummary {
  id: BuboId
  assetItemId: BuboId
  accountName: string
  assetType: AssetSnapshotType
  snapshotAt: string
  quantityNumber: string | null
  quantityCurrency: string | null
  quantityAmount: string | null
  quantityUnit: string | null
  valueNumber: string
  valueCurrency: string
  costBasisAmount: string | null
  costBasisCurrency: string | null
  source: string
  note: string | null
  meta: Record<string, unknown> | null
}

export interface ListAssetSnapshotsInput {
  assetItemId?: BuboId
  accountName?: string
  latestOnly?: boolean
  includeArchived?: boolean
}

export interface ListAssetSparklinesInput {
  limitPerAsset?: number
}

export interface AssetSparklinePoint {
  assetItemId: BuboId
  snapshotAt: string
  valueNumber: string
}

export interface AddAssetSnapshotInput {
  assetItemId: BuboId
  snapshotAt?: string
  valueAmount: string
  valueCurrency?: string
  quantityAmount?: string | null
  quantityUnit?: string | null
  costBasisAmount?: string | null
  costBasisCurrency?: string | null
  sourceKind?: string
  note?: string | null
}

export interface UpdateAssetSnapshotInput extends Partial<AddAssetSnapshotInput> {
  id: BuboId
}

export interface UpsertAssetSnapshotInput {
  id?: BuboId
  assetItemId?: BuboId
  accountName: string
  assetType: AssetSnapshotType
  snapshotAt?: string
  quantityNumber?: string | null
  quantityCurrency?: string | null
  valueNumber: string
  valueCurrency?: string
  source?: string
  note?: string | null
  meta?: Record<string, unknown> | null
}

export interface NetWorthInput {
  asOf?: string
  displayCurrency?: string
}

export interface NetWorthSnapshot {
  netWorth: MoneyAmount
  assetValue: MoneyAmount
  liabilityValue: MoneyAmount
  missingFx: Array<{ assetItemId: BuboId; currency: string; date: string }>
}

export interface AssetChangeInput {
  assetItemId: BuboId
  comparison?: "previous" | "30d" | "90d" | "1y"
}

export interface AssetChangeSummary {
  assetItemId: BuboId
  changeAmount: string
  changePercent: string
  comparisonLabel: string
  valueCurrency: string
}
