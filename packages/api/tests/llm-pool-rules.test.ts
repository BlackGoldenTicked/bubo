/**
 * @purpose Verify pure LLM pool rules: expiry filtering, purpose split, ordering, and attempt chains.
 * @role    Unit regression tests for the Bailian free-tier rotation before the DeepSeek/ASR fallbacks.
 * @deps    Vitest and the pure LLM pool rules module.
 * @gotcha  Expiring-soon models must be tried first; expired ones never enter the chain.
 */

import { describe, expect, it } from "vitest"
import {
  buildAsrAttemptChain,
  buildLlmAttemptChain,
  excelSerialToDateKey,
  selectLlmModelOrder,
} from "../src/domain/voice/llm-pool-rules"

const NOW = new Date(2026, 10, 5, 12, 0, 0)

function entry(model: string, quota: number, expiresAt: string, purpose: "llm" | "asr" = "llm") {
  return { model, quota, expiresAt, purpose }
}

describe("selectLlmModelOrder", () => {
  it("drops expired entries and orders by soonest expiry then largest quota", () => {
    const ordered = selectLlmModelOrder(
      [
        entry("a-plus", 100, "2026-12-31"),
        entry("b-flash", 50, "2026-11-06"),
        entry("c-max", 80, "2026-11-06"),
        entry("d-dead", 999, "2026-11-04"),
      ],
      NOW,
    )

    expect(ordered.map((item) => item.model)).toEqual(["c-max", "b-flash", "a-plus"])
  })

  it("keeps entries that expire today", () => {
    const ordered = selectLlmModelOrder([entry("today-only", 10, "2026-11-05")], NOW)
    expect(ordered.map((item) => item.model)).toEqual(["today-only"])
  })

  it("splits pools by purpose: the ASR stage never sees reasoning models", () => {
    const ordered = selectLlmModelOrder(
      [entry("qwen-asr-flash", 10, "2026-11-06", "asr"), entry("glm-5.3", 10, "2026-11-05", "llm")],
      NOW,
      "asr",
    )

    expect(ordered.map((item) => item.model)).toEqual(["qwen-asr-flash"])
  })
})

describe("buildLlmAttemptChain", () => {
  it("puts ordered pool models first and the DeepSeek fallback last", () => {
    const chain = buildLlmAttemptChain(
      [entry("qwen-a", 10, "2026-11-06"), entry("qwen-b", 20, "2027-01-01")],
      { apiKey: "sk-bailian", baseUrl: "https://bailian.example/v1" },
      { apiKey: "sk-ds", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
      NOW,
    )

    expect(chain.map((item) => `${item.provider}/${item.model}`)).toEqual([
      "bailian-pool/qwen-a",
      "bailian-pool/qwen-b",
      "deepseek-fallback/deepseek-chat",
    ])
    expect(chain[0]).toMatchObject({ apiKey: "sk-bailian" })
    expect(chain[2]).toMatchObject({ apiKey: "sk-ds", baseUrl: "https://api.deepseek.com" })
  })

  it("still contains the fallback when the whole pool is expired", () => {
    const chain = buildLlmAttemptChain(
      [entry("dead", 10, "2026-01-01")],
      { apiKey: "sk-bailian", baseUrl: "https://bailian.example/v1" },
      { apiKey: "sk-ds", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
      NOW,
    )

    expect(chain).toHaveLength(1)
    expect(chain[0].provider).toBe("deepseek-fallback")
  })
})

describe("buildAsrAttemptChain", () => {
  it("walks asr-purpose pool models before the configured default ASR model", () => {
    const chain = buildAsrAttemptChain(
      [
        entry("qwen-audio-3.1-asr-flash", 10, "2026-11-06", "asr"),
        entry("qwen-audio-3.1-asr-flash-streaming", 20, "2026-11-12", "asr"),
        entry("glm-5.3", 99, "2026-11-06", "llm"),
        entry("dead-asr", 10, "2026-01-01", "asr"),
      ],
      { apiKey: "sk-bailian", baseUrl: "https://bailian.example/v1" },
      { apiKey: "sk-bailian", baseUrl: "https://bailian.example/v1", model: "qwen3-asr-flash" },
      NOW,
    )

    expect(chain.map((item) => `${item.provider}/${item.model}`)).toEqual([
      "bailian-asr-pool/qwen-audio-3.1-asr-flash",
      "bailian-asr-pool/qwen-audio-3.1-asr-flash-streaming",
      "bailian-asr-default/qwen3-asr-flash",
    ])
  })
})

describe("excelSerialToDateKey", () => {
  it("maps the 1900-system serial to a calendar day", () => {
    expect(excelSerialToDateKey(46235)).toBe("2026-08-01")
    expect(excelSerialToDateKey(46016)).toBe("2025-12-25")
  })
})
