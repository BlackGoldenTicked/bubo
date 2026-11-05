/**
 * @purpose Render the stat block renderer UI primitive.
 * @role    Local desktop UI atom shared across feature pages.
 * @deps    React props, @bubo/ui AppIcon, and CSS tokens.
 * @gotcha  Values use tabular figures so columns of amounts line up, and the value sits a step
 *          stronger than its label: label is metadata, the number is the content.
 */

import type { ReactNode } from "react"
import { AppIcon, type AppIconName } from "@bubo/ui"

interface StatBlockProps {
  label: string
  value: ReactNode
  /** Optional glyph next to the label; it never replaces the label text. */
  icon?: AppIconName
  className?: string
}

export function StatBlock({ label, value, icon, className = "" }: StatBlockProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-1.5 text-[11px] leading-none text-[var(--ink-3)]">
        {icon && <AppIcon name={icon} size={12} className="text-[var(--ink-4)]" />}
        {label}
      </div>
      <div className="text-[14px] font-semibold leading-none tracking-tight tabular-nums text-[var(--ink)]">
        {value}
      </div>
    </div>
  )
}
