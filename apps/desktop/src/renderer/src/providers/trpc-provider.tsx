/**
 * @purpose Provide trpc provider wiring for renderer React context.
 * @role    Top-level renderer provider used by App.
 * @deps    React context, tRPC client, and the Tauri renderer bridge.
 * @gotcha  Keep provider setup browser-safe and typed against window.bubo. The jotai store is
 *          the shared `appStore`, so imperative writes outside React reach the same atoms.
 */

import { useEffect, type ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { Provider as JotaiProvider } from "jotai"
import { appStore } from "@/lib/state/store"
import { queryClient } from "@/lib/trpc"

export function TRPCProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    return window.bubo.onLedgerChanged(() => {
      void queryClient.invalidateQueries()
    })
  }, [])

  return (
    <JotaiProvider store={appStore}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </JotaiProvider>
  )
}
