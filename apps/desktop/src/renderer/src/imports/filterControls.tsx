/**
 * @purpose Provide reusable cashflow filter controls (select + date range) shared across surfaces.
 * @role    Renderer presentational primitives for the imports page and the cashflow link picker.
 * @deps    HeroUI Select/ListBox/DateRangePicker, @internationalized/date, and the FormField atom.
 * @gotcha  Stateless controls only — callers own filter state; no URL/nuqs sync lives here.
 */

import { ListBox, Select } from "@heroui/react"
import { DateRangeField } from "../components/ui/DateRangeField"
import { FormField } from "../components/ui/FormField"
import type { RangePresetKey } from "@/lib/dateRanges"

export const FILTER_LABEL_CLASS = "mb-1 block text-[10.5px] leading-[1.2] text-[var(--ink-3)]"

export function FilterSelectField({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: string
  options: Array<{ key: string; label: string }>
  onChange: (value: string) => void
  className: string
}) {
  return (
    <div className={className}>
      <FormField label={label} labelClassName={FILTER_LABEL_CLASS}>
        <Select
          variant="secondary"
          selectedKey={value}
          onSelectionChange={(key) => {
            if (key == null) return
            const next = String(key)
            if (next !== value) onChange(next)
          }}
        >
          <Select.Trigger className="h-[30px] min-h-[30px] px-2 text-[11.5px]">
            <Select.Value className="text-[11.5px]" />
            <Select.Indicator className="size-3" />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {options.map((option) => (
                <ListBox.Item key={option.key} id={option.key} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </FormField>
    </div>
  )
}

export function DateRangeFilter({
  value,
  onChange,
  onPresetChange,
  allowAll = false,
}: {
  value: { from: string; to: string }
  onChange: (next: { from: string; to: string }) => void
  onPresetChange?: (key: RangePresetKey) => void
  allowAll?: boolean
}) {
  return (
    <DateRangeField
      value={value}
      onChange={onChange}
      onPresetChange={onPresetChange}
      allowAll={allowAll}
    />
  )
}
