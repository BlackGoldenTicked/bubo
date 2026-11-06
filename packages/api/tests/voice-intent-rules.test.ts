/**
 * @purpose Cover the system-wide intent taxonomy: domain routing, field normalization, id safety.
 * @role    Unit tests for pure voice intent rules.
 * @deps    Vitest and the intent rules module.
 * @gotcha  These tests double as documentation of the five domains' prefill contracts.
 */

import { describe, expect, it } from "vitest"
import {
  MAX_VOICE_INTENTS,
  VOICE_INTENT_SYSTEM_PROMPT,
  buildVoiceIntentMessages,
  normalizeVoiceIntent,
  normalizeVoiceIntents,
  type VoiceIntentContext,
} from "../src/domain/voice/voice-intent-rules"

const NOW = new Date(2026, 10, 5, 10, 30, 0)

function context(overrides: Partial<VoiceIntentContext> = {}): VoiceIntentContext {
  return {
    transcript: "随便说点什么",
    currency: "CNY",
    now: NOW,
    categories: [
      { id: "cat-food", name: "三餐", kind: "expense" },
      { id: "cat-salary", name: "工资", kind: "income" },
    ],
    assets: [{ id: "asset-cmb", name: "招商银行", assetType: "bank", currency: "CNY" }],
    loans: [
      {
        id: "loan-house",
        name: "建行房贷",
        lender: "建设银行",
        paymentAmount: "5800.00",
        currency: "CNY",
      },
    ],
    subscriptions: [
      {
        id: "sub-netflix",
        name: "Netflix",
        amount: "60.00",
        currency: "CNY",
        billingCycle: "monthly",
      },
    ],
    positions: [
      { id: "pos-aapl", symbol: "AAPL", name: "苹果", instrumentKind: "stock", currency: "USD" },
    ],
    ...overrides,
  }
}

