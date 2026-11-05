/**
 * @purpose Export the bubo product facade consumed by the Tauri data sidecar.
 * @role    Public API surface for cashflow, assets, budgets, imports, subscriptions, loans, and dashboard data.
 * @deps    @bubo/db schema, sqlite service modules, and seed helpers.
 * @gotcha  Preserve the asymmetric finance model across all facade methods.
 */

import { type Database } from "@bubo/db"
import { type Result } from "@bubo/shared"
import type {
  ActiveStatus,
  AddAssetSnapshotInput,
  AddInvestmentTransactionInput,
  AssetChangeInput,
  AssetChangeSummary,
  AssetItemSummary,
  AssetSnapshotSummary,
  AssetSparklinePoint,
  CashflowKind,
  CloseContractPositionInput,
  ContractPositionSummary,
  CreateAssetItemInput,
  CreateContractPositionInput,
  CreateInvestmentPositionInput,
  DeleteContractPositionInput,
  DeleteInvestmentPositionInput,
  DeleteInvestmentTransactionInput,
  Direction,
  GetInvestmentPositionInput,
  BuboId,
  InvestmentPositionDetail,
  InvestmentPositionSummary,
  ListAssetItemsInput,
  ListAssetSnapshotsInput,
  ListAssetSparklinesInput,
  ListContractPositionsInput,
  ListInvestmentPositionsInput,
  ListPriceQuotesInput,
  MoneyAmount,
  NetWorthInput,
  NetWorthSnapshot,
  PriceQuoteSummary,
  RecordPriceQuoteInput,
  UpdateAssetItemInput,
  UpdateAssetSnapshotInput,
  UpdateContractPositionInput,
  UpdateInvestmentPositionInput,
  UpsertAssetSnapshotInput,
} from "@bubo/shared/contracts"
import { BuboSqliteApi } from "./use-cases/dashboard/dashboard-api"

export type {
  ActiveStatus,
  AddAssetSnapshotInput,
  AddInvestmentTransactionInput,
  AssetChangeInput,
  AssetChangeSummary,
  AssetItemSummary,
  AssetSnapshotSummary,
  AssetSnapshotType,
  AssetSparklinePoint,
  AssetType,
  CashflowKind,
  CloseContractPositionInput,
  ContractMarginMode,
  ContractPositionStatus,
  ContractPositionSummary,
  ContractSide,
  CreateAssetItemInput,
  CreateContractPositionInput,
  CreateInvestmentPositionInput,
  DeleteContractPositionInput,
  DeleteInvestmentPositionInput,
  DeleteInvestmentTransactionInput,
  Direction,
  GetInvestmentPositionInput,
  BuboId,
  InstrumentKind,
  InvestmentPositionDetail,
  InvestmentPositionStatus,
  InvestmentPositionSummary,
  InvestmentTransactionSide,
  InvestmentTransactionSummary,
  ListAssetItemsInput,
  ListAssetSnapshotsInput,
  ListAssetSparklinesInput,
  ListContractPositionsInput,
  ListInvestmentPositionsInput,
  ListPriceQuotesInput,
  MoneyAmount,
  NetWorthInput,
  NetWorthSnapshot,
  PriceQuoteSummary,
  RecordPriceQuoteInput,
  UpdateAssetItemInput,
  UpdateAssetSnapshotInput,
  UpdateContractPositionInput,
  UpdateInvestmentPositionInput,
  UpsertAssetSnapshotInput,
} from "@bubo/shared/contracts"

export interface BuboApi {
  /** Wipe all user data. */
  resetAllData(): Promise<Result<void>>

  getCurrencySettings(): Promise<Result<CurrencySettingsSummary>>
  updateCurrencySettings(
    input: UpdateCurrencySettingsInput,
  ): Promise<Result<CurrencySettingsSummary>>
  listExchangeRates(input?: ListExchangeRatesInput): Promise<Result<ExchangeRateSummary[]>>
  refreshExchangeRates(
    input?: RefreshExchangeRatesInput,
  ): Promise<Result<RefreshExchangeRatesResult>>
  getCurrentRates(): Promise<Result<CurrentRates>>

  listCategories(input?: ListCategoriesInput): Promise<Result<CategorySummary[]>>
  createCategory(input: CreateCategoryInput): Promise<Result<CategorySummary>>
  updateCategory(input: UpdateCategoryInput): Promise<Result<CategorySummary>>
  archiveCategory(input: { id: BuboId }): Promise<Result<void>>

