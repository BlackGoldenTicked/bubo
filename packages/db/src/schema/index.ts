/**
 * @purpose Define the canonical bubo SQLite schema with Drizzle tables and relations.
 * @role    Source of truth for cashflow, asset snapshots, investments, budgets, imports, subscriptions, loans, and ledger metadata.
 * @deps    drizzle-orm SQLite builders and relation helpers.
 * @gotcha  Keep cashflow, assets, and future obligations separate; migrations must preserve user data.
 */

import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    parentId: text("parent_id"),
    categoryKind: text("category_kind", {
      enum: ["expense", "income", "transfer", "asset_movement", "debt", "adjustment", "neutral"],
    }).notNull(),
    color: text("color"),
    icon: text("icon"),
    displayOrder: integer("display_order").notNull().default(0),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    parentIdx: index("idx_categories_parent").on(t.parentId),
    kindIdx: index("idx_categories_kind").on(t.categoryKind),
    orderIdx: index("idx_categories_order").on(t.displayOrder),
  }),
)

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color"),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    nameUnique: uniqueIndex("tags_name_unique").on(t.name),
  }),
)

export const statementImports = sqliteTable(
  "statement_imports",
  {
    id: text("id").primaryKey(),
    sourceName: text("source_name").notNull(),
    fileName: text("file_name"),
    fileHash: text("file_hash"),
    importedAt: text("imported_at").notNull(),
    status: text("status", { enum: ["imported", "reviewed", "archived"] })
      .notNull()
      .default("imported"),
    rawSummary: text("raw_summary", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    sourceIdx: index("idx_statement_imports_source").on(t.sourceName),
    statusIdx: index("idx_statement_imports_status").on(t.status),
  }),
)

export const statementLines = sqliteTable(
  "statement_lines",
  {
    id: text("id").primaryKey(),
    importId: text("import_id")
      .notNull()
      .references(() => statementImports.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    lineHash: text("line_hash").notNull(),
    occurredAt: text("occurred_at"),
    eventDate: text("event_date").notNull(),
    counterparty: text("counterparty"),
    description: text("description"),
    amount: text("amount").notNull(),
    currency: text("currency").notNull().default("CNY"),
    direction: text("direction", { enum: ["in", "out", "neutral"] }).notNull(),
    paymentMethod: text("payment_method"),
    accountHint: text("account_hint"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status", { enum: ["pending", "converted", "ignored"] })
      .notNull()
      .default("pending"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    importHashUnique: uniqueIndex("statement_lines_import_hash_unique").on(t.importId, t.lineHash),
    importIdx: index("idx_statement_lines_import").on(t.importId),
    dateIdx: index("idx_statement_lines_date").on(t.eventDate),
    statusIdx: index("idx_statement_lines_status").on(t.status),
  }),
)

export const cashflowEvents = sqliteTable(
  "cashflow_events",
  {
    id: text("id").primaryKey(),
    statementLineId: text("statement_line_id").references(() => statementLines.id, {
      onDelete: "set null",
    }),
    eventDate: text("event_date").notNull(),
    occurredAt: text("occurred_at"),
    title: text("title"),
    counterparty: text("counterparty"),
    description: text("description"),
    userNote: text("user_note"),
    amount: text("amount").notNull(),
    currency: text("currency").notNull().default("CNY"),
    direction: text("direction", { enum: ["in", "out", "neutral"] }).notNull(),
    flowKind: text("flow_kind", {
      enum: [
        "income",
        "expense",
        "transfer",
        "asset_movement",
        "debt_payment",
        "refund",
        "adjustment",
      ],
    }).notNull(),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    sourceKind: text("source_kind", { enum: ["manual", "import", "system"] })
      .notNull()
      .default("manual"),
    sourceName: text("source_name"),
    sourceExternalId: text("source_external_id"),
    sourceFileHash: text("source_file_hash"),
    importedAt: text("imported_at"),
    paymentMethod: text("payment_method"),
    accountHint: text("account_hint"),
    includeInAnalytics: integer("include_in_analytics", { mode: "boolean" })
      .notNull()
      .default(true),
    status: text("status", { enum: ["active", "ignored", "deleted"] })
      .notNull()
      .default("active"),
    classificationSource: text("classification_source", {
      enum: ["manual", "rule", "system", "imported"],
    })
      .notNull()
      .default("manual"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    dateIdx: index("idx_cashflow_events_date").on(t.eventDate),
    flowKindIdx: index("idx_cashflow_events_flow_kind").on(t.flowKind),
    directionIdx: index("idx_cashflow_events_direction").on(t.direction),
    categoryIdx: index("idx_cashflow_events_category").on(t.categoryId),
    statusIdx: index("idx_cashflow_events_status").on(t.status),
    sourceExternalUnique: uniqueIndex("cashflow_events_source_external_unique").on(
      t.sourceName,
      t.sourceExternalId,
    ),
  }),
)

export const cashflowEventTags = sqliteTable(
  "cashflow_event_tags",
  {
    cashflowEventId: text("cashflow_event_id")
      .notNull()
      .references(() => cashflowEvents.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cashflowEventId, t.tagId] }),
  }),
)

