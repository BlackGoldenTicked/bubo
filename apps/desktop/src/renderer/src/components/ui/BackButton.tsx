/**
 * @purpose Unified back affordance for detail pages and in-place panels.
 * @role    Renderer-local UI atom: one ghost button + arrow, two variants (text / icon-only).
 * @deps    The @bubo/ui Button primitive.
 * @gotcha  Always router-agnostic — pass `onBack` (page callers wrap their own navigate()).
 *          With `label` it renders "← label"; without it, an icon-only button for tight panels.
 *          Never set the radius inline — the active style owns the button shape.
 */

import { Button } from "@bubo/ui"

interface BackButtonProps {
  onBack: () => void
  /** Text variant: renders the arrow + this label. Omit for an icon-only button. */
  label?: string
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M9 2L4 7L9 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BackButton({ onBack, label }: BackButtonProps) {
  if (label == null) {
    return (
      <Button
        iconOnly
        size="xs"
        variant="ghost"
        aria-label="返回"
        onPress={onBack}
        className="-ml-1 size-6 text-[var(--ink-4)]"
      >
        <ArrowIcon />
      </Button>
    )
  }
  return (
    <Button
      size="xs"
      variant="ghost"
      onPress={onBack}
      className="-ml-2 gap-1 text-[12px] font-medium text-[var(--ink-4)]"
    >
      <ArrowIcon />
      {label}
    </Button>
  )
}
