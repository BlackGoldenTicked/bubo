/**
 * @purpose Render the shared toggle switch for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI switch across the renderer.
 * @deps    React props, the cn helper, and `.bubo-switch` in primitives.css.
 * @gotcha  Track shape (flat rectangle vs gradient pill) lives in primitives.css;
 *          the component only owns the `aria-checked` contract and click handling.
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface SwitchProps extends Omit<React.ComponentProps<"button">, "onChange" | "children"> {
  /** Current on/off state. */
  isSelected?: boolean
  /** Fires with the next state on click, Space, or Enter. */
  onChange?: (next: boolean) => void
  /** Compatibility alias for `disabled`. Prefer `disabled` in new code. */
  isDisabled?: boolean
}

export function Switch({
  isSelected = false,
  onChange,
  isDisabled,
  disabled,
  className,
  type = "button",
  ...props
}: SwitchProps) {
  return (
    <button
      data-slot="switch"
      type={type}
      role="switch"
      aria-checked={isSelected}
      disabled={disabled ?? isDisabled}
      onClick={() => onChange?.(!isSelected)}
      className={cn("bubo-switch", className)}
      {...props}
    >
      <span className="bubo-switch__track">
        <span className="bubo-switch__thumb" />
      </span>
    </button>
  )
}
