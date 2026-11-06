/**
 * @purpose Define browser-safe contracts for system-wide voice entry.
 * @role    Shared DTO foundation between the renderer voice UI and the sidecar AI pipeline.
 * @deps    Asset and investment contracts for the shared vocabulary, plus local primitives.
 * @gotcha  Never include API keys here: the renderer only sees configured flags and key hints.
 *          An intent is always a proposal: the renderer prefills its own form and the user still
 *          saves through the page's existing mutation, so no voice result writes to the ledger.
 */

import type { AssetSnapshotType } from "../assets/asset.contract"
import type { InstrumentKind } from "../investments/investment.contract"

export type VoiceEntryFlowKind = "expense" | "income"

/** Business areas a single utterance can address; `unknown` means "ask the user to retry". */
export type VoiceIntentDomain =
  | "cashflow"
  | "loan"
  | "subscription"
  | "asset"
  | "investment"
  | "unknown"

/** Fields every intent carries so the renderer can explain what the model decided. */
export interface VoiceIntentBase {
  domain: VoiceIntentDomain
  /** 0..1 self-reported confidence; the UI only uses it as a hint. */
  confidence: number
  warnings: string[]
}

/**
 * Normalized, renderer-editable result of one voice entry.
 * `amount` is a positive decimal string with two fraction digits, or "" when the
 * transcript never made the amount explicit.
 */
export interface VoiceEntryDraft {
  direction: "in" | "out"
  flowKind: VoiceEntryFlowKind
  amount: string
  currency: string
  title: string
  note: string | null
  categoryId: string | null
  categoryName: string | null
  eventDate: string
  occurredAt: string | null
  paymentMethod: string | null
  confidence: number
  warnings: string[]
}

/** Cashflow intent reuses the entry draft and just tags its domain. */
export interface VoiceCashflowIntent extends VoiceEntryDraft, VoiceIntentBase {
  domain: "cashflow"
}

export interface VoiceLoanIntent extends VoiceIntentBase {
  domain: "loan"
  name: string
  lender: string | null
  principalAmount: string
  /** Monthly payment; required by the loan form. */
  paymentAmount: string
  /** Annual percentage rate such as "4.25"; the renderer converts to basis points. */
  annualRatePercent: string
  termMonths: number | null
  startDate: string
  paymentDay: number | null
  currency: string
  note: string | null
}

export type VoiceBillingCycle = "weekly" | "monthly" | "yearly" | "custom"

export interface VoiceSubscriptionIntent extends VoiceIntentBase {
  domain: "subscription"
  name: string
  merchant: string | null
  amount: string
  currency: string
  billingCycle: VoiceBillingCycle
  intervalCount: number
  nextChargeDate: string
  autoRenew: boolean
  categoryId: string | null
  categoryName: string | null
  note: string | null
}

/** A balance/value for one account: create the item when no id matches. */
export interface VoiceAssetIntent extends VoiceIntentBase {
  domain: "asset"
  assetItemId: string | null
  accountName: string
  assetType: AssetSnapshotType
  valueAmount: string
  currency: string
  snapshotAt: string
  quantity: string | null
  costBasisAmount: string | null
  note: string | null
}

export type VoiceInvestmentAction = "open" | "trade"

export interface VoiceInvestmentIntent extends VoiceIntentBase {
  domain: "investment"
  action: VoiceInvestmentAction
  /** Matched existing position for `trade`; null for `open`. */
  positionId: string | null
  symbol: string
  name: string | null
  instrumentKind: InstrumentKind
  side: "buy" | "sell"
  quantity: string
  price: string
  feeAmount: string | null
  currency: string
  executedAt: string
  note: string | null
}

export interface VoiceUnknownIntent extends VoiceIntentBase {
  domain: "unknown"
  reason: string
}

export type VoiceIntent =
  | VoiceCashflowIntent
  | VoiceLoanIntent
  | VoiceSubscriptionIntent
  | VoiceAssetIntent
  | VoiceInvestmentIntent
  | VoiceUnknownIntent

export interface VoiceIntentParseResult {
  transcript: string
  /**
   * Every record found in the utterance, in the order it was spoken or pasted.
   * One sentence may contain several expenses; each becomes its own intent so the
   * renderer can confirm them one by one instead of silently keeping the largest.
   */
  intents: VoiceIntent[]
  models: {
    asr: string
    llm: string
  }
  timings: {
    asrMs: number
    llmMs: number
  }
  /** Prompt-cache visibility: how much of the (static) system prompt was reused. */
  usage?: {
    promptTokens: number
    cachedTokens: number
  }
}

export interface VoiceProviderStatus {
  baseUrl: string
  model: string
  configured: boolean
  keyHint: string | null
}

/** Renderer-facing settings summary; key material never crosses the IPC boundary. */
export interface VoiceSettingsSnapshot {
  asr: VoiceProviderStatus
  llm: VoiceProviderStatus
}

export interface VoiceProviderPatch {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface SaveVoiceSettingsInput {
  asr?: VoiceProviderPatch
  llm?: VoiceProviderPatch
}

export interface ParseVoiceIntentInput {
  /**
   * Base64-encoded audio without the `data:` prefix. Required unless
   * `transcript` already carries system-speech text.
   */
  audioBase64?: string
  mimeType?: string
  /**
   * Pre-recognized text (e.g. from macOS system speech). When present, the
   * pipeline skips remote ASR entirely and only runs intent parsing.
   */
  transcript?: string | null
  /** Optional ASR language hint such as `zh`; omit to let the model detect it. */
  language?: string | null
  /** Ledger display currency used when the transcript omits a currency. */
  currency?: string | null
  /** ISO timestamp overriding "now" for deterministic tests and replays. */
  now?: string | null
}

export interface TranscribeVoiceInput {
  /** Base64-encoded audio without the `data:` prefix. */
  audioBase64: string
  mimeType: string
  language?: string | null
}

export interface TranscribeVoiceResult {
  transcript: string
  /** Model that actually produced the text, after pool rotation. */
  model: string
  durationMs: number
}

/** What a pool entry is consumed by; speech models are categorized by their model id. */
export type VoicePoolPurpose =
  | "llm"
  | "asr"
  | "tts"
  | "translate"
  | "vision"
  | "embedding"
  | "other"

/** One Bailian free-tier model kept in the local pool; imported from a workbook. */
export interface VoiceLlmPoolEntry {
  model: string
  /** Remaining free quota in whatever unit the imported sheet uses; sort hint only. */
  quota: number
  /** Calendar day (yyyy-MM-dd) until which the free tier still applies (inclusive). */
  expiresAt: string
  /** Consumption channel: cashflow reasoning, speech recognition, synthesis, or live translation. */
  purpose: VoicePoolPurpose
  addedAt?: string
}

/** Pool entry plus the computed usability for "now". */
export interface VoiceLlmPoolEntryView extends VoiceLlmPoolEntry {
  active: boolean
}

export interface ImportVoiceLlmModelsInput {
  /**
   * Absolute path to a local .xlsx workbook. Filled in by the desktop shell's
   * file dialog; callers may send an empty object and let the dialog run.
   */
  filePath?: string
}

export interface RemoveVoiceLlmModelInput {
  model: string
}
