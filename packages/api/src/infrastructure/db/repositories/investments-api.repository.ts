/**
 * @purpose Implement investment persistence operations for the layered API facade.
 * @role    Infrastructure repository layer module used by use-case wrappers.
 * @deps    /db schema, asset repository capabilities, domain rules, and shared API helpers.
 * @gotcha  Market value reaches net worth only through materialized system asset snapshots.
 */

import type { AssetItemRow, InvestmentPositionInsert } from "@bubo/db"
import type { Result } from "@bubo/shared"
import type {
  AddInvestmentTransactionInput,
  BuboId,
  CreateInvestmentPositionInput,
  DeleteInvestmentPositionInput,
  DeleteInvestmentTransactionInput,
  GetInvestmentPositionInput,
  InvestmentPositionDetail,
  InvestmentPositionSummary,
  ListInvestmentPositionsInput,
  ListPriceQuotesInput,
  PriceQuoteSummary,
  RecordPriceQuoteInput,
  UpdateInvestmentPositionInput,
} from "../../../index"
import {
  applyTrade,
  computeUnrealizedPnl,
  createEmptyPositionState,
  isInstrumentKind,
  normalizeSymbol,
  replayTrades,
  type PositionState,
  type TradeInput,
} from "../../../domain/investments/investment-rules"
import {
  mapInvestmentPosition,
  mapInvestmentTransaction,
  mapPriceQuote,
} from "../../../presentation/mappers/sqlite-row-mappers"
import {
  fail,
  newId,
  normalizeCurrency,
  nowIso,
  ok,
  toSqlId,
  todayKey,
} from "../../../shared/api-helpers"
import { AssetsApiRepository } from "./assets-api.repository"
import {
  createInvestmentsRepository,
  type InvestmentPositionWithAccount,
} from "./investments.repository"

const AUTO_SNAPSHOT_NOTE = "Auto materialized from investment positions"

function toTradeInput(row: {
  side: string
  quantity: string
  price: string
  feeAmount: string | null
}): TradeInput {
  return {
    side: row.side === "sell" ? "sell" : "buy",
    quantity: row.quantity,
    price: row.price,
    feeAmount: row.feeAmount,
  }
}

/** Up to 8 decimals, trailing zeros trimmed (quantities read as plain numbers). */
function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0"
  const [int, frac = ""] = value.toFixed(8).split(".")
  const trimmed = frac.replace(/0+$/, "")
  return trimmed === "" ? int : `${int}.${trimmed}`
}

/** Up to 8 decimals, trailing zeros trimmed, at least 2 decimals for money display. */
function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return "0.00"
  const [int, frac = ""] = value.toFixed(8).split(".")
  const trimmed = frac.replace(/0+$/, "")
  return `${int}.${trimmed.padEnd(2, "0")}`
}

export abstract class InvestmentsApiRepository extends AssetsApiRepository {
  protected investmentsRepository(): ReturnType<typeof createInvestmentsRepository> {
    return createInvestmentsRepository(this.db)
  }

  async listInvestmentPositions(
    input: ListInvestmentPositionsInput = {},
  ): Promise<Result<InvestmentPositionSummary[]>> {
    try {
      const repository = this.investmentsRepository()
      const rows = repository.listPositions(input)
      const quotes = this.latestQuoteMap(
        repository,
        rows.map((row) => row.symbol),
      )
      return ok(rows.map((row) => mapInvestmentPosition(row, quotes.get(row.symbol) ?? null)))
    } catch (error) {
      return fail(error)
    }
  }

  async getInvestmentPosition(
    input: GetInvestmentPositionInput,
  ): Promise<Result<InvestmentPositionDetail | null>> {
    try {
      return ok(this.positionDetail(input.id))
    } catch (error) {
      return fail(error)
    }
  }

