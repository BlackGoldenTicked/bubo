/**
 * @purpose Hold the cashflow draft normalization rules used by the voice intent pipeline.
 * @role    Domain layer between the model's JSON and the renderer-editable cashflow draft.
 * @deps    Shared voice contracts and bubo id primitives only.
 * @gotcha  Never invent amounts or categories: an unclear utterance must stay empty and carry a warning.
 *          The system-wide prompt and the other four domains live in `voice-intent-rules`.
 */

import type { BuboId } from "@bubo/shared/contracts"
import type { VoiceEntryDraft, VoiceEntryFlowKind } from "@bubo/shared/contracts"

export interface VoiceCategoryOption {
  id: BuboId
  name: string
  kind: string
  parentName?: string | null
}

export interface VoiceEntryParseContext {
  transcript: string
  categories: VoiceCategoryOption[]
  currency: string
  now: Date
}

const MAX_CATEGORY_OPTIONS = 80
const MAX_TITLE_LENGTH = 40
const MAX_WARNINGS = 5

function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

export function localDateKey(date: Date): string {
  return formatLocalDateTime(date).slice(0, 10)
}

/** Keep the prompt small and stable: archived categories never reach the model. */
export function buildVoiceCategoryOptions(
  categories: readonly { id: BuboId; name: string; kind: string; archived?: boolean }[],
): VoiceCategoryOption[] {
  return categories
    .filter((category) => !category.archived)
    .slice(0, MAX_CATEGORY_OPTIONS)
    .map((category) => ({ id: category.id, name: category.name, kind: category.kind }))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeFlowKind(raw: Record<string, unknown>): VoiceEntryFlowKind {
  const flow = asTrimmedString(raw.flowKind).toLowerCase()
  if (flow === "income" || flow === "in") return "income"
  if (flow === "expense" || flow === "out") return "expense"
  const direction = asTrimmedString(raw.direction).toLowerCase()
  return direction === "in" || direction === "income" ? "income" : "expense"
}

/** Amounts stay strings end to end; an unparsable amount becomes "" plus a warning. */
export function normalizeVoiceAmount(value: unknown): { amount: string; unclear: boolean } {
  const text = (
    typeof value === "number" ? String(value) : asTrimmedString(value).replace(/[¥￥$,\s元]/g, "")
  ).replace(/^[+＋-－]/, "")
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return { amount: "", unclear: true }
  return { amount: Number(text).toFixed(2), unclear: false }
}

function normalizeCurrency(value: unknown, fallback: string): string {
  const text = asTrimmedString(value).toUpperCase()
  return /^[A-Z]{3}$/.test(text) ? text : fallback
}

/**
 * Business keyword hints keyed by a fragment of a ledger category name.
 * The model does the semantic work first; this table is the deterministic safety net for
 * the common case where an utterance names a product ("饮料") but the ledger category is
 * broader ("零食"). A hint only applies when the ledger actually has a category whose name
 * contains the key, so renamed or custom categories are never hijacked.
 */
export const CATEGORY_KEYWORD_HINTS: Readonly<Record<string, readonly string[]>> = {
  零食: [
    "零食",
    "饮料",
    "奶茶",
    "咖啡",
    "可乐",
    "雪糕",
    "冰淇淋",
    "薯片",
    "坚果",
    "小吃",
    "矿泉水",
    "面包",
    "蛋糕",
    "甜品",
  ],
  三餐: [
    "早饭",
    "早餐",
    "午饭",
    "午餐",
    "晚饭",
    "晚餐",
    "夜宵",
    "外卖",
    "食堂",
    "餐厅",
    "米饭",
    "面条",
  ],
  车相关: [
    "打车",
    "滴滴",
    "地铁",
    "公交",
    "加油",
    "停车",
    "洗车",
    "高速费",
    "网约车",
    "车费",
    "高铁",
    "机票",
    "油费",
  ],
  水电煤: ["水费", "电费", "燃气费", "煤气", "取暖费", "物业费", "宽带费"],
  住房: ["房租", "房贷", "中介费", "装修", "家具", "家电"],
  医疗健身: ["买药", "药店", "医院", "看病", "体检", "挂号", "牙科", "健身", "瑜伽", "保险"],
  话费数码软件: ["话费", "流量", "宽带", "手机", "电脑", "软件", "云盘", "数码", "充电器"],
  书影音: ["书", "电影", "演出", "音乐会", "游戏", "视频会员", "剧集"],
  宠物: ["猫粮", "狗粮", "宠物", "兽医", "猫砂", "宠物医院"],
  彩票: ["彩票", "刮刮乐", "竞猜", "抽奖"],
  日常: ["日用品", "纸巾", "洗发水", "洗衣液", "超市", "牙膏", "沐浴露"],
}

/**
 * Deterministic fallback: score every category of the right direction by how much of the
 * utterance its hints cover. Longer hits win, so "奶茶" beats a stray "饭". Returns null
 * when nothing matches, which keeps the category empty instead of guessing.
 */
export function matchCategoryByKeywords(
  text: string,
  categories: readonly VoiceCategoryOption[],
  kind: VoiceEntryFlowKind,
): VoiceCategoryOption | null {
  const haystack = text.toLowerCase()
  if (haystack.trim().length === 0) return null

  let best: VoiceCategoryOption | null = null
  let bestScore = 0

  for (const category of categories) {
    if (category.kind !== kind) continue
    const hints = Object.entries(CATEGORY_KEYWORD_HINTS).find(
      ([key]) => category.name.includes(key) || key.includes(category.name),
    )?.[1]
    if (!hints) continue

    let score = 0
    for (const hint of hints) {
      if (hint.length > 0 && haystack.includes(hint.toLowerCase())) score += hint.length
    }
    if (score > bestScore) {
      best = category
      bestScore = score
    }
  }

  return best
}

function findCategory(
  raw: Record<string, unknown>,
  categories: VoiceCategoryOption[],
  flowKind: VoiceEntryFlowKind,
  localText: string,
  fallbackText: string,
): { category: VoiceCategoryOption | null; warnings: string[] } {
  const warnings: string[] = []
  const rawId =
    typeof raw.categoryId === "number" ? String(raw.categoryId) : asTrimmedString(raw.categoryId)
  const rawName = asTrimmedString(raw.categoryName)

  let byId = rawId.length > 0 ? categories.find((item) => String(item.id) === rawId) : undefined
  if (!byId && rawName.length > 0) {
    byId =
      categories.find((item) => item.name === rawName) ??
      categories.find((item) => item.name.includes(rawName) || rawName.includes(item.name))
  }
  // The model left the category empty: resolve it from product words instead of dropping it.
  // Item-local text wins, so a batch of mixed records cannot borrow another item's products.
  if (!byId) {
    const byKeyword =
      matchCategoryByKeywords(localText, categories, flowKind) ??
      matchCategoryByKeywords(fallbackText, categories, flowKind)
    if (byKeyword) return { category: byKeyword, warnings }
    return { category: null, warnings }
  }

  if (byId.kind !== flowKind) {
    warnings.push(
      `分类「${byId.name}」与${flowKind === "income" ? "收入" : "支出"}方向不一致，已清空分类`,
    )
    return { category: null, warnings }
  }
  return { category: byId, warnings }
}

function normalizeOccurredAt(
  raw: Record<string, unknown>,
  now: Date,
): { occurredAt: string | null; eventDate: string; warnings: string[] } {
  const warnings: string[] = []
  const candidates = [asTrimmedString(raw.occurredAt), asTrimmedString(raw.eventDate)].filter(
    (value) => value.length > 0,
  )

  let parsed: Date | null = null
  for (const candidate of candidates) {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate)
    const dateTime = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(candidate)
    if (dateOnly) {
      parsed = new Date(
        Number(dateOnly[1]),
        Number(dateOnly[2]) - 1,
        Number(dateOnly[3]),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
      )
      break
    }
    if (dateTime) {
      parsed = new Date(
        Number(dateTime[1]),
        Number(dateTime[2]) - 1,
        Number(dateTime[3]),
        Number(dateTime[4]),
        Number(dateTime[5]),
        Number(dateTime[6] ?? "0"),
      )
      break
    }
  }

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return { occurredAt: formatLocalDateTime(now), eventDate: localDateKey(now), warnings }
  }
  if (parsed.getTime() > now.getTime()) {
    warnings.push("识别到的时间晚于当前时间，已改为现在")
    return { occurredAt: formatLocalDateTime(now), eventDate: localDateKey(now), warnings }
  }
  if (parsed.getFullYear() < 2000) {
    warnings.push("识别到的日期过早，已改为今天")
    return { occurredAt: formatLocalDateTime(now), eventDate: localDateKey(now), warnings }
  }
  return {
    occurredAt: formatLocalDateTime(parsed),
    eventDate: localDateKey(parsed),
    warnings,
  }
}

