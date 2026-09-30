/**
 * @purpose Render the shared segmented control that replaces the HeroUI tabs pattern.
 * @role    Hand-drawn selection atom used by settings, analysis ranges, and page filters.
 * @deps    React state, the cn helper, and `.bubo-seg` in primitives.css.
 * @gotcha  Options are data, not children — the old `Tabs.List > Tabs.Tab` compound
 *          shape does not exist here. bubo draws an underline, Lumno a sliding white
 *          pill; both are pure CSS branches so the two skins cannot drift in behaviour.
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface SegmentedOption {
  key: string
  label: React.ReactNode
  disabled?: boolean
}

export interface SegmentedProps extends Omit<React.ComponentProps<"div">, "onChange"> {
  options: readonly SegmentedOption[]
  /** Currently selected option key. */
  value: string
  onChange: (key: string) => void
  size?: "sm" | "md"
}

export function Segmented({
  options,
  value,
  onChange,
  size = "sm",
  className,
  ...props
}: SegmentedProps) {
  const listRef = React.useRef<HTMLDivElement>(null)

  /** Roving tabindex: the selected option is the tab stop, arrows move and select. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const enabled = options.filter((option) => !option.disabled)
    if (enabled.length === 0) return

    const current = Math.max(
      0,
      enabled.findIndex((option) => option.key === value),
    )
    let next: number | null = null

    if (event.key === "ArrowRight") next = (current + 1) % enabled.length
    else if (event.key === "ArrowLeft") next = (current - 1 + enabled.length) % enabled.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = enabled.length - 1
    else return

    event.preventDefault()
    const target = enabled[next]
    if (target == null) return
    onChange(target.key)

    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-key="${CSS.escape(target.key)}"]`,
    )
    node?.focus()
  }

  return (
    <div
      ref={listRef}
      data-slot="segmented"
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn("bubo-seg", className)}
      {...props}
    >
      {options.map((option) => {
        const selected = option.key === value
        return (
          <button
            key={option.key}
            data-slot="segmented-item"
            data-key={option.key}
            type="button"
            role="tab"
            id={option.key}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.key)}
            className={cn("bubo-seg__item", size === "sm" ? "px-3 py-1.5" : "px-4 py-2")}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
