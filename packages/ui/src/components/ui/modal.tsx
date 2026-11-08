/**
 * @purpose Render a hand-drawn modal dialog with backdrop, focus trap, and escape handling.
 * @role    Shared overlay primitive replacing the HeroUI Modal across the renderer.
 * @deps    React DOM portals, the cn helper, and the `.bubo-pop` rules in primitives.css.
 * @gotcha  Focus is trapped while open and restored to the previously focused element on
 *          close. Callers must not add their own portal or the stacking order breaks.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "../../lib/utils"

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Matches the panel exit window so the closing frame is not cut off. */
const EXIT_MS = 200

/**
 * A backdrop press that belongs to the gesture which opened the dialog must not close it.
 * The opening press can still be in flight when the overlay appears under the pointer.
 */
const OPEN_GUARD_MS = 250

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** Allow backdrop clicks and Escape to close. Turn off while an action is in flight. */
  dismissable?: boolean
  /** id of the heading that labels the dialog. */
  labelledBy?: string
  /** Extra classes for the dialog panel itself, not the backdrop. */
  className?: string
  children: React.ReactNode
}

export function Modal({
  open,
  onClose,
  dismissable = true,
  labelledBy,
  className,
  children,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const openedAtRef = React.useRef(0)
  const [exiting, setExiting] = React.useState(false)

  // The portal is part of the same commit as `open`, not a follow-up effect: a deferred
  // mount costs a render pass and reads as "the first click did nothing" on this shell.
  const shouldRender = open || exiting

  // Keep the panel mounted briefly after close so the exit transition can play.
  React.useEffect(() => {
    if (open) {
      setExiting(true)
      return
    }
    const timer = window.setTimeout(() => setExiting(false), EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  // Focus moves into the dialog when it opens and returns to the trigger when it closes.
  React.useEffect(() => {
    if (!open) return
    openedAtRef.current = performance.now()
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()
    return () => {
      previous?.focus()
    }
  }, [open])

  // Escape closes; Tab cycles inside the panel.
  React.useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!dismissable) return
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, dismissable, onClose])

  if (!shouldRender) return null

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[11000] flex items-center justify-center bg-[rgba(15,23,42,0.42)] p-6",
        !open && "pointer-events-none opacity-0",
      )}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (!dismissable) return
        // Ignore the tail of the press that opened the dialog.
        if (performance.now() - openedAtRef.current < OPEN_GUARD_MS) return
        onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-open={open ? "true" : "false"}
        className={cn("bubo-pop bubo-pop-motion w-full max-w-[420px] outline-none", className)}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function ModalHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-start gap-3 px-5 pt-4 pb-2", className)} {...props} />
}

export function ModalHeading({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-[15px] font-semibold text-[var(--ink)]", className)} {...props} />
}

export function ModalBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 py-2", className)} {...props} />
}

export function ModalFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 px-5 pt-3 pb-4", className)}
      {...props}
    />
  )
}
