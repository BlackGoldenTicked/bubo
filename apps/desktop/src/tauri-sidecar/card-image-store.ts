/**
 * @purpose Own the on-disk storage of card scans for the Tauri Node sidecar.
 * @role    Local file adapter for the card wallet: copy in, read back, delete.
 * @deps    Node fs/path and the shared card contracts.
 * @gotcha  Scans never enter SQLite. The database only stores the file name, so every writer
 *          must go through this module — it enforces the extension allow-list, the size cap,
 *          and the generated file naming that keeps a path out of user control.
 *          Files live under <user data>/card-images and survive ledger switches.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { basename, extname, join } from "node:path"
import type { CardImageData, CardSide } from "@bubo/shared/contracts"

/** Formats every platform WebView renders; HEIC is deliberately rejected. */
const ALLOWED_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

const MAX_BYTES = 20 * 1024 * 1024

export interface ImportedScan {
  fileName: string
  mimeType: string
  byteSize: number
}

export class CardImageStore {
  private readonly root: string

  constructor(options: { userDataDir: string }) {
    this.root = join(options.userDataDir, "card-images")
  }

  private ensureDir(): void {
    mkdirSync(this.root, { recursive: true })
  }

  /** Copies a user-picked file into our folder and returns the metadata to persist. */
  importScan(input: { cardId: string; side: CardSide; sourcePath: string }): ImportedScan {
    const extension = extname(input.sourcePath).toLowerCase()
    const mimeType = ALLOWED_MIME[extension]
    if (!mimeType) {
      throw new Error("仅支持 JPG、PNG 或 WebP 图片")
    }
    if (!existsSync(input.sourcePath)) {
      throw new Error("找不到所选图片，请重新选择")
    }
    const size = statSync(input.sourcePath).size
    if (size <= 0) throw new Error("图片内容为空，请重新选择")
    if (size > MAX_BYTES) throw new Error("图片超过 20MB，请压缩后再上传")

    this.ensureDir()
    const fileName = `${input.cardId}-${input.side}${extension}`
    const target = join(this.root, fileName)
    copyFileSync(input.sourcePath, target)

    return { fileName, mimeType, byteSize: size }
  }

  /** Returns a data URL so the renderer can show a scan without an asset-protocol round trip. */
  readScan(fileName: string): CardImageData["dataUrl"] {
    const path = join(this.root, basename(fileName))
    if (!existsSync(path)) throw new Error("卡片图片已丢失，请重新上传")
    const extension = extname(path).toLowerCase()
    const mimeType = ALLOWED_MIME[extension] ?? "image/jpeg"
    return `data:${mimeType};base64,${readFileSync(path).toString("base64")}`
  }

  /** Removes a scan; a missing file is not an error because the row is the source of truth. */
  removeScan(fileName: string): void {
    const path = join(this.root, basename(fileName))
    rmSync(path, { force: true })
  }

  /** Drops scans for a card that no longer exists (used by archive-hard-delete paths later). */
  listCardFiles(cardId: string): string[] {
    if (!existsSync(this.root)) return []
    return readdirSync(this.root).filter((name) => name.startsWith(`${cardId}-`))
  }
}
