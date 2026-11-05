/**
 * @purpose Provide bubo's curated icon set on top of QingIcon (Apache-2.0).
 * @role    Single semantic icon surface for shared primitives and renderer surfaces.
 * @deps    qingicon-react glyph components and the shared `cn` class helper.
 * @gotcha  Always go through `AppIcon` with a semantic `name`; importing QingIcon glyphs
 *          directly at a call site would let size, stroke, and colour drift per screen.
 *          Icons are decorative by default — pass `label` only when no nearby text says
 *          the same thing, so screen readers do not repeat the label.
 */

import type { ComponentType } from "react"
import {
  QiArrowDownRight,
  QiArrowUpRight,
  QiBank,
  QiCalendar,
  QiChartLineUp,
  QiChartPie,
  QiChevronRight,
  QiCircleCheck,
  QiCirclePlus,
  QiClock,
  QiDeleteTrash,
  QiEye,
  QiEyeOff,
  QiFolderOpen,
  QiInbox,
  QiInformation,
  QiLayoutDashboard,
  QiMic,
  QiReceipt,
  QiRepeat,
  QiSearch,
  QiSettings,
  QiTriangleWarning,
  QiWalletCards,
} from "qingicon-react"
import { cn } from "../../lib/utils"

/** Glyph components keep QingIcon's permissive prop surface. */
type Glyph = ComponentType<{
  size?: number | string
  strokeWidth?: number | string
  className?: string
  variant?: "line" | "fill" | "fill-small" | "fill-regular" | "fill-large"
  [key: string]: unknown
}>

/** Semantic names only: the renderer never names a specific glyph. */
const GLYPHS = {
  dashboard: QiLayoutDashboard,
  assets: QiWalletCards,
  investments: QiChartLineUp,
  cashflow: QiReceipt,
  subscriptions: QiRepeat,
  loans: QiBank,
  budget: QiChartPie,
  settings: QiSettings,
  voice: QiMic,
  eye: QiEye,
  eyeOff: QiEyeOff,
  empty: QiInbox,
  search: QiSearch,
  add: QiCirclePlus,
  remove: QiDeleteTrash,
  info: QiInformation,
  warning: QiTriangleWarning,
  check: QiCircleCheck,
  clock: QiClock,
  import: QiFolderOpen,
  calendar: QiCalendar,
  income: QiArrowDownRight,
  chevronRight: QiChevronRight,
  expense: QiArrowUpRight,
} as const satisfies Record<string, Glyph>

export type AppIconName = keyof typeof GLYPHS

interface AppIconProps {
  name: AppIconName
  /** Any CSS length; defaults to 1em so the surrounding text size drives the icon. */
  size?: number | string
  strokeWidth?: number | string
  variant?: "line" | "fill"
  className?: string
  /** Accessible name; omit for decorative icons that sit next to their own text. */
  label?: string
}

export function AppIcon({
  name,
  size = "1em",
  strokeWidth = 1.6,
  variant = "line",
  className,
  label,
}: AppIconProps) {
  const Glyph = GLYPHS[name]
  return (
    <Glyph
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
      variant={variant}
      className={cn("shrink-0", className)}
    />
  )
}