describe("normalizeVoiceIntent", () => {
  it("routes an expense utterance to a cashflow intent with the matched category", () => {
    const intent = normalizeVoiceIntent(
      {
        domain: "cashflow",
        flowKind: "expense",
        amount: "38.50",
        title: "午饭 麻辣烫",
        categoryId: "cat-food",
        occurredAt: "2026-11-05T12:10:00",
        confidence: 0.9,
        warnings: [],
      },
      context({ transcript: "中午吃麻辣烫花了三十八块五" }),
    )

    expect(intent.domain).toBe("cashflow")
    if (intent.domain !== "cashflow") return
    expect(intent.amount).toBe("38.50")
    expect(intent.categoryId).toBe("cat-food")
    expect(intent.flowKind).toBe("expense")
    expect(intent.eventDate).toBe("2026-11-05")
  })

  it("keeps a loan's principal, monthly payment, and rate as editable strings", () => {
    const intent = normalizeVoiceIntent(
      {
        domain: "loan",
        name: "建行房贷",
        lender: "建设银行",
        principalAmount: "1200000",
        paymentAmount: "5800",
        annualRatePercent: 4.25,
        termMonths: 360,
        startDate: "2026-12-01",
        confidence: 0.8,
        warnings: [],
      },
      context({ transcript: "新办了房贷，贷了一百二十万，月供五千八，三十年" }),
    )

    expect(intent.domain).toBe("loan")
    if (intent.domain !== "loan") return
    expect(intent.principalAmount).toBe("1200000.00")
    expect(intent.paymentAmount).toBe("5800.00")
    expect(intent.annualRatePercent).toBe("4.25")
    expect(intent.termMonths).toBe(360)
    expect(intent.startDate).toBe("2026-12-01")
    expect(intent.paymentDay).toBe(1)
  })

  it("normalizes a subscription cycle and rejects an unknown category", () => {
    const intent = normalizeVoiceIntent(
      {
        domain: "subscription",
        name: "Netflix",
        amount: "60",
        billingCycle: "yearly",
        nextChargeDate: "2026-12-01",
        categoryId: "ghost-category",
        confidence: 0.7,
        warnings: [],
      },
      context({ transcript: "续费 Netflix，一年六十" }),
    )

    expect(intent.domain).toBe("subscription")
    if (intent.domain !== "subscription") return
    expect(intent.billingCycle).toBe("yearly")
    expect(intent.amount).toBe("60.00")
    expect(intent.categoryId).toBeNull()
    expect(intent.warnings.join("")).toContain("分类")
  })

  it("links an asset balance to an existing account by name", () => {
    const intent = normalizeVoiceIntent(
      {
        domain: "asset",
        accountName: "招商银行",
        assetType: "bank",
        valueAmount: "80000",
        confidence: 0.85,
        warnings: [],
      },
      context({ transcript: "招行卡里现在有八万" }),
    )

    expect(intent.domain).toBe("asset")
    if (intent.domain !== "asset") return
    expect(intent.assetItemId).toBe("asset-cmb")
    expect(intent.valueAmount).toBe("80000.00")
    expect(intent.snapshotAt).toBe("2026-11-05")
  })

  it("falls back to a new account when the asset id is not in the ledger", () => {
    const intent = normalizeVoiceIntent(
      {
        domain: "asset",
        assetItemId: "ghost-asset",
        accountName: "比特币钱包",
        assetType: "crypto",
        valueAmount: "12000",
        confidence: 0.6,
        warnings: [],
      },
      context({ transcript: "比特币钱包现在值一万二" }),
    )

    expect(intent.domain).toBe("asset")
    if (intent.domain !== "asset") return
    expect(intent.assetItemId).toBeNull()
    expect(intent.assetType).toBe("crypto")
    expect(intent.warnings.join("")).toContain("新建账户")
  })

  it("turns a matched symbol into a trade instead of a new position", () => {
    const intent = normalizeVoiceIntent(
      {
        domain: "investment",
        action: "open",
        symbol: "AAPL",
        side: "sell",
        quantity: "10",
        price: "180",
        confidence: 0.9,
        warnings: [],
      },
      context({ transcript: "卖出十股苹果，每股一百八" }),
    )

    expect(intent.domain).toBe("investment")
    if (intent.domain !== "investment") return
    expect(intent.action).toBe("trade")
    expect(intent.positionId).toBe("pos-aapl")
    expect(intent.side).toBe("sell")
    expect(intent.quantity).toBe("10.00")
    expect(intent.price).toBe("180.00")
    expect(intent.currency).toBe("USD")
  })

  it("opens a new position when nothing matches", () => {
    const intent = normalizeVoiceIntent(
      {
        domain: "investment",
        symbol: "510300",
        instrumentKind: "etf",
        side: "buy",
        quantity: "200",
        price: "4.1",
        confidence: 0.8,
        warnings: [],
      },
      context({ transcript: "买两百份沪深300" }),
    )

    expect(intent.domain).toBe("investment")
    if (intent.domain !== "investment") return
    expect(intent.action).toBe("open")
    expect(intent.positionId).toBeNull()
    expect(intent.instrumentKind).toBe("etf")
  })

  it("reports unknown instead of guessing a domain", () => {
    const intent = normalizeVoiceIntent(
      { domain: "unknown", reason: "没有听清要记录的对象", confidence: 0.1, warnings: [] },
      context({ transcript: "那个东西你帮我弄一下" }),
    )

    expect(intent.domain).toBe("unknown")
    if (intent.domain !== "unknown") return
    expect(intent.reason).toContain("没有听清")
  })

  it("rejects non-object payloads", () => {
    expect(() => normalizeVoiceIntent("not json", context())).toThrow(/JSON 对象/)
  })
})

