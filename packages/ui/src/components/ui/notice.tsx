/**
 * @purpose Render the shared inline notice banner for both visual styles.
 * @role    Hand-drawn equivalent of the crx-ui page notice, used for contextual hints.
 * @deps    React props, the cn helper, the Button atom, and `.bubo-notice` in primitives.css.
 * @gotcha  This is an in-flow banner, not a toast — toasts stay in simple-toast.tsx.
 *          Keep it non-dismissible unless the caller passes `onDismiss`.
 */

import * as React from "react"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import { InfoIcon } from "./icons"

export interface NoticeProps extends React.ComponentProps<"div"> {
  /** Optional leading icon; defaults to the info glyph. Pass `null` to hide. */
  icon?: React.ReactNode
  /** Optional trailing action button label. */
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
  children: React.ReactNode
}

export function Notice({
  icon,
  actionLabel,
  onAction,
  onDismiss,
  className,
  children,
  ...props
}: NoticeProps) {
  return (
    <div data-slot="notice" role="status" className={cn("bubo-notice", className)} {...props}>
      <span
        className="inline-flex shrink-0 items-center justify-center text-[var(--accent)]"
        aria-hidden="true"
      >
        {icon === undefined ? <InfoIcon className="size-[15px]" /> : icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {actionLabel != null && onAction != null && (
        <Button size="sm" variant="secondary" className="shrink-0" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {onDismiss != null && (
        <button
          type="button"
          aria-label="关闭提示"
          onClick={onDismiss}
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--ink-4)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      )}
    </div>
  )
}
