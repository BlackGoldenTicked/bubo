/**
 * @purpose Render a centered empty-state block with an optional call to action.
 * @role    Renderer-local UI primitive shared by list and panel surfaces.
 * @deps    React, the @bubo/ui Button primitive, TanStack Router Link, and CSS tokens.
 * @gotcha  Keep the copy concrete about the next user action; no implementation details.
 */

import type { ReactNode } from "react"
import { Button } from "@bubo/ui"
import { Link } from "@tanstack/react-router"

interface EmptyAction {
  label: string
  /** Router target; when absent the action renders as a plain button with onClick. */
  to?: string
  onClick?: () => void
}

interface EmptyStateProps {
  title: string
  hint?: ReactNode
  action?: EmptyAction
  /** Compact variant for small panes and drawers. */
  compact?: boolean
  className?: string
}

export function EmptyState({
  title,
  hint,
  action,
  compact = false,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center text-center ${compact ? "gap-1 py-8" : "gap-1.5 py-12"} ${className}`}
    >
      <div
        className={`${compact ? "text-[12px]" : "text-[12.5px]"} font-medium text-[var(--ink-3)]`}
      >
        {title}
      </div>
      {hint && (
        <div className="max-w-[320px] text-[11px] leading-relaxed text-[var(--ink-4)]">{hint}</div>
      )}
      {action &&
        (action.to ? (
          <Link
            to={action.to}
            className="mt-1.5 text-[11px] text-[var(--accent)] transition-opacity hover:opacity-75"
          >
            {action.label}
          </Link>
        ) : (
          <Button size="sm" variant="secondary" className="mt-1.5" onPress={action.onClick}>
            {action.label}
          </Button>
        ))}
    </div>
  )
}