  importStatement(input: ImportStatementInput): Promise<Result<ImportedBatchResult>>
  importNormalizedStatementEntries(
    input: ImportNormalizedStatementEntriesInput,
  ): Promise<Result<ImportedBatchResult>>
  listStatementImports(input?: ListStatementImportsInput): Promise<Result<StatementImportSummary[]>>
  listStatementLines(input?: ListStatementLinesInput): Promise<Result<StatementLineSummary[]>>
  listImportedEntries(input?: ListImportedEntriesInput): Promise<Result<ImportedEntrySummary[]>>
  convertStatementLinesToCashflowEvents(
    input?: ConvertStatementLinesInput,
  ): Promise<Result<{ created: number; skipped: number }>>

  listCashflowEvents(input?: ListCashflowEventsInput): Promise<Result<CashflowEventSummary[]>>
  getCashflowEvent(id: BuboId): Promise<Result<CashflowEventSummary | null>>
  createCashflowEvent(input: CreateCashflowEventInput): Promise<Result<CashflowEventSummary>>
  updateCashflowEvent(input: UpdateCashflowEventInput): Promise<Result<CashflowEventSummary>>
  ignoreCashflowEvent(input: { id: BuboId }): Promise<Result<void>>
  deleteCashflowEvent(input: { id: BuboId }): Promise<Result<void>>
  setCashflowEventCategory(input: {
    id: BuboId
    categoryId: BuboId | null
  }): Promise<Result<CashflowEventSummary>>
  setCashflowEventTags(input: { id: BuboId; tagIds: BuboId[] }): Promise<Result<void>>
  setCashflowEventAnalyticsIncluded(input: {
    id: BuboId
    includeInAnalytics: boolean
  }): Promise<Result<CashflowEventSummary>>
  applyAgentLedgerPatch(input: AgentLedgerPatchInput): Promise<Result<AgentLedgerPatchResult>>
  getCashflowSummary(input?: CashflowSummaryInput): Promise<Result<CashflowSummary>>
  getCashflowBreakdown(input?: CashflowBreakdownInput): Promise<Result<CashflowBreakdownRow[]>>
  getMonthlyCashflowTrend(
    input?: MonthlyCashflowTrendInput,
  ): Promise<Result<MonthlyCashflowTrendRow[]>>
  listLinkedCashflowEvents(input: ListLinkedCashflowInput): Promise<Result<LinkedCashflowSummary[]>>
  bindCashflowEvents(input: BindCashflowInput): Promise<Result<number>>
  unbindCashflowEvent(input: { linkId: BuboId }): Promise<Result<void>>

  listAssetItems(input?: ListAssetItemsInput): Promise<Result<AssetItemSummary[]>>
  createAssetItem(input: CreateAssetItemInput): Promise<Result<AssetItemSummary>>
  updateAssetItem(input: UpdateAssetItemInput): Promise<Result<AssetItemSummary>>
  archiveAssetItem(input: { id: BuboId }): Promise<Result<void>>
  restoreAssetItem(input: { id: BuboId }): Promise<Result<void>>
  listAssetSnapshots(input?: ListAssetSnapshotsInput): Promise<Result<AssetSnapshotSummary[]>>
  listAssetSparklines(input?: ListAssetSparklinesInput): Promise<Result<AssetSparklinePoint[]>>
  addAssetSnapshot(input: AddAssetSnapshotInput): Promise<Result<AssetSnapshotSummary>>
  updateAssetSnapshot(input: UpdateAssetSnapshotInput): Promise<Result<AssetSnapshotSummary>>
  deleteAssetSnapshot(input: { id: BuboId }): Promise<Result<void>>
  getNetWorthSnapshot(input?: NetWorthInput): Promise<Result<NetWorthSnapshot>>
  getAssetChange(input: AssetChangeInput): Promise<Result<AssetChangeSummary | null>>

  listInvestmentPositions(
    input?: ListInvestmentPositionsInput,
  ): Promise<Result<InvestmentPositionSummary[]>>
  getInvestmentPosition(
    input: GetInvestmentPositionInput,
  ): Promise<Result<InvestmentPositionDetail | null>>
  createInvestmentPosition(
    input: CreateInvestmentPositionInput,
  ): Promise<Result<InvestmentPositionSummary>>
  updateInvestmentPosition(
    input: UpdateInvestmentPositionInput,
  ): Promise<Result<InvestmentPositionSummary>>
  deleteInvestmentPosition(input: DeleteInvestmentPositionInput): Promise<Result<void>>
  addInvestmentTransaction(
    input: AddInvestmentTransactionInput,
  ): Promise<Result<InvestmentPositionDetail>>
  deleteInvestmentTransaction(
    input: DeleteInvestmentTransactionInput,
  ): Promise<Result<InvestmentPositionDetail>>
  recordPriceQuote(input: RecordPriceQuoteInput): Promise<Result<PriceQuoteSummary>>
  listPriceQuotes(input: ListPriceQuotesInput): Promise<Result<PriceQuoteSummary[]>>

