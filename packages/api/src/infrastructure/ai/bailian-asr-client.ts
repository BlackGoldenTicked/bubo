/**
 * @purpose Call Alibaba Cloud Bailian (DashScope) speech recognition over its compatible-mode API.
 * @role    Infrastructure adapter for the ASR half of the voice entry pipeline.
 * @deps    The official OpenAI Node SDK pointed at DashScope's compatible-mode base URL.
 * @gotcha  DashScope ships no Node SDK; the OpenAI-compatible endpoint is the documented Node path.
 *          Audio is sent inline as a base64 data URI, so no OSS upload or public URL is required.
 */

import OpenAI from "openai"

export interface VoiceAsrConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface VoiceAsrRequest {
  audioBase64: string
  mimeType: string
  language?: string | null
}

export interface VoiceAsrResult {
  transcript: string
  model: string
}

/** DashScope's chat-completions audio part, which is wider than the OpenAI `input_audio` spec. */
function audioContentPart(request: VoiceAsrRequest) {
  return {
    role: "user",
    content: [
      {
        type: "input_audio",
        input_audio: { data: `data:${request.mimeType};base64,${request.audioBase64}` },
      },
    ],
  }
}

function extractTranscript(content: unknown): string {
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text
          return typeof text === "string" ? text : ""
        }
        return ""
      })
      .join("")
      .trim()
  }
  return ""
}

export async function transcribeWithBailian(
  config: VoiceAsrConfig,
  request: VoiceAsrRequest,
): Promise<VoiceAsrResult> {
  if (!config.apiKey) throw new Error("未配置百炼 API Key，无法进行语音识别")
  if (!request.audioBase64) throw new Error("录音内容为空，请重新录音")

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    // Short clips normally transcribe in a few seconds; a stalled pool model must not
    // hold the whole attempt chain for a full minute before the next one runs.
    timeout: 25_000,
    maxRetries: 0,
  })

  // DashScope reads `asr_options` as a sibling of `messages`, which the OpenAI request schema
  // rejects, so the body is cast once. The response is read structurally for the same reason.
  const body = {
    model: config.model,
    messages: [audioContentPart(request)],
    asr_options: {
      enable_itn: true,
      ...(request.language ? { language: request.language } : {}),
    },
    stream: false,
  }
  type CompletionsParams = Parameters<typeof client.chat.completions.create>[0]
  type CompletionsResponse = { choices?: Array<{ message?: { content?: unknown } }> }

  const completion = (await client.chat.completions.create(
    body as unknown as CompletionsParams,
  )) as unknown as CompletionsResponse

  const transcript = extractTranscript(completion.choices?.[0]?.message?.content)
  if (!transcript) throw new Error("语音识别没有返回文字，请靠近麦克风重新说一次")
  return { transcript, model: config.model }
}
