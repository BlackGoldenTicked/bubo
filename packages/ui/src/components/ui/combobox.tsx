/**
 * @purpose Render the shared type-to-filter combobox for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI ComboBox, used by the currency picker.
 * @deps    React state and effects, the cn helper, and the `.bubo-select`/`.bubo-item`
 *          rules in primitives.css.
 * @gotcha  Custom values are never accepted: typing only filters, and the field snaps
 *          back to the selected label on blur. Filtering matches the option `label`
 *          case-insensitively, so put every searchable token in it.
 */

import * as React from "react"
import { cn } from "../../lib/utils"
import type { FieldSize } from "./input"
import type { SelectOption } from "./select"

const INPUT_SIZE = {
  sm: "h-7 px-2 pr-7 text-[11.5px]",
  md: "h-[34px] px-[10px] pr-8 text-[13px]",
  lg: "h-10 px-3 pr-9 text-[13px]",
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

export interface ComboboxProps {
  options: readonly SelectOption[]
  /** Selected option key, or `null` when unset. */
  value: string | null
  onChange: (key: string) => void
  placeholder?: string
  disabled?: boolean
  /** Compatibility alias for `disabled`. Prefer `disabled` in new code. */
  isDisabled?: boolean
  size?: FieldSize
  className?: string
  inputClassName?: string
  menuClassName?: string
  "aria-label"?: string
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "搜索",
  disabled,
  isDisabled,
  size = "md",
  className,
  inputClassName,
  menuClassName,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)

  const isDisabledFinal = disabled ?? isDisabled ?? false
  const selected = options.find((option) => option.key === value) ?? null

  // While closed the field mirrors the selection; while open it mirrors the query.
  const displayText = open ? query : (selected?.label ?? "")

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === "") return options
    return options.filter((option) => option.label.toLowerCase().includes(needle))
  }, [options, query])

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const index = filtered.findIndex((option) => option.key === value)
    setActive(index >= 0 ? index : 0)
  }, [open, filtered, value])

  function openMenu() {
    if (isDisabledFinal) return
    setQuery("")
    setOpen(true)
  }

  function choose(option: SelectOption) {
    if (option.disabled) return
    onChange(option.key)
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
      return
    }
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault()
        openMenu()
      }
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (filtered.length === 0) return
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((current) => (current + step + filtered.length) % filtered.length)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const option = filtered[active]
      if (option != null) choose(option)
    }
  }

  return (
    <div
      ref={wrapRef}
      data-slot="combobox"
      data-open={open ? "true" : "false"}
      className={cn("bubo-select", className)}
    >
      <input
        ref={inputRef}
        data-slot="combobox-input"
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder={selected == null ? placeholder : ""}
        disabled={isDisabledFinal}
        value={displayText}
        onFocus={openMenu}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          if (!open) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        className={cn("bubo-field bubo-select__trigger", INPUT_SIZE[size], inputClassName)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        disabled={isDisabledFinal}
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }
          openMenu()
          inputRef.current?.focus()
        }}
        className="bubo-select__icon cursor-pointer border-0 bg-transparent p-0 text-[var(--ink-4)]"
      >
        {CHEVRON}
      </button>

      {open && filtered.length > 0 && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          data-open="true"
          className={cn("bubo-pop bubo-pop-motion bubo-select__menu", menuClassName)}
        >
          {filtered.map((option, index) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={option.key === value}
              data-selected={option.key === value ? "true" : "false"}
              disabled={option.disabled}
              // Prevent the blur that would otherwise close the menu before the click lands.
              onMouseDown={(event) => event.preventDefault()}
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
