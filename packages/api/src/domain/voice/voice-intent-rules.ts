/**
 * @purpose Hold the static system prompt and the normalization rules for system-wide voice intents.
 * @role    Domain layer between one utterance and the five business domains bubo can prefill.
 * @deps    Shared voice contracts, asset/investment vocabulary, and the cashflow draft rules.
 * @gotcha  The system prompt must stay byte-identical across calls: it is the prompt-cache prefix,
 *          so ledger data (categories, accounts, loans…) goes into the user message instead.
 *          Ids and enums are re-validated here against the ledger context; a hallucinated id is
 *          dropped with a warning rather than trusted, and no amount is ever invented.
 */

import type {
  VoiceAssetIntent,
  VoiceBillingCycle,
  VoiceCashflowIntent,
  VoiceIntent,
  VoiceIntentDomain,
  VoiceInvestmentIntent,
  VoiceLoanIntent,
  VoiceSubscriptionIntent,
} from "@bubo/shared/contracts"
import type { AssetSnapshotType } from "@bubo/shared/contracts"
import type { InstrumentKind } from "@bubo/shared/contracts"
import {
  localDateKey,
  normalizeVoiceAmount,
  normalizeVoiceEntryDraft,
  type VoiceCategoryOption,
} from "./voice-entry-rules"

export interface VoiceAssetOption {
  id: string
  name: string
  assetType: AssetSnapshotType
  currency: string
}

export interface VoiceLoanOption {
  id: string
  name: string
  lender: string | null
  paymentAmount: string
  currency: string
}

export interface VoiceSubscriptionOption {
  id: string
  name: string
  amount: string
  currency: string
  billingCycle: string
}

export interface VoicePositionOption {
  id: string
  symbol: string
  name: string | null
  instrumentKind: InstrumentKind
  currency: string
}

export interface VoiceIntentContext {
  transcript: string
  currency: string
  now: Date
  categories: VoiceCategoryOption[]
  assets: VoiceAssetOption[]
  loans: VoiceLoanOption[]
  subscriptions: VoiceSubscriptionOption[]
  positions: VoicePositionOption[]
}

export interface VoiceIntentMessages {
  system: string
  user: string
}

const MAX_WARNINGS = 5
const MAX_NAME_LENGTH = 40

const ASSET_TYPES: readonly AssetSnapshotType[] = [
  "cash",
  "bank",
  "wallet",
  "brokerage",
  "fund",
  "stock",
  "crypto",
  "real_estate",
  "vehicle",
  "fixed_asset",
  "liability",
  "other",
  "investment",
]

const INSTRUMENT_KINDS: readonly InstrumentKind[] = [
  "stock",
  "fund",
  "crypto",
  "etf",
  "bond",
  "other",
]

const BILLING_CYCLES: readonly VoiceBillingCycle[] = ["weekly", "monthly", "yearly", "custom"]

/**
 * Frozen prompt prefix: one utterance → exactly one intent for one of five domains.
 * Keep this string free of per-call values so the provider's prefix cache keeps hitting.
 */
