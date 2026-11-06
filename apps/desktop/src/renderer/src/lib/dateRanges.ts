/**
 * @purpose Provide the Chinese quick date ranges every filter in the app shares.
 * @role    Renderer date-range vocabulary: labels, boundaries, and label formatting.
 * @deps    Local date helpers only.
 * @gotcha  Past periods are whole calendar periods; the running period stops at today so
 *          the range text never claims days that have not happened yet. "最近一个季度" and
 *          "半年" are rolling windows ending today, "上个季度" is a calendar quarter. All
 *          arithmetic stays on local dates — never toISOString, which shifts the day in UTC+8.
 */

import { addDays, localDateKey } from "./dates"

export type RangePresetKey =
  | "this_week"
  | "this_month"
  | "last_month"
  | "last_quarter"
  | "prev_quarter"
  | "half_year"
  | "this_year"
  | "all"
  | "custom"

export interface RangePreset {
  key: RangePresetKey
  label: string
}

/** Order matters: it is exactly the order a Chinese ledger user expects. */
export const RANGE_PRESETS: readonly RangePreset[] = [
  { key: "this_week", label: "本周" },
  { key: "this_month", label: "本月" },
  { key: "last_month", label: "上个月" },
  { key: "last_quarter", label: "最近一个季度" },
  { key: "prev_quarter", label: "上个季度" },
  { key: "half_year", label: "半年" },
  { key: "this_year", label: "全年" },
  { key: "custom", label: "自定义" },
]

export type MenuRangePresetKey = Exclude<RangePresetKey, "custom" | "all">

/** Labels without 自定义/全部, for surfaces that only switch presets. */
export const RANGE_PRESET_MENU: ReadonlyArray<{ key: MenuRangePresetKey; label: string }> =
  RANGE_PRESETS.filter(
    (preset): preset is { key: MenuRangePresetKey; label: string } =>
      preset.key !== "custom" && preset.key !== "all",
  )

export interface DateBounds {
  from: string
  to: string
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

/** Monday-based week start: Chinese calendars start the week on Monday. */
export function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7
  return addDays(date, -offset)
}

function addMonthsToDate(date: Date, months: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1)
  // Clamp the day so 3月31日 - 1月 never rolls into the next month.
  const lastDay = endOfMonth(next).getDate()
  next.setDate(Math.min(date.getDate(), lastDay))
  return next
}

export function resolveRangePreset(key: RangePresetKey, now = new Date()): DateBounds {
  const today = localDateKey(now)

  if (key === "this_week") {
    return { from: localDateKey(startOfWeek(now)), to: today }
  }
  if (key === "this_month") {
    return { from: localDateKey(startOfMonth(now)), to: today }
  }
  if (key === "last_month") {
    const previous = addMonthsToDate(now, -1)
    return { from: localDateKey(startOfMonth(previous)), to: localDateKey(endOfMonth(previous)) }
  }
  if (key === "last_quarter") {
    // Rolling three months ending today, which is what 最近一个季度 means in speech.
    const start = addDays(addMonthsToDate(now, -3), 1)
    return { from: localDateKey(start), to: today }
  }
  if (key === "prev_quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
    const start = new Date(now.getFullYear(), quarterStartMonth - 3, 1)
    const end = new Date(now.getFullYear(), quarterStartMonth, 0)
    return { from: localDateKey(start), to: localDateKey(end) }
  }
  if (key === "half_year") {
    const start = addDays(addMonthsToDate(now, -6), 1)
    return { from: localDateKey(start), to: today }
  }
  if (key === "this_year") {
    return { from: `${now.getFullYear()}-01-01`, to: today }
  }
  return { from: "", to: "" }
}

/** Which preset a hand-picked range corresponds to, so the menu stays highlighted. */
export function matchRangePreset(bounds: DateBounds, now = new Date()): RangePresetKey {
  if (!bounds.from && !bounds.to) return "all"
  for (const preset of RANGE_PRESET_MENU) {
    const resolved = resolveRangePreset(preset.key, now)
    if (resolved.from === bounds.from && resolved.to === bounds.to) return preset.key
  }
  return "custom"
}

/** 「2026年 11月6日」 — the form Chinese users read fastest. */
export function formatChineseDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return value
  return `${year}年 ${month}月${day}日`
}

/** 「11月6日」 with the year only when the range crosses a year boundary. */
export function formatRangeText(bounds: DateBounds, now = new Date()): string {
  const { from, to } = bounds
  if (!from && !to) return "全部时间"
  if (!from) return `截至 ${formatChineseDate(to)}`
  if (!to) return `${formatChineseDate(from)} 起`
  if (from === to) return formatChineseDate(from)

  const crossesYear = from.slice(0, 4) !== to.slice(0, 4)
  const short = (value: string) => {
    const [year, month, day] = value.split("-").map(Number)
    return crossesYear ? `${year}年${month}月${day}日` : `${month}月${day}日`
  }
  const suffix = to === localDateKey(now) ? `${short(to)}（今天）` : short(to)
  return `${short(from)} — ${suffix}`
}
