/**
 * @purpose Provide renderer trpc helper functions.
 * @role    Shared utility module for React feature code.
 * @deps    Browser-safe TypeScript utilities and local domain types.
 * @gotcha  Keep Node, Rust, and SQLite access behind the Tauri/tRPC bridge.
 */

import { MutationCache, QueryClient } from "@tanstack/react-query"
import { createTRPCClient } from "@trpc/client"
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query"
import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "../../../main/trpc/router"
import { installQueryClientPerfLogger } from "./debug/perf"
import { ipcTRPCLink } from "./ipc-trpc-link"
import { reportActionError } from "./reportError"

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    // One global failure path: any mutation rejection surfaces as a toast, and
    // reportActionError dedupes errors that also pass through a caller.
    onError: (error) => reportActionError(error),
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30_000,
    },
  },
})

installQueryClientPerfLogger(queryClient)

export const trpcClient = createTRPCClient<AppRouter>({
  links: [ipcTRPCLink()],
})

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
})

export type RouterOutputs = inferRouterOutputs<AppRouter>
