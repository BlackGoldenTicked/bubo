/**
 * @purpose Verify the model-list workbook mapper against the user's real sheet shapes.
 * @role    Unit regression tests for quota text, embedded dates, and non-LLM filtering.
 * @deps    Vitest and the LLM models import mapper.
 * @gotcha  These cells mirror the Bailian quota page export: "剩 995.6K / 共 1M",
 *          "2026/11/12剩余 7 天", and a 类型 column separating speech models from LLMs.
 */

import { describe, expect, it } from "vitest"
import { parseExpiryDateKey, parseLlmModelsSheet, parseQuotaValue } from "./llm-models-import"

const TODAY = new Date(2026, 10, 5)

describe("parseQuotaValue", () => {
  it("reads Bailian's '剩 X / 共 Y' text as the remaining quantity", () => {
    expect(parseQuotaValue("剩 1M / 共 1M")).toBe(1_000_000)
    expect(parseQuotaValue("剩 995.6K / 共 1M")).toBe(995_600)
    expect(parseQuotaValue("1,000,000")).toBe(1_000_000)
  })

  it("returns null for empty or meaningless cells", () => {
    expect(parseQuotaValue("")).toBeNull()
    expect(parseQuotaValue("已用完")).toBeNull()
  })
})

describe("parseExpiryDateKey", () => {
  it("prefers the embedded calendar date over the drifting day count", () => {
    expect(parseExpiryDateKey("2026/11/12剩余 7 天", TODAY)).toBe("2026-11-12")
  })

  it("supports bare dates, day counts, and Excel serials", () => {
    expect(parseExpiryDateKey("2026-12-31", TODAY)).toBe("2026-12-31")
    expect(parseExpiryDateKey("剩余15天", TODAY)).toBe("2026-11-20")
    expect(parseExpiryDateKey("46235", TODAY)).toBe("2026-08-01")
  })
})

describe("parseLlmModelsSheet", () => {
  const USER_SHAPE = [
    ["模型 code", "类型", "额度", "到期"],
    ["qwen3.8-2.4t-a95b", "大语言模型", "剩 1M / 共 1M", "2026/11/12剩余 7 天"],
    ["qwen-audio-3.1-tts-plus", "语音模型", "剩 10K / 共 10K", "2026/12/16剩余 41 天"],
    ["qwen-image-2.1-pro", "视觉模型", "剩 10K / 共 10K", "2026/12/16剩余 41 天"],
    ["glm-5.3", "大语言模型", "剩 1M / 共 1M", "2026/11/23剩余 18 天"],
    ["deepseek-v4.1-flash", "大语言模型", "剩 995.6K / 共 1M", "2026/12/13剩余 38 天"],
    ["", "大语言模型", "剩 1M / 共 1M", "2026/12/13剩余 38 天"],
  ]

  it("imports every parseable row with an inferred purpose", () => {
    const result = parseLlmModelsSheet(USER_SHAPE, TODAY)

    expect(result.entries.map((entry) => `${entry.model}:${entry.purpose}`)).toEqual([
      "qwen3.8-2.4t-a95b:llm",
      "qwen-audio-3.1-tts-plus:tts",
      "qwen-image-2.1-pro:vision",
      "glm-5.3:llm",
      "deepseek-v4.1-flash:llm",
    ])
    expect(result.entries[4]).toMatchObject({ quota: 995_600, expiresAt: "2026-12-13" })
    expect(result.skipped).toBe(1)
  })

  it("routes asr-named speech models into the recognition pool without a 类型 column", () => {
    const result = parseLlmModelsSheet(
      [
        ["模型", "额度", "剩余时间"],
        ["qwen-audio-3.1-asr-flash", "1M", "剩余30天"],
        ["glm-5.3", "剩 1M / 共 1M", "剩余30天"],
      ],
      TODAY,
    )

    expect(result.entries.map((entry) => `${entry.model}:${entry.purpose}`)).toEqual([
      "qwen-audio-3.1-asr-flash:asr",
      "glm-5.3:llm",
    ])
  })

  it("fails loudly when no recognizable header row exists", () => {
    expect(() => parseLlmModelsSheet([["名称", "数量", "日期"]], TODAY)).toThrow(/表头/)
  })
})
