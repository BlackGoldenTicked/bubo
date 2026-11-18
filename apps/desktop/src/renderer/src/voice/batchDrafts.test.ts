/**
 * @purpose Cover the tiled batch review rules: draft seeding, savability, and create-input mapping.
 * @role    Unit tests for the pure logic behind `VoiceBatchReview`.
 * @deps    Vitest, the batch draft rules, and the intent queue.
 * @gotcha  Only cashflow drafts may be saved from the window; a draft with no amount or title must
 *          stay unsavable instead of being written with a guessed value.
 */

import { afterEach, describe, expect, it } from "vitest"
import type { VoiceIntent } from "@bubo/shared/contracts"
import {
  buildBatchDrafts,
  countSavableDrafts,
  isDraftSavable,
  toCashflowCreateInput,
} from "./batchDrafts"
import {
  clearQueuedVoiceIntent,
  dropQueuedVoiceIntents,
  peekQueuedIntents,
  queueVoiceIntents,
} from "../lib/voice/intentHandoff"

function cashflow(overrides: Partial<VoiceIntent> = {}): VoiceIntent {
  return {
    domain: "cashflow",
    direction: "out",
    flowKind: "expense",
    amount: "38.50",
    currency: "CNY",
    title: "午饭 麻辣烫",
    note: null,
    categoryId: "cat-food",
    categoryName: "三餐",
    eventDate: "2026-11-04",
    occurredAt: "2026-11-04T12:10:00",
    paymentMethod: "微信支付",
    confidence: 0.9,
    warnings: [],
    ...overrides,
  } as VoiceIntent
}

function loan(): VoiceIntent {
  return {
    domain: "loan",
    name: "建行房贷",
    lender: "建设银行",
    principalAmount: "800000.00",
    paymentAmount: "5800.00",
    annualRatePercent: "4.25",
    termMonths: 360,
    startDate: "2026-11-01",
    paymentDay: 1,
    currency: "CNY",
    note: null,
    confidence: 0.9,
    warnings: [],
  } as VoiceIntent
}

afterEach(() => {
  clearQueuedVoiceIntent()
})

describe("buildBatchDrafts", () => {
  it("seeds editable cashflow drafts and excludes other domains", () => {
    const drafts = buildBatchDrafts([cashflow(), loan()])

    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toMatchObject({
      include: true,
      amount: "38.50",
      title: "午饭 麻辣烫",
      categoryId: "cat-food",
      date: "2026-11-04",
      source: "微信支付",
    })
    expect(drafts[1]).toMatchObject({ include: false, amount: "", title: "" })
    expect(drafts.map((draft) => draft.key)).toEqual(["draft-0", "draft-1"])
  })
})

describe("isDraftSavable", () => {
  it("requires a cashflow card with an amount and a title", () => {
    const [draft] = buildBatchDrafts([cashflow()])
    expect(draft && isDraftSavable(draft)).toBe(true)

    const noAmount = { ...draft!, amount: "0" }
    const noTitle = { ...draft!, title: "   " }
    const excluded = { ...draft!, include: false }
    expect(isDraftSavable(noAmount)).toBe(false)
    expect(isDraftSavable(noTitle)).toBe(false)
    expect(isDraftSavable(excluded)).toBe(false)
  })

  it("never treats a loan card as savable", () => {
    const drafts = buildBatchDrafts([loan()])
    expect(drafts.filter(isDraftSavable)).toEqual([])
    expect(countSavableDrafts(drafts)).toBe(0)
  })
})

describe("toCashflowCreateInput", () => {
  it("maps a draft onto the same input the 记一笔 form submits", () => {
    const [draft] = buildBatchDrafts([cashflow()])
    const input = toCashflowCreateInput(draft!)

    expect(input).toMatchObject({
      eventDate: "2026-11-04",
      title: "午饭 麻辣烫",
      counterparty: "午饭 麻辣烫",
      amount: "38.50",
      direction: "out",
      flowKind: "expense",
      categoryId: "cat-food",
      sourceKind: "manual",
      sourceName: "微信支付",
      includeInAnalytics: true,
    })
  })

  it("keeps income direction and normalizes the amount to two decimals", () => {
    const [draft] = buildBatchDrafts([
      cashflow({ flowKind: "income", direction: "in", amount: "1200", title: "报销" }),
    ])
    const input = toCashflowCreateInput(draft!)

    expect(input?.direction).toBe("in")
    expect(input?.flowKind).toBe("income")
    expect(input?.amount).toBe("1200.00")
    expect(input?.userNote).toBeNull()
    expect(input?.sourceName).toBe("微信支付")
  })

  it("returns null instead of inventing a missing amount", () => {
    const [draft] = buildBatchDrafts([cashflow({ amount: "" })])
    expect(toCashflowCreateInput(draft!)).toBeNull()
  })
})

describe("batch queue removal", () => {
  it("drops several saved intents with one notification", () => {
    const first = cashflow()
    const second = cashflow({ title: "停车费", amount: "20.00" })
    queueVoiceIntents([first, second, loan()])

    dropQueuedVoiceIntents([first, second])

    expect(peekQueuedIntents()).toHaveLength(1)
    expect(peekQueuedIntents()[0]?.domain).toBe("loan")
  })
})