export const assetItems = sqliteTable(
  "asset_items",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    assetType: text("asset_type", {
      enum: [
        "cash",
        "bank",
        "wallet",
        "brokerage",
        "fund",
        "stock",
        "crypto",
        "real_estate",
        "vehicle",
        "fixed_asset",
        "liability",
        "other",
      ],
    }).notNull(),
    institution: text("institution"),
    defaultCurrency: text("default_currency").notNull().default("CNY"),
    valuationMethod: text("valuation_method", {
      enum: ["manual_balance", "manual_market_value", "statement_value", "estimated_value"],
    })
      .notNull()
      .default("manual_balance"),
    archivedAt: text("archived_at"),
    displayOrder: integer("display_order").notNull().default(0),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    typeIdx: index("idx_asset_items_type").on(t.assetType),
    archivedIdx: index("idx_asset_items_archived").on(t.archivedAt),
  }),
)

export const assetSnapshots = sqliteTable(
  "asset_snapshots",
  {
    id: text("id").primaryKey(),
    assetItemId: text("asset_item_id")
      .notNull()
      .references(() => assetItems.id, { onDelete: "cascade" }),
    snapshotAt: text("snapshot_at").notNull(),
    valueAmount: text("value_amount").notNull(),
    valueCurrency: text("value_currency").notNull().default("CNY"),
    quantityAmount: text("quantity_amount"),
    quantityUnit: text("quantity_unit"),
    costBasisAmount: text("cost_basis_amount"),
    costBasisCurrency: text("cost_basis_currency"),
    sourceKind: text("source_kind", { enum: ["manual", "import", "system"] })
      .notNull()
      .default("manual"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    itemIdx: index("idx_asset_snapshots_item").on(t.assetItemId),
    snapshotIdx: index("idx_asset_snapshots_snapshot_at").on(t.snapshotAt),
  }),
)

// ── Investment tracking (positions / transactions / manual quotes) ──────────
// Trades drive position state; renders derive P&L from these rows. A position may
// link to a present-asset account so its market value can be materialized back
// into asset snapshots as the single net-worth source.

export const investmentPositions = sqliteTable(
  "investment_positions",
  {
    id: text("id").primaryKey(),
    assetItemId: text("asset_item_id").references(() => assetItems.id, { onDelete: "set null" }),
    symbol: text("symbol").notNull(),
    name: text("name"),
    instrumentKind: text("instrument_kind", {
      enum: ["stock", "fund", "crypto", "etf", "bond", "other"],
    }).notNull(),
    currency: text("currency").notNull().default("CNY"),
    quantity: text("quantity").notNull().default("0"),
    avgCostPrice: text("avg_cost_price"),
    costBasisAmount: text("cost_basis_amount"),
    realizedPnlAmount: text("realized_pnl_amount").notNull().default("0"),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    symbolIdx: index("idx_investment_positions_symbol").on(t.symbol),
    accountIdx: index("idx_investment_positions_account").on(t.assetItemId),
    statusIdx: index("idx_investment_positions_status").on(t.status),
  }),
)

export const investmentTransactions = sqliteTable(
  "investment_transactions",
  {
    id: text("id").primaryKey(),
    positionId: text("position_id")
      .notNull()
      .references(() => investmentPositions.id, { onDelete: "cascade" }),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    quantity: text("quantity").notNull(),
    price: text("price").notNull(),
    feeAmount: text("fee_amount"),
    executedAt: text("executed_at").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    positionIdx: index("idx_investment_transactions_position").on(t.positionId),
    executedIdx: index("idx_investment_transactions_executed").on(t.executedAt),
  }),
)

