/**
 * @purpose Implement payment-card persistence operations for the layered API facade.
 * @role    Infrastructure repository layer module used by the cards use-case wrapper.
 * @deps    /db cards and cardImages tables, Drizzle, and shared API helpers.
 * @gotcha  Image files are written by the desktop sidecar; this layer only stores their
 *          metadata, so a failed file copy must never leave a row pointing at a missing scan.
 *          A card is identity data — archiving it must not touch cashflow or asset snapshots.
 */

import { and, asc, eq } from "drizzle-orm"
import { cardImages, cards, type CardImageRow, type CardInsert, type CardRow } from "@bubo/db"
import type { Result } from "@bubo/shared"
import type {
  ArchiveCardInput,
  CardImageRefInput,
  CardImageSummary,
  CardSide,
  CardSummary,
  CreateCardInput,
  ListCardsInput,
  SaveCardImageInput,
  UpdateCardInput,
} from "../../../index"
import type { BuboId } from "../../../index"
import { AgentLedgerApiRepository } from "./agent-ledger-api.repository"
import { fail, newId, normalizeCurrency, nowIso, ok, toSqlId } from "../../../shared/api-helpers"

const MAX_LAST4 = 4

function normalizeLast4(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "")
  if (digits.length === 0) return null
  return digits.slice(-MAX_LAST4)
}

function normalizeDay(value: number | null | undefined): number | null {
  if (value == null) return null
  if (!Number.isFinite(value)) return null
  const day = Math.trunc(value)
  if (day < 1 || day > 31) return null
  return day
}

function normalizeOrder(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined
  return Math.trunc(value)
}

export abstract class CardsApiRepository extends AgentLedgerApiRepository {
  private mapCardImage(row: CardImageRow): CardImageSummary {
    return {
      side: row.side as CardSide,
      fileName: row.fileName,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      width: row.width ?? null,
      height: row.height ?? null,
      updatedAt: row.updatedAt,
    }
  }

  private imagesFor(cardId: string): CardSummary["images"] {
    const rows = this.db.select().from(cardImages).where(eq(cardImages.cardId, cardId)).all()
    const front = rows.find((row) => row.side === "front")
    const back = rows.find((row) => row.side === "back")
    return {
      front: front ? this.mapCardImage(front) : null,
      back: back ? this.mapCardImage(back) : null,
    }
  }

