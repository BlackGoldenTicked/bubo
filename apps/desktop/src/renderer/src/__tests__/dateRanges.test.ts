/**
 * @purpose Pin the Chinese quick-range boundaries every filter depends on.
 * @role    Unit tests for lib/dateRanges.ts.
 * @deps    Vitest and the renderer date helpers.
 * @gotcha  All expectations use local dates on a fixed Friday; a UTC-based date key would
 *          shift the whole-window assertions by one day in UTC+8 and must not creep in.
 */

import { describe, expect, it } from "vitest"
import {
  RANGE_PRESETS,
  formatRangeText,
  matchRangePreset,
  resolveRangePreset,
  startOfWeek,
} from "../lib/dateRanges"

/** 2026-11-06 is a Friday, inside Q4, so every branch below is easy to read by hand. */
const NOW = new Date(2026, 10, 6, 10, 0, 0)

describe("resolveRangePreset", () => {
  it("starts the week on Monday and stops at today", () => {
    expect(resolveRangePreset("this_week", NOW)).toEqual({ from: "2026-11-02", to: "2026-11-06" })
  })

  it("keeps a Sunday inside the week that began on Monday", () => {
    const sunday = new Date(2026, 10, 1, 9, 0, 0)
    expect(startOfWeek(sunday).getDay()).toBe(1)
    expect(resolveRangePreset("this_week", sunday)).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    })
  })

  it("gives the current month up to today", () => {
    expect(resolveRangePreset("this_month", NOW)).toEqual({ from: "2026-11-01", to: "2026-11-06" })
  })

  it("gives the whole previous calendar month", () => {
    expect(resolveRangePreset("last_month", NOW)).toEqual({ from: "2026-10-01", to: "2026-10-31" })
  })

  it("treats 最近一个季度 as a rolling three months ending today", () => {
    expect(resolveRangePreset("last_quarter", NOW)).toEqual({
      from: "2026-08-07",
      to: "2026-11-06",
    })
  })

  it("treats 上个季度 as the previous calendar quarter", () => {
    expect(resolveRangePreset("prev_quarter", NOW)).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    })
  })

  it("rolls 上个季度 across a year boundary", () => {
    const february = new Date(2026, 1, 10, 9, 0, 0)
    expect(resolveRangePreset("prev_quarter", february)).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    })
  })

  it("treats 半年 as a rolling six months ending today", () => {
    expect(resolveRangePreset("half_year", NOW)).toEqual({ from: "2026-05-07", to: "2026-11-06" })
  })

  it("clamps the day when the rolling start lands on a short month", () => {
    const may31 = new Date(2026, 4, 31, 9, 0, 0)
    // 5月31日 - 3 个月 = 2月31日 → clamped to 2月28日, then +1 day.
    expect(resolveRangePreset("last_quarter", may31).from).toBe("2026-03-01")
  })

  it("gives the year to date for 全年", () => {
    expect(resolveRangePreset("this_year", NOW)).toEqual({ from: "2026-01-01", to: "2026-11-06" })
  })

  it("returns an open range for 全部 and 自定义", () => {
    expect(resolveRangePreset("all", NOW)).toEqual({ from: "", to: "" })
    expect(resolveRangePreset("custom", NOW)).toEqual({ from: "", to: "" })
  })
})

describe("matchRangePreset", () => {
  it("recognises a range that was produced by a preset", () => {
    expect(matchRangePreset(resolveRangePreset("this_month", NOW), NOW)).toBe("this_month")
    expect(matchRangePreset(resolveRangePreset("prev_quarter", NOW), NOW)).toBe("prev_quarter")
  })

  it("falls back to 自定义 for a hand-picked range", () => {
    expect(matchRangePreset({ from: "2026-03-02", to: "2026-03-09" }, NOW)).toBe("custom")
  })

  it("falls back to 全部 for an open range", () => {
    expect(matchRangePreset({ from: "", to: "" }, NOW)).toBe("all")
  })
})

describe("formatRangeText", () => {
  it("marks today at the end of a running range", () => {
    expect(formatRangeText(resolveRangePreset("this_month", NOW), NOW)).toBe(
      "11月1日 — 11月6日（今天）",
    )
  })

  it("adds the year when the range crosses a year boundary", () => {
    expect(formatRangeText({ from: "2025-12-20", to: "2026-01-05" }, NOW)).toBe(
      "2025年12月20日 — 2026年1月5日",
    )
  })

  it("collapses a single-day range", () => {
    expect(formatRangeText({ from: "2026-11-06", to: "2026-11-06" }, NOW)).toBe("2026年 11月6日")
  })

  it("describes an open range as 全部时间", () => {
    expect(formatRangeText({ from: "", to: "" }, NOW)).toBe("全部时间")
  })
})

describe("RANGE_PRESETS", () => {
  it("lists the eight quick ranges in Chinese order", () => {
    expect(RANGE_PRESETS.map((preset) => preset.label)).toEqual([
      "本周",
      "本月",
      "上个月",
      "最近一个季度",
      "上个季度",
      "半年",
      "全年",
      "自定义",
    ])
  })
})
