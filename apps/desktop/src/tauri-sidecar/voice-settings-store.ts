/**
 * @purpose Persist the local Bailian and DeepSeek credentials used by voice entry.
 * @role    Sidecar-owned secret store under the app-data directory.
 * @deps    Node filesystem and shared voice settings contracts.
 * @gotcha  Keys stay on this machine: the file is written 0600 and only a masked hint is
 *          returned to the renderer. A blank apiKey patch means "keep the stored key".
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import type {
  SaveVoiceSettingsInput,
  VoiceLlmPoolEntry,
  VoiceLlmPoolEntryView,
  VoiceProviderPatch,
  VoiceSettingsSnapshot,
} from "@bubo/shared/contracts"

export const VOICE_SETTINGS_FILE = "bubo-voice.json"

export const DEFAULT_ASR_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
export const DEFAULT_ASR_MODEL = "qwen3-asr-flash"
export const DEFAULT_LLM_BASE_URL = "https://api.deepseek.com"
export const DEFAULT_LLM_MODEL = "deepseek-chat"

export interface VoiceProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface StoredVoiceSettings {
  asr: VoiceProviderConfig
  llm: VoiceProviderConfig
  /** Bailian free-tier models imported from the user's sheet; order is storage order. */
  llmModels: VoiceLlmPoolEntry[]
}

const ENV_FALLBACK = {
  asr: "DASHSCOPE_API_KEY",
  llm: "DEEPSEEK_API_KEY",
} as const

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback
}

function maskKey(apiKey: string): string | null {
  if (apiKey.length === 0) return null
  return apiKey.length <= 4 ? "••••" : `••••${apiKey.slice(-4)}`
}

function providerSnapshot(config: VoiceProviderConfig) {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    configured: config.apiKey.length > 0,
    keyHint: maskKey(config.apiKey),
  }
}

export class VoiceSettingsStore {
  private readonly filePath: string

  constructor(userDataDir: string) {
    this.filePath = join(userDataDir, VOICE_SETTINGS_FILE)
  }

  private defaults(): StoredVoiceSettings {
    return {
      asr: {
        apiKey: process.env[ENV_FALLBACK.asr] ?? "",
        baseUrl: DEFAULT_ASR_BASE_URL,
        model: DEFAULT_ASR_MODEL,
      },
      llm: {
        apiKey: process.env[ENV_FALLBACK.llm] ?? "",
        baseUrl: DEFAULT_LLM_BASE_URL,
        model: DEFAULT_LLM_MODEL,
      },
      llmModels: [],
    }
  }

  read(): StoredVoiceSettings {
    const defaults = this.defaults()
    if (!existsSync(this.filePath)) return defaults
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, unknown>
      const asr = (raw.asr ?? {}) as Record<string, unknown>
      const llm = (raw.llm ?? {}) as Record<string, unknown>
      return {
        asr: {
          apiKey: readString(asr.apiKey, defaults.asr.apiKey),
          baseUrl: readString(asr.baseUrl, DEFAULT_ASR_BASE_URL).replace(/\/+$/, ""),
          model: readString(asr.model, DEFAULT_ASR_MODEL),
        },
        llm: {
          apiKey: readString(llm.apiKey, defaults.llm.apiKey),
          baseUrl: readString(llm.baseUrl, DEFAULT_LLM_BASE_URL).replace(/\/+$/, ""),
          model: readString(llm.model, DEFAULT_LLM_MODEL),
        },
        llmModels: readLlmModels(raw.llmModels),
      }
    } catch (error) {
      console.error("[bubo-sidecar] Failed to read voice settings, using defaults", error)
      return defaults
    }
  }

  snapshot(): VoiceSettingsSnapshot {
    const settings = this.read()
    return { asr: providerSnapshot(settings.asr), llm: providerSnapshot(settings.llm) }
  }

  /** Merge a patch and persist. Blank `apiKey` keeps the stored key so edits are not destructive. */
  save(input: SaveVoiceSettingsInput): VoiceSettingsSnapshot {
    const current = this.read()
    const merged: StoredVoiceSettings = {
      asr: applyPatch(current.asr, input.asr, DEFAULT_ASR_BASE_URL, DEFAULT_ASR_MODEL),
      llm: applyPatch(current.llm, input.llm, DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL),
      llmModels: current.llmModels,
    }
    persist(this.filePath, merged)
    return this.snapshot()
  }

  /** Merge imported entries by model name so re-importing updates quota and expiry in place. */
  upsertLlmModels(entries: readonly VoiceLlmPoolEntry[]): VoiceLlmPoolEntry[] {
    const current = this.read()
    const byModel = new Map(current.llmModels.map((entry) => [entry.model, entry]))
    for (const entry of entries) byModel.set(entry.model, entry)
    const merged = [...byModel.values()]
    persist(this.filePath, { ...current, llmModels: merged })
    return merged
  }

  removeLlmModel(model: string): VoiceLlmPoolEntry[] {
    const current = this.read()
    const merged = current.llmModels.filter((entry) => entry.model !== model)
    persist(this.filePath, { ...current, llmModels: merged })
    return merged
  }

  listLlmModels(now: Date = new Date()): VoiceLlmPoolEntryView[] {
    const today = localDayKey(now)
    return this.read().llmModels.map((entry) => ({ ...entry, active: entry.expiresAt >= today }))
  }
}

function localDayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function readLlmModels(value: unknown): VoiceLlmPoolEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (item): item is VoiceLlmPoolEntry =>
        item != null &&
        typeof item === "object" &&
        typeof (item as VoiceLlmPoolEntry).model === "string" &&
        typeof (item as VoiceLlmPoolEntry).quota === "number" &&
        typeof (item as VoiceLlmPoolEntry).expiresAt === "string",
    )
    .map((entry) => ({
      // Entries written before purpose existed were all reasoning models.
      ...entry,
      purpose: entry.purpose ?? "llm",
    }))
}

function persist(filePath: string, settings: StoredVoiceSettings): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
  chmodSync(filePath, 0o600)
}

function applyPatch(
  current: VoiceProviderConfig,
  patch: VoiceProviderPatch | undefined,
  defaultBaseUrl: string,
  defaultModel: string,
): VoiceProviderConfig {
  const apiKey = patch?.apiKey?.trim()
  return {
    apiKey: apiKey && apiKey.length > 0 ? apiKey : current.apiKey,
    baseUrl: readString(patch?.baseUrl, current.baseUrl || defaultBaseUrl).replace(/\/+$/, ""),
    model: readString(patch?.model, current.model || defaultModel),
  }
}
