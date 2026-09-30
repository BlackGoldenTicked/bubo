/**
 * @purpose Render the shared pending/error/ready states for a query result.
 * @role    Renderer-local UI primitive so pages distinguish loading, failure, and data.
 * @deps    React, the @bubo/ui Button primitive, and local UI primitives.
 * @gotcha  Accepts a structural query shape (isPending/isError/error/refetch) so it
 *          stays decoupled from TanStack Query internals; pass the query object itself.
 */

import type { ReactNode } from "react"
import { Button } from "@bubo/ui"
import { Dim } from "./Dim"

interface QueryLike {
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

interface QueryStateProps {
  query: QueryLike
  /** Replaces the default skeleton while the query is pending. */
  pending?: ReactNode
  /** Skeleton bar count used by the default pending state. */
  skeletonRows?: number
  /** Applies to the default skeleton and the error panel. */
  className?: string
  children: ReactNode
}

function errorDescription(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/** Pulsing placeholder bars sized like a compact list or stat block. */
export function QuerySkeleton({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="h-4 animate-pulse rounded-[4px] bg-[var(--hair-3)]"
          style={{ width: index % 3 === 2 ? "62%" : "100%" }}
        />
      ))}
    </div>
  )
}

/** Centered failure panel with an optional retry action. */
export function QueryErrorState({
  error,
  onRetry,
  className = "",
}: {
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center gap-2 py-10 text-center ${className}`}>
      <div className="text-[12.5px] font-medium text-[var(--ink-2)]">加载失败</div>
      <Dim className="max-w-[380px] text-[11.5px] leading-relaxed">{errorDescription(error)}</Dim>
      {onRetry && (
        <Button size="sm" variant="secondary" className="mt-1" onPress={onRetry}>
          重试
        </Button>
      )}
    </div>
  )
}

export function QueryState({
  query,
  pending,
  skeletonRows,
  className = "",
  children,
}: QueryStateProps) {
  if (query.isPending) {
    return <>{pending ?? <QuerySkeleton rows={skeletonRows} className={className} />}</>
  }
  if (query.isError) {
    return (
      <QueryErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        className={className}
      />
    )
  }
  return <>{children}</>
}