describe("normalizeVoiceIntents", () => {
  it("keeps every record of a multi-expense sentence, in order", () => {
    const intents = normalizeVoiceIntents(
      {
        intents: [
          { domain: "cashflow", flowKind: "expense", amount: "8", title: "早饭" },
          { domain: "cashflow", flowKind: "expense", amount: "26", title: "打车" },
          { domain: "cashflow", flowKind: "expense", amount: "38.5", title: "麻辣烫" },
        ],
      },
      context({ transcript: "早饭 8 块，打车 26，中午麻辣烫 38.5" }),
    )

    expect(intents).toHaveLength(3)
    expect(intents.map((intent) => (intent.domain === "cashflow" ? intent.amount : null))).toEqual([
      "8.00",
      "26.00",
      "38.50",
    ])
    expect(intents.map((intent) => (intent.domain === "cashflow" ? intent.title : ""))).toEqual([
      "早饭",
      "打车",
      "麻辣烫",
    ])
  })

  it("accepts a bare array and mixed domains", () => {
    const intents = normalizeVoiceIntents(
      [
        { domain: "cashflow", flowKind: "expense", amount: "38.5", title: "午饭" },
        { domain: "asset", accountName: "招商银行", valueAmount: "80000" },
        { domain: "loan", name: "房贷", paymentAmount: "5800", principalAmount: "1200000" },
      ],
      context({ transcript: "午饭 38.5；招行卡里八万；房贷月供五千八" }),
    )

    expect(intents.map((intent) => intent.domain)).toEqual(["cashflow", "asset", "loan"])
  })

  it("still accepts the legacy single-intent object", () => {
    const intents = normalizeVoiceIntents(
      { domain: "cashflow", flowKind: "expense", amount: "12", title: "咖啡" },
      context({ transcript: "咖啡 12" }),
    )

    expect(intents).toHaveLength(1)
    expect(intents[0]?.domain).toBe("cashflow")
  })

  it("drops malformed items without discarding the batch", () => {
    const intents = normalizeVoiceIntents(
      { intents: [null, "nope", { domain: "cashflow", amount: "9", title: "水" }] },
      context({ transcript: "水 9 块" }),
    )

    expect(intents).toHaveLength(1)
    expect(intents[0]?.domain).toBe("cashflow")
  })

  it("caps a pasted bill dump at the supported queue length", () => {
    const items = Array.from({ length: MAX_VOICE_INTENTS + 5 }, (_, index) => ({
      domain: "cashflow",
      flowKind: "expense",
      amount: String(index + 1),
      title: `第${index + 1}笔`,
    }))

    expect(normalizeVoiceIntents({ intents: items }, context())).toHaveLength(MAX_VOICE_INTENTS)
  })

  it("throws when the payload carries no intent list at all", () => {
    expect(() => normalizeVoiceIntents({ answer: "ok" }, context())).toThrow(/intents 数组/)
  })
})

describe("multi-date batches", () => {
  it("keeps each record's own date instead of collapsing the batch onto today", () => {
    const intents = normalizeVoiceIntents(
      {
        intents: [
          {
            domain: "cashflow",
            flowKind: "expense",
            amount: "8",
            title: "早饭",
            occurredAt: "2026-10-01T08:00:00",
          },
          {
            domain: "cashflow",
            flowKind: "expense",
            amount: "26",
            title: "打车",
            occurredAt: "2026-10-02T09:30:00",
          },
          {
            domain: "cashflow",
            flowKind: "expense",
            amount: "38.5",
            title: "麻辣烫",
            occurredAt: "2026-10-03T12:10:00",
          },
        ],
      },
      context({ transcript: "10月1日 早饭8；10月2日 打车26；10月3日 麻辣烫38.5" }),
    )

    expect(
      intents.map((intent) => (intent.domain === "cashflow" ? intent.eventDate : "x")),
    ).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"])
  })

  it("documents the date-inheritance and cross-domain rules in the frozen prompt", () => {
    expect(VOICE_INTENT_SYSTEM_PROMPT).toContain("多日期与跨类别")
    expect(VOICE_INTENT_SYSTEM_PROMPT).toContain("日期行继承")
    expect(VOICE_INTENT_SYSTEM_PROMPT).toContain("跨类别混排")
    expect(VOICE_INTENT_SYSTEM_PROMPT).toContain("每个元素只填")
  })
})

describe("buildVoiceIntentMessages", () => {
  it("keeps the system prompt byte-identical so the provider prefix cache keeps hitting", () => {
    const first = buildVoiceIntentMessages(context())
    const second = buildVoiceIntentMessages(
      context({
        transcript: "另一句话",
        now: new Date(2027, 0, 1),
        categories: [{ id: "cat-x", name: "零食", kind: "expense" }],
      }),
    )

    expect(first.system).toBe(VOICE_INTENT_SYSTEM_PROMPT)
    expect(second.system).toBe(first.system)
  })

  it("puts the ledger vocabulary and utterance in the user turn", () => {
    const { user } = buildVoiceIntentMessages(context({ transcript: "招行卡里现在有八万" }))
    const payload = JSON.parse(user) as Record<string, unknown>

    expect(payload["用户原话"]).toBe("招行卡里现在有八万")
    expect(payload["主货币"]).toBe("CNY")
    expect(JSON.stringify(payload["已有账户"])).toContain("招商银行")
    expect(JSON.stringify(payload["已有贷款"])).toContain("建行房贷")
  })
})
