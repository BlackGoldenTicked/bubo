/**
 * @purpose Implement the system-wide voice intent workflow inside the Tauri Node sidecar.
 * @role    Sidecar service glue between local AI settings, ledger vocabulary, and the API pipeline.
 * @deps    @bubo/api voice pipeline, the sidecar settings store, xlsx import, and shared contracts.
 * @gotcha  Every parse gathers the active ledger's vocabulary (categories, accounts, loans,
 *          subscriptions, positions) so the model can only reference real ids. Optional lists
 *          degrade to empty on read failure instead of failing the whole parse. LLM attempts walk
 *          the Bailian free-tier pool first and DeepSeek last; this service never writes data.
 */

import {
  parseVoiceIntent,
  transcribeVoiceEntry,
  type BuboApi,
  type VoiceAssetOption,
  type VoiceCategoryOption,
  type VoiceLoanOption,
  type VoicePositionOption,
  type VoiceSubscriptionOption,
} from "@bubo/api"
import { readFileSync } from "node:fs"
import type { Result } from "@bubo/shared"
import type {
  AppendVoiceTraceInput,
  ImportVoiceLlmModelsInput,
  ParseVoiceIntentInput,
  RemoveVoiceLlmModelInput,
  SaveVoiceSettingsInput,
  TranscribeVoiceInput,
  TranscribeVoiceResult,
  VoiceIntent,
  VoiceIntentParseResult,
  VoiceLlmPoolEntryView,
  VoiceSettingsSnapshot,
} from "@bubo/shared/contracts"
import type { VoiceService } from "../main/trpc/voice-service"
import { parseLlmModelsSheet } from "./llm-models-import"
import { readFirstSheetRows } from "./xlsx-reader"
import type { VoiceSettingsStore } from "./voice-settings-store"
import type { VoiceTraceLog } from "./voice-trace-log"

function fail<T = never>(message: string): Result<T> {
  return { success: false, error: message }
}

function readFileAsBuffer(filePath: string): Buffer {
  if (!/\.xlsx$/i.test(filePath)) throw new Error("仅支持 .xlsx 格式的模型清单")
  return readFileSync(filePath)
}

export interface SidecarVoiceServiceOptions {
  settings: VoiceSettingsStore
  getApi: () => BuboApi
  /** Append-only diagnostics file; optional so tests can omit it. */
  trace?: VoiceTraceLog
}

export class SidecarVoiceService implements VoiceService {
  constructor(private readonly options: SidecarVoiceServiceOptions) {}

  getSettings(): VoiceSettingsSnapshot {
    return this.options.settings.snapshot()
  }

