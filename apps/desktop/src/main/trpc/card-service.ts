/**
 * @purpose Declare the runtime-neutral card service consumed by the tRPC router.
 * @role    Boundary between the router and the sidecar's local scan storage.
 * @deps    Shared card contracts and Result.
 * @gotcha  The renderer never sends image bytes: it sends a path picked through the native
 *          dialog, and this service owns copying it into the app's own folder.
 */

import type { Result } from "@bubo/shared"
import type { BuboId, CardImageData, CardImageRefInput, CardSide, CardSummary } from "@bubo/shared/contracts"

export interface AttachCardScanInput {
  cardId: BuboId
  side: CardSide
  /** Filled by the renderer bridge after the native file dialog resolves. */
  filePath?: string
}

export interface CardService {
  attachScan(input: AttachCardScanInput): Promise<Result<CardSummary>>
  readScan(input: CardImageRefInput): Promise<Result<CardImageData>>
  removeScan(input: CardImageRefInput): Promise<Result<CardSummary>>
}