export const VOICE_INTENT_SYSTEM_PROMPT = [
  "你是 bubo 财务应用的系统级语音入口解析器。用户会说一句中文口语，你要判断它在描述哪一类对象，并抽取该类别的结构化字段。",
  "只输出一个 JSON 对象，不要输出解释、Markdown 或代码块。",
  "",
  "## 一、领域判定（domain）",
  '- "cashflow"：一笔已经发生的收入或支出，例如“中午吃饭花了三十八块五”“发工资了”。',
  '- "loan"：一笔贷款/负债本身，例如“新办了房贷，月供五千八，贷了三十年”。',
  '- "subscription"：周期性扣费服务，例如“开了 Netflix，每月六十块”。',
  '- "asset"：某个账户/资产的当下余额或市值，例如“招行卡里现在有八万”“车现在值十五万”。',
  '- "investment"：买卖证券或建仓，例如“买了十股苹果，每股一百八”“卖出两百份标普五百”。',
  '- "unknown"：完全无法归入以上五类，或缺少判断依据。',
  "判定优先级：出现“月供/贷款/房贷/车贷/分期/还款”归 loan；出现“订阅/会员/每月自动扣”归 subscription；",
  "出现“买入/卖出/建仓/加仓/减仓/几股/几份/成交价”归 investment；出现“余额/现在有/市值/值多少/存了”归 asset；",
  "其余涉及钱进出且已发生的归 cashflow。",
  "",
  "## 二、通用输出字段",
  "- domain：上面六个值之一。",
  "- confidence：0 到 1 的浮点置信度。",
  "- warnings：字符串数组，说明你不确定的地方；没有就输出 []。",
  '- 金额一律是十进制数字字符串，最多两位小数，不带货币符号、不带千分位、不带正负号；听不清就输出 ""。',
  "- 日期一律用 yyyy-MM-dd；需要时刻时用 yyyy-MM-ddTHH:mm:ss（本地时间，无时区后缀）。",
  "- 相对时间（昨天、上周五、下个月一号）基于用户消息里给出的“当前时间”换算。",
  "",
  "## 三、各领域字段",
  '### domain = "cashflow"',
  '- flowKind："expense" 支出 | "income" 收入',
  "- amount：金额；currency：ISO 代码",
  "- title：6-14 字中文摘要，如“午饭 麻辣烫”",
  "- categoryId / categoryName：只能取用户消息里给出的分类，且必须与 flowKind 同向；无合适分类则 null",
  "- occurredAt：发生时刻；paymentMethod：如“微信支付”“支付宝”“现金”“银行卡”，没说则 null",
  "- note：补充信息或 null",
  "",
  '### domain = "loan"',
  "- name：贷款名称，如“建行房贷”",
  "- lender：机构名或 null；principalAmount：贷款本金",
  "- paymentAmount：每期还款额（月供）；annualRatePercent：年利率百分数，如 4.25",
  "- termMonths：总期数（月）；startDate：起始日期；paymentDay：每月还款日 1-31",
  "- currency；note",
  "",
  '### domain = "subscription"',
  "- name：服务名；merchant：商户或 null",
  "- amount：每期金额；currency",
  '- billingCycle："weekly" | "monthly" | "yearly" | "custom"；intervalCount：间隔数，默认 1',
  "- nextChargeDate：下次扣费日期；autoRenew：是否自动续费（布尔）",
  "- categoryId / categoryName：只能取给定分类中支出方向的分类，否则 null",
  "- note",
  "",
  '### domain = "asset"',
  "- accountName：账户名，如“招商银行储蓄卡”“比特币钱包”",
  '- assetType："cash"（现金）| "bank"（银行卡/储蓄）| "wallet"（电子钱包）| "brokerage"（证券账户）|',
  '  "fund" | "stock" | "crypto"（加密货币）| "real_estate"（房产）| "vehicle"（车辆）|',
  '  "fixed_asset"（其他固定资产）| "liability"（负债，如信用卡欠款）| "other"',
  "- valueAmount：当前余额或市值；currency",
  "- snapshotAt：这笔价值的日期，默认今天",
  "- quantity：仅在有明确份额（如 0.5 个比特币）时输出数字，否则 null",
  "- costBasisAmount：成本或买入价合计，没说则 null",
  "- assetItemId：若用户消息里已有同名账户，填它的 id；否则 null 表示新建账户",
  "- note",
  "",
  '### domain = "investment"',
  '- action："open" 首次建仓 | "trade" 已有持仓的加仓/减仓',
  "- positionId：用户消息里已有同标的持仓时填其 id；新建仓则 null",
  "- symbol：标的代码，如 AAPL、BTC、510300；name：标的中文名或 null",
  '- instrumentKind："stock" | "fund" | "crypto" | "etf" | "bond" | "other"',
  '- side："buy" | "sell"；quantity：数量（股/份/枚）',
  "- price：成交单价；feeAmount：手续费或 null；currency",
  "- executedAt：成交日期；note",
  "",
  "## 四、硬规则",
  '1. 金额、数量、价格只能来自用户原话；口语数量词要换算（“三十八块五” → "38.50"，“一万二” → "12000.00"）。',
  "2. 绝不虚构分类、账户、持仓的 id；给定列表里没有就输出 null，并在 warnings 说明。",
  "3. 一句话里有多件事时，只保留最主要的一件，并在 warnings 里说明其余被忽略。",
  "4. 只输出字段名对应 JSON，不输出多余字段；不确定的字段用 null 或空字符串。",
  '5. 无法归类时输出 {"domain":"unknown","confidence":0,"warnings":[],"reason":"..."}。',
].join("\n")

