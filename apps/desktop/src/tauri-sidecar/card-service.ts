/**
 * @purpose Implement card scan storage inside the Tauri Node sidecar.
 * @role    Sidecar service glue between the card API facade and the local image folder.
 * @deps    @bubo/api card facade, the card image store, and shared contracts.
 * @gotcha  Copy the file, then write metadata. If the metadata write fails, delete the copy so
 *          no orphan scan is left behind, and never delete a file before its row is gone.
 */

import type { BuboApi } from "@bubo/api"
import type { Result } from "@bubo/shared"
import type { CardImageData, CardImageRefInput, CardSummary } from "@bubo/shared/contracts"
import type { AttachCardScanInput, CardService } from "../main/trpc/card-service"
import type { CardImageStore } from "./card-image-store"

function fail<T = never>(message: string): Result<T> {
  return { success: false, error: message }
}

export class SidecarCardService implements CardService {
  constructor(
    private readonly options: {
      images: CardImageStore
      getApi: () => BuboApi
    },
  ) {}

  async attachScan(input: AttachCardScanInput): Promise<Result<CardSummary>> {
    const filePath = input.filePath?.trim() ?? ""
    if (filePath.length === 0) return fail("没有选择图片")

    const api = this.options.getApi()
    const cardResult = await api.getCard({ id: input.cardId })
    if (!cardResult.success) return cardResult
    const card = cardResult.data
    if (!card) return fail("卡片不存在")

    let imported
    try {
      imported = this.options.images.importScan({
        cardId: String(input.cardId),
        side: input.side,
        sourcePath: filePath,
      })
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }

    const saved = await api.saveCardImage({
      cardId: input.cardId,
      side: input.side,
      fileName: imported.fileName,
      mimeType: imported.mimeType,
      byteSize: imported.byteSize,
    })
    if (!saved.success) {
      this.options.images.removeScan(imported.fileName)
      return saved
    }
    return saved
  }

  async readScan(input: CardImageRefInput): Promise<Result<CardImageData>> {
    const api = this.options.getApi()
    const cardResult = await api.getCard({ id: input.cardId })
    if (!cardResult.success) return cardResult
    const image = cardResult.data?.images[input.side] ?? null
    if (!image) return fail("这张卡还没有这一面的图片")

    try {
      return {
        success: true,
        data: {
          side: input.side,
          mimeType: image.mimeType,
          dataUrl: this.options.images.readScan(image.fileName),
        },
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  async removeScan(input: CardImageRefInput): Promise<Result<CardSummary>> {
    const api = this.options.getApi()
    const cardResult = await api.getCard({ id: input.cardId })
    if (!cardResult.success) return cardResult
    const image = cardResult.data?.images[input.side] ?? null

    const updated = await api.removeCardImage(input)
    if (!updated.success) return updated
    if (image) this.options.images.removeScan(image.fileName)
    return updated
  }
}