export const priceQuotes = sqliteTable(
  "price_quotes",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    price: text("price").notNull(),
    currency: text("currency").notNull().default("CNY"),
    quotedAt: text("quoted_at").notNull(),
    source: text("source").notNull().default("manual"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (t) => ({
    symbolIdx: index("idx_price_quotes_symbol").on(t.symbol, t.quotedAt),
  }),
)

// ── Contract positions (derivatives layer) ─────────────────────────────────
// Futures and perpetuals are direction on an underlying, not a holding. The
// row keeps the user's margin and mark; unrealized P&L is always derived from
// side/entry/mark so no stored number can drift. Contract rows never feed net
// worth: only a margin balance recorded as an asset snapshot does.

export const contractPositions = sqliteTable(
  "contract_positions",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    side: text("side", { enum: ["long", "short"] }).notNull(),
    marginMode: text("margin_mode", { enum: ["isolated", "cross"] })
      .notNull()
      .default("isolated"),
    /** Leverage ×10000 (10x = 100000) keeps the stored value an integer. */
    leverageBps: integer("leverage_bps").notNull().default(10000),
    quantity: text("quantity").notNull(),
    entryPrice: text("entry_price").notNull(),
    markPrice: text("mark_price"),
    exitPrice: text("exit_price"),
    liquidationPrice: text("liquidation_price"),
    marginAmount: text("margin_amount"),
    currency: text("currency").notNull().default("USD"),
    status: text("status", { enum: ["open", "closed", "liquidated"] })
      .notNull()
      .default("open"),
    openedAt: text("opened_at").notNull(),
    closedAt: text("closed_at"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    symbolIdx: index("idx_contract_positions_symbol").on(t.symbol),
    statusIdx: index("idx_contract_positions_status").on(t.status),
  }),
)

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    merchant: text("merchant"),
    amount: text("amount").notNull(),
    currency: text("currency").notNull().default("CNY"),
    billingCycle: text("billing_cycle", {
      enum: ["weekly", "monthly", "yearly", "custom"],
    }).notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    nextChargeDate: text("next_charge_date").notNull(),
    autoRenew: integer("auto_renew", { mode: "boolean" }).notNull().default(true),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    status: text("status", { enum: ["active", "paused", "canceled"] })
      .notNull()
      .default("active"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    statusIdx: index("idx_subscriptions_status").on(t.status),
    nextChargeIdx: index("idx_subscriptions_next_charge").on(t.nextChargeDate),
  }),
)

/** @deprecated Subscription schedules project from plans at read time; retained for ledger compatibility. */
export const subscriptionOccurrences = sqliteTable(
  "subscription_occurrences",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    dueDate: text("due_date").notNull(),
    amount: text("amount").notNull(),
    currency: text("currency").notNull().default("CNY"),
    status: text("status", { enum: ["forecast", "skipped", "confirmed"] })
      .notNull()
      .default("forecast"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    uniqueDue: uniqueIndex("subscription_occurrences_unique").on(t.subscriptionId, t.dueDate),
    dueIdx: index("idx_subscription_occurrences_due").on(t.dueDate),
  }),
)

export const loans = sqliteTable(
  "loans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    lender: text("lender"),
    currency: text("currency").notNull().default("CNY"),
    principalAmount: text("principal_amount"),
    currentPrincipalEstimate: text("current_principal_estimate"),
    annualRateBps: integer("annual_rate_bps"),
    repaymentMethod: text("repayment_method"),
    paymentAmount: text("payment_amount").notNull(),
    paymentDay: integer("payment_day"),
    startDate: text("start_date").notNull(),
    termMonths: integer("term_months"),
    status: text("status", { enum: ["active", "paused", "closed"] })
      .notNull()
      .default("active"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    statusIdx: index("idx_loans_status").on(t.status),
  }),
)

export const loanPaymentOccurrences = sqliteTable(
  "loan_payment_occurrences",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    dueDate: text("due_date").notNull(),
    paymentAmount: text("payment_amount").notNull(),
    principalAmount: text("principal_amount"),
    interestAmount: text("interest_amount"),
    feeAmount: text("fee_amount"),
    remainingPrincipalEstimate: text("remaining_principal_estimate"),
    status: text("status", { enum: ["forecast", "paid", "skipped"] })
      .notNull()
      .default("forecast"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    uniqueDue: uniqueIndex("loan_payment_occurrences_unique").on(t.loanId, t.dueDate),
    dueIdx: index("idx_loan_payment_occurrences_due").on(t.dueDate),
  }),
)

