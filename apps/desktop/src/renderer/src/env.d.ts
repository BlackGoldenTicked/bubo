/**
 * @purpose Declare the renderer-visible bubo bridge installed by the Tauri adapter.
 * @role    Browser-safe contract for native commands and the private tRPC transport.
 * @deps    Shared ledger-change event types only.
 * @gotcha  Keep Node, SQLite, and Rust implementation details out of this declaration.
 */

import type { LedgerChangeEvent } from "@bubo/shared/ipc"

type RendererLedgerChangeEvent = LedgerChangeEvent & { receivedAt: string }

type AppUpdateInfo = {
  currentVersion: string
  version: string
  date: string | null
  body: string | null
}

type AppUpdateProgress =
  | { event: "started"; contentLength: number | null }
  | { event: "progress"; chunkLength: number }
  | { event: "finished" }

declare global {
  interface Window {
    bubo: {
      platform: {
        isMac: boolean
        isWindows: boolean
        isLinux: boolean
        name: NodeJS.Platform
      }
      getDatabasePath: () => Promise<string | null>
      databaseExists: () => Promise<boolean>
      trpcRequest: (request: { type: string; path: string; input: unknown }) => Promise<unknown>
      /** macOS system speech recognition over recorded WAV audio; rejects when unavailable. */
      speechRecognize: (audioBase64: string) => Promise<string>
      onLedgerChanged: (callback: (event: RendererLedgerChangeEvent) => void) => () => void
      getAppVersion: () => Promise<string>
      checkForUpdate: () => Promise<AppUpdateInfo | null>
      installUpdate: (onProgress: (progress: AppUpdateProgress) => void) => Promise<void>
      openDownloadPage: () => Promise<void>
    }
  }
}

export {}
