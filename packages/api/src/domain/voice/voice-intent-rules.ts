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
  matchCategoryByKeywords,
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
  "你是 bubo 财务应用的系统级语音入口解析器。用户会输入一句话，或一整段账单/聊天记录；你要把其中**每一笔**独立的记录都识别出来，判断各自属于哪一类对象，并抽取该类别的结构化字段。",
  '只输出一个 JSON 对象，形如 {"intents":[ {...}, {...} ]}，不要输出解释、Markdown 或代码块。',
  "intents 是数组：输入里有几笔互相独立的记录就输出几个元素，顺序与原文一致；只有一笔时数组长度为 1。",
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
  "- 每个元素只填**它自己那一笔**的日期；同一段文本里不同笔可以有不同的日期。",
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
  "3. 必须逐笔输出：一句话或一段文本里有几笔钱进出，就输出几个元素，绝不合并金额、绝不只保留最大的一笔、绝不因为“同一类”而折叠。",
  "   例如“早饭 8 块，打车 26，中午麻辣烫 38.5”要输出 3 个 cashflow 元素；最多输出 20 条，超出部分在 warnings 里说明。",
  "4. 解析多行文本时，一行通常是一笔；“合计/总计/小计/余额”这类行不是新的收支，不要单独成条。",
  "5. 只输出字段名对应 JSON，不输出多余字段；不确定的字段用 null 或空字符串。",
  '6. 单条无法归类时，该条输出 {"domain":"unknown","confidence":0,"warnings":[],"reason":"..."}，不要因此丢弃其它可识别的条目。',
  "",
  "## 五、多日期与跨类别",
  "1. 逐笔取日期：每一笔只用它所在那一行/那一句提到的日期。原文出现多个日期时，各笔分别使用各自的日期，不要把整段统一成某一天或“今天”。",
  "2. 日期行继承：日期常单独成行出现在明细上方，如“10月3日”“2026/10/03 周六”“昨天”。它之后所有**没有自带日期**的明细都继承这个日期，直到出现新的日期行；自带日期的明细以自带为准。",
  "3. 无日期才用当前时间：只有当某笔明细向上追溯也找不到任何日期线索时，才使用“当前时间”的日期，并在 warnings 里注明“未提供日期，已用今天”。",
  "4. 年份推断：原文只给月日（如 12/31、1/1、10月3日）时，以“当前时间”为基准取最近的一次；若该日期比今天晚很多（例如今天 1 月 2 日而原文是 12 月 31 日），视为去年的同一天。",
  "5. 跨类别混排：同一段文本可以同时包含支出、收入、账户余额、买入/卖出、订阅、贷款。逐条判断各自类别并分别输出，保持原文顺序；不要因为出现了不同类别就只输出其中一类。",
  "6. 时间与日期分离时（如首行“10月3日 星期六”，明细行只写“12:30 午饭 38”），把日期行与明细行的时间组合成完整时刻。",
  "",
  "## 六、字段与分类的语义映射",
  "1. 分类必须先按语义归类，再回落到字面：用户说的是具体商品/商户（饮料、奶茶、薯片、雪糕、可乐），而账本分类是较宽的概念（如「零食」），就应当归入语义最接近的那一个，不要因为字面不同就留空。",
  "   常见归类：饮料/奶茶/咖啡/薯片/坚果/甜品 → 零食类；早饭/午饭/晚饭/外卖/食堂 → 三餐类；打车/地铁/公交/加油/停车 → 交通或车相关类；药/体检/挂号/健身 → 医疗健身类；话费/流量/宽带/软件 → 通讯数码类；书/电影/演出/游戏 → 书影音类；猫粮/狗粮/兽医 → 宠物类。",
  "2. 只能从用户消息给出的分类列表中选；列表里的名字和示例不同，就选语义最接近的那个，绝不新造分类。",
  "3. 具体优先：列表里同时有更具体的分类（如「零食」）和更宽泛的（如「其它」「日常」）时，优先具体的；只有确实没有对应概念时才选宽泛分类，实在没有就留空并在 warnings 说明。",
  "4. categoryName 要写列表中那个分类的**原名**，categoryId 写它的 id，两者必须指向同一个分类；flowKind=income 时只能选收入类分类，expense 只能选支出类分类。",
  "5. title 要保留原文里的商品名或商户名（如“可乐”“星巴克”“Netflix”），它既是用户核对时的依据，也是分类兜底匹配的线索。",
  "6. 其它域同样按语义映射枚举值：",
  '   - asset：银行/储蓄卡/借记卡 → "bank"；支付宝/微信/现金 → "wallet"/"cash"；券商/股票账户 → "brokerage"；交易所/钱包/币 → "crypto"；房/公寓 → "real_estate"；车 → "vehicle"；信用卡欠款/花呗待还 → "liability"。',
  '   - investment：六位代码或沪深/美股代码 → "stock"；指数/ETF/标普/沪深300 → "etf"；场外基金 → "fund"；债券/国债 → "bond"；BTC/ETH/币 → "crypto"。"买了/买入/加仓" → side="buy" 且 action="open"；"卖了/卖出/减仓/清仓" → side="sell"。',
  '   - subscription：每周/一周 → "weekly"；每月/月度 → "monthly"；每年/年度/包年 → "yearly"；"每季度/自定义" → "custom"，并在 intervalCount 记录间隔。',
  '   - loan：出现"月供/分期/还款/房贷/车贷/信用卡分期"即归 loan，不要归入 cashflow。',
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
  const expenseCategories = context.categories.filter((item) => item.kind === "expense")
  const category =
    findByIdOrName(expenseCategories, raw.categoryId, asTrimmedString(raw.categoryName)) ??
    // Same product-word fallback as cashflow: "Netflix 会员" still lands in a media category.
    matchCategoryByKeywords(
      [asTrimmedString(raw.name), asTrimmedString(raw.merchant)].join(" "),
      expenseCategories,
      "expense",
    ) ??
    matchCategoryByKeywords(context.transcript, expenseCategories, "expense")
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

/** Hard cap: a pasted bill dump must not turn into an unbounded confirmation queue. */
export const MAX_VOICE_INTENTS = 20

function collectRawIntents(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("大模型未返回 JSON 对象，无法判断语音意图")
  }
  const record = payload as Record<string, unknown>
  for (const key of ["intents", "items", "records", "entries"]) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    }
  }
  // Tolerate a model that answered with a single bare intent object.
  if (typeof record.domain === "string") return [record]
  throw new Error("大模型未返回 intents 数组，无法解析批量记录")
}

/**
 * Convert the model's JSON into a list of typed intents, preserving source order.
 * A malformed array throws; a single malformed item is skipped and logged so one bad
 * record cannot discard the whole batch.
 */
export function normalizeVoiceIntents(
  payload: unknown,
  context: VoiceIntentContext,
): VoiceIntent[] {
  const rawItems = collectRawIntents(payload)
  const intents: VoiceIntent[] = []

  for (const raw of rawItems.slice(0, MAX_VOICE_INTENTS)) {
    try {
      intents.push(normalizeVoiceIntent(raw, context))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[voice] skipped one intent: ${message}`)
    }
  }

  return intents
}