export const budgetSets = sqliteTable("budget_sets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "archived"] })
    .notNull()
    .default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const budgetPeriods = sqliteTable(
  "budget_periods",
  {
    id: text("id").primaryKey(),
    budgetSetId: text("budget_set_id")
      .notNull()
      .references(() => budgetSets.id, { onDelete: "cascade" }),
    periodKind: text("period_kind", { enum: ["monthly", "weekly", "yearly", "custom"] }).notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    currency: text("currency").notNull().default("CNY"),
    status: text("status", { enum: ["active", "closed", "archived"] })
      .notNull()
      .default("active"),
  },
  (t) => ({
    setIdx: index("idx_budget_periods_set").on(t.budgetSetId),
    rangeIdx: index("idx_budget_periods_range").on(t.periodStart, t.periodEnd),
  }),
)

export const budgetItems = sqliteTable(
  "budget_items",
  {
    id: text("id").primaryKey(),
    budgetPeriodId: text("budget_period_id")
      .notNull()
      .references(() => budgetPeriods.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    itemKind: text("item_kind", { enum: ["spending_limit", "saving_goal", "custom"] })
      .notNull()
      .default("spending_limit"),
    plannedAmount: text("planned_amount").notNull(),
    currency: text("currency").notNull().default("CNY"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    rolloverPolicy: text("rollover_policy", {
      enum: ["none", "rollover_unspent", "rollover_overspent"],
    })
      .notNull()
      .default("none"),
    status: text("status", { enum: ["active", "paused", "archived"] })
      .notNull()
      .default("active"),
    note: text("note"),
    color: text("color"),
  },
  (t) => ({
    periodIdx: index("idx_budget_items_period").on(t.budgetPeriodId),
  }),
)

export const budgetItemScopes = sqliteTable(
  "budget_item_scopes",
  {
    id: text("id").primaryKey(),
    budgetItemId: text("budget_item_id")
      .notNull()
      .references(() => budgetItems.id, { onDelete: "cascade" }),
    scopeKind: text("scope_kind", {
      enum: ["category", "category_tree", "tag", "source", "flow_kind", "custom"],
    }).notNull(),
    scopeValue: text("scope_value"),
  },
  (t) => ({
    itemIdx: index("idx_budget_item_scopes_item").on(t.budgetItemId),
    kindIdx: index("idx_budget_item_scopes_kind").on(t.scopeKind),
  }),
)

export const objectLinks = sqliteTable(
  "object_links",
  {
    id: text("id").primaryKey(),
    fromType: text("from_type").notNull(),
    fromId: text("from_id").notNull(),
    toType: text("to_type").notNull(),
    toId: text("to_id").notNull(),
    linkType: text("link_type", {
      enum: ["evidence_of", "likely_matches", "confirmed_matches", "related_to"],
    }).notNull(),
    confidence: integer("confidence"),
    createdBy: text("created_by", { enum: ["user", "system"] })
      .notNull()
      .default("user"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    fromIdx: index("idx_object_links_from").on(t.fromType, t.fromId),
    toIdx: index("idx_object_links_to").on(t.toType, t.toId),
  }),
)

export const currencySettings = sqliteTable("currency_settings", {
  id: text("id").primaryKey(),
  displayCurrency: text("display_currency").notNull().default("CNY"),
  fxProvider: text("fx_provider").notNull().default("manual"),
  fxRequestPolicy: text("fx_request_policy").notNull().default("manual_only"),
  updatedAt: text("updated_at").notNull(),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
})

export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: text("id").primaryKey(),
    fromCurrency: text("from_currency").notNull(),
    toCurrency: text("to_currency").notNull(),
    rateDate: text("rate_date").notNull(),
    rate: text("rate").notNull(),
    provider: text("provider").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    sourceDate: text("source_date"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (t) => ({
    pairUnique: uniqueIndex("exchange_rates_pair_date_provider_unique").on(
      t.fromCurrency,
      t.toCurrency,
      t.rateDate,
      t.provider,
    ),
    pairDateIdx: index("idx_exchange_rates_pair_date").on(t.fromCurrency, t.toCurrency, t.rateDate),
  }),
)

/**
 * Physical payment cards (debit, credit, prepaid, virtual). A card is an identity object,
 * not a balance: it never moves net worth on its own. Scans live in `cardImages`; the row
 * only records the file name under the sidecar's card-images directory.
 */
export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    bank: text("bank").notNull(),
    cardType: text("card_type", { enum: ["debit", "credit", "prepaid", "virtual", "other"] })
      .notNull()
      .default("debit"),
    brand: text("brand", { enum: ["unionpay", "visa", "mastercard", "amex", "jcb", "other"] })
      .notNull()
      .default("unionpay"),
    numberLast4: text("number_last4"),
    holderName: text("holder_name"),
    currency: text("currency").notNull().default("CNY"),
    creditLimit: text("credit_limit"),
    billingDay: integer("billing_day"),
    repaymentDay: integer("repayment_day"),
    expiryMonth: integer("expiry_month"),
    expiryYear: integer("expiry_year"),
    colorHex: text("color_hex"),
    note: text("note"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    statusIdx: index("idx_cards_status").on(t.status),
    bankIdx: index("idx_cards_bank").on(t.bank),
    orderIdx: index("idx_cards_order").on(t.displayOrder),
  }),
)

/** Front and back scans, at most one row per side per card. */
export const cardImages = sqliteTable(
  "card_images",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    side: text("side", { enum: ["front", "back"] }).notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    cardSideUnique: uniqueIndex("card_images_card_side_unique").on(t.cardId, t.side),
    cardIdx: index("idx_card_images_card").on(t.cardId),
  }),
)