  listContractPositions(
    input?: ListContractPositionsInput,
  ): Promise<Result<ContractPositionSummary[]>>
  createContractPosition(
    input: CreateContractPositionInput,
  ): Promise<Result<ContractPositionSummary>>
  updateContractPosition(
    input: UpdateContractPositionInput,
  ): Promise<Result<ContractPositionSummary>>
  closeContractPosition(input: CloseContractPositionInput): Promise<Result<ContractPositionSummary>>
  deleteContractPosition(input: DeleteContractPositionInput): Promise<Result<void>>

  listSubscriptions(input?: ListSubscriptionsInput): Promise<Result<SubscriptionSummary[]>>
  createSubscription(input: CreateSubscriptionInput): Promise<Result<SubscriptionSummary>>
  updateSubscription(input: UpdateSubscriptionInput): Promise<Result<SubscriptionSummary>>
  archiveSubscription(input: { id: BuboId }): Promise<Result<void>>
  listSubscriptionOccurrences(
    input?: ListSubscriptionOccurrencesInput,
  ): Promise<Result<SubscriptionOccurrenceSummary[]>>

  listLoans(input?: ListLoansInput): Promise<Result<LoanSummary[]>>
  getLoan(input: { id: BuboId }): Promise<Result<LoanSummary | null>>
  createLoan(input: CreateLoanInput): Promise<Result<LoanSummary>>
  updateLoan(input: UpdateLoanInput): Promise<Result<LoanSummary>>
  archiveLoan(input: { id: BuboId }): Promise<Result<void>>
  generateLoanPaymentOccurrences(
    input: GenerateOccurrenceInput,
  ): Promise<Result<{ generated: number }>>
  listLoanPaymentOccurrences(
    input?: ListLoanPaymentOccurrencesInput,
  ): Promise<Result<LoanPaymentOccurrenceSummary[]>>
  getFutureFixedPressure(input?: FuturePressureInput): Promise<Result<FuturePressureSummary>>

  listBudgetSets(): Promise<Result<BudgetSetSummary[]>>
  createBudgetSet(input: CreateBudgetSetInput): Promise<Result<BudgetSetSummary>>
  getBudgetRolloverSuggestion(
    input?: BudgetRolloverSuggestionInput,
  ): Promise<Result<BudgetRolloverSuggestion | null>>
  createBudgetPeriodFromLatest(
    input?: CreateBudgetPeriodFromLatestInput,
  ): Promise<Result<CreateBudgetPeriodFromLatestResult>>
  listBudgetPeriods(input?: ListBudgetPeriodsInput): Promise<Result<BudgetPeriodSummary[]>>
  createBudgetPeriod(input: CreateBudgetPeriodInput): Promise<Result<BudgetPeriodSummary>>
  listBudgetItems(input?: ListBudgetItemsInput): Promise<Result<BudgetItemSummary[]>>
  createBudgetItem(input: CreateBudgetItemInput): Promise<Result<BudgetItemSummary>>
  updateBudgetItem(input: UpdateBudgetItemInput): Promise<Result<BudgetItemSummary>>
  archiveBudgetItem(input: { id: BuboId }): Promise<Result<void>>
  getBudgetReferenceProgress(
    input: BudgetReferenceProgressInput,
  ): Promise<Result<BudgetReferenceProgressRow[]>>

  listObjectLinks(input?: ListObjectLinksInput): Promise<Result<ObjectLinkSummary[]>>
  createObjectLink(input: CreateObjectLinkInput): Promise<Result<ObjectLinkSummary>>
  confirmObjectLink(input: { id: BuboId }): Promise<Result<ObjectLinkSummary>>
  removeObjectLink(input: { id: BuboId }): Promise<Result<void>>