  async createInvestmentPosition(
    input: CreateInvestmentPositionInput,
  ): Promise<Result<InvestmentPositionSummary>> {
    try {
      const symbol = normalizeSymbol(input.symbol)
      if (symbol === "") throw new Error("symbol is required")
      if (!isInstrumentKind(input.instrumentKind)) throw new Error("unknown instrument kind")
      const assetItemId = input.assetItemId ?? null
      const account = assetItemId != null ? this.requireAccount(assetItemId) : null
      const currency = normalizeCurrency(input.currency ?? account?.defaultCurrency)
      if (account != null) this.assertAccountCurrency(account, currency)
      // The opening buy validates through the same rules that will replay it.
      const state = applyTrade(createEmptyPositionState(), {
        side: "buy",
        quantity: input.initialQuantity,
        price: input.initialPrice,
        feeAmount: input.initialFeeAmount ?? null,
      })
      const repository = this.investmentsRepository()
      const timestamp = nowIso()
      const id = newId("pos")
      repository.insertPosition({
        id,
        assetItemId: assetItemId != null ? toSqlId(assetItemId) : null,
        symbol,
        name: input.name ?? null,
        instrumentKind: input.instrumentKind,
        currency,
        quantity: formatQuantity(state.quantity),
        avgCostPrice: formatMoney(state.avgCostPrice),
        costBasisAmount: formatMoney(state.costBasisAmount),
        realizedPnlAmount: "0.00",
        status: "open",
        note: input.note ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      repository.insertTransaction({
        id: newId("tx"),
        positionId: id,
        side: "buy",
        quantity: input.initialQuantity,
        price: input.initialPrice,
        feeAmount: input.initialFeeAmount ?? null,
        executedAt: input.initialExecutedAt?.trim() || timestamp,
        note: null,
        createdAt: timestamp,
      })
      await this.materializeAccountValue(assetItemId)
      return ok(this.positionSummary(id))
    } catch (error) {
      return fail(error)
    }
  }

  async updateInvestmentPosition(
    input: UpdateInvestmentPositionInput,
  ): Promise<Result<InvestmentPositionSummary>> {
    try {
      const repository = this.investmentsRepository()
      const existing = repository.getPosition(input.id)
      if (existing == null) throw new Error("position was not found")
      const set: Partial<InvestmentPositionInsert> = { updatedAt: nowIso() }
      if (input.symbol !== undefined) {
        const symbol = normalizeSymbol(input.symbol)
        if (symbol === "") throw new Error("symbol is required")
        set.symbol = symbol
      }
      if (input.name !== undefined) set.name = input.name
      if (input.instrumentKind !== undefined) {
        if (!isInstrumentKind(input.instrumentKind)) throw new Error("unknown instrument kind")
        set.instrumentKind = input.instrumentKind
      }
      if (input.note !== undefined) set.note = input.note
      if (input.assetItemId !== undefined) {
        if (input.assetItemId == null) {
          set.assetItemId = null
        } else {
          const account = this.requireAccount(input.assetItemId)
          this.assertAccountCurrency(account, normalizeCurrency(existing.currency))
          set.assetItemId = toSqlId(input.assetItemId)
        }
      }
      repository.updatePosition(input.id, set)
      if (set.assetItemId !== undefined) {
        // Relinking moves market value between accounts; refresh both sides.
        await this.materializeAccountValue(existing.assetItemId)
        await this.materializeAccountValue(set.assetItemId)
      }
      return ok(this.positionSummary(input.id))
    } catch (error) {
      return fail(error)
    }
  }

  async deleteInvestmentPosition(input: DeleteInvestmentPositionInput): Promise<Result<void>> {
    try {
      const repository = this.investmentsRepository()
      const existing = repository.getPosition(input.id)
      if (existing == null) throw new Error("position was not found")
      repository.deletePosition(input.id)
      await this.materializeAccountValue(existing.assetItemId)
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  }

  async addInvestmentTransaction(
    input: AddInvestmentTransactionInput,
  ): Promise<Result<InvestmentPositionDetail>> {
    try {
      if (input.side !== "buy" && input.side !== "sell") throw new Error("unknown trade side")
      const executedAt = input.executedAt?.trim()
      if (!executedAt) throw new Error("executedAt is required")
      const repository = this.investmentsRepository()
      const position = repository.getPosition(input.positionId)
      if (position == null) throw new Error("position was not found")
      const trade: TradeInput = {
        side: input.side,
        quantity: input.quantity,
        price: input.price,
        feeAmount: input.feeAmount ?? null,
      }
      // Validate against the full history before persisting (oversell, bad numbers).
      replayTrades([...repository.listTransactions(position.id).map(toTradeInput), trade])
      repository.insertTransaction({
        id: newId("tx"),
        positionId: position.id,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        feeAmount: trade.feeAmount,
        executedAt,
        note: input.note ?? null,
        createdAt: nowIso(),
      })
      this.recomputePosition(position.id)
      await this.materializeAccountValue(position.assetItemId)
      return ok(this.requireDetail(position.id))
    } catch (error) {
      return fail(error)
    }
  }

  async deleteInvestmentTransaction(
    input: DeleteInvestmentTransactionInput,
  ): Promise<Result<InvestmentPositionDetail>> {
    try {
      const repository = this.investmentsRepository()
      const transaction = repository.getTransaction(input.id)
      if (transaction == null) throw new Error("transaction was not found")
      const position = repository.getPosition(transaction.positionId)
      const remaining = repository
        .listTransactions(transaction.positionId)
        .filter((row) => row.id !== transaction.id)
      // The remaining history must still replay cleanly (a sell may lose its inventory).
      replayTrades(remaining.map(toTradeInput))
      repository.deleteTransaction(input.id)
      this.recomputePosition(transaction.positionId)
      await this.materializeAccountValue(position?.assetItemId ?? null)
      return ok(this.requireDetail(transaction.positionId))
    } catch (error) {
      return fail(error)
    }
  }

  async recordPriceQuote(input: RecordPriceQuoteInput): Promise<Result<PriceQuoteSummary>> {
    try {
      const symbol = normalizeSymbol(input.symbol)
      if (symbol === "") throw new Error("symbol is required")
      const price = Number(input.price)
      if (!Number.isFinite(price) || price <= 0) throw new Error("price must be a positive number")
      const repository = this.investmentsRepository()
      const id = newId("quote")
      repository.insertQuote({
        id,
        symbol,
        price: formatMoney(price),
        currency: normalizeCurrency(input.currency),
        quotedAt: input.quotedAt?.trim() || nowIso(),
        source: "manual",
        meta: null,
      })
      // Refresh every account holding this symbol so snapshots track the new quote.
      const accountIds = new Set<string>()
      for (const row of repository.listPositions({ status: "open" })) {
        if (row.symbol === symbol && row.assetItemId != null) accountIds.add(row.assetItemId)
      }
      for (const accountId of accountIds) await this.materializeAccountValue(accountId)
      return ok(mapPriceQuote(repository.getQuote(id)!))
    } catch (error) {
      return fail(error)
    }
  }

  async listPriceQuotes(input: ListPriceQuotesInput): Promise<Result<PriceQuoteSummary[]>> {
    try {
      const symbol = normalizeSymbol(input.symbol)
      if (symbol === "") throw new Error("symbol is required")
      const limit =
        input.limit != null && Number.isFinite(input.limit)
          ? Math.max(1, Math.min(500, Math.trunc(input.limit)))
          : 50
      const rows = this.investmentsRepository().listQuotes(symbol, limit)
      return ok(rows.map((row) => mapPriceQuote(row)))
    } catch (error) {
      return fail(error)
    }
  }

  /** Replay the full trade history and persist the derived position state. */
  private recomputePosition(positionId: BuboId): void {
    const repository = this.investmentsRepository()
    const state = replayTrades(repository.listTransactions(positionId).map(toTradeInput))
    repository.updatePosition(positionId, {
      quantity: formatQuantity(state.quantity),
      avgCostPrice: state.quantity > 0 ? formatMoney(state.avgCostPrice) : null,
      costBasisAmount: formatMoney(state.costBasisAmount),
      realizedPnlAmount: formatMoney(state.realizedPnlAmount),
      status: state.quantity > 0 ? "open" : "closed",
      updatedAt: nowIso(),
    })
  }

  /**
   * Materialize the account's open positions into one system snapshot per day.
   *
   * Net worth reads latest snapshots, so holdings must exist there or they are
   * invisible; writing them in place keeps a single source of truth. Manual
   * snapshots taken the same day carry an ISO timestamp that sorts after the
   * date-only key, so user-entered balances still win the latest-snapshot read.
   */
  private async materializeAccountValue(assetItemId: BuboId | null | undefined): Promise<void> {
    if (assetItemId == null) return
    const assetRepository = this.assetRepository()
    const snapshotAt = todayKey()
    const existing = assetRepository.findSnapshotBySource(assetItemId, snapshotAt, "system")
    const account = assetRepository.getItem(assetItemId)
    if (account == null || account.archivedAt != null) {
      if (existing != null) assetRepository.deleteSnapshot(existing.id)
      return
    }
    const repository = this.investmentsRepository()
    const currency = normalizeCurrency(account.defaultCurrency)
    const positions = repository
      .listPositions({ assetItemId, status: "open" })
      .filter((row) => normalizeCurrency(row.currency) === currency)
    if (positions.length === 0) {
      if (existing != null) assetRepository.deleteSnapshot(existing.id)
      return
    }
    const quotes = this.latestQuoteMap(
      repository,
      positions.map((row) => row.symbol),
    )
    let marketValue = 0
    let costBasis = 0
    for (const position of positions) {
      const state = this.positionStateFromRow(position)
      const quote = quotes.get(position.symbol)
      const lastPrice = quote != null ? Number(quote.price) : null
      marketValue += computeUnrealizedPnl(state, lastPrice).marketValue
      costBasis += state.costBasisAmount
    }
    const values = {
      snapshotAt,
      valueAmount: formatMoney(marketValue),
      valueCurrency: currency,
      quantityAmount: null,
      quantityUnit: null,
      costBasisAmount: formatMoney(costBasis),
      costBasisCurrency: currency,
      sourceKind: "system" as const,
      note: AUTO_SNAPSHOT_NOTE,
    }
    if (existing != null) {
      assetRepository.updateSnapshot(existing.id, values)
    } else {
      assetRepository.insertSnapshot({
        id: newId("snap"),
        assetItemId: toSqlId(assetItemId),
        createdAt: nowIso(),
        ...values,
      })
    }
  }

  private positionStateFromRow(row: InvestmentPositionWithAccount): PositionState {
    return {
      quantity: Number(row.quantity),
      costBasisAmount: Number(row.costBasisAmount ?? 0),
      avgCostPrice: Number(row.avgCostPrice ?? 0),
      realizedPnlAmount: 0,
    }
  }

  private latestQuoteMap(
    repository: ReturnType<typeof createInvestmentsRepository>,
    symbols: string[],
  ): Map<string, { price: string; quotedAt: string }> {
    const map = new Map<string, { price: string; quotedAt: string }>()
    const unique = Array.from(new Set(symbols))
    for (const row of repository.latestQuotesForSymbols(unique)) {
      if (!map.has(row.symbol)) {
        map.set(row.symbol, { price: row.price, quotedAt: row.quotedAt })
      }
    }
    return map
  }

  private positionDetail(id: BuboId): InvestmentPositionDetail | null {
    const repository = this.investmentsRepository()
    const row = repository.getPosition(id)
    if (row == null) return null
    const quote = this.latestQuoteMap(repository, [row.symbol]).get(row.symbol) ?? null
    return {
      position: mapInvestmentPosition(row, quote),
      transactions: repository
        .listTransactions(id)
        .map((transaction) => mapInvestmentTransaction(transaction)),
    }
  }

  private positionSummary(id: BuboId): InvestmentPositionSummary {
    const detail = this.requireDetail(id)
    return detail.position
  }

  private requireDetail(id: BuboId): InvestmentPositionDetail {
    const detail = this.positionDetail(id)
    if (detail == null) throw new Error("position was not found")
    return detail
  }

  private requireAccount(assetItemId: BuboId): AssetItemRow {
    const account = this.assetRepository().getItem(assetItemId)
    if (account == null) throw new Error("linked account was not found")
    if (account.archivedAt != null) throw new Error("linked account is archived")
    return account
  }

  private assertAccountCurrency(account: AssetItemRow, currency: string): void {
    const accountCurrency = normalizeCurrency(account.defaultCurrency)
    if (accountCurrency !== currency) {
      throw new Error(`position currency must match the linked account (${accountCurrency})`)
    }
  }
}