export type CategoryRow = typeof categories.$inferSelect
export type CategoryInsert = typeof categories.$inferInsert
export type TagRow = typeof tags.$inferSelect
export type TagInsert = typeof tags.$inferInsert
export type StatementImportRow = typeof statementImports.$inferSelect
export type StatementImportInsert = typeof statementImports.$inferInsert
export type StatementLineRow = typeof statementLines.$inferSelect
export type StatementLineInsert = typeof statementLines.$inferInsert
export type CashflowEventRow = typeof cashflowEvents.$inferSelect
export type CashflowEventInsert = typeof cashflowEvents.$inferInsert
export type CashflowEventTagRow = typeof cashflowEventTags.$inferSelect
export type CashflowEventTagInsert = typeof cashflowEventTags.$inferInsert
export type AssetItemRow = typeof assetItems.$inferSelect
export type AssetItemInsert = typeof assetItems.$inferInsert
export type AssetSnapshotRow = typeof assetSnapshots.$inferSelect
export type AssetSnapshotInsert = typeof assetSnapshots.$inferInsert
export type InvestmentPositionRow = typeof investmentPositions.$inferSelect
export type InvestmentPositionInsert = typeof investmentPositions.$inferInsert
export type InvestmentTransactionRow = typeof investmentTransactions.$inferSelect
export type InvestmentTransactionInsert = typeof investmentTransactions.$inferInsert
export type PriceQuoteRow = typeof priceQuotes.$inferSelect
export type PriceQuoteInsert = typeof priceQuotes.$inferInsert
export type ContractPositionRow = typeof contractPositions.$inferSelect
export type ContractPositionInsert = typeof contractPositions.$inferInsert
export type SubscriptionRow = typeof subscriptions.$inferSelect
export type SubscriptionInsert = typeof subscriptions.$inferInsert
export type SubscriptionOccurrenceRow = typeof subscriptionOccurrences.$inferSelect
export type SubscriptionOccurrenceInsert = typeof subscriptionOccurrences.$inferInsert
export type LoanRow = typeof loans.$inferSelect
export type LoanInsert = typeof loans.$inferInsert
export type LoanPaymentOccurrenceRow = typeof loanPaymentOccurrences.$inferSelect
export type LoanPaymentOccurrenceInsert = typeof loanPaymentOccurrences.$inferInsert
export type BudgetSetRow = typeof budgetSets.$inferSelect
export type BudgetSetInsert = typeof budgetSets.$inferInsert
export type BudgetPeriodRow = typeof budgetPeriods.$inferSelect
export type BudgetPeriodInsert = typeof budgetPeriods.$inferInsert
export type BudgetItemRow = typeof budgetItems.$inferSelect
export type BudgetItemInsert = typeof budgetItems.$inferInsert
export type BudgetItemScopeRow = typeof budgetItemScopes.$inferSelect
export type BudgetItemScopeInsert = typeof budgetItemScopes.$inferInsert
export type ObjectLinkRow = typeof objectLinks.$inferSelect
export type ObjectLinkInsert = typeof objectLinks.$inferInsert
export type CurrencySettingsRow = typeof currencySettings.$inferSelect
export type CurrencySettingsInsert = typeof currencySettings.$inferInsert
export type CardRow = typeof cards.$inferSelect
export type CardInsert = typeof cards.$inferInsert
export type CardImageRow = typeof cardImages.$inferSelect
export type CardImageInsert = typeof cardImages.$inferInsert
export type ExchangeRateRow = typeof exchangeRates.$inferSelect
export type ExchangeRateInsert = typeof exchangeRates.$inferInsert