  // Renderer dashboard shell. These methods are backed by the current clean schema.
  getDashboardSnapshot(): Promise<Result<DashboardSnapshot>>
  listAssetSnapshots(input?: ListAssetSnapshotsInput): Promise<Result<AssetSnapshotSummary[]>>
  upsertAssetSnapshot(input: UpsertAssetSnapshotInput): Promise<Result<AssetSnapshotSummary>>
  removeAssetSnapshot(input: { id: BuboId }): Promise<Result<void>>
  listDashboardViews(): Promise<Result<DashboardView[]>>
  createDashboardView(input: CreateDashboardViewInput): Promise<Result<DashboardView>>
  updateDashboardView(input: UpdateDashboardViewInput): Promise<Result<DashboardView>>
  removeDashboardView(input: { id: string }): Promise<Result<void>>
  saveDashboardViewOrder(input: { ids: string[] }): Promise<Result<DashboardView[]>>
  listDashboardCards(input?: ListDashboardCardsInput): Promise<Result<DashboardCard[]>>
  listDashboardLayouts(input?: ListDashboardLayoutsInput): Promise<Result<DashboardLayoutEntry[]>>
  addDashboardCard(input: AddDashboardCardInput): Promise<Result<DashboardCard>>
  updateDashboardCard(input: UpdateDashboardCardInput): Promise<Result<DashboardCard>>
  removeDashboardCard(input: { id: string }): Promise<Result<void>>
  saveDashboardLayouts(input: SaveDashboardLayoutsInput): Promise<Result<void>>
  resetDashboardLayout(): Promise<Result<void>>
}

export interface DashboardSnapshot {
  metrics: {
    netWorth: MoneyAmount
    cash: MoneyAmount
    incomeMtd: MoneyAmount
    expenseMtd: MoneyAmount
    savingsMtd: MoneyAmount
  }
  pnlStrip: Array<{ label: string; value: string; delta: string; up: boolean }>
  dayFlow: DayFlowRow[]
  cashflowEvents: Record<string, unknown>[]
  holdings: HoldingRow[]
  accounts: Record<string, unknown>[]
  generatedAt: string
}

export interface DayFlowRow {
  id: BuboId
  time: string
  symbol: string
  category: string
  account: string
  amountNumber: string
  currency: string
  kind: "income" | "expense" | "transfer"
}

export interface HoldingRow {
  account: string
  symbol: string
  name: string
  type: string
  balanceNumber: string
  currency: string
}

export interface BuboApiOptions {
  fxProvider?: FxRateProvider
}

export interface FxRateProvider {
  id: string
  fetchRate(input: FxRateFetchInput): Promise<FxRateFetchResult | null>
}

export interface FxRateFetchInput {
  fromCurrency: string
  toCurrency: string
  date: string
}

export interface FxRateFetchResult {
  fromCurrency: string
  toCurrency: string
  rateDate: string
  rate: string
  provider: string
  sourceDate?: string | null
  meta?: Record<string, unknown> | null
}

export interface CurrencySettingsSummary {
  displayCurrency: string
  fxProvider: string
  fxRequestPolicy: string
  updatedAt: string
  meta: Record<string, unknown> | null
}

export interface UpdateCurrencySettingsInput {
  displayCurrency?: string
  fxProvider?: string
  fxRequestPolicy?: string
  meta?: Record<string, unknown> | null
}

export interface ExchangeRateSummary {
  id: BuboId
  fromCurrency: string
  toCurrency: string
  rateDate: string
  rate: string
  provider: string
  fetchedAt: string
  sourceDate: string | null
  meta: Record<string, unknown> | null
}

export interface ListExchangeRatesInput {
  fromCurrency?: string
  toCurrency?: string
  provider?: string
  limit?: number
}

export interface RefreshExchangeRatesInput {
  force?: boolean
}

export interface RefreshExchangeRatesResult {
  requested: number
  fetched: number
  skipped: number
  failed: number
  unsupported: number
}

export interface CurrentRates {
  /** Base/display currency that every rate converts into. */
  base: string
  /** Latest fetchedAt across the included rates, or null when none are cached yet. */
  asOf: string | null
  /** Currency code -> rate to multiply an amount in that currency into the base. */
  rates: Record<string, string>
}

export interface CategorySummary {
  id: BuboId
  name: string
  parentId?: BuboId | null
  categoryKind: string
  kind: string
  color?: string | null
  icon?: string | null
  sortOrder: number
  displayOrder: number
  archived: boolean
  archivedAt?: string | null
}

export interface ListCategoriesInput {
  includeArchived?: boolean
  categoryKind?: string
}

export interface CreateCategoryInput {
  name: string
  parentId?: BuboId | null
  categoryKind?: string
  kind?: string
  color?: string | null
  icon?: string | null
  sortOrder?: number
  displayOrder?: number
}

