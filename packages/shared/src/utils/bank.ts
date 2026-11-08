/**
 * @purpose Curated registry of Chinese banks used by the card form's bank picker.
 * @role    Platform-light reference data: official short names, kind, and search aliases.
 * @deps    None (JS built-ins only).
 * @gotcha  Names are the common short form printed on cards (工商银行, not 中国工商银行股份
 *          有限公司) because this string is stored on the card and used as the wallet's
 *          grouping key — changing one here changes grouping for existing cards. `aliases`
 *          exist because people type 农行/招行; the picker matches them, the stored value
 *          never uses them. The list is intentionally curated, not exhaustive: the picker
 *          accepts free text for anything missing.
 */

export type BankKind = "national" | "policy" | "joint" | "city" | "rural" | "private" | "foreign"

export interface BankMeta {
  /** Stored card value and grouping key. */
  name: string
  kind: BankKind
  /** Colloquial names people actually type (农行, 招行 …). */
  aliases?: readonly string[]
}

/** Short label for the kind tag shown next to a bank in the picker. */
export const BANK_KIND_LABEL: Record<BankKind, string> = {
  national: "国有",
  policy: "政策",
  joint: "股份",
  city: "城商",
  rural: "农商",
  private: "民营",
  foreign: "外资",
}

// Order is the picker's default ordering: the banks most people actually hold first.
export const COMMON_BANKS: readonly BankMeta[] = [
  // 国有大型商业银行
  { name: "工商银行", kind: "national", aliases: ["工行", "icbc"] },
  { name: "农业银行", kind: "national", aliases: ["农行", "abc"] },
  { name: "中国银行", kind: "national", aliases: ["中行", "boc"] },
  { name: "建设银行", kind: "national", aliases: ["建行", "ccb"] },
  { name: "交通银行", kind: "national", aliases: ["交行", "bocom"] },
  { name: "邮储银行", kind: "national", aliases: ["邮政储蓄", "邮储", "psbc"] },

  // 股份制商业银行
  { name: "招商银行", kind: "joint", aliases: ["招行", "cmb"] },
  { name: "浦发银行", kind: "joint", aliases: ["浦发", "spdb"] },
  { name: "中信银行", kind: "joint", aliases: ["中信", "citic"] },
  { name: "光大银行", kind: "joint", aliases: ["光大", "ceb"] },
  { name: "华夏银行", kind: "joint", aliases: ["华夏", "hxb"] },
  { name: "民生银行", kind: "joint", aliases: ["民生", "cmbc"] },
  { name: "兴业银行", kind: "joint", aliases: ["兴业", "cib"] },
  { name: "广发银行", kind: "joint", aliases: ["广发", "cgb"] },
  { name: "平安银行", kind: "joint", aliases: ["平安", "pab"] },
  { name: "浙商银行", kind: "joint", aliases: ["浙商", "czbank"] },
  { name: "恒丰银行", kind: "joint", aliases: ["恒丰"] },
  { name: "渤海银行", kind: "joint", aliases: ["渤海"] },

  // 政策性银行
  { name: "国家开发银行", kind: "policy", aliases: ["国开行", "cdb"] },
  { name: "中国进出口银行", kind: "policy", aliases: ["进出口银行"] },
  { name: "中国农业发展银行", kind: "policy", aliases: ["农发行"] },

  // 城市商业银行（省级 + 主要城市）
  { name: "北京银行", kind: "city" },
  { name: "上海银行", kind: "city" },
  { name: "天津银行", kind: "city" },
  { name: "重庆银行", kind: "city" },
  { name: "河北银行", kind: "city" },
  { name: "晋商银行", kind: "city", aliases: ["太原银行"] },
  { name: "内蒙古银行", kind: "city" },
  { name: "盛京银行", kind: "city", aliases: ["沈阳银行"] },
  { name: "吉林银行", kind: "city" },
  { name: "哈尔滨银行", kind: "city" },
  { name: "江苏银行", kind: "city" },
  { name: "南京银行", kind: "city" },
  { name: "苏州银行", kind: "city" },
  { name: "杭州银行", kind: "city" },
  { name: "宁波银行", kind: "city" },
  { name: "温州银行", kind: "city" },
  { name: "台州银行", kind: "city" },
  { name: "徽商银行", kind: "city", aliases: ["合肥银行"] },
  { name: "福建海峡银行", kind: "city", aliases: ["海峡银行"] },
  { name: "厦门银行", kind: "city" },
  { name: "江西银行", kind: "city", aliases: ["南昌银行"] },
  { name: "九江银行", kind: "city" },
  { name: "齐鲁银行", kind: "city", aliases: ["济南银行"] },
  { name: "青岛银行", kind: "city" },
  { name: "郑州银行", kind: "city" },
  { name: "中原银行", kind: "city" },
  { name: "湖北银行", kind: "city" },
  { name: "汉口银行", kind: "city" },
  { name: "长沙银行", kind: "city" },
  { name: "湖南银行", kind: "city" },
  { name: "广州银行", kind: "city" },
  { name: "东莞银行", kind: "city" },
  { name: "广西北部湾银行", kind: "city", aliases: ["北部湾银行"] },
  { name: "海南银行", kind: "city" },
  { name: "成都银行", kind: "city" },
  { name: "贵阳银行", kind: "city" },
  { name: "富滇银行", kind: "city", aliases: ["昆明银行"] },
  { name: "西安银行", kind: "city" },
  { name: "兰州银行", kind: "city" },
  { name: "青海银行", kind: "city" },
  { name: "宁夏银行", kind: "city" },
  { name: "乌鲁木齐银行", kind: "city" },
  { name: "西藏银行", kind: "city" },

  // 农村商业银行 / 农信
  { name: "北京农商银行", kind: "rural" },
  { name: "上海农商银行", kind: "rural" },
  { name: "广州农商银行", kind: "rural" },
  { name: "重庆农商银行", kind: "rural" },
  { name: "成都农商银行", kind: "rural" },
  { name: "东莞农商银行", kind: "rural" },
  { name: "天津农商银行", kind: "rural" },
  { name: "深圳农商银行", kind: "rural" },

  // 民营 / 互联网银行
  { name: "微众银行", kind: "private", aliases: ["wechat", "微信"] },
  { name: "网商银行", kind: "private", aliases: ["支付宝", "alipay"] },
  { name: "新网银行", kind: "private" },
  { name: "亿联银行", kind: "private" },
  { name: "苏宁银行", kind: "private" },

  // 外资银行
  { name: "汇丰银行", kind: "foreign", aliases: ["hsbc"] },
  { name: "渣打银行", kind: "foreign", aliases: ["sc"] },
  { name: "花旗银行", kind: "foreign", aliases: ["citi"] },
  { name: "东亚银行", kind: "foreign", aliases: ["bank of east asia"] },
  { name: "星展银行", kind: "foreign", aliases: ["dbs"] },
  { name: "恒生银行", kind: "foreign", aliases: ["hang seng"] },
]

const BY_NAME: ReadonlyMap<string, BankMeta> = new Map(COMMON_BANKS.map((bank) => [bank.name, bank]))

/** Registry entry for a stored bank name, or undefined for free-typed names. */
export function bankMeta(name: string | null | undefined): BankMeta | undefined {
  return BY_NAME.get((name ?? "").trim())
}
