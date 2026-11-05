/**
 * @purpose Orchestrate one system-wide voice intent: transcript → pooled reasoning → typed intent.
 * @role    Use-case layer behind `voice.parseIntent` for every prefilled page.
 * @deps    The pooled ASR path, the OpenAI-compatible JSON client, and the intent rules.
 * @gotcha  The ASR and LLM stages each walk their free-tier pool and log every failed attempt
 *          before moving on. The result is only a proposal for a form; persistence stays with the
 *          page's own mutation, so a misheard utterance can never write to the ledger.
 */

import type { Result } from "@bubo/shared"
import type { VoiceIntentParseResult, VoiceLlmPoolEntry } from "@bubo/shared/contracts"
import type { VoiceAsrConfig } from "../../infrastructure/ai/bailian-asr-client"
import { parseEntryJson, type VoiceLlmConfig } from "../../infrastructure/ai/llm-entry-client"
import {
  buildVoiceCategoryOptions,
  type VoiceCategoryOption,
} from "../../domain/voice/voice-entry-rules"
import {
  buildVoiceIntentMessages,
  normalizeVoiceIntent,
  type VoiceAssetOption,
  type VoiceIntentContext,
  type VoiceLoanOption,
  type VoicePositionOption,
  type VoiceSubscriptionOption,
} from "../../domain/voice/voice-intent-rules"
import { buildLlmAttemptChain } from "../../domain/voice/llm-pool-rules"
import { transcribeVoiceEntry } from "./voice-transcribe-api"
import { DEFAULT_CURRENCY, fail, ok } from "../../shared/api-helpers"

export interface ParseVoiceIntentOptions {
  /** Required unless `transcript` already carries system-speech text. */
  audioBase64?: string
  mimeType?: string
  /**
   * Pre-recognized text (e.g. from macOS system speech). When present the ASR call
   * is skipped and `models.asr` reports "macos-speech" instead of a cloud model.
   */
  transcript?: string | null
  language?: string | null
  currency?: string | null
  /** Ledger vocabulary the model may reference; ids are re-validated during normalization. */
  categories: readonly VoiceCategoryOption[]
  assets?: readonly VoiceAssetOption[]
  loans?: readonly VoiceLoanOption[]
  subscriptions?: readonly VoiceSubscriptionOption[]
  positions?: readonly VoicePositionOption[]
  now?: Date
  asr: VoiceAsrConfig
  /** Imported free-tier pools; the ASR stage consumes purpose=asr, reasoning consumes llm. */
  llmPool?: readonly VoiceLlmPoolEntry[]
  llm: VoiceLlmConfig
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt)
}

export async function parseVoiceIntent(
  options: ParseVoiceIntentOptions,
): Promise<Result<VoiceIntentParseResult>> {
  try {
    const currency = (options.currency ?? DEFAULT_CURRENCY).toUpperCase()
    const now = options.now ?? new Date()

    const providedTranscript = options.transcript?.trim() ?? ""
    let transcript: string
    let asrMs = 0
    let asrModel = "macos-speech"

    if (providedTranscript.length > 0) {
      transcript = providedTranscript
    } else {
      const transcribed = await transcribeVoiceEntry({
        audioBase64: options.audioBase64 ?? "",
        mimeType: options.mimeType ?? "audio/wav",
        language: options.language ?? null,
        asr: options.asr,
        llmPool: options.llmPool,
        now,
      })
      if (!transcribed.success) return fail(transcribed.error)
      asrMs = transcribed.data.durationMs
      transcript = transcribed.data.transcript
      asrModel = transcribed.data.model
    }

    const context: VoiceIntentContext = {
      transcript,
      currency,
      now,
      categories: buildVoiceCategoryOptions(options.categories),
      assets: [...(options.assets ?? [])],
      loans: [...(options.loans ?? [])],
      subscriptions: [...(options.subscriptions ?? [])],
      positions: [...(options.positions ?? [])],
    }
    const messages = buildVoiceIntentMessages(context)

    const llmStartedAt = performance.now()
    const chain = buildLlmAttemptChain(
      options.llmPool ?? [],
      { apiKey: options.asr.apiKey, baseUrl: options.asr.baseUrl },
      options.llm,
      now,
    )

    let llmResult: Awaited<ReturnType<typeof parseEntryJson>> | null = null
    let lastError: unknown = null
    for (const attempt of chain) {
      try {
        llmResult = await parseEntryJson(attempt, messages)
        break
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          `[voice] intent attempt failed (${attempt.provider}/${attempt.model}): ${message}`,
        )
      }
    }
    if (!llmResult) {
      throw lastError instanceof Error
        ? lastError
        : new Error("所有大模型（含 DeepSeek 兜底）都调用失败")
    }
    const llmMs = elapsedMs(llmStartedAt)

    if (llmResult.usage) {
      console.error(
        `[voice] intent model=${llmResult.model} prompt=${llmResult.usage.promptTokens} ` +
          `cached=${llmResult.usage.cachedTokens}`,
      )
    }

    const intent = normalizeVoiceIntent(llmResult.payload, context)

    return ok({
      transcript,
      intent,
      models: { asr: asrModel, llm: llmResult.model },
      timings: { asrMs, llmMs },
      usage: llmResult.usage,
    })
  } catch (error) {
    return fail(error)
  }
}