  private mapCard(row: CardRow): CardSummary {
    return {
      id: row.id,
      name: row.name,
      bank: row.bank,
      cardType: row.cardType,
      brand: row.brand,
      numberLast4: row.numberLast4 ?? null,
      holderName: row.holderName ?? null,
      currency: row.currency,
      creditLimit: row.creditLimit ?? null,
      billingDay: row.billingDay ?? null,
      repaymentDay: row.repaymentDay ?? null,
      expiryMonth: row.expiryMonth ?? null,
      expiryYear: row.expiryYear ?? null,
      colorHex: row.colorHex ?? null,
      note: row.note ?? null,
      status: row.status,
      displayOrder: row.displayOrder,
      images: this.imagesFor(row.id),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async listCards(input: ListCardsInput = {}): Promise<Result<CardSummary[]>> {
    try {
      const where = input.status
        ? eq(cards.status, input.status)
        : input.includeArchived
          ? undefined
          : eq(cards.status, "active")
      const bankFilter = input.bank ? eq(cards.bank, input.bank) : undefined
      const rows = this.db
        .select()
        .from(cards)
        .where(bankFilter ? (where ? and(where, bankFilter) : bankFilter) : where)
        .orderBy(asc(cards.displayOrder), asc(cards.bank), asc(cards.name))
        .all()
      return ok(rows.map((row) => this.mapCard(row)))
    } catch (error) {
      return fail(error)
    }
  }

  async getCard(input: { id: BuboId }): Promise<Result<CardSummary | null>> {
    try {
      const row = this.db
        .select()
        .from(cards)
        .where(eq(cards.id, toSqlId(input.id)))
        .get()
      return ok(row ? this.mapCard(row) : null)
    } catch (error) {
      return fail(error)
    }
  }

  async createCard(input: CreateCardInput): Promise<Result<CardSummary>> {
    try {
      const name = input.name?.trim() ?? ""
      const bank = input.bank?.trim() ?? ""
      if (name.length === 0) return fail("请填写卡片名称")
      if (bank.length === 0) return fail("请填写发卡银行")

      const id = newId("card")
      const timestamp = nowIso()
      this.db
        .insert(cards)
        .values({
          id,
          name,
          bank,
          cardType: input.cardType ?? "debit",
          brand: input.brand ?? "unionpay",
          numberLast4: normalizeLast4(input.numberLast4),
          holderName: input.holderName?.trim() || null,
          currency: normalizeCurrency(input.currency),
          creditLimit: input.creditLimit?.trim() || null,
          billingDay: normalizeDay(input.billingDay),
          repaymentDay: normalizeDay(input.repaymentDay),
          expiryMonth: normalizeDay(input.expiryMonth) == null ? null : input.expiryMonth!,
          expiryYear: input.expiryYear ?? null,
          colorHex: input.colorHex?.trim() || null,
          note: input.note?.trim() || null,
          status: "active",
          displayOrder: normalizeOrder(input.displayOrder) ?? 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run()
      return ok(this.mapCard(this.db.select().from(cards).where(eq(cards.id, id)).get()!))
    } catch (error) {
      return fail(error)
    }
  }

  async updateCard(input: UpdateCardInput): Promise<Result<CardSummary>> {
    try {
      const id = toSqlId(input.id)
      const set: Partial<CardInsert> = { updatedAt: nowIso() }
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (name.length === 0) return fail("请填写卡片名称")
        set.name = name
      }
      if (input.bank !== undefined) {
        const bank = input.bank.trim()
        if (bank.length === 0) return fail("请填写发卡银行")
        set.bank = bank
      }
      if (input.cardType !== undefined) set.cardType = input.cardType
      if (input.brand !== undefined) set.brand = input.brand
      if (input.numberLast4 !== undefined) set.numberLast4 = normalizeLast4(input.numberLast4)
      if (input.holderName !== undefined) set.holderName = input.holderName?.trim() || null
      if (input.currency !== undefined) set.currency = normalizeCurrency(input.currency)
      if (input.creditLimit !== undefined) set.creditLimit = input.creditLimit?.trim() || null
      if (input.billingDay !== undefined) set.billingDay = normalizeDay(input.billingDay)
      if (input.repaymentDay !== undefined) set.repaymentDay = normalizeDay(input.repaymentDay)
      if (input.expiryMonth !== undefined) set.expiryMonth = input.expiryMonth
      if (input.expiryYear !== undefined) set.expiryYear = input.expiryYear
      if (input.colorHex !== undefined) set.colorHex = input.colorHex?.trim() || null
      if (input.note !== undefined) set.note = input.note?.trim() || null
      if (input.displayOrder !== undefined) {
        set.displayOrder = normalizeOrder(input.displayOrder) ?? 0
      }

      const existing = this.db.select().from(cards).where(eq(cards.id, id)).get()
      if (!existing) return fail("卡片不存在")

      this.db.update(cards).set(set).where(eq(cards.id, id)).run()
      return ok(this.mapCard(this.db.select().from(cards).where(eq(cards.id, id)).get()!))
    } catch (error) {
      return fail(error)
    }
  }

  /** Archiving keeps the row (and its scans) so history stays readable. */
  async archiveCard(input: ArchiveCardInput): Promise<Result<CardSummary>> {
    try {
      const id = toSqlId(input.id)
      const existing = this.db.select().from(cards).where(eq(cards.id, id)).get()
      if (!existing) return fail("卡片不存在")
      this.db
        .update(cards)
        .set({ status: input.archived === false ? "active" : "archived", updatedAt: nowIso() })
        .where(eq(cards.id, id))
        .run()
      return ok(this.mapCard(this.db.select().from(cards).where(eq(cards.id, id)).get()!))
    } catch (error) {
      return fail(error)
    }
  }

  /** Upserts one face; the unique (card_id, side) index makes replacing a scan idempotent. */
  async saveCardImage(input: SaveCardImageInput): Promise<Result<CardSummary>> {
    try {
      const cardId = toSqlId(input.cardId)
      const existing = this.db.select().from(cards).where(eq(cards.id, cardId)).get()
      if (!existing) return fail("卡片不存在")

      const timestamp = nowIso()
      const current = this.db
        .select()
        .from(cardImages)
        .where(and(eq(cardImages.cardId, cardId), eq(cardImages.side, input.side)))
        .get()

      if (current) {
        this.db
          .update(cardImages)
          .set({
            fileName: input.fileName,
            mimeType: input.mimeType,
            byteSize: input.byteSize,
            width: input.width ?? null,
            height: input.height ?? null,
            updatedAt: timestamp,
          })
          .where(eq(cardImages.id, current.id))
          .run()
      } else {
        this.db
          .insert(cardImages)
          .values({
            id: newId("cardimg"),
            cardId,
            side: input.side,
            fileName: input.fileName,
            mimeType: input.mimeType,
            byteSize: input.byteSize,
            width: input.width ?? null,
            height: input.height ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .run()
      }

      this.db.update(cards).set({ updatedAt: timestamp }).where(eq(cards.id, cardId)).run()
      return ok(this.mapCard(this.db.select().from(cards).where(eq(cards.id, cardId)).get()!))
    } catch (error) {
      return fail(error)
    }
  }

  async removeCardImage(input: CardImageRefInput): Promise<Result<CardSummary>> {
    try {
      const cardId = toSqlId(input.cardId)
      const existing = this.db.select().from(cards).where(eq(cards.id, cardId)).get()
      if (!existing) return fail("卡片不存在")
      this.db
        .delete(cardImages)
        .where(and(eq(cardImages.cardId, cardId), eq(cardImages.side, input.side)))
        .run()
      this.db.update(cards).set({ updatedAt: nowIso() }).where(eq(cards.id, cardId)).run()
      return ok(this.mapCard(this.db.select().from(cards).where(eq(cards.id, cardId)).get()!))
    } catch (error) {
      return fail(error)
    }
  }
}
