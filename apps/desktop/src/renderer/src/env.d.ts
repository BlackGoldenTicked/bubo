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

type VoiceShortcutState = {
  requested: string
  registered: string
  defaultShortcut: string
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
      /** Menu-bar capture shortcut: what the user asked for vs what the OS accepted. */
      voiceShortcut: {
        get: () => Promise<VoiceShortcutState>
        set: (shortcut: string) => Promise<VoiceShortcutState>
      }
      /** Native image picker for card scans; returns the path plus a preview data URL. */
      pickCardImage: () => Promise<{ path: string; dataUrl: string } | null>
      openQuickCapture: () => Promise<void>
      hideQuickCapture: () => Promise<void>
      showMainWindow: () => Promise<void>
    }
  }
}

export {}
