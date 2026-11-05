/**
 * @purpose Render a signed delta (P&L, change) with one colour and arrow convention.
 * @role    Renderer-local numeric atom for asset, position, and contract surfaces.
 * @deps    @bubo/ui AppIcon and CSS tokens.
 * @gotcha  Green means "up" and red means "down" here because that is this product's existing
 *          semantic (accent = positive money, red = loss). Do not swap to the stock-market
 *          red-up/green-down convention without a product decision. The arrow repeats the sign,
 *          so pass `arrow={false}` only where space is genuinely too tight.
 */

import type { ReactNode } from "react"
import { AppIcon } from "@bubo/ui"

interface DeltaTextProps {
  /** Signed number that drives both the colour and the arrow direction. */
  value: number
  children: ReactNode
  arrow?: boolean
  className?: string
}

export function DeltaText({ value, children, arrow = true, className = "" }: DeltaTextProps) {
  const up = value >= 0
  return (
    <span
      className={`bubo-num inline-flex items-center gap-0.5 ${
        up ? "text-[var(--accent)]" : "text-[var(--red)]"
      } ${className}`}
    >
      {arrow && <AppIcon name={up ? "trendUp" : "trendDown"} size={11} />}
      {children}
    </span>
  )
}
