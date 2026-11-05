/**
 * @purpose Verify the Tauri sidecar reuses bubo's data API and local refresh protocol.
 * @role    Integration regression for isolated SQLite, tRPC reads/writes, and CLI refresh hints.
 * @deps    Vitest, Node sockets, shared IPC/tRPC contracts, and TauriLedgerStore.
 * @gotcha  Run through Node 22 so better-sqlite3 matches the packaged sidecar ABI.
 */

import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import type { LedgerChangeEvent } from "@bubo/shared/ipc"

import { createDesktopTrpcHandler } from "../main/trpc/transport"
import { TauriLedgerStore } from "./ledger-store"
import { SidecarVoiceService } from "./voice-service"
import { VoiceSettingsStore } from "./voice-settings-store"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("TauriLedgerStore", () => {
  it("serves existing tRPC reads and writes through one isolated SQLite ledger", async () => {
    const root = mkdtempSync(join(tmpdir(), "bubo-tauri-sidecar-test-"))
    temporaryDirectories.push(root)
    const resourcesDir = join(root, "resources")
    mkdirSync(resourcesDir)
    let emitLedgerChange: ((event: LedgerChangeEvent & { receivedAt: string }) => void) | null =
      null

    const store = new TauriLedgerStore({
      userDataDir: join(root, "user-data"),
      migrationsDir: resolve(import.meta.dirname, "../../../../packages/db/migrations"),
      resourcesDir,
      backgroundMaintenance: false,
      ledgerChangeServerStarter: async (options) => {
        emitLedgerChange = options.onLedgerChanged
        return null
      },
    })
    try {
      await store.init()

      expect(store.databaseExists()).toBe(true)
      expect(store.getActive()).toMatchObject({ name: "我的账本", isDemo: false })

      const request = createDesktopTrpcHandler(
        () => ({
          api: store.getApi(),
          ledgers: store,
          voice: new SidecarVoiceService({
            settings: new VoiceSettingsStore(join(root, "user-data")),
            getApi: () => store.getApi(),
          }),
        }),
        "test-sidecar",
      )
      const created = await request({
        type: "mutation",
        path: "reference.createCategory",
        input: { name: "Tauri Bridge Test", categoryKind: "expense" },
      })
      expect(created.ok).toBe(true)

      const listed = await request({
        type: "query",
        path: "reference.categories",
        input: { categoryKind: "expense" },
      })
      expect(listed.ok).toBe(true)
      if (listed.ok) {
        expect(listed.data).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: "Tauri Bridge Test" })]),
        )
      }

      const account = await request({
        type: "mutation",
        path: "assets.createItem",
        input: { name: "华泰证券账户", assetType: "brokerage", defaultCurrency: "CNY" },
      })
      expect(account.ok).toBe(true)
      const accountId =
        account.ok && account.data != null && typeof account.data === "object"
          ? (account.data as { id: string | number }).id
          : null
      expect(accountId).not.toBeNull()

      const position = await request({
        type: "mutation",
        path: "investments.createPosition",
        input: {
          assetItemId: accountId,
          symbol: "600519",
          name: "贵州茅台",
          instrumentKind: "stock",
          currency: "CNY",
          initialQuantity: "10",
          initialPrice: "1580.00",
          initialFeeAmount: "5.00",
          initialExecutedAt: "2026-09-01T02:00:00.000Z",
        },
      })
      expect(position.ok).toBe(true)

      const quote = await request({
        type: "mutation",
        path: "investments.recordQuote",
        input: { symbol: "600519", price: "1690.00", currency: "CNY" },
      })
      expect(quote.ok).toBe(true)

      const positions = await request({
        type: "query",
        path: "investments.positions",
        input: {},
      })
      expect(positions.ok).toBe(true)
      if (positions.ok) {
        expect(positions.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ symbol: "600519", quantity: "10", lastPrice: "1690.00" }),
          ]),
        )
      }

      const contract = await request({
        type: "mutation",
        path: "contracts.createPosition",
        input: {
          symbol: "BTCUSD",
          side: "long",
          leverageBps: 100_000,
          quantity: "0.5",
          entryPrice: "60000",
          markPrice: "64500",
        },
      })
      expect(contract.ok).toBe(true)

      const contracts = await request({
        type: "query",
        path: "contracts.positions",
        input: {},
      })
      expect(contracts.ok).toBe(true)
      if (contracts.ok) {
        expect(contracts.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ symbol: "BTCUSD", side: "long", status: "open" }),
          ]),
        )
      }

      const dbPath = store.getActiveFilePath()!
      const event: LedgerChangeEvent = {
        type: "ledger.changed",
        dbPath,
        source: "bubo-cli",
        command: "tauri-sidecar-test",
        pid: process.pid,
        changedAt: new Date().toISOString(),
      }
      expect(emitLedgerChange).not.toBeNull()
      emitLedgerChange!({ ...event, receivedAt: new Date().toISOString() })
      expect(store.drainLedgerChanges()).toEqual([
        expect.objectContaining({ command: "tauri-sidecar-test", dbPath }),
      ])
    } finally {
      store.close()
    }
  })
})
