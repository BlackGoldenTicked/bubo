/**
 * @purpose Define browser-safe payment-card contracts shared by renderer and API.
 * @role    DTO and input boundary for the card wallet (debit, credit, prepaid, virtual).
 * @deps    Shared bubo contract primitives only.
 * @gotcha  A card is an identity object, not a balance: it never changes net worth by itself.
 *          Only the last four digits may cross this boundary — never a full card number or CVV.
 *          Scans are referenced by side; the file bytes never travel through these types.
 */

import type { BuboId } from "../common/bubo-primitives.contract"

export type CardType = "debit" | "credit" | "prepaid" | "virtual" | "other"

export type CardBrand = "unionpay" | "visa" | "mastercard" | "amex" | "jcb" | "other"

export type CardSide = "front" | "back"

export type CardStatus = "active" | "archived"

/** Scan metadata for one face; the image itself lives in the sidecar's card-images folder. */
export interface CardImageSummary {
  side: CardSide
  fileName: string
  mimeType: string
  byteSize: number
  width: number | null
  height: number | null
  updatedAt: string
}

export interface CardSummary {
  id: BuboId
  name: string
  bank: string
  cardType: CardType
  brand: CardBrand
  numberLast4: string | null
  holderName: string | null
  currency: string
  creditLimit: string | null
  billingDay: number | null
  repaymentDay: number | null
  expiryMonth: number | null
  expiryYear: number | null
  colorHex: string | null
  note: string | null
  status: CardStatus
  displayOrder: number
  images: {
    front: CardImageSummary | null
    back: CardImageSummary | null
  }
  createdAt: string
  updatedAt: string
}

export interface ListCardsInput {
  status?: CardStatus
  includeArchived?: boolean
  bank?: string
}

export interface CreateCardInput {
  name: string
  bank: string
  cardType?: CardType
  brand?: CardBrand
  numberLast4?: string | null
  holderName?: string | null
  currency?: string
  creditLimit?: string | null
  billingDay?: number | null
  repaymentDay?: number | null
  expiryMonth?: number | null
  expiryYear?: number | null
  colorHex?: string | null
  note?: string | null
  displayOrder?: number
}

export interface UpdateCardInput extends Partial<CreateCardInput> {
  id: BuboId
}

export interface ArchiveCardInput {
  id: BuboId
  archived?: boolean
}

/** Metadata written after the sidecar has copied the scan into its own folder. */
export interface SaveCardImageInput {
  cardId: BuboId
  side: CardSide
  fileName: string
  mimeType: string
  byteSize: number
  width?: number | null
  height?: number | null
}

export interface CardImageRefInput {
  cardId: BuboId
  side: CardSide
}

/** Base64 payload for display; keep it out of cached summaries. */
export interface CardImageData {
  side: CardSide
  mimeType: string
  dataUrl: string
}
