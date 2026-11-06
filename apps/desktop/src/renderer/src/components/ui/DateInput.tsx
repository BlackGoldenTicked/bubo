/**
 * @purpose Date-only input backed by the app's Chinese-first HeroUI calendar.
 * @role    Renderer-local form control for ISO date strings, shared by every modal and filter.
 * @deps    HeroUI Calendar/DateField/DatePicker and @internationalized/date.
 * @gotcha  Stores dates as YYYY-MM-DD strings so renderer forms match API contracts. Chinese
 *          headings (2026年11月) and the Monday week start come from the zh-CN locale mounted in
 *          main.tsx — do not hardcode weekday text here, or the two skins would disagree.
 *          Do not try to control this popover: HeroUI owns its open state, so a custom
 *          shortcut inside it could never close it again.
 */

import { Calendar, DateField, DatePicker } from "@heroui/react"
import type { DateValue } from "@internationalized/date"
import { parseDate } from "@internationalized/date"

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  isInvalid?: boolean
  popoverPlacement?: "top" | "bottom"
  /** `sm` keeps the 30px filter-toolbar height; `md` is the form default. */
  size?: "sm" | "md"
  className?: string
}

export function DateInput({
  value,
  onChange,
  isInvalid,
  popoverPlacement = "top",
  size = "md",
  className,
}: DateInputProps) {
  return (
    <DatePicker
      value={value ? parseDate(value) : null}
      onChange={(next: DateValue | null) => {
        if (next) onChange(next.toString())
      }}
    >
      <DateField.Group
        fullWidth
        variant="secondary"
        isInvalid={isInvalid}
        className={`${size === "sm" ? "h-[30px] min-h-[30px] px-2 text-[11.5px]" : ""} ${className ?? ""}`.trim()}
      >
        <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      <DatePicker.Popover placement={popoverPlacement} style={{ maxWidth: "none" }}>
        <Calendar>
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
      </DatePicker.Popover>
    </DatePicker>
  )
}
