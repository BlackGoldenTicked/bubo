/**
 * @purpose Render the section title renderer UI primitive.
 * @role    Local desktop UI atom shared across feature pages.
 * @deps    React props, @bubo/ui AppIcon, and CSS tokens.
 * @gotcha  The icon is a scanning aid, not decoration: pick the domain icon (assets, cashflow,
 *          budget…) so repeated section titles stay distinguishable at a glance.
 */

import type { ReactNode } from "react"
import { AppIcon, type AppIconName } from "@bubo/ui"

interface SectionTitleProps {
  children: ReactNode
  /** Optional domain glyph shown ahead of the label. */
  icon?: AppIconName
  className?: string
}

export function SectionTitle({ children, icon, className = "" }: SectionTitleProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ink)] ${className}`}
    >
      {icon && <AppIcon name={icon} size={13} className="text-[var(--ink-4)]" />}
      {children}
    </span>
  )
}
