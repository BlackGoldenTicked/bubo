/**
 * @purpose Turn a transcript into a structured cashflow draft with any OpenAI-compatible chat model.
 * @role    Infrastructure adapter used for both the Bailian pool models and the DeepSeek fallback.
 * @deps    The official OpenAI Node SDK configured with a per-provider base URL.
 * @gotcha  DeepSeek requires the word "json" in the prompt when `response_format` is json_object;
 *          keep the prompt in voice-entry-rules so the rule and the request shape stay together.
 *          Bailian pool models that reject json_object fail here and the caller moves to the next.
 */

import OpenAI from "openai"

export interface VoiceLlmConfig {
  apiKey: string
  baseUrl: string
  model: string
  /**
   * Extra top-level body fields forwarded verbatim (e.g. Bailian's
   * `enable_thinking: false`, which keeps reasoning models from spending
   * seconds on hidden thinking before the JSON answer).
   */
  extraBody?: Record<string, unknown>
}

export interface VoiceLlmRequest {
  system: string
  user: string
}

export interface VoiceLlmResult {
  payload: unknown
  model: string
  /** The model's answer exactly as it arrived, kept for the voice trace log. */
  raw: string
  /** Prompt-cache accounting when the provider reports it. */
  usage?: {
    promptTokens: number
    cachedTokens: number
  }
}

/**
 * Read cached-token accounting from either shape providers use:
 * DeepSeek's `prompt_cache_hit_tokens` or the OpenAI-style
 * `prompt_tokens_details.cached_tokens`.
 */
function readUsage(usage: unknown): VoiceLlmResult["usage"] {
  if (!usage || typeof usage !== "object") return undefined
  const record = usage as Record<string, unknown>
  const details = (record.prompt_tokens_details ?? {}) as Record<string, unknown>
  const promptTokens = Number(record.prompt_tokens)
  const cachedRaw = record.prompt_cache_hit_tokens ?? details.cached_tokens
  const cachedTokens = Number(cachedRaw)
  if (!Number.isFinite(promptTokens) || !Number.isFinite(cachedTokens)) return undefined
  return { promptTokens, cachedTokens }
}

export async function parseEntryJson(
  config: VoiceLlmConfig,
  request: VoiceLlmRequest,
): Promise<VoiceLlmResult> {
  if (!config.apiKey) throw new Error("未配置该模型的 API Key")

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    // One short JSON answer; a stalled pool model must fail fast so the chain moves on.
    timeout: 30_000,
    maxRetries: 0,
  })

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    ...config.extraBody,
  } as never)

  const content = completion.choices?.[0]?.message?.content
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("模型没有返回记账结果")
  }

  try {
    return {
      payload: JSON.parse(content),
      model: config.model,
      raw: content,
      usage: readUsage((completion as { usage?: unknown }).usage),
    }
  } catch {
    throw new Error("模型返回的内容不是合法 JSON")
  }
}
