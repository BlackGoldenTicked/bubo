/**
 * @purpose Verify pure voice entry rules: amount normalization, category matching, and date clamping.
 * @role    Unit regression tests for the draft the renderer shows before saving.
 * @deps    Vitest and the pure voice entry rules module.
 * @gotcha  A misheard amount must stay empty; these rules never invent money values.
 */

import { describe, expect, it } from "vitest"
import {
  buildVoiceCategoryOptions,
  matchCategoryByKeywords,
  normalizeVoiceAmount,
  normalizeVoiceEntryDraft,
  type VoiceEntryParseContext,
} from "../src/domain/voice/voice-entry-rules"

const NOW = new Date(2026, 10, 4, 12, 30, 0)

function context(overrides: Partial<VoiceEntryParseContext> = {}): VoiceEntryParseContext {
  return {
    transcript: "中午吃麻辣烫花了三十八块五",
    categories: [
      { id: "cat_food", name: "餐饮", kind: "expense" },
      { id: "cat_salary", name: "工资", kind: "income" },
    ],
    currency: "CNY",
    now: NOW,
    ...overrides,
  }
}

describe("normalizeVoiceAmount", () => {
  it("keeps two fraction digits and strips currency noise", () => {
    expect(normalizeVoiceAmount("¥1,238.5").amount).toBe("1238.50")
    expect(normalizeVoiceAmount(38).amount).toBe("38.00")
  })

  it("flags unparsable or missing amounts instead of guessing", () => {
    expect(normalizeVoiceAmount("三十八块五")).toEqual({ amount: "", unclear: true })
    expect(normalizeVoiceAmount(null)).toEqual({ amount: "", unclear: true })
    expect(normalizeVoiceAmount("12.345")).toEqual({ amount: "", unclear: true })
  })
})

describe("normalizeVoiceEntryDraft", () => {
  it("maps an expense draft onto an existing expense category", () => {
    const draft = normalizeVoiceEntryDraft(
      {
        flowKind: "expense",
        amount: "38.5",
        title: "午饭 麻辣烫",
        categoryId: "cat_food",
        categoryName: "餐饮",
        occurredAt: "2026-11-04T12:10:00",
        paymentMethod: "微信支付",
        confidence: 0.92,
        warnings: [],
      },
      context(),
    )

    expect(draft).toMatchObject({
      direction: "out",
      flowKind: "expense",
      amount: "38.50",
      currency: "CNY",
      title: "午饭 麻辣烫",
      categoryId: "cat_food",
      eventDate: "2026-11-04",
      paymentMethod: "微信支付",
      confidence: 0.92,
    })
    expect(draft.warnings).toHaveLength(0)
  })

  it("drops a category whose kind disagrees with the direction", () => {
    const draft = normalizeVoiceEntryDraft(
      { flowKind: "expense", amount: "38", categoryId: "cat_salary" },
      context(),
    )

    expect(draft.categoryId).toBeNull()
    expect(draft.warnings.join("")).toContain("方向不一致")
  })

  it("matches a category by name when the model returns no id", () => {
    const draft = normalizeVoiceEntryDraft(
      { flowKind: "income", amount: "12000", categoryName: "工资" },
      context(),
    )

    expect(draft.categoryId).toBe("cat_salary")
    expect(draft.direction).toBe("in")
  })

  it("clamps a future timestamp back to now", () => {
    const draft = normalizeVoiceEntryDraft(
      { flowKind: "expense", amount: "10", occurredAt: "2026-12-01T09:00:00" },
      context(),
    )

    expect(draft.eventDate).toBe("2026-11-04")
    expect(draft.warnings.join("")).toContain("晚于当前时间")
  })

  it("keeps an unclear amount empty and warns the user", () => {
    const draft = normalizeVoiceEntryDraft({ flowKind: "expense", amount: "" }, context())

    expect(draft.amount).toBe("")
    expect(draft.warnings.join("")).toContain("没有听清金额")
  })

  it("rejects a non-object payload", () => {
    expect(() => normalizeVoiceEntryDraft("not json", context())).toThrow(/JSON/)
  })
})

describe("buildVoiceCategoryOptions", () => {
  it("skips archived categories", () => {
    const options = buildVoiceCategoryOptions([
      { id: "a", name: "餐饮", kind: "expense" },
      { id: "b", name: "旧分类", kind: "expense", archived: true },
    ])

    expect(options.map((option) => option.id)).toEqual(["a"])
  })

  it("fills a built-in example list for a known category name", () => {
    const options = buildVoiceCategoryOptions([
      { id: "snack", name: "零食", kind: "expense" },
      { id: "car", name: "车相关", kind: "expense" },
      { id: "custom", name: "乱七八糟", kind: "expense" },
    ])

    expect(options[0].examples).toContain("咖啡")
    expect(options[1].examples).toContain("停车费")
    expect(options[2].examples).toBeNull()
  })

  it("prefers the user-entered description over the built-in list", () => {
    const [option] = buildVoiceCategoryOptions([
      { id: "snack", name: "零食", kind: "expense", description: "只算饼干和糖果" },
    ])

    expect(option.examples).toBe("只算饼干和糖果")
  })
})

describe("matchCategoryByKeywords", () => {
  it("matches a custom category through its own example list", () => {
    const categories = buildVoiceCategoryOptions([
      { id: "kid", name: "小金马", kind: "expense" },
      { id: "food", name: "三餐", kind: "expense" },
    ])

    const hit = matchCategoryByKeywords("给孩子打疫苗 260", categories, "expense")
    expect(hit?.id).toBe("kid")
  })
})
