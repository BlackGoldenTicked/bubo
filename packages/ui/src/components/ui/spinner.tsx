/**
 * @purpose Render the shared loading spinner for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI spinner across the renderer.
 * @deps    The cn helper and `.bubo-spinner` in primitives.css.
 * @gotcha  Size comes from the `size` prop in pixels, not Tailwind, because the
 *          ring is a border — scaling it with `w-*` would not scale the stroke.
 */

import { cn } from "../../lib/utils"

export interface SpinnerProps {
  /** Ring diameter in pixels. */
  size?: number
  className?: string
  /** Accessible name; defaults to a generic loading label. */
  label?: string
}

export function Spinner({ size = 16, className, label = "加载中" }: SpinnerProps) {
  return (
    <span
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn("bubo-spinner shrink-0", className)}
      style={{ width: size, height: size }}
    />
  )
}
