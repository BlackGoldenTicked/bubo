# 0025. Chinese-First Date Surfaces

- Status: Accepted
- Date: 2026-11-06

## Context

Date input was assembled per surface: seven modals each copy-pasted their own
`DatePicker` + `Calendar` tree, two loan forms fell back to a raw
`<input type="date">`, and range filters offered 最近 30 天 / 最近 90 天 / 今年 —
ranges nobody asks for in Chinese, with no 本周, 季度, or 半年, and no way to see
本月 versus 上个月 the way a Chinese ledger app presents them.

Two smaller problems compounded it. Without a locale provider, react-aria renders
en-US: English month headings, Sunday-first weeks. And the week start, month
heading, and field segment order were duplicated in code rather than derived, so
every copy could drift.

## Decision

1. Mount `I18nProvider locale="zh-CN"` once in the renderer entry. Chinese headings
   (`2026年11月`) and the Monday week start come from the locale; no component
   declares weekday labels by hand.
2. One single-date control (`components/ui/DateInput.tsx`) and one range control
   (`components/ui/DateRangeField.tsx`). Every modal, filter, and loan form uses
   them; a surface that needs a date never writes its own calendar.
3. `lib/dateRanges.ts` owns the quick ranges in Chinese order — 本周 / 本月 /
   上个月 / 最近一个季度 / 上个季度 / 半年 / 全年 / 自定义 — plus 全部 where a list
   needs the full history. The running period stops at today; past periods are
   whole calendar periods; 最近一个季度 and 半年 are rolling windows ending today,
   上个季度 is a calendar quarter.
4. Shortcuts live in a `Dropdown` beside the range field, not inside the calendar
   popover. HeroUI owns that popover's open state, and the only way to force it
   shut would be an outside pointer event — which the surrounding modal listens
   for and would close too.
5. The active shortcut is derived from the current bounds (`matchRangePreset`), so
   a range restored from the URL or localStorage highlights correctly.

## Rationale

Users asked for ranges in the words they use, not in day counts. Putting the
boundary math in one module means the imports table, the overview chart, and the
cashflow picker can never disagree about what 上个月 means, and the shared controls
mean the next date field inherits Chinese labels for free.

Keeping the shortcuts outside the popover costs one small chevron, but it is the
only version that closes reliably without firing an event that dismisses the modal
the field lives in.

## Consequences

- Adding a range means editing `RANGE_PRESETS`; every surface picks it up.
- Removing the `I18nProvider` silently reverts the entire app to en-US, so
  `calendarLocale.test.tsx` asserts both the mounted provider and the rendered
  Chinese/Monday-first markup.
- Local-date arithmetic is mandatory: `toISOString()` shifts the day in UTC+8 and
  would move 本周 by one day.
- `全部` stays available only where a list needs complete history; the overview
  chart keeps it, the range field exposes it through `allowAll`.