function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/** Build the user turn: context first (stable ordering), the utterance last. */
export function buildVoiceIntentMessages(context: VoiceIntentContext): VoiceIntentMessages {
  const payload = {
    当前时间: formatLocalDateTime(context.now),
    主货币: context.currency,
    可用分类: context.categories.map((category) => ({
      id: String(category.id),
      name: category.name,
      kind: category.kind,
    })),
    已有账户: context.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      assetType: asset.assetType,
      currency: asset.currency,
    })),
    已有贷款: context.loans.map((loan) => ({
      id: loan.id,
      name: loan.name,
      lender: loan.lender,
      paymentAmount: loan.paymentAmount,
      currency: loan.currency,
    })),
    已有订阅: context.subscriptions.map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      amount: subscription.amount,
      currency: subscription.currency,
      billingCycle: subscription.billingCycle,
    })),
    已有持仓: context.positions.map((position) => ({
      id: position.id,
      symbol: position.symbol,
      name: position.name,
      instrumentKind: position.instrumentKind,
      currency: position.currency,
    })),
    用户原话: context.transcript,
  }

  return { system: VOICE_INTENT_SYSTEM_PROMPT, user: JSON.stringify(payload) }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const text = asTrimmedString(value)
  if (text.length === 0) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function clamp01(value: unknown): number {
  const parsed = asNumber(value)
  return parsed == null ? 0.5 : Math.min(1, Math.max(0, parsed))
}

function readWarnings(raw: Record<string, unknown>): string[] {
  const list = Array.isArray(raw.warnings) ? raw.warnings : []
  return list
    .map((item) => asTrimmedString(item))
    .filter((item) => item.length > 0)
    .slice(0, MAX_WARNINGS)
}

function amountOf(value: unknown, warnings: string[], label: string): string {
  const result = normalizeVoiceAmount(value)
  if (result.unclear) {
    warnings.push(`${label}没有听清，请手动填写`)
    return ""
  }
  return result.amount
}

