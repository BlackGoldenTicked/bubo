/**
 * @purpose Scroll container mirroring @bubo/ui's ScrollArea for the app mock.
 * @role    Gives the mocked window its own thin-scrollbar scroll region.
 * @gotcha  Scrollbar styling lives under .bubo-scroll-area in globals.css.
 */

import type { ReactNode } from "react"

export function ScrollArea({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`bubo-scroll-area min-h-0 overflow-auto overscroll-contain ${className}`}>
      {children}
    </div>
  )
}
