/**
 * @purpose Render the data table renderer UI primitive.
 * @role    Local desktop UI atom shared across feature pages.
 * @deps    React props, CSS tokens, and small formatting helpers.
 * @gotcha  Keep product data fetching out of reusable UI atoms.
 */

import type { ReactNode } from "react"

interface Column {
  label: string
  width?: number | string
  align?: "left" | "right"
}

interface DataTableProps {
  columns: Column[]
  children: ReactNode
}

export function DataTable({ columns, children }: DataTableProps) {
  return (
    <table className="w-full text-[12px] border-collapse">
      <thead>
        <tr>
          {columns.map((col, i) => (
            <th
              key={i}
              className="sticky top-0 z-[1] h-9 border-b border-[var(--hair)] bg-[var(--surface-1)] py-1.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]"
              style={{ width: col.width, textAlign: col.align ?? "left" }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

export function DataTableRow({
  children,
  selected = false,
  interactive = false,
  className = "",
}: {
  children: ReactNode
  selected?: boolean
  /** Pointer rows get a cursor and keyboard affordance; static rows stay quiet. */
  interactive?: boolean
  className?: string
}) {
  return (
    <tr
      aria-selected={interactive ? selected : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`bubo-row border-t border-[var(--hair-3)] ${interactive ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </tr>
  )
}

export function DataTableCell({
  children,
  align = "left",
  truncate = false,
  className = "",
}: {
  children: ReactNode
  align?: "left" | "right"
  truncate?: boolean
  className?: string
}) {
  return (
    <td
      className={`h-[38px] py-2 align-middle tabular-nums text-[var(--ink-2)] ${truncate ? "max-w-0 truncate" : ""} ${className}`}
      style={{ textAlign: align }}
    >
      {children}
    </td>
  )
}
