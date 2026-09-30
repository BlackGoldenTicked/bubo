/**
 * @purpose Provide the small stroke icon set used by the shared primitives.
 * @role    Hand-drawn replacement for the HeroUI icon exports.
 * @deps    React props only.
 * @gotcha  All glyphs share a 16×16 viewBox and inherit `currentColor`, so size them
 *          with Tailwind (`size-*`) and colour them with a text token. Keep them
 *          decorative by default — callers pass `aria-hidden` when the meaning is
 *          already carried by adjacent text.
 */

import * as React from "react"

type IconProps = React.ComponentProps<"svg">

const BASE: IconProps = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  width: "1em",
  height: "1em",
}

export function InfoIcon(props: IconProps) {
  return (
    <svg data-slot="icon-info" {...BASE} {...props}>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 7.2v3.6" />
      <path d="M8 4.9h.01" strokeWidth={2} />
    </svg>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <svg data-slot="icon-close" {...BASE} {...props}>
      <path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2" />
    </svg>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg data-slot="icon-chevron-down" {...BASE} {...props}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg data-slot="icon-chevron-right" {...BASE} {...props}>
      <path d="M6 3.5l4.5 4.5L6 12.5" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg data-slot="icon-check" {...BASE} {...props}>
      <path d="M3 8.5l3.2 3.2L13 5" strokeWidth={2} />
    </svg>
  )
}
