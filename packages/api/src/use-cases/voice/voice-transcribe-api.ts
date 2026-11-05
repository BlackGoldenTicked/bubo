/**
 * @purpose Transcribe one recorded clip through the ASR pool, reporting the winning model and latency.
 * @role    Use-case layer split out of the full pipeline so the UI can show staged progress.
 * @deps    Bailian ASR client and the pure pool ordering rules.
 * @gotcha  Attempts walk the imported recognition pool (purpose=asr) then the configured default;
 *          every failure logs to stderr and moves on. The caller owns the audio payload.
 */

import type { Result } from "@bubo/shared"
import type { TranscribeVoiceResult, VoiceLlmPoolEntry } from "@bubo/shared/contracts"
import type { VoiceAsrConfig } from "../../infrastructure/ai/bailian-asr-client"
import { transcribeWithBailian } from "../../infrastructure/ai/bailian-asr-client"
import { buildAsrAttemptChain } from "../../domain/voice/llm-pool-rules"
import { fail, ok } from "../../shared/api-helpers"

export interface TranscribeVoiceEntryOptions {
  audioBase64: string
  mimeType: string
  language?: string | null
  asr: VoiceAsrConfig
  /** Imported free-tier models; only purpose=asr entries participate here. */
  llmPool?: readonly VoiceLlmPoolEntry[]
  now?: Date
}

export async function transcribeVoiceEntry(
  options: TranscribeVoiceEntryOptions,
): Promise<Result<TranscribeVoiceResult>> {
  try {
    const startedAt = performance.now()
    const chain = buildAsrAttemptChain(
      options.llmPool ?? [],
      { apiKey: options.asr.apiKey, baseUrl: options.asr.baseUrl },
      options.asr,
      options.now ?? new Date(),
    )

    let lastError: unknown = null
    for (const attempt of chain) {
      try {
        const result = await transcribeWithBailian(attempt, {
          audioBase64: options.audioBase64,
          mimeType: options.mimeType,
          language: options.language ?? null,
        })
        return ok({
          transcript: result.transcript,
          model: result.model,
          durationMs: Math.round(performance.now() - startedAt),
        })
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          `[voice] asr attempt failed (${attempt.provider}/${attempt.model}): ${message}`,
        )
      }
    }

    return fail(
      lastError instanceof Error
        ? lastError
        : new Error("所有语音识别模型（含默认 qwen3-asr-flash）都调用失败"),
    )
  } catch (error) {
    return fail(error)
  }
}
