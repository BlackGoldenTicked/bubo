/**
 * @purpose Render the shared dropdown menu for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI Dropdown/ListBox pair.
 * @deps    React state and effects, the cn helper, and `.bubo-pop`/`.bubo-item` in primitives.css.
 * @gotcha  The trigger is a render prop so callers keep their own markup (a dashed text
 *          link, an icon button, …). We clone it to attach the ref and the aria wiring,
 *          so it must be a plain element that forwards refs — not a custom component
 *          without ref support.
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface MenuItemDef {
  key: string
  label: React.ReactNode
  disabled?: boolean
  /** Renders the row in the danger colour. */
  danger?: boolean
}

export interface MenuTriggerState {
  open: boolean
  toggle: () => void
}

/**
 * The trigger must be a host element (usually <button>) so `cloneElement` can
 * attach the ref and aria props without a custom component opting in.
 */
export type MenuTriggerElement = React.ReactElement<React.ComponentProps<"button">>

export interface MenuProps {
  items: readonly MenuItemDef[]
  onSelect: (key: string) => void
  /** Keys shown as checked; omit for a plain action menu. */
  selectedKeys?: readonly string[]
  trigger: (state: MenuTriggerState) => MenuTriggerElement
  placement?: "bottom-start" | "bottom-end"
  ariaLabel?: string
  className?: string
  menuClassName?: string
}

export function Menu({
  items,
  onSelect,
  selectedKeys,
  trigger,
  placement = "bottom-start",
  ariaLabel,
  className,
  menuClassName,
}: MenuProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)

  const selected = new Set(selectedKeys ?? [])

  React.useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [open])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        setOpen(true)
        setActive(0)
      }
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((current) => {
        let next = current
        for (let i = 0; i < items.length; i += 1) {
          next = (next + step + items.length) % items.length
          if (!items[next]?.disabled) return next
        }
        return current
      })
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      const item = items[active]
      if (item != null && !item.disabled) {
        onSelect(item.key)
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
  }

  const triggerElement = React.cloneElement(trigger({ open, toggle: () => setOpen((v) => !v) }), {
    ref: triggerRef,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-label": ariaLabel,
  })

  return (
    <div
      ref={wrapRef}
      data-slot="menu"
      data-open={open ? "true" : "false"}
      className={cn("relative inline-flex", className)}
      onKeyDown={handleKeyDown}
    >
      {triggerElement}
      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          data-open="true"
          className={cn(
            "bubo-pop bubo-pop-motion absolute top-[calc(100%+6px)] z-[9000] min-w-[168px] p-1.5",
            placement === "bottom-end" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              aria-checked={selectedKeys == null ? undefined : selected.has(item.key)}
              data-selected={selected.has(item.key) ? "true" : "false"}
              disabled={item.disabled}
              onMouseEnter={() => setActive(index)}
              onClick={() => {
                onSelect(item.key)
                setOpen(false)
                triggerRef.current?.focus()
              }}
              className={cn(
                "bubo-item",
                index === active && "bubo-item--active",
                item.danger && "text-[var(--danger)]",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {selected.has(item.key) && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8.5l3.2 3.2L13 5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
