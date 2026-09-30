/**
 * @purpose Render the shared checkbox row for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI checkbox across the renderer.
 * @deps    React props, the cn helper, and `.bubo-check` in primitives.css.
 * @gotcha  Uses a real <input type="checkbox"> inside a <label> so form state,
 *          indeterminate, and keyboard activation stay native. Children are the
 *          row content — pass plain markup, not compound sub-components.
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface CheckboxProps extends Omit<
  React.ComponentProps<"input">,
  "type" | "onChange" | "value" | "children"
> {
  /** Current checked state. */
  isSelected?: boolean
  /** Fires with the next state; replaces the raw change event. */
  onChange?: (next: boolean) => void
  /** Compatibility alias for `disabled`. Prefer `disabled` in new code. */
  isDisabled?: boolean
  /** Row content rendered beside the mark. */
  children?: React.ReactNode
  /** Accepted for HeroUI parity and intentionally ignored. */
  variant?: string
}

export function Checkbox({
  isSelected = false,
  onChange,
  isDisabled,
  disabled,
  className,
  children,
  variant: _variant,
  ...props
}: CheckboxProps) {
  return (
    <label data-slot="checkbox" className={cn("bubo-check", className)}>
      <input
        type="checkbox"
        className="bubo-check__box"
        checked={isSelected}
        disabled={disabled ?? isDisabled}
        onChange={(event) => onChange?.(event.target.checked)}
        {...props}
      />
      {children != null && <span className="min-w-0 flex-1">{children}</span>}
    </label>
  )
}
