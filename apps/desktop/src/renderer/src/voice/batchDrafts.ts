/**
 * @purpose Turn a parsed voice batch into editable review drafts and back into create inputs.
 * @role    Pure rules behind the tiled batch review window.
 * @deps    Shared voice contracts and the cashflow create contract.
 * @gotcha  Only cashflow records are saved straight from the window; every other domain keeps its
 *          own page form, so those drafts start excluded from "save all". Nothing here guesses an
 *          amount: a draft without a positive value is simply not savable.
 */

import type { CreateCashflowEventInput } from "@bubo/api"
import type { VoiceIntent } from "@bubo/shared/contracts"

export interface BatchDraft {
  /** Stable local key: the queue holds object identity, this holds the card identity. */
  key: string
  intent: VoiceIntent
  /** Whether "save all" should persist this card (cashflow only). */
  include: boolean
  amount: string
  title: string
  categoryId: string | null
  date: string
  source: string
  note: string
}

export function buildBatchDrafts(intents: readonly VoiceIntent[]): BatchDraft[] {
  return intents.map((intent, index) => {
    const cashflow = intent.domain === "cashflow" ? intent : null
    return {
      key: `draft-${index}`,
      intent,
      include: cashflow != null,
      amount: cashflow?.amount ?? "",
      title: cashflow?.title ?? "",
      categoryId: cashflow?.categoryId ?? null,
      date: cashflow?.eventDate ?? "",
      source: cashflow?.paymentMethod ?? "",
      note: cashflow?.note ?? "",
    }
  })
}

export function isCashflowDraft(draft: BatchDraft): boolean {
  return draft.intent.domain === "cashflow"
}

function amountValue(draft: BatchDraft): number {
  const parsed = Number(draft.amount)
  return Number.isFinite(parsed) ? parsed : 0
}

/** A card may be saved only when it is a cashflow record with an amount and a title. */
export function isDraftSavable(draft: BatchDraft): boolean {
  if (!isCashflowDraft(draft) || !draft.include) return false
  return amountValue(draft) > 0 && draft.title.trim().length > 0
}

export function countSavableDrafts(drafts: readonly BatchDraft[]): number {
  return drafts.filter(isDraftSavable).length
}

/** Map one cashflow draft onto the same mutation input the 记一笔 form submits. */
export function toCashflowCreateInput(draft: BatchDraft): CreateCashflowEventInput | null {
  if (!isDraftSavable(draft)) return null
  const flowKind = draft.intent.domain === "cashflow" ? draft.intent.flowKind : "expense"
  const title = draft.title.trim()
  return {
    eventDate: draft.date,
    title,
    counterparty: title,
    amount: amountValue(draft).toFixed(2),
    direction: flowKind === "income" ? "in" : "out",
    flowKind,
    categoryId: draft.categoryId,
    sourceKind: "manual",
    sourceName: draft.source.trim() || null,
    userNote: draft.note.trim() || null,
    includeInAnalytics: true,
    classificationSource: "manual",
  }
}
