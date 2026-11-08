/**
 * @purpose Render the shared type-to-filter combobox for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI ComboBox, used by the currency picker.
 * @deps    React state and effects, the cn helper, and the `.bubo-select`/`.bubo-item`
 *          rules in primitives.css.
 * @gotcha  Typing filters by `label` (and any `keywords`), never by value. With
 *          `allowCustom` the typed text becomes the value when nothing matches, so a field
 *          backed by a curated list can still hold something the list does not know about;
 *          on blur that text is committed explicitly. Without it the field snaps back to
 *          the selected label on blur.
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
  /** Accept the typed text as the value when no option matches. */
  allowCustom?: boolean
  /** Draw the danger border (the caller owns the message). */
  invalid?: boolean
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
  allowCustom = false,
  invalid = false,
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

  // While closed the field mirrors the selection; while open it mirrors the query. A free
  // value that is not in the list still has to survive, hence the `value` fallback.
  const displayText = open ? query : (selected?.label ?? value ?? "")

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === "") return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.keywords?.some((keyword) => keyword.toLowerCase().includes(needle)) === true,
    )
  }, [options, query])

  // The "use this text" row is appended, so option indices stay stable for the others.
  const rows = React.useMemo<SelectOption[]>(() => {
    const custom = query.trim()
    if (!allowCustom || custom === "") return [...filtered]
    const known = options.some(
      (option) => option.label.toLowerCase() === custom.toLowerCase() || option.key === custom,
    )
    if (known) return [...filtered]
    return [...filtered, { key: custom, label: `使用「${custom}」` }]
  }, [allowCustom, filtered, options, query])

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
    const index = rows.findIndex((option) => option.key === value)
    setActive(index >= 0 ? index : 0)
  }, [open, rows, value])

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

  /** Commit typed text that the list does not know about, if this field accepts free text. */
  function commitCustom() {
    const text = query.trim()
    if (!allowCustom || text === "" || text === selected?.label) return
    onChange(text)
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
      if (rows.length === 0) return
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((current) => (current + step + rows.length) % rows.length)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const option = rows[active]
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
        aria-invalid={invalid || undefined}
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
        onBlur={() => {
          setOpen(false)
          commitCustom()
        }}
        className={cn(
          "bubo-field bubo-select__trigger",
          INPUT_SIZE[size],
          invalid && "bubo-field--invalid",
          inputClassName,
        )}
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

      {open && rows.length > 0 && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          data-open="true"
          className={cn("bubo-pop bubo-pop-motion bubo-select__menu", menuClassName)}
        >
          {rows.map((option, index) => (
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