export interface UpdateCategoryInput {
  id: BuboId
  name?: string
  parentId?: BuboId | null
  categoryKind?: string
  kind?: string
  color?: string | null
  icon?: string | null
  sortOrder?: number
  displayOrder?: number
}

export interface TagSummary {
  id: BuboId
  name: string
  color?: string | null
  archived: boolean
}

export interface ImportStatementInput {
  sourceName: string
  importedAt?: string
  fileName?: string | null
  fileHash?: string | null
  lines: StatementLineInput[]
  rawSummary?: Record<string, unknown> | null
}

export interface StatementLineInput {
  externalId?: string | null
  occurredAt?: string | null
  eventDate: string
  counterparty?: string | null
  description?: string | null
  amount: string
  currency?: string
  direction: Direction | "income" | "expense"
  paymentMethod?: string | null
  accountHint?: string | null
  rawPayload?: Record<string, unknown> | null
}

export interface ImportNormalizedStatementEntriesInput {
  sourceName: string
  importedAt: string
  fileName?: string | null
  fileHash?: string | null
  entries: NormalizedStatementEntry[]
  summary?: unknown
}

export interface NormalizedStatementEntry {
  externalId?: string | null
  merchantOrderId?: string | null
  occurredAt?: string | null
  date: string
  counterparty?: string | null
  description?: string | null
  amountNumber: string
  currency: string
  sourceAccountName: string
  sourceSubAccountLabel?: string | null
  paymentMethod?: string | null
  direction?: "income" | "expense" | "in" | "out" | "neutral" | null
  classification?: string | null
  confidence?: number | null
  source?: string | null
  type?: string | null
  status?: string | null
  note?: string | null
  raw?: Record<string, unknown> | null
}

export interface ImportedBatchResult {
  batchId: BuboId
  inserted: number
  skipped: number
}

export interface ListStatementImportsInput {
  sourceName?: string
  status?: string
}

export interface StatementImportSummary {
  id: BuboId
  sourceName: string
  fileName: string | null
  fileHash: string | null
  importedAt: string
  status: string
}

export interface ListStatementLinesInput {
  importId?: BuboId
  status?: string
  limit?: number
}

export interface StatementLineSummary {
  id: BuboId
  importId: BuboId
  externalId: string | null
  eventDate: string
  occurredAt: string | null
  counterparty: string | null
  description: string | null
  amount: string
  currency: string
  direction: string
  status: string
}

export interface ListImportedEntriesInput extends ListStatementLinesInput {
  sourceName?: string
  classification?: string
}

export interface ImportedEntrySummary {
  id: BuboId
  batchId: BuboId
  sourceName: string
  fileName: string | null
  externalId: string | null
  merchantOrderId: string | null
  occurredAt: string | null
  date: string
  payee: string | null
  narration: string | null
  amountNumber: string
  currency: string
  accountName: string
  sourceSubAccountLabel: string | null
  counterpartyAccount: string | null
  paymentMethod: string | null
  direction: string | null
  classification: string | null
  confidence: number | null
  status: "pending" | "matched" | "confirmed" | "ignored" | "reviewed"
  raw: Record<string, unknown> | null
}

export interface ConvertStatementLinesInput {
  importId?: BuboId
}

export interface CashflowEventSummary {
  id: BuboId
  statementLineId?: BuboId | null
  eventDate: string
  date: string
  occurredAt?: string | null
  title?: string | null
  counterparty?: string | null
  description?: string | null
  userNote?: string | null
  amount: string
  currency: string
  direction: Direction
  flowKind: string
  categoryId?: BuboId | null
  categoryName?: string | null
  sourceKind: string
  sourceName?: string | null
  sourceExternalId?: string | null
  sourceFileHash?: string | null
  importedAt?: string | null
  source?: string | null
  includeInAnalytics: boolean
  status: ActiveStatus
  classificationSource: string
  tags: TagSummary[]
  createdAt: string
}

/** A cashflow event bound to a subscription/loan, paired with its object_links id for unbinding. */
export interface LinkedCashflowSummary {
  linkId: BuboId
  event: CashflowEventSummary
}

export type CashflowLinkOwnerType = "subscription" | "loan"

export interface ListLinkedCashflowInput {
  ownerType: CashflowLinkOwnerType
  ownerId: BuboId
}

export interface BindCashflowInput {
  ownerType: CashflowLinkOwnerType
  ownerId: BuboId
  eventIds: BuboId[]
  note?: string | null
}

