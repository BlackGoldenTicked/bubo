/**
 * @purpose Render the shared field label for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI label across the renderer.
 * @deps    React props and the cn helper.
 * @gotcha  Keep the label a plain <label>; pairing it with a field is the caller's
 *          job through `htmlFor`, since fields are rendered as siblings.
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface LabelProps extends React.ComponentProps<"label"> {
  /** Paints the label in the danger colour. */
  isInvalid?: boolean
  /** Appends the required marker after the text. */
  isRequired?: boolean
}

export function Label({ className, isInvalid, isRequired, children, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        "block text-[12px] leading-[1.4] text-[var(--ink-3)]",
        isInvalid && "text-[var(--red)]",
        className,
      )}
      {...props}
    >
      {children}
      {isRequired && <span aria-hidden="true"> *</span>}
    </label>
  )
}