function normalizeTitle(
  raw: Record<string, unknown>,
  fallback: string,
  transcript: string,
): string {
  const text = asTrimmedString(raw.title).replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
  if (text.length > 0) return text.slice(0, MAX_TITLE_LENGTH)
  if (fallback.length > 0) return fallback.slice(0, MAX_TITLE_LENGTH)
  return transcript.slice(0, MAX_TITLE_LENGTH)
}

/**
 * Convert the model's JSON answer into a draft the renderer can trust.
 * Contract violations (non-object payloads) throw; everything else degrades to warnings.
 */
export function normalizeVoiceEntryDraft(
  payload: unknown,
  context: VoiceEntryParseContext,
): VoiceEntryDraft {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("大模型未返回 JSON 对象，无法解析记账草稿")
  }
  const raw = asRecord(payload)
  const flowKind = normalizeFlowKind(raw)
  const { amount, unclear } = normalizeVoiceAmount(raw.amount)
  const categoryResult = findCategory(
    raw,
    context.categories,
    flowKind,
    [asTrimmedString(raw.title), asTrimmedString(raw.note)].join(" "),
    context.transcript,
  )
  const timeResult = normalizeOccurredAt(raw, context.now)

  const warnings = [...categoryResult.warnings, ...timeResult.warnings]
  if (unclear) warnings.push("没有听清金额，请手动填写")
  for (const warning of Array.isArray(raw.warnings) ? raw.warnings : []) {
    const text = asTrimmedString(warning)
    if (text.length > 0) warnings.push(text)
  }

  const confidenceValue =
    typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence)
  const confidence = Number.isFinite(confidenceValue)
    ? Math.min(1, Math.max(0, confidenceValue))
    : 0.5

  return {
    direction: flowKind === "income" ? "in" : "out",
    flowKind,
    amount,
    currency: normalizeCurrency(raw.currency, context.currency),
    title: normalizeTitle(raw, categoryResult.category?.name ?? "", context.transcript),
    note: asTrimmedString(raw.note) || null,
    categoryId: categoryResult.category ? String(categoryResult.category.id) : null,
    categoryName: categoryResult.category?.name ?? null,
    eventDate: timeResult.eventDate,
    occurredAt: timeResult.occurredAt,
    paymentMethod: asTrimmedString(raw.paymentMethod) || null,
    confidence,
    warnings: warnings.slice(0, MAX_WARNINGS),
  }
}
