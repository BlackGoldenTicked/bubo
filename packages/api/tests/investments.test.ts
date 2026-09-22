/**
 * @purpose Exercise investment positions, trades, quotes, and snapshot materialization.
 * @role    Integration safety net for the investment domain against an isolated SQLite database.
 * @deps    Vitest, @bubo/api, @bubo/db, and Node-compatible SQLite setup.
 * @gotcha  Run through Node 22 when touching better-sqlite3, matching the Tauri sidecar.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"
import BetterSqlite3 from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { type Database, schema } from "@bubo/db"
import { createBuboApi, type BuboApi, type BuboId } from "../src"

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, "../../db/migrations")
const tmpRoot = mkdtempSync(join(tmpdir(), "bubo-investment-tests-"))

function createDb(dbPath: string): Database {
  const client = new BetterSqlite3(dbPath)
  client.pragma("foreign_keys = ON")
  const db = drizzle(client, { schema })
  migrate(db, { migrationsFolder })
  return db
}

function expectOk<T>(result: { success: true; data: T } | { success: false; error: string }) {
  if (!result.success) throw new Error(result.error)
  return result.data
}

function expectFail(result: { success: boolean; error?: string }) {
  if (result.success) throw new Error("expected the call to fail")
  return result.error ?? ""
}

async function createApi(name: string) {
  mkdirSync(tmpRoot, { recursive: true })
  const dbPath = resolve(tmpRoot, `${name}.sqlite3`)
  rmSync(dbPath, { force: true })
  const db = createDb(dbPath)
  return { api: createBuboApi(db), db }
}

async function createAccount(
  api: BuboApi,
  name: string,
  currency = "CNY",
): Promise<{ id: BuboId }> {
  return expectOk(
    await api.createAssetItem({
      name,
      assetType: "brokerage",
      defaultCurrency: currency,
    }),
  )
}

beforeEach(() => {
  mkdirSync(tmpRoot, { recursive: true })
})

describe("investment positions", () => {
  it("derives opening state from the first buy and stores a replayable trade", async () => {
    const { api } = await createApi("investments-basic")
    const position = expectOk(
      await api.createInvestmentPosition({
        symbol: "aapl",
        name: "Apple",
        instrumentKind: "stock",
        currency: "USD",
        initialQuantity: "10",
        initialPrice: "100",
        initialFeeAmount: "5",
        initialExecutedAt: "2026-09-01T02:00:00.000Z",
      }),
    )
    expect(position.symbol).toBe("AAPL")
    expect(position.quantity).toBe("10")
    // Weighted average includes the fee: (10 * 100 + 5) / 10.
    expect(position.avgCostPrice).toBe("100.50")
    expect(position.costBasisAmount).toBe("1005.00")
    expect(position.realizedPnlAmount).toBe("0.00")
    expect(position.status).toBe("open")
    expect(position.assetItemId).toBeNull()

    const detail = expectOk(await api.getInvestmentPosition({ id: position.id }))
    expect(detail?.transactions).toHaveLength(1)
    expect(detail?.transactions[0]).toMatchObject({
      side: "buy",
      quantity: "10",
      price: "100",
      feeAmount: "5",
      executedAt: "2026-09-01T02:00:00.000Z",
    })
  })

  it("replays buys and sells into quantity, average cost, and realized P&L", async () => {
    const { api } = await createApi("investments-replay")
    const position = expectOk(
      await api.createInvestmentPosition({
        symbol: "MSFT",
        instrumentKind: "stock",
        initialQuantity: "10",
        initialPrice: "100",
        initialExecutedAt: "2026-09-01T00:00:00.000Z",
      }),
    )
    let detail = expectOk(
      await api.addInvestmentTransaction({
        positionId: position.id,
        side: "buy",
        quantity: "10",
        price: "120",
        executedAt: "2026-09-02T00:00:00.000Z",
      }),
    )
    // Weighted average: (1000 + 1200) / 20 = 110.
    expect(detail.position.quantity).toBe("20")
    expect(detail.position.avgCostPrice).toBe("110.00")
    expect(detail.position.costBasisAmount).toBe("2200.00")

    detail = expectOk(
      await api.addInvestmentTransaction({
        positionId: position.id,
        side: "sell",
        quantity: "5",
        price: "130",
        feeAmount: "2",
        executedAt: "2026-09-03T00:00:00.000Z",
      }),
    )
    expect(detail.position.quantity).toBe("15")
    expect(detail.position.avgCostPrice).toBe("110.00")
    expect(detail.position.costBasisAmount).toBe("1650.00")
    // Realized: (130 - 110) * 5 - 2 = 98.
    expect(detail.position.realizedPnlAmount).toBe("98.00")

    const error = expectFail(
      await api.addInvestmentTransaction({
        positionId: position.id,
        side: "sell",
        quantity: "100",
        price: "130",
        executedAt: "2026-09-04T00:00:00.000Z",
      }),
    )
    expect(error).toContain("exceeds")
  })

  it("rejects invalid opening trades and unknown instruments", async () => {
    const { api } = await createApi("investments-validation")
    expectFail(
      await api.createInvestmentPosition({
        symbol: "BAD",
        instrumentKind: "stock",
        initialQuantity: "0",
        initialPrice: "10",
      }),
    )
    expectFail(
      await api.createInvestmentPosition({
        symbol: "   ",
        instrumentKind: "stock",
        initialQuantity: "1",
        initialPrice: "10",
      }),
    )
  })

  it("materializes account market value into one system snapshot per day", async () => {
    const { api } = await createApi("investments-materialize")
    const account = await createAccount(api, "Brokerage")
    const position = expectOk(
      await api.createInvestmentPosition({
        symbol: "600519",
        instrumentKind: "stock",
        assetItemId: account.id,
        initialQuantity: "10",
        initialPrice: "100",
      }),
    )
    const snapshots = expectOk(
      await api.listAssetSnapshots({ assetItemId: account.id, includeArchived: true }),
    )
    expect(snapshots).toHaveLength(1)
    // No quote yet: market value falls back to the average cost.
    expect(snapshots[0].valueNumber).toBe("1000.00")
    expect(snapshots[0].costBasisAmount).toBe("1000.00")
    expect(snapshots[0].source).toBe("system")
    expect(snapshots[0].assetItemId).toBe(account.id)

    // A manual quote re-values the same day's snapshot in place.
    expectOk(await api.recordPriceQuote({ symbol: "600519", price: "150" }))
    const afterQuote = expectOk(
      await api.listAssetSnapshots({ assetItemId: account.id, includeArchived: true }),
    )
    expect(afterQuote).toHaveLength(1)
    expect(afterQuote[0].valueNumber).toBe("1500.00")
    expect(afterQuote[0].costBasisAmount).toBe("1000.00")

    // Deleting the position clears the materialized value entirely.
    expectOk(await api.deleteInvestmentPosition({ id: position.id }))
    const afterDelete = expectOk(
      await api.listAssetSnapshots({ assetItemId: account.id, includeArchived: true }),
    )
    expect(afterDelete).toHaveLength(0)
  })

  it("surfaces materialized holdings in net worth and keeps quotes as the latest price", async () => {
    const { api } = await createApi("investments-networth")
    const account = await createAccount(api, "Brokerage")
    expectOk(
      await api.createInvestmentPosition({
        symbol: "BTC",
        instrumentKind: "crypto",
        assetItemId: account.id,
        initialQuantity: "0.5",
        initialPrice: "100000",
      }),
    )
    expectOk(await api.recordPriceQuote({ symbol: "BTC", price: "120000" }))

    const netWorth = expectOk(await api.getNetWorthSnapshot())
    expect(netWorth.assetValue.number).toBe("60000.00")

    const positions = expectOk(await api.listInvestmentPositions())
    expect(positions[0].lastPrice).toBe("120000.00")
    expect(positions[0].lastPriceQuotedAt).not.toBeNull()

    const quotes = expectOk(await api.listPriceQuotes({ symbol: "btc" }))
    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({ symbol: "BTC", price: "120000.00", source: "manual" })
  })

  it("lets a same-day manual snapshot win over the materialized system row", async () => {
    const { api } = await createApi("investments-manual-wins")
    const account = await createAccount(api, "Brokerage")
    expectOk(
      await api.createInvestmentPosition({
        symbol: "VOO",
        instrumentKind: "etf",
        assetItemId: account.id,
        initialQuantity: "10",
        initialPrice: "100",
      }),
    )
    const todayKey = new Date().toISOString().slice(0, 10)
    expectOk(
      await api.addAssetSnapshot({
        assetItemId: account.id,
        valueAmount: "2500.00",
        valueCurrency: "CNY",
        snapshotAt: `${todayKey}T09:00:00.000Z`,
      }),
    )
    // A trade re-materializes today's system row; the ISO manual row still sorts first.
    expectOk(
      await api.addInvestmentTransaction({
        positionId: expectOk(await api.listInvestmentPositions())[0].id,
        side: "buy",
        quantity: "1",
        price: "100",
        executedAt: `${todayKey}T00:00:00.000Z`,
      }),
    )
    const latest = expectOk(
      await api.listAssetSnapshots({ assetItemId: account.id, latestOnly: true }),
    )
    expect(latest).toHaveLength(1)
    expect(latest[0].valueNumber).toBe("2500.00")
    expect(latest[0].source).toBe("manual")
  })

  it("rejects cross-currency links and moves value when relinking", async () => {
    const { api } = await createApi("investments-currency")
    const cny = await createAccount(api, "CNY Brokerage")
    const cnyAlt = await createAccount(api, "CNY Brokerage 2")
    await createAccount(api, "USD Brokerage", "USD")
    const error = expectFail(
      await api.createInvestmentPosition({
        symbol: "AAPL",
        instrumentKind: "stock",
        assetItemId: cny.id,
        currency: "USD",
        initialQuantity: "1",
        initialPrice: "100",
      }),
    )
    expect(error).toContain("must match")

    const position = expectOk(
      await api.createInvestmentPosition({
        symbol: "AAPL",
        instrumentKind: "stock",
        assetItemId: cny.id,
        initialQuantity: "1",
        initialPrice: "100",
      }),
    )
    expectOk(await api.updateInvestmentPosition({ id: position.id, assetItemId: cnyAlt.id }))
    expect(
      expectOk(await api.listAssetSnapshots({ assetItemId: cny.id, includeArchived: true })),
    ).toHaveLength(0)
    expect(
      expectOk(await api.listAssetSnapshots({ assetItemId: cnyAlt.id, includeArchived: true })),
    ).toHaveLength(1)
  })

  it("keeps history valid when a trade is removed", async () => {
    const { api } = await createApi("investments-delete-trade")
    const position = expectOk(
      await api.createInvestmentPosition({
        symbol: "TSLA",
        instrumentKind: "stock",
        initialQuantity: "10",
        initialPrice: "100",
        initialExecutedAt: "2026-09-01T00:00:00.000Z",
      }),
    )
    const detail = expectOk(
      await api.addInvestmentTransaction({
        positionId: position.id,
        side: "sell",
        quantity: "10",
        price: "110",
        executedAt: "2026-09-02T00:00:00.000Z",
      }),
    )
    expect(detail.position.status).toBe("closed")
    expect(detail.position.realizedPnlAmount).toBe("100.00")

    const sell = detail.transactions.find((transaction) => transaction.side === "sell")
    const afterDelete = expectOk(await api.deleteInvestmentTransaction({ id: sell?.id ?? "" }))
    expect(afterDelete.position.status).toBe("open")
    expect(afterDelete.position.quantity).toBe("10")
    expect(afterDelete.position.realizedPnlAmount).toBe("0.00")
    expect(afterDelete.transactions).toHaveLength(1)
  })

  it("filters positions by status and account", async () => {
    const { api } = await createApi("investments-filters")
    const account = await createAccount(api, "Brokerage")
    const linked = expectOk(
      await api.createInvestmentPosition({
        symbol: "SPY",
        instrumentKind: "etf",
        assetItemId: account.id,
        initialQuantity: "1",
        initialPrice: "500",
      }),
    )
    expectOk(
      await api.createInvestmentPosition({
        symbol: "GLD",
        instrumentKind: "etf",
        initialQuantity: "2",
        initialPrice: "200",
      }),
    )
    expect(expectOk(await api.listInvestmentPositions())).toHaveLength(2)
    expect(expectOk(await api.listInvestmentPositions({ assetItemId: account.id }))).toHaveLength(1)
    expect(expectOk(await api.listInvestmentPositions({ status: "closed" }))).toHaveLength(0)
    expect(linked.accountName).toBe("Brokerage")
  })
})