  saveSettings(input: SaveVoiceSettingsInput): Result<VoiceSettingsSnapshot> {
    try {
      return { success: true, data: this.options.settings.save(input) }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  listLlmModels(): VoiceLlmPoolEntryView[] {
    return this.options.settings.listLlmModels()
  }

  importLlmModels(input: ImportVoiceLlmModelsInput): Result<VoiceLlmPoolEntryView[]> {
    try {
      const filePath = input.filePath?.trim()
      if (!filePath) return fail("请先选择模型清单 Excel 文件")
      const rows = readFirstSheetRows(readFileAsBuffer(filePath))
      const { entries, skipped, skippedReasons } = parseLlmModelsSheet(rows)
      if (entries.length === 0) {
        const detail = skippedReasons.slice(0, 3).join("；")
        return fail(`没有解析出可用模型行${detail ? `（${detail}）` : ""}`)
      }
      if (skipped > 0) {
        console.error(`[voice] model import skipped ${skipped} rows: ${skippedReasons.join("; ")}`)
      }
      this.options.settings.upsertLlmModels(entries)
      return { success: true, data: this.listLlmModels() }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  removeLlmModel(input: RemoveVoiceLlmModelInput): Result<VoiceLlmPoolEntryView[]> {
    try {
      const model = input.model?.trim()
      if (!model) return fail("缺少要删除的模型名")
      this.options.settings.removeLlmModel(model)
      return { success: true, data: this.listLlmModels() }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  async transcribeEntry(input: TranscribeVoiceInput): Promise<Result<TranscribeVoiceResult>> {
    const settings = this.options.settings.read()
    if (!settings.asr.apiKey) return fail("请先在设置中填写百炼 API Key")
    if (!input.audioBase64) return fail("没有收到录音内容，请重新录音")

    return transcribeVoiceEntry({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType || "audio/wav",
      language: input.language ?? null,
      asr: settings.asr,
      llmPool: settings.llmModels,
    })
  }

  async parseIntent(input: ParseVoiceIntentInput): Promise<Result<VoiceIntentParseResult>> {
    const settings = this.options.settings.read()
    const transcript = input.transcript?.trim() ?? ""
    // System speech already produced text, so Bailian is not needed on this path.
    if (!transcript && !settings.asr.apiKey) return fail("请先在设置中填写百炼 API Key")
    if (!settings.llm.apiKey && settings.llmModels.length === 0) {
      return fail("请先在设置中填写 DeepSeek API Key，或导入百炼免费模型清单")
    }
    if (!transcript && !input.audioBase64) return fail("没有收到录音内容，请重新录音")

    const api = this.options.getApi()
    const [categoriesResult, assetsResult, loansResult, subscriptionsResult, positionsResult] =
      await Promise.all([
        api.listCategories({}),
        api.listAssetItems({ includeArchived: false }),
        api.listLoans({ status: "active" }),
        api.listSubscriptions({ status: "active" }),
        api.listInvestmentPositions({ status: "open" }),
      ])
    if (!categoriesResult.success) return fail(categoriesResult.error)

    const currencyResult = await api.getCurrencySettings()
    const currency = currencyResult.success
      ? currencyResult.data.displayCurrency
      : (input.currency ?? "CNY")

    // Descriptions ride along: the pipeline turns them into each category's 示例 list.
    const categories: VoiceCategoryOption[] = categoriesResult.data.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
      description: category.description ?? null,
    }))

    // Optional context: a missing list must degrade to an empty vocabulary, never fail the parse.
    const assets: VoiceAssetOption[] = (assetsResult.success ? assetsResult.data : [])
      .slice(0, 60)
      .map((asset) => ({
        id: String(asset.id),
        name: asset.name,
        assetType: asset.assetType,
        currency: asset.defaultCurrency,
      }))

    const loans: VoiceLoanOption[] = (loansResult.success ? loansResult.data : [])
      .slice(0, 20)
      .map((loan) => ({
        id: String(loan.id),
        name: loan.name,
        lender: loan.lender,
        paymentAmount: loan.paymentAmount,
        currency: loan.currency,
      }))

    const subscriptions: VoiceSubscriptionOption[] = (
      subscriptionsResult.success ? subscriptionsResult.data : []
    )
      .slice(0, 40)
      .map((subscription) => ({
        id: String(subscription.id),
        name: subscription.name,
        amount: subscription.amount,
        currency: subscription.currency,
        billingCycle: subscription.billingCycle,
      }))

    const positions: VoicePositionOption[] = (positionsResult.success ? positionsResult.data : [])
      .slice(0, 60)
      .map((position) => ({
        id: String(position.id),
        symbol: position.symbol,
        name: position.name,
        instrumentKind: position.instrumentKind,
        currency: position.currency,
      }))

    const result = await parseVoiceIntent({
      audioBase64: input.audioBase64,
      mimeType: input.mimeType,
      transcript: transcript || null,
      language: input.language ?? null,
      currency,
      categories,
      assets,
      loans,
      subscriptions,
      positions,
      now: input.now ? new Date(input.now) : undefined,
      asr: settings.asr,
      llmPool: settings.llmModels,
      llm: settings.llm,
    })
    this.logParse(transcript, result)
    return result
  }

  /** Renderer-side lines (handoff, form prefill) land in the same trace file. */
  appendTrace(input: AppendVoiceTraceInput): Result<null> {
    try {
      for (const line of input.lines ?? []) {
        const text = typeof line === "string" ? line.trim() : ""
        if (text.length > 0) this.options.trace?.append("renderer", text)
      }
      return { success: true, data: null }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Record what the model answered and how each record's category came out. This is the
   * file to read when a category does not reach the form: it separates "the model never
   * returned one" from "the id did not survive normalization".
   */
  private logParse(transcript: string, result: Result<VoiceIntentParseResult>): void {
    const trace = this.options.trace
    if (!trace) return
    if (!result.success) {
      trace.append("server", "parse.failed", { transcript, error: result.error })
      return
    }
    const data = result.data
    trace.append("server", "parse.request", {
      transcript,
      model: data.models.llm,
      llmMs: data.timings.llmMs,
      attempts: data.trace?.attempts ?? [],
      promptChars: data.trace
        ? { system: data.trace.systemPromptChars, user: data.trace.userPromptChars }
        : null,
      categoryVocabulary: (data.trace?.categories ?? []).map(
        (category) => `${category.name}(${category.kind}) ← ${category.示例 ?? "无示例"}`,
      ),
    })
    trace.append("server", "parse.raw", data.trace?.raw ?? "(未记录原始返回)")
    trace.append("server", "parse.intents", data.intents.map(summarizeIntent))
  }
}

/** Compact per-record line for the trace file, category fields first. */
function summarizeIntent(intent: VoiceIntent): Record<string, unknown> {
  const base = { domain: intent.domain, warnings: intent.warnings }
  if (intent.domain === "cashflow") {
    return {
      ...base,
      title: intent.title,
      amount: intent.amount,
      categoryId: intent.categoryId,
      categoryName: intent.categoryName,
    }
  }
  if (intent.domain === "subscription") {
    return {
      ...base,
      name: intent.name,
      amount: intent.amount,
      categoryId: intent.categoryId,
      categoryName: intent.categoryName,
    }
  }
  return base
}
