/**
 * @purpose Render the shared side drawer for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI drawer across the renderer.
 * @deps    React effects, createPortal, the cn helper, and `.bubo-drawer` in primitives.css.
 * @gotcha  Mirrors the Modal contract (open/onClose/labelledBy) so a panel can swap
 *          between the two without rewriting its call site. Escape and backdrop click
 *          both close it; pass `dismissable={false}` while a mutation is in flight.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "../../lib/utils"

const EXIT_MS = 220

export interface DrawerProps {
  open: boolean
  onClose: () => void
  /** Allow Escape and backdrop click to close. */
  dismissable?: boolean
  /** id of the heading that names this drawer. */
  labelledBy?: string
  className?: string
  children: React.ReactNode
}

export function Drawer({
  open,
  onClose,
  dismissable = true,
  labelledBy,
  className,
  children,
}: DrawerProps) {
  const [mounted, setMounted] = React.useState(open)

  // Keep the panel mounted through the slide-out, then drop it from the tree.
  React.useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  React.useEffect(() => {
    if (!open || !dismissable) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, dismissable, onClose])

  if (!mounted) return null

  return createPortal(
    <div
      data-slot="drawer-root"
      className={cn(
        "fixed inset-0 z-[10500] flex justify-end bg-[rgba(15,23,42,0.34)] transition-opacity duration-200",
        !open && "pointer-events-none opacity-0",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissable) onClose()
      }}
    >
      <div
        data-slot="drawer"
        data-open={open ? "true" : "false"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn("bubo-drawer w-full max-w-[420px]", className)}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex shrink-0 items-start gap-3 border-b border-[var(--hair-2)] px-5 py-4",
        className,
      )}
      {...props}
    />
  )
}

export function DrawerHeading({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="drawer-heading"
      className={cn(
        "min-w-0 flex-1 text-[15px] font-semibold tracking-[-0.01em] text-[var(--ink)]",
        className,
      )}
      {...props}
    />
  )
}

export function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}
      {...props}
    />
  )
}

export function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t border-[var(--hair-2)] px-5 py-4",
        className,
      )}
      {...props}
    />
  )
}
