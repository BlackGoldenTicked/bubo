/**
 * @purpose Render the shared text input and textarea primitives for both visual styles.
 * @role    Hand-drawn replacement for the HeroUI input across the renderer.
 * @deps    React props, the cn helper, the Label atom, and `.bubo-field` in primitives.css.
 * @gotcha  `ref` must land on the real <input> so react-hook-form `register()` works.
 *          HeroUI-only props (`variant`, `label` placement) are accepted but ignored
 *          or re-implemented here; never style the radius inline.
 */

import * as React from "react"
import { cn } from "../../lib/utils"
import { Label } from "./label"

const SIZE_CLASS = {
  sm: "h-7 px-2 text-[12px]",
  md: "h-[34px] px-[10px] text-[13px]",
  lg: "h-10 px-3 text-[13px]",
} as const

export type FieldSize = keyof typeof SIZE_CLASS

export interface InputProps extends Omit<React.ComponentProps<"input">, "size"> {
  size?: FieldSize
  /** Compatibility alias for `disabled`. Prefer `disabled` in new code. */
  isDisabled?: boolean
  /** Paints the danger ring; pair with a visible error message. */
  isInvalid?: boolean
  /** Optional label rendered above the field. */
  label?: React.ReactNode
  labelClassName?: string
  /** Accepted for HeroUI parity and intentionally ignored. */
  variant?: string
}

export function Input({
  size = "md",
  className,
  isDisabled,
  disabled,
  isInvalid,
  label,
  labelClassName,
  variant: _variant,
  ...props
}: InputProps) {
  const field = (
    <input
      data-slot="input"
      aria-invalid={isInvalid ? true : undefined}
      disabled={disabled ?? isDisabled}
      className={cn(
        "bubo-field w-full",
        SIZE_CLASS[size],
        isInvalid && "bubo-field--invalid",
        className,
      )}
      {...props}
    />
  )

  if (label == null) return field

  return (
    <div className="flex flex-col gap-1.5">
      <Label className={labelClassName}>{label}</Label>
      {field}
    </div>
  )
}

export interface TextareaProps extends Omit<React.ComponentProps<"textarea">, "size"> {
  /** Compatibility alias for `disabled`. Prefer `disabled` in new code. */
  isDisabled?: boolean
  isInvalid?: boolean
  label?: React.ReactNode
  labelClassName?: string
  variant?: string
}

export function Textarea({
  className,
  isDisabled,
  disabled,
  isInvalid,
  label,
  labelClassName,
  variant: _variant,
  rows = 3,
  ...props
}: TextareaProps) {
  const field = (
    <textarea
      data-slot="textarea"
      rows={rows}
      aria-invalid={isInvalid ? true : undefined}
      disabled={disabled ?? isDisabled}
      className={cn(
        "bubo-field w-full px-[10px] py-2 text-[13px] leading-[1.6]",
        isInvalid && "bubo-field--invalid",
        className,
      )}
      {...props}
    />
  )

  if (label == null) return field

  return (
    <div className="flex flex-col gap-1.5">
      <Label className={labelClassName}>{label}</Label>
      {field}
    </div>
  )
}
