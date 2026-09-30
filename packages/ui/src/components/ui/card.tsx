/**
 * @purpose Render the shared card and panel surfaces for both visual styles.
 * @role    Hand-drawn panel primitive replacing ad-hoc bordered containers.
 * @deps    React props, the cn helper, and the `.bubo-card` rules in primitives.css.
 * @gotcha  Lumno paints an inset highlight ring through ::after, so a child that has to
 *          cover the card edge needs its own stacking context (relative plus z-10).
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface CardProps extends React.ComponentProps<"div"> {
  /**
   * Brand wash behind the card contents — crx-ui's `.l-feature-card::before` tint.
   * Reserve it for hero and empty-state panels; ordinary data panels stay plain.
   */
  tinted?: boolean
}

export function Card({ className, tinted = false, ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn("bubo-card", tinted && "bubo-card--tinted", className)}
      {...props}
    />
  )
}

/** Title row inside a Card; keeps heading rhythm identical across pages. */
export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("relative flex items-center gap-2 px-4 pt-3.5 pb-2", className)}
      {...props}
    />
  )
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-body" className={cn("relative px-4 pb-4", className)} {...props} />
}
