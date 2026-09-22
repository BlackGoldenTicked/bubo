/**
 * @purpose Encapsulate SQLite persistence for investment positions, trades, and manual price quotes.
 * @role    Infrastructure repository used by the investments API facade.
 * @deps    @bubo/db schema and Drizzle query builder.
 * @gotcha  Positions store replayed trade state; quotes never rewrite position rows directly.
 */

import { and, asc, desc, eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm"
import {
  assetItems,
  investmentPositions,
  investmentTransactions,
  priceQuotes,
  type Database,
  type InvestmentPositionInsert,
  type InvestmentPositionRow,
  type InvestmentTransactionInsert,
  type InvestmentTransactionRow,
  type PriceQuoteInsert,
  type PriceQuoteRow,
} from "@bubo/db"
import type { BuboId, ListInvestmentPositionsInput } from "@bubo/shared/contracts"
import { toSqlId } from "../../../shared/api-helpers"

export type InvestmentPositionWithAccount = InvestmentPositionRow & {
  accountName: string | null
  accountCurrency: string | null
}

export function createInvestmentsRepository(db: Database) {
  return {
    listPositions(input: ListInvestmentPositionsInput = {}): InvestmentPositionWithAccount[] {
      const conds: SQL[] = []
      if (input.status) conds.push(eq(investmentPositions.status, input.status))
      if (input.assetItemId)
        conds.push(eq(investmentPositions.assetItemId, toSqlId(input.assetItemId)))
      return db
        .select({
          ...getTableColumns(investmentPositions),
          accountName: assetItems.name,
          accountCurrency: assetItems.defaultCurrency,
        })
        .from(investmentPositions)
        .leftJoin(assetItems, eq(assetItems.id, investmentPositions.assetItemId))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(
          sql`case when ${investmentPositions.status} = 'open' then 0 else 1 end`,
          asc(investmentPositions.symbol),
          asc(investmentPositions.createdAt),
        )
        .all()
    },

    getPosition(id: BuboId): InvestmentPositionWithAccount | undefined {
      return db
        .select({
          ...getTableColumns(investmentPositions),
          accountName: assetItems.name,
          accountCurrency: assetItems.defaultCurrency,
        })
        .from(investmentPositions)
        .leftJoin(assetItems, eq(assetItems.id, investmentPositions.assetItemId))
        .where(eq(investmentPositions.id, toSqlId(id)))
        .get()
    },

    insertPosition(values: InvestmentPositionInsert): void {
      db.insert(investmentPositions).values(values).run()
    },

    updatePosition(id: BuboId, values: Partial<InvestmentPositionInsert>): void {
      db.update(investmentPositions)
        .set(values)
        .where(eq(investmentPositions.id, toSqlId(id)))
        .run()
    },

    deletePosition(id: BuboId): void {
      db.delete(investmentPositions)
        .where(eq(investmentPositions.id, toSqlId(id)))
        .run()
    },

    /** Execution order defines replay order; rowid breaks same-timestamp ties by insertion. */
    listTransactions(positionId: BuboId): InvestmentTransactionRow[] {
      return db
        .select()
        .from(investmentTransactions)
        .where(eq(investmentTransactions.positionId, toSqlId(positionId)))
        .orderBy(
          asc(investmentTransactions.executedAt),
          asc(investmentTransactions.createdAt),
          sql`rowid`,
        )
        .all()
    },

    getTransaction(id: BuboId): InvestmentTransactionRow | undefined {
      return db
        .select()
        .from(investmentTransactions)
        .where(eq(investmentTransactions.id, toSqlId(id)))
        .get()
    },

    insertTransaction(values: InvestmentTransactionInsert): void {
      db.insert(investmentTransactions).values(values).run()
    },

    deleteTransaction(id: BuboId): void {
      db.delete(investmentTransactions)
        .where(eq(investmentTransactions.id, toSqlId(id)))
        .run()
    },

    /** Rows arrive newest-first; callers keep the first occurrence per symbol. */
    latestQuotesForSymbols(symbols: string[]): PriceQuoteRow[] {
      if (symbols.length === 0) return []
      return db
        .select()
        .from(priceQuotes)
        .where(inArray(priceQuotes.symbol, symbols))
        .orderBy(desc(priceQuotes.quotedAt), desc(priceQuotes.id))
        .all()
    },

    listQuotes(symbol: string, limit: number): PriceQuoteRow[] {
      return db
        .select()
        .from(priceQuotes)
        .where(eq(priceQuotes.symbol, symbol))
        .orderBy(desc(priceQuotes.quotedAt), desc(priceQuotes.id))
        .limit(limit)
        .all()
    },

    getQuote(id: BuboId): PriceQuoteRow | undefined {
      return db
        .select()
        .from(priceQuotes)
        .where(eq(priceQuotes.id, toSqlId(id)))
        .get()
    },

    insertQuote(values: PriceQuoteInsert): void {
      db.insert(priceQuotes).values(values).run()
    },
  }
}