export interface ListCashflowEventsInput {
  dateFrom?: string
  dateTo?: string
  flowKind?: string | string[]
  direction?: Direction
  categoryId?: BuboId
  tagId?: BuboId
  sourceName?: string
  sourceExternalId?: string
  source?: string
  status?: ActiveStatus
  includeInAnalytics?: boolean
  keyword?: string
  limit?: number
  offset?: number
}

export interface CreateCashflowEventInput {
  eventDate: string
  occurredAt?: string | null
  title?: string | null
  counterparty?: string | null
  description?: string | null
  userNote?: string | null
  amount: string
  currency?: string
  direction: Direction
  flowKind: CashflowKind
  categoryId?: BuboId | null
  sourceKind?: "manual" | "import" | "system"
  sourceName?: string | null
  sourceExternalId?: string | null
  sourceFileHash?: string | null
  importedAt?: string | null
  paymentMethod?: string | null
  accountHint?: string | null
  includeInAnalytics?: boolean
  classificationSource?: "manual" | "rule" | "system" | "imported"
  tagIds?: BuboId[]
}

export interface UpdateCashflowEventInput {
  id: BuboId
  eventDate?: string
  title?: string | null
  counterparty?: string | null
  description?: string | null
  userNote?: string | null
  amount?: string
  currency?: string
  direction?: Direction
  flowKind?: CashflowKind
  categoryId?: BuboId | null
  includeInAnalytics?: boolean
  status?: ActiveStatus
}

export type AgentLedgerOperation =
  | AgentEnsureCategoryOperation
  | AgentCreateCashflowOperation
  | AgentClassifyCashflowOperation

export interface AgentLedgerPatchInput {
  dryRun?: boolean
  operations: AgentLedgerOperation[]
}

export interface AgentEnsureCategoryOperation {
  op: "category.ensure"
  name: string
  categoryKind?: string
  color?: string | null
  icon?: string | null
  displayOrder?: number
}

export interface AgentCreateCashflowOperation {
  op: "cashflow.create"
  sourceKind?: "manual" | "import" | "system"
  sourceName?: string | null
  sourceExternalId?: string | null
  sourceFileHash?: string | null
  importedAt?: string | null
  eventDate: string
  occurredAt?: string | null
  title?: string | null
  counterparty?: string | null
  description?: string | null
  userNote?: string | null
  amount: string
  currency?: string
  direction: Direction
  flowKind: CashflowKind
  categoryId?: BuboId | null
  categoryName?: string | null
  categoryKind?: string
  paymentMethod?: string | null
  accountHint?: string | null
  includeInAnalytics?: boolean
  classificationSource?: "manual" | "rule" | "system" | "imported"
  tagIds?: BuboId[]
}

export interface AgentClassifyCashflowOperation {
  op: "cashflow.classify"
  id?: BuboId
  sourceName?: string | null
  sourceExternalId?: string | null
  categoryId?: BuboId | null
  categoryName?: string | null
  categoryKind?: string
  classificationSource?: "manual" | "rule" | "system" | "imported"
}

export interface AgentLedgerPatchResult {
  dryRun: boolean
  created: number
  updated: number
  skipped: number
  conflicts: number
  warnings: string[]
  operations: AgentLedgerOperationResult[]
}

export interface AgentLedgerOperationResult {
  index: number
  op: AgentLedgerOperation["op"]
  action: "create" | "update" | "skip" | "conflict" | "reject"
  targetType?: "category" | "cashflow"
  targetId?: BuboId
  message: string
  warnings?: string[]
}

export interface CashflowSummaryInput {
  metric?:
    | "everyday_spend"
    | "income"
    | "net_cashflow"
    | "debt_payments"
    | "asset_movements"
    | "refunds"
    | "all_activity"
  dateFrom?: string
  dateTo?: string
  includeIgnored?: boolean
}

export interface CashflowSummary {
  metric: string
  amount: string
  currency: string
}

export interface CashflowBreakdownInput extends CashflowSummaryInput {
  groupBy?: "flow_kind" | "category" | "tag" | "source"
}

export interface CashflowBreakdownRow {
  key: string
  label: string
  amount: string
  currency: string
}

export interface MonthlyCashflowTrendInput {
  dateFrom?: string
  dateTo?: string
  months?: number
  includeIgnored?: boolean
}

export interface MonthlyCashflowTrendRow {
  month: string
  income: string
  expense: string
  net: string
  currency: string
}

