/**
 * @purpose Date-range field with the Chinese quick ranges users actually ask for.
 * @role    Renderer control for filtered lists and charts that need a from/to window.
 * @deps    HeroUI DateRangePicker/RangeCalendar/Dropdown and the dateRanges presets.
 * @gotcha  HeroUI's date popover is only closeable from the inside, so shortcuts live in a
 *          Dropdown next to the field — it closes itself on pick. Never fake a close by
 *          dispatching an outside pointer event: the surrounding modal listens for the same
 *          event and would dismiss the whole form. The active chip is derived from the current
 *          bounds, never from local state, so a range restored from the URL still highlights.
 *          The calendar open state is controlled: a click anywhere in the segment field opens
 *          it (clicking a year/month/day segment must pop the calendar, not just focus the
 *          segment), and the trigger carries a fixed 22px width — HeroUI's `w-full` lets the
 *          flex row squeeze it to zero, clipping the calendar icon. For the same reason both
 *          date inputs are forced shrinkable: HeroUI's range layout keeps them `flex: none`,
 *          which pushes the suffix out of the clipped group when the value is long. The
 *          shortcut menu has no 自定义 row — the calendar itself is how a custom range is made.
 */

import { DateField, DateRangePicker, Dropdown, RangeCalendar } from "@heroui/react"
import type { DateValue } from "@internationalized/date"
import { parseDate } from "@internationalized/date"
import { useState, type Key } from "react"
import {
  RANGE_PRESETS,
  formatRangeText,
  matchRangePreset,
  resolveRangePreset,
  type RangePreset,
  type RangePresetKey,
} from "@/lib/dateRanges"

/**
 * HeroUI pins both date inputs to `flex: none` inside a range group, so long values push the
 * suffix (the calendar trigger) past the group's clipped right edge. Letting the inputs shrink
 * keeps the icon inside the field frame at any width.
 */
const SHRINKABLE_SEGMENTS = { flex: "0 1 auto", minWidth: 0 } as const

interface DateRangeFieldProps {
  value: { from: string; to: string }
  onChange: (next: { from: string; to: string }) => void
  /** Fires with the shortcut the user picked, so callers can persist the choice. */
  onPresetChange?: (key: RangePresetKey) => void
  /** Shortcut list; defaults to the seven shared ranges. */
  presets?: readonly RangePreset[]
  /** Adds an 全部 shortcut that clears both ends. */
  allowAll?: boolean
  size?: "sm" | "md"
  placement?: "top" | "bottom"
  className?: string
}

type RangeValue = { start: DateValue; end: DateValue }

export function DateRangeField({
  value,
  onChange,
  onPresetChange,
  presets = RANGE_PRESETS,
  allowAll = false,
  size = "sm",
  placement = "bottom",
  className,
}: DateRangeFieldProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)
  const activeKey = matchRangePreset(value)
  const rangeValue: RangeValue | null =
    value.from && value.to ? { start: parseDate(value.from), end: parseDate(value.to) } : null

  function applyPreset(rawKey: Key) {
    // No 自定义 row: a hand-picked range comes from the calendar itself, so every shortcut
    // here is a real preset.
    const presetKey = String(rawKey) as RangePresetKey
    onChange(resolveRangePreset(presetKey))
    onPresetChange?.(presetKey)
  }

  const shortcuts = allowAll ? [...presets, { key: "all" as const, label: "全部" }] : presets

  return (
    <div className={`flex w-full items-center gap-1 ${className ?? ""}`.trim()}>
      <DateRangePicker
        className="min-w-0 flex-1"
        isOpen={calendarOpen}
        onOpenChange={setCalendarOpen}
        value={rangeValue}
        onChange={(next: RangeValue | null) => {
          onChange({
            from: next?.start.toString() ?? "",
            to: next?.end.toString() ?? "",
          })
          onPresetChange?.("custom")
        }}
      >
        <DateField.Group
          fullWidth
          variant="secondary"
          onClick={() => setCalendarOpen(true)}
          className={size === "sm" ? "h-[30px] min-h-[30px] px-2 text-[11.5px]" : undefined}
        >
          <DateField.Input slot="start" style={SHRINKABLE_SEGMENTS}>
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateRangePicker.RangeSeparator className="shrink-0 px-1 text-[var(--ink-4)]">
            至
          </DateRangePicker.RangeSeparator>
          <DateField.Input slot="end" style={SHRINKABLE_SEGMENTS}>
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix style={{ marginRight: 4 }}>
            <DateRangePicker.Trigger className="h-[22px] w-[22px] shrink-0 justify-center rounded-[3px] p-1">
              <DateRangePicker.TriggerIndicator className="size-3.5" />
            </DateRangePicker.Trigger>
          </DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover placement={placement} style={{ maxWidth: "none" }}>
          <RangeCalendar>
            <RangeCalendar.Header>
              <RangeCalendar.YearPickerTrigger>
                <RangeCalendar.YearPickerTriggerHeading />
                <RangeCalendar.YearPickerTriggerIndicator />
              </RangeCalendar.YearPickerTrigger>
              <RangeCalendar.NavButton slot="previous" />
              <RangeCalendar.NavButton slot="next" />
            </RangeCalendar.Header>
            <RangeCalendar.Grid>
              <RangeCalendar.GridHeader>
                {(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}
              </RangeCalendar.GridHeader>
              <RangeCalendar.GridBody>
                {(date) => <RangeCalendar.Cell date={date} />}
              </RangeCalendar.GridBody>
            </RangeCalendar.Grid>
          </RangeCalendar>
        </DateRangePicker.Popover>
      </DateRangePicker>

      <Dropdown>
        <Dropdown.Trigger
          aria-label={`快捷时间：${formatRangeText(value)}`}
          className="h-[30px] min-h-[30px] shrink-0 rounded-[2px] border border-[var(--hair)] px-1.5 text-[11px] text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          <ChevronGlyph />
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom end">
          <Dropdown.Menu
            aria-label="快捷时间"
            selectionMode="single"
            selectedKeys={[activeKey]}
            onAction={(key) => applyPreset(key)}
          >
            {shortcuts.map((preset) => (
              <Dropdown.Item key={preset.key} id={preset.key}>
                {preset.label}
                <Dropdown.ItemIndicator />
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </div>
  )
}

/** A 10px chevron keeps the shortcut button visually quiet next to the date field. */
function ChevronGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
