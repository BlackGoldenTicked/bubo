/**
 * @purpose Exercise contract-position CRUD, close outcomes, and derived P&L boundaries.
 * @role    Integration safety net for the contract layer against an isolated SQLite database.
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
import { contractPositions, type Database, schema } from "@bubo/db"
import { createBuboApi } from "../src"

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, "../../db/migrations")
const tmpRoot = mkdtempSync(join(tmpdir(), "bubo-contract-tests-"))

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

beforeEach(() => {
  mkdirSync(tmpRoot, { recursive: true })
})

describe("contract positions", () => {
  it("creates a normalized open contract derived from the opening entry", async () => {
    const { api } = await createApi("contracts-basic")
    const contract = expectOk(
      await api.createContractPosition({
        symbol: " btcusdt ",
        side: "long",
        leverageBps: 100_000,
        quantity: "0.5",
        entryPrice: "60000",
        markPrice: "64500",
        marginAmount: "3000",
        openedAt: "2026-09-01T09:00:00.000Z",
      }),
    )
    expect(contract.symbol).toBe("BTCUSDT")
    expect(contract.side).toBe("long")
    expect(contract.marginMode).toBe("isolated")
    expect(contract.leverageBps).toBe(100_000)
    expect(contract.quantity).toBe("0.5")
    expect(contract.entryPrice).toBe("60000.00")
    expect(contract.markPrice).toBe("64500.00")
    expect(contract.exitPrice).toBeNull()
    expect(contract.currency).toBe("USD")
    expect(contract.status).toBe("open")
    expect(contract.closedAt).toBeNull()
    expect(contract.openedAt).toBe("2026-09-01T09:00:00.000Z")
  })

  it("defaults leverage to 1x and stores the row without materializing anything", async () => {
    const { api, db } = await createApi("contracts-defaults")
    const contract = expectOk(
      await api.createContractPosition({
        symbol: "ETHUSD",
        side: "short",
        quantity: "2",
        entryPrice: "3200",
        currency: "usd",
      }),
    )
    expect(contract.leverageBps).toBe(10_000)
    expect(contract.markPrice).toBeNull()
    expect(contract.marginAmount).toBeNull()

    // Contracts are display records: no quotes, snapshots, or cashflow may appear.
    const stored = db.select().from(contractPositions).all()
    expect(stored).toHaveLength(1)
    expect(stored[0].status).toBe("open")
  })

  it("rejects invalid openings with rule errors", async () => {
    const { api } = await createApi("contracts-validation")
    expect(
      expectFail(
        await api.createContractPosition({
          symbol: "  ",
          side: "long",
          quantity: "1",
          entryPrice: "100",
        }),
      ),
    ).toContain("symbol")
    expect(
      expectFail(
        await api.createContractPosition({
          symbol: "BTCUSD",
          // Unknown side bypasses the shared type on purpose.
          side: "up" as unknown as "long",
          quantity: "1",
          entryPrice: "100",
        }),
      ),
    ).toContain("side")
    expect(
      expectFail(
        await api.createContractPosition({
          symbol: "BTCUSD",
          side: "long",
          leverageBps: 2_000_000,
          quantity: "1",
          entryPrice: "100",
        }),
      ),
    ).toContain("leverage")
    expect(
      expectFail(
        await api.createContractPosition({
          symbol: "BTCUSD",
          side: "long",
          quantity: "0",
          entryPrice: "100",
        }),
      ),
    ).toContain("quantity")
    expect(
      expectFail(
        await api.createContractPosition({
          symbol: "BTCUSD",
          side: "long",
          quantity: "1",
          entryPrice: "-1",
        }),
      ),
    ).toContain("entryPrice")
  })

  it("lists contracts with a status filter", async () => {
    const { api } = await createApi("contracts-list")
    const open = expectOk(
      await api.createContractPosition({
        symbol: "BTCUSD",
        side: "long",
        quantity: "1",
        entryPrice: "100",
      }),
    )
    const toClose = expectOk(
      await api.createContractPosition({
        symbol: "ETHUSD",
        side: "short",
        quantity: "1",
        entryPrice: "200",
      }),
    )
    expectOk(await api.closeContractPosition({ id: toClose.id, exitPrice: "190" }))

    const all = expectOk(await api.listContractPositions())
    expect(all).toHaveLength(2)
    const openOnly = expectOk(await api.listContractPositions({ status: "open" }))
    expect(openOnly.map((row) => row.id)).toEqual([open.id])
    const closedOnly = expectOk(await api.listContractPositions({ status: "closed" }))
    expect(closedOnly.map((row) => row.id)).toEqual([toClose.id])
  })

  it("updates trackable fields and clears them when null is passed", async () => {
    const { api } = await createApi("contracts-update")
    const contract = expectOk(
      await api.createContractPosition({
        symbol: "BTCUSD",
        side: "long",
        quantity: "1",
        entryPrice: "100",
      }),
    )
    const updated = expectOk(
      await api.updateContractPosition({
        id: contract.id,
        markPrice: "110",
        liquidationPrice: "80",
        marginAmount: "25",
        note: "moved stop",
      }),
    )
    expect(updated.markPrice).toBe("110.00")
    expect(updated.liquidationPrice).toBe("80.00")
    expect(updated.marginAmount).toBe("25.00")
    expect(updated.note).toBe("moved stop")

    const cleared = expectOk(
      await api.updateContractPosition({
        id: contract.id,
        markPrice: null,
        liquidationPrice: null,
        marginAmount: null,
        note: null,
      }),
    )
    expect(cleared.markPrice).toBeNull()
    expect(cleared.liquidationPrice).toBeNull()
    expect(cleared.marginAmount).toBeNull()
    expect(cleared.note).toBeNull()

    expect(expectFail(await api.updateContractPosition({ id: "missing", note: "x" }))).toContain(
      "not found",
    )
  })

  it("requires a fill price for a normal close and records the exit", async () => {
    const { api } = await createApi("contracts-close")
    const contract = expectOk(
      await api.createContractPosition({
        symbol: "ETHUSD",
        side: "short",
        quantity: "4",
        entryPrice: "3200",
        marginAmount: "2560",
      }),
    )
    expect(expectFail(await api.closeContractPosition({ id: contract.id }))).toContain("exitPrice")

    const closed = expectOk(
      await api.closeContractPosition({
        id: contract.id,
        outcome: "closed",
        exitPrice: "2950",
        closedAt: "2026-09-10T15:00:00.000Z",
      }),
    )
    expect(closed.status).toBe("closed")
    expect(closed.exitPrice).toBe("2950.00")
    expect(closed.closedAt).toBe("2026-09-10T15:00:00.000Z")

    // A finished contract cannot be closed twice.
    expect(
      expectFail(await api.closeContractPosition({ id: contract.id, exitPrice: "1" })),
    ).toContain("already closed")
  })

  it("closes a liquidation without a fill price", async () => {
    const { api } = await createApi("contracts-liquidation")
    const contract = expectOk(
      await api.createContractPosition({
        symbol: "SOLUSD",
        side: "long",
        leverageBps: 200_000,
        quantity: "50",
        entryPrice: "160",
        marginAmount: "400",
      }),
    )
    const liquidated = expectOk(
      await api.closeContractPosition({ id: contract.id, outcome: "liquidated" }),
    )
    expect(liquidated.status).toBe("liquidated")
    expect(liquidated.exitPrice).toBeNull()
    expect(liquidated.closedAt).not.toBeNull()
  })

  it("deletes a contract and reports unknown ids", async () => {
    const { api } = await createApi("contracts-delete")
    const contract = expectOk(
      await api.createContractPosition({
        symbol: "BTCUSD",
        side: "long",
        quantity: "1",
        entryPrice: "100",
      }),
    )
    expectOk(await api.deleteContractPosition({ id: contract.id }))
    expect(expectOk(await api.listContractPositions())).toHaveLength(0)
    expect(expectFail(await api.deleteContractPosition({ id: contract.id }))).toContain("not found")
  })
})
