/**
 * @purpose Create shared tRPC primitives for the Tauri data router.
 * @role    Runtime-neutral infrastructure used by the bundled Node sidecar.
 * @deps    @trpc/server and the ledger service contract.
 * @gotcha  Keep this file framework glue only; product logic belongs in @bubo/api.
 */

import { initTRPC } from "@trpc/server"
import type { BuboApi } from "@bubo/api"
import type { LedgerService } from "./ledger-service"
import type { VoiceService } from "./voice-service"

export interface TrpcContext {
  api: BuboApi
  ledgers: LedgerService
  voice: VoiceService
}

const t = initTRPC.context<TrpcContext>().create({ isServer: true })

export const router = t.router
export const publicProcedure = t.procedure