/** Accept yyyy-MM-dd (and slash variants) and clamp nonsense to the given fallback. */
function dateKeyOf(value: unknown, fallback: Date, warnings: string[], label: string): string {
  const text = asTrimmedString(value).replace(/\//g, "-")
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (match) {
    const month = Number(match[2])
    const day = Number(match[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const pad = (input: number) => String(input).padStart(2, "0")
      return `${match[1]}-${pad(month)}-${pad(day)}`
    }
  }
  if (text.length > 0) warnings.push(`${label}无法识别，已用今天`)
  return localDateKey(fallback)
}

function nameOf(raw: Record<string, unknown>, fallback: string): string {
  const text = asTrimmedString(raw.name) || asTrimmedString(raw.title)
  const value = text.length > 0 ? text : fallback
  return value.slice(0, MAX_NAME_LENGTH)
}

function currencyOf(raw: Record<string, unknown>, fallback: string): string {
  const text = asTrimmedString(raw.currency).toUpperCase()
  return /^[A-Z]{3}$/.test(text) ? text : fallback
}

function normalizeDomain(value: unknown): VoiceIntentDomain {
  const text = asTrimmedString(value).toLowerCase()
  if (text === "cashflow" || text === "流水" || text === "记账") return "cashflow"
  if (text === "loan" || text === "贷款") return "loan"
  if (text === "subscription" || text === "订阅") return "subscription"
  if (text === "asset" || text === "资产") return "asset"
  if (text === "investment" || text === "投资") return "investment"
  return "unknown"
}

function findByIdOrName<
  T extends { id: string | number; name?: string | null; symbol?: string | null },
>(options: readonly T[], rawId: unknown, rawLabel: string): T | undefined {
  const id = asTrimmedString(rawId)
  if (id.length > 0) {
    const hit = options.find((option) => String(option.id) === id)
    if (hit) return hit
  }
  if (rawLabel.length === 0) return undefined
  return (
    options.find((option) => (option.name ?? "") === rawLabel) ??
    options.find((option) => option.symbol === rawLabel) ??
    options.find(
      (option) =>
        (option.name ?? "").includes(rawLabel) ||
        ((option.name ?? "").length > 0 && rawLabel.includes(option.name ?? "")),
    )
  )
}

function normalizeCashflow(
  raw: Record<string, unknown>,
  context: VoiceIntentContext,
): VoiceCashflowIntent {
  const draft = normalizeVoiceEntryDraft(raw, {
    transcript: context.transcript,
    categories: context.categories,
    currency: context.currency,
    now: context.now,
  })
  return {
    ...draft,
    domain: "cashflow",
    confidence: draft.confidence,
    warnings: draft.warnings,
  }
}

function normalizeLoan(
  raw: Record<string, unknown>,
  context: VoiceIntentContext,
  warnings: string[],
): VoiceLoanIntent {
  const startDate = dateKeyOf(raw.startDate, context.now, warnings, "贷款起始日期")
  const termMonths = asNumber(raw.termMonths)
  const paymentDay = asNumber(raw.paymentDay)

  return {
    domain: "loan",
    confidence: clamp01(raw.confidence),
    warnings,
    name: nameOf(raw, "贷款"),
    lender: asTrimmedString(raw.lender) || null,
    principalAmount: amountOf(raw.principalAmount, warnings, "贷款本金"),
    paymentAmount: amountOf(raw.paymentAmount, warnings, "月供金额"),
    annualRatePercent: (() => {
      const rate = asNumber(raw.annualRatePercent)
      return rate == null ? "" : Math.max(0, rate).toFixed(2)
    })(),
    termMonths: termMonths != null && termMonths >= 1 ? Math.round(termMonths) : null,
    startDate,
    paymentDay:
      paymentDay != null && paymentDay >= 1 && paymentDay <= 31
        ? Math.round(paymentDay)
        : Number(startDate.slice(8, 10)),
    currency: currencyOf(raw, context.currency),
    note: asTrimmedString(raw.note) || null,
  }
}

function normalizeCycle(value: unknown): VoiceBillingCycle {
  const text = asTrimmedString(value).toLowerCase()
  if ((BILLING_CYCLES as readonly string[]).includes(text)) return text as VoiceBillingCycle
  if (text.includes("周") || text.includes("week")) return "weekly"
  if (text.includes("年") || text.includes("year")) return "yearly"
  if (text.includes("自定义")) return "custom"
  return "monthly"
}

function normalizeSubscription(
  raw: Record<string, unknown>,
  context: VoiceIntentContext,
  warnings: string[],
): VoiceSubscriptionIntent {
  const category = findByIdOrName(
    context.categories.filter((item) => item.kind === "expense"),
    raw.categoryId,
    asTrimmedString(raw.categoryName),
  )
  if (!category && (asTrimmedString(raw.categoryId) || asTrimmedString(raw.categoryName))) {
    warnings.push("订阅分类未匹配到账本中的支出分类，已留空")
  }
  const interval = asNumber(raw.intervalCount)

  return {
    domain: "subscription",
    confidence: clamp01(raw.confidence),
    warnings,
    name: nameOf(raw, "订阅"),
    merchant: asTrimmedString(raw.merchant) || null,
    amount: amountOf(raw.amount, warnings, "订阅金额"),
    currency: currencyOf(raw, context.currency),
    billingCycle: normalizeCycle(raw.billingCycle),
    intervalCount: interval != null && interval >= 1 ? Math.round(interval) : 1,
    nextChargeDate: dateKeyOf(raw.nextChargeDate, context.now, warnings, "下次扣费日期"),
    autoRenew: raw.autoRenew === false ? false : true,
    categoryId: category ? String(category.id) : null,
    categoryName: category?.name ?? null,
    note: asTrimmedString(raw.note) || null,
  }
}

function normalizeAssetType(value: unknown): AssetSnapshotType {
  const text = asTrimmedString(value).toLowerCase()
  return (ASSET_TYPES as readonly string[]).includes(text) ? (text as AssetSnapshotType) : "other"
}

function normalizeAsset(
  raw: Record<string, unknown>,
  context: VoiceIntentContext,
  warnings: string[],
): VoiceAssetIntent {
  const accountName = asTrimmedString(raw.accountName) || asTrimmedString(raw.name)
  const matched = findByIdOrName(context.assets, raw.assetItemId, accountName)
  if (!matched && asTrimmedString(raw.assetItemId)) {
    warnings.push("账户 id 不在账本中，已改为新建账户")
  }

  return {
    domain: "asset",
    confidence: clamp01(raw.confidence),
    warnings,
    assetItemId: matched ? matched.id : null,
    accountName: (accountName || matched?.name || "新账户").slice(0, MAX_NAME_LENGTH),
    assetType: matched ? matched.assetType : normalizeAssetType(raw.assetType),
    valueAmount: amountOf(raw.valueAmount, warnings, "资产金额"),
    currency: currencyOf(raw, matched?.currency ?? context.currency),
    snapshotAt: dateKeyOf(raw.snapshotAt, context.now, warnings, "资产日期"),
    quantity: (() => {
      const quantity = asNumber(raw.quantity)
      return quantity != null && quantity > 0 ? String(quantity) : null
    })(),
    costBasisAmount: (() => {
      const costBasis = normalizeVoiceAmount(raw.costBasisAmount)
      return costBasis.unclear ? null : costBasis.amount
    })(),
    note: asTrimmedString(raw.note) || null,
  }
}

function normalizeInstrumentKind(value: unknown): InstrumentKind {
  const text = asTrimmedString(value).toLowerCase()
  return (INSTRUMENT_KINDS as readonly string[]).includes(text) ? (text as InstrumentKind) : "other"
}

function normalizeInvestment(
  raw: Record<string, unknown>,
  context: VoiceIntentContext,
  warnings: string[],
): VoiceInvestmentIntent {
  const symbol = asTrimmedString(raw.symbol).toUpperCase()
  const name = asTrimmedString(raw.name)
  const matched = findByIdOrName(context.positions, raw.positionId, symbol || name)
  if (!matched && asTrimmedString(raw.positionId)) {
    warnings.push("持仓 id 不在账本中，已按新建仓处理")
  }

  const sideText = asTrimmedString(raw.side).toLowerCase()
  const side = sideText === "sell" || sideText.includes("卖") ? "sell" : "buy"
  // A matched position always means "trade"; otherwise this utterance opens a position.
  const action: VoiceInvestmentIntent["action"] = matched ? "trade" : "open"

  return {
    domain: "investment",
    confidence: clamp01(raw.confidence),
    warnings,
    action,
    positionId: matched ? matched.id : null,
    symbol: symbol || matched?.symbol || "",
    name: name || matched?.name || null,
    instrumentKind: matched ? matched.instrumentKind : normalizeInstrumentKind(raw.instrumentKind),
    side,
    quantity: amountOf(raw.quantity, warnings, "数量"),
    price: amountOf(raw.price, warnings, "成交价"),
    feeAmount: (() => {
      const fee = normalizeVoiceAmount(raw.feeAmount)
      return fee.unclear ? null : fee.amount
    })(),
    currency: currencyOf(raw, matched?.currency ?? context.currency),
    executedAt: dateKeyOf(raw.executedAt, context.now, warnings, "成交日期"),
    note: asTrimmedString(raw.note) || null,
  }
}

/**
 * Convert the model's JSON into a typed intent. Contract violations throw; anything
 * else degrades into warnings so the renderer can still prefill a usable form.
 */
export function normalizeVoiceIntent(payload: unknown, context: VoiceIntentContext): VoiceIntent {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("大模型未返回 JSON 对象，无法判断语音意图")
  }
  const raw = asRecord(payload)
  const domain = normalizeDomain(raw.domain)
  const warnings = readWarnings(raw)

  switch (domain) {
    case "cashflow":
      return normalizeCashflow(raw, context)
    case "loan":
      return normalizeLoan(raw, context, warnings)
    case "subscription":
      return normalizeSubscription(raw, context, warnings)
    case "asset":
      return normalizeAsset(raw, context, warnings)
    case "investment":
      return normalizeInvestment(raw, context, warnings)
    default:
      return {
        domain: "unknown",
        confidence: clamp01(raw.confidence),
        warnings,
        reason: asTrimmedString(raw.reason) || "没有听清要记录的对象",
      }
  }
}
