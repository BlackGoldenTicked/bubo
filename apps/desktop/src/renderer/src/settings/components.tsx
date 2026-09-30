/**
 * @purpose Shared settings menu-item building blocks (group labels, rows, controls).
 * @role    Renderer UI primitives reused across the settings surfaces.
 * @deps    React and the @bubo/ui Card, Segmented, and Switch primitives.
 * @gotcha  RowShell is the single source of row sizing — keep every settings row on it.
 */

import type { CSSProperties, ReactNode } from "react"
import { Card, Segmented, Switch } from "@bubo/ui"

const CHEVRON = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 3l5 5-5 5" />
  </svg>
)

/**
 * Shared row metrics — the single source of truth for settings row sizing.
 * Plain Tailwind utilities so every row keeps the same height and rhythm.
 */
const ROW_CLASS = "flex items-center gap-[18px] py-[15px]"

function borderClass(first?: boolean): string {
  return first ? "" : "border-t border-[var(--hair-3)]"
}

export function GroupLabel({ children }: { children: string }) {
  return (
    <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[.1em] text-[var(--ink-4)]">
      {children}
    </div>
  )
}

/** A settings group: top margin + group label + its rows inside a card surface. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-[30px]">
      <GroupLabel>{title}</GroupLabel>
      <Card className="overflow-hidden px-4">{children}</Card>
    </div>
  )
}

/**
 * Row container that owns the shared sizing (padding / divider / flex). Every
 * settings row — Row, LinkRow, ledger rows — renders through this so heights and
 * separators stay consistent. `gap` is runtime-dynamic so it stays inline.
 */
export function RowShell({
  first,
  gap,
  className,
  style,
  children,
}: {
  first?: boolean
  gap?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div
      className={`${ROW_CLASS} ${borderClass(first)} ${className ?? ""}`}
      style={gap != null ? { gap, ...style } : style}
    >
      {children}
    </div>
  )
}

export function Row({
  label,
  sub,
  first,
  children,
}: {
  label: string
  sub?: string
  first?: boolean
  children: ReactNode
}) {
  return (
    <RowShell first={first}>
      <div className="min-w-0">
        <div className="text-[13.5px] text-[var(--ink)]">{label}</div>
        {sub && (
          <div className="mt-[3px] text-[11.5px] leading-normal text-[var(--ink-3)]">{sub}</div>
        )}
      </div>
      <div className="ml-auto shrink-0">{children}</div>
    </RowShell>
  )
}

export function LinkRow({
  children,
  note,
  danger,
  onClick,
}: {
  children: string
  note?: string
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`${ROW_CLASS} ${borderClass()} w-full cursor-pointer bg-transparent text-left text-[13.5px] transition-colors ${
        danger
          ? "text-[var(--danger)] hover:opacity-80"
          : "text-[var(--ink)] hover:text-[var(--accent)]"
      }`}
    >
      {children}
      {note && (
        <span className="ml-auto whitespace-nowrap text-[11.5px] font-normal text-[var(--ink-4)]">
          {note}
        </span>
      )}
      <span className={`${note ? "" : "ml-auto"} text-[var(--ink-4)]`}>{CHEVRON}</span>
    </button>
  )
}

export function Toggle({
  on,
  onChange,
  ariaLabel,
}: {
  on: boolean
  onChange: (v: boolean) => void
  ariaLabel?: string
}) {
  return <Switch isSelected={on} onChange={onChange} aria-label={ariaLabel} />
}

export function SegTabs({
  opts,
  val,
  onChange,
}: {
  opts: string[]
  val: string
  onChange: (v: string) => void
}) {
  return (
    <Segmented
      options={opts.map((option) => ({ key: option, label: option }))}
      value={val}
      onChange={onChange}
    />
  )
}
