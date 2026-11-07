/**
 * @purpose Exercise payment-card CRUD and scan metadata persistence.
 * @role    Integration safety net for the cards domain against an isolated SQLite database.
 * @deps    Vitest, @bubo/api, @bubo/db, and Node-compatible SQLite setup.
 * @gotcha  Scans are recorded by metadata only; this layer must never claim to store bytes.
 *          Removing a face keeps the card, and archiving keeps both the card and its scans.
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
import { createBuboApi, type BuboApi } from "../src"

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, "../../db/migrations")
const tmpRoot = mkdtempSync(join(tmpdir(), "bubo-card-tests-"))

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

describe("cards", () => {
  let api: BuboApi

  beforeEach(async () => {
    ;({ api } = await createApi(`cards-${Math.random().toString(36).slice(2)}`))
  })

  it("creates a card and normalizes the last four digits", async () => {
    const card = expectOk(
      await api.createCard({
        name: "招行 Visa 白金",
        bank: "招商银行",
        cardType: "credit",
        brand: "visa",
        numberLast4: "6225 8801 2345 6789",
        creditLimit: "50000.00",
        billingDay: 5,
        repaymentDay: 23,
      }),
    )

    expect(card.numberLast4).toBe("6789")
    expect(card.cardType).toBe("credit")
    expect(card.status).toBe("active")
    expect(card.images).toEqual({ front: null, back: null })
  })

  it("rejects a card without a name or bank", async () => {
    expect(expectFail(await api.createCard({ name: " ", bank: "招商银行" }))).toContain("卡片名称")
    expect(expectFail(await api.createCard({ name: "白金卡", bank: " " }))).toContain("发卡银行")
  })

  it("lists by status and sorts by display order", async () => {
    expectOk(await api.createCard({ name: "B 卡", bank: "工行", displayOrder: 20 }))
    expectOk(await api.createCard({ name: "A 卡", bank: "招行", displayOrder: 10 }))

    const listed = expectOk(await api.listCards())
    expect(listed.map((card) => card.name)).toEqual(["A 卡", "B 卡"])
  })

  it("updates fields and keeps untouched ones", async () => {
    const card = expectOk(await api.createCard({ name: "旧名", bank: "招行", billingDay: 5 }))
    const updated = expectOk(
      await api.updateCard({ id: card.id, name: "新名", repaymentDay: 23 }),
    )

    expect(updated.name).toBe("新名")
    expect(updated.bank).toBe("招行")
    expect(updated.billingDay).toBe(5)
    expect(updated.repaymentDay).toBe(23)
  })

  it("archives without deleting and can restore", async () => {
    const card = expectOk(await api.createCard({ name: "年费卡", bank: "建行" }))
    expectOk(await api.archiveCard({ id: card.id }))

    expect(expectOk(await api.listCards())).toHaveLength(0)
    const withArchived = expectOk(await api.listCards({ includeArchived: true }))
    expect(withArchived[0]?.status).toBe("archived")

    const restored = expectOk(await api.archiveCard({ id: card.id, archived: false }))
    expect(restored.status).toBe("active")
  })

  it("stores one scan per side and replaces it idempotently", async () => {
    const card = expectOk(await api.createCard({ name: "副卡", bank: "中行" }))

    const first = expectOk(
      await api.saveCardImage({
        cardId: card.id,
        side: "front",
        fileName: "card-1-front.jpg",
        mimeType: "image/jpeg",
        byteSize: 1024,
      }),
    )
    expect(first.images.front?.fileName).toBe("card-1-front.jpg")

    const replaced = expectOk(
      await api.saveCardImage({
        cardId: card.id,
        side: "front",
        fileName: "card-1-front-v2.jpg",
        mimeType: "image/jpeg",
        byteSize: 2048,
        width: 1600,
        height: 1008,
      }),
    )
    expect(replaced.images.front?.fileName).toBe("card-1-front-v2.jpg")
    expect(replaced.images.front?.width).toBe(1600)

    const both = expectOk(
      await api.saveCardImage({
        cardId: card.id,
        side: "back",
        fileName: "card-1-back.png",
        mimeType: "image/png",
        byteSize: 4096,
      }),
    )
    expect(both.images.front?.fileName).toBe("card-1-front-v2.jpg")
    expect(both.images.back?.fileName).toBe("card-1-back.png")
  })

  it("removes one face without touching the other or the card", async () => {
    const card = expectOk(await api.createCard({ name: "一卡两面", bank: "交行" }))
    expectOk(
      await api.saveCardImage({
        cardId: card.id,
        side: "front",
        fileName: "f.jpg",
        mimeType: "image/jpeg",
        byteSize: 10,
      }),
    )
    expectOk(
      await api.saveCardImage({
        cardId: card.id,
        side: "back",
        fileName: "b.jpg",
        mimeType: "image/jpeg",
        byteSize: 10,
      }),
    )

    const afterRemove = expectOk(await api.removeCardImage({ cardId: card.id, side: "front" }))
    expect(afterRemove.images.front).toBeNull()
    expect(afterRemove.images.back?.fileName).toBe("b.jpg")

    const stillThere = expectOk(await api.getCard({ id: card.id }))
    expect(stillThere?.name).toBe("一卡两面")
  })

  it("refuses scans for a card that does not exist", async () => {
    const error = expectFail(
      await api.saveCardImage({
        cardId: "card_missing",
        side: "front",
        fileName: "x.jpg",
        mimeType: "image/jpeg",
        byteSize: 10,
      }),
    )
    expect(error).toContain("卡片不存在")
  })
})
