/**
 * @purpose Render the shared single- and multi-select popover for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI Select/ComboBox/ListBox trio.
 * @deps    React state and effects, the cn helper, and the `.bubo-select`/`.bubo-item`
 *          rules in primitives.css.
 * @gotcha  Options are data, not children: the old `Select.Popover > ListBox > ListBox.Item`
 *          tree does not exist here. The menu is positioned absolutely inside the wrapper,
 *          so a parent with `overflow: hidden` will clip it — use a Drawer or Modal slot.
 */

import * as React from "react"
import { cn } from "../../lib/utils"
import type { FieldSize } from "./input"

export interface SelectOption {
  key: string
  /** Plain text used for the trigger label and for combobox filtering. */
  label: string
  /** Richer row content; falls back to `label`. */
  content?: React.ReactNode
  /** Extra search tokens for the combobox (aliases, abbreviations); never displayed. */
  keywords?: readonly string[]
  disabled?: boolean
}

const TRIGGER_SIZE = {
  sm: "min-h-7 px-2 pr-7 text-[11.5px]",
  md: "min-h-[34px] px-[10px] pr-8 text-[13px]",
  lg: "min-h-10 px-3 pr-9 text-[13px]",
} as const

const CHEVRON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 6l4 4 4-4" />
  </svg>
)

interface SelectSharedProps {
  options: readonly SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** Compatibility alias for `disabled`. Prefer `disabled` in new code. */
  isDisabled?: boolean
  size?: FieldSize
  className?: string
  triggerClassName?: string
  menuClassName?: string
  "aria-label"?: string
}

interface SingleSelectProps extends SelectSharedProps {
  selectionMode?: "single"
  value: string | null
  onChange: (key: string) => void
}

interface MultiSelectProps extends SelectSharedProps {
  selectionMode: "multiple"
  value: readonly string[]
  onChange: (keys: string[]) => void
}

export type SelectProps = SingleSelectProps | MultiSelectProps

export function Select(props: SelectProps) {
  const {
    options,
    placeholder = "请选择",
    disabled,
    isDisabled,
    size = "md",
    className,
    triggerClassName,
    menuClassName,
    "aria-label": ariaLabel,
  } = props
  const multiple = props.selectionMode === "multiple"

  const wrapRef = React.useRef<HTMLDivElement>(null)
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const isDisabledFinal = disabled ?? isDisabled ?? false

  const selectedKeys = multiple
    ? new Set(props.value)
    : props.value != null
      ? new Set([props.value])
      : new Set<string>()

  const triggerText = multiple
    ? options
        .filter((option) => selectedKeys.has(option.key))
        .map((option) => option.label)
        .join("、") || placeholder
    : (options.find((option) => option.key === props.value)?.label ?? placeholder)
  const hasValue = multiple ? selectedKeys.size > 0 : props.value != null

  /** Close on any pointer press outside the wrapper. */
  React.useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  /** Keep the highlighted row near the current selection when the menu opens. */
  React.useEffect(() => {
    if (!open) return
    const index = options.findIndex((option) => selectedKeys.has(option.key))
    setActive(index >= 0 ? index : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function choose(option: SelectOption) {
    if (option.disabled) return
    if (multiple) {
      const next = new Set(selectedKeys)
      if (next.has(option.key)) next.delete(option.key)
      else next.add(option.key)
      // Preserve the declared option order so summaries read consistently.
      props.onChange(options.filter((item) => next.has(item.key)).map((item) => item.key))
    } else {
      props.onChange(option.key)
      setOpen(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
      return
    }
    if (isDisabledFinal) return

    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault()
        setOpen(true)
      }
      return
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((current) => {
        let next = current
        for (let i = 0; i < options.length; i += 1) {
          next = (next + step + options.length) % options.length
          if (!options[next]?.disabled) return next
        }
        return current
      })
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      const option = options[active]
      if (option != null) choose(option)
    }
  }

  return (
    <div
      ref={wrapRef}
      data-slot="select"
      data-open={open ? "true" : "false"}
      className={cn("bubo-select", className)}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={isDisabledFinal}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "bubo-field bubo-select__trigger",
          TRIGGER_SIZE[size],
          !hasValue && "text-[var(--ink-4)]",
          triggerClassName,
        )}
      >
        <span className="truncate">{triggerText}</span>
      </button>
      <span className="bubo-select__icon" aria-hidden="true">
        {CHEVRON}
      </span>

      {open && (
        <div
          role="listbox"
          aria-multiselectable={multiple || undefined}
          className={cn("bubo-pop bubo-pop-motion bubo-select__menu", menuClassName)}
          data-open="true"
        >
          {options.map((option, index) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={selectedKeys.has(option.key)}
              data-selected={selectedKeys.has(option.key) ? "true" : "false"}
              disabled={option.disabled}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
              className={cn("bubo-item", index === active && "bubo-item--active")}
            >
              <span className="min-w-0 flex-1 truncate">{option.content ?? option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
