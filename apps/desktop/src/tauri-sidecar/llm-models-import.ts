/**
 * @purpose Parse hand-made "free-tier model list" workbooks into pool entries.
 * @role    Sidecar import mapper between the user's sheet columns and VoiceLlmPoolEntry.
 * @deps    The minimal xlsx reader and shared voice contracts.
 * @gotcha  Column detection is by fuzzy header name (模型/额度/到期…). Real-world cells are messy:
 *          quota reads "剩 995.6K / 共 1M" and expiry reads "2026/11/12剩余 7 天". Every row enters
 *          the pool with an inferred purpose: 大语言模型 → llm (reasoning), asr-named speech models
 *          → asr (recognition), tts / livetranslate → stored for their own consumers. Unparsable
 *          rows are skipped and reported, never guessed into the pool.
 */

import type { VoiceLlmPoolEntry, VoicePoolPurpose } from "@bubo/shared/contracts"
import { excelSerialToDateKey } from "@bubo/api"

const MODEL_COLUMN = /模型|model/i
const QUOTA_COLUMN = /额度|quota/i
const EXPIRY_COLUMN = /到期|剩余|有效期|expir/i
const TYPE_COLUMN = /类型|type/i

function localDateKeyOf(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function calendarDateKey(text: string): string | null {
  const match = /^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?$/.exec(text.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Expiry cell → calendar key: full date, embedded date, day count, then Excel serial. */
export function parseExpiryDateKey(raw: string, today: Date): string | null {
  const text = raw.trim()
  if (text.length === 0) return null

  const asDate = calendarDateKey(text)
  if (asDate) return asDate

  // "2026/11/12剩余 7 天" — the embedded calendar date wins over the (drifting) day count.
  const embedded = /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(text)
  if (embedded) return calendarDateKey(`${embedded[1]}-${embedded[2]}-${embedded[3]}`)

  // "30天", "剩余30天", "30 days" — a number that explicitly carries a day unit.
  const withUnit = /(\d{1,4})\s*(?:天|日|days?)\s*$/i.exec(text)
  const plainNumber = /^(\d{1,4})(?:\.0+)?$/.exec(text)
  const dayCandidate = withUnit?.[1] ?? (plainNumber ? plainNumber[1] : null)
  if (dayCandidate) {
    const expiry = new Date(today)
    expiry.setDate(expiry.getDate() + Math.round(Number(dayCandidate)))
    return localDateKeyOf(expiry)
  }

  const serial = Number(text)
  if (Number.isFinite(serial) && serial > 20_000 && serial < 80_000) {
    return excelSerialToDateKey(serial)
  }
  return null
}

/** Quota cell → remaining-quota number: plain number, or "剩 995.6K / 共 1M" style text. */
export function parseQuotaValue(raw: string): number | null {
  const text = raw.trim()
  if (text.length === 0) return null

  const plain = Number(text.replace(/[,，\s]/g, ""))
  if (Number.isFinite(plain) && plain > 0) return plain

  const firstQuantity = /([\d.]+)\s*([KMBkmb])?/.exec(text)
  if (!firstQuantity) return null
  const value = Number(firstQuantity[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = (firstQuantity[2] ?? "").toUpperCase()
  const factor = unit === "K" ? 1e3 : unit === "M" ? 1e6 : unit === "B" ? 1e9 : 1
  return value * factor
}

/**
 * Purpose inference for non-LLM models: asr feeds the recognition pool, tts / livetranslate /
 * vision / embedding entries are stored for their own consumers. Everything else is an LLM.
 */
export function inferPoolPurpose(model: string, type: string): VoicePoolPurpose {
  const haystack = `${model} ${type}`.toLowerCase()
  if (/livetranslate|live-translate|同声传译|实时翻译/.test(haystack)) return "translate"
  if (/tts|语音合成|speech[-_]?synth/.test(haystack)) return "tts"
  if (/asr|语音识别|transcription|转写/.test(haystack)) return "asr"
  if (/图像|视频|视觉|vision|image|video|图片/.test(haystack)) return "vision"
  if (/嵌入|embedding|向量/.test(haystack)) return "embedding"
  if (/语音|audio|speech/.test(haystack)) return "asr"
  return "llm"
}

function findColumn(headers: string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(header.trim()))
}

export interface LlmModelsParseResult {
  entries: VoiceLlmPoolEntry[]
  skipped: number
  skippedReasons: string[]
}

/** Map sheet rows into pool entries. Header row is located as the first row containing all columns. */
export function parseLlmModelsSheet(
  rows: string[][],
  today: Date = new Date(),
): LlmModelsParseResult {
  const headerIndex = rows.findIndex(
    (row) =>
      row.some((cell) => MODEL_COLUMN.test(cell)) &&
      row.some((cell) => QUOTA_COLUMN.test(cell)) &&
      row.some((cell) => EXPIRY_COLUMN.test(cell)),
  )
  if (headerIndex === -1) {
    throw new Error("未找到表头：需要同时包含 模型、额度、剩余时间（或到期/有效期）列")
  }

  const headers = rows[headerIndex]
  const modelColumn = findColumn(headers, MODEL_COLUMN)
  const quotaColumn = findColumn(headers, QUOTA_COLUMN)
  const expiryColumn = findColumn(headers, EXPIRY_COLUMN)
  const typeColumn = headers.some((cell) => TYPE_COLUMN.test(cell.trim()))
    ? findColumn(headers, TYPE_COLUMN)
    : null

  const entries: VoiceLlmPoolEntry[] = []
  const skippedReasons: string[] = []
  let skipped = 0
  const addedAt = new Date().toISOString()

  for (const row of rows.slice(headerIndex + 1)) {
    const model = (row[modelColumn] ?? "").trim()
    if (model.length === 0) {
      skipped += 1
      continue
    }
    const type = typeColumn != null ? (row[typeColumn] ?? "").trim() : ""
    const quota = parseQuotaValue(row[quotaColumn] ?? "")
    const expiresAt = parseExpiryDateKey(row[expiryColumn] ?? "", today)
    if (quota == null || !expiresAt) {
      skipped += 1
      skippedReasons.push(`${model}: 额度或到期时间无法解析`)
      continue
    }
    entries.push({
      model,
      quota,
      expiresAt,
      purpose: inferPoolPurpose(model, type),
      addedAt,
    })
  }

  return { entries, skipped, skippedReasons }
}
