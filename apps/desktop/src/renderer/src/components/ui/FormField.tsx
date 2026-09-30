/**
 * @purpose Provide small form field helpers compatible with react-hook-form layouts.
 * @role    Renderer-local form UI primitive for validation labels and errors.
 * @deps    React children and the @bubo/ui Label primitive.
 * @gotcha  Keep this wrapper thin — the field itself owns its own border and focus ring.
 */

import type { CSSProperties, ReactNode } from "react"
import { Label } from "@bubo/ui"

interface FormFieldProps {
  label: string
  className?: string
  labelClassName?: string
  labelStyle?: CSSProperties
  error?: string
  required?: boolean
  children: ReactNode
}

export function FormField({
  label,
  className,
  labelClassName,
  labelStyle,
  error,
  required,
  children,
}: FormFieldProps) {
  const defaultLabelStyle =
    labelClassName == null
      ? {
          fontSize: 12,
          color: "var(--ink-3)",
          marginBottom: 6,
          display: "block",
        }
      : undefined

  return (
    <div className={className}>
      <Label
        isInvalid={Boolean(error)}
        isRequired={required}
        className={labelClassName}
        style={{ ...defaultLabelStyle, ...labelStyle }}
      >
        {label}
      </Label>
      {children}
      {error && (
        <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.4, color: "var(--red)" }}>
          {error}
        </div>
      )}
    </div>
  )
}
