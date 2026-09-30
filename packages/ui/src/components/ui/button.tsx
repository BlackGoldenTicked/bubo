/**
 * @purpose Render the shared button primitive for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI button across the renderer.
 * @deps    React props, the cn helper, and the `.bubo-btn` rules in primitives.css.
 * @gotcha  Form (radius, gradient, inset highlight, press motion) lives in primitives.css
 *          keyed on `[data-style]`; keep only layout and spacing in the classes here.
 *          Never set `borderRadius` inline on a Button — it defeats the Lumno pill.
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-soft"
export type ButtonSize = "xs" | "sm" | "md" | "lg"

export interface ButtonProps extends Omit<React.ComponentProps<"button">, "onPress"> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Square icon-only button; always pair with `aria-label`. */
  iconOnly?: boolean
  /**
   * Compatibility alias for `onClick`, kept so HeroUI call sites migrate by
   * swapping the import only. Prefer `onClick` in new code.
   */
  onPress?: (event: React.MouseEvent<HTMLButtonElement>) => void
  /** Compatibility alias for `disabled`. Prefer `disabled` in new code. */
  isDisabled?: boolean
}

export function Button({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  className,
  type = "button",
  onPress,
  onClick,
  isDisabled,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      type={type}
      disabled={disabled ?? isDisabled}
      onClick={(event) => {
        onClick?.(event)
        onPress?.(event)
      }}
      className={cn(
        "bubo-btn",
        `bubo-btn--${variant}`,
        `bubo-btn--${size}`,
        iconOnly && "bubo-btn--icon aspect-square",
        className,
      )}
      {...props}
    />
  )
}
