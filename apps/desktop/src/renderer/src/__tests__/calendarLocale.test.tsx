/**
 * @purpose Keep every calendar surface Chinese and Monday-first.
 * @role    Regression sensor for the zh-CN locale contract behind the date fields.
 * @deps    React DOM server rendering, HeroUI Calendar, and Node file reads.
 * @gotcha  Chinese headings and the Monday week start both come from the locale, never from
 *          our own formatting. If someone drops the I18nProvider in main.tsx, every date
 *          picker silently falls back to en-US — this test is what catches that.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { Calendar, I18nProvider } from "@heroui/react"
import { parseDate } from "@internationalized/date"
import { describe, expect, it } from "vitest"

function calendarText(locale: string): string {
  const markup = renderToStaticMarkup(
    <I18nProvider locale={locale}>
      <Calendar aria-label="日期" defaultValue={parseDate("2026-11-06")}>
        <Calendar.Header>
          <Calendar.YearPickerTrigger>
            <Calendar.YearPickerTriggerHeading />
            <Calendar.YearPickerTriggerIndicator />
          </Calendar.YearPickerTrigger>
          <Calendar.NavButton slot="previous" />
          <Calendar.NavButton slot="next" />
        </Calendar.Header>
        <Calendar.Grid>
          <Calendar.GridHeader>
            {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
          </Calendar.GridHeader>
          <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
        </Calendar.Grid>
      </Calendar>
    </I18nProvider>,
  )
  return markup.replace(/<[^>]+>/g, "|")
}

const desktopRoot = resolve(process.cwd(), "apps/desktop")
const mainSource = readFileSync(resolve(desktopRoot, "src/renderer/src/main.tsx"), "utf8")

describe("calendar locale", () => {
  it("renders Chinese month headings and weekday labels under zh-CN", () => {
    const text = calendarText("zh-CN")
    expect(text).toContain("2026年11月")
    for (const weekday of ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]) {
      expect(text).toContain(weekday)
    }
  })

  it("starts the week on Monday, the way Chinese calendars do", () => {
    // November 2026 starts on a Sunday, so a Monday-first grid opens on October 26.
    const text = calendarText("zh-CN")
    const headerIndex = text.indexOf("周一")
    expect(headerIndex).toBeGreaterThan(0)
    expect(text.slice(headerIndex)).toMatch(/周一\|+周二\|+周三\|+周四\|+周五\|+周六\|+周日/)
  })

  it("mounts the whole app inside the zh-CN provider", () => {
    expect(mainSource).toContain('locale="zh-CN"')
    expect(mainSource.indexOf("I18nProvider")).toBeLessThan(mainSource.indexOf("<App />"))
  })
})
