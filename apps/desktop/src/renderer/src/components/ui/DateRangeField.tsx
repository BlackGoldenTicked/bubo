/**
 * @purpose Date-range field with the Chinese quick ranges users actually ask for.
 * @role    Renderer control for filtered lists and charts that need a from/to window.
 * @deps    HeroUI DateRangePicker/RangeCalendar/Dropdown and the dateRanges presets.
 * @gotcha  HeroUI's date popover is only closeable from the inside, so shortcuts live in a
 *          Dropdown next to the field — it closes itself on pick. Never fake a close by
 *          dispatching an outside pointer event: the surrounding modal listens for the same
 *          event and would dismiss the whole form. The active chip is derived from the current
 *          bounds, never from local state, so a range restored from the URL still highlights.
 */

import { DateField, DateRangePicker, Dropdown, RangeCalendar } from "@heroui/react"
import type { DateValue } from "@internationalized/date"
import { parseDate } from "@internationalized/date"
import { useRef, type Key } from "react"
import {
  RANGE_PRESETS,
  formatRangeText,
  matchRangePreset,
  resolveRangePreset,
  type RangePreset,
  type RangePresetKey,
} from "@/lib/dateRanges"

interface DateRangeFieldProps {
  value: { from: string; to: string }
  onChange: (next: { from: string; to: string }) => void
  /** Fires with the shortcut the user picked, so callers can persist the choice. */
  onPresetChange?: (key: RangePresetKey) => void
  /** Shortcut list; defaults to the eight shared ranges. */
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
  const pickerRef = useRef<HTMLDivElement>(null)
  const activeKey = matchRangePreset(value)
  const rangeValue: RangeValue | null =
    value.from && value.to ? { start: parseDate(value.from), end: parseDate(value.to) } : null

  function applyPreset(rawKey: Key) {
    const key = String(rawKey)
    if (key === "custom") {
      // 自定义 means "I'll type it": put the caret in the start segments instead of
      // trying to force the calendar open (HeroUI owns that state).
      pickerRef.current?.querySelector<HTMLElement>('[role="spinbutton"]')?.focus()
      return
    }
    const presetKey = key as RangePresetKey
    onChange(resolveRangePreset(presetKey))
    onPresetChange?.(presetKey)
  }

  const shortcuts = allowAll ? [...presets, { key: "all" as const, label: "全部" }] : presets

  return (
    <div className={`flex w-full items-center gap-1 ${className ?? ""}`.trim()}>
      <DateRangePicker
        ref={pickerRef}
        className="min-w-0 flex-1"
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
          className={size === "sm" ? "h-[30px] min-h-[30px] px-2 text-[11.5px]" : undefined}
        >
          <DateField.Input slot="start">
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateRangePicker.RangeSeparator className="px-1 text-[var(--ink-4)]">
            至
          </DateRangePicker.RangeSeparator>
          <DateField.Input slot="end">
            {(segment) => <DateField.Segment segment={segment} />}
          </DateField.Input>
          <DateField.Suffix>
            <DateRangePicker.Trigger>
              <DateRangePicker.TriggerIndicator />
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
