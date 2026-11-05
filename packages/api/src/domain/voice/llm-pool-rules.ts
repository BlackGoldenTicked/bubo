/**
 * @purpose Hold pure rules for ordering the Bailian free-tier model pools (reasoning and ASR).
 * @role    Domain layer deciding which model attempts run before the configured fallbacks.
 * @deps    Shared voice contracts only.
 * @gotcha  Expiring-soon models are tried first so free quota never dies unused; ties break
 *          toward the larger remaining quota. Expired or foreign-purpose entries never attempt.
 */

import type { VoiceLlmConfig } from "../../infrastructure/ai/llm-entry-client"
import type { VoiceLlmPoolEntry, VoicePoolPurpose } from "@bubo/shared/contracts"

export function localDateKeyOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Convert an Excel date serial (1900 system) into a yyyy-MM-dd key. */
export function excelSerialToDateKey(serial: number): string {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Drop foreign-purpose and expired entries; order the rest: soonest expiry, larger quota. */
export function selectLlmModelOrder(
  models: readonly VoiceLlmPoolEntry[],
  now: Date = new Date(),
  purpose: VoicePoolPurpose = "llm",
): VoiceLlmPoolEntry[] {
  const today = localDateKeyOf(now)
  return models
    .filter((entry) => entry.purpose === purpose && entry.expiresAt >= today)
    .slice()
    .sort(
      (a, b) =>
        a.expiresAt.localeCompare(b.expiresAt) ||
        b.quota - a.quota ||
        a.model.localeCompare(b.model),
    )
}

export interface PoolAttempt extends VoiceLlmConfig {
  provider: string
}

/** The full reasoning chain: ordered LLM pool models, then the DeepSeek fallback last. */
export function buildLlmAttemptChain(
  pool: readonly VoiceLlmPoolEntry[],
  bailian: { apiKey: string; baseUrl: string },
  fallback: { apiKey: string; baseUrl: string; model: string },
  now: Date = new Date(),
): Array<VoiceLlmConfig & { provider: "bailian-pool" | "deepseek-fallback" }> {
  const chain: Array<VoiceLlmConfig & { provider: "bailian-pool" | "deepseek-fallback" }> =
    selectLlmModelOrder(pool, now, "llm").map((entry) => ({
      provider: "bailian-pool",
      apiKey: bailian.apiKey,
      baseUrl: bailian.baseUrl,
      model: entry.model,
      // Qwen reasoning models otherwise spend seconds on hidden thinking before the JSON answer.
      extraBody: { enable_thinking: false },
    }))
  chain.push({
    provider: "deepseek-fallback",
    apiKey: fallback.apiKey,
    baseUrl: fallback.baseUrl,
    model: fallback.model,
  })
  return chain
}

/** The recognition chain: ordered ASR pool models, then the configured default ASR model. */
export function buildAsrAttemptChain(
  pool: readonly VoiceLlmPoolEntry[],
  bailian: { apiKey: string; baseUrl: string },
  fallback: { apiKey: string; baseUrl: string; model: string },
  now: Date = new Date(),
): Array<VoiceLlmConfig & { provider: "bailian-asr-pool" | "bailian-asr-default" }> {
  const chain: Array<VoiceLlmConfig & { provider: "bailian-asr-pool" | "bailian-asr-default" }> =
    selectLlmModelOrder(pool, now, "asr").map((entry) => ({
      provider: "bailian-asr-pool",
      apiKey: bailian.apiKey,
      baseUrl: bailian.baseUrl,
      model: entry.model,
    }))
  chain.push({
    provider: "bailian-asr-default",
    apiKey: fallback.apiKey,
    baseUrl: fallback.baseUrl,
    model: fallback.model,
  })
  return chain
}