export interface SubscriptionSummary {
  id: BuboId
  name: string
  merchant: string | null
  amount: string
  currency: string
  billingCycle: string
  intervalCount: number
  nextChargeDate: string
  autoRenew: boolean
  categoryId: BuboId | null
  status: string
  note: string | null
}

export interface ListSubscriptionsInput {
  status?: string
}

export interface CreateSubscriptionInput {
  name: string
  merchant?: string | null
  amount: string
  currency?: string
  billingCycle: "weekly" | "monthly" | "yearly" | "custom"
  intervalCount?: number
  nextChargeDate: string
  autoRenew?: boolean
  categoryId?: BuboId | null
  note?: string | null
}

export interface UpdateSubscriptionInput extends Partial<CreateSubscriptionInput> {
  id: BuboId
  status?: string
}

export interface GenerateOccurrenceInput {
  id?: BuboId
  throughDate: string
}

export interface ListSubscriptionOccurrencesInput {
  subscriptionId?: BuboId
  dateFrom?: string
  dateTo?: string
}

/** Read-time projected subscription charge; never backed by a persisted occurrence row. */
export interface SubscriptionOccurrenceSummary {
  id: BuboId
  subscriptionId: BuboId
  dueDate: string
  amount: string
  currency: string
  status: string
}

export interface LoanSummary {
  id: BuboId
  name: string
  lender: string | null
  currency: string
  principalAmount: string | null
  currentPrincipalEstimate: string | null
  annualRateBps: number | null
  repaymentMethod: string | null
  paymentAmount: string
  paymentDay: number | null
  startDate: string
  termMonths: number | null
  status: string
  note: string | null
}

export interface ListLoansInput {
  status?: string
}

export interface CreateLoanInput {
  name: string
  lender?: string | null
  currency?: string
  principalAmount?: string | null
  currentPrincipalEstimate?: string | null
  annualRateBps?: number | null
  repaymentMethod?: string | null
  paymentAmount: string
  paymentDay?: number | null
  startDate: string
  termMonths?: number | null
  note?: string | null
}

export interface UpdateLoanInput extends Partial<CreateLoanInput> {
  id: BuboId
  status?: string
}

export interface ListLoanPaymentOccurrencesInput {
  loanId?: BuboId
  dateFrom?: string
  dateTo?: string
}

export interface LoanPaymentOccurrenceSummary {
  id: BuboId
  loanId: BuboId
  dueDate: string
  paymentAmount: string
  principalAmount: string | null
  interestAmount: string | null
  feeAmount: string | null
  remainingPrincipalEstimate: string | null
  status: string
}

export interface FuturePressureInput {
  dateFrom?: string
  dateTo?: string
}

export interface FuturePressureSummary {
  subscriptions: string
  loans: string
  total: string
  currency: string
}

export interface BudgetSetSummary {
  id: BuboId
  name: string
  status: string
}

export interface CreateBudgetSetInput {
  name: string
}

export interface BudgetRolloverSuggestionInput {
  asOf?: string
  budgetSetId?: BuboId
}

export interface BudgetRolloverSuggestion {
  asOf: string
  budgetSetId: BuboId
  periodStart: string
  periodEnd: string
  sourcePeriodId: BuboId
  sourcePeriodStart: string
  sourcePeriodEnd: string
  itemCount: number
}

export interface CreateBudgetPeriodFromLatestInput extends BudgetRolloverSuggestionInput {
  currency?: string
}

export interface CreateBudgetPeriodFromLatestResult {
  budgetPeriod: BudgetPeriodSummary
  sourcePeriodId: BuboId | null
  copiedItems: number
  alreadyExists: boolean
}

export interface BudgetPeriodSummary {
  id: BuboId
  budgetSetId: BuboId
  periodKind: string
  periodStart: string
  periodEnd: string
  currency: string
  status: string
}

export interface ListBudgetPeriodsInput {
  budgetSetId?: BuboId
  status?: string
}

export interface CreateBudgetPeriodInput {
  budgetSetId: BuboId
  periodKind: "monthly" | "weekly" | "yearly" | "custom"
  periodStart: string
  periodEnd: string
  currency?: string
}

export interface BudgetItemSummary {
  id: BuboId
  budgetPeriodId: BuboId
  name: string
  itemKind: string
  plannedAmount: string
  currency: string
  categoryId: BuboId | null
  color: string | null
  status: string
}

export interface ListBudgetItemsInput {
  budgetPeriodId?: BuboId
}

export interface CreateBudgetItemInput {
  budgetPeriodId: BuboId
  name: string
  itemKind?: "spending_limit" | "saving_goal" | "custom"
  plannedAmount: string
  currency?: string
  categoryId?: BuboId | null
  color?: string | null
  scopes?: BudgetScopeInput[]
}

export interface UpdateBudgetItemInput {
  id: BuboId
  name?: string
  plannedAmount?: string
  currency?: string
  color?: string | null
  /** When provided, replaces the item's scopes (the budget's bound categories). */
  scopes?: BudgetScopeInput[]
}

export interface BudgetScopeInput {
  scopeKind:
    | "category"
    | "category_tree"
    | "tag"
    | "source"
    | "flow_kind"
    | "custom"
    | "all_consumption"
  scopeValue?: string | null
}

export interface BudgetReferenceProgressInput {
  budgetPeriodId: BuboId
}

export interface BudgetReferenceProgressRow {
  budgetItemId: BuboId
  budgetName: string
  budgeted: string
  referenceUsed: string
  remaining: string
  currency: string
  color: string | null
  /** Category ids this budget is bound to (empty = overall budget over all expenses). */
  categoryIds: string[]
}

export interface ObjectLinkSummary {
  id: BuboId
  fromType: string
  fromId: BuboId
  toType: string
  toId: BuboId
  linkType: string
  confidence: number | null
  createdBy: string
  note: string | null
}

export interface ListObjectLinksInput {
  fromType?: string
  fromId?: BuboId
  toType?: string
  toId?: BuboId
}

export interface CreateObjectLinkInput {
  fromType: string
  fromId: BuboId
  toType: string
  toId: BuboId
  linkType: "evidence_of" | "likely_matches" | "confirmed_matches" | "related_to"
  confidence?: number | null
  createdBy?: "user" | "system"
  note?: string | null
}

export interface DashboardView {
  id: string
  slug: string
  name: string
  position: number
  isDefault: boolean
}

export interface CreateDashboardViewInput {
  name: string
}
export interface UpdateDashboardViewInput {
  id: string
  name?: string
  position?: number
}
export interface DashboardCard {
  id: string
  viewId: string
  type: string
  title: string | null
  code: string | null
  config: Record<string, unknown>
  position: number
  hidden: boolean
}
export interface DashboardLayoutEntry {
  cardId: string
  breakpoint: string
  x: number
  y: number
  w: number
  h: number
}
export interface ListDashboardCardsInput {
  viewId?: string
}
export interface ListDashboardLayoutsInput {
  viewId?: string
}
export interface AddDashboardCardInput {
  viewId: string
  type: string
  title?: string | null
  code?: string | null
  config?: Record<string, unknown>
  position?: number
  layouts: Omit<DashboardLayoutEntry, "cardId">[]
}
export interface UpdateDashboardCardInput {
  id: string
  title?: string | null
  code?: string | null
  config?: Record<string, unknown>
  hidden?: boolean
}
export interface SaveDashboardLayoutsInput {
  viewId?: string
  rows: DashboardLayoutEntry[]
}

export function createBuboApi(db: Database, options: BuboApiOptions = {}): BuboApi {
  return new BuboSqliteApi(db, options)
}

export {
  createFrankfurterFxProvider,
  type FrankfurterProviderOptions,
} from "./infrastructure/fx/frankfurter-provider"

export { parseVoiceIntent, type ParseVoiceIntentOptions } from "./use-cases/voice/voice-intent-api"
export {
  transcribeVoiceEntry,
  type TranscribeVoiceEntryOptions,
} from "./use-cases/voice/voice-transcribe-api"
export {
  buildVoiceCategoryOptions,
  normalizeVoiceEntryDraft,
  type VoiceCategoryOption,
} from "./domain/voice/voice-entry-rules"
export {
  VOICE_INTENT_SYSTEM_PROMPT,
  buildVoiceIntentMessages,
  normalizeVoiceIntent,
  type VoiceAssetOption,
  type VoiceIntentContext,
  type VoiceIntentMessages,
  type VoiceLoanOption,
  type VoicePositionOption,
  type VoiceSubscriptionOption,
} from "./domain/voice/voice-intent-rules"
export {
  buildLlmAttemptChain,
  excelSerialToDateKey,
  selectLlmModelOrder,
} from "./domain/voice/llm-pool-rules"
export type { VoiceAsrConfig } from "./infrastructure/ai/bailian-asr-client"
export type { VoiceLlmConfig } from "./infrastructure/ai/llm-entry-client"
